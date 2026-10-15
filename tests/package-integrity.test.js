'use strict';
// R317: release-package bütünlüğü — kanonik kaynak listesi, ignore kayması,
// paket çıktısı doğrulaması ve açılış erken uyarısı dilimi.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.resolve(__dirname, '..');
const manifest = require('../tools/package-manifest');

test('requiredPackageFiles: her dosya depoda mevcut ve ignore kalıbına takılmıyor', () => {
  const required = manifest.requiredPackageFiles(ROOT);
  assert.ok(required.length > 50, `liste şüpheli kısa: ${required.length}`);
  const missing = required.filter((rel) => !fs.existsSync(path.join(ROOT, rel)));
  assert.deepEqual(missing, []);
  const ignored = required.filter((rel) => manifest.isIgnored(rel));
  assert.deepEqual(ignored, [], `paket ignore kalıbı gerekli dosya yutuyor: ${ignored.join(', ')}`);
});

test('BOOT_CRITICAL listede ve depoda; paketleme betiği kalıpları tek kaynaktan okur', () => {
  const required = new Set(manifest.requiredPackageFiles(ROOT));
  for (const rel of manifest.BOOT_CRITICAL) {
    assert.ok(required.has(rel), `${rel} gerekli listede yok`);
    assert.ok(fs.existsSync(path.join(ROOT, rel)), `${rel} depoda yok`);
  }
  const src = fs.readFileSync(path.join(ROOT, 'tools/package-windows.js'), 'utf8');
  assert.ok(src.includes('ignore: PACKAGER_IGNORE'), 'packager ignore dizisi manifest modülünden okunmalı');
  assert.ok(src.includes('missingInTarget'), 'packager çıktı doğrulaması çağrılmalı');
  // Kalıp dizisinin paket betiğinde ikinci kopyası kalmamalı.
  assert.equal(src.match(/\^\\\/\(\?:/g), null, 'ignore regex kopyası tools/package-windows.js içinde kaldı');
});

test('regex ile kaçan dosyalar gerekli kümede (worklet, resolve, iki-adımlı join)', () => {
  const required = new Set(manifest.requiredPackageFiles(ROOT));
  for (const rel of [
    // audioWorklet.addModule('live-asr-worklet.js') — çıplak dize
    'src/renderer/live-asr-worklet.js',
    // path.resolve(__dirname, '..', 'backend', 'browser_align.py')
    'backend/browser_align.py',
    // path.join(backend, 'separate_dialogue.py') — iki adımlı değişken
    'backend/separate_dialogue.py',
    'backend/voice_reference.py',
  ]) {
    assert.ok(required.has(rel), `${rel} gerekli paket kümesinde yok`);
  }
});

test('açılış denetimi ilk yerel require öncesinde çalışır ve kapanışı kapılar', () => {
  const src = fs.readFileSync(path.join(ROOT, 'src/main.js'), 'utf8');
  const early = src.indexOf('if (!verifyAppResources()) return;');
  const firstLocalRequire = src.indexOf("require('./browser-cea-checkpoint')");
  assert.notEqual(early, -1, 'erken bütünlük çağrısı yok');
  assert.notEqual(firstLocalRequire, -1);
  assert.ok(early < firstLocalRequire,
    'verifyAppResources ilk yerel require sonrasında — eksik modül diyalogsuz çöker');
  // main.js'in tüm yerel require kapanışı gerekli paket kümesinde olmalı;
  // aksi halde pakette eksik modül erken kontrolü de geçip require'da patlar.
  const required = new Set(manifest.requiredPackageFiles(ROOT));
  const missing = manifest
    .requireClosure(ROOT, ['src/main.js'])
    .filter((rel) => !required.has(rel));
  assert.deepEqual(missing, []);
});

test('missingInTarget: eksik dosyayı paket çıktısında yakalar', () => {
  const target = fs.mkdtempSync(path.join(os.tmpdir(), 'wb-pkg-'));
  try {
    const appRoot = path.join(target, 'resources', 'app');
    for (const rel of manifest.requiredPackageFiles(ROOT)) {
      const dest = path.join(appRoot, ...rel.split('/'));
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      fs.copyFileSync(path.join(ROOT, rel), dest);
    }
    assert.deepEqual(manifest.missingInTarget(target, ROOT), []);
    fs.unlinkSync(path.join(appRoot, 'src', 'renderer', 'index.html'));
    fs.unlinkSync(path.join(appRoot, 'backend', 'transcribe.py'));
    const missing = manifest.missingInTarget(target, ROOT);
    assert.ok(missing.includes('src/renderer/index.html'));
    assert.ok(missing.includes('backend/transcribe.py'));
    assert.equal(missing.length, 2);
  } finally {
    fs.rmSync(target, { recursive: true, force: true });
  }
});

function sliceFn(file, marker, endMarker) {
  const src = fs.readFileSync(file, 'utf8');
  const start = src.indexOf(marker);
  assert.notEqual(start, -1, `${marker} bulunamadı`);
  const end = src.indexOf(endMarker, start);
  assert.notEqual(end, -1, `${endMarker} bulunamadı`);
  return src.slice(start, end);
}

function runVerify(appDir, { requireImpl } = {}) {
  const calls = [];
  const ctx = {
    app: { getAppPath: () => appDir, exit: (code) => calls.push(['exit', code]) },
    appResourceRoot: () => appDir,
    dialog: { showErrorBox: (title, body) => calls.push(['errorBox', title, body]) },
    fs, path, console: { warn: (...a) => calls.push(['warn', a.join(' ')]) },
    require: requireImpl || ((id) => require(path.resolve(ROOT, 'src', id))),
  };
  vm.createContext(ctx);
  const code = `${sliceFn(path.join(ROOT, 'src/main.js'), 'function verifyAppResources()', 'function createWindow()')}; verifyAppResources;`;
  const fn = vm.runInContext(code, ctx);
  return { result: fn(), calls };
}

test('verifyAppResources: kritik dosya eksikse diyalog + exit(1), tamamsa sessiz geçiş', () => {
  const empty = fs.mkdtempSync(path.join(os.tmpdir(), 'wb-empty-'));
  try {
    const broken = runVerify(empty);
    assert.equal(broken.result, false);
    assert.deepEqual(broken.calls.find((c) => c[0] === 'exit'), ['exit', 1]);
    const box = broken.calls.find((c) => c[0] === 'errorBox');
    assert.ok(box && box[2].includes('src/renderer/index.html'));
  } finally {
    fs.rmSync(empty, { recursive: true, force: true });
  }
  const ok = runVerify(ROOT);
  assert.equal(ok.result, true);
  assert.equal(ok.calls.filter((c) => c[0] === 'errorBox').length, 0);
  assert.equal(ok.calls.filter((c) => c[0] === 'exit').length, 0);
});

test('verifyAppResources: manifest require edilemezse yedek kısa listeyle yine kapı tutar', () => {
  const empty = fs.mkdtempSync(path.join(os.tmpdir(), 'wb-empty2-'));
  try {
    const r = runVerify(empty, { requireImpl: () => { throw new Error('manifest yok'); } });
    assert.equal(r.result, false);
    const box = r.calls.find((c) => c[0] === 'errorBox');
    assert.ok(box && box[2].includes('src/renderer/index.html'));
  } finally {
    fs.rmSync(empty, { recursive: true, force: true });
  }
});

test('ratchet: kaynak kökü app.getAppPath yerine appResourceRoot kullanır', () => {
  // app.getAppPath() süreç-içi harness çalıştırmalarında yanlış dizin gösterir
  // (electron tests/x.smoke.js → tests/). Paket/kurulum dosyalarına erişim
  // appResourceRoot() üzerinden yapılmalı; getAppPath yalnız tanı alanında
  // (appPath:) serbesttir.
  const src = fs.readFileSync(path.join(ROOT, 'src/main.js'), 'utf8');
  const offenders = src
    .split('\n')
    .filter((line) => line.includes('app.getAppPath()') && !line.includes('appPath:'));
  assert.deepEqual(offenders, [],
    `app.getAppPath() kaynak kökü olarak kullanılmış:\n${offenders.join('\n')}`);
});

test('transcribe:start — backend/transcribe.py eksikse spawn öncesi dostu hata', () => {
  const src = fs.readFileSync(path.join(ROOT, 'src/main.js'), 'utf8');
  const idx = src.indexOf("'backend', 'transcribe.py'");
  assert.notEqual(idx, -1);
  const window = src.slice(idx, idx + 1200);
  assert.ok(window.includes('fs.existsSync(scriptPath)'), 'spawn öncesi transcribe.py varlık kontrolü yok');
  assert.ok(window.includes('install.bat'), 'eksik dosya mesajı onarım yönlendirmesi içermeli');
});
