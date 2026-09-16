'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { app, BrowserWindow } = require('electron');

const root = path.resolve(__dirname, '..');
const out = path.join(root, '.uiprev', 'foursapi-provider-ui');
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
      translationVisible: trRect.width > 0 && trRect.height > 0,
      mangaVisible: mangaRect.width > 0 && mangaRect.height > 0,
      overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
    };
  `);
  assert.match(wide.translationProvider, /4SAPI/);
  assert.equal(wide.translationModel, 'gpt-5.4');
  assert.match(wide.mangaProvider, /4SAPI/);
  assert.equal(wide.mangaModel, 'gemini-3.8-flash');
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
    return {
      viewport: document.documentElement.clientWidth,
      translationRight: tr.right,
      mangaRight: manga.right,
      overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
    };
  `);
  assert.ok(narrow.translationRight <= narrow.viewport + 1);
  assert.ok(narrow.mangaRight <= narrow.viewport + 1);
  assert.equal(narrow.overflow, false);
  fs.writeFileSync(path.join(out, 'foursapi-narrow.png'), (await win.webContents.capturePage()).toPNG());

  console.log(JSON.stringify({ ok: true, wide, narrow }));
  app.exit(0);
}).catch((error) => {
  fs.writeFileSync(path.join(out, 'error.txt'), String(error.stack || error));
  console.error(error);
  app.exit(1);
});
