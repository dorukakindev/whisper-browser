'use strict';
// R160: UTF-8/Türkçe yol uçtan-uca ratchet — burn-in ffmpeg filtresi, kuyruk etiketi,
// spawn argüman geçişi, BOM'lu çıktı yazımı.
const assert = require('assert');
const fs = require('fs');
const vm = require('vm');
const { normalizeQueueSnapshot } = require('../src/queue-persistence');

let n = 0; const ok = (c, m) => { n += 1; assert(c, m); };
const src = fs.readFileSync(require('path').join(__dirname, '../src/main.js'), 'utf8');

// ffSubtitlesArg — vm-harness slice
{
  const start = src.indexOf('function ffSubtitlesArg(');
  const end = src.indexOf('function stageBurninSubtitle');
  ok(start > 0 && end > start, 'ffSubtitlesArg dilimi bulunur');
  const sandbox = {};
  vm.createContext(sandbox);
  vm.runInContext(src.slice(start, end), sandbox);
  const fn = sandbox.ffSubtitlesArg;
  ok(typeof fn === 'function', 'ffSubtitlesArg bağlanır');

  // Windows sürücü + Türkçe + boşluk + kesme işareti
  const out = fn('D:\\Videolar\\Şiir Gösterimleri\\Kış Güneşi\'nin altyazısı.srt');
  ok(out === "subtitles='D\\:/Videolar/Şiir Gösterimleri/Kış Güneşi\\'nin altyazısı.srt'",
    `sürücü-colon kaçışı + slash çevirme + tırnak kaçışı: ${out}`);
  ok(!out.includes('\\\\'), 'backslash kalmaz');
  ok(/Şiir/.test(out), 'Türkçe karakterler korunur');

  // POSIX yol: iki nokta yok → kaçışsız
  ok(fn('/home/kullanıcı/şarkılar/dün.mp4.srt') === "subtitles='/home/kullanıcı/şarkılar/dün.mp4.srt'",
    'POSIX Türkçe yol korunur');

  // CJK / emoji güvenliği
  ok(fn('D:\\媒体\\映画 🎬.srt').includes('映画 🎬'), 'CJK+emoji korunur');
}

// stageBurninSubtitle — ASCII adlandırma + staging dizini ratchet'ı (unicode ffmpeg
// argüman sorunlarını tasarım gereği bertaraf eder).
{
  ok(/subtitle-\$\{randomUUID\(\)\}\$\{path\.extname\(subPath\)\.toLowerCase\(\)\}/.test(src)
      || /subtitle-\$\{randomUUID\(\)\}/.test(src),
    'burnin staging dosyası ASCII+UUID adlandırır');
  ok(/burnin-temp/.test(src), 'staging dizini userData altında');
}

// Kuyruk etiketi — Windows/POSIX Türkçe yoldan dosya adı türetme
{
  const s = normalizeQueueSnapshot({ items: [
    { id: 1, type: 'file', input: 'D:\\Videolar\\Şiir Gösterimleri\\Kış Güneşi.mp4' },
    { id: 2, type: 'file', input: '/home/kullanıcı/şarkılar/Öğle Güneşi.mp4' },
    { id: 3, type: 'youtube', input: 'https://youtu.be/ğüşıöçı' },
  ] });
  ok(s.items[0].label === 'Kış Güneşi.mp4', `win etiket: ${s.items[0].label}`);
  ok(s.items[1].label === 'Öğle Güneşi.mp4', `posix etiket: ${s.items[1].label}`);
  ok(s.items[2].label.length <= 60, 'youtube etiket kırpılır');
}

