'use strict';
// R124 Adım 5: menü/omnibox açıkken sayfa siyaha dönmemeli — donmuş kare
// .browser-frozen + --browser-freeze-image ile yuvada kalmalı (R120-P1).
// electron tests/electron-browser-frozen-frame.smoke.js
const { app, BrowserWindow, webContents, session } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..');
const out = path.join(root, '.uiprev', 'browser-frozen-frame');
fs.mkdirSync(out, { recursive: true });
process.env.WHISPER_RESOURCE_SOAK_USER_DATA = path.join(out, `profile-${process.pid}-${Date.now()}`);
fs.mkdirSync(process.env.WHISPER_RESOURCE_SOAK_USER_DATA, { recursive: true });
app.setAppPath(root); app.commandLine.appendSwitch('disable-gpu');
app.commandLine.appendSwitch('disable-backgrounding-occluded-windows');
const watchdog = setTimeout(() => { console.error('Donmuş kare testi zaman aşımı'); app.exit(1); }, 90000);
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
    if (url.hostname !== 'freeze-smoke.test') return new Response('Test dışında', { status: 404 });
    return new Response('<!doctype html><meta charset="utf-8"><title>Freeze</title><body style="background:#f5f0e8"><h1>Donmuş kare sayfası</h1>',
      { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
  });
  const win = await until(() => BrowserWindow.getAllWindows().find(item => item.webContents.getURL().includes('index.html') && !item.webContents.isLoading()), 'Ana pencere');
  win.setContentSize(1280, 860); win.show(); win.focus();
  const run = code => win.webContents.executeJavaScript(`(async()=>{${code}})()`, true);
  await until(() => run('return typeof initialSettingsReady !== "undefined" ? await initialSettingsReady.then(()=>true) : false'), 'Ayarlar');
  await run('openPlayer();setWorkspaceMode("browser",false);return true');
  await until(() => run('return !player.browserWorkspaceShowBusy && player.browserActiveTabId'), 'Sekme');
  const nav = await run('document.getElementById("browserAddress").value="https://freeze-smoke.test/";return navigateBrowserFromAddress()');
  assert.equal(nav.ok, true, nav.error);
  await until(() => webContents.getAllWebContents().find(item => item.getURL() === 'https://freeze-smoke.test/'), 'Sayfa');
  await wait(400);

  const slotProbe = `const s=document.getElementById('browserViewSlot');
    return { frozen: s.classList.contains('browser-frozen'),
      image: (s.style.getPropertyValue('--browser-freeze-image')||'').startsWith('url(\"data:') }`;
  // ⋯ menüsünü gerçek toggle yoluyla aç → syncBrowserOcclusion → snapshot + freeze
  await run('document.getElementById("browserMoreMenu").open = true; return true');
  const frozen = await until(async () => { const p = await run(`return (()=>{${slotProbe}})()`); return p.frozen && p.image ? p : false; }, 'Donmuş kare');
  assert(frozen.frozen && frozen.image, JSON.stringify(frozen));
  // Omnibox sonuç paneli de aynı mekanizmadan geçer.
  fs.writeFileSync(path.join(out, 'menu-frozen.png'), (await win.webContents.capturePage()).toPNG());
  await run('document.getElementById("browserMoreMenu").open = false; return true');
  await until(async () => { const p = await run(`return (()=>{${slotProbe}})()`); return !p.frozen ? p : false; }, 'Kapanışta çözülme');
  console.log(JSON.stringify({ ok: true, ...frozen }));
  clearTimeout(watchdog); app.quit();
}).catch(error => { console.error(error); app.exit(1); });
