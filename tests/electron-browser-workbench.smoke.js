'use strict';

// Browser çalışma tezgâhı gerçek-Electron duman testi (çevrimdışı fixture): araç çubuğu kontrolleri
// örtülmeden erişilebilir, menüler yerel WebContentsView üstünde boyanır ve pencereye sığar,
// İşler göstergesi ve Ayarlar çekmecesi araç çubuğunu bozmaz. Görüntüler yerel çıktıdır, altın dosya değildir.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { app, BrowserWindow, webContents, session, desktopCapturer, nativeTheme, screen } = require('electron');

const root = path.resolve(__dirname, '..');
const out = path.join(root, '.uiprev', 'browser-workbench');
fs.mkdirSync(out, { recursive: true });
const profile = path.join(out, `profile-${process.pid}-${Date.now()}`);
fs.mkdirSync(profile, { recursive: true });
process.env.WHISPER_RESOURCE_SOAK_USER_DATA = profile;
app.setAppPath(root);
app.setPath('userData', profile);
app.commandLine.appendSwitch('disable-gpu');
const watchdog = setTimeout(() => { console.error('Browser workbench smoke timed out'); app.exit(1); }, 120000);
require('../src/main.js');

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function until(fn, label, timeout = 20000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    const result = await fn();
    if (result) return result;
    await wait(120);
  }
  throw new Error(`${label} timed out`);
}

// X11'de desktopCapturer 'window' kaynaklarını _NET_CLIENT_LIST üzerinden
// numaralandırır — çıplak Xvfb'te WM olmadığından liste boş döner. Bir kere
// hafif bir WM başlatmayı dene; zaten WM'li ortamda (gerçek masaüstü, Windows)
// pencere kaynakları vardır ve burası dokunmaz.
let wmProc = null;
async function ensureWindowManager() {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const sources = await desktopCapturer.getSources({ types: ['window'],
      thumbnailSize: { width: 16, height: 16 } });
    if (sources.length) return;
    if (!wmProc && attempt === 0) {
      const { spawn, spawnSync } = require('node:child_process');
      for (const wm of ['kwin_x11', 'openbox', 'metacity', 'xfwm4', 'mutter']) {
        if (spawnSync('which', [wm]).status === 0) {
          wmProc = spawn(wm, ['--replace'], { stdio: 'ignore' });
          wmProc.on('error', () => {});
          break;
        }
      }
    }
    await wait(1500);
  }
}

async function captureWindow(win, name) {
  const sources = await desktopCapturer.getSources({ types: ['window'],
    thumbnailSize: { width: 1920, height: 1200 } });
  const source = sources.find((item) => item.name === win.getTitle()
    && !item.thumbnail.isEmpty());
  assert(source, `The app window is unavailable to desktopCapturer: ${win.getTitle()}`);
  const image = source.thumbnail;
  fs.writeFileSync(path.join(out, name), image.toPNG());
  return image;
}

// Ardışık iki kare piksel olarak sabitlenene kadar bekle — compositor boyaması
// tamamlanmadan yakalanan tek kare flaky üretir.
async function captureStableWindow(win, name) {
  return until(async () => {
    const a = await captureWindow(win, `${name}.a.png`);
    const b = await captureWindow(win, name);
    return changedPixels(a, b) < 40 ? b : null;
  }, `Kararli pencere karesi (${name})`);
}

// Verilen piksel koşulu tutana kadar yakalamayı dene.
async function captureWhen(win, name, predicate, label) {
  return until(async () => {
    const image = await captureWindow(win, name);
    return predicate(image) ? image : null;
  }, label || `Gorunur pencere durumu (${name})`);
}

function changedPixels(left, right) {
  assert.deepEqual(left.getSize(), right.getSize(), 'Window capture size changed');
  const a = left.toBitmap(), b = right.toBitmap();
  let changed = 0;
  for (let index = 0; index < a.length; index += 4) {
    if (Math.abs(a[index] - b[index]) + Math.abs(a[index + 1] - b[index + 1])
        + Math.abs(a[index + 2] - b[index + 2]) > 48) changed++;
  }
  return changed;
}

