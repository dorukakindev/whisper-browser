'use strict';
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');
const { app, BrowserWindow, session, ipcMain } = require('electron');
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'whisper-youtube-guard-'));
app.setPath('userData', profile);
let win;
const channel = 'browser:youtube-guard:policy';
const timer = setTimeout(() => { console.error('youtube guard smoke timed out'); app.exit(1); }, 20000);

async function run() {
  await app.whenReady();
  const ses = session.fromPartition(`youtube-guard-${process.pid}`);
  ses.registerPreloadScript({ type: 'frame', filePath: path.resolve(__dirname, '../src/youtube-ad-preload.js') });
  const payload = { videoDetails: { videoId: 'fixture' }, captions: { tracks: ['preserved'] },
    streamingData: { formats: ['preserved'] }, adPlacements: [1], adSlots: [2], adBreakHeartbeatParams: 'ad' };
  const serialized = JSON.stringify(payload);
  await ses.protocol.handle('https', request => {
    if (new URL(request.url).pathname.startsWith('/youtubei/')) {
      return new Response(serialized, { headers: { 'content-type': 'application/json' } });
    }
    return new Response(`<!doctype html><title>YouTube guard fixture</title>
      <script>
        window.ytInitialPlayerResponse = ${serialized};
        window.inlineSawAd = !!ytInitialPlayerResponse.adPlacements;
        window.initialStage = document.readyState;
        window.ordinaryValue = JSON.parse('{"subtitle":"Türkçe altyazı"}').subtitle;
        window.fetchResult = fetch('/youtubei/v1/player').then(r=>r.json());
        window.xhrResult = new Promise(resolve=>{const x=new XMLHttpRequest();
          x.open('GET','/youtubei/v1/player');x.responseType='json';x.onload=()=>resolve(x.response);x.send();});
      </script>
      <ytd-rich-item-renderer id="ordinary">Normal video</ytd-rich-item-renderer>
      <ytd-rich-item-renderer id="sponsored"><ytd-ad-slot-renderer>Sponsored</ytd-ad-slot-renderer></ytd-rich-item-renderer>`,
    { headers: { 'content-type': 'text/html; charset=utf-8' } });
  });
  ipcMain.on(channel, (event) => { event.returnValue = { enabled: event.sender === win?.webContents }; });
  win = new BrowserWindow({ show: false, width: 900, height: 600, webPreferences: {
    session: ses, contextIsolation: true, sandbox: true, nodeIntegration: false,
  } });
  await win.loadURL('https://www.youtube.com/watch?v=fixture');
  await new Promise(resolve => setTimeout(resolve, 200));
  const result = await win.webContents.executeJavaScript(`(async()=>({
    inlineSawAd,initialStage,ordinaryValue,
    fetchAd:!!(await fetchResult).adSlots,xhrAd:!!(await xhrResult).adPlacements,
    caption:ytInitialPlayerResponse.captions.tracks[0],format:ytInitialPlayerResponse.streamingData.formats[0],
    guardActive:window.__whisperYoutubeAdGuard?.active,
    guardStage:window.__whisperYoutubeAdGuard?.installedAt,
    adDisplay:getComputedStyle(document.getElementById('sponsored')).display,
    normalDisplay:getComputedStyle(document.getElementById('ordinary')).display,
    apiExposed:typeof window.api,requireExposed:typeof window.require
  }))()`);
  assert.equal(result.inlineSawAd, false, 'first inline script received ad metadata');
  assert.equal(result.initialStage, 'loading');
  assert.equal(result.guardStage, 'loading', 'guard must precede the first inline script');
  assert.equal(result.fetchAd, false);
  assert.equal(result.xhrAd, false);
  assert.equal(result.caption, 'preserved');
  assert.equal(result.format, 'preserved');
  assert.equal(result.adDisplay, 'none');
  assert.notEqual(result.normalDisplay, 'none');
  assert.equal(result.ordinaryValue, 'Türkçe altyazı');
  assert.equal(result.apiExposed, 'undefined');
  assert.equal(result.requireExposed, 'undefined');
  win.webContents.send('browser:youtube-guard:policy-changed', { enabled: false });
  await new Promise(resolve => setTimeout(resolve, 100));
  const disabled = await win.webContents.executeJavaScript(`({active:!!window.__whisperYoutubeAdGuard,
    adDisplay:getComputedStyle(document.getElementById('sponsored')).display,
    fresh:JSON.parse(${JSON.stringify(serialized)}).adSlots.length})`);
  assert.equal(disabled.active, false);
  assert.notEqual(disabled.adDisplay, 'none');
  assert.equal(disabled.fresh, 1);
  console.log('electron-youtube-guard: document-start/main world, literal/JSON/fetch/XHR, cards, isolation and disable passed', result);
}

run().then(() => finish(0), error => { console.error(error); finish(1); });
function finish(code) {
  clearTimeout(timer);
  win?.destroy();
  ipcMain.removeAllListeners(channel);
  const resolved = path.resolve(profile);
  if (path.dirname(resolved) === path.resolve(os.tmpdir()) && path.basename(resolved).startsWith('whisper-youtube-guard-')) {
    try { fs.rmSync(resolved, { recursive: true, force: true }); } catch (_) {}
  }
  app.exit(code);
}
