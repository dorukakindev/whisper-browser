'use strict';
// R240 (#176/#178 review): sekme önizleme kartı native WebContentsView'in üst
// çizgisini aşamaz (alt kenar ≤ slot.top, aşırı boyda maxHeight kelepçesi);
// aynı ilk harfli iki sitede avatar tonu bayat kalmaz.
// electron tests/electron-browser-tab-preview.smoke.js
const { app, BrowserWindow, webContents, session } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..');
const out = path.join(root, '.uiprev', 'browser-tab-preview');
fs.mkdirSync(out, { recursive: true });
process.env.WHISPER_RESOURCE_SOAK_USER_DATA = path.join(out, `profile-${process.pid}-${Date.now()}`);
fs.mkdirSync(process.env.WHISPER_RESOURCE_SOAK_USER_DATA, { recursive: true });
app.setAppPath(root); app.commandLine.appendSwitch('disable-gpu');
app.commandLine.appendSwitch('disable-backgrounding-occluded-windows');
const watchdog = setTimeout(() => { console.error('Önizleme testi zaman aşımı'); app.exit(1); }, 90000);
require('../src/main.js');
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
async function until(fn, label, timeout = 30000) {
  const end = Date.now() + timeout; let value;
  while (Date.now() < end) { value = await fn(); if (value) return value; await wait(150); }
  throw new Error(`${label} zaman aşımı: ${JSON.stringify(value)}`);
}
const PAGE = (name) => `<!doctype html><meta charset="utf-8"><title>${name}</title><h1>${name}</h1>`;
app.whenReady().then(async () => {
  session.fromPartition('persist:whisper-browser').protocol.handle('https', request => {
    const url = new URL(request.url);
    if (!/^[a-z]+-(one|two)\.test$/.test(url.hostname)) return new Response('Test dışında', { status: 404 });
    return new Response(PAGE(url.hostname), { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
  });
  const win = await until(() => BrowserWindow.getAllWindows().find(item => item.webContents.getURL().includes('index.html') && !item.webContents.isLoading()), 'Ana pencere');
  win.setContentSize(1280, 860); win.show(); win.focus();
  const run = code => win.webContents.executeJavaScript(`(async()=>{${code}})()`, true);
  await until(() => run('return typeof initialSettingsReady !== "undefined" ? await initialSettingsReady.then(()=>true) : false'), 'Ayarlar');
  await run('openPlayer();setWorkspaceMode("browser",false);return true');
  await until(() => run('return !player.browserWorkspaceShowBusy && player.browserActiveTabId'), 'Sekme');
  const nav = await run('document.getElementById("browserAddress").value="https://alpha-one.test/";return navigateBrowserFromAddress()');
  assert.equal(nav.ok, true, nav.error);
  await until(() => webContents.getAllWebContents().find(item => item.getURL() === 'https://alpha-one.test/'), 'Sayfa');
  await until(() => run('return !!document.querySelector(".browser-tab-avatar")'), 'Avatar');

  const avatarProbe = `const a=document.querySelector('.browser-tab.active .browser-tab-avatar');
    return a ? { letter: a.textContent, hue: a.style.getPropertyValue('--avatar-hue') } : null`;
  const first = await run(`return (()=>{${avatarProbe}})()`);
  assert(first && first.letter === 'A' && first.hue, `avatar beklenen yok: ${JSON.stringify(first)}`);

  // Önizleme kartı: doğrudan tetikle — alt kenar slot üst çizgisini aşamaz.
  const preview = await run(`const el=document.querySelector('.browser-tab.active');
    showBrowserTabPreview(player.browserActiveTabId, el);
    const card=document.querySelector('.browser-tab-preview');
    const slot=document.getElementById('browserViewSlot');
    const r=card ? card.getBoundingClientRect() : null;
    const s=slot ? slot.getBoundingClientRect() : null;
    const out={ exists: !!card, bottom: r ? r.bottom : -1, slotTop: s ? s.top : -1,
      maxHeight: card ? parseFloat(card.style.maxHeight) : NaN };
    hideBrowserTabPreview();
    return out`);
  assert(preview.exists, 'önizleme kartı oluşmadı');
  assert(preview.slotTop > 0, `slot üstü okunamadı: ${JSON.stringify(preview)}`);
  assert(preview.bottom <= preview.slotTop, `kart altı native yüzeye taştı: ${JSON.stringify(preview)}`);
  assert(Number.isFinite(preview.maxHeight) && preview.maxHeight <= preview.slotTop - 8, `maxHeight kelepçesi: ${JSON.stringify(preview)}`);

  // Aşırı boy: kartı CSS ile krom alanından uzun yap — kendi içinde kırpılmalı.
  const tall = await run(`const style=document.createElement('style');
    style.textContent='.browser-tab-preview{height:2000px !important}';
    document.head.appendChild(style);
    const el=document.querySelector('.browser-tab.active');
    showBrowserTabPreview(player.browserActiveTabId, el);
    const card=document.querySelector('.browser-tab-preview');
    const r=card ? card.getBoundingClientRect() : null;
    const out={ bottom: r ? r.bottom : -1, slotTop: document.getElementById('browserViewSlot').getBoundingClientRect().top,
      maxHeight: card ? parseFloat(card.style.maxHeight) : NaN };
    hideBrowserTabPreview();
    return out`);
  assert(tall.bottom <= tall.slotTop, `aşırı boy kart native yüzeye taştı: ${JSON.stringify(tall)}`);
  assert(tall.maxHeight <= tall.slotTop - 8, `aşırı boy maxHeight: ${JSON.stringify(tall)}`);

  // Aynı ilk harfli farklı alan adına geçiş: avatar harfi kalır, tonu yenilenmeli.
  const nav2 = await run('document.getElementById("browserAddress").value="https://apple-two.test/";return navigateBrowserFromAddress()');
  assert.equal(nav2.ok, true, nav2.error);
  await until(() => webContents.getAllWebContents().find(item => item.getURL() === 'https://apple-two.test/'), 'İkinci sayfa');
  // Yarışsız ölçüm: tonun DEĞİŞMESİNİ bekle — ilk avatar da 'A' okurdu.
  const second = await until(async () => {
    const p = await run(`return (()=>{${avatarProbe}})()`);
    return p && p.letter === 'A' && p.hue !== first.hue ? p : false;
  }, 'İkinci avatar tonu');
  assert(second.hue !== first.hue, `aynı harfli sitede avatar tonu bayat kaldı: ${JSON.stringify(first)} → ${JSON.stringify(second)}`);

  fs.writeFileSync(path.join(out, 'tab-preview.png'), (await win.webContents.capturePage()).toPNG());
  console.log(JSON.stringify({ ok: true, first, second, preview }));
  clearTimeout(watchdog);
  app.exit(0);
}).catch((err) => { console.error(err); app.exit(1); });
