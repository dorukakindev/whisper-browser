'use strict';
const { app, BrowserWindow, webContents, session, dialog } = require('electron');
const { findMediaTool } = require('./media-runtime');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const assert = require('node:assert/strict');

const root = path.resolve(__dirname, '..');
const out = path.join(root, '.uiprev', 'browser-tools-design');
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

  await run('applyUiTheme("dark");return true');
  await wait(400);
  const check = await run(`
    const panel=document.querySelector('.bf-workspace');
    const groups=[...panel.querySelectorAll(':scope > details')];
    return {groups:groups.length, overflow:panel.scrollWidth>panel.clientWidth+1,
      height:panel.getBoundingClientRect().height,
      cues:document.getElementById('cueList').getBoundingClientRect().height,
      nested:!!document.getElementById('browserFeatures').contains(document.getElementById('bvaSaveSrt'))};`);
  fs.writeFileSync(path.join(out,'inspect.png'),(await win.webContents.capturePage()).toPNG());
  assert.equal(check.groups, 9); assert(!check.overflow); assert(check.height>300); assert.equal(check.cues,0);assert(check.nested);
  fs.writeFileSync(path.join(out,'tools-dark.png'),(await win.webContents.capturePage()).toPNG());
  fs.writeFileSync(path.join(out,'video-surface.png'),(await page.capturePage()).toPNG());
  await run(`document.getElementById('bfFindTitle').click();document.getElementById('bfTitle').value='Uzun bir film adı';document.getElementById('bfFindTitle').click();document.getElementById('bfFindTitle').click();return true`);
  assert.equal(await run('return document.getElementById("bfTitle").value'),'Uzun bir film adı');
  // Use Electron's actual keyboard events for the native disclosure.
  win.focus();win.webContents.focus();
  await run('document.getElementById("bfFindTitle").focus();return true');
  win.webContents.sendInputEvent({type:'keyDown',keyCode:'Return'});win.webContents.sendInputEvent({type:'char',keyCode:'\r'});win.webContents.sendInputEvent({type:'keyUp',keyCode:'Return'});
  await wait(100);
  assert.equal(await run('return document.getElementById("bfFindTitle").parentElement.open'),false);
  for(const tab of ['ai','library']) {
    await run(`setSideTab('${tab}');return true`);
    assert.equal(await run('return getComputedStyle(document.getElementById("browserFeatures")).display'),'none');
  }
  await run('setSideTab("subs");return true');
  assert(await run('return document.getElementById("cueList").getBoundingClientRect().height>150'));
  await run('setSideTab("tools");return true');
  for(const id of ['browserAnalysisTools','bfFindTitle','bfSemanticTitle','bfOcrTitle','bfScenesTitle','bfSkipTitle','bfSeriesTitle','bvaTitle']) {
    const result=await run(`const node=document.getElementById('${id}');const group=node.tagName==='DETAILS'?node:node.parentElement;group.open=true;group.scrollIntoView({block:'nearest'});const panel=document.querySelector('.bf-workspace');return {overflow:panel.scrollWidth>panel.clientWidth+1,group:group.tagName}`);
    assert.equal(result.group,'DETAILS');assert(!result.overflow,id);
  }
  await run('document.getElementById("bfSkipKind").focus();document.getElementById("bfSkipKind").scrollIntoView({block:"center"});return true');
  win.webContents.sendInputEvent({type:'keyDown',keyCode:'Down',modifiers:['alt']});win.webContents.sendInputEvent({type:'keyUp',keyCode:'Down',modifiers:['alt']});
  await wait(200);win.webContents.sendInputEvent({type:'keyDown',keyCode:'Escape'});win.webContents.sendInputEvent({type:'keyUp',keyCode:'Escape'});
  await run('for(const d of document.querySelectorAll(".bf-workspace > details"))d.open=false;document.getElementById("bfFindTitle").parentElement.open=true;document.getElementById("bfFindTitle").scrollIntoView({block:"start"});applyUiTheme("light");return true');
  await wait(250);
  fs.writeFileSync(path.join(out,'tools-light.png'),(await win.webContents.capturePage()).toPNG());
  win.setContentSize(900,700);
  // 900px'e geçiş resize olayıyla narrow-panel düzenini tetikler; olay asenkron
  // geldiği için önce player.narrowViewport'un oturmasını bekle. Paneli bundan
  // önce açmak, geç gelen syncResponsivePlayerLayout'un narrowPanelTakeover'ı
  // false'a çekip paneli gizlemesine yol açar (batch'te {width:0} flake'i).
  await until(() => run('return player.narrowViewport === true'), 'Dar görünüm geçişi', 15000);
  await run('setPlayerSidebarCollapsed(false);document.getElementById("sideTabTools").click();applyUiTheme("dark");return true');
  let narrow = null;
  try {
    narrow = await until(async () => {
      const n = await run('const p=document.querySelector(".bf-workspace");return {width:p.clientWidth,scroll:p.scrollWidth,sidebar:document.getElementById("playerSide").getBoundingClientRect().width,display:getComputedStyle(document.getElementById("browserFeatures")).display,layer:document.getElementById("playerLayer").className,sideTab:player.sideTab,takeover:document.getElementById("playerLayer").classList.contains("narrow-panel-takeover")};');
      narrow = n;
      return n.width > 0 ? n : false;
    }, 'Dar görünüm yerleşimi', 15000);
  } catch (_) {}
  assert(narrow?.width>0,JSON.stringify(narrow));assert(narrow.scroll<=narrow.width+1,JSON.stringify(narrow));
  fs.writeFileSync(path.join(out,'tools-narrow.png'),(await win.webContents.capturePage()).toPNG());
  await run('setWorkspaceMode("player",false);return true');
  assert.equal(await run('return player.sideTab'),'subs');
  assert.equal(await run('return getComputedStyle(document.getElementById("sideTabTools")).display'),'none');
  console.log(JSON.stringify({ok:true,check,narrow}));clearTimeout(watchdog);app.quit();
}).catch(error=>{console.error(error);app.exit(1)});
