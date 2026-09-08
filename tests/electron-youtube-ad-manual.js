'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { spawn, spawnSync } = require('node:child_process');

const phase = process.argv[2] === 'prune' ? 'prune' : 'fallback';
const projectRoot = path.resolve(__dirname, '..');
const videos = [
  'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
  'https://www.youtube.com/watch?v=kJQP7kiw5Fk',
  'https://www.youtube.com/watch?v=9bZkp7q19f0',
  'https://www.youtube.com/watch?v=JGwWNGJdvx8',
];
const adSelectors = [
  '.html5-video-player.ad-showing',
  '.html5-video-player.ad-interrupting',
  '.ad-interrupting',
  '.ytp-ad-player-overlay',
  '.ytp-ad-text',
  '.ytp-preview-ad',
  '.ytp-ad-skip-button',
  '.ytp-skip-ad-button',
  '.ytp-ad-skip-button-modern',
];

let electronProcess = null;
let userDataDir = '';

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function withTimeout(promise, ms, label) {
  let timer;
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error(label + ' zaman aşımına uğradı.')), ms);
    }),
  ]).finally(() => clearTimeout(timer));
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
      exceptions.push(details.exception?.description || details.text || 'Bilinmeyen renderer hatası');
    }
  });
  return {
    socket,
    exceptions,
    opened: withTimeout(new Promise((resolve, reject) => {
      socket.addEventListener('open', resolve, { once: true });
      socket.addEventListener('error', reject, { once: true });
    }), 5000, 'DevTools bağlantısı'),
    call(method, params = {}) {
      return new Promise((resolve, reject) => {
        const id = ++sequence;
        pending.set(id, { resolve, reject });
        socket.send(JSON.stringify({ id, method, params }));
      });
    },
  };
}

async function evaluate(client, expression, timeout = 15000) {
  const result = await withTimeout(client.call('Runtime.evaluate', {
    expression,
    awaitPromise: true,
    returnByValue: true,
  }), timeout, 'Runtime değerlendirmesi');
  if (result.exceptionDetails) {
    throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
  }
  return result.result?.value;
}

async function waitFor(predicate, timeoutMs, intervalMs = 150) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const value = await predicate();
    if (value) return value;
    await delay(intervalMs);
  }
  return null;
}

async function targets(port) {
  try {
    const response = await fetch('http://127.0.0.1:' + port + '/json/list');
    return response.ok ? response.json() : [];
  } catch (_) {
    return [];
  }
}

async function openBrowserWorkspace(renderer) {
  const ready = await waitFor(async () => evaluate(renderer,
    "document.readyState === 'complete' && typeof setWorkspaceMode === 'function'"
      + " && typeof navigateBrowserFromAddress === 'function'").catch(() => false), 20000);
  assert.equal(ready, true, 'Ana renderer hazır olmadı.');
  await evaluate(renderer,
    "(() => { document.getElementById('playerLayer').classList.remove('hidden');"
      + " setWorkspaceMode('browser', false);"
      + " setTimeout(() => { if (!player.browserActiveTabId) void showBrowserWorkspace(); }, 0);"
      + " return true; })()");
  const tabId = await waitFor(async () => evaluate(renderer,
    "player.browserActiveTabId || ''").catch(() => ''), 15000);
  assert.ok(tabId, 'Etkin gömülü tarayıcı sekmesi oluşmadı.');
  const configured = await evaluate(renderer,
    "(async () => {"
      + " const auto=document.getElementById('browserAutoSkipAds'); if(auto)auto.checked=true;"
      + " const prune=document.getElementById('browserPlayerResponseAdPrune'); if(prune)prune.checked="
      + (phase === 'prune' ? 'true' : 'false') + ";"
      + " const adblock=await window.api.setBrowserAdblockEnabled(false);"
      + " const playerPrune=await window.api.setBrowserPlayerAdPruneEnabled("
      + (phase === 'prune' ? 'true' : 'false') + ");"
      + " return {adblock,playerPrune}; })()");
  assert.equal(configured.playerPrune?.enabled, phase === 'prune',
    'Deneysel koruma faz ayarına geçmedi: ' + JSON.stringify(configured));
  return tabId;
}

async function navigate(renderer, url) {
  const result = await evaluate(renderer,
    "(async () => { document.getElementById('browserAddress').value="
      + JSON.stringify(url)
      + "; return Promise.race([navigateBrowserFromAddress(),"
      + " new Promise((resolve)=>setTimeout(()=>resolve({ok:false,timeout:true}),20000))]); })()",
    25000);
  if (!result?.ok && !result?.aborted) {
    assert.fail('YouTube gezinmesi başlatılamadı: ' + JSON.stringify(result));
  }
  if (result?.aborted) {
    const redirected = await waitFor(async () => evaluate(renderer,
      "(() => { try { const host=new URL(player.browserPageUrl||'').hostname.toLowerCase();"
        + " return host==='youtube.com'||host.endsWith('.youtube.com'); } catch(_){ return false; } })()"
    ).catch(() => false), 20000, 250);
    assert.equal(redirected, true,
      'Tarafsız loadURL iptalinden sonra gerçek YouTube sayfası açılmadı.');
  }
}

