'use strict';
const fs = require('node:fs');
const path = require('node:path');
const {randomBytes,createHmac,createHash}=require('node:crypto');
const { pathToFileURL } = require('node:url');
const { voiceStorage, prepareVoiceStorage } = require('./voice-storage');
const { performance } = require('node:perf_hooks');
const { validate: validateSync } = require('./renderer/dub-sync-map');
const { groups: validateGroups } = require('./renderer/dub-workspace-model');
const { atomicWriteFileSync } = require('./fsync-utils');
const { validVoiceOutput, inspectVoiceOutput,voiceOutputIdentity,matchesVoiceOutput,matchesVoiceOutputAsync } = require('./voice-output');
const {normalize: normalizePronunciations} = require('./dub-pronunciation');
const {identity: sourceIdentity} = require('./dub-source-identity');
const {createRunLedger} = require('./dub-run-ledger');

function registerDubService({ app, ipcMain, dialog, owner, authorized, authorizeSubtitle,
  spawn, terminate, busy, grantMedia, environment, shorten, translateGroup, resolveSourceContext, editorIdentity = () => '', setRate, prepareBackground, prepareProsody, prepareReference, onOutput = output => output, observeJob = () => {}, sourceLocators = null }) {
  let job = null, releasingEngine=false,restoringOutput=false,pendingOutputRestore=null;
  // One persistent record per run (dub-logs/<id>-<ts>.json) plus an instance lease; see dub-run-ledger.js.
  const instanceId = randomBytes(12).toString('hex');
  let ledgerInstance = null;
  const runLedger = () => ledgerInstance || (ledgerInstance = createRunLedger({ logsDir: path.join(app.getPath('userData'), 'dub-logs'),
    outputDir: voiceStorage(app).output, inputDir: voiceStorage(app).input, instanceId }));
  // Main-derived, versioned source locators (see dub-source-locator.js). Without a configured Podcast store nothing is pinned.
  const locators = sourceLocators || require('./dub-source-locator').createSourceLocator({});
  const referenceSelectionSecret=randomBytes(32);
  const groupTakes=require('./dub-group-takes').createGroupTakes({app,grantMedia});
  const pronunciationStore=()=>require('./dub-pronunciation-store').createStore(path.join(app.getPath('userData'),'dub-source-pronunciations.json'));
  function pronunciationScope(source,bytes){const media=sourceIdentity(source);return media?'media-'+media:'subtitle-'+require('node:crypto').createHash('sha256').update(bytes).digest('hex');}
  const warmEngine=require('./dub-engine-worker').createDubEngineWorker({spawn,terminate});
  require('./dub-playback-assets').registerDubPlaybackAssets({ app, ipcMain, dialog, owner, authorized, grantMedia });
  let textUI = null;
  const plans = new Map();
  const referenceRecipes = new Map();
  const rehearsals=new Map();
  const positionPlans = new Map();
  const continuations = new Map();
  const continuationSenders = new WeakSet();
  const staleReferenceRecipe=()=>Error('The saved voice recipe reference changed or expired. Restore its original unchanged reference or start a new full generation. / Kayıtlı ses tarifinin referansı değişti veya süresi doldu. Özgün değişmemiş referansı geri seçin ya da yeni tam üretim başlatın.');
  function referenceFingerprint(c) {
    const hash = require('node:crypto').createHash('sha256');
    hash.update(JSON.stringify([c.engine, fs.realpathSync(c.reference), fs.realpathSync(c.transcript)]));
    for (const file of [c.reference, c.transcript]) {
      const fd = fs.openSync(file, 'r');
      try {
        const before = fs.fstatSync(fd), bytes = Buffer.allocUnsafe(65536);
        if (!before.isFile()) throw staleReferenceRecipe();
        const digest = require('node:crypto').createHash('sha256');
        let position = 0;
        while (position < before.size) {
          const count = fs.readSync(fd, bytes, 0, Math.min(bytes.length, before.size - position), position);
          if (!count) throw staleReferenceRecipe();
          digest.update(bytes.subarray(0, count)); position += count;
        }
        const after = fs.fstatSync(fd);
        if (before.size !== after.size || before.mtimeMs !== after.mtimeMs || before.ctimeMs !== after.ctimeMs) throw staleReferenceRecipe();
        hash.update(digest.digest());
      } finally { fs.closeSync(fd); }
    }
    return hash.digest('hex');
  }
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
    let pronunciations=[]; try { pronunciations=normalizePronunciations(saved.pronunciations || []); } catch (_) {}
    return { pronunciations, keepEngine:saved.keepEngine !== false, engine, reference: savedPath('reference') || path.join(engine, 'anlatici_ham.wav'),
      transcript: savedPath('transcript') || path.join(engine, 'anlatici_ham.txt'),
      verification: ['fast','balanced','detailed'].includes(saved.verification) ? saved.verification : 'balanced',
      autoFit: saved.autoFit !== false, naturalSpeech: saved.naturalSpeech !== false,
      resultMode: saved.resultMode === 'custom' ? 'custom' : 'natural',
      timingMode: saved.timingMode === 'clip' ? 'clip' : 'video',
      expression: ['calm','warm','lively'].includes(saved.expression) ? saved.expression : 'reference',
      followDelivery: saved.followDelivery === true,
      deliveryStrength: ['gentle','strong'].includes(saved.deliveryStrength) ? saved.deliveryStrength : 'balanced',
      grouping: ['akici', 'anlatim', 'cumle', 'satir'].includes(saved.grouping) ? saved.grouping : 'akici',
      profile: saved.profile === 'fast' ? 'fast' : 'quality', concurrency: saved.concurrency === 8 ? 8 : 4 };
  }
  function emit(s, type, data = {}) {
    const record = { time: new Date().toISOString(), type, elapsedSeconds: (performance.now() - s.started) / 1000, ...data };
    if (s.logPath && !s.logError) {
      try { fs.appendFileSync(s.logPath, JSON.stringify(record) + '\n', 'utf8'); }
      catch (error) { s.logError = error.message; }
    }
    observeJob(s,{type,...data});
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
    observeJob(s,{type:'start'},()=>job===s?cancel():Promise.resolve({ok:false}));
    s.onDestroyed = () => { if (job === s) void cancel().catch(() => {}); };
    s.sender.once?.('destroyed', s.onDestroyed);
  }
  function finish(s, type, data = {}) {
    // A late or repeated terminal event must not rewrite a finished run or clean up another run's files.
    if (s.finished) return;
    if(type==='done'&&s.integrity){data={...data,integrity:s.integrity};if(s.sample){rehearsals.set(s.sender.id+':'+s.id,s.integrity);while(rehearsals.size>30)rehearsals.delete(rehearsals.keys().next().value);}}
    s.finished = true;
    if (s.continuationRecipe && ['error','cancelled'].includes(type)) {
      s.continuationRecipe.interrupted = true;
      data = {...data, canResume:true};
    }
    if (s.heartbeat) { clearInterval(s.heartbeat); s.heartbeat = null; }
    s.sender.removeListener?.('destroyed', s.onDestroyed);
    if (type === 'error' || type === 'cancelled') cleanupArtifacts(s);
    const summary = { id: s.id, startedAt: s.startedAt, finishedAt: new Date().toISOString(),
      elapsedSeconds: (performance.now() - s.started) / 1000, result: type,
      phases:s.phases||{}, progress: s.progress || null, sample: s.sample, exitCode: s.exitCode ?? null,
      exitSignal: s.exitSignal || null,
      cleanupErrors: s.cleanupErrors || [], ...data };
    summary.sourceIdentity = s.sourceIdentity || null;
    summary.subtitleHash = s.subtitleHash || null;
    summary.settings = s.settings || null;
    summary.savedAssets = s.savedAssets || {};
    summary.metrics = s.metrics || null;
    if(type==='done'&&data.path){
      summary.outputIdentity=voiceOutputIdentity(data.path);
      if(!summary.outputIdentity){summary.qualityUnavailable=true;data={...data,qualityUnavailable:true};}
    }
    if (type === 'error') summary.diagnostics = {
      stdoutTail: s.stdout || '', stderrTail: s.stderr || ''
    };
    if (s.summaryPath) {
      try { runLedger().settle(s.summaryPath, summary); }
      catch (error) { s.logError = error.message; }
    }
    if (s.ledgerRun) runLedger().end(s.id);
    if (type === 'done' && data.path && s.settings?.kind !== 'text') onOutput({...data,id:s.id});
    emit(s, type, { ...data, elapsedSeconds: summary.elapsedSeconds,
      metrics:s.metrics || null, logPath: s.summaryPath || null, logError: s.logError || null });
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
    return { folder, reference: path.join(folder, 'reference.wav'), transcript: path.join(folder, 'reference.txt'), metadata: path.join(folder, 'reference.json'), baseline: path.join(folder,'reference-asr.json') };
  }
  function referenceEntry(id) {
    const p = referencePaths(id);
    for (const file of [p.reference, p.transcript, p.metadata]) {
      if (!fs.statSync(file).isFile() || fs.realpathSync(file) !== path.resolve(file)) throw new Error('Invalid reference file.');
    }
    if (fs.statSync(p.transcript).size > 32000 || fs.statSync(p.metadata).size > 4000) throw new Error('Invalid reference metadata.');
    const audio = inspectVoiceOutput(p.reference);
    if (!audio) throw new Error('Invalid reference audio.');
    const meta = JSON.parse(fs.readFileSync(p.metadata, 'utf8'));
    grantMedia(p.reference);
    return { id, name: String(meta.name || id).slice(0, 160), createdAt: String(meta.createdAt || ''), path: p.reference,
      url: pathToFileURL(p.reference).href, text: fs.readFileSync(p.transcript, 'utf8'), folder: p.folder,
      audio: {channels:audio.channels,sampleRate:audio.sampleRate,bits:audio.bits,seconds:audio.seconds},
      quality: meta.quality || null, transcriptBaseline: require('./voice-reference-baseline').read(p.reference,p.baseline) };
  }
  function referenceSelectionToken(entry) {
    const c=config(),p=referencePaths(entry.id),audio=fs.statSync(p.reference);
    // A process-private keyed token binds the current default and exact saved audio/text.
    return createHmac('sha256',referenceSelectionSecret).update(JSON.stringify([c.engine,c.reference,c.transcript,entry.id,entry.name,entry.createdAt,entry.text,audio.size,audio.mtimeMs,audio.ctimeMs])).digest('hex');
  }
  ipcMain.handle('dub:references', guard(async () => {
    fs.mkdirSync(referencesRoot(), { recursive: true });
    const references = [];
    for (const id of fs.readdirSync(referencesRoot()).sort().reverse()) {
      try { const entry=referenceEntry(id);references.push({...entry,selectionToken:referenceSelectionToken(entry)}); } catch (_) {}

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
  function importReference({ reference, text, name }) {
    const label = referenceName(name);
    if (typeof text !== 'string' || text.length > 8000 || text.includes('\0')) throw new Error('Check the reference transcript.');
    const stat = fs.statSync(reference);
    if (stat.size > 64 * 1024 * 1024 || !validVoiceOutput(reference)) throw new Error('Select a valid WAV reference under 64 MB.');
    const p = referencePaths(require('node:crypto').randomUUID());
    fs.mkdirSync(p.folder);
    try {
      // Metadata publishes the entry last. Never move or rewrite the selected source.
      fs.copyFileSync(reference, p.reference, fs.constants.COPYFILE_EXCL);
      atomicWriteFileSync(p.transcript, text.trim(), { encoding: 'utf8' });
      atomicWriteFileSync(p.metadata, JSON.stringify({ name: label, createdAt: new Date().toISOString(), source: 'local-copy' }), { encoding: 'utf8' });
      return referenceEntry(path.basename(p.folder));
    } catch (error) {
      for (const file of [p.reference, p.transcript, p.metadata]) fs.rmSync(file, { force: true });
      fs.rmdirSync(p.folder);
      throw error;
    }
  }
  ipcMain.handle('dub:referenceRename', guard(async (_e, request = {}) => {
    if (job || textUI || releasingEngine || restoringOutput || busy()) throw new Error('Wait for the current job to finish.');
    const name = referenceName(request.name), entry = referenceEntry(request.id), p = referencePaths(entry.id);
    const meta = JSON.parse(fs.readFileSync(p.metadata, 'utf8'));
    atomicWriteFileSync(p.metadata, JSON.stringify({ ...meta, name }), { encoding: 'utf8' });
    return { ok: true, name };
  }));
  ipcMain.handle('dub:referenceUse', guard(async (_e, request = {}) => {
    if (job || textUI || releasingEngine || restoringOutput || busy()) throw new Error('Wait for the current job to finish.');
    const entry = referenceEntry(request.id);
    const text = typeof request.text === 'string' ? request.text.trim() : entry.text.trim();
    if (!text || text.length > 8000) throw new Error('Check the reference transcript.');
    const p = referencePaths(request.id), c = config();
    if (Object.hasOwn(request,'expectedSelection') && (typeof request.expectedSelection!=='string'||request.expectedSelection!==referenceSelectionToken(entry))) return {ok:false,stale:true,error:'Voice selection changed; refresh and review.'};
    atomicWriteFileSync(p.transcript, text, { encoding: 'utf8' });
    c.reference = p.reference; c.transcript = p.transcript;
    atomicWriteFileSync(configPath(), JSON.stringify(c, null, 2), { encoding: 'utf8' });
    return { ok: true, transcriptBaseline: entry.transcriptBaseline };
  }));
  ipcMain.handle('dub:referencePrepare', guard(async (e, request = {}) => {
    if (job || textUI || releasingEngine || restoringOutput || busy()) throw new Error('Wait for the current job to finish.');
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
      claimArtifacts(s, [p.reference, p.transcript, p.metadata, p.baseline, path.join(p.folder, 'reference-quality.json'), p.reference.replace(/\.wav$/i, '.partial.wav'), `${p.reference}.partial`]);
      s.logPath = path.join(p.folder, 'events.ndjson'); s.summaryPath = path.join(p.folder, 'job.json');
      await prepareReference({ request, ...p, ...range, onProcess: proc => { s.proc = proc; },
        isCancelled: () => s.cancelled, status: stage => emit(s, 'reference_status', { stage }) });
      if (s.cancelled) throw new Error('Cancelled.');
      const text = fs.readFileSync(p.transcript, 'utf8').trim();
      if (!text || text.length > 8000 || !validVoiceOutput(p.reference)) throw new Error('No reference speech found.');
      require('./voice-reference-baseline').save(p.reference,p.baseline,text);
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
    if (job || textUI || releasingEngine || restoringOutput || busy()) throw new Error('Wait for the current job to finish.');
    const selected = await dialog.showOpenDialog(owner(), { properties: ['openFile'],
      filters: [{ name: 'Audio', extensions: ['wav', 'mp3', 'flac', 'm4a', 'ogg', 'opus', 'aac', 'wma'] }] });
    if (selected.canceled || !selected.filePaths[0]) return { ok: true, cancelled: true };
    if (job || textUI || releasingEngine || restoringOutput || busy()) throw new Error('Wait for the current job to finish.');
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
    const planStore = request.positionSample === true ? positionPlans : plans;
    if(request.compare!==true)planStore.delete(senderId);
    if (!planSenders.has(e.sender) && typeof e.sender.once === 'function') {
      planSenders.add(e.sender);
      e.sender.once('destroyed', () => {
        planning.get(senderId)?.cancel?.();
        planning.delete(senderId); plans.delete(senderId); positionPlans.delete(senderId);
      });
    }
    try {
    const srt = await authorizeSubtitle(request.srt);
    if (planning.get(senderId) !== attempt || e.sender.isDestroyed()) throw new Error('Dublaj planı artık kullanılmıyor.');
    if (path.extname(srt).toLowerCase() !== '.srt' || fs.statSync(srt).size > 4000000) throw new Error('Geçersiz SRT.');
    const c = config();
    const range = rangeOption(request.range);
    const grouping = ['akici', 'anlatim', 'cumle', 'satir'].includes(request.grouping) ? request.grouping : c.grouping;
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
          const decoding=value.sourceDecoding,sourceDecoding=decoding&&['utf-8','utf-16le','utf-16be','utf-32le','utf-32be','cp1254','latin-1'].includes(decoding.encoding)?{encoding:decoding.encoding,repaired:decoding.repaired===true}:null;
          finish(null, { sourceHash: value.sourceHash, groups: value.groups, skipped, sourceDecoding });
        } catch (_) { finish(new Error('Geçersiz dublaj planı.')); }
      });
    });
    if (planning.get(senderId) !== attempt || e.sender.isDestroyed()) throw new Error('Dublaj planı artık kullanılmıyor.');
    if(request.compare!==true)planStore.set(senderId, { srt, range, grouping, ...result });
    return { ok: true, grouping, ...result };
    } finally { if (planning.get(senderId) === attempt) planning.delete(senderId); }
  }));
  ipcMain.handle('dub:shorten', guard(async (e, request) => {
    const plan=plans.get(e.sender.id);
    if(request?.operation!==undefined&&request.operation!=='translate')throw Error('Unknown text operation / Geçersiz metin işlemi.');
    const {text:source,seconds}=require('./dub-editor-request').shorteningInput(plan,request);
    const translating=request?.operation==='translate',edit=translating?translateGroup:shorten;
    if(typeof edit!=='function')throw Error('Voice editor is unavailable / Ses editörü kullanılamıyor.');
    const sourceHash=()=>{const fd=fs.openSync(plan.srt,'r');try{const buffer=Buffer.alloc(4000001);let length=0,count;while(length<buffer.length&&(count=fs.readSync(fd,buffer,length,buffer.length-length,null))>0)length+=count;if(length>4000000)throw Error('SRT changed / SRT değişti.');return require('node:crypto').createHash('sha256').update(buffer.subarray(0,length)).digest('hex');}finally{fs.closeSync(fd);}};
    if(translating&&sourceHash()!==plan.sourceHash)throw Error('Dub plan changed / Dublaj planı değişti.');
    const identity=editorIdentity(),index=plan.groups.findIndex(g=>g.key===request?.key);
    const text=await edit(source,seconds,{before:plan.groups[index-1]?.text||'',after:plan.groups[index+1]?.text||''});
    if(plans.get(e.sender.id)!==plan||e.sender.isDestroyed()||translating&&(sourceHash()!==plan.sourceHash||identity!==editorIdentity()))throw Error('Dub plan changed / Dublaj planı değişti.');
    if(typeof text!=='string'||!text.trim()||text.length>8000)throw Error('Invalid text response / Geçersiz metin yanıtı.');
    return {ok:true,text};
  }));
  require('./text-voice-studio').registerTextVoiceStudio({app,ipcMain,dialog,owner,guard,config,referenceEntry,
    busy:()=>!!job||!!textUI||releasingEngine||restoringOutput||busy(),reserve:ownJob,emit,releaseWarm:()=>warmEngine.release(),
    finish:(session,type,data)=>{try{finish(session,type,data);}finally{if(job===session)job=null;}},
    environment:voiceEnvironment,spawn,grantMedia,claimArtifacts,importReference});
  ipcMain.handle('dub:groupTakes',guard(async(e,request={})=>({ok:true,...await groupTakes.list(e.sender,request.id,request.key)})));
  ipcMain.handle('dub:latest', guard(async (_event, requestedId) => {
    const scoped = requestedId && typeof requestedId === 'object';
    const source = scoped ? sourceIdentity(requestedId.source) : null;
    if (scoped && !source) return {ok:true,output:null};
    let subtitleHash = null, requestedRange;
    if (scoped && requestedId.srt !== undefined) {
      const file = await authorizeSubtitle(requestedId.srt);
      if (path.extname(file).toLowerCase() !== '.srt' || fs.statSync(file).size > 4000000) throw Error('Invalid subtitle for saved voice lookup.');
      const bytes = fs.readFileSync(file);
      if (bytes.length > 4000000) throw Error('Subtitle too large.');
      subtitleHash = require('node:crypto').createHash('sha256').update(bytes).digest('hex');
      requestedRange = rangeOption(requestedId.range);
    }
    if (scoped) requestedId = requestedId.id;
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
        if (source && saved.sourceIdentity !== source) continue;
        // Automatic reuse requires evidence for the exact text and clip. Legacy
        // records remain available through explicit output-id lookup.
        if (subtitleHash && (saved.subtitleHash !== subtitleHash || saved.sample === true
            || JSON.stringify(rangeOption(saved.range)) !== JSON.stringify(requestedRange))) continue;
        const output = path.join(root, `${saved.id}.wav`);
        if (![output, path.join(app.getPath('userData'), 'dub-output', `${saved.id}.wav`)].some(file => path.resolve(file) === path.resolve(saved.path || '')) || !validVoiceOutput(output)) continue;
        if(saved.outputIdentity&&!matchesVoiceOutput(output,saved.outputIdentity))continue;
        grantMedia(output);
        let sync = null, syncInvalid = false;
        try { sync = validateSync(saved.sync); if (saved.settings?.timingMode === 'video' && !sync) syncInvalid = true;
          if(sync&&Math.abs(sync.audioDuration-inspectVoiceOutput(output).seconds)>.05){sync=null;syncInvalid=true;}
        } catch (_) { syncInvalid = true; }
        let quality = null,noSavedSpeech=false;
        try { if(saved.quality?.version===1 && saved.quality.groups?.length){
          const groups=validateGroups(saved.quality.groups),duration=inspectVoiceOutput(output).seconds;
          noSavedSpeech=groups.every(row=>row.status==='failed');
          if(groups.some(row=>row.audioEnd>duration+.05))throw Error('quality range exceeds audio');
          quality={...saved.quality,groups};
        } } catch (_) {}
        if (noSavedSpeech) continue;
        return { ok: true, output: onOutput({ id: saved.id, path: output, url: pathToFileURL(output).href,
          name: saved.name || path.basename(output), elapsedSeconds: saved.elapsedSeconds,
          range: rangeOption(saved.range),
          sync, syncInvalid, quality, qualityIncomplete:saved.qualityIncomplete===true, qualityUnavailable:saved.qualityUnavailable === true || !quality?.groups?.length, sample:saved.sample === true,
          background: saved.background && validVoiceOutput(path.join(root,`${saved.id}-background.wav`))
            ? (()=>{ const file=path.join(root,`${saved.id}-background.wav`);grantMedia(file);return {path:file,url:pathToFileURL(file).href}; })() : null,
          timing: saved.timing, subtitle: saved.subtitle, settings:saved.settings || null, integrity:saved.integrity || null, metrics:saved.metrics || null, logPath: entry.file }) };
      } catch (_) {}
    }
    return { ok: true, output: null };
  }));
  ipcMain.handle('dub:pronunciations', guard(async (_event, entries) => {
    if(entries&&!Array.isArray(entries)&&typeof entries==='object'){
      if(!['get','save'].includes(entries.action))throw Error('Invalid pronunciation action.');
      const srt=await authorizeSubtitle(entries.srt);
      if(path.extname(srt).toLowerCase()!=='.srt'||fs.statSync(srt).size>4000000)throw Error('Choose a valid SRT.');
      const bytes=fs.readFileSync(srt);if(bytes.length>4000000)throw Error('SRT too large.');
      const c=config(),key=pronunciationScope(entries.source,bytes);
      if(entries.action==='get')return {ok:true,...pronunciationStore().resolve(key,c.pronunciations)};
      if(job||textUI||releasingEngine||restoringOutput||busy())throw Error('Finish the active voice job before saving pronunciations.');
      return {ok:true,...pronunciationStore().save(key,entries.entries,c.pronunciations)};
    }
    if (job || textUI || releasingEngine || restoringOutput || busy()) throw new Error('Finish the active voice job before saving pronunciations.');
    const c=config(); c.pronunciations=pronunciationStore().validateGlobal(entries);
    atomicWriteFileSync(configPath(), JSON.stringify(c,null,2), {encoding:'utf8'});
    return {ok:true,pronunciations:c.pronunciations};
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
        if (job || textUI || releasingEngine || restoringOutput || busy()) throw new Error('Üretim sürerken ses ayarları değiştirilemez.');
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
  // `trusted` is supplied only by in-process callers (an approved retry), never by IPC: it carries the stored
  // input copy and the pinned identity so the renderer cannot name a path or an identity.
  async function startGeneration(e, request = {}, trusted = null, resume = null) {
    if(restoringOutput)throw Error('Wait for WAV restoration to finish / WAV geri yüklemesinin bitmesini bekleyin.');
    if (textUI) throw new Error('SRT üretimi için önce metin stüdyosunu kapatın.');
    if (job || releasingEngine || restoringOutput || busy()) throw new Error('Başka bir üretim çalışıyor; bitmesini bekleyin.');
    if (!/^[a-zA-Z0-9-]{1,80}$/.test(request.id || '')) throw new Error('Geçersiz iş kimliği.');
    const sourceDuration=request.narration===true?undefined:request.sourceDuration;
    if(sourceDuration!==undefined&&(typeof sourceDuration!=='number'||!Number.isFinite(sourceDuration)||sourceDuration<=0||sourceDuration>86400))throw Error('Invalid source video duration.');
    const s = { id: request.id, sender: e.sender, proc: null, cancelled: false, tail: '', stderr: '',
      started: performance.now(), startedAt: new Date().toISOString(), sample: request.sample === true };
    ownJob(s);
    try {
      const c = config();
      const defaultReference = { reference: c.reference, transcript: c.transcript };
      const restoredEdit=request.recipeId&&referenceRecipes.get(e.sender.id+':'+request.recipeId);
      const savedAssets=require('./dub-saved-assets').createSavedAssets(voiceStorage(app).output);
      if (request.referenceId) {
        const entry = referenceEntry(request.referenceId);
        if (!entry.text.trim() || entry.text.length > 8000) throw Error('Check the reference transcript.');
        const selected = referencePaths(entry.id);
        c.reference = selected.reference; c.transcript = selected.transcript;
      }
      const profile = request.profile ?? c.profile;
      const concurrency = request.concurrency ?? c.concurrency;
      const timingMode = request.timingMode ?? c.timingMode;
      const verification = request.verification ?? c.verification;
      if (!['fast','balanced','detailed'].includes(verification)) throw new Error('Invalid verification profile.');
      const forceGroups = request.forceGroups ?? [];
      // Both video review and book chapters can retry a bounded selection.
      // Long selections use the existing file transport below, not Windows argv.
      const forceLimit=5000;
      if (!Array.isArray(forceGroups) || forceGroups.length > forceLimit || forceGroups.some(key => typeof key !== 'string' || key.length > 2000 || !/^\d+(?:,\d+)*$/.test(key)) || forceGroups.join(';').length>100000) throw new Error('Invalid group key.');
      const forceAll=request.forceAll===true;
      if ((request.forceAll!==undefined&&typeof request.forceAll!=='boolean') || (forceAll&&(request.narration!==true||forceGroups.length))) throw new Error('Invalid chapter regeneration scope.');
      if(request.keepEngine!==undefined&&typeof request.keepEngine!=='boolean')throw Error('Invalid engine keep-ready option.');
      c.keepEngine=request.keepEngine??c.keepEngine;
      c.verification = verification; c.autoFit = request.autoFit ?? c.autoFit;
      c.naturalSpeech = request.naturalSpeech ?? c.naturalSpeech;
      c.resultMode=request.resultMode??c.resultMode;
      if(!['natural','custom'].includes(c.resultMode))throw Error('Invalid dubbing mode.');
      if (typeof c.naturalSpeech !== 'boolean') throw new Error('Invalid speech editing option.');
      if (typeof c.autoFit !== 'boolean') throw new Error('Invalid duration editing option.');
      if (!['clip','video'].includes(timingMode)) throw new Error('Geçersiz zamanlama modu.');
      if (!['fast', 'quality'].includes(profile) || ![4, 8].includes(concurrency)) throw new Error('Geçersiz ses üretim profili.');
      c.profile = profile; c.concurrency = concurrency; c.timingMode = timingMode;
      if (request.grouping !== undefined && !['akici', 'anlatim', 'cumle', 'satir'].includes(request.grouping)) throw new Error('Dublaj planını yeniden hazırlayın.');
      c.grouping = request.grouping ?? c.grouping;
      c.expression = request.expression ?? c.expression;
      if (!['reference','calm','warm','lively'].includes(c.expression)) throw new Error('Invalid expression profile.');
      c.followDelivery = request.followDelivery ?? c.followDelivery;
      c.deliveryStrength = request.deliveryStrength ?? c.deliveryStrength;
      if (typeof c.followDelivery !== 'boolean' || !['gentle','balanced','strong'].includes(c.deliveryStrength)) throw new Error('Invalid delivery option.');
      s.sourceIdentity = trusted ? trusted.sourceIdentity : sourceIdentity(request.source);
      // The locator is derived here from main-owned records and corroborated by the bound source; a retry keeps the original's.
      s.sourceLocator = trusted ? (trusted.sourceLocator ?? null) : resume ? resume.sourceLocator : await locators.pin(request);
      if (trusted) { s.retryOf = trusted.retryOf; s.attempt = trusted.attempt; }
      if (resume) { s.retryOf = resume.id; s.attempt = resume.attempt + 1; }
      s.settings = { profile, steps: profile === 'fast' ? 10 : 15, concurrency, maxSpeed: timingMode === 'video' ? 1 : 1.25 };
      Object.assign(s.settings, { verification, autoFit:c.autoFit, naturalSpeech:c.naturalSpeech, forceAll, forceGroupCount:forceGroups.length });
      s.settings.referenceName = path.basename(c.reference);
      s.settings.grouping = c.grouping;
      s.settings.expression = c.expression;
      s.settings.followDelivery = c.followDelivery; s.settings.deliveryStrength = c.deliveryStrength;
      s.settings.resultMode=c.resultMode;
      const automaticDelivery=c.resultMode==='natural'&&request.narration!==true&&!c.followDelivery
        &&!!(request.prosodySource||request.backgroundTab?.tabId||restoredEdit?.assets?.delivery);
      s.settings.deliveryAutomatic=automaticDelivery;
      s.range = rangeOption(request.range); s.settings.range = s.range; s.settings.timingMode = timingMode;
      const positionSample = request.positionSample === true;
      if(positionSample && (!s.sample || !s.range || s.range.end-s.range.start>20.001
          || (sourceDuration!==undefined && s.range.end>sourceDuration) || request.narration===true)) throw Error('Invalid playback sample range.');
      if(positionSample)s.settings.positionSample=true;
      const python = path.join(c.engine, '.venv', 'Scripts', 'python.exe');
      const script = path.join(__dirname,'..','tools','voxcpm2','altyazi_oku.py');
      for (const file of [python, script, path.join(c.engine,'kitap_ortak.py'), c.reference, c.transcript]) {
        if (!fs.existsSync(file)) throw new Error('VoxCPM2 motoru veya ses referansı bulunamadı.');
      }
      // A retry cannot silently inherit a different active voice or changed same-path content.
      let referenceRecipe;
      try{referenceRecipe=referenceFingerprint(c);}catch(error){if(request.recipeId!==undefined)throw staleReferenceRecipe();throw error;}
      if(request.recipeId!==undefined){
        if(typeof request.recipeId!=='string'||!/^[a-zA-Z0-9-]{1,80}$/.test(request.recipeId))throw staleReferenceRecipe();
        const previous=referenceRecipes.get(e.sender.id+':'+request.recipeId);
        if(!previous||(typeof previous==='string'?previous:previous.reference)!==referenceRecipe)throw staleReferenceRecipe();
      }
      emit(s, 'voice', {reference:c.reference,transcript:c.transcript,engine:c.engine});
      const srt = trusted ? trusted.srt : await authorizeSubtitle(request.srt);
      if (path.extname(srt).toLowerCase() !== '.srt') throw new Error('Bir SRT altyazı dosyası seçin.');
      if (fs.statSync(srt).size > 4000000) throw new Error('SRT çok büyük.');
      const sourceBytes = fs.readFileSync(srt);
      s.subtitleHash = require('node:crypto').createHash('sha256').update(sourceBytes).digest('hex');
      if (sourceBytes.length > 4000000) throw new Error('SRT çok büyük.');
      const effectivePronunciations=trusted?normalizePronunciations(trusted.pronunciations||[]):pronunciationStore().resolve(pronunciationScope(request.source,sourceBytes),c.pronunciations).pronunciations;
      const savedEdit=request.recipeId&&referenceRecipes.get(e.sender.id+':'+request.recipeId);
      const editScope=JSON.stringify([s.subtitleHash,s.sourceIdentity,s.range||null,c.grouping,c.expression,c.deliveryStrength,timingMode,c.followDelivery,automaticDelivery]);
      if(savedEdit?.scope&&savedEdit.scope!==editScope)throw Error('Saved source scope changed / Kayıtlı kaynak kapsamı değişti.');
      if(savedEdit?.pronunciations&&JSON.stringify(savedEdit.pronunciations)!==JSON.stringify(effectivePronunciations))throw Error('Pronunciations changed; reopen the result / Telaffuzlar değişti; sonucu yeniden açın.');
      const prepared = resume?.plan || (positionSample ? positionPlans : plans).get(e.sender.id);
      if(resume && (resume.subtitleHash!==s.subtitleHash || resume.srt!==srt || resume.reference!==referenceRecipe
          || JSON.stringify(resume.pronunciations)!==JSON.stringify(effectivePronunciations))) {
        throw Error('The subtitle or voice settings changed / Altyazı veya ses ayarları değişti.');
      }
      if (prepared?.srt === srt && JSON.stringify(prepared.range) === JSON.stringify(s.range)
          && prepared.sourceHash !== require('node:crypto').createHash('sha256').update(sourceBytes).digest('hex')) {
        throw new Error('SRT değişti; dublaj planını yeniden hazırlayın.');
      }
      // Resolve before the worker starts, from authorized records and the exact
      // input bytes. Never accept source-language content in DUB_REWRITE.
      const {sourceContextSnapshot,boundSourceContext}=require('./dub-source-context');
      let speechSources=new Map();
      if ((c.autoFit||c.naturalSpeech) && typeof resolveSourceContext==='function') {
        try {
          let preparedGroups=prepared?.srt===srt&&prepared.sourceHash===s.subtitleHash
            &&prepared.grouping===c.grouping&&JSON.stringify(prepared.range)===JSON.stringify(s.range)
            ? prepared.groups : null;
          if(!preparedGroups) {
            const sourcePlan=await require('./dub-source-plan').buildSourcePlan({srt,grouping:c.grouping,range:s.range,
              python,appRoot:path.join(__dirname,'..'),spawn,environment:voiceEnvironment(c.engine),
              terminate,isCancelled:()=>s.cancelled,onProcess:proc=>{s.proc=proc;}});
            s.proc=null;
            if(sourcePlan.sourceHash===s.subtitleHash)preparedGroups=sourcePlan.groups;
          }
          speechSources=sourceContextSnapshot(await resolveSourceContext({srt,subtitleBytes:sourceBytes,
            source:request.source,grouping:c.grouping,range:s.range,preparedGroups}),sourceBytes);
        } catch (error) {
          if(error.processActive&&s.proc) {
            // Retain job ownership until the planner really closes; another
            // production must not run beside an unconfirmed child process.
            s.proc.once('close',()=>{finish(s,s.cancelled?'cancelled':'error',{error:error.message});if(job===s)job=null;});
            return {ok:false,error:error.message};
          }
          s.proc=null;
          if(s.cancelled)throw Object.assign(error,{code:'DUB_START_CANCELLED'});
          /* Missing/stale evidence preserves the existing Turkish. */
        }
      }
      s.settings.speechSourceGroups=speechSources.size;
      s.settings.speechSourceStatus=speechSources.size?'available':'unavailable';
      s.settings.speechSourceIdentity=require('node:crypto').createHash('sha256').update(JSON.stringify([...speechSources])).digest('hex');
      if(resume && resume.speechSourceIdentity!==s.settings.speechSourceIdentity) throw Error('The source text changed / Kaynak metin değişti.');
      const canEdit=(c.autoFit||c.naturalSpeech)&&typeof shorten==='function';
      const editorVersion=canEdit?require('node:crypto').createHash('sha256').update(JSON.stringify([String(editorIdentity()).slice(0,128),s.settings.speechSourceIdentity])).digest('hex'):null;
      if(resume&&resume.editorVersion!==editorVersion)throw Error('The text editor changed / Metin düzenleyicisi değişti.');
      const selectedTakes=await groupTakes.resolve(e.sender,request.groupTakes,{subtitleHash:s.subtitleHash,sourceIdentity:s.sourceIdentity,range:s.range,sample:s.sample},forceGroups);
      if(forceAll&&Object.keys(selectedTakes).length)throw Error('Whole-plan regeneration cannot reuse selected recordings.');
      let reviewedText=trusted?.dubText||null;
      if(request.dubText){
        if(!prepared||prepared.srt!==srt||prepared.grouping!==c.grouping||request.dubText.sourceHash!==prepared.sourceHash||JSON.stringify(prepared.range)!==JSON.stringify(s.range))throw Error('Dublaj planını yeniden hazırlayın.');
        const edits=request.dubText.edits;
        if(!edits||typeof edits!=='object'||Array.isArray(edits))throw Error('Geçersiz dublaj metni.');
        const keys=new Set(prepared.groups.map(g=>g.key));
        for(const [key,text] of Object.entries(edits)){
          if(!keys.has(key)||typeof text!=='string'||!text.trim()||text.length>1000)throw Error('Geçersiz dublaj metni.');
        }
        reviewedText={sourceHash:prepared.sourceHash,edits};
      }
      const reviewedBytes=reviewedText?Buffer.from(JSON.stringify(reviewedText)):null;
      s.integrity=require('./dub-integrity').make({sourceIdentity:s.sourceIdentity,subtitleHash:s.subtitleHash,referenceFingerprint:referenceRecipe,settings:{...s.settings,pronunciations:effectivePronunciations,groupTakes:selectedTakes},textEdits:reviewedText?.edits||{},range:s.range,sample:s.sample,reviewedHash:reviewedBytes?createHash('sha256').update(reviewedBytes).digest('hex'):null});
      if(typeof request.rehearsalId==='string'&&/^[a-zA-Z0-9-]{1,80}$/.test(request.rehearsalId))s.integrity.rehearsal={id:request.rehearsalId,...require('./dub-integrity').compare(rehearsals.get(e.sender.id+':'+request.rehearsalId),s.integrity)};
      if(reviewedText)s.settings.reviewedText=true;
      if (s.cancelled) { job = null; finish(s, 'cancelled'); return { ok: false, error: 'İptal edildi.' }; }
      const outputDir = voiceStorage(app).output;
      fs.mkdirSync(outputDir, { recursive: true });
      const output = path.join(outputDir, `${s.id}.wav`);
      claimArtifacts(s, [output, output.replace(/\.wav$/i, '.sync.json'), output.replace(/\.wav$/i, '.quality.json'),
        output.replace(/\.wav$/i, '.tmp.wav'), output.replace(/\.wav$/i, '.partial.wav'), output.replace(/\.wav$/i, '.performance.json')]);
      if (request.narration !== true && !resume && !positionSample) atomicWriteFileSync(configPath(), JSON.stringify({ ...c, ...defaultReference }, null, 2), { encoding: 'utf8' });
      const logDir = path.join(app.getPath('userData'), 'dub-logs');
      try {
        fs.mkdirSync(logDir, { recursive: true });
        const logBase = `${s.id}-${Date.now()}`;
        s.logPath = path.join(logDir, `${logBase}.ndjson`);
        s.summaryPath = path.join(logDir, `${logBase}.json`);
        // The start record pins what this run was asked to do, so an interrupted run can be understood and retried exactly.
        runLedger().begin({ summaryPath: s.summaryPath, id: s.id, startedAt: s.startedAt, sample: s.sample, retryOf: s.retryOf, attempt: s.attempt, label: path.basename(srt, '.srt'),
          pinned: { profile: s.settings.profile, verification, timingMode, grouping: c.grouping, expression: c.expression, deliveryStrength: c.deliveryStrength, resultMode: c.resultMode,
            concurrency, autoFit: c.autoFit, naturalSpeech: c.naturalSpeech, followDelivery: c.followDelivery, deliveryAutomatic: s.settings.deliveryAutomatic, forceAll, forceGroups,
            narration: request.narration === true, sample: s.sample, positionSample, range: s.range, sourceDuration, sourceIdentity: s.sourceIdentity, sourceLocator: s.sourceLocator || undefined, subtitleHash: s.subtitleHash,
            referenceFingerprint: referenceRecipe, referenceName: s.settings.referenceName, pronunciations: effectivePronunciations,
            dubTextHash: reviewedBytes?require('node:crypto').createHash('sha256').update(reviewedBytes).digest('hex'):undefined,
            groupTakesCount: Object.keys(selectedTakes || {}).length, speechSourceStatus: s.settings.speechSourceStatus } });
        s.ledgerRun = true;
        s.heartbeat = setInterval(() => { runLedger().heartbeat(s.id); }, 5000); s.heartbeat.unref?.();
      } catch (error) { s.logError = error.message; }
      const inputDir = path.join(voiceStorage(app).input, s.id);
      fs.mkdirSync(inputDir, { recursive: true });
      const inputSrt = path.join(inputDir, path.basename(srt));
      if (fs.existsSync(inputSrt)) {
        if (fs.realpathSync(inputSrt) !== path.resolve(inputSrt) || !fs.readFileSync(inputSrt).equals(sourceBytes)) throw new Error('Bu işin girdi dosyası değişmiş.');
      } else fs.writeFileSync(inputSrt, sourceBytes, { flag: 'wx' });
      const args = [script, inputSrt, c.reference, '--transcript', c.transcript, '--mode', 'hifi',
        '--expression', c.followDelivery ? 'reference' : c.expression,
        '--gruplama', c.grouping, '--grup-max-karakter', ['akici','anlatim'].includes(c.grouping) ? '280' : '250',
        '--grup-max-sn', ['akici','anlatim'].includes(c.grouping) ? '18' : '12', '--tasarsa', 'kirp', '--max-hiz', String(s.settings.maxSpeed),
        '--bosluk-pay-ms', '2000', '--erken-pay-ms', '300',
        '--steps', String(s.settings.steps), '--eszamanli', String(concurrency), '--output', output];
      if(sourceDuration!==undefined){
        args.push('--source-duration',String(sourceDuration));s.settings.sourceDuration=sourceDuration;
      }
      if (effectivePronunciations.length) {
        const file=output.replace(/\.wav$/i,'.pronunciations.json');
        claimArtifacts(s,[file]);
        fs.writeFileSync(file,JSON.stringify(effectivePronunciations),{encoding:'utf8',flag:'wx'});
        args.push('--pronunciations',file);
        s.settings.pronunciationEntries=effectivePronunciations.length;
      }
      args.push('--timing-mode', timingMode);
      if(request.narration===true)args.push('--narration');
      args.push('--verification', verification, '--verify-python', path.join(__dirname, '..', 'backend', 'venv', 'Scripts', 'python.exe'));
      if (forceAll) args.push('--force-all');
      if (forceGroups.length) {
        const inline=forceGroups.join(';');
        if(inline.length<=12000) args.push('--force-groups',inline);
        else {
          const file=path.join(inputDir,'force-groups.json'),bytes=Buffer.from(JSON.stringify(forceGroups));
          if(fs.existsSync(file)) {if(fs.realpathSync(file)!==path.resolve(file)||!fs.readFileSync(file).equals(bytes))throw Error('Regeneration selection changed; prepare a new job / Yeniden üretim seçimi değişti; yeni iş hazırlayın.');}
          else fs.writeFileSync(file,bytes,{flag:'wx'});
          args.push('--force-groups-file',file);
        }
      }
      if(Object.keys(selectedTakes).length){
        const file=path.join(outputDir,`${s.id}-group-takes.json`);claimArtifacts(s,[file]);
        fs.writeFileSync(file,JSON.stringify(selectedTakes),{encoding:'utf8',flag:'wx'});
        args.push('--take-selections-file',file);s.settings.selectedTakeCount=Object.keys(selectedTakes).length;
      }
      if (s.sample && !positionSample) args.push('--limit', '11', '--representative-preview');
      const rewriteDir = path.join(inputDir, 'duration-edits');
      if (canEdit) {
        fs.mkdirSync(rewriteDir, {recursive:true});
        args.push('--rewrite-dir', rewriteDir);
        args.push('--editor-identity', editorVersion);
        if (c.autoFit) args.push('--auto-fit');
        if (c.naturalSpeech) args.push('--natural-speech');
      }
      if (s.range) args.push('--range-start', String(s.range.start), '--range-end', String(s.range.end));
      if (reviewedBytes) {
        const textPath = path.join(inputDir, 'dub-text.json');
        if(fs.existsSync(textPath)){
          if(!fs.lstatSync(textPath).isFile()||fs.realpathSync(textPath)!==path.resolve(textPath)||!fs.readFileSync(textPath).equals(reviewedBytes))throw Error('Saved text changed; prepare a new job / Kayıtlı metin değişti; yeni iş hazırlayın.');
        }else fs.writeFileSync(textPath, reviewedBytes, { flag: 'wx' });
        args.push('--dub-text', textPath);
      }
      if (c.followDelivery || automaticDelivery) {
        const file = path.join(outputDir,`${s.id}-delivery.json`);
        const files = [file,file.replace(/\.json$/,'.partial.json')];
        claimArtifacts(s,files);
        try {
          if (typeof prepareProsody !== 'function'&&!restoredEdit?.assets?.delivery) throw new Error('Source delivery unavailable');
          emit(s,'status',{stage:'delivery_analysis',text:'Özgün konuşmanın anlatımı analiz ediliyor…'});
          if(restoredEdit?.assets?.delivery)savedAssets.copy(restoredEdit.assets.delivery,s.id);
          else await prepareProsody({request,srt:inputSrt,range:s.range,sample:s.sample&&!positionSample,grouping:c.grouping,
            strength:c.deliveryStrength,output:file,onProcess:proc=>{s.proc=proc;},isCancelled:()=>s.cancelled,
            status:progress=>emit(s,'status',{stage:'delivery_analysis',text:progress==='stop_failed'
              ? 'Analiz durdurulamadı; Durdur düğmesiyle tekrar deneyin.' : `Özgün anlatım analiz ediliyor · ${progress}`})});
          if (s.cancelled) throw new Error('Cancelled');
          if (fs.statSync(file).size > 2_000_000) throw new Error('Delivery map too large');
          const delivery = JSON.parse(fs.readFileSync(file,'utf8'));
          if (!Array.isArray(delivery.groups)) throw new Error('Invalid delivery map');
          s.settings.deliveryAnalyzed = delivery.groups.length;
          s.settings.deliveryApplied = delivery.groups.filter(row=>row.delivery).length;
          if (!s.settings.deliveryApplied) emit(s,'warning',{text:'Özgün seste güvenilir anlatım bulunamadı; ek yönlendirme uygulanmıyor.'});
          args.push('--prosody-plan',file); s.settings.deliveryReport=path.basename(file);
          s.savedAssets={...s.savedAssets,delivery:savedAssets.capture(s.id,'delivery')};
        } catch (error) {
          if (s.cancelled) throw error;
          if(restoredEdit?.assets?.delivery)throw error;
          cleanupArtifacts(s,files); s.settings.deliveryFallback=true;
          emit(s,'warning',{text:'Özgün anlatım analiz edilemedi; referansın doğal tonuyla devam ediliyor.'});
          if (error.code==='MULTIPLE_AUDIO_TRACKS') emit(s,'warning',{text:'Videoda birden fazla ses dili var. Doğru konuşmayı analiz etmek için yerel analiz sesini seçin.'});
        }
      }
      let background = null;
      if (request.keepBackground === true && !s.sample) {
        try {
          if (typeof prepareBackground !== 'function'&&!restoredEdit?.assets?.background) throw new Error('Arka plan ayırma kullanılamıyor.');
          const file = path.join(outputDir,`${s.id}-background.wav`);
          const backgroundFiles = [file, file.replace(/\.wav$/i, '.partial.wav')];
          claimArtifacts(s, backgroundFiles);
          s.backgroundFiles = backgroundFiles;
          if(restoredEdit?.assets?.background)savedAssets.copy(restoredEdit.assets.background,s.id);
          else await prepareBackground({request,srt:inputSrt,range:s.range,limit:s.sample ? 11 : 0,output:file,
            onProcess:proc=>{s.proc=proc;},isCancelled:()=>s.cancelled,
            status:stage=>{
              if (stage === 'separate_gpu' || stage === 'separate_cpu') s.settings.backgroundDevice = stage.slice(9);
              const text = stage === 'download' ? 'Video sesi indiriliyor…'
                : stage === 'separate_gpu' ? 'Müzik ve ortam sesi ayrılıyor · GPU (CUDA)…'
                  : stage === 'separate_cpu' ? 'Müzik ve ortam sesi ayrılıyor · CPU…' : 'Müzik ve ortam sesi ayrılıyor…';
              emit(s,'status',{stage,text});
            }});
          if (s.cancelled) throw new Error('İptal edildi.');
          grantMedia(file); background={path:file,url:pathToFileURL(file).href}; s.settings.keepBackground=true;
          s.savedAssets={...s.savedAssets,background:savedAssets.capture(s.id,'background')};
        } catch (error) {
          if (s.cancelled) throw error;
          if(restoredEdit?.assets?.background)throw error;
          cleanupArtifacts(s, s.backgroundFiles || []);
          s.proc=null; s.settings.backgroundError=String(error.message).slice(0,600);
          emit(s,'warning',{text:'Arka plan ayırma başarısız; yalnız dublaj üretilecek.'});
        }
      }
      emit(s, 'status', { stage: 'model_load', text: 'Motor yükleniyor…' });
      const env = voiceEnvironment(c.engine);
      // Flush output and report native crashes in this process and spawned GPU workers.
      env.PYTHONUNBUFFERED = '1'; env.PYTHONFAULTHANDLER = '1';
      // Motor serbest bırakılırken/başlatılırken s.proc henüz yoktur; bu pencerede gelen iptal kaybolmamalıdır.
      const startControl = { isCancelled: () => s.cancelled };
      s.startPhase = new Promise(resolve => { s.startPhaseDone = resolve; });
      try {
        if (referenceFingerprint(c) !== referenceRecipe) throw staleReferenceRecipe();
        if (c.keepEngine) s.proc = await warmEngine.start(python,args,{cwd:c.engine,env,windowsHide:true},startControl);
        else {
          await warmEngine.release();
          if (s.cancelled) throw Object.assign(new Error('İptal edildi.'), { code:'DUB_START_CANCELLED' });
          if (referenceFingerprint(c) !== referenceRecipe) throw staleReferenceRecipe();
          s.proc = spawn(python,args,{cwd:c.engine,env,windowsHide:true});
        }
      } finally { s.startPhaseDone(); }
      let pending = '';
      const rewriteRequests = new Set();
      function line(value) {
        if(value.startsWith('DUB_ACTIVITY ')){
          try{const data=JSON.parse(value.slice(13));const activity=require('./dub-activity').activity(data);if(activity)emit(s,'activity',activity);const labels={verification:'Konuşma doğrulanıyor…',placement:'Ses zaman çizelgesine yerleştiriliyor…',file_write:'Ses dosyası yazılıyor…',normalization:'Ses yüksekliği dengeleniyor…'};if(Object.hasOwn(labels,data.stage))emit(s,'status',{stage:data.stage,text:labels[data.stage]});}catch(_){}return;
        }
        if(value==='DUB_WARNING take_snapshot_unavailable')emit(s,'warning',{text:'Ses üretildi; ham grup sürümü saklanamadı. Bu üretimin nihai WAV dosyası kullanılabilir.'});
        if(value==='DUB_WARNING normalization_unavailable')emit(s,'warning',{text:'Ses dengeleme tamamlanamadı; üretilen konuşma korundu.'});

        if(value.startsWith('DUB_FAILURE ')){try{const failure=JSON.parse(value.slice(12));emit(s,'warning',{text:String(failure.message||failure.kind).slice(0,1500)});}catch(_){}return;}
        if(value.startsWith('DUB_REFERENCE_ACTIVITY ')){
          try{
            const raw=JSON.parse(value.slice(23)),labels={reference_encode:['Referans ses kodlanıyor','Encoding the reference voice'],reference_prompt:['Referans konuşma örneği hazırlanıyor','Preparing the reference speech prompt'],reference_remove:['Önceki konuşma örneği bırakılıyor','Releasing the previous speech prompt']};
            if(Object.hasOwn(labels,raw.stage)&&['start','waiting','finished','timeout','failed'].includes(raw.state)&&Number.isFinite(raw.elapsed)&&raw.elapsed>=0&&Number.isFinite(raw.limit)&&raw.limit>0){
              emit(s,'reference_activity',{stage:raw.stage,state:raw.state,elapsed:raw.elapsed,limit:raw.limit});
              if(['start','waiting'].includes(raw.state))emit(s,'status',{stage:raw.stage,text:labels[raw.stage][0]+' · '+Math.floor(raw.elapsed)+' / '+raw.limit+' sn',textEn:labels[raw.stage][1]+' · '+Math.floor(raw.elapsed)+' / '+raw.limit+' s'});
            }
          }catch(_){}return;
        }
        if(value.startsWith('DUB_STAGE ')||value.startsWith('DUB_PHASES ')){
          try{const raw=JSON.parse(value.slice(value.startsWith('DUB_STAGE ')?10:11));const phases=raw.stage?{[raw.stage+'_seconds']:raw.seconds}:raw;const allowed=['model_load','reference','reference_encode','reference_prompt','reference_remove','synthesis','verification','text_edit','placement','normalization','file_write','wall'].map(key=>key+'_seconds');s.phases={...(s.phases||{}),...Object.fromEntries(Object.entries(phases).filter(([key,n])=>allowed.includes(key)&&Number.isFinite(n)&&n>=0))};emit(s,'phases',{phases:s.phases});}catch(_){}return;
        }
        if(value.startsWith('DUB_ENGINE ')||value.startsWith('DUB_REFERENCE_CACHE ')||value.startsWith('DUB_CAPACITY ')){
          try{const data=JSON.parse(value.slice(value.indexOf(' ')+1));emit(s,'engine',{kind:value.split(' ')[0],...data});}catch(_){}return;
        }
        s.tail = (s.tail + '\n' + value).slice(-6000);
        // Evidence for recovering a file, never proof of acoustic quality.
        if (value.startsWith('Tamamlandi: ') && path.resolve(value.slice(12).trim()) === path.resolve(output)) {
          s.completedMarker = true;
          // Durable evidence: if the app dies before the terminal record, a valid output can still be recovered safely.
          if (s.summaryPath) runLedger().mark(s.summaryPath, { workerCompleted: true, completedAt: new Date().toISOString() });
        }
        if (value.startsWith('DUB_REWRITE ') && (c.autoFit || c.naturalSpeech) && typeof shorten === 'function') {
          try {
            const r = JSON.parse(value.slice(12));
            if (!/^[a-f0-9]{32}$/.test(r.id) || rewriteRequests.has(r.id) || rewriteRequests.size >= 10000 ||
                typeof r.text !== 'string' || r.text.length > 8000 || !Number.isFinite(r.seconds) || r.seconds <= 0 || r.seconds > 35) return;
            if ((r.mode === 'natural' && !c.naturalSpeech) || (r.mode !== 'natural' && !c.autoFit)) return;
            rewriteRequests.add(r.id);
            // Independent response files prevent concurrent groups exchanging
            // replies. Never let a cancelled job write a late response.
            const sourceContext=boundSourceContext(speechSources,r,s.subtitleHash);
            const editStatus=!sourceContext?'source_unavailable':s.editorUnavailable?'editor_unavailable':'source_grounded';
            if(!sourceContext)s.settings.speechSourceFallbacks=(s.settings.speechSourceFallbacks||0)+1;
            void Promise.resolve().then(() => !sourceContext || s.editorUnavailable ? r.text : shorten(r.text, r.seconds, {
              ...sourceContext,
              mode:r.mode === 'natural' ? 'natural' : 'fit',
              measured:Number.isFinite(r.measured) && r.measured > 0 && r.measured <= 600 ? r.measured : null,
            })).then(text => {
              if (job === s && !s.cancelled) atomicWriteFileSync(path.join(rewriteDir, r.id + '.json'), JSON.stringify({text,
                status:editStatus==='source_grounded'?(text===r.text?'unchanged':'source_reviewed'):editStatus}), {encoding:'utf8'});
            }).catch(error => {
              if(error.code==='DUB_EDITOR_UNAVAILABLE')s.editorUnavailable=true;
              if (job === s && !s.cancelled) {
                try { atomicWriteFileSync(path.join(rewriteDir, r.id + '.json'), JSON.stringify({text:r.text,status:'editor_failed',reason:require('./dub-editor-request').editorFailureCode(error)}), {encoding:'utf8'}); } catch (_) {}
                if(!s.editorWarning){s.editorWarning=true;emit(s, 'warning', {text:'AI konuşma düzenlemesi kullanılamadı; özgün metin korunuyor.',reason:require('./dub-editor-request').editorFailureCode(error)});}
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
          stage: 'engine_restart', text: 'Ses motoru yanıt vermedi; tamamlanan parçalar korunarak yeniden başlatılıyor…' });
        if (value === 'DUB_WARNING tempo_fallback') emit(s, 'warning', {
          text: 'Ses hızlandırılamadı; konuşma kesilmeden korundu. Video daha yavaş oynatılabilir.' });
        if (value === 'DUB_WARNING incomplete_audio') emit(s, 'warning', {
          text: 'Tamamlanan sesler kurtarıldı; üretilemeyen bölümler kalite raporunda işaretlendi.' });
        if (value === 'DUB_WARNING server_shutdown_timeout') emit(s, 'warning', {
          text: 'Ses motorunun kapanışı zaman aşımına uğradı; çalışan süreçler denetlendi.' });
        if (value === 'DUB_WARNING sample_edits_unused') emit(s, 'warning', {
          text: 'Kısa örnekte bazı metin düzenlemeleri uygulanmadı; hepsini duymak için tam üretim yapın.' });
        const progress = value.match(/^\[(\d+)\/(\d+)\]/);
        if (progress) { const done=Number(progress[1]),total=Number(progress[2]);if(Number.isSafeInteger(done)&&Number.isSafeInteger(total)&&total>0&&done<=total){s.progress={done,total};emit(s,'progress',s.progress);} }
        else if (/^Plan:/.test(value)) emit(s, 'status', { stage: 'plan', text: 'Cümle grupları hazır' });
        else if (/Referans hazir/.test(value)) emit(s, 'status', { stage: 'synthesis', text: 'Ses üretiliyor…' });
        else if (/^Zamanlama:/.test(value)) emit(s, 'status', { stage: 'placement', text: 'Ses zaman çizelgesine yerleştiriliyor…' });
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
        if (s.cancelled) {
          // Publication precedes engine shutdown. A late stop must preserve
          // completed media while retaining the cancelled terminal contract.
          const recovered = s.completedMarker === true && validVoiceOutput(output);
          if (recovered) {
            for (const file of [output, output.replace(/\.wav$/i, '.sync.json'), output.replace(/\.wav$/i, '.quality.json')]) {
              s.ownedArtifacts?.delete(file);
            }
            grantMedia(output);
          }
          finish(s, 'cancelled', recovered ? { recoverablePath: output,
            recoverableUrl: pathToFileURL(output).href, name: path.basename(output) } : {});
          return;
        }
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
              if (!sync||Math.abs(sync.audioDuration-inspectVoiceOutput(output).seconds)>.05) throw new Error('map duration differs from audio');
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
          let quality = null,noSpeechProduced=false;
          try {
            const qualityPath = output.replace(/\.wav$/i, '.quality.json');
            if (fs.statSync(qualityPath).size <= 16000000) {
              const raw = JSON.parse(fs.readFileSync(qualityPath, 'utf8'));
              if (raw.version === 1 && Array.isArray(raw.groups) && raw.groups.length && raw.groups.length <= 5000) {
                const checked = validateGroups(raw.groups);
                noSpeechProduced=checked.every(row=>row.status==='failed');
                if(checked.some(row=>row.audioEnd>inspectVoiceOutput(output).seconds+.05))throw Error('quality range exceeds audio');
                quality = {...raw, groups: raw.groups.map((row, i) => ({...row, ...checked[i],continuity:require('./renderer/dub-experience-model').continuity(row.continuity)}))};
              }
            }
          } catch (_) {}
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
          const qualityIncomplete=Number.isSafeInteger(s.progress?.total)&&s.progress.total>0&&(!quality?.groups||quality.groups.length!==s.progress.total);
          finish(s, 'done', { path: output, url: pathToFileURL(output).href, settings:s.settings, qualityUnavailable: !quality?.groups?.length||qualityIncomplete, qualityIncomplete,
            subtitle: inputSrt, name: path.basename(srt, '.srt') + (s.range ? `-${s.range.start}-${s.range.end}s` : '') + '-dublaj.wav', timing: s.timing || null, range: s.sample && !positionSample ? null : s.range, sync, background, quality, sample:s.sample });
        } else {
          // Python reports the real cause on stderr: a traceback line such as
          // "TypeError: ..." or the plain message of a SystemExit. Show that
          // instead of the generic notice whenever stderr has something useful.
          const details = processFailure(s.stderr, s.tail);
          finish(s, 'error', { error: s.spawnError || details || `Ses üretimi başarısız oldu. (exit=${code ?? 'null'}, signal=${signal || 'none'})` });
        }
      });
      // start() döndükten sonra gelen iptal: çalışan run'ı durdur (kapanış yukarıdaki close işleyicisinden 'cancelled' olur).
      // cancel() waits for startPhase and then terminates the assigned run.
      referenceRecipes.set(e.sender.id+':'+s.id,{reference:referenceRecipe,pronunciations:effectivePronunciations,
        scope:editScope,assets:Object.fromEntries(Object.entries(s.savedAssets||{}).map(([kind,receipt])=>[kind,{id:s.id,kind,...receipt}]))});
      if(!trusted && request.narration!==true && !forceGroups.length && !Object.keys(selectedTakes).length) {
        const frozen={srt,range:s.range,sourceDuration,sample:s.sample,positionSample,profile,concurrency,timingMode,verification,
          grouping:c.grouping,expression:c.expression,followDelivery:c.followDelivery,deliveryStrength:c.deliveryStrength,
          resultMode:c.resultMode,autoFit:c.autoFit,naturalSpeech:c.naturalSpeech,keepEngine:c.keepEngine,
          keepBackground:request.keepBackground===true};
        for(const key of ['source','referenceId','backgroundSource','prosodySource']){
          if(typeof request[key]==='string')frozen[key]=request[key];
        }
        if(request.dubText)frozen.dubText={sourceHash:request.dubText.sourceHash,edits:structuredClone(request.dubText.edits)};
        if(request.backgroundTab?.tabId)frozen.backgroundTab={tabId:request.backgroundTab.tabId,
          generation:request.backgroundTab.generation,mediaId:request.backgroundTab.mediaId};
        s.continuationRecipe={id:s.id,attempt:s.attempt||1,reference:referenceRecipe,request:frozen,plan:prepared,srt,
          sourceLocator:s.sourceLocator,subtitleHash:s.subtitleHash,pronunciations:effectivePronunciations,
          speechSourceIdentity:s.settings.speechSourceIdentity,editorVersion};
        continuations.set(e.sender.id,s.continuationRecipe);
        if(!continuationSenders.has(e.sender)){
          continuationSenders.add(e.sender);
          e.sender.once?.('destroyed',()=>continuations.delete(e.sender.id));
        }
      }
      while(referenceRecipes.size>128)referenceRecipes.delete(referenceRecipes.keys().next().value);
      return { ok: true, id: s.id };
    } catch (error) {
      if (job === s) job = null;
      if (error.code === 'DUB_START_CANCELLED') { finish(s, 'cancelled'); return { ok: false, cancelled: true, error: 'İptal edildi.' }; }
      finish(s, s.cancelled ? 'cancelled' : 'error', { error: error.message }); throw error;
    }
  }
  ipcMain.handle('dub:start', guard(async (e, request = {}) => {
    if(request.resumeOf===undefined)return startGeneration(e,request);
    const recipe=continuations.get(e.sender.id);
    if(!recipe?.interrupted || recipe.claimed || recipe.id!==request.resumeOf)throw Error('The paused run is unavailable / Yarım kalan üretim bulunamadı.');
    recipe.claimed=true;
    try {
      const result=await startGeneration(e,{...recipe.request,id:request.id,recipeId:request.resumeOf},null,recipe);
      if(result?.ok)recipe.interrupted=false;
      return result;
    } finally {recipe.claimed=false;}
  }));
  // Current settings as the retry preview compares them (same keys as the pinned options; no paths).
  function currentRunSettings() {
    const c = config();
    let fingerprint = null; try { fingerprint = referenceFingerprint(c); } catch (_) {}
    return { profile: c.profile, verification: c.verification, timingMode: c.timingMode, grouping: c.grouping, expression: c.expression, deliveryStrength: c.deliveryStrength,
      resultMode: c.resultMode, concurrency: c.concurrency, autoFit: c.autoFit, naturalSpeech: c.naturalSpeech, followDelivery: c.followDelivery, referenceFingerprint: fingerprint, referenceMissing: fingerprint === null, referenceName: path.basename(c.reference || '') };
  }
  // Run records: list / recover / retry-preview / retry-approve. Reading changes nothing; every other action is explicit,
  // validated and bound to a run id (never a path).
  const outputRestores=new Map();
  const settledRestores=new Map();
  const discardRestore=token=>{const row=outputRestores.get(token);if(row?.state==='running')return;if(row?.staged){try{fs.unlinkSync(row.staged);}catch{}}if(row?.onDestroyed)row.sender.removeListener?.('destroyed',row.onDestroyed);outputRestores.delete(token);};
  ipcMain.handle('dub:runs', guard(async (e, request = {}) => {
    const ledger = runLedger(), runId = request?.runId, action = request?.action, active = job?.id || null;
    const safe = value => typeof value === 'string' && /^[a-zA-Z0-9-]{1,80}$/.test(value);
    for(const [token,row]of outputRestores)if(Date.now()>row.expires)discardRestore(token);
    for(const [token,row]of settledRestores)if(Date.now()>row.expires)settledRestores.delete(token);
    if(action==='output-restore-cancel'){
      const row=outputRestores.get(request.token);if(row&&row.sender===e.sender)discardRestore(request.token);
      return {ok:true};
    }
    if(action==='output-restore-preview'){
      if(!safe(runId)||job||restoringOutput||busy())throw Error('Cannot restore while busy / Meşgulken geri yüklenemez.');
      const found=ledger.find(runId),identity=found?.summary.outputIdentity;
      if(found?.summary.result!=='done'||!identity||ledger.outputInfo(runId).state!=='missing')throw Error('A missing output with saved identity is required / Kayıtlı kimliği olan eksik çıktı gerekli.');
      const fingerprint=createHash('sha256').update(JSON.stringify(found.summary)).digest('hex');
      const choice=await dialog.showOpenDialog(owner(),{title:'Choose the original WAV / Özgün WAV dosyasını seç',properties:['openFile'],filters:[{name:'WAV',extensions:['wav']}]});
      if(choice.canceled||!choice.filePaths?.[0])return {ok:true,cancelled:true};
      if(e.sender.isDestroyed?.()||job||restoringOutput||busy()||createHash('sha256').update(JSON.stringify(ledger.find(runId)?.summary)).digest('hex')!==fingerprint||ledger.outputInfo(runId).state!=='missing')throw Error('Run changed while choosing / Seçim sırasında üretim kaydı değişti.');
      const candidate=choice.filePaths[0];
      const isCurrent=()=>!e.sender.isDestroyed?.()&&!job&&!restoringOutput&&!busy();
      const recordCurrent=()=>isCurrent()&&createHash('sha256').update(JSON.stringify(ledger.find(runId)?.summary)||'').digest('hex')===fingerprint&&ledger.outputInfo(runId).state==='missing';
      if(!await matchesVoiceOutputAsync(candidate,identity,{isCurrent}))throw Error('The selected WAV changed or is not the recorded output / Seçilen WAV değişti veya kayıtlı çıktıyla aynı değil.');
      while(outputRestores.size>=16)discardRestore(outputRestores.keys().next().value);
      const token=randomBytes(16).toString('hex'),staged=path.join(voiceStorage(app).output,'.restore-'+token+'.wav');
      try{
        if(!recordCurrent())throw Error('Run changed / Üretim kaydı değişti.');
        await fs.promises.copyFile(candidate,staged,fs.constants.COPYFILE_EXCL);
        if(!await matchesVoiceOutputAsync(staged,identity,{isCurrent})||!recordCurrent())throw Error('Selected WAV or run changed / Seçilen WAV veya üretim kaydı değişti.');
      }
      catch(error){try{await fs.promises.unlink(staged);}catch{}throw error;}
      while(outputRestores.size>=16)discardRestore(outputRestores.keys().next().value);
      const onDestroyed=()=>discardRestore(token);
      outputRestores.set(token,{sender:e.sender,onDestroyed,runId,staged,fingerprint,expires:Date.now()+300000});e.sender.once?.('destroyed',onDestroyed);
      return {ok:true,token,runId,sourceName:path.basename(candidate),targetName:runId+'.wav',seconds:inspectVoiceOutput(staged).seconds};
    }
    if(action==='output-restore-approve'){
      const settled=settledRestores.get(request.token);
      if(settled?.sender===e.sender)return {...settled.result,replayed:true};
      const row=outputRestores.get(request.token);
      if(!row||row.sender!==e.sender)throw Error('Restore approval expired / Geri yükleme onayı sona erdi.');
      if(row.promise)return row.promise;
      if(job||textUI||releasingEngine||restoringOutput||busy())throw Error('Another production or restore is running / Başka bir üretim veya geri yükleme çalışıyor.');
      restoringOutput=true;row.state='running';
      row.promise=(async()=>{
        let result;
        try{result=await ledger.restoreOutput(row.runId,row.staged,row.fingerprint);}
        catch(error){result={ok:false,error:error.message};}
        finally{restoringOutput=false;row.state='settled';discardRestore(request.token);pendingOutputRestore=null;}
        while(settledRestores.size>=128)settledRestores.delete(settledRestores.keys().next().value);
        settledRestores.set(request.token,{sender:e.sender,result,expires:Date.now()+300000});
        return result;
      })();
      pendingOutputRestore=row.promise;return row.promise;
    }
    if(action==='output-restore-files'){
      const folder=voiceStorage(app).output,owned=new Set([...outputRestores.values()].map(row=>path.basename(row.staged))),files=[];
      const names=(await fs.promises.readdir(folder)).filter(name=>/^\.restore-[a-f0-9]{32}\.wav$/.test(name)).sort();
      for(const name of names.slice(0,100)){
        try{const stat=await fs.promises.lstat(path.join(folder,name));if(!stat.isFile()||stat.isSymbolicLink())continue;
          files.push({name,size:stat.size,modifiedAt:stat.mtimeMs,ageSeconds:Math.max(0,Math.floor((Date.now()-stat.mtimeMs)/1000)),active:owned.has(name)});
        }catch{}
      }
      return {ok:true,folder,files,truncated:names.length>100};
    }
    if (action === 'list') {
      const owned=new Set([...outputRestores.values()].map(row=>path.basename(row.staged)));
      let temporaryCopies={active:0,untracked:0};
      try{for(const name of fs.readdirSync(voiceStorage(app).output)){
        if(!/^\.restore-[a-f0-9]{32}\.wav$/.test(name))continue;
        const stat=fs.lstatSync(path.join(voiceStorage(app).output,name));if(!stat.isFile()||stat.isSymbolicLink())continue;
        temporaryCopies[owned.has(name)?'active':'untracked']++;
      }}catch{temporaryCopies=null;}
      return { ok: true, active,temporaryCopies, ...ledger.list({ activeRunId: active, limit: Number.isSafeInteger(request.limit) ? request.limit : 30 }) };
    }
    if (action === 'detail') { if (!safe(runId)) throw Error('Invalid run identity.'); return ledger.detail(runId, { activeRunId: active }); }
    if (action === 'review') {
      if (!safe(runId)) throw Error('Invalid run identity.');
      const checked = ledger.review(runId, { activeRunId: active });
      if (!checked.ok) return checked;
      // The same grant the saved-output lookup uses; listening only, nothing is attached to a source or a timeline here.
      grantMedia(checked.file);
      return { ok: true, name: checked.name, url: pathToFileURL(checked.file).href, seconds: checked.seconds, use: checked.use, state: checked.state, recovered: checked.recovered };
    }
    if (action === 'recover') { if (!safe(runId)) throw Error('Invalid run identity.'); return ledger.recover(runId, { activeRunId: active }); }
    // Source return. Resolving only reads: it re-validates the recorded locator against today's library record and returns the
    // exact target for the existing open owner plus a one-shot ticket. Nothing is opened, played or attached here.
    if (action === 'source-resolve') {
      if (!safe(runId)) throw Error('Invalid run identity.');
      const stored = ledger.locatorOf(runId);
      if (!stored.found) return locators.unknownRun();
      const result = locators.resolve(stored.raw, { allowChanged: request.allowChanged === true });
      if (!result.ok) return result;
      const { fingerprint, verify, ...visible } = result;
      return { ...visible, runId, ticket: locators.issue({ runId, sender: e.sender?.id ?? 0, fingerprint, verify }) };
    }
    if (action === 'source-confirm') {
      if (typeof request.ticket !== 'string' || !/^[a-f0-9]{32}$/.test(request.ticket)) throw Error('Invalid source ticket.');
      return locators.confirm(request.ticket, { sender: e.sender?.id ?? 0, current: id => ledger.locatorFingerprint(id) });
    }
    if (action === 'retry-preview') {
      if (!safe(runId) || !['pinned', 'current'].includes(request.settings ?? 'pinned')) throw Error('Invalid retry request.');
      return ledger.plan(runId, { settings: request.settings ?? 'pinned', current: currentRunSettings(), activeRunId: active });
    }
    if (action === 'edit-prepare') {
      if(!safe(runId))throw Error('Invalid run identity.');
      if(job||textUI||releasingEngine||restoringOutput||busy())throw Error('Another production is running / Başka bir üretim çalışıyor.');
      const view=ledger.prepareEdit(runId,{current:currentRunSettings(),activeRunId:active});
      if(!view.ok)return {ok:false,error:view.reason,code:view.code};
      const assets=require('./dub-saved-assets').createSavedAssets(voiceStorage(app).output).restore(view.found.summary);
      if(view.pinned.sample)throw Error('Open the full production before editing / Düzenlemeden önce tam üretimi açın.');
      const srt=await authorizeSubtitle(request.srt);
      if(path.extname(srt).toLowerCase()!=='.srt'||fs.statSync(srt).size>4000000)throw Error('Invalid subtitle / Geçersiz altyazı.');
      const bytes=fs.readFileSync(srt);
      if(bytes.length>4000000||require('node:crypto').createHash('sha256').update(bytes).digest('hex')!==view.pinned.subtitleHash
          ||sourceIdentity(request.source)!==(view.pinned.sourceIdentity||null)
          ||JSON.stringify(rangeOption(request.range))!==JSON.stringify(view.pinned.range||null))throw Error('The subtitle, source or range changed / Altyazı, kaynak veya aralık değişti.');
      // Recheck after file authorization before binding the saved recipe to this sender.
      const checked=ledger.prepareEdit(runId,{current:currentRunSettings(),activeRunId:job?.id||null});
      if(job||textUI||releasingEngine||restoringOutput||busy())throw Error('Another production is running / Başka bir üretim çalışıyor.');
      if(!checked.ok||checked.digest!==view.digest)throw Error('Saved settings changed; reopen the result / Kayıtlı ayarlar değişti; sonucu yeniden açın.');
      const recipe={id:runId,srt,source:request.source||'',sample:false,range:view.pinned.range||null,
        sourceDuration:view.pinned.sourceDuration,dubText:view.dubText,keepBackground:!!assets.background};
      for(const key of ['profile','concurrency','verification','timingMode','grouping','expression','followDelivery','deliveryStrength','resultMode','autoFit','naturalSpeech']){
        if(view.pinned[key]!==undefined)recipe[key]=view.pinned[key];
      }
      const pronunciations=pronunciationStore().resolve(pronunciationScope(request.source,bytes),config().pronunciations).pronunciations;
      if(JSON.stringify(pronunciations)!==JSON.stringify(view.pinned.pronunciations||[]))throw Error('Pronunciations changed; restore the original dictionary / Telaffuzlar değişti; özgün sözlüğü geri yükleyin.');
      referenceRecipes.set(e.sender.id+':'+runId,{reference:referenceFingerprint(config()),pronunciations,assets,
        scope:JSON.stringify([view.pinned.subtitleHash,view.pinned.sourceIdentity||null,view.pinned.range||null,view.pinned.grouping,view.pinned.expression,view.pinned.deliveryStrength,view.pinned.timingMode,view.pinned.followDelivery,view.pinned.deliveryAutomatic])});
      while(referenceRecipes.size>128)referenceRecipes.delete(referenceRecipes.keys().next().value);
      return {ok:true,recipe,subtitleHash:view.pinned.subtitleHash};
    }
    if (action === 'retry-approve') {
      if (typeof request.token !== 'string' || !/^[a-f0-9]{64}$/.test(request.token)) throw Error('Invalid retry approval.');
      const newId = require('node:crypto').randomUUID();
      return ledger.approve(request.token, { newId, current: currentRunSettings(), activeRunId: active, busy: () => !!(job || textUI || releasingEngine || restoringOutput || busy()),
        start: (retryRequest, trusted) => startGeneration(e, retryRequest, trusted) });
    }
    throw Error('Invalid run action.');
  }));
  async function cancel() {
    const s = job;
    if (!s) return { ok: true };
    if (s.cancelPromise) return s.cancelPromise;
    s.cancelled = true;
    // UI cancellation and app shutdown can overlap. Share one attempt so a
    // second termination failure cannot reset the first request's cancel flag.
    s.cancelPromise = Promise.resolve().then(async () => {
      if (s.startPhase) await s.startPhase;
      if (job !== s) return { ok: true };
      const proc = s.proc;
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
  ipcMain.handle('dub:cancel', guard(async (event, request) => {
    if (request !== undefined) {
      if (!request || typeof request.id !== 'string' || !/^[a-zA-Z0-9-]{1,80}$/.test(request.id)) throw Error('Invalid voice cancellation identity.');
      if (!job || job.id !== request.id || job.sender !== event.sender) return { ok: true, stale: true };
    }
    return cancel();
  }));
  let quitting = false;
  app.on('before-quit', event => {
    if(restoringOutput&&pendingOutputRestore){event?.preventDefault?.();if(quitting)return;quitting=true;void pendingOutputRestore.then(()=>{quitting=false;app.quit?.();});return;}
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
  const voiceRunsApi = () => require('./assistant-voice-runs').createVoiceRunsApi({ ledger: runLedger(), current: currentRunSettings, active: () => job?.id || null, identity: sourceIdentity, locators });
  return { runs: { list: o => voiceRunsApi().list(o), detail: (id, o) => voiceRunsApi().detail(id, o), preview: (id, mode) => voiceRunsApi().preview(id, mode), sourceMatch: (id, source) => voiceRunsApi().sourceMatch(id, source), sourceNavigation: (id, source) => voiceRunsApi().sourceNavigation(id, source), exists: id => voiceRunsApi().exists(id) },
    running: () => !!job || !!textUI || releasingEngine || restoringOutput, cancel, releaseIdle:async()=>{if(job||textUI||releasingEngine||restoringOutput)throw Error('Voice generation or restoration is active.');releasingEngine=true;try{return await warmEngine.release();}finally{releasingEngine=false;}} };
}
module.exports = { registerDubService };
