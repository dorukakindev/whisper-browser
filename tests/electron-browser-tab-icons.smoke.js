'use strict';
// R124 Adım 5: sekme ikonu kalıcılığı — başlık güncellemesi favicon/avatar'ı
// silmemeli (R123-B5: open.textContent ataması ikon öğesini eziyordu).
// electron tests/electron-browser-tab-icons.smoke.js
const { app, BrowserWindow, webContents, session } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..');
const out = path.join(root, '.uiprev', 'browser-tab-icons');
fs.mkdirSync(out, { recursive: true });
process.env.WHISPER_RESOURCE_SOAK_USER_DATA = path.join(out, `profile-${process.pid}-${Date.now()}`);
fs.mkdirSync(process.env.WHISPER_RESOURCE_SOAK_USER_DATA, { recursive: true });
app.setAppPath(root); app.commandLine.appendSwitch('disable-gpu');
app.commandLine.appendSwitch('disable-backgrounding-occluded-windows');
const watchdog = setTimeout(() => { console.error('Sekme ikonu testi zaman aşımı'); app.exit(1); }, 90000);
require('../src/main.js');
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
async function until(fn, label, timeout = 30000) {
  const end = Date.now() + timeout; let value;
  while (Date.now() < end) { value = await fn(); if (value) return value; await wait(150); }
  throw new Error(`${label} zaman aşımı: ${JSON.stringify(value)}`);
}
const FAVICON_SVG = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><rect width="16" height="16" fill="#c33"/></svg>';
app.whenReady().then(async () => {
  session.fromPartition('persist:whisper-browser').protocol.handle('https', request => {
    const url = new URL(request.url);
    if (url.hostname !== 'icon-smoke.test') return new Response('Test dışında', { status: 404 });
    if (url.pathname === '/favicon.ico')
      return new Response(FAVICON_SVG, { headers: { 'Content-Type': 'image/svg+xml' } });
    return new Response(`<!doctype html><meta charset="utf-8"><title>İlk Başlık</title>
      <link rel="icon" href="https://icon-smoke.test/favicon.ico"><h1>Sayfa</h1>`,
      { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
  });
  const win = await until(() => BrowserWindow.getAllWindows().find(item => item.webContents.getURL().includes('index.html') && !item.webContents.isLoading()), 'Ana pencere');
  win.setContentSize(1280, 860); win.show(); win.focus();
  const run = code => win.webContents.executeJavaScript(`(async()=>{${code}})()`, true);
  await until(() => run('return typeof initialSettingsReady !== "undefined" ? await initialSettingsReady.then(()=>true) : false'), 'Ayarlar');
  await run('openPlayer();setWorkspaceMode("browser",false);return true');
  await until(() => run('return !player.browserWorkspaceShowBusy && player.browserActiveTabId'), 'Sekme');
  const nav = await run('document.getElementById("browserAddress").value="https://icon-smoke.test/";return navigateBrowserFromAddress()');
  assert.equal(nav.ok, true, nav.error);
  const page = await until(() => webContents.getAllWebContents().find(item => item.getURL() === 'https://icon-smoke.test/'), 'Sayfa');
  await until(() => page.executeJavaScript('document.readyState === "complete"'), 'Yükleme');

  const tabProbe = `const tab=document.querySelector('.browser-tab.active');
    return tab ? { favicon: !!tab.querySelector('.browser-tab-favicon'),
      avatar: !!tab.querySelector('.browser-tab-avatar'),
      label: (tab.querySelector('.browser-tab-label')||{}).textContent || '' } : null`;
  // İkon kurulana dek bekle (favicon iner ya da harf avatarı kurulur).
  await until(async () => { const p = await run(`return (()=>{${tabProbe}})()`); return p && (p.favicon || p.avatar) ? p : false; }, 'Sekme ikonu');

  // Başlık güncellemesi → page-title-updated → sekme yeniden boyanır; ikon kalmalı.
  await page.executeJavaScript('document.title = "Yeni Başlık"; true');
  await until(async () => { const p = await run(`return (()=>{${tabProbe}})()`); return p && /Yeni Başlık/.test(p.label) ? p : false; }, 'Sekme başlığı');
  await wait(500); // R123-B5 regresyonu tam burada ikonu silerdi — iki render turu bekle
  const probe = await run(`return (()=>{${tabProbe}})()`);
  assert(probe && (probe.favicon || probe.avatar), `Başlık güncellemesi ikonu sildi: ${JSON.stringify(probe)}`);
  fs.writeFileSync(path.join(out, 'tab-icon.png'), (await win.webContents.capturePage()).toPNG());
  console.log(JSON.stringify({ ok: true, ...probe }));
  clearTimeout(watchdog); app.quit();
}).catch(error => { console.error(error); app.exit(1); });
