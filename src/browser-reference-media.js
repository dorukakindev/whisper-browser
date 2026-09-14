'use strict';
const { spawn } = require('node:child_process');

function processOutput(executable, args, { signal, limit = 2 * 1024 * 1024, timeout = 120000, consume } = {}) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(new Error('İşlem iptal edildi.'));
    const child = spawn(executable, args, { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    const chunks = []; let bytes = 0, errorText = '', settled = false;
    const finish = (error, output) => {
      if (settled) return;
      settled = true; clearTimeout(timer); signal?.removeEventListener('abort', abort);
      if (error) reject(error); else resolve(output);
    };
    const abort = () => { child.kill(); finish(new Error('İşlem iptal edildi.')); };
    const timer = setTimeout(() => { child.kill(); finish(new Error('Medya işlemi zaman aşımına uğradı.')); }, timeout);
    signal?.addEventListener('abort', abort, { once: true });
    child.on('error', error => finish(new Error(`Medya aracı başlatılamadı: ${error.message}`)));
    child.stderr.on('data', chunk => { errorText = (errorText + chunk.toString()).slice(-1000); });
    child.stdout.on('data', chunk => {
      bytes += chunk.length;
      if (bytes > limit) { child.kill(); finish(new Error('Medya çıktısı izin verilen boyutu aştı.')); return; }
      if (consume) consume(chunk); else chunks.push(chunk);
    });
    child.on('close', code => finish(code === 0 ? null : new Error(errorText || 'Medya okunamadı.'), Buffer.concat(chunks)));
  });
}

function createBrowserReferenceMedia({ ffmpegPath, ffprobePath }) {
  return {
    async probe(videoPath, { signal } = {}) {
      const raw = await processOutput(ffprobePath, ['-v', 'error', '-show_entries', 'format=duration', '-of', 'json', videoPath], { signal, timeout: 15000 });
      const duration = Number(JSON.parse(raw.toString('utf8')).format?.duration);
      if (!Number.isFinite(duration) || duration <= 0 || duration > 14400) throw new Error('Referans video en fazla dört saat olabilir.');
      return { duration };
    },
    async waveform(videoPath, duration, { signal } = {}) {
      if (!Number.isFinite(duration) || duration <= 0 || duration > 14400)
        throw new Error('Referans video süresi geçersiz.');
      const count = Math.min(12000, Math.max(100, Math.ceil(duration * 20)));
      const peaks = new Float32Array(count), squares = new Float64Array(count), samples = new Uint32Array(count);
      let sample = 0, pending = Buffer.alloc(0);
      await processOutput(ffmpegPath, ['-v', 'error', '-nostdin', '-i', videoPath, '-vn', '-ac', '1', '-ar', '8000', '-f', 's16le', 'pipe:1'], {
        signal, limit: Math.ceil((duration + 2) * 16000), consume(chunk) {
          const bytes = pending.length ? Buffer.concat([pending, chunk]) : chunk;
          const length = bytes.length - bytes.length % 2;
          for (let i = 0; i < length; i += 2, sample++) {
            const index = Math.min(count - 1, Math.floor(sample / (duration * 8000) * count));
            const value = Math.abs(bytes.readInt16LE(i) / 32768);
            peaks[index] = Math.max(peaks[index], value); squares[index] += value * value; samples[index]++;
          }
          pending = length < bytes.length ? Buffer.from(bytes.subarray(length)) : Buffer.alloc(0);
        },
      });
      if (!sample) throw new Error('Referans dosyada okunabilir ses yok.');
      return { duration, points: Array.from(peaks, (peak, i) => Math.round(Math.max(peak * .4, Math.sqrt(squares[i] / Math.max(1, samples[i]))) * 1000) / 1000) };
    },
    async thumbnail(videoPath, time, { signal } = {}) {
      if (!Number.isFinite(time) || time < 0 || time > 14400) throw new Error('Önizleme zamanı geçersiz.');
      const raw = await processOutput(ffmpegPath, ['-v', 'error', '-nostdin', '-ss', String(time), '-i', videoPath,
        '-frames:v', '1', '-vf', 'scale=320:-2', '-f', 'image2pipe', '-vcodec', 'mjpeg', 'pipe:1'], { signal, timeout: 15000 });
      if (!raw.length) throw new Error('Bu zamanda kare alınamadı.');
      return { time, image: `data:image/jpeg;base64,${raw.toString('base64')}` };
    },
  };
}
module.exports = { createBrowserReferenceMedia };
