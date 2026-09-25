'use strict';
// R124 Adım 5: arka plansız sayfada WebContentsView temel rengi beyaz olmalı —
// siyah metin siyah zeminde okunamazdı (R123-B1).
// electron tests/electron-browser-page-bg.smoke.js
const { app, BrowserWindow, webContents, session } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..');
const out = path.join(root, '.uiprev', 'browser-page-bg');
fs.mkdirSync(out, { recursive: true });
process.env.WHISPER_RESOURCE_SOAK_USER_DATA = path.join(out, `profile-${process.pid}-${Date.now()}`);
fs.mkdirSync(process.env.WHISPER_RESOURCE_SOAK_USER_DATA, { recursive: true });
app.setAppPath(root); app.commandLine.appendSwitch('disable-gpu');
app.commandLine.appendSwitch('disable-backgrounding-occluded-windows');
const watchdog = setTimeout(() => { console.error('Sayfa zemini testi zaman aşımı'); app.exit(1); }, 90000);
require('../src/main.js');
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
async function until(fn, label, timeout = 30000) {
  const end = Date.now() + timeout; let value;
  while (Date.now() < end) { value = await fn(); if (value) return value; await wait(150); }
  throw new Error(`${label} zaman aşımı: ${JSON.stringify(value)}`);
}
app.whenReady().then(async () => {
  session.fromPartition('persist:whisper-browser').protocol.handle('https', request => {
    const url = new URL(request.url);
    if (url.hostname !== 'bg-smoke.test') return new Response('Test dışında', { status: 404 });
    // Hiçbir arka plan tanımlamayan sayfa — body/html background yok.
    return new Response('<!doctype html><meta charset="utf-8"><title>Zeminsiz</title><p style="color:#000">Siyah metin</p>',
      { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
  });
  const win = await until(() => BrowserWindow.getAllWindows().find(item => item.webContents.getURL().includes('index.html') && !item.webContents.isLoading()), 'Ana pencere');
  win.setContentSize(1280, 860); win.show(); win.focus();
  const run = code => win.webContents.executeJavaScript(`(async()=>{${code}})()`, true);
  await until(() => run('return typeof initialSettingsReady !== "undefined" ? await initialSettingsReady.then(()=>true) : false'), 'Ayarlar');
  await run('openPlayer();setWorkspaceMode("browser",false);return true');
  await until(() => run('return !player.browserWorkspaceShowBusy && player.browserActiveTabId'), 'Sekme');
  const nav = await run('document.getElementById("browserAddress").value="https://bg-smoke.test/";return navigateBrowserFromAddress()');
  assert.equal(nav.ok, true, nav.error);
  const page = await until(() => webContents.getAllWebContents().find(item => item.getURL() === 'https://bg-smoke.test/'), 'Sayfa');
  await until(() => page.executeJavaScript('document.readyState === "complete"'), 'Yükleme');
  await wait(600); // ilk boyama
  const image = await page.capturePage();
  const size = image.getSize();
  const bitmap = image.getBitmap();
  // BGRA byte dizisi — merkez pikseli oku
  const cx = Math.floor(size.width / 2), cy = Math.floor(size.height / 2);
  const offset = (cy * size.width + cx) * 4;
  const pixel = { b: bitmap[offset], g: bitmap[offset + 1], r: bitmap[offset + 2], a: bitmap[offset + 3] };
  fs.writeFileSync(path.join(out, 'page-bg.png'), image.toPNG());
  const lum = 0.2126 * pixel.r + 0.7152 * pixel.g + 0.0722 * pixel.b;
  assert(lum > 200, `Sayfa merkezi beyaz olmalı, piksel=${JSON.stringify(pixel)} parlaklık=${lum.toFixed(0)}`);
  console.log(JSON.stringify({ ok: true, center: pixel, luminance: Math.round(lum), size }));
  clearTimeout(watchdog); app.quit();
}).catch(error => { console.error(error); app.exit(1); });