async function youtubeTarget(port) {
  return waitFor(async () => {
    const list = await targets(port);
    return list.find((entry) => {
      if (entry.type !== 'page') return false;
      try {
        const host = new URL(entry.url).hostname.toLowerCase();
        return host === 'youtube.com' || host.endsWith('.youtube.com');
      } catch (_) {
        return false;
      }
    }) || null;
  }, 30000, 250);
}

async function acceptConsentIfPresent(page) {
  return evaluate(page,
    "(() => {"
      + " const wanted=/^(accept all|tümünü kabul et|hepsini kabul et)$/iu;"
      + " const button=[...document.querySelectorAll('button')].find((item)=>wanted.test(String(item.textContent||'').trim()));"
      + " if(!button)return false; button.click(); return true;"
      + " })()").catch(() => false);
}

async function samplePage(page) {
  return evaluate(page,
    "(() => {"
      + " const selectors=" + JSON.stringify(adSelectors) + ";"
      + " const visible=(selector)=>{const el=document.querySelector(selector);"
      + " if(!el||el.isConnected===false||!el.getClientRects().length)return false;"
      + " const style=getComputedStyle(el);return style.display!=='none'&&style.visibility!=='hidden'&&style.visibility!=='collapse';};"
      + " const matched=selectors.filter(visible);"
      + " const video=document.querySelector('video');"
      + " if(video&&video.readyState>=2&&video.paused){"
      + " document.querySelector('.ytp-large-play-button')?.click();"
      + " void video.play().catch(()=>{});"
      + " }"
      + " return {url:location.href,title:document.title,matched,"
      + " video:video?{currentTime:Number(video.currentTime)||0,duration:Number.isFinite(Number(video.duration))?Number(video.duration):0,"
      + " paused:!!video.paused,muted:!!video.muted,readyState:Number(video.readyState)||0}:null,"
      + " textTracks:video?.textTracks?.length||0};"
      + " })()", 5000);
}

async function rendererSnapshot(renderer, startedAt) {
  return evaluate(renderer,
    "(async () => {"
      + " const action=(player.browserSignalHistory||[]).find((item)=>item.at>="
      + Number(startedAt)
      + "&&/YouTube reklam/u.test(item.text));"
      + " const prune=await window.api.getBrowserPlayerAdPruneState();"
      + " return {action:action||null,adPlaying:!!player.browserAdPlaying,"
      + " adSkippable:!!player.browserAdSkippable,adRemaining:player.browserAdRemaining,"
      + " tracks:(player.browserTracks||[]).length,"
      + " sponsorStatus:document.getElementById('browserSponsorStatus')?.textContent||'',prune};"
      + " })()", 5000);
}

async function runTrial(renderer, devtoolsPort, url) {
  const startedAt = Date.now();
  await navigate(renderer, url);
  const target = await youtubeTarget(devtoolsPort);
  assert.ok(target?.webSocketDebuggerUrl, 'YouTube WebContentsView hedefi bulunamadı.');
  const page = createCdpClient(target.webSocketDebuggerUrl);
  await page.opened;
  await page.call('Runtime.enable');
  if (await acceptConsentIfPresent(page)) await delay(3000);
  const matched = new Set();
  let firstAdAt = 0;
  let latestPage = null;
  let latestRenderer = null;
  const startPrune = await rendererSnapshot(renderer, startedAt);
  const deadline = Date.now() + 25000;
  while (Date.now() < deadline) {
    latestPage = await samplePage(page).catch(() => latestPage);
    for (const selector of latestPage?.matched || []) {
      matched.add(selector);
      if (!firstAdAt) firstAdAt = Date.now();
    }
    latestRenderer = await rendererSnapshot(renderer, startedAt).catch(() => latestRenderer);
    if (latestRenderer?.adPlaying && !firstAdAt) firstAdAt = Date.now();
    const modifiedDelta = Math.max(0,
      Number(latestRenderer?.prune?.modified || 0) - Number(startPrune?.prune?.modified || 0));
    if (phase === 'fallback' && latestRenderer?.action) {
      await delay(3500);
      latestPage = await samplePage(page).catch(() => latestPage);
      latestRenderer = await rendererSnapshot(renderer, startedAt).catch(() => latestRenderer);
      break;
    }
    if (phase === 'prune' && modifiedDelta > 0 && latestPage?.video?.readyState >= 2) {
      await delay(3500);
      latestPage = await samplePage(page).catch(() => latestPage);
      latestRenderer = await rendererSnapshot(renderer, startedAt).catch(() => latestRenderer);
      break;
    }
    await delay(200);
  }
  const endPrune = latestRenderer?.prune || startPrune.prune || {};
  const result = {
    url,
    title: latestPage?.title || '',
    finalUrl: latestPage?.url || '',
    selectors: [...matched],
    action: latestRenderer?.action || null,
    selectorToActionMs: firstAdAt && latestRenderer?.action?.at
      ? Math.max(0, latestRenderer.action.at - firstAdAt) : null,
    video: latestPage?.video || null,
    textTracks: latestPage?.textTracks || 0,
    capturedTracks: Number(latestRenderer?.tracks) || 0,
    sponsorStatus: latestRenderer?.sponsorStatus || '',
    prune: {
      active: !!endPrune.active,
      interceptedDelta: Math.max(0,
        Number(endPrune.intercepted || 0) - Number(startPrune.prune?.intercepted || 0)),
      modifiedDelta: Math.max(0,
        Number(endPrune.modified || 0) - Number(startPrune.prune?.modified || 0)),
      continuedDelta: Math.max(0,
        Number(endPrune.continued || 0) - Number(startPrune.prune?.continued || 0)),
      errorsDelta: Math.max(0,
        Number(endPrune.errors || 0) - Number(startPrune.prune?.errors || 0)),
      removedFields: endPrune.removedFields || [],
      serviceWorkerExcluded: endPrune.serviceWorkerExcluded === true,
    },
    rendererExceptions: renderer.exceptions.slice(),
    pageExceptions: page.exceptions.slice(),
  };
  page.socket.close();
  return result;
}

