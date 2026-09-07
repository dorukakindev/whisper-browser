'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const { spawn, spawnSync } = require('node:child_process');
const { randomUUID } = require('node:crypto');

let electronProcess = null;
let server = null;
let userDataDir = '';

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function withTimeout(promise, ms, label) {
  let timer;
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error(label + ' timed out.')), ms);
    }),
  ]).finally(() => clearTimeout(timer));
}

function silentWav(seconds = 90, sampleRate = 8000) {
  const samples = Math.max(1, Math.round(seconds * sampleRate));
  const dataBytes = samples * 2;
  const output = Buffer.alloc(44 + dataBytes);
  output.write('RIFF', 0, 'ascii');
  output.writeUInt32LE(36 + dataBytes, 4);
  output.write('WAVEfmt ', 8, 'ascii');
  output.writeUInt32LE(16, 16);
  output.writeUInt16LE(1, 20);
  output.writeUInt16LE(1, 22);
  output.writeUInt32LE(sampleRate, 24);
  output.writeUInt32LE(sampleRate * 2, 28);
  output.writeUInt16LE(2, 32);
  output.writeUInt16LE(16, 34);
  output.write('data', 36, 'ascii');
  output.writeUInt32LE(dataBytes, 40);
  return output;
}

function createCdpClient(webSocketDebuggerUrl) {
  const socket = new WebSocket(webSocketDebuggerUrl);
  let sequence = 0;
  const pending = new Map();
  const exceptions = [];
  socket.addEventListener('message', (message) => {
    const payload = JSON.parse(String(message.data));
    if (payload.id && pending.has(payload.id)) {
      const waiter = pending.get(payload.id);
      pending.delete(payload.id);
      if (payload.error) waiter.reject(new Error(payload.error.message));
      else waiter.resolve(payload.result);
      return;
    }
    if (payload.method === 'Runtime.exceptionThrown') {
      const details = payload.params?.exceptionDetails || {};
      exceptions.push(details.exception?.description || details.text || 'Unknown renderer exception');
    }
  });
  return {
    socket,
    exceptions,
    opened: withTimeout(new Promise((resolve, reject) => {
      socket.addEventListener('open', resolve, { once: true });
      socket.addEventListener('error', reject, { once: true });
    }), 5000, 'DevTools connection'),
    call(method, params = {}) {
      return new Promise((resolve, reject) => {
        const id = ++sequence;
        pending.set(id, { resolve, reject });
        socket.send(JSON.stringify({ id, method, params }));
      });
    },
  };
}

async function evaluate(client, expression, timeout = 15000, extra = {}) {
  const result = await withTimeout(client.call('Runtime.evaluate', {
    expression,
    awaitPromise: true,
    returnByValue: true,
    ...extra,
  }), timeout, 'Runtime evaluation: ' + String(expression).replace(/\s+/gu, ' ').slice(0, 96));
  if (result.exceptionDetails) {
    throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
  }
  return result.result?.value;
}

async function waitFor(predicate, timeoutMs, intervalMs = 100) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const value = await predicate();
    if (value) return value;
    await delay(intervalMs);
  }
  return null;
}

function near(left, right, tolerance = 3) {
  return Math.abs(Number(left) - Number(right)) <= tolerance;
}

async function openBrowserWorkspace(renderer, siteUrl) {
  const ready = await waitFor(async () => evaluate(renderer,
    "document.readyState === 'complete' && typeof setWorkspaceMode === 'function' && typeof browserCommand === 'function'",
    3000).catch(() => false), 20000);
  assert.equal(ready, true, 'Main renderer did not become ready.');
  await evaluate(renderer, "(() => { document.getElementById('playerLayer').classList.remove('hidden'); setWorkspaceMode('browser', false); setTimeout(() => { if(!player.browserActiveTabId) void showBrowserWorkspace(); }, 0); return true; })()");
  const tabId = await waitFor(async () => evaluate(renderer,
    "player.browserActiveTabId || ''", 3000).catch(() => ''), 15000);
  if (!tabId) {
    const state = await evaluate(renderer, "(() => ({workspaceMode:player.workspaceMode,workspaceSeq:player.browserWorkspaceSeq,tabs:player.browserTabs,signal:document.getElementById('browserSignalText')?.textContent||'',api:typeof window.api?.showBrowser}))()").catch((error) => ({ evaluationError: error.message }));
    throw new Error('Browser workspace did not create an active tab: '
      + JSON.stringify({ state, exceptions: renderer.exceptions }));
  }
  const navigation = await evaluate(renderer,
    "(async () => { document.getElementById('browserAddress').value = " + JSON.stringify(siteUrl)
      + "; return Promise.race([navigateBrowserFromAddress(), new Promise((resolve) => setTimeout(() => resolve({ ok: false, timeout: true }), 15000))]); })()",
    20000);
  assert.equal(navigation?.ok, true, 'Local browser navigation failed: ' + JSON.stringify(navigation));
  return tabId;
}