function menuForegroundPixels(image, rect, windowBounds) {
  const { width, height } = image.getSize();
  const sx = width / windowBounds.width, sy = height / windowBounds.height;
  const left = Math.max(0, Math.floor(rect.x * sx));
  const top = Math.max(0, Math.floor(rect.y * sy));
  const right = Math.min(width, Math.ceil((rect.x + rect.width) * sx));
  const bottom = Math.min(height, Math.ceil((rect.y + rect.height) * sy));
  const bitmap = image.toBitmap();
  let foreground = 0;
  for (let y = top + 8; y < bottom - 8; y++) {
    for (let x = left + 8; x < right - 8; x++) {
      const offset = (y * width + x) * 4;
      if (Math.max(bitmap[offset], bitmap[offset + 1], bitmap[offset + 2]) > 120) foreground++;
    }
  }
  return foreground;
}

app.whenReady().then(async () => {
  nativeTheme.themeSource = 'dark';
  session.fromPartition('persist:whisper-browser').protocol.handle('https', (request) => {
    if (new URL(request.url).hostname !== 'workbench.test') return new Response('Not found', { status: 404 });
    const html = '<!doctype html><meta charset="utf-8"><title>Offline video fixture</title>'
      + '<body style="margin:0;background:#10151d;color:white"><video controls style="display:block;width:100vw;height:90vh"></video></body>';
    return new Response(html, { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
  });
  const win = await until(() => BrowserWindow.getAllWindows().find((item) =>
    item.webContents.getURL().includes('index.html') && !item.webContents.isLoading()), 'App window');
  const display = screen.getAllDisplays().find((item) => /asus/i.test(item.label)) || screen.getPrimaryDisplay();
  win.setBounds(display.bounds);
  win.setFullScreen(true);
  win.show();
  await ensureWindowManager();
  const run = (code) => win.webContents.executeJavaScript(`(async()=>{${code}})()`, true);
  await until(() => run('return typeof initialSettingsReady !== "undefined" ? await initialSettingsReady.then(()=>true) : false'), 'Settings');
  await run('openPlayer();await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));setWorkspaceMode("browser",false);return true');
  await until(() => run('return !player.browserWorkspaceShowBusy && player.browserActiveTabId'), 'Browser tab');
  const nav = await run('document.getElementById("browserAddress").value="https://workbench.test/watch";return navigateBrowserFromAddress()');
  assert.equal(nav.ok, true, nav.error);
  await until(async () => {
    const fixture = webContents.getAllWebContents().find((item) => item.getURL() === 'https://workbench.test/watch' && !item.isLoading());
    return fixture && fixture.executeJavaScript('!!document.querySelector("video")');
  }, 'Fixture video page');
  await run('closeBrowserToolbarMenus();setBrowserSignalVisible(false,false);player.browserMediaSeen=true;updateBrowserSubtitleSummary();return true');
  if (process.argv.includes('--narrow-only')) {
    win.setFullScreen(false); win.setContentSize(940, 760);
    await until(() => run('return innerWidth===940'), 'Narrow viewport');
    await run('UiLocale.set("tr",false);if(!responsivePanelTakeoverActive())toggleBrowserPanelRail();renderBrowserJobsDock([{id:"narrow-fixture",label:"Whisper",state:"running"}]);return true');
    await wait(400);
    const narrow = await run(`const ids=['browserAddress','browserSidebarToggle','browserMoreMenu','browserAssistantOpen','browserSettingsQuick','browserJobsChip'];
      return {w:innerWidth,overflow:document.documentElement.scrollWidth>innerWidth,controls:ids.map(id=>{const e=document.getElementById(id),r=e.getBoundingClientRect();return{id,width:r.width,left:r.left,right:r.right,inside:r.width>0&&r.left>=0&&r.right<=innerWidth+1};})};`);
    assert(!narrow.overflow && narrow.controls.every(item=>item.inside), `Dar ekran taşması: ${JSON.stringify(narrow)}`);
    await captureWindow(win, 'narrow-jobs-tr.png');
    const closeVisible = await run('const b=document.getElementById("sideRailCollapse"),r=b.getBoundingClientRect(),top=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);return r.width>0&&!!top&&(top===b||b.contains(top));');
    assert(closeVisible, 'Dar panel kapatma kontrolü erişilemiyor');
    await run('document.getElementById("sideRailCollapse").click();return true');
    await until(()=>run('return !responsivePanelTakeoverActive()'), 'Narrow panel closed');
    await run('renderBrowserJobsDock([{id:"narrow-fixture",label:"Whisper",state:"running"}]);return true');
    const restored=await run(`return ['browserJobsChip','browserAssistantOpen','browserSettingsQuick','browserSidebarToggle','browserMoreMenu'].every(id=>{const e=document.getElementById(id),r=e.getBoundingClientRect(),top=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);return r.width>0&&!!top&&(top===e||e.contains(top));});`);
    assert(restored, 'Panel kapandıktan sonra araçlar örtülü kaldı');
    await captureWindow(win, 'narrow-closed-jobs-tr.png');
    console.log(JSON.stringify({ok:true,narrow,panelCloseReachable:closeVisible,toolbarRestored:restored,output:out}));clearTimeout(watchdog);if(wmProc)wmProc.kill();app.exit(0);return;
  }
  const closed = await captureStableWindow(win, 'closed.png');
  const viewport = await run('return {w:innerWidth,h:innerHeight}');
  const result = { viewport, display: { label: display.label, bounds: display.bounds, scale: display.scaleFactor }, checks: [] };

  // 1) Araç çubuğundaki ana kontroller pencerede ve örtülmeden erişilebilir.
  const reach = await run(`const out=[];for(const id of ['browserPanelMain','browserSubtitleSettingsToggle','browserAssistantOpen','browserSettingsQuick','browserSidebarToggle','browserMoreMenu']){
    const el=document.getElementById(id);const target=id==='browserMoreMenu'?el.querySelector('summary'):el;const r=target.getBoundingClientRect();
    const top=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);
    out.push({id,x:Math.round(r.x),right:Math.round(r.right),y:Math.round(r.y),visible:r.width>0&&r.height>0&&r.right<=innerWidth&&r.bottom<=innerHeight,uncovered:!!top&&(top===target||target.contains(top))});}
    return out;`);
  const compact = await run(`const q=(s)=>document.querySelector(s);const w=(e)=>e?Math.round(e.getBoundingClientRect().width):-1;
    const hub=q('#browserSubtitleSettingsToggle');const icon=hub.querySelector('svg:not(.browser-translate-caret)');
    return {container:Math.round(q('#browserWorkspace').getBoundingClientRect().width),hub:w(hub),hubIconVisible:!!icon&&icon.getBoundingClientRect().width>8&&getComputedStyle(icon).display!=='none',
      hubLabel:getComputedStyle(q('#browserSubtitleLabel')).display,page:w(q('#browserPageTranslate')),pageLabel:getComputedStyle(q('#browserPageLabel')).display,
      pageIcon:w(q('#browserPageTranslate svg')),group:w(q('.tb-page')),panelMain:w(q('#browserPanelMain'))};`);
  assert(compact.hubIconVisible && compact.hub >= 40, `Altyazı merkezi dar alanda simgesiz kaldı: ${JSON.stringify(compact)}`);
  if (compact.pageLabel === 'none') assert(compact.page <= 48, `Sayfayı çevir etiketsiz halde uzun hap kaldı: ${compact.page}px`);
  for (const item of reach) assert(item.visible && item.uncovered, `Araç çubuğu kontrolü erişilemiyor: ${JSON.stringify(item)}`);
  result.checks.push({ toolbarReachable: reach.map((item) => item.id) });

  // 2) Menüler: pencereye sığar, yerel sayfanın üstünde boyanır.
  const menus = [
    ['hub', '#browserTranslateMenu', '#browserTranslateMenu .browser-menu-popover'],
    ['more', '#browserMoreMenu', '#browserMoreMenu .browser-menu-popover'],
    ['page-translate', '#browserPageQuickMenu', '#browserPageQuickMenu .browser-menu-popover'],
  ];
  for (const [name, menuSel, popSel] of menus) {
    await run(`closeBrowserToolbarMenus();document.querySelector(${JSON.stringify(menuSel + ' > summary')}).click();return true`);
    await until(() => run(`return document.querySelector(${JSON.stringify(menuSel)}).open`), `${name} menüsü`);
    await run('return syncBrowserOcclusion()');
    const geo = await run(`const r=document.querySelector(${JSON.stringify(popSel)}).getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height,bottom:r.bottom,right:r.right,vh:innerHeight,vw:innerWidth};`);
    assert(geo.bottom <= geo.vh + 1 && geo.right <= geo.vw + 1 && geo.x >= 0, `${name} menüsü pencereye sığmıyor: ${JSON.stringify(geo)}`);
    const shot = await captureWhen(win, `${name}-open.png`, (image) => changedPixels(closed, image) > 500
      && menuForegroundPixels(image, geo, win.getBounds()) > 100, `${name} menüsü boyandı`);
    assert(changedPixels(closed, shot) > 500, `${name} menüsü yerel görünümün üstünde boyanmadı`);
    result.checks.push({ [name]: { width: Math.round(geo.width), height: Math.round(geo.height) } });
  }
  const groups = await run('const vis=(e)=>e.getClientRects().length>0;return [...document.querySelectorAll("#browserMoreMenu .browser-more-sub")].map(vis)');
  await run('closeBrowserToolbarMenus();document.querySelector("#browserMoreMenu > summary").click();return true');
  const moreItems = await run('return [...document.querySelectorAll("#browserMoreMenu .browser-more-sub-body > button")].filter((e)=>e.getClientRects().length>0).length');
  assert.equal(groups.length, 4); assert(moreItems >= 26, `⋯ menüsünde yalnız ${moreItems} komut görünür`);
  await run('closeBrowserToolbarMenus();return true');

  // 3) İşler göstergesi: çalışma, dublaj tamamlandı, hata.
  await run('renderBrowserJobsDock([{id:"d",label:"Ses üretimi",state:"running"}]);return true');
  await wait(400); await captureWindow(win, 'jobs-dub-running.png');
  await run('renderBrowserJobsDock([{id:"d",label:"Ses üretimi",state:"done"}]);return true');
  await wait(900); await captureWindow(win, 'jobs-dub-done.png');
  const chip = await run('const c=document.getElementById("browserJobsChip");const r=c.getBoundingClientRect();return {state:c.dataset.state,kind:c.dataset.kind,visible:!c.classList.contains("hidden")&&r.width>0&&r.right<=innerWidth,text:document.getElementById("browserJobsState").textContent}');
  assert(chip.visible && chip.state === 'done' && chip.kind === 'dub', `İşler göstergesi beklenen durumda değil: ${JSON.stringify(chip)}`);
  result.checks.push({ jobsChip: chip.text });
  await run('browserJobsDock.flash=null;renderBrowserJobsDock([]);return true');

  // 4) Ayarlar çekmecesi araç çubuğunu örtmez.
  await run('document.getElementById("browserSettingsQuick").click();return true');
  await until(() => run('return !document.getElementById("settingsDrawer").classList.contains("hidden")'), 'Ayarlar çekmecesi');
  await wait(500);
  const drawer = await run(`const d=document.getElementById("settingsDrawer").getBoundingClientRect();const tb=document.querySelector("#browserWorkspace .browser-toolbar").getBoundingClientRect();
    const hits=['browserSettingsQuick','browserAssistantOpen'].map((id)=>{const r=document.getElementById(id).getBoundingClientRect();const top=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);return {id,ok:!!top&&(top.id===id||document.getElementById(id).contains(top))}});
    return {drawerTop:Math.round(d.top),toolbarBottom:Math.round(tb.bottom),hits};`);
  assert(drawer.drawerTop >= drawer.toolbarBottom - 2, `Ayarlar çekmecesi araç çubuğunu örtüyor: ${JSON.stringify(drawer)}`);
  for (const hit of drawer.hits) assert(hit.ok, `Çekmece açıkken ${hit.id} örtülü`);
  await captureWindow(win, 'settings-drawer.png');
  result.checks.push({ settingsDrawer: drawer });
  await run('closeBrowserSettings?.();setSettingsDrawer(false);return true');

  // 5) Açık tema: araç çubuğu ve merkez menüsü okunur kalır (görüntü kaydı).
  nativeTheme.themeSource = 'light'; await wait(900);
  await run('closeBrowserToolbarMenus();document.querySelector("#browserTranslateMenu > summary").click();return true');
  await run('return syncBrowserOcclusion()'); await wait(500);
  await captureWindow(win, 'hub-light.png');
  console.log(JSON.stringify({ ok: true, ...result, output: out }));
  clearTimeout(watchdog);
  if (wmProc) wmProc.kill();
  app.exit(0);
}).catch((error) => { console.error(error); if (wmProc) wmProc.kill(); app.exit(1); });