async function run() {
  userDataDir = path.join(os.tmpdir(), 'whisper-local-youtube-' + phase + '-' + randomUUID());
  fs.mkdirSync(userDataDir, { recursive: true });
  const devtoolsPort = 26000 + Math.floor(Math.random() * 1000);
  const pathEntries = [
    path.join(projectRoot, 'backend', 'venv', 'Lib', 'site-packages', 'torch', 'lib'),
    path.join(projectRoot, 'backend', 'venv', 'Lib', 'site-packages', 'nvidia', 'cudnn', 'bin'),
    path.join(projectRoot, 'backend', 'venv', 'Lib', 'site-packages', 'nvidia', 'cublas', 'bin'),
    path.join(projectRoot, 'backend', 'bin'),
  ].filter((entry) => fs.existsSync(entry));
  const env = { ...process.env, PATH: pathEntries.concat(process.env.PATH || '').join(path.delimiter) };
  electronProcess = spawn(path.join(projectRoot, 'node_modules', 'electron', 'dist', 'electron.exe'), [
    projectRoot,
    '--remote-debugging-port=' + devtoolsPort,
    '--user-data-dir=' + userDataDir,
  ], { cwd: projectRoot, env, windowsHide: true, stdio: 'ignore' });
  const rendererTarget = await waitFor(async () => {
    if (electronProcess.exitCode != null) throw new Error('Electron erken kapandı: ' + electronProcess.exitCode);
    return (await targets(devtoolsPort)).find((entry) => entry.type === 'page'
      && /\/src\/renderer\/index\.html$/u.test(new URL(entry.url).pathname)) || null;
  }, 30000, 250);
  assert.ok(rendererTarget?.webSocketDebuggerUrl, 'Ana renderer hedefi bulunamadı.');
  const renderer = createCdpClient(rendererTarget.webSocketDebuggerUrl);
  await renderer.opened;
  await renderer.call('Runtime.enable');
  await openBrowserWorkspace(renderer);
  const results = [];
  for (const url of videos) {
    const result = await runTrial(renderer, devtoolsPort, url);
    results.push(result);
    console.log('youtube-ad-trial: ' + JSON.stringify(result));
    const success = phase === 'fallback'
      ? !!result.action
      : result.prune.modifiedDelta > 0;
    if (success) break;
  }
  const passed = phase === 'fallback'
    ? results.some((item) => item.action)
    : results.some((item) => item.prune.modifiedDelta > 0
      && item.video?.readyState >= 2);
  console.log('electron-youtube-ad-manual: ' + JSON.stringify({ phase, passed, results }));
  renderer.socket.close();
  if (!passed) process.exitCode = 2;
}

async function cleanup() {
  if (electronProcess && electronProcess.exitCode == null) {
    spawnSync('taskkill.exe', ['/pid', String(electronProcess.pid), '/T', '/F'], {
      windowsHide: true, stdio: 'ignore', timeout: 10000,
    });
  }
  electronProcess = null;
  const tempRoot = path.resolve(os.tmpdir());
  const resolved = userDataDir ? path.resolve(userDataDir) : '';
  if (resolved && resolved.startsWith(tempRoot + path.sep + 'whisper-local-youtube-')) {
    try { fs.rmSync(resolved, { recursive: true, force: true }); } catch (_) {}
  }
  userDataDir = '';
}

run().then(cleanup).catch(async (error) => {
  await cleanup();
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
