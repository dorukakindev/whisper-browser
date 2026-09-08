/* Electron renderer theme preview. Uses an isolated userData directory. */
'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { spawn, spawnSync } = require('node:child_process');

const projectRoot = path.resolve(__dirname, '../..');
const outputDir = path.resolve(process.argv[2] || os.tmpdir());
const userDataDir = path.join(os.tmpdir(), `whisper-theme-preview-${randomUUID()}`);
const port = 26000 + Math.floor(Math.random() * 1000);
let electronProcess;

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function waitFor(fn, timeout = 20000) {
  const end = Date.now() + timeout;
  while (Date.now() < end) { const value = await fn().catch(() => null); if (value) return value; await delay(150); }
  return null;
}

function cdp(url) {
  const socket = new WebSocket(url); let id = 0; const pending = new Map();
  socket.addEventListener('message', ({ data }) => {
    const message = JSON.parse(String(data)); const waiter = pending.get(message.id);
    if (!waiter) return; pending.delete(message.id);
    if (message.error) waiter.reject(new Error(message.error.message)); else waiter.resolve(message.result);
  });
  const opened = new Promise((resolve, reject) => {
    socket.addEventListener('open', resolve, { once: true });
    socket.addEventListener('error', reject, { once: true });
  });
  return { socket, opened, call(method, params = {}) {
    return new Promise((resolve, reject) => { const next = ++id; pending.set(next, { resolve, reject }); socket.send(JSON.stringify({ id: next, method, params })); });
  } };
}

async function evaluate(client, expression) {
  const response = await client.call('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
  if (response.exceptionDetails) throw new Error(response.exceptionDetails.text);
  return response.result?.value;
}

async function capture(client, name) {
  await delay(120);
  const shot = await client.call('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
  fs.writeFileSync(path.join(outputDir, name), Buffer.from(shot.data, 'base64'));
}

async function run() {
  fs.mkdirSync(userDataDir, { recursive: true });
  fs.mkdirSync(outputDir, { recursive: true });
  electronProcess = spawn(path.join(projectRoot, 'node_modules', 'electron', 'dist', 'electron.exe'), [
    projectRoot, `--remote-debugging-port=${port}`, `--user-data-dir=${userDataDir}`,
  ], { cwd: projectRoot, windowsHide: true, stdio: 'ignore' });
  const targets = await waitFor(async () => {
    if (electronProcess.exitCode != null) throw new Error('Electron erken kapandı.');
    const response = await fetch(`http://127.0.0.1:${port}/json/list`); return response.ok ? response.json() : null;
  });
  const target = targets?.find((item) => item.type === 'page' && /renderer\/index\.html$/.test(item.url));
  if (!target) throw new Error('Renderer hedefi bulunamadı.');
  const client = cdp(target.webSocketDebuggerUrl); await client.opened;
  await client.call('Runtime.enable'); await client.call('Page.enable');
  await client.call('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
  const ready = await waitFor(() => evaluate(client, "document.readyState === 'complete' && typeof applyUiTheme === 'function'"));
  if (!ready) throw new Error('Renderer hazır olmadı.');
  await evaluate(client, "applyUiTheme('dark'); document.getElementById('uiTheme').value='dark'; true");
  await capture(client, 'whisper-theme-dark.png');
  await evaluate(client, "applyUiTheme('light'); document.getElementById('uiTheme').value='light'; true");
  await capture(client, 'whisper-theme-light.png');
  await evaluate(client, "applyUiTheme('dark'); const layer=document.getElementById('playerLayer'); layer.classList.remove('hidden'); layer.classList.add('workspace-browser'); document.getElementById('browserWorkspace').classList.remove('hidden'); true");
  await capture(client, 'whisper-browser-dark.png');
  await evaluate(client, "applyUiTheme('light'); true");
  await capture(client, 'whisper-browser-light.png');
  await client.call('Emulation.setDeviceMetricsOverride', { width: 560, height: 900, deviceScaleFactor: 1, mobile: false });
  const metrics = await evaluate(client, "(() => ({theme:document.documentElement.dataset.theme, overflow:document.documentElement.scrollWidth > document.documentElement.clientWidth + 1, body:getComputedStyle(document.body).backgroundColor, panel:getComputedStyle(document.querySelector('.browser-workspace')).backgroundColor, text:getComputedStyle(document.querySelector('.browser-signal-kicker')).color}))()");
  await capture(client, 'whisper-browser-light-560.png');
  console.log(JSON.stringify(metrics));
  client.socket.close();
}

run().catch((error) => { console.error(error.stack || error.message); process.exitCode = 1; }).finally(() => {
  if (electronProcess && electronProcess.exitCode == null) spawnSync('taskkill.exe', ['/pid', String(electronProcess.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' });
  fs.rmSync(userDataDir, { recursive: true, force: true });
});
