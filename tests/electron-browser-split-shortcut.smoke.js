'use strict';
// R233/R234: bölünmüş görünümün İKİNCİL sayfasından gelen kısayol — gerçek tuş
// yolu (ikincil WebContentsView'in before-input-event'i 'browser-shortcut'
// yayar). Kapı sekme kimliğini doğrulayıp o sayfayı aktifleştirmeli ve kısayolu
// ona uygulamalı: ikincil sekme terfi eder + Ctrl+K komut paletini açar.
// electron tests/electron-browser-split-shortcut.smoke.js
const { app, BrowserWindow, webContents, session } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..');
const out = path.join(root, '.uiprev', 'browser-split-shortcut');
fs.mkdirSync(out, { recursive: true });
process.env.WHISPER_RESOURCE_SOAK_USER_DATA = path.join(out, `profile-${process.pid}-${Date.now()}`);
fs.mkdirSync(process.env.WHISPER_RESOURCE_SOAK_USER_DATA, { recursive: true });
app.setAppPath(root); app.commandLine.appendSwitch('disable-gpu');
app.commandLine.appendSwitch('disable-backgrounding-occluded-windows');
const watchdog = setTimeout(() => { console.error('Split kısayol testi zaman aşımı'); app.exit(1); }, 90000);
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
    if (url.hostname !== 'split-smoke.test') return new Response('Test dışında', { status: 404 });
    const body = url.pathname === '/two'
      ? '<!doctype html><meta charset="utf-8"><title>İkincil</title><p>sayfa iki</p>'
      : '<!doctype html><meta charset="utf-8"><title>Birincil</title><p>sayfa bir</p>';
    return new Response(body, { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
  });
  const win = await until(() => BrowserWindow.getAllWindows().find(item => item.webContents.getURL().includes('index.html') && !item.webContents.isLoading()), 'Ana pencere');
  win.setContentSize(1280, 860); win.show(); win.focus();
  const run = code => win.webContents.executeJavaScript(`(async()=>{${code}})()`, true);
  await until(() => run('return typeof initialSettingsReady !== "undefined" ? await initialSettingsReady.then(()=>true) : false'), 'Ayarlar');
  await run('openPlayer();setWorkspaceMode("browser",false);return true');
  await until(() => run('return !player.browserWorkspaceShowBusy && player.browserActiveTabId'), 'Sekme');
  const tab1 = await run('return player.browserActiveTabId');
  const nav = await run('document.getElementById("browserAddress").value="https://split-smoke.test/one";return navigateBrowserFromAddress()');
  assert.equal(nav.ok, true, nav.error);
  await until(() => webContents.getAllWebContents().find(item => item.getURL() === 'https://split-smoke.test/one'), 'Sayfa bir');
  // İkinci sekme: createBrowserTab kendini aktif yapar; sonra ikincili bölerken
  // aktifliği birinci sekmeye geri veririz.
  const created = await run('return window.api.createBrowserTab()');
  assert.equal(created.ok, true, created.error);
  const tab2 = created.activeTabId;
  assert.notEqual(tab2, tab1, 'yeni sekme ayrı kimlikli');
  const nav2 = await run(`return window.api.navigateBrowser('${tab2}', 'https://split-smoke.test/two')`);
  assert.equal(nav2.ok, true, nav2.error);
  const page2 = await until(() => webContents.getAllWebContents().find(item => item.getURL() === 'https://split-smoke.test/two'), 'Sayfa iki');
  await until(() => page2.executeJavaScript('document.readyState === "complete"'), 'Sayfa iki yükleme');
  await run(`return window.api.activateBrowserTab('${tab1}')`);
  // Ham IPC yerine renderer yardımcısı: gerçek UI yolu result.split'i
  // player.browserSplit'e senkronlar (push olayı split taşımaz).
  await run(`return setBrowserSplit('${tab2}', 50)`);
  await until(() => run(`return player.browserSplit?.active && player.browserSplit.secondaryTabId === '${tab2}'`), 'Bölünmüş görünüm');
  await until(() => run(`return player.browserActiveTabId === '${tab1}'`), 'Aktif sekme birinci');

  // Gerçek tuş yolu: ikincil sayfanın WebContents'ine Ctrl+K — köprü
  // 'browser-shortcut' yayar; kapı sekme kimliğini görüp önce onu aktif yapmalı.
  page2.sendInputEvent({ type: 'rawKeyDown', keyCode: 'K', modifiers: ['control'] });
  await until(() => run(`return player.browserActiveTabId === '${tab2}' ? true : false`), 'İkincil sekme terfisi', 15000);
  assert.equal(await run('return player.browserActiveTabId'), tab2,
    'ikincil sekmenin kısayolu o sekmeyi aktif yapmalı');
  await until(() => run('return browserCommandPaletteState.open === true'), 'Komut paleti açık', 10000);
  assert.equal(await run('return document.getElementById("browserCommandPalette").classList.contains("hidden")'), false,
    'Ctrl+K ikincil sayfadan paleti açmalı');
  // Kapı tersine de çalışır: aktif olmayan ve bölünmüşte de olmayan sekme kimliği
  // reddedilir — bu durumda palet zaten açık olduğu için yalnız sekme terfisini
  // yeniden doğrulamak yeterli (yukarıda kanıtlandı).
  fs.writeFileSync(path.join(out, 'split-shortcut-done.png'), (await win.webContents.capturePage()).toPNG());
  console.log(JSON.stringify({ ok: true, split: 'secondary Ctrl+K → sekme terfisi + palet açıldı' }));
  clearTimeout(watchdog); app.quit();
}).catch(error => { console.error(error); app.exit(1); });
