'use strict';

// R334 ölü-bölge kilitleri — kapsam haritasında sıfır referanslı çıkan
// gizlilik/rotasyon fonksiyonları: sanitizeProcessDetail (süreç detayını
// günlüğe yazmadan önce ANSI/URL/yol/kontrol karakteri süzer),
// redactJobLogArgs (gizli-değer bayrakları), pruneOldLogs (eski günlük
// dosyalarını siler — veri kaybı riski taşır).

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const vm = require('vm');

const source = fs.readFileSync(path.join(__dirname, '..', 'src', 'main.js'), 'utf8');

function section(start, end) {
  const from = source.indexOf(start);
  const to = source.indexOf(end, from);
  assert(from >= 0 && to > from, 'Bölüm bulunamadı: ' + start);
  return source.slice(from, to);
}

function makeCtx(tmpdir, extra = {}) {
  return vm.createContext({
    String, Number, Array, Set, JSON, Buffer, RegExp, Error, Date,
    fs, path, app: { getPath: () => tmpdir },
    LOG_KEEP: 3,
    ...extra,
  });
}

function evalFns(ctx, names) {
  const blocks = {
    logsDir: section('function logsDir()', 'function pruneOldLogs'),
    pruneOldLogs: section('function pruneOldLogs', 'function sweepStaleChatFiles'),
    redactJobLogArgs: section('function redactJobLogArgs', 'function sanitizeProcessDetail'),
    sanitizeProcessDetail: section('function sanitizeProcessDetail', '// Windows\'ta dosya adı kuralları'),
  };
  vm.runInContext(names.map((n) => blocks[n]).join('\n\n'), ctx);
}

function t_sanitize() {
  const ctx = makeCtx(os.tmpdir());
  evalFns(ctx, ['sanitizeProcessDetail']);
  const san = (v) => vm.runInContext(`sanitizeProcessDetail(${JSON.stringify(v)})`, ctx);

  // ANSI CSI/OSC dizileri süzülür
  assert.strictEqual(san('hata \x1b[31mKIRMIZI\x1b[0m oldu'), 'hata KIRMIZI oldu');
  // OSC köprüsü tamamen süzülür — Fe dalı 'h'yi final-byte yiyip
  // 'ttps://kotu.example' düz metin bırakıyordu (B-334-02).
  assert.strictEqual(san('\x1b]8;;https://kotu.example\x07link\x1b]8;;\x07'), 'link');
  // DCS/PM/APC dizgileri de dizgi-sonlandırıcıya dek süzülür
  assert.strictEqual(san('a\x1bP1$rgizli\x1b\\b'), 'ab');
  assert.strictEqual(san('a\x1b^gizli\x07b'), 'ab');
  // URL maskelenir
  assert.strictEqual(san('bak https://evil.example/x?y=1 sonra'), 'bak <URL gizlendi> sonra');
  // Windows yolu maskelenir
  assert.strictEqual(san('dosya C:\\Users\\ahmet\\secret.txt yok'), 'dosya <yol gizlendi> yok');
  // Kontrol karakterleri atılır
  assert.strictEqual(san('a\x00b\x07c\x1fd'), 'abcd');
  // Son 500 karakter tutulur
  const long = 'x'.repeat(600) + 'SON';
  assert.strictEqual(san(long), 'x'.repeat(497) + 'SON');
  // Boş giriş
  assert.strictEqual(san(''), '');
  assert.strictEqual(san(null), '');
}

function t_redact() {
  const ctx = makeCtx(os.tmpdir());
  evalFns(ctx, ['redactJobLogArgs']);
  const red = (args) => vm.runInContext(`redactJobLogArgs(${JSON.stringify(args)})`, ctx);

  // args[0] (betik yolu) slice(1) ile atılır — günlüğe düşmez
  assert.strictEqual(red(['transcribe.py', '--input', 'gizli.mp4']), '--input <gizlendi>');
  // Bağlı --ad=değer biçimi
  assert.strictEqual(red(['t.py', '--input=gizli.mp4', '--model', 'tiny']),
    '--input=<gizlendi> --model tiny');
  // Gizli olmayan değerler görünür
  assert.strictEqual(red(['t.py', '--model', 'tiny']), '--model tiny');
  // Dizi değilse boş dizgi
  assert.strictEqual(red(null), '');
  // Ardışık iki gizli bayrak — değerler maskelenir, bayrak adları görünür
  assert.strictEqual(red(['t.py', '--input', 'a', '--glossary', 'b']),
    '--input <gizlendi> --glossary <gizlendi>');
  // Sağlayıcı uç noktaları günlüğe tam URL düşmez (iç ağ adı sızıntısı)
  assert.strictEqual(red(['t.py', '--translate-base-url', 'https://ic-ag.corp/v1']),
    '--translate-base-url <gizlendi>');
  assert.strictEqual(red(['t.py', '--llm-base-url=https://ic-ag.corp/v1', '--model', 'm']),
    '--llm-base-url=<gizlendi> --model m');
}

function t_prune() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'wb-logs-'));
  const dir = path.join(tmp, 'logs');
  fs.mkdirSync(dir, { recursive: true });
  // Kronolojik ada sahip günlükler (eskiden yeniye)
  const names = [];
  for (let i = 0; i < 7; i += 1) {
    const name = `2026-01-0${i + 1}_00-00-00_is-${i}.log`;
    fs.writeFileSync(path.join(dir, name), `icerik ${i}`);
    names.push(name);
  }
  fs.writeFileSync(path.join(dir, 'tutan.txt'), 'degil');
  fs.mkdirSync(path.join(dir, 'alt-klasor.log'));

  const ctx = makeCtx(tmp); // app.getPath('userData')=tmp → logsDir()=tmp/logs
  evalFns(ctx, ['logsDir', 'pruneOldLogs']);
  vm.runInContext('pruneOldLogs()', ctx); // LOG_KEEP=3

  const left = fs.readdirSync(dir).filter((f) => f.endsWith('.log')).sort();
  // Keep-listesi ad-bazlı: '.log' uzantılı DİZİN de sıralamaya girer
  // ('a' > '2' → en başa oturur) ve bir keep yuvası yer → gerçek dosyalardan
  // yalnız en yeni 2'si korunur. Sözleşme bu: dizin unlinkSync'i reddeder,
  // veri kaybı yok, yalnızca keep sayısı seyrelir.
  assert.deepStrictEqual(left.sort(), [...names.slice(-2), 'alt-klasor.log'].sort());
  assert.ok(fs.existsSync(path.join(dir, 'tutan.txt')), '.log olmayan dosya korunur');
  const st = fs.statSync(path.join(dir, 'alt-klasor.log'));
  assert.ok(st.isDirectory(), '.log dizini silinmez (unlinkSync reddeder)');
  fs.rmSync(tmp, { recursive: true, force: true });
}

function t_prune_missing_dir() {
  // logsDir yoksa bile çökme olmaz (try/catch katmanı)
  const ctx = makeCtx(path.join(os.tmpdir(), 'wb-logs-yok-' + Date.now()));
  evalFns(ctx, ['logsDir', 'pruneOldLogs']);
  vm.runInContext('pruneOldLogs()', ctx);
}

t_sanitize();
t_redact();
t_prune();
t_prune_missing_dir();
console.log('joblog-deadzone: 4 senaryo geçti');
