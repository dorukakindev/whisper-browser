'use strict';

// Offline visual interaction smoke: the native WebContentsView and renderer
// toolbar coexist. Screenshots are local test artifacts, never golden assets.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { app, BrowserWindow, webContents, session, desktopCapturer } = require('electron');

const root = path.resolve(__dirname, '..');
const out = path.join(root, '.uiprev', 'browser-menu-visual');
fs.mkdirSync(out, { recursive: true });
const profile = path.join(out, `profile-${process.pid}-${Date.now()}`);
fs.mkdirSync(profile, { recursive: true });
process.env.WHISPER_RESOURCE_SOAK_USER_DATA = profile;
app.setAppPath(root);
app.setPath('userData', profile);
app.commandLine.appendSwitch('disable-gpu');
const watchdog = setTimeout(() => { console.error('Browser menu visual smoke timed out'); app.exit(1); }, 60000);
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

async function captureWindow(win, name) {
  const sources = await desktopCapturer.getSources({ types: ['window'],
    thumbnailSize: { width: 1440, height: 900 } });
  const source = sources.find((item) => item.name === win.getTitle()
    && !item.thumbnail.isEmpty());
  assert(source, `The app window is unavailable to desktopCapturer: ${win.getTitle()}`);
  const image = source.thumbnail;
  fs.writeFileSync(path.join(out, name), image.toPNG());
  return image;
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
  session.fromPartition('persist:whisper-browser').protocol.handle('https', (request) => {
    if (new URL(request.url).hostname !== 'menu-visual.test') return new Response('Not found', { status: 404 });
    const html = '<!doctype html><meta charset="utf-8"><title>Offline video fixture</title>'
      + '<body style="margin:0;background:#10151d;color:white"><video controls '
      + 'poster="data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' '
      + 'width=\'1280\' height=\'720\'%3E%3Crect width=\'1280\' height=\'720\' '
      + 'fill=\'%2319232e\'/%3E%3Ctext x=\'80\' y=\'100\' fill=\'white\' '
      + 'font-size=\'36\'%3EOffline video fixture%3C/text%3E%3C/svg%3E" '
      + 'style="display:block;width:100vw;height:90vh"></video></body>';
    return new Response(html, { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
  });
  const win = await until(() => BrowserWindow.getAllWindows().find((item) =>
    item.webContents.getURL().includes('index.html') && !item.webContents.isLoading()), 'App window');
  win.setContentSize(1440, 900);
  win.show();
  const run = (body) => win.webContents.executeJavaScript(`(async()=>{${body}})()`, true);
  await until(() => run('return typeof initialSettingsReady !== "undefined" ? await initialSettingsReady.then(()=>true) : false'), 'Settings');
  await run('openPlayer();await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));setWorkspaceMode("browser",false);return true');
  await until(() => run('return !player.browserWorkspaceShowBusy && player.browserActiveTabId'), 'Browser tab');
  const nav = await run('document.getElementById("browserAddress").value="https://menu-visual.test/watch";return navigateBrowserFromAddress()');
  assert.equal(nav.ok, true, nav.error);
  await until(async () => {
    const fixture = webContents.getAllWebContents().find((item) =>
      item.getURL() === 'https://menu-visual.test/watch' && !item.isLoading());
    return fixture && fixture.executeJavaScript('!!document.querySelector("video") && document.title === "Offline video fixture"');
  }, 'Fixture video page');
  await run('closeBrowserToolbarMenus();setBrowserSignalVisible(false,false);return true');
  await wait(350);
  const closed = await captureWindow(win, 'closed.png');

  await run('document.querySelector("#browserTranslateMenu summary").click();return true');
  await until(() => run('return document.getElementById("browserTranslateMenu").open'), 'Translation menu');
  await run('return syncBrowserOcclusion()');
  await wait(350);
  const translated = await captureWindow(win, 'translate-open.png');
  assert(changedPixels(closed, translated) > 500, 'Translation menu is not visibly painted over the browser view');
  const translationGeometry = await run('const r=document.querySelector("#browserTranslateMenu .browser-menu-popover").getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height};');
  assert(translationGeometry.width > 100 && translationGeometry.height > 50);
  assert(translationGeometry.y + translationGeometry.height > 200,
    'Translation menu must overlap the native browser surface');
  assert(menuForegroundPixels(translated, translationGeometry, win.getBounds()) > 100,
    'The translation menu text was not painted in the window screenshot');

  await run('closeBrowserToolbarMenus();document.querySelector("#browserMoreMenu summary").click();return true');
  await until(() => run('return document.getElementById("browserMoreMenu").open'), 'More menu');
  await run('return syncBrowserOcclusion()');
  await wait(350);
  const more = await captureWindow(win, 'more-open.png');
  assert(changedPixels(closed, more) > 500, 'More menu is not visibly painted over the browser view');
  const moreGeometry = await run('const r=document.querySelector("#browserMoreMenu .browser-menu-popover").getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height};');
  assert(moreGeometry.y + moreGeometry.height > 200);
  assert(menuForegroundPixels(more, moreGeometry, win.getBounds()) > 100,
    'The More menu text was not painted in the window screenshot');
  console.log(JSON.stringify({ ok: true, translateChangedPixels: changedPixels(closed, translated),
    moreChangedPixels: changedPixels(closed, more), output: out }));
  clearTimeout(watchdog);
  app.quit();
}).catch((error) => { console.error(error); app.exit(1); });
