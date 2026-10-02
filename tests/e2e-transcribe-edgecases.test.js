'use strict';
// Yeni-100 batch-3 — gerçek tiny/CPU modelle kenar-durum matrisi (opt-in).
// faster-whisper tiny modeli yerelde kurulu/önbellekli değilse CI'da atlanır.
// Koşu: WHISPER_E2E=1 node tests/e2e-transcribe-edgecases.test.js
//
// Armatürler deterministik ffmpeg lavfi kaynakları (ağ gerekmez):
//   silence.wav  — saf dijital sessizlik (anullsrc)
//   noise.wav    — beyaz gürültü (anoisesrc)
//   speech.wav   — flite TTS "Alpha segment" (kısa konuşma)
//   corrupt.bin  — rastgele bayt (bozuk medya)
//
// Sözleşmeler:
//   * Sessizlik/gürültü halüsinasyon cue'su ÜRETMEZ — hata olayı temiz
//     ("Hiç altyazı segmenti üretilemedi"); "Thank you for watching"
//     sınıfı YouTube-outro halüsinasyonları kalıp + güven kapısıyla elenir.
//   * Bozuk dosya çökmeden ffmpeg-hatası olayı verir.
//   * Kısa (<1s) konuşma normal done üretir.
//   * --clip-start zaman damgalarını orijinal eksene taşır; son cue'nun
//     bitişi kesit/medya sonunu aşamaz (normalize_timings media_end kelepçesi).
const assert = require('assert');
const { spawnSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const VENV_PY = process.platform === 'win32'
  ? path.join(ROOT, 'backend', 'venv', 'Scripts', 'python.exe')
  : path.join(ROOT, 'backend', 'venv', 'bin', 'python');

const SKIP = process.env.WHISPER_E2E !== '1'
  || !fs.existsSync(VENV_PY)
  || spawnSync(VENV_PY, ['-c', 'import faster_whisper'], { encoding: 'utf8' }).status !== 0;

if (SKIP) {
  console.log('e2e-transcribe-edgecases: atlandı (WHISPER_E2E!=1 veya faster_whisper yok)');
  process.exit(0);
}

let n = 0;
const ok = (c, m) => { n += 1; assert(c, m); };

// ---- armatürler (deterministik, ağsız) ----
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'whisper-edge-'));
const ffmpeg = (args, label) => {
  const r = spawnSync('ffmpeg', ['-y', '-loglevel', 'error', ...args], { encoding: 'utf8' });
  ok(r.status === 0, `${label} üretilemedi: ${r.stderr}`);
};

const silence = path.join(tmp, 'silence.wav');
ffmpeg(['-f', 'lavfi', '-i', 'anullsrc=channel_layout=mono:sample_rate=16000', '-t', '4', silence], 'silence.wav');

const noise = path.join(tmp, 'noise.wav');
ffmpeg(['-f', 'lavfi', '-i', 'anoisesrc=color=white:duration=4:sample_rate=16000', noise], 'noise.wav');

const speech = path.join(tmp, 'speech.wav');
ffmpeg(['-f', 'lavfi', '-i', "flite=text='Alpha segment':voice=slt", '-ar', '16000', '-ac', '1', speech], 'speech.wav (flite)');

const corrupt = path.join(tmp, 'corrupt.bin');
fs.writeFileSync(corrupt, require('crypto').randomBytes(4096));

// ---- koşu yardımcıları ----
const runPy = (input, extra = []) => {
  const outDir = fs.mkdtempSync(path.join(tmp, 'out-'));
  const r = spawnSync(VENV_PY, [
    path.join(ROOT, 'backend', 'transcribe.py'),
    '--input', input, '--model', 'tiny', '--device', 'cpu', '--compute-type', 'int8',
    '--language', 'en', '--output-dir', outDir, '--formats', 'srt',
    ...extra,
  ], { encoding: 'utf8', timeout: 600000, maxBuffer: 64 * 1024 * 1024 });
  const events = String(r.stdout || '').split('\n').filter(Boolean)
    .map((line) => { try { return JSON.parse(line); } catch (_) { return null; } })
    .filter(Boolean);
  return { r, events, outDir };
};

const find = (ev, t) => ev.find((e) => e.type === t);