async function run() {
  const wav = silentWav();
  const vtt = 'WEBVTT\n\n00:00:00.000 --> 00:01:20.000\nElectron browser acceptance cue\n';
  server = http.createServer((request, response) => {
    if (request.url === '/captions.vtt') {
      response.writeHead(200, { 'Content-Type': 'text/vtt; charset=utf-8', 'Cache-Control': 'no-store' });
      response.end(vtt);
      return;
    }
    if (request.url === '/silence.wav') {
      const match = /^bytes=(\d+)-(\d*)$/u.exec(request.headers.range || '');
      if (match) {
        const start = Math.min(wav.length - 1, Number(match[1]));
        const end = match[2] ? Math.min(wav.length - 1, Number(match[2])) : wav.length - 1;
        response.writeHead(206, {
          'Content-Type': 'audio/wav',
          'Accept-Ranges': 'bytes',
          'Content-Range': 'bytes ' + start + '-' + end + '/' + wav.length,
          'Content-Length': end - start + 1,
        });
        response.end(wav.subarray(start, end + 1));
      } else {
        response.writeHead(200, {
          'Content-Type': 'audio/wav',
          'Accept-Ranges': 'bytes',
          'Content-Length': wav.length,
        });
        response.end(wav);
      }
      return;
    }
    const html = [
      '<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Browser experience acceptance</title>',
      '<style>html,body{margin:0;background:#111;color:#fff}video{display:block;width:640px;height:360px;background:#000}</style>',
      '</head><body><video controls muted loop preload="auto" crossorigin="anonymous">',
      '<source src="/silence.wav" type="audio/wav"><track kind="subtitles" src="/captions.vtt" srclang="en" label="English" default>',
      '</video><script>',
      "const v=document.querySelector('video');v.muted=true;v.textTracks[0].mode='showing';",
      'window.installProbeCounter=()=>{if(window.__probeCounterInstalled)return true;const c=window.__whisperMediaController;if(!c)return false;',
      'window.__probeCounterInstalled=true;window.__probeCount=0;const original=c.probe.bind(c);c.probe=()=>{window.__probeCount++;return original();};return true;};',
      '</script></body></html>',
    ].join('');
    response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
    response.end(html);
  });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const siteUrl = 'http://127.0.0.1:' + server.address().port + '/';

  const projectRoot = path.resolve(__dirname, '..');
  userDataDir = path.join(os.tmpdir(), 'whisper-local-experience-' + randomUUID());
  fs.mkdirSync(userDataDir, { recursive: true });
  const devtoolsPort = 22000 + Math.floor(Math.random() * 1000);
  const mainInspectPort = 24000 + Math.floor(Math.random() * 1000);
  electronProcess = spawn(path.join(projectRoot, 'node_modules', 'electron', 'dist', 'electron.exe'), [
    '--inspect=' + mainInspectPort,
    projectRoot,
    '--remote-debugging-port=' + devtoolsPort,
    '--user-data-dir=' + userDataDir,
  ], { cwd: projectRoot, windowsHide: true, stdio: 'ignore' });

  const targets = await waitFor(async () => {
    if (electronProcess.exitCode != null) throw new Error('Electron exited early: ' + electronProcess.exitCode);
    try {
      const response = await fetch('http://127.0.0.1:' + devtoolsPort + '/json/list');
      return response.ok ? response.json() : null;
    } catch (_) {
      return null;
    }
  }, 20000, 250);
  assert.ok(targets, 'Electron DevTools target did not open.');
  const rendererTarget = targets.find((entry) => entry.type === 'page'
    && /\/src\/renderer\/index\.html$/u.test(new URL(entry.url).pathname));
  assert.ok(rendererTarget?.webSocketDebuggerUrl, 'Main renderer target was not found.');
  const renderer = createCdpClient(rendererTarget.webSocketDebuggerUrl);
  await renderer.opened;
  await renderer.call('Runtime.enable');

  const mainTarget = await waitFor(async () => {
    try {
      const response = await fetch('http://127.0.0.1:' + mainInspectPort + '/json/list');
      const list = response.ok ? await response.json() : [];
      return list[0] || null;
    } catch (_) {
      return null;
    }
  }, 10000, 100);
  assert.ok(mainTarget?.webSocketDebuggerUrl, 'Electron main-process inspector target was not found.');
  const main = createCdpClient(mainTarget.webSocketDebuggerUrl);
  await main.opened;
  await main.call('Runtime.enable');
  const windowInfo = await evaluate(main, "(() => { const req=process.getBuiltinModule('module').createRequire(process.execPath); const win=req('electron').BrowserWindow.getAllWindows()[0]; win.setSize(1280,820); return win.getBounds(); })()");
  await delay(400);

  const tabId = await openBrowserWorkspace(renderer, siteUrl);
  const browserTargets = await waitFor(async () => {
    try {
      const response = await fetch('http://127.0.0.1:' + devtoolsPort + '/json/list');
      const list = response.ok ? await response.json() : [];
      return list.find((entry) => entry.type === 'page' && entry.url === siteUrl) || null;
    } catch (_) {
      return null;
    }
  }, 15000, 200);
  assert.ok(browserTargets?.webSocketDebuggerUrl, 'WebContentsView page target was not found.');
  const page = createCdpClient(browserTargets.webSocketDebuggerUrl);
  await page.opened;
  await page.call('Runtime.enable');
  const fullscreenHooked = await evaluate(main,
    "(() => { const req=process.getBuiltinModule('module').createRequire(process.execPath); const wc=req('electron').webContents.getAllWebContents().find((entry)=>entry.getURL()==="
      + JSON.stringify(siteUrl)
      + "); if(!wc)return false; globalThis.__experienceFs={entered:0,left:0}; globalThis.__experiencePage={unresponsive:0,responsive:0}; wc.on('enter-html-full-screen',()=>globalThis.__experienceFs.entered++); wc.on('leave-html-full-screen',()=>globalThis.__experienceFs.left++); wc.on('unresponsive',()=>globalThis.__experiencePage.unresponsive++); wc.on('responsive',()=>globalThis.__experiencePage.responsive++); return true; })()");
  assert.equal(fullscreenHooked, true, 'Fullscreen event instrumentation could not find the browser WebContents.');

  const toolbar = await evaluate(renderer, `(() => {
    const layer = document.getElementById('playerLayer');
    const ids = [...layer.querySelectorAll('[id]')].map((node) => node.id);
    const duplicates = ids.filter((id, index) => ids.indexOf(id) !== index);
    const head = layer.querySelector('.player-head');
    const actions = layer.querySelector('.player-head-actions');
    const more = document.getElementById('browserMoreMenu');
    const translate = document.getElementById('browserTranslateMenu');
    const address = document.querySelector('.browser-address-wrap');
    const proxy = more?.querySelector('[data-browser-proxy="playerBookmark"]');
    return {
      duplicates,
      head: head ? { right: head.getBoundingClientRect().right, width: head.getBoundingClientRect().width } : null,
      actions: actions ? { right: actions.getBoundingClientRect().right, width: actions.getBoundingClientRect().width } : null,
      viewport: { width: window.innerWidth, height: window.innerHeight },
      addressBookmark: !!address?.querySelector('#browserBookmarkToggle'),
      translateItems: translate ? translate.querySelectorAll('[role="menuitem"]').length : 0,
      moreItems: more ? more.querySelectorAll('[role="menuitem"]').length : 0,
      proxy: !!proxy,
    };
  })()`);
  assert.deepEqual(toolbar.duplicates, [], 'Toolbar introduced duplicate DOM ids.');
  assert.equal(toolbar.addressBookmark, true, 'Site bookmark is not inside the address control.');
  assert.equal(toolbar.translateItems, 3, 'Translate split menu does not expose exactly three existing actions.');
  assert.ok(toolbar.moreItems >= 10, 'Other menu is missing grouped browser actions.');
  assert.equal(toolbar.proxy, true, 'Other menu proxy action was not rendered.');
  assert.ok(toolbar.actions?.right <= toolbar.viewport.width - 10,
    'Header action group is not kept inside the content edge.');

  const visibilityHooked = await evaluate(main,
    "(() => { const req=process.getBuiltinModule('module').createRequire(process.execPath); const electron=req('electron'); const wc=electron.webContents.getAllWebContents().find((entry)=>entry.getURL()==="
      + JSON.stringify(siteUrl)
      + "); const win=electron.BrowserWindow.getAllWindows()[0]; const view=win?.contentView?.children?.find((entry)=>entry.webContents?.id===wc?.id); if(!view||typeof view.setVisible!=='function')return false; globalThis.__smokeBrowserVisible=null; const original=view.setVisible.bind(view); view.setVisible=(visible)=>{globalThis.__smokeBrowserVisible=!!visible; return original(visible);}; return true; })()",
    5000);
  assert.equal(visibilityHooked, true, 'Could not instrument browser visibility for menu occlusion.');
  const menuOcclusion = await evaluate(renderer, `(async () => {
    const more = document.getElementById('browserMoreMenu');
    more.open = true;
    await new Promise((resolve) => setTimeout(resolve, 100));
    return { open: more.open };
  })()`);
  const menuVisibility = await evaluate(main,
    "globalThis.__smokeBrowserVisible === false");
  await evaluate(renderer, "(() => { const more=document.getElementById('browserMoreMenu'); more.open=false; return true; })()");
  await delay(100);
  const menuRestored = await evaluate(main,
    "globalThis.__smokeBrowserVisible === true");
  assert.equal(menuOcclusion.open, true, 'Other menu did not open.');
  assert.equal(menuVisibility, true, 'Native browser view stayed visible behind the Other menu.');
  assert.equal(menuRestored, true, 'Native browser view did not restore after closing the menu.');

  const proxyCycles = await evaluate(renderer, `(async () => {
    const more = document.getElementById('browserMoreMenu');
    const proxy = more.querySelector('[data-browser-proxy="playerBookmark"]');
    const target = document.getElementById('playerBookmark');
    let clicks = 0;
    target.addEventListener('click', () => { clicks += 1; });
    for (let index = 0; index < 30; index += 1) {
      more.open = true;
      proxy.click();
    }
    more.open = false;
    return { clicks, open: more.open };
  })()`);
  assert.equal(proxyCycles.clicks, 30, 'Repeated menu open/close cycles multiplied proxy listeners.');
  assert.equal(proxyCycles.open, false, 'Other menu remained open after proxy cycle test.');

  const track = await waitFor(async () => evaluate(renderer,
    "(() => { const item=player.browserTracks.find((candidate)=>Number(candidate.cueCount)>0||(candidate.cues||[]).length>0); return item?{id:item.id,cueCount:item.cueCount}:null; })()",
    3000).catch(() => null), 25000);
  assert.ok(track?.id, 'Local WebVTT track was not captured.');
  const loaded = await evaluate(renderer,
    "(async () => { const id=" + JSON.stringify(track.id)
      + "; document.getElementById('browserTrackSelect').value=id; await useBrowserTrack(false,id); return player.browserLoadedTrackId===id&&player.cues.length>0; })()",
    20000);
  assert.equal(loaded, true, 'Captured track was not loaded into the player.');

  await evaluate(main, 'globalThis.__smokeBrowserVisible=null');
  const settingsPanel = await evaluate(renderer, "(async () => { setSideTab('ai'); document.getElementById('cueSearch').value='electron acceptance search'; document.getElementById('aiChatText').value='Korunacak AI taslağı'; document.getElementById('sideTabAi').focus(); setSettingsPage('browser-subtitles'); setSettingsDrawer(true); await new Promise((resolve)=>requestAnimationFrame(()=>requestAnimationFrame(resolve))); const drawer=document.getElementById('settingsDrawer'); const slot=document.getElementById('browserViewSlot'); const dr=drawer.getBoundingClientRect(); const sr=slot.getBoundingClientRect(); return {open:!drawer.classList.contains('hidden'),focusId:document.activeElement?.id||'',breadcrumb:document.getElementById('settingsDrawerBreadcrumb').textContent,drawer:{left:dr.left,top:dr.top,right:dr.right,bottom:dr.bottom},slot:{left:sr.left,top:sr.top,right:sr.right,bottom:sr.bottom},overlap:!(dr.right<=sr.left||dr.left>=sr.right||dr.bottom<=sr.top||dr.top>=sr.bottom)}; })()", 10000);
  const settingsAlongsideVisible = await evaluate(main, 'globalThis.__smokeBrowserVisible===true');
  assert.equal(settingsPanel.open, true, 'Settings did not open in the right workspace panel.');
  assert.equal(settingsPanel.focusId, 'closeSettings', 'Settings did not move focus into the panel.');
  assert.equal(settingsPanel.breadcrumb, 'Ayarlar / Altyazı ve çeviri', 'Settings breadcrumb did not identify the active page.');
  assert.equal(settingsPanel.overlap, false, 'Normal right-panel settings overlap the native browser slot.');
  assert.equal(settingsAlongsideVisible, true, 'Normal right-panel settings unnecessarily hid the native browser view.');

  await evaluate(main, 'globalThis.__smokeBrowserVisible=null');
  await evaluate(renderer, "(async () => { setViewMode('cinema'); await new Promise((resolve)=>setTimeout(resolve,120)); return true; })()", 10000);
  const settingsCinemaHidden = await evaluate(main, 'globalThis.__smokeBrowserVisible===false');
  assert.equal(settingsCinemaHidden, true, 'Changing to cinema mode left the settings overlay behind the native browser view.');
  await evaluate(renderer, "(async () => { setViewMode('reading'); await new Promise((resolve)=>setTimeout(resolve,120)); return true; })()", 10000);
  const settingsReadingRestored = await evaluate(main, 'globalThis.__smokeBrowserVisible===true');
  assert.equal(settingsReadingRestored, true, 'Returning to reading mode did not restore the native browser beside settings.');

  const settingsBack = await evaluate(renderer, "(async () => { document.getElementById('settingsBackToPanel').click(); await new Promise((resolve)=>requestAnimationFrame(()=>requestAnimationFrame(resolve))); return {closed:document.getElementById('settingsDrawer').classList.contains('hidden'),sideTab:player.sideTab,aiDraft:document.getElementById('aiChatText').value,cueSearch:document.getElementById('cueSearch').value}; })()");
  assert.equal(settingsBack.closed, true, 'Settings Back did not close the settings view.');
  assert.equal(settingsBack.sideTab, 'ai', 'Settings Back did not return to the prior workspace tab.');
  assert.equal(settingsBack.aiDraft, 'Korunacak AI taslağı', 'Settings transition discarded the AI draft.');
  assert.equal(settingsBack.cueSearch, 'electron acceptance search', 'Settings transition discarded transcript search.');

  const settingsClose = await evaluate(renderer, "(async () => { setSideTab('subs'); const search=document.getElementById('cueSearch'); search.focus(); setSettingsPage('browser-subtitles'); setSettingsDrawer(true); await new Promise((resolve)=>requestAnimationFrame(()=>requestAnimationFrame(resolve))); document.getElementById('closeSettings').click(); await new Promise((resolve)=>requestAnimationFrame(()=>requestAnimationFrame(resolve))); return {closed:document.getElementById('settingsDrawer').classList.contains('hidden'),sideTab:player.sideTab,focusId:document.activeElement?.id||''}; })()");
  assert.equal(settingsClose.closed, true, 'Settings Close did not close the settings view.');
  assert.equal(settingsClose.sideTab, 'subs', 'Settings Close unexpectedly changed the workspace tab.');
  assert.equal(settingsClose.focusId, 'cueSearch', 'Settings Close did not restore the invoking focus.');

  await evaluate(main, 'globalThis.__smokeBrowserVisible=null');
  const settingsOverlay = await evaluate(renderer, "(async () => { setPlayerSidebarCollapsed(true); setSettingsPage('browser-subtitles'); setSettingsDrawer(true); await new Promise((resolve)=>setTimeout(resolve,120)); const layer=document.getElementById('playerLayer'); return {open:layer.classList.contains('settings-open'),collapsed:layer.classList.contains('sidebar-collapsed')}; })()", 10000);
  const settingsOverlayHidden = await evaluate(main, 'globalThis.__smokeBrowserVisible===false');
  assert.deepEqual(settingsOverlay, { open: true, collapsed: true }, 'Collapsed-sidebar settings did not become an overlay.');
  assert.equal(settingsOverlayHidden, true, 'Settings overlay stayed behind the native browser view.');
  await evaluate(renderer, "(async () => { setSettingsDrawer(false); setPlayerSidebarCollapsed(false); await new Promise((resolve)=>setTimeout(resolve,120)); return true; })()", 10000);
  const settingsOverlayRestored = await evaluate(main, 'globalThis.__smokeBrowserVisible===true');
  assert.equal(settingsOverlayRestored, true, 'Native browser view did not return after closing the settings overlay.');

  const panel = await evaluate(renderer, "(() => { const toggle=document.getElementById('subtitleFindReplaceToggle'); if(document.getElementById('subtitleFindReplacePanel').classList.contains('hidden'))toggle.click(); const panel=document.getElementById('subtitleFindReplacePanel'); const slot=document.getElementById('browserViewSlot'); const pr=panel.getBoundingClientRect(); const sr=slot.getBoundingClientRect(); const hit=document.elementFromPoint(pr.left+Math.min(20,pr.width/2),pr.top+Math.min(20,pr.height/2)); return {visible:!panel.classList.contains('hidden')&&getComputedStyle(panel).display!=='none',focusId:document.activeElement?.id||'',panel:{left:pr.left,top:pr.top,right:pr.right,bottom:pr.bottom,width:pr.width,height:pr.height},slot:{left:sr.left,top:sr.top,right:sr.right,bottom:sr.bottom,width:sr.width,height:sr.height},overlap:!(pr.right<=sr.left||pr.left>=sr.right||pr.bottom<=sr.top||pr.top>=sr.bottom),hitInside:!!hit?.closest('#subtitleFindReplacePanel')}; })()");
  assert.equal(panel.visible, true, 'Find/replace panel is not visible in browser mode.');
  assert.equal(panel.focusId, 'subtitleFindText', 'Find/replace panel did not focus its search field.');
  assert.equal(panel.overlap, false, 'Find/replace panel overlaps the native browser slot.');
  assert.equal(panel.hitInside, true, 'Find/replace panel is not hit-testable.');
  assert.ok(panel.panel.width > 100 && panel.panel.height > 40, 'Find/replace panel has unusable bounds.');

  await evaluate(renderer, "(() => { setSubtitleFindReplaceOpen(false); scheduleBrowserBounds(); return true; })()");
  const initialPair = await waitFor(async () => {
    const layout = await evaluate(renderer,
      "(() => { const slot=browserSlotBounds(); return {slot,window:{width:window.innerWidth,height:window.innerHeight}}; })()", 3000);
    const viewport = await evaluate(page,
      "({width:window.innerWidth,height:window.innerHeight,fullscreen:!!document.fullscreenElement})", 3000);
    return near(viewport.width, layout.slot.width) && near(viewport.height, layout.slot.height)
      ? { layout, viewport } : null;
  }, 5000);
  assert.ok(initialPair, 'Initial browser viewport did not settle on its current slot.');
  const initialLayout = initialPair.layout;
  const initialViewport = initialPair.viewport;

  const fullscreenCommand = await evaluate(renderer,
    "(async () => { await browserCommand('focus'); return browserCommand('fullscreen'); })()", 10000);
  let directFullscreen = null;
  if (!fullscreenCommand?.ok) {
    directFullscreen = await evaluate(page,
      "(async () => { try { const c=window.__whisperMediaController; const video=c?.select(); if(!video)return {ok:false,message:'no-video'}; const container=video.closest('.html5-video-player, [class*=\"player\"], [id*=\"player\"]'); const target=container&&container!==video?container:video.parentElement||document.documentElement; await target.requestFullscreen(); return {ok:true,tag:target.tagName}; } catch(error) { return {ok:false,name:error?.name||'',message:error?.message||''}; } })()",
      8000, { userGesture: true }).catch((error) => ({ ok: false, transport: error.message }));
  }
  const enteredFullscreen = await waitFor(async () => evaluate(main,
    "globalThis.__experienceFs?.entered > 0", 3000).catch(() => false), 8000);
  assert.equal(enteredFullscreen, true,
    'The media element did not enter HTML fullscreen: ' + JSON.stringify({ fullscreenCommand, directFullscreen }));
  const fullscreenLayout = await waitFor(async () => {
    const layout = await evaluate(renderer, "({width:window.innerWidth,height:window.innerHeight})", 3000);
    const viewport = await evaluate(page, "({width:window.innerWidth,height:window.innerHeight})", 3000);
    return near(viewport.width, layout.width) && near(viewport.height, layout.height)
      ? { layout, viewport } : null;
  }, 8000);
  assert.ok(fullscreenLayout, 'Fullscreen WebContentsView did not fill the current content area.');

  await evaluate(renderer,
    "(() => { document.getElementById('playerLayer').style.setProperty('--side-w','520px'); scheduleBrowserBounds(); return true; })()");
  const resizedFullscreen = await waitFor(async () => {
    const layout = await evaluate(renderer,
      "(() => ({slot:browserSlotBounds(),window:{width:window.innerWidth,height:window.innerHeight}}))()", 3000);
    const viewport = await evaluate(page, "({width:window.innerWidth,height:window.innerHeight})", 3000);
    return near(viewport.width, layout.window.width) && near(viewport.height, layout.window.height)
      && !near(layout.slot.width, initialLayout.slot.width) ? { layout, viewport } : null;
  }, 10000);
  assert.ok(resizedFullscreen, 'Fullscreen view did not stay full-window after the browser slot changed.');

  await evaluate(page, "document.exitFullscreen()", 8000, { userGesture: true });
  const restoredLayout = await waitFor(async () => {
    const layout = await evaluate(renderer, "(() => { const slot=browserSlotBounds(); return {slot,window:{width:window.innerWidth,height:window.innerHeight}}; })()", 3000);
    const viewport = await evaluate(page, "({width:window.innerWidth,height:window.innerHeight,fullscreen:!!document.fullscreenElement})", 3000);
    return !viewport.fullscreen && near(viewport.width, layout.slot.width) && near(viewport.height, layout.slot.height)
      ? { layout, viewport } : null;
  }, 10000);
  assert.ok(restoredLayout, 'Leaving fullscreen did not restore the current slot bounds.');
  assert.ok(!near(restoredLayout.layout.slot.width, initialLayout.slot.width)
    || !near(restoredLayout.layout.slot.height, initialLayout.slot.height),
  'The resize did not produce a new slot size for restoration verification.');

  const probeCounterInstalled = await evaluate(page,
    "(() => { const installed=installProbeCounter(); document.querySelector('video').pause(); return installed; })()");
  assert.equal(probeCounterInstalled, true, 'The persistent media controller was unavailable for probe instrumentation.');
  await waitFor(async () => evaluate(renderer, "player.browserPaused", 3000).catch(() => false), 5000);
  let probeCount = await evaluate(page, "window.__probeCount");
  const periodicBeforePlay = await waitFor(async () => {
    const next = await evaluate(page, "window.__probeCount", 3000).catch(() => probeCount);
    return next > probeCount ? next : null;
  }, 3000, 25);
  assert.ok(periodicBeforePlay, 'A media fallback probe was not observed before the play latency check.');
  let startedAt = Date.now();
  await evaluate(page, "(async () => { const v=document.querySelector('video'); await v.play(); return !v.paused; })()", 8000, { userGesture: true });
  const playObserved = await waitFor(async () => evaluate(renderer,
    "player.browserPaused===false", 3000).catch(() => false), 800);
  const playLatencyMs = Date.now() - startedAt;
  assert.equal(playObserved, true, 'Play state waited for the one-second fallback poll.');

  probeCount = await evaluate(page, "window.__probeCount");
  const periodicBeforePause = await waitFor(async () => {
    const next = await evaluate(page, "window.__probeCount", 3000).catch(() => probeCount);
    return next > probeCount ? next : null;
  }, 3000, 25);
  assert.ok(periodicBeforePause, 'A media fallback probe was not observed before the pause latency check.');
  startedAt = Date.now();
  await evaluate(page, "(() => { const v=document.querySelector('video'); v.pause(); return v.paused; })()");
  const pauseObserved = await waitFor(async () => evaluate(renderer,
    "player.browserPaused===true", 3000).catch(() => false), 800);
  const pauseLatencyMs = Date.now() - startedAt;
  assert.equal(pauseObserved, true, 'Pause state waited for the one-second fallback poll.');

  const permission = await evaluate(page, "(async () => { let query='unavailable'; try { query=(await navigator.permissions.query({name:'camera'})).state; } catch (error) { query=error.name; } try { await navigator.mediaDevices.getUserMedia({audio:true,video:true}); return {query,granted:true,error:''}; } catch (error) { return {query,granted:false,error:error.name}; } })()", 12000, { userGesture: true });
  assert.equal(permission.granted, false, 'Camera/microphone permission was unexpectedly granted.');
  assert.notEqual(permission.query, 'granted', 'Permission check handler reported camera as granted.');
  const permissionSignal = await waitFor(async () => evaluate(renderer,
    "player.browserSignalHistory.some((item)=>/kamera|mikrofon/u.test(item.text))", 3000).catch(() => false), 5000);
  assert.equal(permissionSignal, true, 'Permission denial did not reach the application signal.');

  const beforeFreeze = await evaluate(renderer, "(() => { const tab=browserTabState(); return {responsive:tab?.pageResponsive!==false,history:player.browserSignalHistory.length}; })()");
  assert.equal(beforeFreeze.responsive, true, 'Page was already marked unresponsive before the freeze.');
  const injectedUnresponsive = await evaluate(main,
    "(() => { const req=process.getBuiltinModule('module').createRequire(process.execPath); const wc=req('electron').webContents.getAllWebContents().find((entry)=>entry.getURL()==="
      + JSON.stringify(siteUrl) + "); return wc?wc.emit('unresponsive'):false; })()");
  assert.equal(injectedUnresponsive, true, 'The unresponsive event could not be emitted on the browser WebContents.');
  const unresponsive = await waitFor(async () => evaluate(renderer,
    "(() => { const tab=browserTabState(); return tab?.pageResponsive===false&&player.browserSignalHistory.some((item)=>/vermiyor/u.test(item.text)); })()",
    3000).catch(() => false), 3000, 100);
  assert.equal(unresponsive, true, 'The unresponsive event did not reach the renderer diagnostic.');
  const injectedResponsive = await evaluate(main,
    "(() => { const req=process.getBuiltinModule('module').createRequire(process.execPath); const wc=req('electron').webContents.getAllWebContents().find((entry)=>entry.getURL()==="
      + JSON.stringify(siteUrl) + "); return wc?wc.emit('responsive'):false; })()");
  assert.equal(injectedResponsive, true, 'The responsive event could not be emitted on the browser WebContents.');
  const responsiveAgain = await waitFor(async () => evaluate(renderer,
    "(() => { const tab=browserTabState(); return tab?.pageResponsive!==false&&player.browserSignalHistory.some((item)=>/yeniden/u.test(item.text)); })()",
    3000).catch(() => false), 15000, 100);
  assert.equal(responsiveAgain, true, 'The recovered page did not produce a responsive diagnostic.');

  assert.equal(renderer.exceptions.length, 0, 'Main renderer exceptions: ' + renderer.exceptions.join(' | '));
  assert.equal(page.exceptions.length, 0, 'Browser page exceptions: ' + page.exceptions.join(' | '));
  const result = {
    tabId,
    panel,
    settings: { panel: settingsPanel, back: settingsBack, close: settingsClose, overlay: settingsOverlay },
    fullscreen: {
      command: fullscreenCommand,
      direct: directFullscreen,
      initial: { layout: initialLayout, viewport: initialViewport },
      entered: fullscreenLayout,
      resized: resizedFullscreen,
      restored: restoredLayout,
    },
    mediaEvents: { playLatencyMs, pauseLatencyMs },
    permission,
    responsiveness: { mode: 'event-path', unresponsive, responsiveAgain },
  };
  console.log('electron-browser-experience-smoke: ' + JSON.stringify(result));
  page.socket.close();
  renderer.socket.close();
  main.socket.close();
}

async function cleanup() {
  if (electronProcess && electronProcess.exitCode == null) {
    spawnSync('taskkill.exe', ['/pid', String(electronProcess.pid), '/T', '/F'], {
      windowsHide: true,
      stdio: 'ignore',
      timeout: 10000,
    });
  }
  electronProcess = null;
  if (server) await new Promise((resolve) => server.close(resolve));
  server = null;
  if (userDataDir) {
    try {
      fs.rmSync(userDataDir, { recursive: true, force: true });
    } catch (_) {}
  }
  userDataDir = '';
}

run().then(async () => {
  await cleanup();
  console.log('electron-browser-experience-smoke: passed');
}).catch(async (error) => {
  await cleanup();
  console.error(error.stack || error.message);
  process.exit(1);
});