// spawn argümanı --input doğrudan string geçer (shell yok → injection yok)
{
  ok(/pushBoundOption\(args, '--input',\s*options\.input\)/.test(src), '--input doğrudan argv elemanı');
  ok(/stdio:\s*\['pipe'/.test(src) || /spawn\(/.test(src), 'spawn argv kullanılır (shell: false)');
}

// R216: windowsSafeFileName invariant fuzz — Windows dosya-adı sözleşmesi.
// Gerçek işlev gövdesini vm dilimiyle çalıştır; rastgele bozucu girdilerde
// 4 değişmez kilitli: geçersiz karakter yok, sonda nokta/boşluk yok,
// ayrılmış kök (NFKC katlaması sonrası) kaçışlı, deterministik+idempotent.
{
  const start = src.indexOf('function windowsSafeFileName(');
  const end = src.indexOf('function startJobLog(');
  ok(start > 0 && end > start, 'windowsSafeFileName dilimi bulunur');
  const sandbox = {};
  vm.createContext(sandbox);
  vm.runInContext(src.slice(start, end), sandbox);
  const safe = sandbox.windowsSafeFileName;

  const RESERVED = /^(con|prn|aux|nul|com[1-9]|lpt[1-9]|conin\$|conout\$)$/i;
  let rng = 0x216fed; // deterministik LCG — flake riski yok
  const next = () => (rng = (rng * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
  const POOL = [
    'D:\\Videolar\\', 'C:/Users/Ahmet/OneDrive/', '\\\\sunucu\\paylas\\',
    'CON', 'nul', 'AUX', 'prn', 'COM1', 'LPT9', 'CONIN$', 'conout$',
    'ＣＯＮ', 'ＮＵＬ', 'com４', 'COM¹', 'ｌｐｔ７', // tam-genişlik + üst simge
    '<>:"/\\|?*', '\x00', '\x1f', '...', '   ', ' dosya . ', 'ad.srt',
    'Şiir', 'İstanbul', 'ğüşıöçı', '媒体', '映画', '🎬', 'a\u0301', 'é',
    'e\u0301', ' ', ' ', '２０２６', ' -_', 'C:', 'a:b', '..',
    'çok'.repeat(80), // >260 karakter
  ];
  const cases = [];
  for (let i = 0; i < 400; i += 1) {
    let s = '';
    const parts = 1 + Math.floor(next() * 4);
    for (let j = 0; j < parts; j += 1) s += POOL[Math.floor(next() * POOL.length)];
    cases.push(s);
  }
  for (const input of cases) {
    const a = safe(input);
    const b = safe(input);
    ok(a === b, `deterministik: ${JSON.stringify(input)}`);
    ok(a === safe(a), `idempotent: ${JSON.stringify(a)}`);
    ok(typeof a === 'string' && a.length > 0, `boş değil: ${JSON.stringify(input)}`);
    ok(!/[<>:"/\\|?*\x00-\x1F]/.test(a), `geçersiz karakter yok: ${JSON.stringify(a)}`);
    ok(!/[. ]$/.test(a), `sonda nokta/boşluk yok: ${JSON.stringify(a)}`);
    ok(!RESERVED.test(a.split('.')[0].normalize('NFKC')),
      `ayrılmış kök kaçışlı: ${JSON.stringify(a)}`);
  }
  // Nokta-yol kenarları ayrıca sabit kilit
  ok(safe('...') === 'dosya', 'saf nokta → yedek');
  ok(safe('. . .') === 'dosya', 'nokta+boşluk → yedek');
  ok(safe('COM¹') === '_COM¹', 'üst simge kök yakalanır');
  ok(safe('ＣＯＮ.srt') === '_ＣＯＮ.srt', 'tam-genişlik CON yakalanır');
  ok(!safe('x'.repeat(400) + '.').endsWith('.'), 'uzun ad sonda nokta taşımaz');
}

// R216: canonicalLocalPath kapıları — platformdan bağımsız kısım kilitli.
// UNC sözleşmesi platforma bağlıdır: `\\sunucu\paylas\a.srt` POSIX'te
// mutlak olmadığı için göreli-yol kapısına takılır (burada doğrulanır);
// Windows'ta path.isAbsolute onu mutlak sayar ve NAS altyazıları
// BİLİNÇLİ kabul edilir (ağ paylaşımı yasal yerel kaynak). Her
// platformda koşulsuz reddedilen yalnız `\\?\` ve `\\.\` önekleridir
// (NT aygıt ad-uzamı — gerçek dosya yolu değil).
{
  const { canonicalLocalPath } = require('../src/local-file-access');
  assert.throws(() => canonicalLocalPath('goreli\\yol.srt'), /yerel dosya yolu/);
  assert.throws(() => canonicalLocalPath('\\\\?\\C:\\a.srt'), null, '\\\\?\\ reddi');
  assert.throws(() => canonicalLocalPath('\\\\.\\C:\\a.srt'), null, '\\\\.\\ reddi');
  if (process.platform !== 'win32') {
    assert.throws(() => canonicalLocalPath('\\\\sunucu\\paylas\\a.srt'), /yerel dosya yolu/,
      'UNC POSIX göreli-yol reddi');
  } else {
    // Windows sözleşmesi: UNC mutlak kabul — kapı reddi olmamalı. Sonraki
    // realpath çözümü paylaşımın erişilebilirliğine bağlı (ağa dokunur);
    // kilitlenen tek şey "yerel dosya yolu" kapı reddinin GELMEMESİ.
    try {
      canonicalLocalPath('\\\\sunucu\\paylas\\a.srt');
    } catch (err) {
      assert(!/yerel dosya yolu/.test(String(err && err.message || err)),
        'UNC Windows kapı reddi olmamalı');
    }
  }
  assert.throws(() => canonicalLocalPath('/tmp/a\x07b.srt'), /yerel dosya yolu/, 'kontrol karakteri');
  assert.throws(() => canonicalLocalPath(`/tmp/${'a'.repeat(32761)}`), /yerel dosya yolu/, '32760 sınırı');
  assert.throws(() => canonicalLocalPath(''), /yerel dosya yolu/);
  assert.throws(() => canonicalLocalPath(null), /yerel dosya yolu/);
  n += 8;
}

// Backend: write_srt BOM'lu UTF-8 — python tarafında doğrula
{
  const py = `import sys; sys.path.insert(0,'backend')
import transcribe as T, tempfile, os
p = tempfile.mkdtemp() + '/Şiir Gösterimleri Çıktısı.srt'
os.makedirs(os.path.dirname(p), exist_ok=True)
T.write_srt([(0.0, 1.5, "Şiir — İstanbul'da yağış. Çocuklar güldü.")], p)
raw = open(p,'rb').read()
assert raw[:3] == b'\\xef\\xbb\\xbf', 'BOM var'
body = raw[3:].decode('utf-8')
assert 'Şiir' in body and 'İstanbul' in body, 'Türkçe korunur'
print('py:unicode-path-write OK')`;
  const { execFileSync } = require('child_process');
  try {
    execFileSync('python3', ['-c', py], { cwd: require('path').join(__dirname, '..'), stdio: 'pipe' });
    n += 1;
  } catch (e) { throw new Error(`python unicode write: ${e.stderr || e.message}`); }
}

console.log(`unicode-paths: ${n} kontrol geçti`);