// ---- 1. saf sessizlik: halüsinasyon cue'su üretilmez ----
{
  const { events } = runPy(silence);
  const segs = events.filter((e) => e.type === 'segment');
  const err = find(events, 'error');
  const done = find(events, 'done');
  // Halüsinasyon filtresi düşük güvenli YouTube-outro'yu eler; ya hiç segment
  // çıkmaz (hata) ya da varsa hiçbiri bilinen-outro kalıbına giremez.
  ok(!done || segs.length === 0 || err, 'sessizlikte anlamlı done + segment birlikte olamaz');
  for (const s of segs) {
    ok(!/thank(s|k you)? for (watching|listening)/i.test(s.text || ''),
      `sessizlikte outro halüsinasyonu: ${s.text}`);
  }
  if (segs.length === 0) {
    ok(!!err, 'sessizlikte segment yoksa error olayı beklenir');
  }
}

// ---- 2. beyaz gürültü: segment üretilmezse temiz hata ----
{
  const { events } = runPy(noise);
  const segs = events.filter((e) => e.type === 'segment');
  for (const s of segs) {
    ok(!/thank(s|k you)? for (watching|listening)/i.test(s.text || ''),
      `gürültüde outro halüsinasyonu: ${s.text}`);
  }
  if (segs.length === 0) {
    ok(!!find(events, 'error'), 'gürültüde segment yoksa error olayı beklenir');
  }
}

// ---- 3. bozuk dosya: çökme yok, temiz error olayı ----
{
  const { r, events } = runPy(corrupt);
  const err = find(events, 'error');
  ok(!!err, 'bozuk dosyada error olayı yok');
  ok(/ses çıkarma başarısız|audio/i.test(err.message || ''),
    `bozuk dosya hata metni yol göstermiyor: ${err.message}`);
  ok(!find(events, 'done'), 'bozuk dosyada done olayı olmamalı');
}

// ---- 4. kısa konuşma: normal done + cue ----
{
  const { events } = runPy(speech);
  const done = find(events, 'done');
  ok(!!done, 'kısa konuşmada done olayı yok');
  ok(events.some((e) => e.type === 'segment'), 'kısa konuşmada segment yok');
}

// ---- 5. clip-start: zaman ekseni orijinal eksene taşınır + son cue medya
// sonunu aşamaz ----
{
  // 2s'lik konuşmayı 0.5s'den kes: son cue'nun bitişi ≤ 2.0 (medya sonu)
  const speech2 = path.join(tmp, 'speech2.wav');
  ffmpeg(['-f', 'lavfi', '-i', "flite=text='Alpha segment beta':voice=slt", '-ar', '16000', '-ac', '1', '-t', '2', speech2], 'speech2.wav');
  const durR = spawnSync('ffprobe', ['-v', 'quiet', '-show_entries', 'format=duration',
    '-of', 'csv=p=0', speech2], { encoding: 'utf8' });
  const mediaDur = parseFloat(durR.stdout);
  ok(Number.isFinite(mediaDur) && mediaDur > 0.5, `ffprobe süresi okunamadı: ${durR.stdout}`);

  const { events, outDir } = runPy(speech2, ['--clip-start', '0.5']);
  const segs = events.filter((e) => e.type === 'segment');
  for (const s of segs) {
    // Kesit sonrası segment damgaları orijinal eksende kalmalı (>= clip başlangıcı).
    ok(s.start >= 0.49, `clip-start offset uygulanmadı: start=${s.start}`);
    ok(s.end <= mediaDur + 0.05, `segment medya sonunu aştı: ${s.end} > ${mediaDur}`);
  }
  const srtFiles = fs.readdirSync(outDir).filter((f) => f.endsWith('.srt'));
  for (const f of srtFiles) {
    const body = fs.readFileSync(path.join(outDir, f), 'utf8');
    for (const m of body.matchAll(/(\d+):(\d+):(\d+),(\d+)\s*-->\s*(\d+):(\d+):(\d+),(\d+)/g)) {
      const end = (+m[5]) * 3600 + (+m[6]) * 60 + (+m[7]) + (+m[8]) / 1000;
      ok(end <= mediaDur + 0.051, `SRT cue bitişi medya sonunu aştı: ${end} > ${mediaDur} (${f})`);
    }
  }
}

// ---- 6. clip-start süre ötesi: temiz hata ----
{
  const { events } = runPy(speech, ['--clip-start', '60']);
  const err = find(events, 'error');
  ok(!!err, 'süre ötesi clip-start error olayı yok');
  ok(!find(events, 'done'), 'süre ötesi clip-start done olayı olmamalı');
}

console.log(`e2e-transcribe-edgecases: ${n} kontrol GEÇTİ`);
