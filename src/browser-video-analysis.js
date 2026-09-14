'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');

function run(executable, args, input, signal, timeoutMs = 120000) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(new Error('Video analizi iptal edildi.'));
    const child = spawn(executable, args, { windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
    const chunks = []; let count = 0; let stderr = ''; let finished = false; let stopped = null;
    const finish = (error, result) => {
      if (finished) return;
      finished = true; clearTimeout(timer); signal?.removeEventListener('abort', abort);
      if (error) reject(error); else resolve(result);
    };
    const abort = () => { stopped = new Error('Video analizi iptal edildi.'); child.kill(); };
    const timer = setTimeout(() => { stopped = new Error('Video analizi zaman aşımına uğradı.'); child.kill(); }, timeoutMs);
    signal?.addEventListener('abort', abort, { once: true });
    child.on('error', (error) => finish(new Error(`Video analiz aracı başlatılamadı: ${error.message}`)));
    child.stdout.on('data', (chunk) => { count += chunk.length; if (count > 2 * 1024 * 1024) { child.kill(); finish(new Error('Video analiz çıktısı çok büyük.')); } else chunks.push(chunk); });
    child.stderr.on('data', (chunk) => { stderr = (stderr + chunk.toString('utf8')).slice(-2000); });
    child.on('close', (code) => finish(stopped || (code === 0 ? null : new Error(stderr || 'Video analiz aracı başarısız.')), Buffer.concat(chunks).toString('utf8')));
    child.stdin.on('error', () => {});
    child.stdin.end(input);
  });
}

function createBrowserVideoAnalysis({ pythonPath, ffmpegPath, ffprobePath } = {}) {
  const script = path.join(__dirname, '..', 'backend', 'browser_video_analysis.py');
  const checkTools = () => {
    if (![pythonPath, ffmpegPath, ffprobePath].every(file => typeof file === 'string' && fs.existsSync(file))) throw new Error('Python, FFmpeg veya ffprobe bulunamadı.');
  };
  const checkVideo = (file) => {
    if (typeof file !== 'string' || !fs.existsSync(file) || !fs.statSync(file).isFile()) throw new Error('Erişilebilir yerel video bulunamadı.');
  };
  async function duration(file, signal) {
    const output = await run(ffprobePath, ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=noprint_wrappers=1:nokey=1', file], '', signal, 15000);
    const value = Number(output.trim());
    if (!Number.isFinite(value) || value <= 0 || value > 4 * 3600) throw new Error('Video süresi geçersiz veya dört saati aşıyor.');
    return value;
  }
  async function python(payload, signal) {
    const output = await run(pythonPath, [script], JSON.stringify(payload), signal, 120000);
    let result;
    try { result = JSON.parse(output); } catch { throw new Error('Video analizinden geçersiz yanıt alındı.'); }
    if (!result.ok) throw new Error(result.error || 'Video analizi başarısız.');
    delete result.ok;
    return result;
  }
  return {
    async ocrRange({ videoPath, start, end, crop, interval = 1 } = {}, { signal } = {}) {
      checkTools(); checkVideo(videoPath);
      if (![start, end, interval].every(Number.isFinite) || start < 0 || end <= start || end - start > 60 || interval < 0.5 || interval > 5) throw new Error('OCR aralığı 60 saniyeyi aşamaz; örnekleme 0,5–5 saniye olmalı.');
      if (crop && (!['x', 'y', 'width', 'height'].every(key => Number.isFinite(crop[key])) || crop.x < 0 || crop.y < 0 || crop.width <= 0 || crop.height <= 0 || crop.x + crop.width > 1 || crop.y + crop.height > 1)) throw new Error('OCR seçim bölgesi geçersiz.');
      if (end > await duration(videoPath, signal) + 0.1) throw new Error('OCR aralığı video süresini aşıyor.');
      const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'whisper-ocr-'));
      try {
        await run(ffmpegPath, ['-hide_banner', '-loglevel', 'error', '-nostdin', '-ss', String(start), '-t', String(end - start), '-i', videoPath,
          '-vf', `fps=${1 / interval},scale=1280:-2:force_original_aspect_ratio=decrease`, '-frames:v', '120', path.join(temp, 'frame-%03d.png')], '', signal, 60000);
        const frames = fs.readdirSync(temp).filter(name => /^frame-\d{3}\.png$/.test(name)).sort().map(name => path.join(temp, name));
        if (!frames.length) throw new Error('Seçilen aralıktan okunabilir video karesi çıkarılamadı.');
        return await python({ operation: 'ocrRange', frames, start, end, interval, crop }, signal);
      } finally { fs.rmSync(temp, { recursive: true, force: true }); }
    },
    async detectIntro({ videoPaths, maxScanSeconds = 90 } = {}, { signal } = {}) {
      checkTools();
      if (!Array.isArray(videoPaths) || videoPaths.length < 2 || videoPaths.length > 4 || !Number.isFinite(maxScanSeconds) || maxScanSeconds < 15 || maxScanSeconds > 120) throw new Error('Intro için 2–4 yerel video ve 15–120 saniyelik tarama gerekir.');
      videoPaths.forEach(checkVideo);
      if (new Set(videoPaths.map(file => fs.realpathSync(file).toLowerCase())).size !== videoPaths.length) throw new Error('Intro karşılaştırması için farklı videolar gerekir.');
      const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'whisper-intro-'));
      try {
        const audioFiles = [];
        for (const [index, file] of videoPaths.entries()) {
          const wav = path.join(temp, `audio-${index}.wav`);
          await run(ffmpegPath, ['-hide_banner', '-loglevel', 'error', '-nostdin', '-t', String(maxScanSeconds), '-i', file,
            '-vn', '-ac', '1', '-ar', '8000', '-c:a', 'pcm_s16le', '-y', wav], '', signal, 60000);
          audioFiles.push(wav);
        }
        return await python({ operation: 'detectIntro', audioFiles }, signal);
      } finally { fs.rmSync(temp, { recursive: true, force: true }); }
    },
  };
}

module.exports = { createBrowserVideoAnalysis };
