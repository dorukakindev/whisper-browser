'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { withoutSecretEnv } = require('./settings-security');

function run(executable, args, input, signal, timeoutMs = 120000, onStderrLine = null) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(new Error('İşlem iptal edildi.'));
    const env = { ...withoutSecretEnv(process.env), PYTHONIOENCODING: 'utf-8', PYTHONUTF8: '1' };
    const child = spawn(executable, args, { windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'], env });
    const output = []; let size = 0; let errorText = ''; let settled = false;
    let stderrRemainder = '';
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
    child.stderr.on('data', (chunk) => {
      const text = chunk.toString('utf8');
      errorText = (errorText + text).slice(-100000);
      // showinfo pts_time gibi akan işaretler son-100KB arabelleğinden taşabilir;
      // tam satırlar kancaya anında iletilir.
      if (typeof onStderrLine === 'function') {
        stderrRemainder += text;
        let idx;
        while ((idx = stderrRemainder.indexOf('\n')) >= 0) {
          const line = stderrRemainder.slice(0, idx);
          stderrRemainder = stderrRemainder.slice(idx + 1);
          try { onStderrLine(line); } catch (_) {}
        }
      }
    });
    child.on('close', (code) => {
      if (typeof onStderrLine === 'function' && stderrRemainder) {
        try { onStderrLine(stderrRemainder); } catch (_) {}
      }
      finish(code === 0 ? null : new Error(errorText.trim() || Buffer.concat(output).toString('utf8').slice(0, 500) || 'Medya işlemi başarısız.'), Buffer.concat(output).toString('utf8') || errorText);
    });
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

  // P79-04: anlamsal arama için kalıcı yardımcı süreç — SentenceTransformer
  // modeli süreç başına değil oturum başına bir kez yüklenir. İstekler satır
  // başına yazılır, yanıtlar aynı sırayla okunur (FIFO eşleşme). Boşta kalan
  // işçi 10 dakikada kapatılır (bellek geri verilir); iptal/çökmede işçi
  // sıfırlanır ve sonraki sorgu yeniden kurar.
  let worker = null;
  let workerIdleTimer = null;
  const WORKER_IDLE_MS = 10 * 60 * 1000;

  function killWorker(reason) {
    if (!worker) return;
    const pending = worker.pending.splice(0);
    try { worker.child.kill(); } catch (_) {}
    worker = null;
    if (workerIdleTimer) { clearTimeout(workerIdleTimer); workerIdleTimer = null; }
    const error = reason instanceof Error ? reason : new Error('Medya aracı süreci kapandı.');
    for (const p of pending) {
      clearTimeout(p.timer);
      p.signal?.removeEventListener('abort', p.abort);
      p.reject(error);
    }
  }

  function ensureWorker() {
    if (worker) return worker;
    const child = spawn(pythonPath, [script, 'serve'], {
      windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...withoutSecretEnv(process.env), PYTHONIOENCODING: 'utf-8', PYTHONUTF8: '1' },
    });
    const state = { child, pending: [], buffer: '' };
    worker = state;
    child.stdout.setEncoding('utf8');
    child.stdout.on('data', (chunk) => {
      state.buffer += chunk;
      let idx;
      while ((idx = state.buffer.indexOf('\n')) >= 0) {
        const line = state.buffer.slice(0, idx);
        state.buffer = state.buffer.slice(idx + 1);
        const pending = state.pending.shift();
        if (!pending) continue;
        clearTimeout(pending.timer);
        pending.signal?.removeEventListener('abort', pending.abort);
        let result;
        try { result = JSON.parse(line); }
        catch { pending.reject(new Error('Medya aracından geçersiz yanıt alındı.')); continue; }
        if (!result.ok) { pending.reject(new Error(result.error || 'Medya işlemi başarısız.')); continue; }
        delete result.ok;
        pending.resolve(result);
      }
    });
    // Kapatılan işçinin close/error olayı daha sonra kurulan yeni işçiyi
    // öldürmesin — yalnız kendi state'i hâlâ canlıysa sıfırla.
    const retire = (error) => { if (worker === state) killWorker(error); };
    child.on('error', () => retire(new Error('Medya aracı başlatılamadı.')));
    child.on('close', () => retire(new Error('Medya aracı süreci kapandı.')));
    child.stdin.on('error', () => {});
    // stderr'in tüketilmemesi dolan boruda çocuğu bloke eder (model indirme
    // logları vs.); son kısmı hata mesajlarına eklemek için sakla.
    state.stderrTail = '';
    child.stderr.setEncoding('utf8');
    child.stderr.on('data', (chunk) => { state.stderrTail = (state.stderrTail + chunk).slice(-20000); });
    child.unref?.();
    // unref yalnız süreç tanıtıcısını serbest bırakır; stdio boruları
    // ayrı tutamaçtır — bırakılmazsa ana süreç iş bitince bile çıkamaz.
    child.stdout.unref?.();
    child.stderr.unref?.();
    child.stdin.unref?.();
    if (!ensureWorker.exitHooked) {
      ensureWorker.exitHooked = true;
      process.once('exit', () => { try { worker?.child.kill(); } catch (_) {} });
    }
    return state;
  }

  function pythonServe(operation, payload, signal, timeoutMs) {
    if (!pythonPath || !fs.existsSync(pythonPath)) throw new Error('Python ortamı bulunamadı. Önce kurulum yapın.');
    const input = JSON.stringify({ operation, ...payload });
    if (Buffer.byteLength(input, 'utf8') > 24 * 1024 * 1024) throw new Error('Medya isteği çok büyük.');
    return new Promise((resolve, reject) => {
      if (signal?.aborted) return reject(new Error('İşlem iptal edildi.'));
      let state;
      try { state = ensureWorker(); } catch (error) { return reject(error); }
      const entry = {};
      entry.timer = setTimeout(() => killWorker(new Error('İşlem zaman aşımına uğradı.')), timeoutMs);
      entry.abort = () => killWorker(new Error('İşlem iptal edildi.'));
      entry.signal = signal;
      entry.resolve = resolve;
      entry.reject = reject;
      signal?.addEventListener('abort', entry.abort, { once: true });
      state.pending.push(entry);
      try { state.child.stdin.write(`${input}\n`); }
      catch (error) { killWorker(error instanceof Error ? error : new Error('Medya aracına yazılamadı.')); }
      if (workerIdleTimer) clearTimeout(workerIdleTimer);
      workerIdleTimer = setTimeout(() => killWorker(), WORKER_IDLE_MS);
      workerIdleTimer.unref?.();
    });
  }
  return {
    async ocrFrame({ imageBase64, crop } = {}, { signal } = {}) {
      if (typeof imageBase64 !== 'string' || imageBase64.length > 11 * 1024 * 1024) throw new Error('Kare verisi geçersiz veya çok büyük.');
      return python('ocr', { imageBase64, crop }, signal);
    },
    async semanticSearch({ query, cues, limit = 8 } = {}, { signal } = {}) {
      if (typeof query !== 'string' || query.length > 500 || !Array.isArray(cues) || cues.length > 10000) throw new Error('Arama en fazla 500 karakter ve 10.000 altyazı satırı destekliyor.');
      return pythonServe('semantic', { query, cues, limit }, signal, 300000);
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
      // pts_time işaretleri stderr'e AKAR; yalnızca kuyruk arabelleği okunursa
      // uzun videoda erken sahneler kaybolur. Satır kancasıyla akan işaretler
      // toplanır (-frames:v en fazla maxScenes işaret üretir).
      const times = [];
      await run(ffmpegPath, ['-hide_banner', '-nostdin', '-i', videoPath, '-vf', `scale=320:-2,select=gt(scene\\,${threshold}),showinfo`, '-frames:v', String(maxScenes), '-f', 'null', '-'], '', signal, 120000, (line) => {
        const match = line.match(/pts_time:([\d.]+)/);
        if (match && times.length < maxScenes) times.push(Number(match[1]));
      });
      // İşaret yoksa sahte 0:00 sahnesi üretme — boş liste "sahne bulunamadı"
      // anlamına gelir ve arayüz bunu doğru gösterir.
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

module.exports = { createBrowserMediaTools, run };
