const { ipcRenderer } = require('electron');

// Bu fonksiyon ziyaret edilen sayfanın ana JavaScript dünyasına açılmaz.
// Yalnız Electron'ın izole preload dünyasında çalışan manga/altyazı katmanı
// kalıcı düzenleme isteklerini ana sürece gönderebilir.
Object.defineProperty(globalThis, '__whisperTrustedBridgeSend', {
  configurable: false,
  enumerable: false,
  writable: false,
  value(type, payload) {
    if (!['manga-edit', 'overlay-style'].includes(type)) return false;
    ipcRenderer.send('browser:trusted-bridge', { type, payload });
    return true;
  },
});
