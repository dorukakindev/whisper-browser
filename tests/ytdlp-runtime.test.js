'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { activeRuntimePath, pythonEnvWithRuntime, resolveInside } = require('../src/ytdlp-runtime');
const mainSource = fs.readFileSync(path.join(__dirname, '..', 'src', 'main.js'), 'utf8');

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'whisper-ytdlp-runtime-'));
try {
  const current = path.join(root, 'packages', 'yt-dlp-current');
  const previous = path.join(root, 'packages', 'yt-dlp-previous');
  fs.mkdirSync(path.join(current, 'yt_dlp'), { recursive: true });
  fs.mkdirSync(path.join(previous, 'yt_dlp'), { recursive: true });
  fs.writeFileSync(path.join(current, 'yt_dlp', '__init__.py'), '');
  fs.writeFileSync(path.join(previous, 'yt_dlp', '__init__.py'), '');
  fs.writeFileSync(path.join(root, 'active.json'), JSON.stringify({
    path: 'packages/yt-dlp-current',
    previous: 'packages/yt-dlp-previous',
  }));

  assert.equal(activeRuntimePath(root), current);
  const env = pythonEnvWithRuntime({ PYTHONPATH: 'C:\\existing' }, root);
  assert.equal(env.PYTHONPATH, `${current}${path.delimiter}C:\\existing`);

  fs.rmSync(current, { recursive: true, force: true });
  assert.equal(activeRuntimePath(root), previous, 'eksik aktif sürümde önceki doğrulanmış sürüme düşülmedi');
  assert.equal(resolveInside(root, '..\\outside'), '', 'runtime kökü dışına yol kaçışı kabul edildi');
  assert.equal(resolveInside(root, 'C:\\outside'), '', 'mutlak yol pointer olarak kabul edildi');
  assert(mainSource.includes("backend', 'update_ytdlp.py"), 'atomik updater üretim handlerına bağlı değil');
  assert(mainSource.includes('pythonRuntimeEnv({ PYTHONIOENCODING'), 'aktif yt-dlp runtime Python süreçlerine taşınmıyor');
  const updaterStart = mainSource.indexOf("ipcMain.handle('maintenance:updateYtdlp'");
  const updaterEnd = mainSource.indexOf("ipcMain.handle('transcribe:cancel'", updaterStart);
  assert(!/pip[^\n]*install/i.test(mainSource.slice(updaterStart, updaterEnd)), 'updater hâlâ venv içine doğrudan pip kuruyor');
  const mediaStart = mainSource.indexOf('function runMediaCommand');
  const mediaEnd = mainSource.indexOf("ipcMain.handle('media:probe'", mediaStart);
  const mediaBody = mainSource.slice(mediaStart, mediaEnd);
  assert(!/err\.message/.test(mediaBody), 'medya süreci ham spawn/traceback ayrıntısı döndürüyor');
  assert(/Medya yardımcı süreci/.test(mediaBody), 'medya süreci Türkçe sınıflı fallback kullanmıyor');
  console.log('  PASS  yt-dlp atomik runtime pointer ve geri dönüş sözleşmesi');
} finally {
  fs.rmSync(root, { recursive: true, force: true });
}
