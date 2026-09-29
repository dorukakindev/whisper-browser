'use strict';
// R271 — yt-dlp canlı ağ doğrulaması (opt-in).
// Koşu: WHISPER_E2E_YTDLP=1 node tests/ytdlp-live.test.js
// Gerçek ağ gerektirir; CI'da env yoksa atlanır. Varsayılan fixture:
// "Me at the zoo" (19 sn, elle yazılmış EN altyazı, 240p tavanı) —
// probe + download + subs zincirini gerçek YouTube üzerinden doğrular.
// URL başka bir video ile değiştirilebilir: WHISPER_E2E_YTDLP_URL=...
const assert = require('assert');
const { spawnSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const VENV_PY = process.platform === 'win32'
  ? path.join(ROOT, 'backend', 'venv', 'Scripts', 'python.exe')
  : path.join(ROOT, 'backend', 'venv', 'bin', 'python');

const SKIP = process.env.WHISPER_E2E_YTDLP !== '1'
  || !fs.existsSync(VENV_PY)
  || spawnSync(VENV_PY, ['-c', 'import yt_dlp'], { encoding: 'utf8' }).status !== 0;

if (SKIP) {
  console.log('ytdlp-live: atlandı (WHISPER_E2E_YTDLP!=1 veya yt_dlp yok)');
  process.exit(0);
}

let n = 0;
const ok = (c, m) => { n += 1; assert(c, m); };

const URL = process.env.WHISPER_E2E_YTDLP_URL || 'https://www.youtube.com/watch?v=jNQXAC9IVRw';
const MEDIA = path.join(ROOT, 'backend', 'media.py');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'whisper-ytdlp-live-'));

function run(args, timeoutMs = 240000) {
  const r = spawnSync(VENV_PY, [MEDIA, ...args], {
    encoding: 'utf8', timeout: timeoutMs, maxBuffer: 32 * 1024 * 1024,
  });
  const events = String(r.stdout || '').split('\n').filter(Boolean)
    .map((line) => { try { return JSON.parse(line); } catch (_) { return null; } })
    .filter(Boolean);
  return { status: r.status, events, stderr: String(r.stderr || '') };
}

try {
  // 1) probe — gerçek sayfa çözümlemesi
  const probe = run(['probe', '--url', URL]);
  const p = probe.events.find((e) => e.type === 'probe');
  ok(!!p, `probe olayı yok: ${probe.stderr.slice(-300)}`);
  ok(p.title.length > 0, 'probe başlık boş');
  ok(p.duration > 0, 'probe süre 0');
  ok(Array.isArray(p.heights) && p.heights.length > 0, 'probe heights boş');
  const enSubs = (p.subtitleLangs || []).filter((s) => s.code === 'en');
  ok(enSubs.length > 0, `EN altyazı listede yok: ${JSON.stringify(p.subtitleLangs)}`);

  // 2) download — en düşük çözünürlükte gerçek indirme
  const dlDir = path.join(tmp, 'dl');
  const dl = run(['download', '--url', URL, '--height', '144', '--output-dir', dlDir], 300000);
  const done = dl.events.find((e) => e.type === 'downloaded');
  ok(!!done, `downloaded olayı yok: ${dl.stderr.slice(-300)}`);
  ok(fs.existsSync(done.path), `indirilen dosya yok: ${done.path}`);
  const size = fs.statSync(done.path).size;
  ok(size > 50 * 1024, `indirilen dosya şüpheli küçük: ${size} B`);
  ok(done.path.endsWith('.mp4'), `mp4 bekleniyor, gelen: ${path.extname(done.path)}`);
  // download_progress 0.3 sn'lik throttle altında küçük dosyalarda hiç
  // emit edilmeyebilir — hook'un çalıştığının kanıtı `downloaded` + dosya.
  // 3) subs — elle yazılmış EN altyazı gerçek SRT olarak iner
  const subDir = path.join(tmp, 'subs');
  const subs = run(['subs', '--url', URL, '--sub-lang=en', '--sub-auto', 'false', '--output-dir', subDir], 240000);
  const s = subs.events.find((e) => e.type === 'subs');
  ok(!!s, `subs olayı yok: ${subs.stderr.slice(-300)}`);
  ok(fs.existsSync(s.path), `altyazı dosyası yok: ${s.path}`);
  const srt = fs.readFileSync(s.path, 'utf8');
  ok(/\d{2}:\d{2}:\d{2}[,.]\d{2,3}\s*-->\s*\d{2}:\d{2}:\d{2}[,.]\d{2,3}/.test(srt),
    'indirilen altyazı SRT zaman damgası içermiyor');

  // 4) hata yolu — var olmayan alan adı gerçek ağ hatası üretmeli
  const bad = run(['probe', '--url', 'https://nonexistent.invalid/video'], 90000);
  const err = bad.events.find((e) => e.type === 'error');
  ok(!!err && typeof err.message === 'string' && err.message.length > 0,
    'erişilemeyen alan adı için error olayı yok');

  console.log(`ytdlp-live: ${n} kontrol geçti (probe "${p.title}" ${p.duration}s, ` +
    `download ${Math.round(size / 1024)}KB, subs + hata yolu)`);
} finally {
  fs.rmSync(tmp, { recursive: true, force: true });
}
