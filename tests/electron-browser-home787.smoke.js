'use strict';
const { app, BrowserWindow, webContents, session, dialog } = require('electron');
const { findMediaTool } = require('./media-runtime');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const assert = require('node:assert/strict');

const root = path.resolve(__dirname, '..');
const out = path.join(root, '.uiprev', 'browser-home787');
fs.mkdirSync(out, { recursive: true });
process.env.WHISPER_RESOURCE_SOAK_USER_DATA = path.join(out, `profile-${process.pid}-${Date.now()}`);
fs.mkdirSync(process.env.WHISPER_RESOURCE_SOAK_USER_DATA, { recursive: true });
const ffmpeg = findMediaTool('ffmpeg') || 'ffmpeg';
const video = path.join(out, 'episode.webm');
const made = spawnSync(ffmpeg, ['-hide_banner', '-loglevel', 'error', '-f', 'lavfi', '-i',
  'color=c=navy:s=320x180:r=6:d=42', '-f', 'lavfi', '-i', 'sine=frequency=440:sample_rate=8000:duration=42',
  '-c:v', 'libvpx-vp9', '-deadline', 'realtime', '-cpu-used', '8', '-c:a', 'libopus', '-y', video], { windowsHide: true });
assert.equal(made.status, 0, String(made.stderr));
const reference = Array.from({ length: 28 }, (_, index) => {
  const start = 1 + index * 1.3 + (index % 3) * .08;
  return { start, end: start + .55 + (index % 2) * .15, text: `Sahne ${index + 1}` };
});
const target = reference.map(cue => ({ ...cue, start: cue.start + 3, end: cue.end + 3 }));
const stamp = seconds => {
  const ms = Math.round(seconds * 1000);
  return `00:${String(Math.floor(ms / 60000)).padStart(2, '0')}:${String(Math.floor(ms / 1000) % 60).padStart(2, '0')},${String(ms % 1000).padStart(3, '0')}`;
};
const srt = path.join(out, 'reference.srt');
fs.writeFileSync(srt, reference.map((cue, index) => `${index + 1}\n${stamp(cue.start)} --> ${stamp(cue.end)}\n${cue.text}\n`).join('\n'), 'utf8');
app.setAppPath(root); app.commandLine.appendSwitch('disable-gpu');
app.commandLine.appendSwitch('disable-backgrounding-occluded-windows');
const watchdog=setTimeout(()=>{console.error('Tasarım testi zaman aşımı');app.exit(1)},60000);
fs.writeFileSync(path.join(process.env.WHISPER_RESOURCE_SOAK_USER_DATA,'settings.json'),JSON.stringify({ui:{translateEndpointPreset:'custom',translateBaseUrl:'http://127.0.0.1:12345/v1',uiLocale:'tr'}}));
let releaseProvider,aborted=false;
const schedulerModule=require('../src/browser-translation-scheduler'),OriginalScheduler=schedulerModule.BrowserTranslationScheduler;
schedulerModule.BrowserTranslationScheduler=class extends OriginalScheduler{constructor(options){super({...options,translate:(sentence,call)=>new Promise(resolve=>{releaseProvider=()=>resolve({text:'Pencereyi aç.',parts:sentence.pieces.map(()=> 'Pencereyi aç.')});call.signal.addEventListener('abort',()=>{aborted=true;});})});}};
require('../src/main.js');

