'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { voiceStorage, prepareVoiceStorage } = require('./voice-storage');
const { performance } = require('node:perf_hooks');
const { validate: validateSync } = require('./renderer/dub-sync-map');
const { groups: validateGroups } = require('./renderer/dub-workspace-model');
const { atomicWriteFileSync } = require('./fsync-utils');
const { validVoiceOutput } = require('./voice-output');

function registerDubService({ app, ipcMain, dialog, owner, authorized, authorizeSubtitle,
  spawn, terminate, busy, grantMedia, environment, shorten, editorIdentity = () => '', setRate, prepareBackground, prepareProsody, prepareReference, onOutput = output => output }) {
  let job = null, releasingEngine=false;
  const warmEngine=require('./dub-engine-worker').createDubEngineWorker({spawn,terminate});
  require('./dub-playback-assets').registerDubPlaybackAssets({ app, ipcMain, dialog, owner, authorized, grantMedia });
  let textUI = null;
  const plans = new Map();
  const planning = new Map();
  const planSenders = new WeakSet();
  function rangeOption(raw) {
    if (raw == null) return null;
    const { start, end } = raw;
    if (!Number.isFinite(start) || !Number.isFinite(end) || start < 0 || end <= start || end > 86400 || end - start < 0.1) throw new Error('Geçersiz zaman aralığı.');
    return { start, end };
  }
  const configPath = () => path.join(app.getPath('userData'), 'dub-settings.json');
  function voiceEnvironment(engine) {
    const env = { ...environment(), HF_HUB_DISABLE_XET: '1', VOXCPM_ROOT: engine };
    const torchLib = path.join(engine, '.venv', 'Lib', 'site-packages', 'torch', 'lib');
    const inheritedPath = Object.keys(env).find(key => key.toLowerCase() === 'path');
    env.PATH = env.PATH ?? env[inheritedPath] ?? process.env.PATH ?? '';
    if (fs.existsSync(torchLib)) env.PATH = torchLib + path.delimiter + env.PATH;
    const bundledTools = path.join(__dirname, '..', 'backend', 'bin');
    if (fs.existsSync(bundledTools)) env.PATH = bundledTools + path.delimiter + env.PATH;
    for (const key of Object.keys(env)) if (key !== 'PATH' && key.toLowerCase() === 'path') delete env[key];
    return env;
  }
  function processFailure(stderr, tail = '') {
    const lines = (stderr + '\n' + tail).split(/\r?\n/).map(line => line.trim()).filter(Boolean);
    const fatal = [...new Set(lines.filter(line => /^(?:[\w.]*(?:Error|Exception)\b|(?:FATAL|ERROR)\b|Windows fatal exception:)/i.test(line)))];
    const plain = stderr.split(/\r?\n/).map(line => line.trim()).filter(line => line && line.length <= 400 && !/^(?:Traceback|File\s+"|UYARI\b|[~^])/.test(line)).slice(-1);
    const warnings = lines.filter(line => /^UYARI\b/.test(line));
    return (fatal.length ? fatal.slice(-3) : plain.length ? plain : warnings.slice(-3)).join('\n');
  }
  function config() {
    let saved = {};
    try { saved = JSON.parse(fs.readFileSync(configPath(), 'utf8')); } catch (_) {}
    if (!saved || typeof saved !== 'object' || Array.isArray(saved)) saved = {};
    const savedPath = key => typeof saved[key] === 'string' && saved[key].trim() && !saved[key].includes('\0') ? saved[key] : '';
    const engine = savedPath('engine') || path.join(app.getPath('desktop'), 'Ses', 'VoxCPM2');
    return { keepEngine:saved.keepEngine !== false, engine, reference: savedPath('reference') || path.join(engine, 'anlatici_ham.wav'),
      transcript: savedPath('transcript') || path.join(engine, 'anlatici_ham.txt'),
      verification: ['fast','balanced','detailed'].includes(saved.verification) ? saved.verification : 'detailed',
      autoFit: saved.autoFit !== false, naturalSpeech: saved.naturalSpeech !== false,
      timingMode: saved.timingMode === 'clip' ? 'clip' : 'video',
      expression: ['calm','warm','lively'].includes(saved.expression) ? saved.expression : 'reference',
      followDelivery: saved.followDelivery === true,
      deliveryStrength: ['gentle','strong'].includes(saved.deliveryStrength) ? saved.deliveryStrength : 'balanced',
      grouping: ['akici', 'cumle', 'satir'].includes(saved.grouping) ? saved.grouping : 'akici',
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
  function claimArtifacts(s, files) {
    // Check the entire family BEFORE claiming any paths. A rejected duplicate
    // must never make an earlier successful job's output eligible for cleanup.
    if (files.some(file => fs.lstatSync(file, { throwIfNoEntry: false }))) throw new Error('Bu işin ses çıktısı zaten var.');
    s.ownedArtifacts ||= new Set();
    files.forEach(file => s.ownedArtifacts.add(file));
  }
  function cleanupArtifacts(s, files = s.ownedArtifacts || []) {
    for (const file of files) {
      if (!s.ownedArtifacts?.has(file)) continue;
      try { fs.rmSync(file, { force: true }); s.ownedArtifacts.delete(file); }
      catch (error) { (s.cleanupErrors ||= []).push({ file: path.basename(file), code: error.code || 'UNKNOWN' }); }
    }
  }
  function ownJob(s) {
    job = s;
    s.onDestroyed = () => { if (job === s) void cancel().catch(() => {}); };
    s.sender.once?.('destroyed', s.onDestroyed);
  }
  function finish(s, type, data = {}) {
    s.sender.removeListener?.('destroyed', s.onDestroyed);
    if (type === 'error' || type === 'cancelled') cleanupArtifacts(s);
    const summary = { id: s.id, startedAt: s.startedAt, finishedAt: new Date().toISOString(),
      elapsedSeconds: (performance.now() - s.started) / 1000, result: type,
      phases:s.phases||{}, progress: s.progress || null, sample: s.sample, exitCode: s.exitCode ?? null,
      exitSignal: s.exitSignal || null,
      cleanupErrors: s.cleanupErrors || [], ...data };
    summary.settings = s.settings || null;
    summary.metrics = s.metrics || null;
    if (type === 'error') summary.diagnostics = {
      stdoutTail: s.stdout || '', stderrTail: s.stderr || ''
    };
    if (s.summaryPath) {
      try { fs.writeFileSync(s.summaryPath, JSON.stringify(summary, null, 2), 'utf8'); }
      catch (error) { s.logError = error.message; }
    }
    if (type === 'done' && data.path) onOutput({...data,id:s.id});
    emit(s, type, { ...data, elapsedSeconds: summary.elapsedSeconds,
      logPath: s.summaryPath || null, logError: s.logError || null });
  }
  const guard = fn => async (e, ...args) => {
    if (!authorized(e)) return { ok: false, error: 'Yetkisiz istek.' };
    try { await storage(); return await fn(e, ...args); } catch (error) { return { ok: false, error: error.message }; }
  };
  const referencesRoot = () => voiceStorage(app).references;
  let storageReady;
  async function storage() {
    if (!storageReady) storageReady = prepareVoiceStorage(app).catch(error => { storageReady = null; throw error; });
    return storageReady;
  }
  function referencePaths(id) {
    if (!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(id || '')) throw new Error('Invalid reference ID.');
    fs.mkdirSync(referencesRoot(), { recursive: true });
    const folder = path.join(fs.realpathSync(referencesRoot()), id);
    if (fs.existsSync(folder) && fs.realpathSync(folder) !== path.resolve(folder)) throw new Error('Invalid reference folder.');
    return { folder, reference: path.join(folder, 'reference.wav'), transcript: path.join(folder, 'reference.txt'), metadata: path.join(folder, 'reference.json') };
  }
  function referenceEntry(id) {
    const p = referencePaths(id);
    for (const file of [p.reference, p.transcript, p.metadata]) {
      if (!fs.statSync(file).isFile() || fs.realpathSync(file) !== path.resolve(file)) throw new Error('Invalid reference file.');
    }
    if (fs.statSync(p.transcript).size > 32000 || fs.statSync(p.metadata).size > 4000) throw new Error('Invalid reference metadata.');
    if (!validVoiceOutput(p.reference)) throw new Error('Invalid reference audio.');
    const meta = JSON.parse(fs.readFileSync(p.metadata, 'utf8'));
    grantMedia(p.reference);
    return { id, name: String(meta.name || id).slice(0, 160), createdAt: String(meta.createdAt || ''), path: p.reference,
      url: pathToFileURL(p.reference).href, text: fs.readFileSync(p.transcript, 'utf8'), folder: p.folder,
      quality: meta.quality || null };
  }
  ipcMain.handle('dub:references', guard(async () => {
    fs.mkdirSync(referencesRoot(), { recursive: true });
    const references = [];
    for (const id of fs.readdirSync(referencesRoot()).sort().reverse()) {
      try { references.push(referenceEntry(id)); } catch (_) {}

    }
    references.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    references.length = Math.min(references.length, 100);
    return { ok: true, folder: referencesRoot(), references, activeId: references.find(item => item.path === config().reference || path.join(app.getPath('userData'), 'Referans sesler', item.id, 'reference.wav') === config().reference)?.id || '' };
  }));
  function referenceName(raw, optional = false) {
    if (raw == null && optional) return '';
    if (typeof raw !== 'string' || /[\u0000-\u001f\u007f]/.test(raw) || raw.trim().length > 160) throw new Error('Check the reference name.');
    const name = raw.trim();
    if (!name && !optional) throw new Error('Check the reference name.');
    return name;
  }
  ipcMain.handle('dub:referenceRename', guard(async (_e, request = {}) => {
    if (job || textUI || releasingEngine || busy()) throw new Error('Wait for the current job to finish.');
    const name = referenceName(request.name), entry = referenceEntry(request.id), p = referencePaths(entry.id);
    const meta = JSON.parse(fs.readFileSync(p.metadata, 'utf8'));
    atomicWriteFileSync(p.metadata, JSON.stringify({ ...meta, name }), { encoding: 'utf8' });
    return { ok: true, name };
  }));
  ipcMain.handle('dub:referenceUse', guard(async (_e, request = {}) => {
    if (job || textUI || releasingEngine || busy()) throw new Error('Wait for the current job to finish.');
    const entry = referenceEntry(request.id);
    const text = typeof request.text === 'string' ? request.text.trim() : entry.text.trim();
    if (!text || text.length > 8000) throw new Error('Check the reference transcript.');
    const p = referencePaths(request.id), c = config();
    atomicWriteFileSync(p.transcript, text, { encoding: 'utf8' });
    c.reference = p.reference; c.transcript = p.transcript;
    atomicWriteFileSync(configPath(), JSON.stringify(c, null, 2), { encoding: 'utf8' });
    return { ok: true };
  }));
  ipcMain.handle('dub:referencePrepare', guard(async (e, request = {}) => {
    if (job || textUI || releasingEngine || busy()) throw new Error('Wait for the current job to finish.');
    const name = referenceName(request.name, true);
    const range = rangeOption(request.range);
    if (!range || range.end - range.start < 3 || range.end - range.start > 30) throw new Error('Select 3–30 seconds.');
    const p = referencePaths(request.id);
    if (fs.existsSync(p.folder)) throw new Error('Reference already exists.');
    if (typeof prepareReference !== 'function') throw new Error('Reference capture is unavailable.');
    const s = { id: request.id, sender: e.sender, proc: null, cancelled: false,
      started: performance.now(), startedAt: new Date().toISOString(), settings: { kind: 'reference', range } };
    ownJob(s);
    try {
      fs.mkdirSync(p.folder);
      claimArtifacts(s, [p.reference, p.transcript, p.metadata, path.join(p.folder, 'reference-quality.json'), p.reference.replace(/\.wav$/i, '.partial.wav'), `${p.reference}.partial`]);
      s.logPath = path.join(p.folder, 'events.ndjson'); s.summaryPath = path.join(p.folder, 'job.json');
      await prepareReference({ request, ...p, ...range, onProcess: proc => { s.proc = proc; },
        isCancelled: () => s.cancelled, status: stage => emit(s, 'reference_status', { stage }) });
      if (s.cancelled) throw new Error('Cancelled.');
      const text = fs.readFileSync(p.transcript, 'utf8').trim();
      if (!text || text.length > 8000 || !validVoiceOutput(p.reference)) throw new Error('No reference speech found.');
      let quality = null;
      try { quality = JSON.parse(fs.readFileSync(path.join(p.folder, 'reference-quality.json'), 'utf8')); } catch (_) {}
      atomicWriteFileSync(p.metadata, JSON.stringify({ name: name || `${range.start}–${range.end} s · ${s.startedAt.slice(0, 19)}`, createdAt: s.startedAt, quality }), { encoding: 'utf8' });
      const reference = referenceEntry(request.id);
      finish(s, 'reference_ready');
      return { ok: true, reference };
    } catch (error) {
      if (error.processActive && s.proc) {
        s.keepOwner = true;
        s.proc.once('close', () => {
          finish(s, s.cancelled ? 'cancelled' : 'error', { error: error.message });
          if (job === s) job = null;
        });
        return { ok: false, error: error.message };
      }
      finish(s, s.cancelled ? 'cancelled' : 'error', { error: error.message });
      return { ok: false, cancelled: s.cancelled, error: error.message };
    } finally { if (job === s && !s.keepOwner) job = null; }
  }));
  ipcMain.handle('dub:referenceSource', guard(async () => {
    if (job || textUI || releasingEngine || busy()) throw new Error('Wait for the current job to finish.');
    const selected = await dialog.showOpenDialog(owner(), { properties: ['openFile'],
      filters: [{ name: 'Audio', extensions: ['wav', 'mp3', 'flac', 'm4a', 'ogg', 'opus', 'aac', 'wma'] }] });
    if (selected.canceled || !selected.filePaths[0]) return { ok: true, cancelled: true };
    if (job || textUI || releasingEngine || busy()) throw new Error('Wait for the current job to finish.');
    const file = selected.filePaths[0];
    if (!fs.statSync(file).isFile()) throw new Error('Invalid reference file.');
    grantMedia(file);
    return { ok: true, path: file };
  }));
  ipcMain.handle('dub:rate', guard(async (_e, request = {}) => {
    if (typeof setRate !== 'function' || !Number.isFinite(request.rate) || request.rate < .0625 || request.rate > 4
        || !Number.isInteger(request.generation) || typeof request.tabId !== 'string') throw new Error('Geçersiz dublaj hız isteği.');
    return setRate(request);
  }));
  ipcMain.handle('dub:plan', guard(async (e, request = {}) => {
    if (job) throw new Error('Üretimin bitmesini bekleyin.');
    const senderId = e.sender.id;
    planning.get(senderId)?.cancel?.();
    const attempt = {};
    planning.set(senderId, attempt);
    plans.delete(senderId);
    if (!planSenders.has(e.sender) && typeof e.sender.once === 'function') {
      planSenders.add(e.sender);
      e.sender.once('destroyed', () => {
        planning.get(senderId)?.cancel?.();
        planning.delete(senderId); plans.delete(senderId);
      });
    }
    try {
    const srt = await authorizeSubtitle(request.srt);
    if (planning.get(senderId) !== attempt || e.sender.isDestroyed()) throw new Error('Dublaj planı artık kullanılmıyor.');
    if (path.extname(srt).toLowerCase() !== '.srt' || fs.statSync(srt).size > 2000000) throw new Error('Geçersiz SRT.');
    const c = config();
    const range = rangeOption(request.range);
    const grouping = ['akici', 'cumle', 'satir'].includes(request.grouping) ? request.grouping : c.grouping;
    const result = await new Promise((resolve, reject) => {
      const proc = spawn(path.join(c.engine, '.venv', 'Scripts', 'python.exe'),
        [path.join(__dirname, '..', 'tools', 'voxcpm2', 'dub_plan.py'), srt,
          ...(range ? [String(range.start), String(range.end)] : []), '--grouping', grouping],
        { cwd: c.engine, env: voiceEnvironment(c.engine), windowsHide: true });
      let out = '', stderr = '', settled = false;
      const finish = (error, value) => { if (settled) return; settled = true; clearTimeout(timer); error ? reject(error) : resolve(value); };
      const stop = message => {
        finish(new Error(message));
        void Promise.resolve().then(() => terminate(proc)).catch(() => {});
      };
      attempt.cancel = () => stop('Dublaj planı artık kullanılmıyor.');
      const timer = setTimeout(() => stop('Dublaj planı zaman aşımına uğradı.'), 15000);
      proc.stdout.setEncoding('utf8'); proc.stderr.setEncoding('utf8');
      proc.stderr.on('data', data => { stderr = (stderr + data).slice(-6000); });
      proc.stdout.on('data', data => { if (settled) return; out += data; if (out.length > 4000000) stop('Dublaj planı çok büyük.'); });
      proc.once('error', error => finish(error));
      proc.once('close', code => {
        if (settled) return;
        if (code !== 0) return finish(new Error(processFailure(stderr) || 'SRT planı okunamadı.'));
        try {
          const value = JSON.parse(out);
          const keys = new Set();
          if (!value || typeof value.sourceHash !== 'string' || !value.sourceHash
              || value.sourceHash.length > 128 || !Array.isArray(value.groups)
              || !value.groups.length || value.groups.length > 5000
              || value.groups.some(group => {
                if (!group || typeof group.key !== 'string' || !group.key || keys.has(group.key)
                    || typeof group.text !== 'string' || !group.text.trim()
                    || !Number.isFinite(group.seconds) || group.seconds <= 0) return true;
                keys.add(group.key); return false;
              })) throw new Error('invalid plan');
          const skipped = Number.isInteger(value.skipped) && value.skipped >= 0 && value.skipped <= 1000000 ? value.skipped : 0;
          finish(null, { sourceHash: value.sourceHash, groups: value.groups, skipped });
        } catch (_) { finish(new Error('Geçersiz dublaj planı.')); }
      });
    });
    if (planning.get(senderId) !== attempt || e.sender.isDestroyed()) throw new Error('Dublaj planı artık kullanılmıyor.');
    plans.set(senderId, { srt, range, grouping, ...result });
    return { ok: true, grouping, ...result };
    } finally { if (planning.get(senderId) === attempt) planning.delete(senderId); }
  }));
  ipcMain.handle('dub:shorten', guard(async (e, key) => {
    const group = plans.get(e.sender.id)?.groups.find(g => g.key === key);
    if (!group || typeof shorten !== 'function') throw new Error('Önce dublaj metnini hazırlayın.');
    if (group.text.length > 4000) throw new Error('Bu metin otomatik kısaltma için çok uzun; elle düzenleyin.');
    const text = await shorten(group.text, group.seconds);
    return { ok: true, text };
  }));
  ipcMain.handle('dub:textUI', guard(async e => {
    if (job || releasingEngine || busy()) throw new Error('Başka bir üretim çalışıyor; bitmesini bekleyin.');
    if (textUI) return { ok: true, alreadyOpen: true };
    const c = config();
    const python = path.join(c.engine, '.venv', 'Scripts', 'pythonw.exe');
    const script = path.join(__dirname, '..', 'tools', 'voxcpm2', 'text_studio.py');
    if (![python, script].every(p => fs.existsSync(p))) throw new Error('Metin seslendirme stüdyosu bulunamadı.');
    releasingEngine=true;
    try{await warmEngine.release();}finally{releasingEngine=false;}
    const proc = spawn(python, [script, '--engine', c.engine, '--config', configPath(),
      '--reference', c.reference, '--transcript', c.transcript, '--storage', voiceStorage(app).root],
      { cwd: path.join(__dirname, '..'), env: voiceEnvironment(c.engine), windowsHide: true, stdio: ['ignore', 'ignore', 'pipe'] });
    let stderr = '', launched = false;
    proc.stderr?.setEncoding?.('utf8');
    proc.stderr?.on('data', data => { stderr = (stderr + data).slice(-6000); });
    textUI = proc;
    proc.once('close', code => {
      if (textUI === proc) textUI = null;
      if (launched && Number.isInteger(code) && code !== 0 && !e.sender.isDestroyed()) {
        e.sender.send('dub:event', { id: 'text-studio', type: 'studio_error',
          error: processFailure(stderr) || 'Metin seslendirme stüdyosu başlatılamadı.' });
      }
    });
    await new Promise((resolve, reject) => {
      proc.once('spawn', () => { launched = true; resolve(); });
      proc.once('error', error => { if (textUI === proc) textUI = null; reject(error); });
    });
    proc.unref?.();
    return { ok: true };
  }));
  ipcMain.handle('dub:latest', guard(async (_event, requestedId) => {
    if (requestedId !== undefined && !/^[a-zA-Z0-9-]{1,80}$/.test(requestedId)) return { ok: false, error: 'Invalid voice identity.' };
    const root = voiceStorage(app).output;
    const logs = path.join(app.getPath('userData'), 'dub-logs');
    if (!fs.existsSync(logs)) return { ok: true, output: null };
    const candidates = fs.readdirSync(logs).filter(n => n.endsWith('.json')).flatMap(n => {
      try { const file=path.join(logs,n),stat=fs.statSync(file);return stat.isFile() ? [{file,time:stat.mtimeMs}] : []; }
      catch (_) { return []; }
    }).sort((a,b) => b.time - a.time);
    for (const entry of candidates) {
      try {
        const saved = JSON.parse(fs.readFileSync(entry.file, 'utf8'));
        if (saved.result !== 'done' || !/^[a-zA-Z0-9-]{1,80}$/.test(saved.id || '')) continue;
        if (requestedId && saved.id !== requestedId) continue;
        const output = path.join(root, `${saved.id}.wav`);
        if (![output, path.join(app.getPath('userData'), 'dub-output', `${saved.id}.wav`)].some(file => path.resolve(file) === path.resolve(saved.path || '')) || !validVoiceOutput(output)) continue;
        grantMedia(output);
        let sync = null, syncInvalid = false;
        try { sync = validateSync(saved.sync); if (saved.settings?.timingMode === 'video' && !sync) syncInvalid = true; } catch (_) { syncInvalid = true; }
        let quality = null;
        try { if(saved.quality?.version===1 && saved.quality.groups?.length) quality={...saved.quality,groups:validateGroups(saved.quality.groups)}; } catch (_) {}
        if (quality?.groups?.every(row => row.status === 'failed')) continue;
        return { ok: true, output: onOutput({ id: saved.id, path: output, url: pathToFileURL(output).href,
          name: saved.name || path.basename(output), elapsedSeconds: saved.elapsedSeconds,
          range: rangeOption(saved.range),
          sync, syncInvalid, quality, qualityUnavailable:saved.qualityUnavailable === true || !quality?.groups?.length, sample:saved.sample === true,
          background: saved.background && validVoiceOutput(path.join(root,`${saved.id}-background.wav`))
            ? (()=>{ const file=path.join(root,`${saved.id}-background.wav`);grantMedia(file);return {path:file,url:pathToFileURL(file).href}; })() : null,
          timing: saved.timing, subtitle: saved.subtitle, settings:saved.settings || null, logPath: entry.file }) };
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
        if (job || textUI || releasingEngine || busy()) throw new Error('Üretim sürerken ses ayarları değiştirilemez.');
        const c = config(); c[kind] = selected.filePaths[0];
        if(kind==='reference')c.transcript=selected.filePaths[0].replace(/\.wav$/i,'.txt');
        if (kind === 'engine') {
          c.reference = path.join(c.engine, 'anlatici_ham.wav'); c.transcript = path.join(c.engine, 'anlatici_ham.txt');
        }
        atomicWriteFileSync(configPath(), JSON.stringify(c, null, 2), { encoding: 'utf8' });
      }
    }
    const c = config();
    return { ok: true, ...c, storageRoot: voiceStorage(app).root, ready: [path.join(__dirname,'..','tools','voxcpm2','altyazi_oku.py'),path.join(c.engine, 'kitap_ortak.py'),
      path.join(c.engine, '.venv', 'Scripts', 'python.exe'), c.reference, c.transcript].every(p => fs.existsSync(p)) };
  }));
  ipcMain.handle('dub:start', guard(async (e, request = {}) => {
    if (textUI) throw new Error('SRT üretimi için önce metin stüdyosunu kapatın.');
    if (job || releasingEngine || busy()) throw new Error('Başka bir üretim çalışıyor; bitmesini bekleyin.');
    if (!/^[a-zA-Z0-9-]{1,80}$/.test(request.id || '')) throw new Error('Geçersiz iş kimliği.');
    const s = { id: request.id, sender: e.sender, proc: null, cancelled: false, tail: '', stderr: '',
      started: performance.now(), startedAt: new Date().toISOString(), sample: request.sample === true };
    ownJob(s);
    try {
      const c = config();
      const profile = request.profile ?? c.profile;
      const concurrency = request.concurrency ?? c.concurrency;
      const timingMode = request.timingMode ?? c.timingMode;
      const verification = request.verification ?? c.verification;
      if (!['fast','balanced','detailed'].includes(verification)) throw new Error('Invalid verification profile.');
      const forceGroups = request.forceGroups ?? [];
      if (!Array.isArray(forceGroups) || forceGroups.length > 1 || forceGroups.some(key => typeof key !== 'string' || key.length > 2000 || !/^\d+(?:,\d+)*$/.test(key))) throw new Error('Invalid group key.');
      if(request.keepEngine!==undefined&&typeof request.keepEngine!=='boolean')throw Error('Invalid engine keep-ready option.');
      c.keepEngine=request.keepEngine??c.keepEngine;
      c.verification = verification; c.autoFit = request.autoFit ?? c.autoFit;
      c.naturalSpeech = request.naturalSpeech ?? c.naturalSpeech;
      if (typeof c.naturalSpeech !== 'boolean') throw new Error('Invalid speech editing option.');
      if (typeof c.autoFit !== 'boolean') throw new Error('Invalid duration editing option.');
      if (!['clip','video'].includes(timingMode)) throw new Error('Geçersiz zamanlama modu.');
      if (!['fast', 'quality'].includes(profile) || ![4, 8].includes(concurrency)) throw new Error('Geçersiz ses üretim profili.');
      c.profile = profile; c.concurrency = concurrency; c.timingMode = timingMode;
      if (request.grouping !== undefined && !['akici', 'cumle', 'satir'].includes(request.grouping)) throw new Error('Dublaj planını yeniden hazırlayın.');
      c.grouping = request.grouping ?? c.grouping;
      c.expression = request.expression ?? c.expression;
      if (!['reference','calm','warm','lively'].includes(c.expression)) throw new Error('Invalid expression profile.');
      c.followDelivery = request.followDelivery ?? c.followDelivery;
      c.deliveryStrength = request.deliveryStrength ?? c.deliveryStrength;
      if (typeof c.followDelivery !== 'boolean' || !['gentle','balanced','strong'].includes(c.deliveryStrength)) throw new Error('Invalid delivery option.');
      s.settings = { profile, steps: profile === 'fast' ? 10 : 15, concurrency, maxSpeed: timingMode === 'video' ? 1 : 1.25 };
      Object.assign(s.settings, { verification, autoFit:c.autoFit, naturalSpeech:c.naturalSpeech });
      s.settings.grouping = c.grouping;
      s.settings.expression = c.expression;
      s.settings.followDelivery = c.followDelivery; s.settings.deliveryStrength = c.deliveryStrength;
      s.range = rangeOption(request.range); s.settings.range = s.range; s.settings.timingMode = timingMode;
      const python = path.join(c.engine, '.venv', 'Scripts', 'python.exe');
      const script = path.join(__dirname,'..','tools','voxcpm2','altyazi_oku.py');
      for (const file of [python, script, path.join(c.engine,'kitap_ortak.py'), c.reference, c.transcript]) {
        if (!fs.existsSync(file)) throw new Error('VoxCPM2 motoru veya ses referansı bulunamadı.');
      }
      const srt = await authorizeSubtitle(request.srt);
      if (path.extname(srt).toLowerCase() !== '.srt') throw new Error('Bir SRT altyazı dosyası seçin.');
      if (fs.statSync(srt).size > 2000000) throw new Error('SRT çok büyük.');
      const sourceBytes = fs.readFileSync(srt);
      if (sourceBytes.length > 2000000) throw new Error('SRT çok büyük.');
      const prepared = plans.get(e.sender.id);
      if (prepared?.srt === srt && JSON.stringify(prepared.range) === JSON.stringify(s.range)
          && prepared.sourceHash !== require('node:crypto').createHash('sha256').update(sourceBytes).digest('hex')) {
        throw new Error('SRT değişti; dublaj planını yeniden hazırlayın.');
      }
      if (s.cancelled) { job = null; finish(s, 'cancelled'); return { ok: false, error: 'İptal edildi.' }; }
      const outputDir = voiceStorage(app).output;
      fs.mkdirSync(outputDir, { recursive: true });
      const output = path.join(outputDir, `${s.id}.wav`);
      claimArtifacts(s, [output, output.replace(/\.wav$/i, '.sync.json'), output.replace(/\.wav$/i, '.quality.json'),
        output.replace(/\.wav$/i, '.tmp.wav'), output.replace(/\.wav$/i, '.partial.wav'), output.replace(/\.wav$/i, '.performance.json')]);
      atomicWriteFileSync(configPath(), JSON.stringify(c, null, 2), { encoding: 'utf8' });
      const logDir = path.join(app.getPath('userData'), 'dub-logs');
      try {
        fs.mkdirSync(logDir, { recursive: true });
        const logBase = `${s.id}-${Date.now()}`;
        s.logPath = path.join(logDir, `${logBase}.ndjson`);
        s.summaryPath = path.join(logDir, `${logBase}.json`);
        fs.writeFileSync(s.summaryPath, JSON.stringify({ id: s.id, startedAt: s.startedAt,
          result: 'running', sample: s.sample }, null, 2), 'utf8');
      } catch (error) { s.logError = error.message; }
      const inputDir = path.join(voiceStorage(app).input, s.id);
      fs.mkdirSync(inputDir, { recursive: true });
      const inputSrt = path.join(inputDir, path.basename(srt));
      if (fs.existsSync(inputSrt)) {
        if (fs.realpathSync(inputSrt) !== path.resolve(inputSrt) || !fs.readFileSync(inputSrt).equals(sourceBytes)) throw new Error('Bu işin girdi dosyası değişmiş.');
      } else fs.writeFileSync(inputSrt, sourceBytes, { flag: 'wx' });
      const args = [script, inputSrt, c.reference, '--transcript', c.transcript, '--mode', 'hifi',
        '--expression', c.followDelivery ? 'reference' : c.expression,
        '--gruplama', c.grouping, '--grup-max-karakter', c.grouping === 'akici' ? '280' : '250',
        '--grup-max-sn', c.grouping === 'akici' ? '18' : '12', '--tasarsa', 'kirp', '--max-hiz', String(s.settings.maxSpeed),
        '--bosluk-pay-ms', '2000', '--erken-pay-ms', '300',
        '--steps', String(s.settings.steps), '--eszamanli', String(concurrency), '--output', output];
      args.push('--timing-mode', timingMode);
      if(request.narration===true)args.push('--narration');
      args.push('--verification', verification, '--verify-python', path.join(__dirname, '..', 'backend', 'venv', 'Scripts', 'python.exe'));
      if (forceGroups.length) args.push('--force-groups', forceGroups.join(';'));
      if (request.sample === true) args.push('--limit', '11', '--representative-preview');
      const rewriteDir = path.join(inputDir, 'duration-edits');
      if ((c.autoFit || c.naturalSpeech) && typeof shorten === 'function') {
        fs.mkdirSync(rewriteDir, {recursive:true});
        args.push('--rewrite-dir', rewriteDir);
        args.push('--editor-identity', String(editorIdentity()).slice(0,128));
        if (c.autoFit) args.push('--auto-fit');
        if (c.naturalSpeech) args.push('--natural-speech');
      }
      if (s.range) args.push('--range-start', String(s.range.start), '--range-end', String(s.range.end));
      if (request.dubText) {
        const plan = plans.get(e.sender.id);
        if (!plan || plan.srt !== srt || plan.grouping !== c.grouping || request.dubText.sourceHash !== plan.sourceHash || JSON.stringify(plan.range) !== JSON.stringify(s.range)) throw new Error('Dublaj planını yeniden hazırlayın.');
        const edits = request.dubText.edits;
        if (!edits || typeof edits !== 'object' || Array.isArray(edits)) throw new Error('Geçersiz dublaj metni.');
        const keys = new Set(plan.groups.map(g => g.key));
        for (const [key, text] of Object.entries(edits)) {
          if (!keys.has(key) || typeof text !== 'string' || !text.trim() || text.length > 1000) throw new Error('Geçersiz dublaj metni.');
        }
        const textPath = path.join(outputDir, `${s.id}-dub-text.json`);
        claimArtifacts(s, [textPath]);
        fs.writeFileSync(textPath, JSON.stringify({ sourceHash: plan.sourceHash, edits }, null, 2), { encoding: 'utf8', flag: 'wx' });
        args.push('--dub-text', textPath);
        s.settings.reviewedText = true;
      }
      if (c.followDelivery) {
        const file = path.join(outputDir,`${s.id}-delivery.json`);
        const files = [file,file.replace(/\.json$/,'.partial.json')];
        claimArtifacts(s,files);
        try {
          if (typeof prepareProsody !== 'function') throw new Error('Source delivery unavailable');
          emit(s,'status',{text:'Özgün konuşmanın anlatımı analiz ediliyor…'});
          await prepareProsody({request,srt:inputSrt,range:s.range,sample:s.sample,grouping:c.grouping,
            strength:c.deliveryStrength,output:file,onProcess:proc=>{s.proc=proc;},isCancelled:()=>s.cancelled,
            status:progress=>emit(s,'status',{text:progress==='stop_failed'
              ? 'Analiz durdurulamadı; Durdur düğmesiyle tekrar deneyin.' : `Özgün anlatım analiz ediliyor · ${progress}`})});
          if (s.cancelled) throw new Error('Cancelled');
          if (fs.statSync(file).size > 2_000_000) throw new Error('Delivery map too large');
          const delivery = JSON.parse(fs.readFileSync(file,'utf8'));
          if (!Array.isArray(delivery.groups)) throw new Error('Invalid delivery map');
          s.settings.deliveryAnalyzed = delivery.groups.length;
          s.settings.deliveryApplied = delivery.groups.filter(row=>row.delivery).length;
          if (!s.settings.deliveryApplied) emit(s,'warning',{text:'Özgün seste güvenilir anlatım bulunamadı; ek yönlendirme uygulanmıyor.'});
          args.push('--prosody-plan',file); s.settings.deliveryReport=path.basename(file);
        } catch (error) {
          if (s.cancelled) throw error;
          cleanupArtifacts(s,files); s.settings.deliveryFallback=true;
          emit(s,'warning',{text:'Özgün anlatım analiz edilemedi; referansın doğal tonuyla devam ediliyor.'});
          if (error.code==='MULTIPLE_AUDIO_TRACKS') emit(s,'warning',{text:'Videoda birden fazla ses dili var. Doğru konuşmayı analiz etmek için yerel analiz sesini seçin.'});
        }
      }
      let background = null;
      if (request.keepBackground === true && !s.sample) {
        try {
          if (typeof prepareBackground !== 'function') throw new Error('Arka plan ayırma kullanılamıyor.');
          const file = path.join(outputDir,`${s.id}-background.wav`);
          const backgroundFiles = [file, file.replace(/\.wav$/i, '.partial.wav')];
          claimArtifacts(s, backgroundFiles);
          s.backgroundFiles = backgroundFiles;
          await prepareBackground({request,srt:inputSrt,range:s.range,limit:s.sample ? 11 : 0,output:file,
            onProcess:proc=>{s.proc=proc;},isCancelled:()=>s.cancelled,
            status:stage=>{
              if (stage === 'separate_gpu' || stage === 'separate_cpu') s.settings.backgroundDevice = stage.slice(9);
              const text = stage === 'download' ? 'Video sesi indiriliyor…'
                : stage === 'separate_gpu' ? 'Müzik ve ortam sesi ayrılıyor · GPU (CUDA)…'
                  : stage === 'separate_cpu' ? 'Müzik ve ortam sesi ayrılıyor · CPU…' : 'Müzik ve ortam sesi ayrılıyor…';
              emit(s,'status',{text});
            }});
          if (s.cancelled) throw new Error('İptal edildi.');
          grantMedia(file); background={path:file,url:pathToFileURL(file).href}; s.settings.keepBackground=true;
        } catch (error) {
          if (s.cancelled) throw error;
          cleanupArtifacts(s, s.backgroundFiles || []);
          s.proc=null; s.settings.backgroundError=String(error.message).slice(0,600);
          emit(s,'warning',{text:'Arka plan ayırma başarısız; yalnız dublaj üretilecek.'});
        }
      }
      emit(s, 'status', { text: 'Motor yükleniyor…' });
      const env = voiceEnvironment(c.engine);
      // Flush output and report native crashes in this process and spawned GPU workers.
      env.PYTHONUNBUFFERED = '1'; env.PYTHONFAULTHANDLER = '1';
      s.proc = c.keepEngine ? await warmEngine.start(python,args,{cwd:c.engine,env,windowsHide:true}) : (await warmEngine.release(),spawn(python,args,{cwd:c.engine,env,windowsHide:true}));
      let pending = '';
      const rewriteRequests = new Set();
      function line(value) {
        if(value.startsWith('DUB_FAILURE ')){try{const failure=JSON.parse(value.slice(12));emit(s,'warning',{text:String(failure.message||failure.kind).slice(0,1500)});}catch(_){}return;}
        if(value.startsWith('DUB_STAGE ')||value.startsWith('DUB_PHASES ')){
          try{const raw=JSON.parse(value.slice(value.startsWith('DUB_STAGE ')?10:11));const phases=raw.stage?{[raw.stage+'_seconds']:raw.seconds}:raw;const allowed=['model_load','reference','synthesis','verification','text_edit','placement','file_write','wall'].map(key=>key+'_seconds');s.phases={...(s.phases||{}),...Object.fromEntries(Object.entries(phases).filter(([key,n])=>allowed.includes(key)&&Number.isFinite(n)&&n>=0))};emit(s,'phases',{phases:s.phases});}catch(_){}return;
        }
        if(value.startsWith('DUB_ENGINE ')||value.startsWith('DUB_REFERENCE_CACHE ')||value.startsWith('DUB_CAPACITY ')){
          try{const data=JSON.parse(value.slice(value.indexOf(' ')+1));emit(s,'engine',{kind:value.split(' ')[0],...data});}catch(_){}return;
        }
        s.tail = (s.tail + '\n' + value).slice(-6000);
        // Evidence for recovering a file, never proof of acoustic quality.
        if (value.startsWith('Tamamlandi: ') && path.resolve(value.slice(12).trim()) === path.resolve(output)) s.completedMarker = true;
        if (value.startsWith('DUB_REWRITE ') && (c.autoFit || c.naturalSpeech) && typeof shorten === 'function') {
          try {
            const r = JSON.parse(value.slice(12));
            if (!/^[a-f0-9]{32}$/.test(r.id) || rewriteRequests.has(r.id) || rewriteRequests.size >= 10000 ||
                typeof r.text !== 'string' || r.text.length > 8000 || !Number.isFinite(r.seconds) || r.seconds <= 0 || r.seconds > 35) return;
            if ((r.mode === 'natural' && !c.naturalSpeech) || (r.mode !== 'natural' && !c.autoFit)) return;
            rewriteRequests.add(r.id);
            // Independent response files prevent concurrent groups exchanging
            // replies. Never let a cancelled job write a late response.
            void Promise.resolve().then(() => s.editorUnavailable ? r.text : shorten(r.text, r.seconds, {
              mode:r.mode === 'natural' ? 'natural' : 'fit',
              measured:Number.isFinite(r.measured) && r.measured > 0 && r.measured <= 600 ? r.measured : null,
              before:typeof r.before === 'string' ? r.before.slice(-1500) : '',
              after:typeof r.after === 'string' ? r.after.slice(0,1500) : ''
            })).then(text => {
              if (job === s && !s.cancelled) atomicWriteFileSync(path.join(rewriteDir, r.id + '.json'), JSON.stringify({text}), {encoding:'utf8'});
            }).catch(error => {
              if(error.code==='DUB_EDITOR_UNAVAILABLE')s.editorUnavailable=true;
              if (job === s && !s.cancelled) {
                try { atomicWriteFileSync(path.join(rewriteDir, r.id + '.json'), '{}', {encoding:'utf8'}); } catch (_) {}
                if(!s.editorWarning){s.editorWarning=true;emit(s, 'warning', {text:'AI konuşma düzenlemesi kullanılamadı; özgün metin korunuyor.'});}
              }
            });
          } catch (_) {}
          return;
        }
        if (value.startsWith('DUB_GROUP ')) {
          try { const row = JSON.parse(value.slice(10));
            if (Number.isInteger(row.group) && row.group > 0 && row.group <= 5000 && typeof row.key === 'string'
                && ['ready','review','failed'].includes(row.status)) emit(s, 'group', {group:row});
          } catch (_) {}
        }
        if (value.startsWith('DUB_CONCURRENCY ')) {
          const parallel = Number(value.slice(16));
          if ([1,2,4,8].includes(parallel)) { s.settings.concurrency = parallel; emit(s, 'concurrency', {concurrency:parallel}); }
        }
        if (value.startsWith('DUB_REFERENCE ')) {
          try { emit(s, 'reference_quality', {quality:JSON.parse(value.slice(14))}); } catch (_) {}
        }
        if (value === 'DUB_WARNING verification_unavailable') emit(s, 'warning', {text:'Konuşma doğrulaması kullanılamadı; ses hazır olduğunda dinleyerek kontrol edin.'});
        if (value === 'DUB_WARNING engine_restart') emit(s, 'status', {
          text: 'Ses motoru yanıt vermedi; tamamlanan parçalar korunarak yeniden başlatılıyor…' });
        if (value === 'DUB_WARNING tempo_fallback') emit(s, 'warning', {
          text: 'Ses hızlandırılamadı; konuşma kesilmeden korundu. Video daha yavaş oynatılabilir.' });
        if (value === 'DUB_WARNING incomplete_audio') emit(s, 'warning', {
          text: 'Tamamlanan sesler kurtarıldı; üretilemeyen bölümler kalite raporunda işaretlendi.' });
        if (value === 'DUB_WARNING server_shutdown_timeout') emit(s, 'warning', {
          text: 'Ses motorunun kapanışı zaman aşımına uğradı; çalışan süreçler denetlendi.' });
        if (value === 'DUB_WARNING sample_edits_unused') emit(s, 'warning', {
          text: 'Kısa örnekte bazı metin düzenlemeleri uygulanmadı; hepsini duymak için tam üretim yapın.' });
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
      s.proc.stdout.on('data', text => { s.stdout = ((s.stdout || '') + text).slice(-6000); pending = (pending + text).slice(-131072); const lines = pending.split(/\r?\n/); pending = lines.pop(); lines.forEach(line); });
      s.proc.stderr.on('data', text => { s.stderr = (s.stderr + text).slice(-6000); s.tail = (s.tail + text).slice(-6000); });
      s.proc.on('error', error => { s.spawnError = error.message; });
      s.proc.on('close', (code, signal) => {
        s.exitCode = code;
        s.exitSignal = signal;
        if (pending) line(pending);
        if (job === s) job = null;
        if (s.cancelled) { finish(s, 'cancelled'); return; }
        // Recover completed media after a non-zero exit, but keep the error
        // diagnosis and prevent automatic attachment / successful latest reuse.
        const finishedBeforeExitFailure = code !== 0 && s.completedMarker === true;
        if ((code === 0 || finishedBeforeExitFailure) && validVoiceOutput(output)) {
          let sync = null;
          if (timingMode === 'video' && request.narration !== true) {
            try {
              const syncFile = output.replace(/\.wav$/i, '.sync.json');
              if (fs.statSync(syncFile).size > 2000000) throw new Error('map too large');
              sync = validateSync(JSON.parse(fs.readFileSync(syncFile, 'utf8')));
              if (!sync) throw new Error('missing map');
            } catch (_) {
              // The WAV can still be recovered manually if only its sync map
              // failed validation. Do not discard successfully generated audio.
              s.ownedArtifacts?.delete(output);
              grantMedia(output);
              finish(s, 'error', { error: 'Ses üretildi ancak dublaj zaman haritası okunamadı.', recoverablePath: output,
                recoverableUrl: pathToFileURL(output).href, name: path.basename(output) }); return;
            }
          }
          grantMedia(output);
          let quality = null;
          try {
            const qualityPath = output.replace(/\.wav$/i, '.quality.json');
            if (fs.statSync(qualityPath).size <= 16000000) {
              const raw = JSON.parse(fs.readFileSync(qualityPath, 'utf8'));
              if (raw.version === 1 && Array.isArray(raw.groups) && raw.groups.length && raw.groups.length <= 5000) {
                const checked = validateGroups(raw.groups);
                quality = {...raw, groups: raw.groups.map((row, i) => ({...row, ...checked[i]}))};
              }
            }
          } catch (_) {}
          const noSpeechProduced = quality?.groups?.length > 0 && quality.groups.every(row => row.status === 'failed');
          if (finishedBeforeExitFailure || noSpeechProduced) {
            s.settings.engineExitCode = code ?? null;
            for (const file of [output, output.replace(/\.wav$/i, '.sync.json'), output.replace(/\.wav$/i, '.quality.json')]) {
              s.ownedArtifacts?.delete(file);
            }
            finish(s, 'error', {
              error: noSpeechProduced ? 'Hiçbir konuşma parçası üretilemedi; tanı dosyası korundu. Üretim kaydını kontrol edip yeniden deneyin.'
                : 'Ses dosyası kurtarıldı; motor hata verdi. Kullanmadan önce dinleyin.',
              recoverablePath: output, recoverableUrl: pathToFileURL(output).href, name: path.basename(output),
              diagnostics: processFailure(s.stderr, s.tail), qualityUnavailable: true,
            });
            return;
          }
          finish(s, 'done', { path: output, url: pathToFileURL(output).href, settings:s.settings, qualityUnavailable: !quality?.groups?.length,
            subtitle: inputSrt, name: path.basename(srt, '.srt') + (s.range ? `-${s.range.start}-${s.range.end}s` : '') + '-dublaj.wav', timing: s.timing || null, range: s.sample ? null : s.range, sync, background, quality, sample:s.sample });
        } else {
          // Python reports the real cause on stderr: a traceback line such as
          // "TypeError: ..." or the plain message of a SystemExit. Show that
          // instead of the generic notice whenever stderr has something useful.
          const details = processFailure(s.stderr, s.tail);
          finish(s, 'error', { error: s.spawnError || details || `Ses üretimi başarısız oldu. (exit=${code ?? 'null'}, signal=${signal || 'none'})` });
        }
      });
      return { ok: true, id: s.id };
    } catch (error) { if (job === s) job = null; finish(s, s.cancelled ? 'cancelled' : 'error', { error: error.message }); throw error; }
  }));
  async function cancel() {
    const s = job;
    if (!s) return { ok: true };
    if (s.cancelPromise) return s.cancelPromise;
    s.cancelled = true;
    const proc = s.proc;
    // UI cancellation and app shutdown can overlap. Share one attempt so a
    // second termination failure cannot reset the first request's cancel flag.
    s.cancelPromise = Promise.resolve().then(async () => {
      if (proc) {
        const stopped = await terminate(proc);
        if (stopped === false) throw new Error('İptal isteği tamamlanamadı.');
      }
      return { ok: true };
    }).catch(error => {
      s.cancelled = false;
      s.cancelPromise = null; // A failed stop remains retryable.
      throw error;
    });
    return s.cancelPromise;
  }
  ipcMain.handle('dub:cancel', guard(cancel));
  let quitting = false;
  app.on('before-quit', event => {
    if (!job) { if(warmEngine.running()){event?.preventDefault?.();if(quitting)return;quitting=true;void warmEngine.release().then(()=>{quitting=false;app.quit?.();}).catch(()=>{quitting=false;});}return; }
    event?.preventDefault?.();
    if (quitting) return;
    quitting = true;
    const finishQuit = () => { if (job) { setTimeout(finishQuit, 50).unref?.(); return; } void warmEngine.release().then(()=>{quitting=false;app.quit?.();}).catch(()=>{quitting=false;}); };
    void cancel().then(finishQuit).catch(() => {
      quitting = false;
      if (job) emit(job, 'warning', { text: 'Üretim durdurulamadı; pencere açık kaldı. Durdur düğmesiyle tekrar deneyin.' });
    });
  });
  return { running: () => !!job || !!textUI || releasingEngine, cancel, releaseIdle:async()=>{if(job||textUI||releasingEngine)throw Error('Voice generation is active.');releasingEngine=true;try{return await warmEngine.release();}finally{releasingEngine=false;}} };
}
module.exports = { registerDubService };
