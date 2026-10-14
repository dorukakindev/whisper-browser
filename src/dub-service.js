'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { performance } = require('node:perf_hooks');

function registerDubService({ app, ipcMain, dialog, owner, authorized, authorizeSubtitle,
  spawn, terminate, busy, grantMedia, environment }) {
  let job = null;
  let textUI = null;
  const configPath = () => path.join(app.getPath('userData'), 'dub-settings.json');
  function voiceEnvironment(engine) {
    const env = { ...environment(), HF_HUB_DISABLE_XET: '1' };
    const torchLib = path.join(engine, '.venv', 'Lib', 'site-packages', 'torch', 'lib');
    if (fs.existsSync(torchLib)) env.PATH = torchLib + path.delimiter + (env.PATH || env.Path || '');
    for (const key of Object.keys(env)) if (key !== 'PATH' && key.toLowerCase() === 'path') delete env[key];
    return env;
  }
  function config() {
    let saved = {};
    try { saved = JSON.parse(fs.readFileSync(configPath(), 'utf8')); } catch (_) {}
    const engine = saved.engine || path.join(app.getPath('desktop'), 'Ses', 'VoxCPM2');
    return { engine, reference: saved.reference || path.join(engine, 'anlatici_ham.wav'),
      transcript: saved.transcript || path.join(engine, 'anlatici_ham.txt'),
      profile: saved.profile === 'fast' ? 'fast' : 'quality', concurrency: saved.concurrency === 8 ? 8 : 4 };
  }
  function emit(s, type, data = {}) {
    const record = { time: new Date().toISOString(), type, elapsedSeconds: (performance.now() - s.started) / 1000, ...data };
    if (s.logPath && !s.logError) {
      try { fs.appendFileSync(s.logPath, JSON.stringify(record) + '\n', 'utf8'); }
      catch (error) { s.logError = error.message; }
    }
    if (!s.sender.isDestroyed()) s.sender.send('dub:event', { id: s.id, type, ...data });
  }
  function finish(s, type, data = {}) {
    const summary = { id: s.id, startedAt: s.startedAt, finishedAt: new Date().toISOString(),
      elapsedSeconds: (performance.now() - s.started) / 1000, result: type,
      progress: s.progress || null, sample: s.sample, exitCode: s.exitCode ?? null, ...data };
    summary.settings = s.settings || null;
    summary.metrics = s.metrics || null;
    if (s.summaryPath) {
      try { fs.writeFileSync(s.summaryPath, JSON.stringify(summary, null, 2), 'utf8'); }
      catch (error) { s.logError = error.message; }
    }
    emit(s, type, { ...data, elapsedSeconds: summary.elapsedSeconds,
      logPath: s.summaryPath || null, logError: s.logError || null });
  }
  const guard = fn => async (e, ...args) => {
    if (!authorized(e)) return { ok: false, error: 'Yetkisiz istek.' };
    try { return await fn(e, ...args); } catch (error) { return { ok: false, error: error.message }; }
  };
  ipcMain.handle('dub:textUI', guard(async () => {
    if (job || busy()) throw new Error('Başka bir üretim çalışıyor; bitmesini bekleyin.');
    if (textUI) return { ok: true, alreadyOpen: true };
    const c = config();
    const python = path.join(c.engine, '.venv', 'Scripts', 'pythonw.exe');
    const script = path.join(c.engine, 'arayuz.py');
    if (![python, script].every(p => fs.existsSync(p))) throw new Error('Metin seslendirme stüdyosu bulunamadı.');
    const proc = spawn(python, [script], { cwd: c.engine, env: voiceEnvironment(c.engine), windowsHide: true, stdio: 'ignore' });
    textUI = proc;
    proc.once('close', () => { if (textUI === proc) textUI = null; });
    await new Promise((resolve, reject) => {
      proc.once('spawn', resolve);
      proc.once('error', error => { if (textUI === proc) textUI = null; reject(error); });
    });
    proc.unref?.();
    return { ok: true };
  }));
  ipcMain.handle('dub:latest', guard(async () => {
    const root = path.join(app.getPath('userData'), 'dub-output');
    const logs = path.join(app.getPath('userData'), 'dub-logs');
    if (!fs.existsSync(logs)) return { ok: true, output: null };
    const candidates = fs.readdirSync(logs).filter(n => n.endsWith('.json')).map(n =>
      ({ file: path.join(logs, n), time: fs.statSync(path.join(logs, n)).mtimeMs })).sort((a,b) => b.time - a.time);
    for (const entry of candidates) {
      try {
        const saved = JSON.parse(fs.readFileSync(entry.file, 'utf8'));
        if (saved.result !== 'done' || !/^[a-zA-Z0-9-]{1,80}$/.test(saved.id || '')) continue;
        const output = path.join(root, `${saved.id}.wav`);
        if (path.resolve(saved.path || '') !== path.resolve(output) || !fs.existsSync(output)) continue;
        grantMedia(output);
        return { ok: true, output: { path: output, url: pathToFileURL(output).href,
          name: saved.name || path.basename(output), elapsedSeconds: saved.elapsedSeconds,
          timing: saved.timing, logPath: entry.file } };
      } catch (_) {}
    }
    return { ok: true, output: null };
  }));
  ipcMain.handle('dub:config', guard(async (_e, kind) => {
    if (kind) {
      if (job) throw new Error('Üretim sürerken ses ayarları değiştirilemez.');
      if (!['engine', 'reference', 'transcript'].includes(kind)) throw new Error('Geçersiz seçim.');
      const selected = await dialog.showOpenDialog(owner(), {
        properties: [kind === 'engine' ? 'openDirectory' : 'openFile'],
        filters: kind === 'engine' ? [] : [{ name: kind === 'reference' ? 'WAV' : 'TXT',
          extensions: [kind === 'reference' ? 'wav' : 'txt'] }],
      });
      if (!selected.canceled && selected.filePaths[0]) {
        const c = config(); c[kind] = selected.filePaths[0];
        if (kind === 'engine') {
          c.reference = path.join(c.engine, 'anlatici_ham.wav'); c.transcript = path.join(c.engine, 'anlatici_ham.txt');
        }
        fs.writeFileSync(configPath(), JSON.stringify(c, null, 2), 'utf8');
      }
    }
    const c = config();
    return { ok: true, ...c, ready: [path.join(c.engine, 'altyazi_oku.py'),
      path.join(c.engine, '.venv', 'Scripts', 'python.exe'), c.reference, c.transcript].every(p => fs.existsSync(p)) };
  }));
  ipcMain.handle('dub:start', guard(async (e, request = {}) => {
    if (textUI) throw new Error('SRT üretimi için önce metin stüdyosunu kapatın.');
    if (job || busy()) throw new Error('Başka bir üretim çalışıyor; bitmesini bekleyin.');
    if (!/^[a-zA-Z0-9-]{1,80}$/.test(request.id || '')) throw new Error('Geçersiz iş kimliği.');
    const s = { id: request.id, sender: e.sender, proc: null, cancelled: false, tail: '',
      started: performance.now(), startedAt: new Date().toISOString(), sample: request.sample === true };
    job = s;
    try {
      const c = config();
      const profile = request.profile ?? c.profile;
      const concurrency = request.concurrency ?? c.concurrency;
      if (!['fast', 'quality'].includes(profile) || ![4, 8].includes(concurrency)) throw new Error('Geçersiz ses üretim profili.');
      c.profile = profile; c.concurrency = concurrency;
      s.settings = { profile, steps: profile === 'fast' ? 10 : 15, concurrency, maxSpeed: 1.25 };
      const python = path.join(c.engine, '.venv', 'Scripts', 'python.exe');
      const script = path.join(c.engine, 'altyazi_oku.py');
      for (const file of [python, script, c.reference, c.transcript]) {
        if (!fs.existsSync(file)) throw new Error('VoxCPM2 motoru veya ses referansı bulunamadı.');
      }
      const srt = await authorizeSubtitle(request.srt);
      if (path.extname(srt).toLowerCase() !== '.srt') throw new Error('Bir SRT altyazı dosyası seçin.');
      if (s.cancelled) { job = null; finish(s, 'cancelled'); return { ok: false, error: 'İptal edildi.' }; }
      const outputDir = path.join(app.getPath('userData'), 'dub-output');
      fs.mkdirSync(outputDir, { recursive: true });
      const output = path.join(outputDir, `${s.id}.wav`);
      if (fs.existsSync(output)) throw new Error('Bu işin ses çıktısı zaten var.');
      fs.writeFileSync(configPath(), JSON.stringify(c, null, 2), 'utf8');
      const logDir = path.join(app.getPath('userData'), 'dub-logs');
      try {
        fs.mkdirSync(logDir, { recursive: true });
        const logBase = `${s.id}-${Date.now()}`;
        s.logPath = path.join(logDir, `${logBase}.ndjson`);
        s.summaryPath = path.join(logDir, `${logBase}.json`);
        fs.writeFileSync(s.summaryPath, JSON.stringify({ id: s.id, startedAt: s.startedAt,
          result: 'running', sample: s.sample }, null, 2), 'utf8');
      } catch (error) { s.logError = error.message; }
      const args = [script, srt, c.reference, '--transcript', c.transcript, '--mode', 'hifi',
        '--gruplama', 'cumle', '--tasarsa', 'kirp', '--max-hiz', '1.25',
        '--bosluk-pay-ms', '2000', '--erken-pay-ms', '300',
        '--steps', String(s.settings.steps), '--eszamanli', String(concurrency), '--output', output];
      if (request.sample === true) args.push('--limit', '11');
      emit(s, 'status', { text: 'Motor yükleniyor…' });
      const env = voiceEnvironment(c.engine);
      s.proc = spawn(python, args, { cwd: c.engine, env, windowsHide: true });
      let pending = '';
      function line(value) {
        s.tail = (s.tail + '\n' + value).slice(-6000);
        const progress = value.match(/^\[(\d+)\/(\d+)\]/);
        if (progress) { s.progress = { done: Number(progress[1]), total: Number(progress[2]) }; emit(s, 'progress', s.progress); }
        else if (/^Plan:/.test(value)) emit(s, 'status', { text: 'Cümle grupları hazır' });
        else if (/Referans hazir/.test(value)) emit(s, 'status', { text: 'Ses üretiliyor…' });
        else if (/^Zamanlama:/.test(value)) emit(s, 'status', { text: 'Ses zaman çizelgesine yerleştiriliyor…' });
        if (/^(Zamanlama:|Ses:.*Islem:)/.test(value)) emit(s, 'statistics', { text: value.slice(0, 1000) });
        if (value.startsWith('DUB_METRICS ')) {
          try {
            const raw = JSON.parse(value.slice(12));
            s.metrics = Object.fromEntries(['load_seconds','reference_seconds','generation_seconds',
              'attempts','retries','cached_groups','generated_groups','steps','concurrency'].filter(k =>
                Number.isFinite(raw[k]) && raw[k] >= 0).map(k => [k, raw[k]]));
            emit(s, 'metrics', { metrics: s.metrics });
          } catch (_) {}
        }
        const timing = value.match(/^Zamanlama: (\d+) grup hizlandirildi, (\d+) grup kirpildi, (\d+) grup tasiyor\./);
        if (timing) {
          s.timing = { accelerated: Number(timing[1]), clipped: Number(timing[2]), overflow: Number(timing[3]) };
          emit(s, 'timing', s.timing);
        }
      }
      s.proc.stdout.setEncoding('utf8'); s.proc.stderr.setEncoding('utf8');
      s.proc.stdout.on('data', text => { pending = (pending + text).slice(-131072); const lines = pending.split(/\r?\n/); pending = lines.pop(); lines.forEach(line); });
      s.proc.stderr.on('data', text => { s.tail = (s.tail + text).slice(-6000); });
      s.proc.on('error', error => { s.spawnError = error.message; });
      s.proc.on('close', code => {
        s.exitCode = code;
        if (pending) line(pending);
        if (job === s) job = null;
        if (s.cancelled) { finish(s, 'cancelled'); return; }
        if (code === 0 && fs.existsSync(output)) {
          grantMedia(output);
          finish(s, 'done', { path: output, url: pathToFileURL(output).href,
            name: path.basename(srt, '.srt') + '-dublaj.wav', timing: s.timing || null });
        } else {
          const details = s.tail.split(/\r?\n/).filter(l => /^(ValueError|RuntimeError|UYARI|Error)/.test(l)).slice(-3).join('\n');
          finish(s, 'error', { error: s.spawnError || details || 'Ses üretimi başarısız oldu.' });
        }
      });
      return { ok: true, id: s.id };
    } catch (error) { if (job === s) job = null; finish(s, 'error', { error: error.message }); throw error; }
  }));
  async function cancel() {
    const s = job;
    if (!s) return { ok: true };
    s.cancelled = true;
    if (s.proc) {
      try {
        const stopped = await terminate(s.proc);
        if (stopped === false && s.proc.exitCode == null && s.proc.signalCode == null) throw new Error('İptal isteği tamamlanamadı.');
      } catch (error) { s.cancelled = false; throw error; }
    }
    return { ok: true };
  }
  ipcMain.handle('dub:cancel', guard(cancel));
  app.on('before-quit', () => { void cancel(); });
  return { running: () => !!job || !!textUI, cancel };
}
module.exports = { registerDubService };
