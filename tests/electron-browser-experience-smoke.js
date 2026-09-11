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
const stalledResponses = new Set();

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

async function resizeAppWindow(main, renderer, width, height, timeoutMs = 5000) {
  await evaluate(main, `(async () => {
    const req = process.getBuiltinModule('module').createRequire(process.execPath);
    const win = req('electron').BrowserWindow.getAllWindows()[0];
    if (!win) return null;
    if (!win.isVisible() || !win.isFocused()) {
      // Windows'ta gizli/odaksız başlatılan bir Electron penceresinin native
      // bounds'u değişse bile Chromium renderer viewportunu güncellemeyebilir.
      // Etkileşimli yerleşim kabul testi gerçek kullanıcı penceresini ölçer.
      win.show();
      win.focus();
      await new Promise((resolve) => setTimeout(resolve, 120));
    }
    if (win.isMaximized()) {
      win.unmaximize();
      await new Promise((resolve) => setTimeout(resolve, 120));
    }
    // Test renderer ve WebContentsView istemci alanını ölçüyor; Windows dış
    // çerçevesini hedefleyen setSize() titlebar overlay altında renderer'a
    // geç ulaşabiliyor. İstemci alanını doğrudan boyutlandır.
    win.setContentSize(${width}, ${height});
    return win.getBounds();
  })()`);
  const settled = await waitFor(async () => {
    const size = await evaluate(renderer,
      "({ width: window.innerWidth, height: window.innerHeight })", 1000).catch(() => null);
    return size && near(size.width, width) && near(size.height, height) ? size : null;
  }, timeoutMs, 50);
  if (settled) return settled;
  const diagnostic = await evaluate(main, `(() => {
    const req = process.getBuiltinModule('module').createRequire(process.execPath);
    return req('electron').BrowserWindow.getAllWindows().map((win) => ({
      id: win.id,
      url: win.webContents.getURL(),
      bounds: win.getBounds(),
      maximized: win.isMaximized(),
      fullscreen: win.isFullScreen(),
      visible: win.isVisible(),
    }));
  })()`).catch(() => null);
  const rendererSize = await evaluate(renderer,
    "({ width: window.innerWidth, height: window.innerHeight })", 1000).catch(() => null);
  throw new Error(`Electron window did not settle at ${width}x${height}: `
    + JSON.stringify({ rendererSize, windows: diagnostic }));
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

async function verifyBrowserLoadingLifecycle(renderer, main, siteUrl) {
  const stalledUrl = siteUrl + 'stalled-load';
  await evaluate(main, "(() => { globalThis.__browserLifecycleAudit={warnings:[],rejections:[]}; globalThis.__browserLifecycleWarning=(warning)=>globalThis.__browserLifecycleAudit.warnings.push(String(warning?.message||warning)); globalThis.__browserLifecycleRejection=(reason)=>globalThis.__browserLifecycleAudit.rejections.push(String(reason?.message||reason)); process.on('warning',globalThis.__browserLifecycleWarning); process.on('unhandledRejection',globalThis.__browserLifecycleRejection); return true; })()");
  await evaluate(renderer, "(() => { document.getElementById('browserAddress').value="
    + JSON.stringify(stalledUrl) + "; void navigateBrowserFromAddress(); return true; })()");
  const stalledLoading = await waitFor(async () => evaluate(main,
    "(() => { const req=process.getBuiltinModule('module').createRequire(process.execPath); const wc=req('electron').webContents.getAllWebContents().find((entry)=>entry.getURL()==="
      + JSON.stringify(stalledUrl) + "); return !!wc?.isLoading(); })()", 3000).catch(() => false), 10000);
  assert.equal(stalledLoading, true, 'The stalled navigation did not start.');
  await evaluate(renderer, "(() => { const payload={source:[],translation:[],mode:'source',offset:0}; globalThis.__overlayFlood=Array.from({length:16},()=>window.api.setBrowserOverlay(player.browserActiveTabId,payload).catch(()=>null)); return globalThis.__overlayFlood.length; })()");
  await delay(1200);
  const duringLoad = await evaluate(main,
    "(() => { const req=process.getBuiltinModule('module').createRequire(process.execPath); const wc=req('electron').webContents.getAllWebContents().find((entry)=>entry.getURL()==="
      + JSON.stringify(stalledUrl)
      + "); return wc?{listeners:wc.listenerCount('did-stop-loading'),loading:wc.isLoading(),audit:globalThis.__browserLifecycleAudit}:null; })()");
  assert.ok(duringLoad?.loading, 'The stalled page completed before lifecycle measurement.');
  assert.ok(duringLoad.listeners <= 3,
    'did-stop-loading listeners accumulated during navigation: ' + JSON.stringify(duringLoad));
  assert.equal(duringLoad.audit.warnings.some((item) => /MaxListenersExceededWarning/u.test(item)), false,
    'MaxListenersExceededWarning was emitted: ' + JSON.stringify(duringLoad.audit));
  const closed = await evaluate(renderer, "(async () => { const started=performance.now(); const result=await window.api.closeBrowserTab(player.browserActiveTabId,false); return {result,elapsed:performance.now()-started}; })()", 10000);
  assert.equal(closed.result?.ok, true, 'The loading tab could not close: ' + JSON.stringify(closed));
  assert.ok(closed.elapsed < 2500,
    'Closing the loading tab waited for script timeouts: ' + JSON.stringify(closed));
  const recovery = await evaluate(renderer, "(async () => { const navigation=await window.api.navigateBrowser("
    + JSON.stringify(closed.result.activeTabId) + "," + JSON.stringify(siteUrl)
    + "); const started=performance.now(); const created=await window.api.createBrowserTab(); return {navigation,created,createElapsed:performance.now()-started}; })()", 12000);
  assert.equal(recovery.navigation?.ok, true,
    'A normal page did not open after closing the stalled tab: ' + JSON.stringify(recovery));
  assert.equal(recovery.created?.ok, true,
    'A new tab could not be created after recovery: ' + JSON.stringify(recovery));
  assert.ok(recovery.createElapsed < 2500,
    'Creating a new tab waited for script timeouts: ' + JSON.stringify(recovery));
  const audit = await evaluate(main, "(() => { const value=globalThis.__browserLifecycleAudit; process.off('warning',globalThis.__browserLifecycleWarning); process.off('unhandledRejection',globalThis.__browserLifecycleRejection); return value; })()");
  assert.equal(audit.rejections.some((item) => /Script failed to execute/u.test(item)), false,
    'An unhandled script rejection escaped during navigation: ' + JSON.stringify(audit));
  return {
    listenersDuringLoad: duringLoad.listeners,
    closeElapsedMs: Math.round(closed.elapsed),
    pageRecovered: recovery.navigation.ok,
    newTabElapsedMs: Math.round(recovery.createElapsed),
  };
}

async function verifySubframeNavigationIsolation(renderer, page, siteUrl) {
  const before = await evaluate(renderer,
    "(() => { const tab=browserTabState(); return {generation:tab?.generation||0,url:tab?.url||''}; })()");
  await evaluate(page, `(async () => {
    const frame = document.createElement('iframe');
    frame.style.display = 'none';
    const loaded = () => new Promise((resolve) => frame.addEventListener('load', resolve, { once: true }));
    frame.src = ${JSON.stringify(siteUrl + 'frame-one')};
    const first = loaded(); document.body.appendChild(frame); await first;
    const second = loaded(); frame.src = ${JSON.stringify(siteUrl + 'frame-two')}; await second;
    frame.remove(); return true;
  })()`, 12000);
  await delay(250);
  const after = await evaluate(renderer,
    "(() => { const tab=browserTabState(); return {generation:tab?.generation||0,url:tab?.url||''}; })()");
  assert.equal(after.generation, before.generation,
    'Subframe navigation reset the top-level subtitle/media generation: ' + JSON.stringify({ before, after }));
  assert.equal(after.url, before.url,
    'Subframe navigation replaced the top-level address: ' + JSON.stringify({ before, after }));
  return { beforeGeneration: before.generation, afterGeneration: after.generation };
}

async function run() {
  const wav = silentWav();
  const vtt = 'WEBVTT\n\n00:00:00.000 --> 00:01:20.000\nElectron browser acceptance cue\n';
  server = http.createServer((request, response) => {
    if (request.url === '/stalled-load') {
      response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
      response.write('<!doctype html><title>Takılan yükleme</title><main>yükleniyor</main>');
      stalledResponses.add(response);
      response.once('close', () => stalledResponses.delete(response));
      return;
    }
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
  ], {
    cwd: projectRoot,
    windowsHide: true,
    stdio: 'ignore',
    env: { ...process.env, WHISPER_RESOURCE_SOAK_USER_DATA: userDataDir },
  });

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
  const windowInfo = await resizeAppWindow(main, renderer, 1280, 820);
  assert.ok(windowInfo, 'Initial Electron window size did not settle.');

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
  const subframeNavigation = await verifySubframeNavigationIsolation(renderer, page, siteUrl);
  if (process.argv.includes('--lifecycle-only')) {
    const lifecycle = await verifyBrowserLoadingLifecycle(renderer, main, siteUrl);
    console.log('electron-browser-lifecycle-smoke: ' + JSON.stringify({ subframeNavigation, ...lifecycle }));
    page.socket.close();
    renderer.socket.close();
    main.socket.close();
    return;
  }
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
  assert.equal(toolbar.translateItems, 5, 'Translate split menu does not expose all five existing actions.');
  assert.ok(toolbar.moreItems >= 10, 'Other menu is missing grouped browser actions.');
  assert.equal(toolbar.proxy, true, 'Other menu proxy action was not rendered.');
  assert.ok(toolbar.actions?.right <= toolbar.viewport.width - 10,
    'Header action group is not kept inside the content edge.');

  const browserViewVisibleExpression =
    "(() => { const req=process.getBuiltinModule('module').createRequire(process.execPath); const electron=req('electron'); const wc=electron.webContents.getAllWebContents().find((entry)=>entry.getURL()==="
      + JSON.stringify(siteUrl)
      + "); const win=electron.BrowserWindow.getAllWindows()[0]; const view=win?.contentView?.children?.find((entry)=>entry.webContents?.id===wc?.id); return view&&typeof view.getVisible==='function'?view.getVisible():null; })()";
  // Görünürlük okuması senkron bir View getter'ıdır. Tek bir CDP isteğinin
  // dış waitFor bütçesini tüketmesine izin verme; kısa denemelerle yeniden oku.
  const browserViewVisible = () => evaluate(main, browserViewVisibleExpression, 750);
  assert.equal(typeof await browserViewVisible(), 'boolean',
    'Could not read native browser visibility for occlusion checks.');

  const settingsTabFlow = await evaluate(renderer, `(async () => {
    const beforeTabIds = player.browserTabs.map((tab) => tab.id);
    const toggle = document.getElementById('browserViewSettingsToggle');
    toggle.focus();
    toggle.click();
    await new Promise((resolve) => setTimeout(resolve, 160));
    const blockedReload = await runBrowserChromeCommand('reload');
    const profileSelect = document.getElementById('profile-targetLanguage');
    const profileScope = document.getElementById('browserProfileScope');
    const profileRow = profileSelect?.closest('.browser-profile-field');
    const settingsMain = document.querySelector('.browser-settings-main');
    const selectStyle = getComputedStyle(profileSelect);
    const scopeStyle = getComputedStyle(profileScope);
    const formTheme = {
      selectBackground: selectStyle.backgroundColor,
      selectColor: selectStyle.color,
      selectAppearance: selectStyle.appearance,
      scopeBackground: scopeStyle.backgroundColor,
      mainWidth: Math.round(settingsMain.getBoundingClientRect().width),
      rowWidth: Math.round(profileRow.getBoundingClientRect().width),
    };
    const search = document.getElementById('browserSettingsSearch');
    search.value = 'SponsorBlock';
    search.dispatchEvent(new Event('input', { bubbles: true }));
    const resultIds = [...document.querySelectorAll('#browserSettingsResults [data-browser-setting-open]')]
      .map((item) => item.dataset.browserSettingOpen);
    const opened = openBrowserSetting('browserSponsorMode');
    await Promise.race([
      new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
      new Promise((resolve) => setTimeout(resolve, 250)),
    ]);
    const special = document.querySelector('#browserTabStrip [data-browser-settings-tab]');
    const specialOpen = special?.querySelector('[data-browser-settings-tab-activate]');
    return {
      beforeTabIds,
      modelTabIds: player.browserTabs.map((tab) => tab.id),
      webTabCount: document.querySelectorAll('#browserTabStrip [data-browser-tab-id]').length,
      specialTabCount: document.querySelectorAll('#browserTabStrip [data-browser-settings-tab]').length,
      specialActive: special?.classList.contains('active') === true,
      specialSelected: specialOpen?.getAttribute('aria-selected') || '',
      surfaceVisible: !document.getElementById('browserSettingsSurface').classList.contains('hidden'),
      settingsOpen: player.browserSettingsOpen,
      returnTabId: player.browserSettingsReturnTabId,
      categoryCount: document.querySelectorAll('#browserSettingsCategories [data-browser-settings-category]').length,
      activeCategory: document.querySelector('#browserSettingsCategories .active')?.dataset.browserSettingsCategory || '',
      resultIds,
      opened,
      focusedId: document.activeElement?.id || '',
      persistentInSurface: document.querySelectorAll('#browserSettingsSurfaceContent [data-browser-settings-kind="persistent"]').length,
      liveInDrawer: document.querySelectorAll('#browserLiveViewToolsHost [data-browser-settings-kind="live"]').length,
      diagnosticInPanel: document.querySelectorAll('#browserDiagnosticsPanel [data-browser-settings-kind="diagnostic"]').length,
      blockedReload,
      toggleExpanded: toggle.getAttribute('aria-expanded'),
      formTheme,
    };
  })()`, 20000);
  const settingsNativeHidden = await waitFor(async () => browserViewVisible()
    .then((visible) => visible === false).catch(() => false), 3000, 50);
  assert.deepEqual(settingsTabFlow.beforeTabIds, settingsTabFlow.modelTabIds,
    'Opening Settings changed the real browser tab model.');
  assert.equal(settingsTabFlow.webTabCount, settingsTabFlow.modelTabIds.length,
    'Settings was counted as a real web tab.');
  assert.equal(settingsTabFlow.specialTabCount, 1, 'Settings did not render exactly one special tab.');
  assert.equal(settingsTabFlow.specialActive, true, 'The special Settings tab is not active.');
  assert.equal(settingsTabFlow.specialSelected, 'true', 'The Settings tab ARIA selection is incorrect.');
  assert.equal(settingsTabFlow.surfaceVisible, true, 'The Settings surface is not visible.');
  assert.equal(settingsTabFlow.settingsOpen, true, 'The Settings tab lifecycle flag was not set.');
  assert.equal(settingsTabFlow.returnTabId, tabId, 'Settings did not remember the invoking web tab.');
  assert.equal(settingsTabFlow.categoryCount, 5, 'The registry did not render all five settings categories.');
  assert.equal(settingsTabFlow.activeCategory, 'privacy', 'Opening a registry result did not select its category.');
  assert.deepEqual(settingsTabFlow.resultIds,
    ['browserSponsorMode', 'browserSponsorCategories'],
    'SponsorBlock search did not return the two exact registry settings.');
  assert.equal(settingsTabFlow.opened, true, 'The registry setting could not be opened.');
  assert.equal(settingsTabFlow.focusedId, 'browserSponsorMode',
    'Opening a registry result did not focus the real setting control.');
  assert.ok(settingsTabFlow.persistentInSurface >= 6,
    'Persistent settings were not moved into the Settings surface.');
  assert.ok(settingsTabFlow.liveInDrawer >= 2,
    'Live page controls were not moved into the subtitle helper drawer.');
  assert.ok(settingsTabFlow.diagnosticInPanel >= 1,
    'Diagnostic controls were not kept in the diagnostics panel.');
  assert.equal(settingsTabFlow.blockedReload?.blocked, true,
    'Reload reached the hidden web page while Settings was active.');
  assert.equal(settingsTabFlow.toggleExpanded, 'true',
    'The Settings toolbar button did not reflect the open tab.');
  assert.notEqual(settingsTabFlow.formTheme.selectBackground, 'rgb(255, 255, 255)',
    'Generated profile selects fell back to the native white theme.');
  assert.notEqual(settingsTabFlow.formTheme.scopeBackground, 'rgb(255, 255, 255)',
    'The profile scope select fell back to the native white theme.');
  assert.equal(settingsTabFlow.formTheme.selectAppearance, 'none',
    'Generated profile selects did not use the application control style.');
  assert.ok(settingsTabFlow.formTheme.mainWidth <= 1042 && settingsTabFlow.formTheme.rowWidth <= 882,
    'Settings fields stretched beyond their readable measure.');
  assert.equal(settingsNativeHidden, true, 'The native browser view remained visible behind Settings.');

  assert.ok(await resizeAppWindow(main, renderer, 960, 720),
    'Narrow browser Settings window size did not settle.');
  const narrowSettingsSettled = await waitFor(async () => evaluate(renderer, `(() => {
    const side = document.getElementById('playerSide');
    return innerWidth <= 1020 && !side?.getClientRects().length;
  })()`).catch(() => false), 3000, 50);
  assert.equal(narrowSettingsSettled, true,
    'Narrow browser Settings resize did not settle before validation.');
  const narrowSettingsTab = await evaluate(renderer, `(() => {
    const layer = document.getElementById('playerLayer');
    const surface = document.getElementById('browserSettingsSurface');
    const workspace = document.getElementById('browserWorkspace');
    const side = document.getElementById('playerSide');
    return {
      settingsVisible: !surface.classList.contains('hidden') && getComputedStyle(surface).display !== 'none',
      takeover: layer.classList.contains('narrow-panel-takeover'),
      workspaceInert: workspace.inert,
      sideVisible: !!side?.getClientRects().length,
    };
  })()`);
  assert.equal(narrowSettingsTab.settingsVisible, true,
    'Narrow resize hid the active browser Settings surface.');
  assert.equal(narrowSettingsTab.takeover, false,
    'Narrow resize replaced browser Settings with the subtitle panel takeover.');
  assert.equal(narrowSettingsTab.workspaceInert, false,
    'Narrow resize made the active browser Settings surface inert.');
  assert.equal(narrowSettingsTab.sideVisible, false,
    'Narrow browser Settings left a clipped subtitle-panel strip visible.');
  assert.ok(await resizeAppWindow(main, renderer, 1280, 820),
    'Browser Settings restore window size did not settle.');

  const settingsTabClose = await evaluate(renderer, `(async () => {
    await closeBrowserSettings();
    await new Promise((resolve) => setTimeout(resolve, 160));
    return {
      browserSurface: player.browserSurface,
      settingsOpen: player.browserSettingsOpen,
      activeTabId: player.browserActiveTabId,
      specialTabCount: document.querySelectorAll('#browserTabStrip [data-browser-settings-tab]').length,
      surfaceHidden: document.getElementById('browserSettingsSurface').classList.contains('hidden'),
      toggleExpanded: document.getElementById('browserViewSettingsToggle').getAttribute('aria-expanded'),
    };
  })()`, 10000);
  const settingsNativeRestored = await waitFor(async () => browserViewVisible()
    .then((visible) => visible === true).catch(() => false), 3000, 50);
  assert.deepEqual(settingsTabClose, {
    browserSurface: 'web', settingsOpen: false, activeTabId: tabId,
    specialTabCount: 0, surfaceHidden: true, toggleExpanded: 'false',
  }, 'Closing Settings did not return to the invoking web tab cleanly.');
  assert.equal(settingsNativeRestored, true, 'Closing Settings did not restore the native browser view.');

  const responsiveMatrix = [];
  const targetSizes = [
    { name: '1366x768', width: 1366, height: 768 },
    { name: '1920x1080', width: 1920, height: 1080 },
    { name: '940x680', width: 940, height: 680 },
  ];
  const stateSetups = [
    {
      name: 'sidebar-closed',
      setup: "setSettingsDrawer(false); setViewMode('reading'); setPlayerSidebarCollapsed(true);",
      nativeVisible: true,
    },
    {
      name: 'transcript',
      setup: "setSettingsDrawer(false); setViewMode('reading'); setPlayerSidebarCollapsed(false);",
    },
    {
      name: 'settings',
      setup: "setViewMode('reading'); setPlayerSidebarCollapsed(false); setSettingsPage('browser-subtitles'); setSettingsDrawer(true);",
    },
    {
      name: 'other-menu',
      setup: "setSettingsDrawer(false); setPlayerSidebarCollapsed(true); document.getElementById('browserMoreMenu').open=true;",
      nativeVisible: false,
    },
    {
      name: 'long-title-job',
      setup: "document.getElementById('browserMoreMenu').open=false; setSettingsDrawer(false); setViewMode('reading'); setPlayerSidebarCollapsed(true); document.getElementById('playerTitle').textContent='Çok uzun bir video başlığı · '.repeat(24); document.getElementById('playerParseText').textContent='Uzun video işleniyor · kalan süre hesaplanıyor'; document.getElementById('playerParseStatus').classList.remove('hidden');",
      nativeVisible: true,
    },
  ];
  for (const target of targetSizes) {
    assert.ok(await resizeAppWindow(main, renderer, target.width, target.height),
      `${target.name}: Electron window size did not settle.`);
    for (const stateSpec of stateSetups) {
      const snapshot = await evaluate(renderer, `(async () => {
        document.getElementById('browserMoreMenu').open = false;
        document.getElementById('playerParseStatus').classList.add('hidden');
        document.getElementById('playerTitle').textContent = player.browserPageTitle || 'Tarayıcı';
        ${stateSpec.setup}
        syncResponsivePlayerLayout();
        await new Promise((resolve) => setTimeout(resolve, 140));
        const box = (node) => {
          if (!node) return null;
          const rect = node.getBoundingClientRect();
          const style = getComputedStyle(node);
          return {
            left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom,
            width: rect.width, height: rect.height,
            visible: style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0,
          };
        };
        const layer = document.getElementById('playerLayer');
        const body = layer.querySelector('.player-body');
        const title = document.getElementById('playerTitle');
        const slot = document.getElementById('browserViewSlot');
        const side = document.getElementById('playerSide');
        const drawer = document.getElementById('settingsDrawer');
        const menu = document.querySelector('#browserMoreMenu .browser-menu-popover');
        const headCopy = layer.querySelector('.player-head-copy');
        const workspaceSwitch = layer.querySelector('.player-workspace-switch');
        const actions = layer.querySelector('.player-head-actions');
        const newTab = document.getElementById('browserTabNew');
        const adblockQuick = document.getElementById('browserAdblockQuick');
        return {
          viewport: { width: innerWidth, height: innerHeight },
          takeover: layer.classList.contains('narrow-panel-takeover'),
          overflowX: document.documentElement.scrollWidth > innerWidth + 1 || layer.scrollWidth > layer.clientWidth + 1,
          surfacesInert: ['playerStage','browserWorkspace','pdfReader'].every((id) => document.getElementById(id).inert),
          backVisible: box(document.getElementById('narrowPanelBack')).visible,
          parseVisible: box(document.getElementById('playerParseStatus')).visible,
          head: box(layer.querySelector('.player-head')),
          body: box(body),
          slot: box(slot),
          side: box(side),
          drawer: box(drawer),
          menu: box(menu),
          title: { ...box(title), clipped: title.scrollWidth > title.clientWidth, textOverflow: getComputedStyle(title).textOverflow },
          headCopy: box(headCopy),
          workspaceSwitch: box(workspaceSwitch),
          actions: box(actions),
          newTab: box(newTab),
          adblockQuick: box(adblockQuick),
        };
      })()`, 10000);
      const nativeVisible = await browserViewVisible();
      const narrow = snapshot.viewport.width <= 1020;
      assert.equal(snapshot.overflowX, false,
        `${target.name} / ${stateSpec.name}: horizontal overflow detected.`);
      assert.ok(snapshot.actions.right <= snapshot.viewport.width - 8,
        `${target.name} / ${stateSpec.name}: header actions crossed the content edge.`);
      assert.ok(snapshot.headCopy.right <= snapshot.workspaceSwitch.left + 1
        && snapshot.workspaceSwitch.right <= snapshot.actions.left + 1,
      `${target.name} / ${stateSpec.name}: header groups overlap.`);
      assert.equal(snapshot.newTab.visible, true,
        `${target.name} / ${stateSpec.name}: new-tab control is hidden.`);
      assert.equal(snapshot.adblockQuick.visible, true,
        `${target.name} / ${stateSpec.name}: adblock quick control is hidden.`);
      assert.ok(snapshot.adblockQuick.left >= snapshot.newTab.right
        && snapshot.adblockQuick.left - snapshot.newTab.right <= 7,
      `${target.name} / ${stateSpec.name}: adblock quick control left the new-tab group.`);
      if (stateSpec.name === 'transcript' || stateSpec.name === 'settings') {
        assert.equal(snapshot.takeover, narrow,
          `${target.name} / ${stateSpec.name}: unexpected panel takeover state.`);
        assert.equal(snapshot.surfacesInert, narrow,
          `${target.name} / ${stateSpec.name}: background inert state is incorrect.`);
        assert.equal(snapshot.backVisible, narrow,
          `${target.name} / ${stateSpec.name}: narrow return control visibility is incorrect.`);
        assert.equal(nativeVisible, !narrow,
          `${target.name} / ${stateSpec.name}: native browser visibility is incorrect.`);
        if (narrow) {
          assert.ok(Math.abs(snapshot.side.left - snapshot.body.left) <= 2
            && Math.abs(snapshot.side.right - snapshot.body.right) <= 2,
          `${target.name} / ${stateSpec.name}: panel does not cover the content area: ${JSON.stringify({ side: snapshot.side, body: snapshot.body })}`);
        } else {
          assert.ok(snapshot.side.width >= 320 && snapshot.side.width <= 520,
            `${target.name} / ${stateSpec.name}: panel width left the 320-520 px range.`);
          assert.ok(snapshot.side.left >= snapshot.slot.right - 1,
            `${target.name} / ${stateSpec.name}: side panel overlaps the browser slot.`);
        }
      }
      if (stateSpec.name === 'settings') {
        assert.equal(snapshot.drawer.visible, true,
          `${target.name}: settings drawer is not visible.`);
      }
      if (stateSpec.name === 'other-menu') {
        assert.equal(snapshot.menu.visible, true, `${target.name}: Other menu is not visible.`);
        assert.ok(snapshot.menu.left >= 0 && snapshot.menu.right <= snapshot.viewport.width
          && snapshot.menu.top >= 0 && snapshot.menu.bottom <= snapshot.viewport.height - 8,
          `${target.name}: Other menu leaves the viewport.`);
      }
      if (stateSpec.name === 'long-title-job') {
        assert.equal(snapshot.parseVisible, !narrow,
          `${target.name}: long job status does not follow the narrow-header rule.`);
        if (snapshot.title.clipped) assert.equal(snapshot.title.textOverflow, 'ellipsis',
          `${target.name}: long title is clipped without ellipsis.`);
      }
      if (typeof stateSpec.nativeVisible === 'boolean') {
        assert.equal(nativeVisible, stateSpec.nativeVisible,
          `${target.name} / ${stateSpec.name}: native browser visibility is incorrect.`);
      }
      responsiveMatrix.push({
        size: target.name,
        state: stateSpec.name,
        narrow,
        takeover: snapshot.takeover,
        panelWidth: snapshot.side.visible ? Math.round(snapshot.side.width) : 0,
        overflowX: snapshot.overflowX,
        nativeVisible,
      });
    }
  }
  assert.ok(await resizeAppWindow(main, renderer, 1280, 820),
    'Post-matrix Electron window size did not settle.');
  await evaluate(renderer, "(() => { document.getElementById('browserMoreMenu').open=false; document.getElementById('playerParseStatus').classList.add('hidden'); document.getElementById('playerTitle').textContent=player.browserPageTitle||'Tarayıcı'; setSettingsDrawer(false); setViewMode('reading'); setPlayerSidebarCollapsed(false); syncResponsivePlayerLayout(); return true; })()");
  await delay(220);

  const menuOpened = await waitFor(async () => evaluate(renderer, `(() => {
    const more = document.getElementById('browserMoreMenu');
    if (!more.open) more.querySelector('summary')?.click();
    return more.open;
  })()`).catch(() => false), 3000, 50);
  const menuOcclusion = { open: menuOpened === true };
  const menuVisibility = await waitFor(async () => browserViewVisible()
    .then((visible) => visible === false).catch(() => false), 3000, 50);
  await evaluate(renderer, "(() => { closeBrowserToolbarMenus(); return !document.getElementById('browserMoreMenu').open; })()");
  const menuRestored = await waitFor(async () => browserViewVisible()
    .then((visible) => visible === true).catch(() => false), 3000, 50);
  const menuRestoreDiagnostics = menuRestored ? null : {
    renderer: await evaluate(renderer, `(() => ({
      workspaceMode: player.workspaceMode,
      surface: player.browserSurface,
      activeTabId: player.browserActiveTabId,
      pageUrl: player.browserPageUrl,
      menuOpen: document.getElementById('browserMoreMenu').open,
      takeover: document.getElementById('playerLayer').classList.contains('narrow-panel-takeover'),
      settingsOpen: !document.getElementById('settingsDrawer').classList.contains('hidden'),
    }))()`),
    main: await evaluate(main, `(() => {
      const req=process.getBuiltinModule('module').createRequire(process.execPath);
      const electron=req('electron');
      const win=electron.BrowserWindow.getAllWindows()[0];
      return (win?.contentView?.children || []).map((view) => ({
        id: view.webContents?.id || null,
        url: view.webContents?.getURL?.() || '',
        visible: typeof view.getVisible === 'function' ? view.getVisible() : null,
        destroyed: view.webContents?.isDestroyed?.() ?? null,
      }));
    })()`),
  };
  assert.equal(menuOcclusion.open, true, 'Other menu did not open.');
  assert.equal(menuVisibility, true, 'Native browser view stayed visible behind the Other menu.');
  assert.equal(menuRestored, true,
    'Native browser view did not restore after closing the menu: ' + JSON.stringify(menuRestoreDiagnostics));

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

  const settingsPanel = await evaluate(renderer, "(async () => { setSideTab('ai'); document.getElementById('cueSearch').value='electron acceptance search'; document.getElementById('aiChatText').value='Korunacak AI taslağı'; document.getElementById('sideTabAi').focus(); setSettingsPage('browser-subtitles'); setSettingsDrawer(true); await Promise.race([new Promise((resolve)=>requestAnimationFrame(()=>requestAnimationFrame(resolve))),new Promise((resolve)=>setTimeout(resolve,250))]); const drawer=document.getElementById('settingsDrawer'); const slot=document.getElementById('browserViewSlot'); const dr=drawer.getBoundingClientRect(); const sr=slot.getBoundingClientRect(); return {open:!drawer.classList.contains('hidden'),focusId:document.activeElement?.id||'',breadcrumb:document.getElementById('settingsDrawerBreadcrumb').textContent,drawer:{left:dr.left,top:dr.top,right:dr.right,bottom:dr.bottom},slot:{left:sr.left,top:sr.top,right:sr.right,bottom:sr.bottom},overlap:!(dr.right<=sr.left||dr.left>=sr.right||dr.bottom<=sr.top||dr.top>=sr.bottom)}; })()", 15000);
  const settingsAlongsideVisible = await browserViewVisible();
  assert.equal(settingsPanel.open, true, 'Settings did not open in the right workspace panel.');
  assert.equal(settingsPanel.focusId, 'closeSettings', 'Settings did not move focus into the panel.');
  assert.equal(settingsPanel.breadcrumb, 'Ayarlar / Altyazı ve çeviri', 'Settings breadcrumb did not identify the active page.');
  assert.equal(settingsPanel.overlap, false, 'Normal right-panel settings overlap the native browser slot.');
  assert.equal(settingsAlongsideVisible, true, 'Normal right-panel settings unnecessarily hid the native browser view.');

  await evaluate(renderer, "(async () => { setViewMode('cinema'); await new Promise((resolve)=>setTimeout(resolve,120)); return true; })()", 10000);
  const settingsCinemaVisible = await browserViewVisible();
  assert.equal(settingsCinemaVisible, false, 'Changing to cinema mode left the settings overlay behind the native browser view.');
  await evaluate(renderer, "(async () => { setViewMode('reading'); await new Promise((resolve)=>setTimeout(resolve,120)); return true; })()", 10000);
  const settingsReadingRestored = await browserViewVisible();
  assert.equal(settingsReadingRestored, true, 'Returning to reading mode did not restore the native browser beside settings.');

  const settingsBack = await evaluate(renderer, "(async () => { document.getElementById('settingsBackToPanel').click(); await Promise.race([new Promise((resolve)=>requestAnimationFrame(()=>requestAnimationFrame(resolve))),new Promise((resolve)=>setTimeout(resolve,250))]); return {closed:document.getElementById('settingsDrawer').classList.contains('hidden'),sideTab:player.sideTab,aiDraft:document.getElementById('aiChatText').value,cueSearch:document.getElementById('cueSearch').value}; })()");
  assert.equal(settingsBack.closed, true, 'Settings Back did not close the settings view.');
  assert.equal(settingsBack.sideTab, 'ai', 'Settings Back did not return to the prior workspace tab.');
  assert.equal(settingsBack.aiDraft, 'Korunacak AI taslağı', 'Settings transition discarded the AI draft.');
  assert.equal(settingsBack.cueSearch, 'electron acceptance search', 'Settings transition discarded transcript search.');

  const settingsClose = await evaluate(renderer, "(async () => { setSideTab('subs'); const search=document.getElementById('cueSearch'); search.focus(); setSettingsPage('browser-subtitles'); setSettingsDrawer(true); await Promise.race([new Promise((resolve)=>requestAnimationFrame(()=>requestAnimationFrame(resolve))),new Promise((resolve)=>setTimeout(resolve,250))]); document.getElementById('closeSettings').click(); await Promise.race([new Promise((resolve)=>requestAnimationFrame(()=>requestAnimationFrame(resolve))),new Promise((resolve)=>setTimeout(resolve,250))]); return {closed:document.getElementById('settingsDrawer').classList.contains('hidden'),sideTab:player.sideTab,focusId:document.activeElement?.id||''}; })()");
  assert.equal(settingsClose.closed, true, 'Settings Close did not close the settings view.');
  assert.equal(settingsClose.sideTab, 'subs', 'Settings Close unexpectedly changed the workspace tab.');
  assert.equal(settingsClose.focusId, 'cueSearch', 'Settings Close did not restore the invoking focus.');

  const settingsOverlay = await evaluate(renderer, "(async () => { setPlayerSidebarCollapsed(true); setSettingsPage('browser-subtitles'); setSettingsDrawer(true); await new Promise((resolve)=>setTimeout(resolve,120)); const layer=document.getElementById('playerLayer'); return {open:layer.classList.contains('settings-open'),collapsed:layer.classList.contains('sidebar-collapsed')}; })()", 10000);
  const settingsOverlayVisible = await browserViewVisible();
  assert.deepEqual(settingsOverlay, { open: true, collapsed: true }, 'Collapsed-sidebar settings did not become an overlay.');
  assert.equal(settingsOverlayVisible, false, 'Settings overlay stayed behind the native browser view.');
  await evaluate(renderer, "(async () => { setSettingsDrawer(false); setPlayerSidebarCollapsed(false); await new Promise((resolve)=>setTimeout(resolve,120)); return true; })()", 10000);
  const settingsOverlayRestored = await browserViewVisible();
  assert.equal(settingsOverlayRestored, true, 'Native browser view did not return after closing the settings overlay.');

  const panel = await evaluate(renderer, "(() => { const toggle=document.getElementById('subtitleFindReplaceToggle'); if(document.getElementById('subtitleFindReplacePanel').classList.contains('hidden'))toggle.click(); const panel=document.getElementById('subtitleFindReplacePanel'); const slot=document.getElementById('browserViewSlot'); const pr=panel.getBoundingClientRect(); const sr=slot.getBoundingClientRect(); const hit=document.elementFromPoint(pr.left+Math.min(20,pr.width/2),pr.top+Math.min(20,pr.height/2)); return {visible:!panel.classList.contains('hidden')&&getComputedStyle(panel).display!=='none',focusId:document.activeElement?.id||'',panel:{left:pr.left,top:pr.top,right:pr.right,bottom:pr.bottom,width:pr.width,height:pr.height},slot:{left:sr.left,top:sr.top,right:sr.right,bottom:sr.bottom,width:sr.width,height:sr.height},overlap:!(pr.right<=sr.left||pr.left>=sr.right||pr.bottom<=sr.top||pr.top>=sr.bottom),hitInside:!!hit?.closest('#subtitleFindReplacePanel')}; })()");
  assert.equal(panel.visible, true, 'Find/replace panel is not visible in browser mode.');
  assert.equal(panel.focusId, 'subtitleFindText', 'Find/replace panel did not focus its search field.');
  assert.equal(panel.overlap, false, 'Find/replace panel overlaps the native browser slot.');
  assert.equal(panel.hitInside, true, 'Find/replace panel is not hit-testable.');
  assert.ok(panel.panel.width > 100 && panel.panel.height > 40, 'Find/replace panel has unusable bounds.');

  const initialBoundsSync = await evaluate(renderer, `(async () => {
    setSubtitleFindReplaceOpen(false);
    const bounds = browserSlotBounds();
    if (!bounds || !window.api.setBrowserBounds) return null;
    return window.api.setBrowserBounds(player.browserActiveTabId, bounds);
  })()`);
  assert.equal(initialBoundsSync?.ok, true,
    'Initial browser bounds could not be applied before fullscreen validation.');
  let lastInitialPair = null;
  const initialPair = await waitFor(async () => {
    const layout = await evaluate(renderer,
      "(() => { const slot=browserSlotBounds(); return {slot,window:{width:window.innerWidth,height:window.innerHeight}}; })()", 3000);
    const viewport = await evaluate(page,
      "({width:window.innerWidth,height:window.innerHeight,fullscreen:!!document.fullscreenElement})", 3000);
    lastInitialPair = { layout, viewport };
    return near(viewport.width, layout.slot.width) && near(viewport.height, layout.slot.height)
      ? { layout, viewport } : null;
  }, 5000);
  const initialNativeViews = initialPair ? null : await evaluate(main, `(() => {
    const req = process.getBuiltinModule('module').createRequire(process.execPath);
    const win = req('electron').BrowserWindow.getAllWindows()[0];
    return (win?.contentView?.children || []).map((view) => ({
      url: view.webContents?.getURL?.() || '',
      bounds: view.getBounds?.() || null,
      visible: view.getVisible?.() ?? null,
    }));
  })()`).catch(() => null);
  assert.ok(initialPair,
    'Initial browser viewport did not settle on its current slot: '
      + JSON.stringify({ ...lastInitialPair, nativeViews: initialNativeViews }));
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

  const exitRequested = await evaluate(page, `(() => {
    const work = document.exitFullscreen();
    work?.catch?.(() => {});
    return true;
  })()`, 3000, { userGesture: true });
  assert.equal(exitRequested, true, 'Fullscreen exit request could not be dispatched.');
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

  const permissionQuery = await evaluate(page, "(async () => { let query='unavailable'; try { const result=await Promise.race([navigator.permissions.query({name:'camera'}),new Promise((resolve)=>setTimeout(()=>resolve({timeout:'query-timeout'}),1500))]); query=result.timeout||result.state||'unavailable'; } catch (error) { query=error.name; } window.__permissionProbe=navigator.mediaDevices.getUserMedia({audio:true,video:true}).then(()=>({granted:true,error:''})).catch((error)=>({granted:false,error:error.name})); return query; })()", 5000, { userGesture: true });
  const permissionPrompt = await waitFor(async () => evaluate(renderer,
    "(() => { const prompt=document.getElementById('browserPermissionPrompt'); return !prompt?.classList.contains('hidden')&&/kamera|mikrofon/u.test(document.getElementById('browserPermissionPromptText')?.textContent||''); })()",
    3000).catch(() => false), 5000);
  assert.equal(permissionPrompt, true, 'Camera/microphone permission request did not reach the application prompt.');
  const permissionBlocked = await evaluate(renderer,
    "(() => { const button=document.querySelector('#browserPermissionPrompt [data-permission-decision=\"block-once\"]'); if(!button)return false; button.click(); return true; })()");
  assert.equal(permissionBlocked, true, 'The one-time permission denial control was unavailable.');
  const permissionResult = await evaluate(page, "Promise.race([window.__permissionProbe,new Promise((resolve)=>setTimeout(()=>resolve({granted:false,error:'media-timeout'}),5000))])", 8000);
  const permission = { query: permissionQuery, ...permissionResult };
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

  const lifecycle = await verifyBrowserLoadingLifecycle(renderer, main, siteUrl);

  assert.equal(renderer.exceptions.length, 0, 'Main renderer exceptions: ' + renderer.exceptions.join(' | '));
  assert.equal(page.exceptions.length, 0, 'Browser page exceptions: ' + page.exceptions.join(' | '));
  const result = {
    tabId,
    panel,
    settings: {
      tab: settingsTabFlow, tabClose: settingsTabClose,
      panel: settingsPanel, back: settingsBack, close: settingsClose, overlay: settingsOverlay,
    },
    responsiveMatrix,
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
    subframeNavigation,
    lifecycle,
  };
  console.log('electron-browser-experience-smoke: ' + JSON.stringify(result));
  page.socket.close();
  renderer.socket.close();
  main.socket.close();
}

async function cleanup() {
  for (const response of stalledResponses) response.destroy();
  stalledResponses.clear();
  if (electronProcess && electronProcess.exitCode == null) {
    spawnSync('taskkill.exe', ['/pid', String(electronProcess.pid), '/T', '/F'], {
      windowsHide: true,
      stdio: 'ignore',
      timeout: 10000,
    });
  }
  electronProcess = null;
  if (server) {
    server.closeAllConnections?.();
    await new Promise((resolve) => server.close(resolve));
  }
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
