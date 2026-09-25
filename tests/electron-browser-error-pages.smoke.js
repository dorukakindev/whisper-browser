'use strict';
// R124 Adım 5: sayfa hata yüzeyleri — boş gövdeli HTTP ≥400 tam hata ekranı,
// gövdeli 404 sitenin içeriği olarak kalır, DNS/bağlantı hatası sayfa bağlamlı mesaj.
// electron tests/electron-browser-error-pages.smoke.js
const { app, BrowserWindow, webContents, session, net } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..');
const out = path.join(root, '.uiprev', 'browser-error-pages');
fs.mkdirSync(out, { recursive: true });
process.env.WHISPER_RESOURCE_SOAK_USER_DATA = path.join(out, `profile-${process.pid}-${Date.now()}`);
fs.mkdirSync(process.env.WHISPER_RESOURCE_SOAK_USER_DATA, { recursive: true });
app.setAppPath(root); app.commandLine.appendSwitch('disable-gpu');
app.commandLine.appendSwitch('disable-backgrounding-occluded-windows');
const watchdog = setTimeout(() => { console.error('Hata sayfaları testi zaman aşımı'); app.exit(1); }, 120000);
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
    if (url.hostname === 'err-smoke.test' && url.pathname === '/empty-502')
      return new Response(null, { status: 502 });
    if (url.hostname === 'err-smoke.test' && url.pathname === '/body-404')
      return new Response('<!doctype html><meta charset="utf-8"><title>Kayıp</title><h1>Sitenin kendi 404 sayfası</h1>',
        { status: 404, headers: { 'Content-Type': 'text/html; charset=utf-8' } });
    // Tanınmayan host'lar gerçek ağa düşer → nxdomain-fake.invalid DNS hatası üretir.
    // Reddedilen fetch'i olduğu gibi döndür: gerçek ERR_NAME_NOT_RESOLVED yolu.
    return net.fetch(request);
  });
  const win = await until(() => BrowserWindow.getAllWindows().find(item => item.webContents.getURL().includes('index.html') && !item.webContents.isLoading()), 'Ana pencere');
  win.setContentSize(1280, 860); win.show(); win.focus();
  const run = code => win.webContents.executeJavaScript(`(async()=>{${code}})()`, true);
  await until(() => run('return typeof initialSettingsReady !== "undefined" ? await initialSettingsReady.then(()=>true) : false'), 'Ayarlar');
  await run('openPlayer();setWorkspaceMode("browser",false);return true');
  await until(() => run('return !player.browserWorkspaceShowBusy && player.browserActiveTabId'), 'Sekme');
  const gotoUrl = async url => run(`document.getElementById("browserAddress").value=${JSON.stringify(url)};return navigateBrowserFromAddress()`);
  const surface = () => run(`const s=document.getElementById('browserErrorSurface');return s&&!s.classList.contains('hidden')?{title:document.getElementById('browserErrorTitle').textContent,message:document.getElementById('browserErrorMessage').textContent,code:(document.getElementById('browserErrorCode')||{}).textContent||'',retry:!document.getElementById('browserErrorRetry').classList.contains('hidden')}:null`);

  // 1) Boş gövdeli 502 → tam hata ekranı + Tekrar dene
  let nav = await gotoUrl('https://err-smoke.test/empty-502');
  assert.equal(nav.ok, true, nav.error);
  await until(async () => { const s = await surface(); return s && s.code.includes('502') && s.retry ? s : false; }, 'Boş 502 hata ekranı');
  const s502 = await surface();
  assert(s502.title && s502.message.includes('502'), JSON.stringify(s502));

  // 2) Gövdeli 404 → sitenin kendi içeriği; hata yüzeyi gizli kalmalı
  nav = await gotoUrl('https://err-smoke.test/body-404');
  assert.equal(nav.ok, true, nav.error);
  const body404 = await until(() => webContents.getAllWebContents().find(item => item.getURL() === 'https://err-smoke.test/body-404'), '404 sayfası');
  await until(() => body404.executeJavaScript('document.readyState === "complete" && /kendi 404/.test(document.body.innerText)'), '404 gövdesi');
  await wait(800); // boş-gövde kontrolünün karar vermesine izin ver
  assert.equal(await surface(), null, 'Gövdeli 404 hata ekranı göstermemeli');

  // 3) DNS hatası → bağlamsal sayfa mesajı (oynatma teşhisi değil).
  // http yolu protocol.handle dışına çıkar → gerçek ERR_NAME_NOT_RESOLVED.
  // Yükleme başarısız olduğundan navigateBrowserFromAddress hata döndürebilir —
  // denetlenen şey yüzey.
  nav = await gotoUrl('http://nxdomain-fake.invalid/');
  await until(async () => { const s = await surface(); return s && s.retry ? s : false; }, 'DNS hata ekranı');
  const sDns = await surface();
  assert(sDns.title && /alan adı|DNS|bulunamadı|adresi|domain|address|not found/i.test(sDns.message), JSON.stringify(sDns));

  // 4) Bağlantı reddi (çevrimdışı benzeri yol) → aynı yüzey
  nav = await gotoUrl('http://127.0.0.1:9/kapali');
  await until(async () => { const s = await surface(); return s && s.retry ? s : false; }, 'Bağlantı reddi ekranı');
  const sRef = await surface();
  assert(sRef.title && sRef.message, JSON.stringify(sRef));
  fs.writeFileSync(path.join(out, 'error-surface.png'), (await win.webContents.capturePage()).toPNG());
  console.log(JSON.stringify({ ok: true, empty502: s502.title, dns: sDns.title, refused: sRef.title }));
  clearTimeout(watchdog); app.quit();
}).catch(error => { console.error(error); app.exit(1); });