const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
async function until(fn, label, timeout = 30000) {
  const end = Date.now() + timeout; let value;
  while (Date.now() < end) { value = await fn(); if (value) return value; await wait(150); }
  throw new Error(`${label} zaman aşımı: ${JSON.stringify(value)}`);
}
app.whenReady().then(async () => {
  const bytes = fs.readFileSync(video);
  session.fromPartition('persist:whisper-browser').protocol.handle('https', request => {
    const url = new URL(request.url);
    if (url.hostname !== 'browser-analysis-ui.test') return new Response('Test dışında', { status: 404 });
    if (url.pathname === '/episode.webm') {
      const range = /bytes=(\d+)-(\d*)/.exec(request.headers.get('range') || '');
      if (range) {
        const first = Number(range[1]), last = range[2] ? Math.min(Number(range[2]), bytes.length - 1) : bytes.length - 1;
        return new Response(bytes.subarray(first, last + 1), { status: 206, headers: {
          'Content-Type': 'video/webm', 'Accept-Ranges': 'bytes',
          'Content-Range': `bytes ${first}-${last}/${bytes.length}`, 'Content-Length': String(last - first + 1),
        } });
      }
      return new Response(bytes, { headers: { 'Content-Type': 'video/webm', 'Accept-Ranges': 'bytes' } });
    }
    return new Response('<!doctype html><meta charset="utf-8"><video controls muted autoplay loop src="/episode.webm" style="width:90vw;height:70vh"></video>',
      { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
  });
  const win = await until(() => BrowserWindow.getAllWindows().find(item => item.webContents.getURL().includes('index.html') && !item.webContents.isLoading()), 'Ana pencere');
  win.setContentSize(1440, 960); win.show();win.focus();
  const run = code => win.webContents.executeJavaScript(`(async()=>{${code}})()`, true);
  await until(() => run('return typeof initialSettingsReady !== "undefined" ? await initialSettingsReady.then(()=>true) : false'), 'Ayarlar');
  await run('openPlayer();await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));setWorkspaceMode("browser",false);setBrowserCaptureEnabled(true,false)');
  await until(() => run('return !player.browserWorkspaceShowBusy && player.browserActiveTabId'), 'Sekme');
  const nav = await run('document.getElementById("browserAddress").value="https://browser-analysis-ui.test/watch";return navigateBrowserFromAddress()');
  assert.equal(nav.ok, true, nav.error);
  const page = await until(() => webContents.getAllWebContents().find(item => item.getURL() === 'https://browser-analysis-ui.test/watch'), 'Video sayfası');
  await until(() => page.executeJavaScript('document.querySelector("video")?.readyState >= 2 && document.querySelector("video").videoWidth > 0'), 'Video çözme');
  await until(() => run('return !!browserTabState()?.mediaId'), 'Medya kimliği');

  await run("UiLocale.set('tr',false);setBrowserSideRailPref('rail');document.getElementById('sideAppSettings').focus();document.getElementById('sideAppSettings').click();return true");
  await until(()=>run("return document.getElementById('appSettingsDialog')?.open"),'main settings from rail');
  const view=win.contentView.children.find(v=>v.webContents===page);await until(()=>view.getBounds().x<0,'settings occlude native page');
  assert.equal(await run("return document.getElementById('sideAppSettings').getAttribute('aria-label')"),'Uygulama ayarları');
  fs.writeFileSync(path.join(out,'main-settings-from-browser.png'),(await win.webContents.capturePage()).toPNG());
  await run("AppSettingsUI.close();return true");await until(()=>view.getBounds().x>=0,'settings close restores page');
  assert(await run("return document.activeElement.id==='sideAppSettings'"),'focus returns to settings button');
  win.setMinimumSize(640,480);win.setContentSize(800,1000);win.webContents.setZoomFactor(1.25);
  await run("UiLocale.set('en',false);document.getElementById('sideAppSettings').focus();document.getElementById('sideAppSettings').click();return true");await until(()=>run("return document.getElementById('appSettingsDialog')?.open"),'English settings');
  assert(await run("const d=document.getElementById('appSettingsDialog'),b=document.getElementById('sideAppSettings').getBoundingClientRect();return d.scrollWidth<=d.clientWidth+1&&document.getElementById('sideAppSettings').ariaLabel==='Application settings'"),'narrow settings and localized rail button');
  fs.writeFileSync(path.join(out,'main-settings-en-125.png'),(await win.webContents.capturePage()).toPNG());await run("AppSettingsUI.close();return true");win.webContents.setZoomFactor(1);win.setContentSize(1440,960);
  const identity=await run("return {tab:player.browserActiveTabId,key:player.mediaKey}");
  const started=await run("player.browserTranslationTrackId='parked-fixture';browserTabState().browserTranslationTrackId='parked-fixture';return window.api.startBrowserTranslation(player.browserActiveTabId,{trackId:'parked-fixture',sourceLanguage:'en',targetLanguage:'tr',cues:[{id:'parked-cue',start:0,end:2,text:'Open the window.'}]})");assert(started.ok,started.error);
  await until(()=>releaseProvider,'controlled provider pending');
  await run("document.getElementById('browserMediaHome').click();return true");await until(()=>run("return document.getElementById('playerLayer').classList.contains('hidden')&&!!document.getElementById('mhResumeWorkspace')"),'home parks browser');
  assert(!aborted,'going home must not abort translation');releaseProvider();
  await until(()=>run("return window.api.getBrowserTranslationSnapshot(player.browserActiveTabId).then(r=>r.results?.some(c=>c.text==='Pencereyi aç.'))"),'real scheduler finishes while parked');
  assert(await run("return document.getElementById('playerLayer').classList.contains('hidden')"),'background completion does not steal the screen');
  await run("state.lastJobVideo='C:/synthetic-old-whisper-job.mp4';document.querySelector('#mediaHome .mh-actions>button').click();return true");
  await until(()=>run("return !document.getElementById('playerLayer').classList.contains('hidden')"),'Browser button resumes parked session');
  assert.deepEqual(await run("return {tab:player.browserActiveTabId,key:player.mediaKey}"),identity,'Browser button must not load a previous Whisper job');
  const final=await run("return window.api.getBrowserTranslationSnapshot(player.browserActiveTabId)");assert.equal(final.results.length,1);assert(!aborted);
  assert(await run("return player.browserLiveTranslations.size===1"),'parked result remains visible in renderer');
  fs.writeFileSync(path.join(out,'result.json'),JSON.stringify({ok:true,settingsFromRail:true,focusRestored:true,nativeOcclusion:true,realSchedulerControlledProvider:true,completedWhileHome:true,sessionIdentityPreserved:true,liveProvider:false},null,2));
  clearTimeout(watchdog);console.log(JSON.stringify({ok:true,out}));app.exit(0);
}).catch(error=>{console.error(error.stack);app.exit(1)});
