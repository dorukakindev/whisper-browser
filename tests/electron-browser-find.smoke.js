'use strict';
// R124 Adım 5: sayfada bul akışının uçtan uca kabulü — Ctrl+F gerçek tuş yolu,
// sayaç "N / M", sonraki/önceki sarma, Esc ile kapanış.
// electron tests/electron-browser-find.smoke.js
const { app, BrowserWindow, webContents, session } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..');
const out = path.join(root, '.uiprev', 'browser-find');
fs.mkdirSync(out, { recursive: true });
process.env.WHISPER_RESOURCE_SOAK_USER_DATA = path.join(out, `profile-${process.pid}-${Date.now()}`);
fs.mkdirSync(process.env.WHISPER_RESOURCE_SOAK_USER_DATA, { recursive: true });
app.setAppPath(root); app.commandLine.appendSwitch('disable-gpu');
app.commandLine.appendSwitch('disable-backgrounding-occluded-windows');
const watchdog = setTimeout(() => { console.error('Sayfada bul testi zaman aşımı'); app.exit(1); }, 90000);
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
    if (url.hostname !== 'find-smoke.test') return new Response('Test dışında', { status: 404 });
    return new Response('<!doctype html><meta charset="utf-8"><title>Bul testi</title><p>elma elma elma</p><p>armut</p>',
      { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
  });
  const win = await until(() => BrowserWindow.getAllWindows().find(item => item.webContents.getURL().includes('index.html') && !item.webContents.isLoading()), 'Ana pencere');
  win.setContentSize(1280, 860); win.show(); win.focus();
  const run = code => win.webContents.executeJavaScript(`(async()=>{${code}})()`, true);
  await until(() => run('return typeof initialSettingsReady !== "undefined" ? await initialSettingsReady.then(()=>true) : false'), 'Ayarlar');
  await run('openPlayer();setWorkspaceMode("browser",false);return true');
  await until(() => run('return !player.browserWorkspaceShowBusy && player.browserActiveTabId'), 'Sekme');
  const nav = await run('document.getElementById("browserAddress").value="https://find-smoke.test/";return navigateBrowserFromAddress()');
  assert.equal(nav.ok, true, nav.error);
  const page = await until(() => webContents.getAllWebContents().find(item => item.getURL() === 'https://find-smoke.test/'), 'Sayfa');
  await until(() => page.executeJavaScript('document.readyState === "complete"'), 'Sayfa yükleme');

  // Gerçek Ctrl+F yolu: sayfanın before-input-event'i find-open yayar.
  page.sendInputEvent({ type: 'rawKeyDown', keyCode: 'F', modifiers: ['control'] });
  const barOpen = await until(() => run('return !document.getElementById("browserFindBar").classList.contains("hidden")'), 'Ctrl+F çubuğu', 15000);
  assert(barOpen, 'Ctrl+F bul çubuğunu açmadı');
  await run('const i=document.getElementById("browserFindInput");i.value="elma";i.dispatchEvent(new Event("input",{bubbles:true}));return true');
  // R123 açık bulgu: sayaç "Aranıyor…"da kalmamalı — found-in-page sonucu "1 / 3"e ulaşmalı.
  await until(() => run('return /^\\d+ \\/ \\d+$/.test(document.getElementById("browserFindCount").textContent) ? document.getElementById("browserFindCount").textContent : false'), 'Sayaç "N / M"');
  assert.equal(await run('return document.getElementById("browserFindCount").textContent'), '1 / 3');
  await run('document.getElementById("browserFindNext").click();return true');
  await until(() => run('return document.getElementById("browserFindCount").textContent === "2 / 3"'), 'Sonraki bul');
  await run('document.getElementById("browserFindPrevious").click();return true');
  await until(() => run('return document.getElementById("browserFindCount").textContent === "1 / 3"'), 'Önceki bul');
  await run('document.getElementById("browserFindBar").dispatchEvent(new KeyboardEvent("keydown",{key:"Escape",bubbles:true}));return true');
  await until(() => run('return document.getElementById("browserFindBar").classList.contains("hidden")'), 'Esc kapanışı');
  fs.writeFileSync(path.join(out, 'find-done.png'), (await win.webContents.capturePage()).toPNG());
  console.log(JSON.stringify({ ok: true, find: '1 / 3 → 2 / 3 → 1 / 3 → kapandı' }));
  clearTimeout(watchdog); app.quit();
}).catch(error => { console.error(error); app.exit(1); });
