'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { spawn, spawnSync } = require('node:child_process');

const toolRoot = path.resolve(__dirname, '..');
const projectRoot = path.resolve(process.argv[2] || toolRoot);
let electronProcess = null;
let server = null;
let userDataDir = '';

function delay(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }

function withTimeout(promise, ms, label) {
  let timer;
  return Promise.race([
    promise,
    new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(label + ' timed out.')), ms); }),
  ]).finally(() => clearTimeout(timer));
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

function createCdpClient(webSocketDebuggerUrl) {
  const socket = new WebSocket(webSocketDebuggerUrl);
  let sequence = 0;
  const pending = new Map();
  socket.addEventListener('message', (message) => {
    const payload = JSON.parse(String(message.data));
    if (!payload.id || !pending.has(payload.id)) return;
    const waiter = pending.get(payload.id);
    pending.delete(payload.id);
    if (payload.error) waiter.reject(new Error(payload.error.message));
    else waiter.resolve(payload.result);
  });
  return {
    socket,
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
    expression, awaitPromise: true, returnByValue: true, ...extra,
  }), timeout, 'Runtime evaluation');
  if (result.exceptionDetails) {
    throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
  }
  return result.result?.value;
}

function silentWav(seconds = 20, sampleRate = 8000) {
  const samples = Math.max(1, Math.round(seconds * sampleRate));
  const dataBytes = samples * 2;
  const output = Buffer.alloc(44 + dataBytes);
  output.write('RIFF', 0, 'ascii'); output.writeUInt32LE(36 + dataBytes, 4);
  output.write('WAVEfmt ', 8, 'ascii'); output.writeUInt32LE(16, 16);
  output.writeUInt16LE(1, 20); output.writeUInt16LE(1, 22);
  output.writeUInt32LE(sampleRate, 24); output.writeUInt32LE(sampleRate * 2, 28);
  output.writeUInt16LE(2, 32); output.writeUInt16LE(16, 34);
  output.write('data', 36, 'ascii'); output.writeUInt32LE(dataBytes, 40);
  return output;
}

