'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { voiceStorage, prepareVoiceStorage } = require('./voice-storage');
const { performance } = require('node:perf_hooks');
const { validate: validateSync } = require('./renderer/dub-sync-map');

function registerDubService({ app, ipcMain, dialog, owner, authorized, authorizeSubtitle,
  spawn, terminate, busy, grantMedia, environment, shorten, setRate, prepareBackground, prepareReference }) {
  let job = null;
  let textUI = null;
  const plans = new Map();
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
      timingMode: saved.timingMode === 'clip' ? 'clip' : 'video',
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
    const meta = JSON.parse(fs.readFileSync(p.metadata, 'utf8'));
    grantMedia(p.reference);
    return { id, name: String(meta.name || id).slice(0, 160), createdAt: String(meta.createdAt || ''), path: p.reference,
      url: pathToFileURL(p.reference).href, text: fs.readFileSync(p.transcript, 'utf8'), folder: p.folder };
  }
  ipcMain.handle('dub:references', guard(async () => {
    fs.mkdirSync(referencesRoot(), { recursive: true });
    const references = [];
    for (const id of fs.readdirSync(referencesRoot()).sort().reverse()) {
      try { references.push(referenceEntry(id)); } catch (_) {}
      if (references.length === 100) break;
    }
    references.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
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
    if (job || textUI || busy()) throw new Error('Wait for the current job to finish.');
    const name = referenceName(request.name), entry = referenceEntry(request.id), p = referencePaths(entry.id);
    const meta = JSON.parse(fs.readFileSync(p.metadata, 'utf8'));
    fs.writeFileSync(p.metadata, JSON.stringify({ ...meta, name }), 'utf8');
    return { ok: true, name };
  }));
  ipcMain.handle('dub:referenceUse', guard(async (_e, request = {}) => {
    if (job || textUI || busy()) throw new Error('Wait for the current job to finish.');
    const entry = referenceEntry(request.id);
    const text = typeof request.text === 'string' ? request.text.trim() : entry.text.trim();
    if (!text || text.length > 8000) throw new Error('Check the reference transcript.');
    const p = referencePaths(request.id), c = config();
    fs.writeFileSync(p.transcript, text, 'utf8');
    c.reference = p.reference; c.transcript = p.transcript;
    fs.writeFileSync(configPath(), JSON.stringify(c, null, 2), 'utf8');
    return { ok: true };
  }));
  ipcMain.handle('dub:referencePrepare', guard(async (e, request = {}) => {
    if (job || textUI || busy()) throw new Error('Wait for the current job to finish.');
    const name = referenceName(request.name, true);
    const range = rangeOption(request.range);
    if (!range || range.end - range.start < 3 || range.end - range.start > 30) throw new Error('Select 3–30 seconds.');
    const p = referencePaths(request.id);
    if (fs.existsSync(p.folder)) throw new Error('Reference already exists.');
    if (typeof prepareReference !== 'function') throw new Error('Reference capture is unavailable.');
    const s = { id: request.id, sender: e.sender, proc: null, cancelled: false,
      started: performance.now(), startedAt: new Date().toISOString(), settings: { kind: 'reference', range } };
    job = s;
    try {
      fs.mkdirSync(p.folder, { recursive: true });
      s.logPath = path.join(p.folder, 'events.ndjson'); s.summaryPath = path.join(p.folder, 'job.json');
      await prepareReference({ request, ...p, ...range, onProcess: proc => { s.proc = proc; },
        isCancelled: () => s.cancelled, status: stage => emit(s, 'reference_status', { stage }) });
      if (s.cancelled) throw new Error('Cancelled.');
      const text = fs.readFileSync(p.transcript, 'utf8').trim();
      if (!text || text.length > 8000 || fs.statSync(p.reference).size < 44) throw new Error('No reference speech found.');
      fs.writeFileSync(p.metadata, JSON.stringify({ name: name || `${range.start}–${range.end} s · ${s.startedAt.slice(0, 19)}`, createdAt: s.startedAt }), 'utf8');
      const reference = referenceEntry(request.id);
      finish(s, 'reference_ready');
      return { ok: true, reference };
    } catch (error) {
      finish(s, s.cancelled ? 'cancelled' : 'error', { error: error.message });
      return { ok: false, cancelled: s.cancelled, error: error.message };
    } finally { if (job === s) job = null; }
  }));
  ipcMain.handle('dub:rate', guard(async (_e, request = {}) => {
    if (typeof setRate !== 'function' || !Number.isFinite(request.rate) || request.rate < .0625 || request.rate > 4
        || !Number.isInteger(request.generation) || typeof request.tabId !== 'string') throw new Error('Geçersiz dublaj hız isteği.');
    return setRate(request);
  }));
  ipcMain.handle('dub:plan', guard(async (e, request = {}) => {
    if (job) throw new Error('Üretimin bitmesini bekleyin.');
    const srt = await authorizeSubtitle(request.srt);
    if (path.extname(srt).toLowerCase() !== '.srt' || fs.statSync(srt).size > 2000000) throw new Error('Geçersiz SRT.');
    const c = config();
    const range = rangeOption(request.range);
    const result = await new Promise((resolve, reject) => {
      const proc = spawn(path.join(c.engine, '.venv', 'Scripts', 'python.exe'),
        [path.join(__dirname, '..', 'tools', 'voxcpm2', 'dub_plan.py'), srt,
          ...(range ? [String(range.start), String(range.end)] : [])],
        { cwd: c.engine, env: voiceEnvironment(c.engine), windowsHide: true });
      let out = '', settled = false;
      const finish = (error, value) => { if (settled) return; settled = true; clearTimeout(timer); error ? reject(error) : resolve(value); };
      const timer = setTimeout(() => { void terminate(proc); finish(new Error('Dublaj planı zaman aşımına uğradı.')); }, 15000);
      proc.stdout.setEncoding('utf8'); proc.stderr.resume();
      proc.stdout.on('data', data => { out += data; if (out.length > 4000000) { void terminate(proc); finish(new Error('Dublaj planı çok büyük.')); } });
      proc.once('error', error => finish(error));
      proc.once('close', code => {
        if (code !== 0) return finish(new Error('SRT planı okunamadı.'));
        try { finish(null, JSON.parse(out)); } catch (_) { finish(new Error('Geçersiz dublaj planı.')); }
      });
    });
    plans.set(e.sender.id, { srt, range, ...result });
    return { ok: true, ...result };
  }));
  ipcMain.handle('dub:shorten', guard(async (e, key) => {
    const group = plans.get(e.sender.id)?.groups.find(g => g.key === key);
    if (!group || typeof shorten !== 'function') throw new Error('Önce dublaj metnini hazırlayın.');
    if (group.text.length > 4000) throw new Error('Bu metin otomatik kısaltma için çok uzun; elle düzenleyin.');
    const text = await shorten(group.text, group.seconds);
    return { ok: true, text };
  }));
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
    const root = voiceStorage(app).output;
    const logs = path.join(app.getPath('userData'), 'dub-logs');
    if (!fs.existsSync(logs)) return { ok: true, output: null };
    const candidates = fs.readdirSync(logs).filter(n => n.endsWith('.json')).map(n =>
      ({ file: path.join(logs, n), time: fs.statSync(path.join(logs, n)).mtimeMs })).sort((a,b) => b.time - a.time);
    for (const entry of candidates) {
      try {
        const saved = JSON.parse(fs.readFileSync(entry.file, 'utf8'));
        if (saved.result !== 'done' || !/^[a-zA-Z0-9-]{1,80}$/.test(saved.id || '')) continue;
        const output = path.join(root, `${saved.id}.wav`);
        if (![output, path.join(app.getPath('userData'), 'dub-output', `${saved.id}.wav`)].some(file => path.resolve(file) === path.resolve(saved.path || '')) || !fs.existsSync(output)) continue;
        grantMedia(output);
        return { ok: true, output: { path: output, url: pathToFileURL(output).href,
          name: saved.name || path.basename(output), elapsedSeconds: saved.elapsedSeconds,
          range: rangeOption(saved.range),
          sync: validateSync(saved.sync),
          background: saved.background && fs.existsSync(path.join(root,`${saved.id}-background.wav`))
            ? (()=>{ const file=path.join(root,`${saved.id}-background.wav`);grantMedia(file);return {url:pathToFileURL(file).href}; })() : null,
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
    return { ok: true, ...c, storageRoot: voiceStorage(app).root, ready: [path.join(__dirname,'..','tools','voxcpm2','altyazi_oku.py'),path.join(c.engine, 'kitap_ortak.py'),
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
      const timingMode = request.timingMode ?? c.timingMode;
      if (!['clip','video'].includes(timingMode)) throw new Error('Geçersiz zamanlama modu.');
      if (!['fast', 'quality'].includes(profile) || ![4, 8].includes(concurrency)) throw new Error('Geçersiz ses üretim profili.');
      c.profile = profile; c.concurrency = concurrency; c.timingMode = timingMode;
      s.settings = { profile, steps: profile === 'fast' ? 10 : 15, concurrency, maxSpeed: timingMode === 'video' ? 1 : 1.25 };
      s.range = rangeOption(request.range); s.settings.range = s.range; s.settings.timingMode = timingMode;
      const python = path.join(c.engine, '.venv', 'Scripts', 'python.exe');
      const script = path.join(__dirname,'..','tools','voxcpm2','altyazi_oku.py');
      for (const file of [python, script, path.join(c.engine,'kitap_ortak.py'), c.reference, c.transcript]) {
        if (!fs.existsSync(file)) throw new Error('VoxCPM2 motoru veya ses referansı bulunamadı.');
      }
      const srt = await authorizeSubtitle(request.srt);
      if (path.extname(srt).toLowerCase() !== '.srt') throw new Error('Bir SRT altyazı dosyası seçin.');
      if (s.cancelled) { job = null; finish(s, 'cancelled'); return { ok: false, error: 'İptal edildi.' }; }
      const outputDir = voiceStorage(app).output;
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
      const inputDir = path.join(voiceStorage(app).input, s.id);
      fs.mkdirSync(inputDir, { recursive: true });
      const inputSrt = path.join(inputDir, path.basename(srt));
      fs.copyFileSync(srt, inputSrt, fs.constants.COPYFILE_EXCL);
      const args = [script, inputSrt, c.reference, '--transcript', c.transcript, '--mode', 'hifi',
        '--gruplama', 'cumle', '--tasarsa', 'kirp', '--max-hiz', String(s.settings.maxSpeed),
        '--bosluk-pay-ms', '2000', '--erken-pay-ms', '300',
        '--steps', String(s.settings.steps), '--eszamanli', String(concurrency), '--output', output];
      args.push('--timing-mode', timingMode);
      if (request.sample === true) args.push('--limit', '11');
      if (s.range) args.push('--range-start', String(s.range.start), '--range-end', String(s.range.end));
      if (request.dubText) {
        const plan = plans.get(e.sender.id);
        if (!plan || plan.srt !== srt || request.dubText.sourceHash !== plan.sourceHash || JSON.stringify(plan.range) !== JSON.stringify(s.range)) throw new Error('Dublaj planını yeniden hazırlayın.');
        const edits = request.dubText.edits;
        if (!edits || typeof edits !== 'object' || Array.isArray(edits)) throw new Error('Geçersiz dublaj metni.');
        const keys = new Set(plan.groups.map(g => g.key));
        for (const [key, text] of Object.entries(edits)) {
          if (!keys.has(key) || typeof text !== 'string' || !text.trim() || text.length > 1000) throw new Error('Geçersiz dublaj metni.');
        }
        const textPath = path.join(outputDir, `${s.id}-dub-text.json`);
        fs.writeFileSync(textPath, JSON.stringify({ sourceHash: plan.sourceHash, edits }, null, 2), 'utf8');
        args.push('--dub-text', textPath);
        s.settings.reviewedText = true;
      }
      let background = null;
      if (request.keepBackground === true) {
        try {
          if (typeof prepareBackground !== 'function') throw new Error('Arka plan ayırma kullanılamıyor.');
          const file = path.join(outputDir,`${s.id}-background.wav`);
          await prepareBackground({request,srt,range:s.range,output:file,
            onProcess:proc=>{s.proc=proc;},isCancelled:()=>s.cancelled,
            status:stage=>{
              if (stage === 'separate_gpu' || stage === 'separate_cpu') s.settings.backgroundDevice = stage.slice(9);
              const text = stage === 'download' ? 'Video sesi indiriliyor…'
                : stage === 'separate_gpu' ? 'Müzik ve ortam sesi ayrılıyor · GPU (CUDA)…'
                  : stage === 'separate_cpu' ? 'Müzik ve ortam sesi ayrılıyor · CPU…' : 'Müzik ve ortam sesi ayrılıyor…';
              emit(s,'status',{text});
            }});
          if (s.cancelled) throw new Error('İptal edildi.');
          grantMedia(file); background={url:pathToFileURL(file).href}; s.settings.keepBackground=true;
        } catch (error) {
          if (s.cancelled) throw error;
          s.proc=null; s.settings.backgroundError=String(error.message).slice(0,600);
          emit(s,'warning',{text:'Arka plan ayırma başarısız; yalnız dublaj üretilecek.'});
        }
      }
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
          let sync = null;
          if (timingMode === 'video') {
            try {
              const syncFile = output.replace(/\.wav$/i, '.sync.json');
              if (fs.statSync(syncFile).size > 2000000) throw new Error('map too large');
              sync = validateSync(JSON.parse(fs.readFileSync(syncFile, 'utf8')));
            } catch (_) { finish(s, 'error', { error: 'Ses üretildi ancak dublaj zaman haritası okunamadı.' }); return; }
          }
          grantMedia(output);
          finish(s, 'done', { path: output, url: pathToFileURL(output).href,
            name: path.basename(srt, '.srt') + (s.range ? `-${s.range.start}-${s.range.end}s` : '') + '-dublaj.wav', timing: s.timing || null, range: s.range, sync, background });
        } else {
          const details = s.tail.split(/\r?\n/).filter(l => /^(ValueError|RuntimeError|UYARI|Error)/.test(l)).slice(-3).join('\n');
          finish(s, 'error', { error: s.spawnError || details || 'Ses üretimi başarısız oldu.' });
        }
      });
      return { ok: true, id: s.id };
    } catch (error) { if (job === s) job = null; finish(s, s.cancelled ? 'cancelled' : 'error', { error: error.message }); throw error; }
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
