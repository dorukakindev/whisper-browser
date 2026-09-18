'use strict';

// R67-01 regresyon smoke'u: renderer.js top-level TDZ çökmesi SmartTube'u ölü
// bırakıyordu ("İçerik yükleniyor…"da takılma). Bu smoke gerçek index.html +
// preload'i gizli pencerede yükler, console hatalarını toplar ve SmartTube
// fonksiyonlarının değerlendirilmiş olduğunu doğrular — kaynak-regex testleri
// bu sınıfı yakalayamaz.

const { app, BrowserWindow } = require('electron');
const path = require('node:path');

const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
const assert = (value, message) => { if (!value) throw new Error(message); };

async function main() {
  const consoleErrors = [];
  const win = new BrowserWindow({
    show: false,
    width: 1280,
    height: 800,
    webPreferences: {
      preload: path.resolve(__dirname, '..', 'src', 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  win.webContents.on('console-message', (_e, _level, message) => {
    if (/ReferenceError|TypeError|is not defined|Uncaught/i.test(message)) {
      consoleErrors.push(message);
    }
  });
  let crashed = false;
  win.webContents.on('render-process-gone', () => { crashed = true; });

  await win.webContents.loadFile(path.resolve(__dirname, '..', 'src', 'renderer', 'index.html'));
  await delay(1500);

  assert(!crashed, 'renderer süreci çöktü');
  assert(consoleErrors.length === 0,
    `renderer boot'ta uncaught hata: ${consoleErrors.slice(0, 3).join(' | ')}`);

  const probe = await win.webContents.executeJavaScript(`({
    api: typeof window.api === 'object' && window.api !== null,
    invidiousFeed: typeof window.api?.invidiousFeed === 'function',
    stGrid: !!document.getElementById('stGrid'),
    smarttube: !!document.getElementById('smarttubeBrowser'),
    // TDZ sonrası tanımlanan fonksiyonlar — script 22006'dan ölürse bunlar yok
    renderSection: typeof renderSmartTubeSection === 'function',
    fetchFeed: typeof fetchInvidiousFeed === 'function',
    initSmartTube: typeof initSmartTube === 'function',
    cardRenderer: typeof buildSmartTubeCard === 'function',
    loginModal: !!document.getElementById('invidiousLoginModal'),
  })`, true);

  const missing = Object.entries(probe).filter(([, v]) => !v).map(([k]) => k);
  assert(missing.length === 0, `SmartTube boot eksikleri: ${missing.join(', ')}`);

  win.close();
  console.log(JSON.stringify({ ok: true, probe }));
}

app.whenReady().then(main).then(() => app.quit()).catch(error => {
  console.error(error);
  app.exit(1);
});