async function run() {
  const wav = silentWav();
  const vtt = 'WEBVTT\n\n00:00:00.000 --> 00:00:18.000\nFirst usable stability cue\n';
  server = http.createServer((request, response) => {
    if (request.url === '/captions.vtt') {
      response.writeHead(200, { 'Content-Type': 'text/vtt; charset=utf-8', 'Cache-Control': 'no-store' });
      response.end(vtt);
      return;
    }
    if (request.url === '/silence.wav') {
      response.writeHead(200, { 'Content-Type': 'audio/wav', 'Content-Length': wav.length, 'Cache-Control': 'no-store' });
      response.end(wav);
      return;
    }
    response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
    response.end('<!doctype html><html><body><video muted preload="auto"><source src="/silence.wav" type="audio/wav"><track kind="subtitles" src="/captions.vtt" srclang="en" label="English" default></video><script>document.querySelector("video").textTracks[0].mode="showing";</script></body></html>');
  });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const siteUrl = 'http://127.0.0.1:' + server.address().port + '/';
  userDataDir = path.join(os.tmpdir(), 'whisper-stability-measure-' + randomUUID());
  fs.mkdirSync(userDataDir, { recursive: true });
  const devtoolsPort = 26000 + Math.floor(Math.random() * 1000);
  const mainInspectPort = 28000 + Math.floor(Math.random() * 1000);
  const electronPath = path.join(toolRoot, 'node_modules', 'electron', 'dist', 'electron.exe');
  electronProcess = spawn(electronPath, [
    '--inspect=' + mainInspectPort, projectRoot, '--remote-debugging-port=' + devtoolsPort,
    '--user-data-dir=' + userDataDir, '--electron-subtitle-smoke',
  ], { cwd: projectRoot, windowsHide: true, stdio: 'ignore' });

  const targets = await waitFor(async () => {
    if (electronProcess.exitCode != null) throw new Error('Electron exited early: ' + electronProcess.exitCode);
    try {
      const response = await fetch('http://127.0.0.1:' + devtoolsPort + '/json/list');
      return response.ok ? response.json() : null;
    } catch (_) { return null; }
  }, 20000, 200);
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
    } catch (_) { return null; }
  }, 10000, 100);
  assert.ok(mainTarget?.webSocketDebuggerUrl, 'Electron main-process inspector target was not found.');
  const main = createCdpClient(mainTarget.webSocketDebuggerUrl);
  await main.opened;
  await main.call('Runtime.enable');
  await evaluate(main, "(() => { const req=process.getBuiltinModule('module').createRequire(process.execPath); const win=req('electron').BrowserWindow.getAllWindows()[0]; win.setSize(1280,820); return true; })()");
  await delay(300);

  const ready = await waitFor(async () => evaluate(renderer,
    "document.readyState==='complete'&&typeof setWorkspaceMode==='function'", 3000).catch(() => false), 15000);
  assert.equal(ready, true, 'Renderer was not ready.');
  await evaluate(renderer, "(() => { document.getElementById('playerLayer').classList.remove('hidden'); setWorkspaceMode('browser',false); setTimeout(()=>{if(!player.browserActiveTabId)void showBrowserWorkspace();},0); return true; })()");
  const tabId = await waitFor(async () => evaluate(renderer, 'player.browserActiveTabId||""', 3000).catch(() => ''), 15000);
  assert.ok(tabId, 'Browser tab was not created.');

  const instrumented = await evaluate(main, `(() => {
    const req=process.getBuiltinModule('module').createRequire(process.execPath);
    const electron=req('electron');
    const mainWc=electron.BrowserWindow.getAllWindows()[0].webContents;
    const wc=electron.webContents.getAllWebContents().find((item)=>item!==mainWc&&!item.isDestroyed());
    if(!wc)return false;
    globalThis.__stabilityExec={executeJavaScript:0,isolated:0};
    const direct=wc.executeJavaScript.bind(wc);
    wc.executeJavaScript=(...args)=>{globalThis.__stabilityExec.executeJavaScript++;return direct(...args);};
    const isolated=wc.executeJavaScriptInIsolatedWorld.bind(wc);
    wc.executeJavaScriptInIsolatedWorld=(...args)=>{globalThis.__stabilityExec.isolated++;return isolated(...args);};
    return true;
  })()`);
  assert.equal(instrumented, true, 'Browser WebContents could not be instrumented.');

  const startedAt = Date.now();
  const navigation = await evaluate(renderer, `(async()=>{document.getElementById('browserAddress').value=${JSON.stringify(siteUrl)};return navigateBrowserFromAddress();})()`, 20000);
  assert.equal(navigation?.ok, true, 'Local navigation failed: ' + JSON.stringify(navigation));
  const track = await waitFor(async () => evaluate(renderer,
    "(()=>{const item=player.browserTracks.find((candidate)=>Number(candidate.cueCount)>0);return item?{id:item.id,cueCount:item.cueCount}:null;})()",
    3000).catch(() => null), 20000, 50);
  assert.ok(track?.id, 'Subtitle track was not published.');
  const loaded = await evaluate(renderer, `(async()=>{const id=${JSON.stringify(track.id)};document.getElementById('browserTrackSelect').value=id;await useBrowserTrack(false,id);return player.browserLoadedTrackId===id&&player.cues.length>0;})()`, 15000);
  assert.equal(loaded, true, 'Published cue was not usable in the player.');
  const firstUsableCueMs = Date.now() - startedAt;
  await delay(250);
  const executeCounts = await evaluate(main, 'globalThis.__stabilityExec');

  console.log(JSON.stringify({
    projectRoot,
    commit: spawnSync('git', ['-C', projectRoot, 'rev-parse', '--short=12', 'HEAD'], { encoding: 'utf8' }).stdout.trim(),
    firstUsableCueMs,
    executeJavaScript: executeCounts.executeJavaScript,
    executeJavaScriptInIsolatedWorld: executeCounts.isolated,
    totalExecuteJavaScriptCalls: executeCounts.executeJavaScript + executeCounts.isolated,
    cueCount: track.cueCount,
  }));
  renderer.socket.close();
  main.socket.close();
}

async function cleanup() {
  if (electronProcess && electronProcess.exitCode == null) {
    spawnSync('taskkill.exe', ['/pid', String(electronProcess.pid), '/T', '/F'], {
      windowsHide: true, stdio: 'ignore', timeout: 10000,
    });
  }
  if (server) await new Promise((resolve) => server.close(resolve));
  if (userDataDir) {
    try { fs.rmSync(userDataDir, { recursive: true, force: true }); } catch (_) {}
  }
}

run().then(cleanup).catch(async (error) => {
  await cleanup();
  console.error(error.stack || error.message);
  process.exit(1);
});
