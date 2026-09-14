'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');

function run(executable, args, input, signal, timeoutMs = 120000) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(new Error('İşlem iptal edildi.'));
    const child = spawn(executable, args, { windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env, PYTHONIOENCODING: 'utf-8', PYTHONUTF8: '1' } });
    const output = []; let size = 0; let errorText = ''; let settled = false;
    const finish = (error, value) => {
      if (settled) return;
      settled = true; clearTimeout(timer); signal?.removeEventListener('abort', abort);
      if (error) reject(error); else resolve(value);
    };
    const abort = () => { child.kill(); finish(new Error('İşlem iptal edildi.')); };
    const timer = setTimeout(() => { child.kill(); finish(new Error('İşlem zaman aşımına uğradı.')); }, timeoutMs);
    signal?.addEventListener('abort', abort, { once: true });
    child.on('error', (error) => finish(new Error(`Medya aracı başlatılamadı: ${error.message}`)));
    child.stdout.on('data', (chunk) => { size += chunk.length; if (size > 5 * 1024 * 1024) { child.kill(); finish(new Error('Medya aracı çıktısı çok büyük.')); } else output.push(chunk); });
    child.stderr.on('data', (chunk) => { errorText = (errorText + chunk.toString('utf8')).slice(-100000); });
    child.on('close', (code) => finish(code === 0 ? null : new Error(errorText.trim() || Buffer.concat(output).toString('utf8').slice(0, 500) || 'Medya işlemi başarısız.'), Buffer.concat(output).toString('utf8') || errorText));
    child.stdin.on('error', () => {});
    child.stdin.end(input);
  });
}

function createBrowserMediaTools({ pythonPath, ffmpegPath, ffprobePath, backendScriptPath } = {}) {
  const script = backendScriptPath || path.join(__dirname, '..', 'backend', 'browser_media_tools.py');
  async function python(operation, payload, signal) {
    if (!pythonPath || !fs.existsSync(pythonPath)) throw new Error('Python ortamı bulunamadı. Önce kurulum yapın.');
    const input = JSON.stringify({ operation, ...payload });
    if (Buffer.byteLength(input, 'utf8') > 24 * 1024 * 1024) throw new Error('Medya isteği çok büyük.');
    const output = await run(pythonPath, [script], input, signal, operation === 'semantic' ? 300000 : 120000);
    let result;
    try { result = JSON.parse(output); } catch { throw new Error('Medya aracından geçersiz yanıt alındı.'); }
    if (!result.ok) throw new Error(result.error || 'Medya işlemi başarısız.');
    delete result.ok;
    return result;
  }
  return {
    async ocrFrame({ imageBase64, crop } = {}, { signal } = {}) {
      if (typeof imageBase64 !== 'string' || imageBase64.length > 11 * 1024 * 1024) throw new Error('Kare verisi geçersiz veya çok büyük.');
      return python('ocr', { imageBase64, crop }, signal);
    },
    async semanticSearch({ query, cues, limit = 8 } = {}, { signal } = {}) {
      if (typeof query !== 'string' || query.length > 500 || !Array.isArray(cues) || cues.length > 10000) throw new Error('Arama en fazla 500 karakter ve 10.000 altyazı satırı destekliyor.');
      return python('semantic', { query, cues, limit }, signal);
    },
    async sceneStrip({ videoPath, outputDir, threshold = 0.35, maxScenes = 24 } = {}, { signal } = {}) {
      if (!ffmpegPath || !ffprobePath || !fs.existsSync(ffmpegPath) || !fs.existsSync(ffprobePath)) throw new Error('FFmpeg ve ffprobe bulunamadı.');
      if (typeof videoPath !== 'string' || !fs.existsSync(videoPath) || !fs.statSync(videoPath).isFile()) throw new Error('Erişilebilir yerel video bulunamadı.');
      if (typeof outputDir !== 'string' || !path.isAbsolute(outputDir)) throw new Error('Sahne çıktı klasörü geçersiz.');
      if (!Number.isFinite(threshold) || threshold < 0.1 || threshold > 0.9 || !Number.isInteger(maxScenes) || maxScenes < 1 || maxScenes > 48) throw new Error('Sahne algılama sınırları geçersiz.');
      const probe = await run(ffprobePath, ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=noprint_wrappers=1:nokey=1', videoPath], '', signal, 15000);
      const duration = Number(probe.trim());
      if (!Number.isFinite(duration) || duration <= 0 || duration > 4 * 3600) throw new Error('Video süresi en fazla dört saat olabilir.');
      fs.mkdirSync(outputDir, { recursive: true });
      const detection = await run(ffmpegPath, ['-hide_banner', '-nostdin', '-i', videoPath, '-vf', `scale=320:-2,select=gt(scene\\,${threshold}),showinfo`, '-frames:v', String(maxScenes), '-f', 'null', '-'], '', signal, 120000);
      const times = [...detection.matchAll(/pts_time:([\d.]+)/g)].map((match) => Number(match[1]));
      if (!times.length) times.push(0);
      const scenes = [];
      for (const [index, time] of times.slice(0, maxScenes).entries()) {
        if (signal?.aborted) throw new Error('İşlem iptal edildi.');
        const thumbnailPath = path.join(outputDir, `scene-${String(index + 1).padStart(3, '0')}.jpg`);
        await run(ffmpegPath, ['-hide_banner', '-loglevel', 'error', '-nostdin', '-ss', String(time), '-i', videoPath, '-frames:v', '1', '-vf', 'scale=320:-2', '-y', thumbnailPath], '', signal, 20000);
        scenes.push({ time, thumbnailPath });
      }
      return { scenes };
    },
  };
}

module.exports = { createBrowserMediaTools };
