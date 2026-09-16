'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { app, BrowserWindow } = require('electron');

const root = path.resolve(__dirname, '..');
const out = path.join(root, '.uiprev', 'browser-cea-full-ui-smoke');
fs.mkdirSync(out, { recursive: true });
process.env.WHISPER_RESOURCE_SOAK_USER_DATA = path.join(out, `profile-${process.pid}-${Date.now()}`);
fs.mkdirSync(process.env.WHISPER_RESOURCE_SOAK_USER_DATA, { recursive: true });
app.setAppPath(root);
app.setPath('userData', process.env.WHISPER_RESOURCE_SOAK_USER_DATA);
app.commandLine.appendSwitch('disable-gpu');
require('../src/main.js');

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function until(fn, label, timeout = 20000) {
  const end = Date.now() + timeout;
  while (Date.now() < end) {
    const value = await fn();
    if (value) return value;
    await wait(120);
  }
  throw new Error(`${label} zaman aşımı`);
}

app.whenReady().then(async () => {
  const win = await until(() => BrowserWindow.getAllWindows().find((item) =>
    item.webContents.getURL().includes('index.html') && !item.webContents.isLoading()), 'Ana pencere');
  const run = (code) => win.webContents.executeJavaScript(`(async()=>{${code}})()`, true);
  await until(() => run('return typeof initialSettingsReady !== "undefined" ? await initialSettingsReady.then(()=>true) : false'), 'Ayarlar');
  await run(`
    openPlayer();
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    setWorkspaceMode('browser', false);
    return true;
  `);
  await until(() => run('return !player.browserWorkspaceShowBusy && player.browserActiveTabId'), 'Tarayıcı sekmesi');
  const ready = await run(`
    const tab = browserTabState();
    player.browserTracks = [{ id:'native-cc1', path:'C:\\\\test\\\\native.srt', language:'en',
      label:'1-CC1', format:'html5-track', cueCount:7, role:'source' }];
    player.browserCeaCapture = { state:'ready', available:true, completed:0, total:312,
      missing:312, cueCount:0, message:'Tam kaynak altyazı planı hazır.',
      tracks:[{ instreamId:'CC1', language:'en', name:'English', standard:'cea-608' }] };
    if (tab) { tab.browserTracks=player.browserTracks.slice(); tab.browserCeaCapture=player.browserCeaCapture; }
    renderBrowserTracks('native-cc1');
    setSettingsPage('browser-subtitles');
    setSettingsDrawer(true);
    const button=document.getElementById('browserTrackCaptureFull');
    return { visible:button.getBoundingClientRect().width>0, disabled:button.disabled,
      button:button.textContent, matched:browserTrackMatchesCeaPlan(player.browserTracks[0]),
      prefetch:shouldAcquireFullCeaBeforeTranslation(player.browserTracks[0]) };
  `);
  assert.equal(ready.visible, true);
  assert.equal(ready.disabled, false);
  assert.equal(ready.button, 'Tüm altyazıyı getir');
  assert.equal(ready.matched, true);
  assert.equal(ready.prefetch, true);
  await run(`
    const tab = browserTabState();
    player.browserTracks = [{ id:'cea-ui', path:'C:\\\\test\\\\web.srt', language:'en',
      label:'1-CC1', format:'cea-608', captureKind:'embedded-cea', cueCount:7, role:'source' }];
    player.browserCeaCapture = { state:'running', completed:84, total:312, failed:0,
      cueCount:126, message:'Gömülü altyazı getiriliyor.', planReason:'duration-gap',
      plannedDuration:465, expectedDuration:1860, durationPercent:25 };
    if (tab) { tab.browserTracks=player.browserTracks.slice(); tab.browserCeaCapture=player.browserCeaCapture; }
    renderBrowserTracks('cea-ui');
    setBrowserSignalVisible(true);
    setSettingsPage('browser-subtitles');
    setSettingsDrawer(true);
    return true;
  `);
  win.setContentSize(1366, 900);
  await wait(250);
  const wide = await run(`
    const button=document.getElementById('browserTrackCaptureFull');
    const status=document.getElementById('browserTrackCaptureStatus');
    return { visible:button.getBoundingClientRect().width>0, disabled:button.disabled,
      button:button.textContent, status:status.textContent,
      overflow:document.documentElement.scrollWidth>document.documentElement.clientWidth };
  `);
  assert.equal(wide.visible, true);
  assert.equal(wide.disabled, false);
  assert.equal(wide.button, 'Yakalamayı durdur');
  assert.match(wide.status, /84\/312 segment/);
  assert.match(wide.status, /süre kapsamı %25/);
  assert.equal(wide.overflow, false);
  fs.writeFileSync(path.join(out, 'cea-full-wide.png'), (await win.webContents.capturePage()).toPNG());

  win.setContentSize(940, 820);
  await run("setSettingsPage('browser-subtitles');setSettingsDrawer(true);syncResponsivePlayerLayout();return true");
  await wait(250);
  const narrow = await run(`
    const button=document.getElementById('browserTrackCaptureFull');
    const status=document.getElementById('browserTrackCaptureStatus');
    const actions=document.getElementById('browserTrackActions').getBoundingClientRect();
    return { visible:button.getBoundingClientRect().width>0, statusVisible:status.getBoundingClientRect().height>0,
      viewport:document.documentElement.clientWidth, right:actions.right,
      buttonClass:button.className, actionsClass:document.getElementById('browserTrackActions').className,
      layerClass:document.getElementById('playerLayer').className, takeover:player.narrowPanelTakeover };
  `);
  assert.equal(narrow.visible, true);
  assert.equal(narrow.statusVisible, true);
  assert.ok(narrow.right <= narrow.viewport + 1);
  fs.writeFileSync(path.join(out, 'cea-full-narrow.png'), (await win.webContents.capturePage()).toPNG());
  console.log(JSON.stringify({ ok: true, wide, narrow }));
  app.exit(0);
}).catch((error) => {
  fs.writeFileSync(path.join(out, 'error.txt'), String(error.stack || error));
  console.error(error);
  app.exit(1);
});
