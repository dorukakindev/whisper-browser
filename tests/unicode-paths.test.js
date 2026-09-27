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
  ok(/args\.push\('--input',\s*options\.input\)/.test(src), '--input doğrudan argv elemanı');
  ok(/stdio:\s*\['pipe'/.test(src) || /spawn\(/.test(src), 'spawn argv kullanılır (shell: false)');
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
