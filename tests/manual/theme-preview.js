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
  await evaluate(client, `
    (() => {
      const preview = document.getElementById('preview');
      const samples = [
        { start: 4.2, end: 7.4, text: 'Normal satır, ek bir durum işareti taşımaz.' },
        { start: 8.1, end: 11.8, text: 'Şu anda işlenen aktif satır.', previewActive: true },
        { start: 12.3, end: 15.6, text: 'Bu satırın güven değeri denetim gerektiriyor.', confidence: .41, lowConfidenceWords: 2 },
        { start: 16.2, end: 20.1, text: 'Kullanıcının düzelttiği metin burada korunur.', previewEdited: true },
        { start: 20.8, end: 25.2, text: 'The translation stays attached to its source.', translationText: 'Çeviri, kaynak satırın altında ve adıyla görünür.' },
      ];
      state.previewSegs = samples.map((sample) => ({ ...sample }));
      preview.replaceChildren(...state.previewSegs.map((sample, index) => createSegmentEl(sample, index)));
      return true;
    })()
  `);
  const previewStates = await evaluate(client, `
    (() => {
      const rows = [...document.querySelectorAll('#preview .segment')];
      return {
        rows: rows.length,
        states: rows.map((row) => row.dataset.states),
        overflow: document.getElementById('preview').scrollWidth > document.getElementById('preview').clientWidth + 1,
        translationLabel: document.querySelector('.segment-translation-label')?.textContent || ''
      };
    })()
  `);
  await capture(client, 'whisper-preview-states-dark.png');
  await evaluate(client, "applyUiTheme('light'); document.getElementById('uiTheme').value='light'; true");
  await capture(client, 'whisper-theme-light.png');
  await evaluate(client, "applyUiTheme('dark'); const panel=document.querySelector('.panel-left'); const card=document.querySelector('.settings-card'); panel.scrollTop=Math.max(0, card.offsetTop - panel.offsetTop - 12); true");
  await capture(client, 'whisper-settings-dark.png');
  await evaluate(client, "document.getElementById('primarySettingsOpen').open=true; true");
  await capture(client, 'whisper-settings-open-dark.png');
  await evaluate(client, "applyUiTheme('light'); document.getElementById('primarySettingsOpen').open=false; true");
  await capture(client, 'whisper-settings-light.png');
  await client.call('Emulation.setDeviceMetricsOverride', { width: 560, height: 900, deviceScaleFactor: 1, mobile: false });
  await evaluate(client, "document.querySelector('.settings-card').scrollIntoView({block:'start'}); true");
  const settingsLayout = await evaluate(client, "(() => { const rect=(selector)=>{const r=document.querySelector(selector).getBoundingClientRect(); return {left:Math.round(r.left),right:Math.round(r.right),width:Math.round(r.width)}}; return {overflow:document.documentElement.scrollWidth > document.documentElement.clientWidth + 1, viewport:document.documentElement.clientWidth, card:rect('.settings-card'), tools:rect('.settings-head-tools'), restore:rect('#importSettings')}; })()");
  await capture(client, 'whisper-settings-light-560.png');
  await client.call('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
  await evaluate(client, "window.scrollTo(0,0); document.querySelector('.panel-left').scrollTop=0; true");
  await evaluate(client, "applyUiTheme('dark'); const layer=document.getElementById('playerLayer'); layer.classList.remove('hidden'); layer.classList.add('workspace-browser'); document.getElementById('browserWorkspace').classList.remove('hidden'); true");
  await capture(client, 'whisper-browser-dark.png');
  await evaluate(client, "applyUiTheme('light'); true");
  await capture(client, 'whisper-browser-light.png');
  await client.call('Emulation.setDeviceMetricsOverride', { width: 560, height: 900, deviceScaleFactor: 1, mobile: false });
  const metrics = await evaluate(client, "(() => ({theme:document.documentElement.dataset.theme, overflow:document.documentElement.scrollWidth > document.documentElement.clientWidth + 1, body:getComputedStyle(document.body).backgroundColor, panel:getComputedStyle(document.querySelector('.browser-workspace')).backgroundColor, text:getComputedStyle(document.querySelector('.browser-signal-kicker')).color}))()");
  await capture(client, 'whisper-browser-light-560.png');
  console.log(JSON.stringify({ ...metrics, settingsLayout, previewStates }));
  client.socket.close();
}

run().catch((error) => { console.error(error.stack || error.message); process.exitCode = 1; }).finally(() => {
  if (electronProcess && electronProcess.exitCode == null) spawnSync('taskkill.exe', ['/pid', String(electronProcess.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' });
  fs.rmSync(userDataDir, { recursive: true, force: true });
});
