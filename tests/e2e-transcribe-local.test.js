'use strict';
// R149 — Gerçek uçtan uca transkripsiyon (opt-in).
// faster-whisper tiny modeli yerelde kurulu/önbellekli değilse CI'da atlanır.
// Koşu: WHISPER_E2E=1 node tests/e2e-transcribe-local.test.js
// Sentezlenmiş konuşma -> transcribe.py -> SRT/VTT/JSON çıktısı sözleşmesi:
// done olayı, UTC zaman damgaları, metin doğruluğu (gTTS sabit cümleler).
const assert = require('assert');
const { execFileSync, spawnSync } = require('child_process');
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
  console.log('e2e-transcribe-local: atlandı (WHISPER_E2E!=1 veya faster_whisper yok)');
  process.exit(0);
}

let n = 0;
const ok = (c, m) => { n += 1; assert(c, m); };

// Konuşma sentezi — gTTS yoksa sinüs yerine deterministik SAPI alternatifi
// olmadığından koşuyu atlamak yerine açıkça hata veriyoruz: opt-in test
// eksik aracı sessizce başarılı saymamalı.
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'whisper-e2e-'));
const clip = path.join(tmp, 'clip.mp3');
// gTTS proje venv'ine girmemeli — ses sentezi test armatürüdür, sistem
// python'u kullanır; eksikse opt-in koşu açıkça hata verir (skip değil).
const synthPy = spawnSync('python3', ['-c', 'import gtts'], { encoding: 'utf8' }).status === 0
  ? 'python3' : VENV_PY;
const synth = spawnSync(synthPy, ['-c',
  'import sys\nfrom gtts import gTTS\ngTTS(sys.argv[1], lang="en").save(sys.argv[2])',
  'The quick brown fox jumps over the lazy dog.', clip], { encoding: 'utf8' });
ok(synth.status === 0, `gTTS sentezi başarısız (pip install gtts gerekli): ${synth.stderr}`);

const wav = path.join(tmp, 'speech.wav');
const ff = spawnSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', clip, wav], { encoding: 'utf8' });
ok(ff.status === 0, `ffmpeg dönüşümü başarısız: ${ff.stderr}`);

const outDir = path.join(tmp, 'out');
const run = spawnSync(VENV_PY, [
  path.join(ROOT, 'backend', 'transcribe.py'),
  '--input', wav, '--model', 'tiny', '--device', 'cpu', '--compute-type', 'int8',
  '--language', 'en', '--output-dir', outDir, '--formats', 'srt,vtt,json',
], { encoding: 'utf8', timeout: 600000, maxBuffer: 64 * 1024 * 1024 });

const events = String(run.stdout || '').split('\n').filter(Boolean)
  .map((line) => { try { return JSON.parse(line); } catch (_) { return null; } })
  .filter(Boolean);
const done = events.find((e) => e.type === 'done');
ok(!!done, `done olayı yok (exit=${run.status}): ${String(run.stderr).slice(-400)}`);
ok(run.status === 0, 'transcribe sıfır olmayan çıkış');
ok(Array.isArray(done.files) && done.files.length >= 3, 'done.files eksik');
ok(done.segments >= 1, 'en az bir segment beklenir');
ok(done.perf && done.perf.rtf > 0, 'perf.rtf raporlanmadı');

const srtPath = path.join(outDir, 'speech.srt');
ok(fs.existsSync(srtPath), 'SRT dosyası yazılmadı');
const srt = fs.readFileSync(srtPath, 'utf8');
ok(/^\uFEFF?\d+\r?\n\d{2}:\d{2}:\d{2},\d{3} --> \d{2}:\d{2}:\d{2},\d{3}/m.test(srt), 'SRT zaman damgası biçimi');
// tiny model gTTS konuşmasında bu sabit cümleyi hemen hemen her zaman yakalar;
// varyansa tolerans için en az iki anahtar kelime aranır.
ok(/quick brown fox/i.test(srt) && /lazy dog/i.test(srt), `SRT metni beklenen konuşmayı içermiyor:\n${srt}`);

const json = JSON.parse(fs.readFileSync(path.join(outDir, 'speech.json'), 'utf8'));
ok(Array.isArray(json.segments) && json.segments.length >= 1, 'JSON segments eksik');
ok(json.segments.every((s) => Number.isFinite(s.start) && Number.isFinite(s.end) && s.start < s.end),
  'JSON segment zamanları bozuk');
ok(String(json.language || '') === 'en', 'dil alanı en bekleniyor');

console.log(`e2e-transcribe-local: ${n} kontrol geçti (tiny/cpu, ${done.segments} segment, rtf ${done.perf.rtf.toFixed(2)}x)`);
