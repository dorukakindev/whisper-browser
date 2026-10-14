'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

function registerDubService({ app, ipcMain, dialog, owner, authorized, authorizeSubtitle,
  spawn, terminate, busy, grantMedia, environment }) {
  let job = null;
  const configPath = () => path.join(app.getPath('userData'), 'dub-settings.json');
  function config() {
    let saved = {};
    try { saved = JSON.parse(fs.readFileSync(configPath(), 'utf8')); } catch (_) {}
    const engine = saved.engine || path.join(app.getPath('desktop'), 'Ses', 'VoxCPM2');
    return { engine, reference: saved.reference || path.join(engine, 'anlatici_ham.wav'),
      transcript: saved.transcript || path.join(engine, 'anlatici_ham.txt') };
  }
  function emit(s, type, data = {}) {
    if (!s.sender.isDestroyed()) s.sender.send('dub:event', { id: s.id, type, ...data });
  }
  const guard = fn => async (e, ...args) => {
    if (!authorized(e)) return { ok: false, error: 'Yetkisiz istek.' };
    try { return await fn(e, ...args); } catch (error) { return { ok: false, error: error.message }; }
  };
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
    if (job || busy()) throw new Error('Başka bir üretim çalışıyor; bitmesini bekleyin.');
    if (!/^[a-zA-Z0-9-]{1,80}$/.test(request.id || '')) throw new Error('Geçersiz iş kimliği.');
    const s = { id: request.id, sender: e.sender, proc: null, cancelled: false, tail: '' };
    job = s;
    try {
      const c = config();
      const python = path.join(c.engine, '.venv', 'Scripts', 'python.exe');
      const script = path.join(c.engine, 'altyazi_oku.py');
      for (const file of [python, script, c.reference, c.transcript]) {
        if (!fs.existsSync(file)) throw new Error('VoxCPM2 motoru veya ses referansı bulunamadı.');
      }
      const srt = await authorizeSubtitle(request.srt);
      if (path.extname(srt).toLowerCase() !== '.srt') throw new Error('Bir SRT altyazı dosyası seçin.');
      if (s.cancelled) { job = null; emit(s, 'cancelled'); return { ok: false, error: 'İptal edildi.' }; }
      const outputDir = path.join(app.getPath('userData'), 'dub-output');
      fs.mkdirSync(outputDir, { recursive: true });
      const output = path.join(outputDir, `${s.id}.wav`);
      if (fs.existsSync(output)) throw new Error('Bu işin ses çıktısı zaten var.');
      const args = [script, srt, c.reference, '--transcript', c.transcript, '--mode', 'hifi',
        '--gruplama', 'cumle', '--output', output];
      if (request.sample === true) args.push('--limit', '11');
      emit(s, 'status', { text: 'Motor yükleniyor…' });
      const env = { ...environment(), HF_HUB_DISABLE_XET: '1' };
      const torchLib = path.join(c.engine, '.venv', 'Lib', 'site-packages', 'torch', 'lib');
      if (fs.existsSync(torchLib)) env.PATH = torchLib + path.delimiter + (env.PATH || env.Path || '');
      for (const key of Object.keys(env)) if (key !== 'PATH' && key.toLowerCase() === 'path') delete env[key];
      s.proc = spawn(python, args, { cwd: c.engine, env, windowsHide: true });
      let pending = '';
      function line(value) {
        s.tail = (s.tail + '\n' + value).slice(-6000);
        const progress = value.match(/^\[(\d+)\/(\d+)\]/);
        if (progress) emit(s, 'progress', { done: Number(progress[1]), total: Number(progress[2]) });
        else if (/^Plan:/.test(value)) emit(s, 'status', { text: 'Cümle grupları hazır' });
        else if (/Referans hazir/.test(value)) emit(s, 'status', { text: 'Ses üretiliyor…' });
        else if (/^Zamanlama:/.test(value)) emit(s, 'status', { text: 'Ses zaman çizelgesine yerleştiriliyor…' });
      }
      s.proc.stdout.setEncoding('utf8'); s.proc.stderr.setEncoding('utf8');
      s.proc.stdout.on('data', text => { pending = (pending + text).slice(-131072); const lines = pending.split(/\r?\n/); pending = lines.pop(); lines.forEach(line); });
      s.proc.stderr.on('data', text => { s.tail = (s.tail + text).slice(-6000); });
      s.proc.on('error', error => { s.spawnError = error.message; });
      s.proc.on('close', code => {
        if (pending) line(pending);
        if (job === s) job = null;
        if (s.cancelled) { emit(s, 'cancelled'); return; }
        if (code === 0 && fs.existsSync(output)) {
          grantMedia(output);
          emit(s, 'done', { path: output, url: pathToFileURL(output).href, name: path.basename(srt, '.srt') + '-dublaj.wav' });
        } else {
          const details = s.tail.split(/\r?\n/).filter(l => /^(ValueError|RuntimeError|UYARI|Error)/.test(l)).slice(-3).join('\n');
          emit(s, 'error', { error: s.spawnError || details || 'Ses üretimi başarısız oldu.' });
        }
      });
      return { ok: true, id: s.id };
    } catch (error) { if (job === s) job = null; throw error; }
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
  return { running: () => !!job, cancel };
}
module.exports = { registerDubService };
