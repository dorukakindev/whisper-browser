'use strict';

const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');
const { spawn } = require('node:child_process');
const { withoutSecretEnv } = require('./settings-security');

function validateCues(cues) {
  if (!Array.isArray(cues) || cues.length < 3 || cues.length > 10000) throw new Error('Senkron için 3-10000 altyazı satırı gerekli.');
  return cues.map((cue) => {
    if (!cue || typeof cue !== 'object' || !Number.isFinite(cue.start) || !Number.isFinite(cue.end)
        || cue.start < 0 || cue.end <= cue.start || cue.end > 86400
        || String(cue.text || '').length > 4000) throw new Error('Geçersiz altyazı zamanı veya metni.');
    return { ...cue, text: String(cue.text || '') };
  });
}

function createBrowserAlignment({ pythonPath, ffmpegPath } = {}) {
  const script = path.resolve(__dirname, '..', 'backend', 'browser_align.py');
  return {
    align({ referenceCues, targetCues }, { signal, timeoutMs = 120000 } = {}) {
      const reference = validateCues(referenceCues);
      const target = validateCues(targetCues);
      const payload = JSON.stringify({ referenceCues: reference, targetCues: target });
      if (Buffer.byteLength(payload, 'utf8') > 24 * 1024 * 1024) throw new Error('Altyazı verisi çok büyük.');
      if (!pythonPath) throw new Error('Python çalışma ortamı bulunamadı.');
      if (signal?.aborted) return Promise.reject(new Error('İşlem iptal edildi.'));
      return new Promise((resolve, reject) => {
        const env = withoutSecretEnv(process.env);
        env.PYTHONIOENCODING = 'utf-8'; env.PYTHONUTF8 = '1';
        if (ffmpegPath) env.PATH = `${path.dirname(ffmpegPath)}${path.delimiter}${env.PATH || ''}`;
        const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'whisper-browser-align-job-'));
        env.WHISPER_ALIGN_TMPDIR = tempRoot;
        const child = spawn(pythonPath, [script], { env, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
        let stdout = '', stderr = '', settled = false;
        let timer = null;
        const abort = () => { child.kill(); finish(new Error('İşlem iptal edildi.')); };
        const finish = (error, value) => {
          if (settled) return;
          settled = true;
          if (timer) clearTimeout(timer);
          signal?.removeEventListener('abort', abort);
          if (error) reject(error); else resolve(value);
        };
        signal?.addEventListener('abort', abort, { once: true });
        timer = setTimeout(() => { child.kill(); finish(new Error('Altyazı eşleme işlemi zaman aşımına uğradı.')); },
          Math.max(1000, Math.min(600000, Number(timeoutMs) || 120000)));
        child.stdout.setEncoding('utf8'); child.stderr.setEncoding('utf8');
        child.stdout.on('data', chunk => {
          stdout += chunk;
          if (stdout.length > 2 * 1024 * 1024) { child.kill(); finish(new Error('Eşleme çıktısı çok büyük.')); }
        });
        child.stderr.on('data', chunk => { stderr = (stderr + chunk).slice(-1000); });
        child.on('error', error => {
          fs.rmSync(tempRoot, { recursive: true, force: true }); finish(error);
        });
        child.on('close', code => {
          fs.rmSync(tempRoot, { recursive: true, force: true });
          if (settled) return;
          let response;
          try { response = JSON.parse(stdout.trim()); } catch { finish(new Error('Eşleme yanıtı okunamadı.')); return; }
          if (code !== 0 || !response.ok) { finish(new Error(response.error || stderr || 'Eşleme başarısız.')); return; }
          if (!Array.isArray(response.times) || response.times.length !== target.length) {
            finish(new Error('Eşleme satır sayısını değiştirdi.')); return;
          }
          let cues;
          try {
            cues = target.map((cue, index) => {
              const pair = response.times[index];
              const start = Number(pair?.[0]), end = Number(pair?.[1]);
              if (!Number.isFinite(start) || !Number.isFinite(end) || start < 0 || end <= start || end > 86400)
                throw new Error('Eşleme geçersiz zaman üretti.');
              return { ...cue, start, end };
            });
          } catch (error) { finish(error); return; }
          const changes = cues.flatMap((cue, index) => Math.abs(cue.start - target[index].start) > .05
              || Math.abs(cue.end - target[index].end) > .05
            ? [{ index, oldStart: target[index].start, oldEnd: target[index].end,
              start: cue.start, end: cue.end }] : []);
          finish(null, { cues, changes, diagnostics: response.diagnostics });
        });
        child.stdin.on('error', () => {});
        child.stdin.end(payload, 'utf8');
      });
    },
  };
}

module.exports = { createBrowserAlignment };
