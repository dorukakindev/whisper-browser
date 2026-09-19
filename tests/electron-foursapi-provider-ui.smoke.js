'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const { app, BrowserWindow } = require('electron');

const root = path.resolve(__dirname, '..');
const out = path.join(root, '.uiprev', 'foursapi-provider-ui');
const probeServer = http.createServer((request, response) => {
  let body = '';
  request.setEncoding('utf8');
  request.on('data', (chunk) => { body += chunk; });
  request.on('end', () => {
    let model = '';
    try { model = JSON.parse(body).model; } catch (_) {}
    response.setHeader('content-type', 'application/json');
    if (model === 'missing-model') {
      response.statusCode = 404;
      response.end(JSON.stringify({ error: { message: 'unknown model missing-model' } }));
      return;
    }
    response.end(JSON.stringify({ choices: [{ message: { content: 'OK' } }] }));
  });
});
probeServer.listen(0, '127.0.0.1');
fs.mkdirSync(out, { recursive: true });
process.env.WHISPER_RESOURCE_SOAK_USER_DATA = path.join(out, `profile-${process.pid}-${Date.now()}`);
fs.mkdirSync(process.env.WHISPER_RESOURCE_SOAK_USER_DATA, { recursive: true });
app.setAppPath(root);
app.setPath('userData', process.env.WHISPER_RESOURCE_SOAK_USER_DATA);
app.commandLine.appendSwitch('disable-gpu');
require('../src/main.js');

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function until(fn, label, timeout = 20000) {
  const end = Date.now() + timeout;
  while (Date.now() < end) {
    const value = await fn();
    if (value) return value;
    await wait(120);
  }
  throw new Error(`${label} zaman aşımı`);
}

app.whenReady().then(async () => {
  const win = await until(() => BrowserWindow.getAllWindows().find((item) =>
    item.webContents.getURL().includes('index.html') && !item.webContents.isLoading()), 'Ana pencere');
  const run = (code) => win.webContents.executeJavaScript(`(async()=>{${code}})()`, true);
  await until(() => run('return typeof initialSettingsReady !== "undefined" ? await initialSettingsReady.then(()=>true) : false'), 'Ayarlar');

  win.setContentSize(1366, 900);
  const wide = await run(`
    const translationPreset = document.getElementById('translateEndpointPreset');
    const translationModel = document.getElementById('translateModel');
    const mangaPreset = document.getElementById('mangaEndpointPreset');
    const mangaModel = document.getElementById('mangaModel');
    const section = translationPreset.closest('details');
    section.open = true;
    translationPreset.value = 'https://4sapi.com/v1';
    translationPreset.dispatchEvent(new Event('change', { bubbles: true }));
    mangaPreset.value = 'https://4sapi.com/v1';
    mangaPreset.dispatchEvent(new Event('change', { bubbles: true }));
    translationModel.value = 'custom-provider-model';
    document.getElementById('translateAddModel').click();
    await new Promise((resolve) => setTimeout(resolve, 100));
    translationPreset.scrollIntoView({ block: 'center' });
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    const trOption = translationPreset.selectedOptions[0];
    const mangaOption = mangaPreset.selectedOptions[0];
    const trRect = translationPreset.getBoundingClientRect();
    const mangaRect = mangaPreset.getBoundingClientRect();
    return {
      translationProvider: trOption.textContent.trim(),
      translationModel: translationModel.value,
      mangaProvider: mangaOption.textContent.trim(),
      mangaModel: mangaModel.value,
      savedModels: [...document.getElementById('translateSavedModel').options].map((item) => item.value),
      probeButton: document.getElementById('translateProbeBtn').textContent.trim(),
      probeStatus: document.getElementById('translateProbeStatus').textContent.trim(),
      translationVisible: trRect.width > 0 && trRect.height > 0,
      mangaVisible: mangaRect.width > 0 && mangaRect.height > 0,
      overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
    };
  `);
  assert.match(wide.translationProvider, /4SAPI/);
  assert.equal(wide.translationModel, 'custom-provider-model');
  assert.match(wide.mangaProvider, /4SAPI/);
  assert.equal(wide.mangaModel, 'gemini-3.8-flash');
  assert(wide.savedModels.includes('custom-provider-model'));
  assert.equal(wide.probeButton, 'Send test request');
  assert.equal(wide.probeStatus, 'Not tested yet.');
  assert.equal(wide.translationVisible, true);
  assert.equal(wide.mangaVisible, true);
  assert.equal(wide.overflow, false);
  fs.writeFileSync(path.join(out, 'foursapi-wide.png'), (await win.webContents.capturePage()).toPNG());

  win.setContentSize(940, 820);
  const narrow = await run(`
    const target = document.getElementById('translateEndpointPreset');
    target.scrollIntoView({ block: 'center' });
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    const tr = target.getBoundingClientRect();
    const manga = document.getElementById('mangaEndpointPreset').getBoundingClientRect();
    const modelManager = document.querySelector('.provider-model-row').getBoundingClientRect();
    const providerProbe = document.querySelector('.provider-probe').getBoundingClientRect();
    return {
      viewport: document.documentElement.clientWidth,
      translationRight: tr.right,
      mangaRight: manga.right,
      modelManagerRight: modelManager.right,
      providerProbeRight: providerProbe.right,
      overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
    };
  `);
  assert.ok(narrow.translationRight <= narrow.viewport + 1);
  assert.ok(narrow.mangaRight <= narrow.viewport + 1);
  assert.ok(narrow.modelManagerRight <= narrow.viewport + 1);
  assert.ok(narrow.providerProbeRight <= narrow.viewport + 1);
  assert.equal(narrow.overflow, false);
  fs.writeFileSync(path.join(out, 'foursapi-narrow.png'), (await win.webContents.capturePage()).toPNG());

  const probePort = await until(() => probeServer.address()?.port, 'Yerel probe sunucusu');
  const probe = await run(`
    const preset = document.getElementById('translateEndpointPreset');
    const baseUrl = document.getElementById('translateBaseUrl');
    const model = document.getElementById('translateModel');
    const button = document.getElementById('translateProbeBtn');
    const status = document.getElementById('translateProbeStatus');
    preset.value = 'custom';
    preset.dispatchEvent(new Event('change', { bubbles: true }));
    baseUrl.value = ${JSON.stringify('http://127.0.0.1:PORT/v1')}.replace('PORT', ${JSON.stringify(String(probePort))});
    baseUrl.dispatchEvent(new Event('change', { bubbles: true }));
    model.value = 'working-model';
    model.dispatchEvent(new Event('input', { bubbles: true }));
    button.click();
    const waitFor = async (expected) => {
      const end = Date.now() + 5000;
      while (Date.now() < end && status.dataset.state !== expected) {
        await new Promise((resolve) => setTimeout(resolve, 40));
      }
      return { state: status.dataset.state, text: status.textContent.trim() };
    };
    const success = await waitFor('success');
    model.value = 'missing-model';
    model.dispatchEvent(new Event('input', { bubbles: true }));
    button.click();
    const failure = await waitFor('error');
    return { success, failure };
  `);
  assert.equal(probe.success.state, 'success');
  assert.match(probe.success.text, /Connection and model are working/);
  assert.equal(probe.failure.state, 'error');
  assert.match(probe.failure.text, /selected model is not available/);

  console.log(JSON.stringify({ ok: true, wide, narrow, probe }));
  probeServer.close();
  app.exit(0);
}).catch((error) => {
  probeServer.close();
  fs.writeFileSync(path.join(out, 'error.txt'), String(error.stack || error));
  console.error(error);
  app.exit(1);
});
