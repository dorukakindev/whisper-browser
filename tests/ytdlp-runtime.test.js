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
  // Gerçek paket imzası — RUNTIME_REQUIRED_MODULES ile aynı dosya takımı:
  // __init__+version tek başına yeterli sayılmaz; YoutubeDL/extractor olmadan
  // dizin "kısmen silinmiş" sayılmalı (R309 yarım-paket kapısı).
  const REQUIRED = ['__init__.py', 'version.py', 'YoutubeDL.py', path.join('extractor', '__init__.py')];
  for (const pkg of [current, previous]) {
    for (const rel of REQUIRED) {
      const abs = path.join(pkg, 'yt_dlp', rel);
      fs.mkdirSync(path.dirname(abs), { recursive: true });
      fs.writeFileSync(abs, rel === 'version.py' ? '__version__ = "x"\n' : '');
    }
  }
  fs.writeFileSync(path.join(root, 'active.json'), JSON.stringify({
    path: 'packages/yt-dlp-current',
    previous: 'packages/yt-dlp-previous',
  }));

  assert.equal(activeRuntimePath(root), current);
  const env = pythonEnvWithRuntime({ PYTHONPATH: 'C:\\existing' }, root);
  assert.equal(env.PYTHONPATH, `${current}${path.delimiter}C:\\existing`);

  // R309: yarım silinmiş paket — __init__.py durur ama version.py (gerçek
  // doğrulama modülü) gitmişse bozuk dizin dönmemeli, previous'a düşülmeli.
  fs.rmSync(path.join(current, 'yt_dlp', 'version.py'));
  assert.equal(activeRuntimePath(root), previous, 'bozuk aktif sürümde önceki sürüme düşülmedi');
  fs.writeFileSync(path.join(current, 'yt_dlp', 'version.py'), '__version__ = "1.0"\n');
  assert.equal(activeRuntimePath(root), current, 'sağlam aktif sürüm pointer dışına çıktı');

  fs.rmSync(current, { recursive: true, force: true });
  assert.equal(activeRuntimePath(root), previous, 'eksik aktif sürümde önceki doğrulanmış sürüme düşülmedi');
  // previous da yarım-silinmişse venv yedeğine düşülür (PYTHONPATH eklenmez)
  fs.rmSync(path.join(previous, 'yt_dlp', 'version.py'));
  assert.equal(activeRuntimePath(root), '', 'iki sürüm de bozuksa bozuk dizin döndü');
  fs.writeFileSync(path.join(previous, 'yt_dlp', 'version.py'), '__version__ = "0.9"\n');
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
