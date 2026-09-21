'use strict';
const { app, BrowserWindow, webContents, session, dialog } = require('electron');
const { findMediaTool } = require('./media-runtime');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const assert = require('node:assert/strict');

const root = path.resolve(__dirname, '..');
const out = path.join(root, '.uiprev', 'browser-chrome-design');
fs.mkdirSync(out, { recursive: true });
process.env.WHISPER_RESOURCE_SOAK_USER_DATA = path.join(out, `profile-${process.pid}-${Date.now()}`);
fs.mkdirSync(process.env.WHISPER_RESOURCE_SOAK_USER_DATA, { recursive: true });
const ffmpeg = findMediaTool('ffmpeg') || 'ffmpeg';
const video = path.join(out, 'episode.mp4');
const made = spawnSync(ffmpeg, ['-hide_banner', '-loglevel', 'error', '-f', 'lavfi', '-i',
  'color=c=navy:s=320x180:r=6:d=42', '-f', 'lavfi', '-i', 'sine=frequency=440:sample_rate=8000:duration=42',
  '-c:v', 'mpeg4', '-c:a', 'aac', '-y', video], { windowsHide: true });
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
    if (url.pathname === '/episode.mp4') {
      const range = /bytes=(\d+)-(\d*)/.exec(request.headers.get('range') || '');
      if (range) {
        const first = Number(range[1]), last = range[2] ? Math.min(Number(range[2]), bytes.length - 1) : bytes.length - 1;
        return new Response(bytes.subarray(first, last + 1), { status: 206, headers: {
          'Content-Type': 'video/mp4', 'Accept-Ranges': 'bytes',
          'Content-Range': `bytes ${first}-${last}/${bytes.length}`, 'Content-Length': String(last - first + 1),
        } });
      }
      return new Response(bytes, { headers: { 'Content-Type': 'video/mp4', 'Accept-Ranges': 'bytes' } });
    }
    return new Response('<!doctype html><meta charset="utf-8"><video controls muted autoplay loop src="/episode.mp4" style="width:90vw;height:70vh"></video>',
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
  await until(() => page.executeJavaScript('document.querySelector("video")?.readyState >= 2'), 'Video çözme');
  await until(() => run('return !!browserTabState()?.mediaId'), 'Medya kimliği');
  await run(`player.cues=${JSON.stringify(target)};player.cuesRaw=player.cues.map(c=>({...c}));player.browserDuration=42;setSideTab('tools');document.getElementById('browserFeatures').open=true;renderCueList();document.getElementById('browserAnalysisTools').open=false;return true`);


  await run('setSideTab("subs");setBrowserSignalVisible(true,false);applyUiTheme("dark");updateBrowserSubtitleSummary();return true');
  await wait(250);
  const measure=()=>run(`const s=document.getElementById('browserSignal');const r=s.getBoundingClientRect();return {height:r.height,width:r.width,scroll:s.scrollWidth,client:s.clientWidth,health:document.getElementById('browserSubtitleHealthText').textContent};`);
  const normal=await measure();
  assert.equal(await run('return getComputedStyle(document.getElementById("browserSubtitleHealth")).color'),'rgb(161, 173, 183)');
  fs.writeFileSync(path.join(out,'chrome-dark.png'),(await win.webContents.capturePage()).toPNG());
  assert(normal.height<125,JSON.stringify(normal));assert(normal.scroll<=normal.client+1);
  await run('document.getElementById("browserVideoSubtitles").open=true;return true');await wait(100);
  const expanded=await measure();assert(expanded.height>normal.height);
  assert(await run('return document.getElementById("browserReplacePrimary").getBoundingClientRect().height>0'));
  await run('document.getElementById("browserVideoSubtitles").open=false;player.browserTranslationFailed=3;renderBrowserSubtitleHealth();return true');
  assert.equal(await run('return document.getElementById("browserSubtitleHealthAction").dataset.action'),'retry');
  assert(await run('const b=document.getElementById("browserSubtitleHealthAction");return !b.classList.contains("hidden")&&b.getBoundingClientRect().height>0'));
  const error=await measure();assert(error.scroll<=error.client+1);
  await run('applyUiTheme("light");return true');await wait(150);
  fs.writeFileSync(path.join(out,'chrome-error-light.png'),(await win.webContents.capturePage()).toPNG());
  // The component follows its actual available width, independently of OS minimum window width.
  await run('document.getElementById("browserWorkspace").style.maxWidth="520px";document.getElementById("browserSubtitleHealthText").textContent="Bazı çeviri blokları tamamlanamadı. Hazır repliklerle izlemeye devam edebilir veya hatalı blokları yeniden deneyebilirsiniz.";return true');await wait(150);
  const narrow=await measure();assert(narrow.scroll<=narrow.client+1,JSON.stringify(narrow));
  fs.writeFileSync(path.join(out,'chrome-narrow.png'),(await win.webContents.capturePage()).toPNG());
  console.log(JSON.stringify({ok:true,normal,expanded,error,narrow}));clearTimeout(watchdog);app.quit();
}).catch(error=>{console.error(error);app.exit(1)});
