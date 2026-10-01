// Madde-41: IPC yetki sınırları — gerçek Electron fixture'ı.
// Yetkisiz bir ikinci webContents (mainWindow dışı renderer) ayrıcalıklı
// ipcMain.handle kanallarını çağırdığında hepsi reddedilmeli ve yan etki
// doğmamalı; `ipcMain.on` kanalları yanlış gönderenden sessizce düşmeli.
// Çalıştırma: node_modules/.bin/electron tests/electron-ipc-authority.smoke.js --disable-gpu
'use strict';
const { app, BrowserWindow, ipcMain } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..');
const out = path.join(root, '.uiprev', 'ipc-authority-smoke');
fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(out, { recursive: true });
process.env.WHISPER_RESOURCE_SOAK_USER_DATA = path.join(out, `profile-${process.pid}`);
fs.mkdirSync(process.env.WHISPER_RESOURCE_SOAK_USER_DATA, { recursive: true });
app.setAppPath(root);
app.commandLine.appendSwitch('disable-gpu');
require('../src/main.js');
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function until(fn, label, timeout = 25000) {
  const deadline = Date.now() + timeout;
  let last;
  while (Date.now() < deadline) {
    last = await fn();
    if (last) return last;
    await wait(150);
  }
  throw new Error(`${label} zaman aşımı`);
}

// Düşman pencerenin preload'u: contextBridge ile ham ipcRenderer.invoke.
const evilPreload = path.join(out, 'evil-preload.js');
fs.writeFileSync(evilPreload, `'use strict';
const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('evil', {
  invoke: (channel, args) => ipcRenderer.invoke(channel, args),
  send: (channel, args) => ipcRenderer.send(channel, args),
});
`);
const evilPage = path.join(out, 'evil.html');
fs.writeFileSync(evilPage, '<!doctype html><meta charset="utf-8"><title>evil</title>');

// Yetkili sınırı: dosya yazma, süreç başlatma, ağ isteği, sistem eylemi.
const PRIVILEGED_CHANNELS = [
  ['transcribe:start', { input: 'C:\\evil.mp4' }],
  ['burnin:start', { videoPath: 'x.mp4', subtitlePath: 'x.srt' }],
  ['media:writeSubtitle', { filePath: path.join(out, 'hostile.srt'), content: '1\n00:00:00,000 --> 00:00:01,000\nX\n' }],
  ['media:download', { url: 'https://evil.example/x' }],
  ['media:saveImage', { url: 'https://evil.example/x.png', filePath: path.join(out, 'hostile.png') }],
  ['invidious:downloadStream', { url: 'https://evil.example/x' }],
  ['settings:import', { path: path.join(out, 'hostile-settings.json') }],
  ['subscriptions:import', { path: path.join(out, 'subs.json') }],
  ['paths:scanMedia', [out]],
  ['maintenance:updateYtdlp', {}],
  ['shell:openExternal', 'https://evil.example'],
  ['shell:openPath', out],
  ['dialog:openFile', 'video'],
  ['browser:session:import', { path: path.join(out, 'session.json') }],
  ['library:upsert', { key: 'x', title: 'x' }],
  ['integrity:scan', {}],
];

app.whenReady().then(async () => {
  const mainWin = await until(() => BrowserWindow.getAllWindows()
    .find((w) => !w.isDestroyed() && w.webContents?.mainFrame), 'ana pencere');
  // Pozitif kontrol: meşru renderer (ana pencere) aynı kapıdan geçebilmeli.
  const legit = await mainWin.webContents.executeJavaScript(
    'window.api && window.api.getEnvInfo ? window.api.getEnvInfo() : null', true);
  assert(legit && legit.ok !== false && !/Yetkisiz/.test(JSON.stringify(legit)),
    'Meşru renderer getEnvInfo çağrısı yanlışlıkla reddedildi.');

  // Düşman pencere: preload + contextIsolation + sandbox.
  const evil = new BrowserWindow({ width: 400, height: 300, show: false, webPreferences: {
    preload: evilPreload, contextIsolation: true, nodeIntegration: false, sandbox: true,
  } });
  await evil.webContents.loadFile(evilPage);
  assert(evil.webContents !== mainWin.webContents, 'Düşman pencere ana webContents oldu.');
  const failures = [];
  for (const [channel, arg] of PRIVILEGED_CHANNELS) {
    const res = await evil.webContents.executeJavaScript(
      `window.evil.invoke(${JSON.stringify(channel)}, ${JSON.stringify(arg)})
        .then(r => r).catch(e => ({ thrown: String(e && e.message || e) }))`, true);
    const rejected = res && (res.ok === false || res.thrown) && /Yetkisiz|unauthor/i.test(JSON.stringify(res));
    if (!rejected) failures.push(`${channel} → ${JSON.stringify(res)?.slice(0, 160)}`);
  }
  assert.equal(failures.length, 0, `Yetkisiz çağrı reddedilmedi: ${failures.join(' | ')}`);
  // Yan etki kanıtı: düşman istenen dosya yazılmadı.
  assert(!fs.existsSync(path.join(out, 'hostile.srt')), 'Yetkisiz altyazı yazıldı.');
  assert(!fs.existsSync(path.join(out, 'hostile.png')), 'Yetkisiz görsel kaydedildi.');

  // ipcMain.on kanalı yanlış gönderenden: fake ACK sessizce düşmeli (throw yok,
  // pending olmayan token yok sayılır).
  const ackResult = await evil.webContents.executeJavaScript(
    `(() => { window.evil.send('library:flush-before-close-complete', 'forged-token'); return true; })()`, true);
  assert.equal(ackResult, true, 'on-kanalı send çağrısı asıldı.');

  // Düşmanı kapat; ana pencere ve IPC yüzeyi sağlam kalmalı.
  evil.destroy();
  const stillOk = await mainWin.webContents.executeJavaScript(
    'window.api.getEnvInfo()', true);
  assert(stillOk && stillOk.ok !== false, 'Düşman pencere kapanışı ana renderer IPC sini bozdu.');
  console.log('ipc-authority-smoke: 16 yetkisiz kanal reddedildi, yan etki yok.');
  app.exit(0);
});
