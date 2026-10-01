'use strict';

// Bare-window smoke paylaşımlı IPC stub'ı: gerçek renderer açılışta ve yüzey
// turunda birçok kanalı çağırır; src/main.js'i require etmeyen smoke'larda
// stub'suz kalan kanallar Electron'ın stderr'ine "No handler registered"
// basıyor (gürültü — ürün kusuru değil, ama çıktıyı okumayı zorlaştırır).
// Bu helper'a yalnız zararsız varsayılanlar eklenir; senaryoya özel davranış
// gereken kanallar her smoke'un kendi mock'larında kalır.
// Kullanım: mock kayıtlarından ÖNCE require('./electron-stub-ipc').registerBareWindowIpcStubs()

const { ipcMain } = require('electron');

function registerBareWindowIpcStubs() {
  const handle = (channel, fn) => {
    try { ipcMain.handle(channel, fn); } catch (_) {}
  };
  handle('app:getEnvInfo', async () => ({ ok: false, error: 'stub' }));
  handle('browser:adblock:getState', () => ({ enabled: false, supported: true }));
  handle('browser:network:setOnline', () => ({ ok: true }));
  handle('browser:playerAdPrune:getState', () => ({ enabled: false }));
  handle('browser:setOccluded', () => ({ ok: true }));
  handle('burnin:recovery:get', () => ({ ok: true, available: false }));
  handle('history:list', async () => []);
  handle('settings:load', () => ({}));
  handle('youtube-tv:state', () => ({ ok: true, state: { open: false }, userAgents: [] }));
  handle('library:list', async () => []);
  handle('queue:load', async () => ({ ok: true, data: null }));
  ipcMain.on('queue:saveSync', (event) => { event.returnValue = { ok: true }; });
  ipcMain.on('settings:saveSync', (event) => { event.returnValue = { ok: true }; });
}

module.exports = { registerBareWindowIpcStubs };
