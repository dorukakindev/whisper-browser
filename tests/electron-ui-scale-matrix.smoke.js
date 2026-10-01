'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { app, BrowserWindow } = require('electron');
const { buildBrowserReaderScript } = require('../src/browser-reader');

const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'whisper-ui-scale-'));
app.setPath('userData', profile);
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function assertInside(rect, viewport, label) {
  assert.ok(rect.left >= -1, `${label} crosses left edge: ${JSON.stringify(rect)}`);
  assert.ok(rect.top >= -1, `${label} crosses top edge: ${JSON.stringify(rect)}`);
  assert.ok(rect.right <= viewport.width + 1, `${label} crosses right edge: ${JSON.stringify(rect)}`);
  assert.ok(rect.bottom <= viewport.height + 1, `${label} crosses bottom edge: ${JSON.stringify(rect)}`);
}

(async () => {
  await app.whenReady();
  const win = new BrowserWindow({ show: false, width: 1280, height: 820,
    webPreferences: { contextIsolation: true, sandbox: true, nodeIntegration: false } });
  const reader = new BrowserWindow({ show: false, width: 900, height: 760,
    webPreferences: { contextIsolation: true, sandbox: true, nodeIntegration: false } });
  try {
    await win.loadFile(path.join(__dirname, '../src/renderer/index.html'));
    await reader.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(`<!doctype html><meta charset="utf-8"><title>Reader fixture</title><article><h1>Long-form subtitle research</h1><p>${'A bounded paragraph for responsive reading. '.repeat(30)}</p><h2>Capture</h2><p>${'Caption acquisition evidence. '.repeat(20)}</p><h2>Translation</h2><pre>${'a-very-long-unbroken-diagnostic-token-'.repeat(18)}</pre><p>${'Translation context and timing. '.repeat(20)}</p></article>`));
    const readerScript = buildBrowserReaderScript('open', { fontSize: 23, lineHeight: 1.72, width: 920 });
    const opened = await reader.webContents.executeJavaScript(readerScript);
    assert.equal(opened.ok, true);

    const cases = [
      { width: 1280, height: 820, zoom: 1 },
      { width: 1024, height: 720, zoom: 1.25 },
      { width: 760, height: 700, zoom: 1.5 },
    ];
    for (const item of cases) {
      win.setContentSize(item.width, item.height);
      win.webContents.setZoomFactor(item.zoom);
      await wait(120);
      const state = await win.webContents.executeJavaScript(`(() => {
        const layer = document.getElementById('playerLayer');
        layer.classList.remove('hidden');
        layer.classList.add('workspace-browser');
        document.getElementById('browserWorkspace').classList.remove('hidden');
        for (const id of ['browserTranslateMenu','browserMoreMenu']) document.getElementById(id).open = true;
        const drawer = document.getElementById('settingsDrawer');
        drawer.classList.remove('hidden');
        layer.classList.add('settings-open');
        const rect = (element) => { const r=element.getBoundingClientRect(); return {left:r.left,top:r.top,right:r.right,bottom:r.bottom,width:r.width,height:r.height}; };
        return {
          viewport:{width:innerWidth,height:innerHeight},
          overflow:document.documentElement.scrollWidth-document.documentElement.clientWidth,
          translate:rect(document.querySelector('#browserTranslateMenu .browser-menu-popover')),
          more:rect(document.querySelector('#browserMoreMenu .browser-menu-popover')),
          drawer:rect(drawer),
        };
      })()`);
      assert.ok(state.overflow <= 1, `renderer horizontal overflow at ${JSON.stringify(item)}: ${state.overflow}`);
      assertInside(state.translate, state.viewport, `translate menu ${item.zoom}x`);
      assertInside(state.more, state.viewport, `more menu ${item.zoom}x`);
      assertInside(state.drawer, state.viewport, `settings drawer ${item.zoom}x`);

      reader.setContentSize(item.width, item.height);
      reader.webContents.setZoomFactor(item.zoom);
      await wait(120);
      const reading = await reader.webContents.executeJavaScript(`(() => {
        const host=document.getElementById('whisper-reader-host');
        const r=host.getBoundingClientRect();
        return {viewport:{width:innerWidth,height:innerHeight},overflow:host.scrollWidth-host.clientWidth,
          documentOverflow:document.documentElement.scrollWidth-document.documentElement.clientWidth,
          host:{left:r.left,top:r.top,right:r.right,bottom:r.bottom,width:r.width,height:r.height},
          preferences:window.__whisperReaderController.snapshot().preferences};
      })()`);
      assert.ok(reading.overflow <= 1, `reader horizontal overflow at ${JSON.stringify(item)}: ${reading.overflow}`);
      assert.ok(reading.documentOverflow <= 1, `reader document overflow at ${JSON.stringify(item)}: ${reading.documentOverflow}`);
      assertInside(reading.host, reading.viewport, `reader host ${item.zoom}x`);
      assert.deepEqual(reading.preferences, { fontSize: 23, lineHeight: 1.72, width: 920 });
    }
    const closed = await reader.webContents.executeJavaScript(buildBrowserReaderScript('close'));
    assert.equal(closed.active, false);
    const restored = await reader.webContents.executeJavaScript(`({
      host: Boolean(document.getElementById('whisper-reader-host')),
      rootOverflow: document.documentElement.style.overflow,
      bodyOverflow: document.body.style.overflow,
    })`);
    assert.deepEqual(restored, { host: false, rootOverflow: '', bodyOverflow: '' });
    assert.equal((await reader.webContents.executeJavaScript(readerScript)).active, true);
    win.showInactive();
    await wait(120);
    const screenshot = path.join(profile, 'ui-scale-matrix.png');
    fs.writeFileSync(screenshot, (await win.capturePage()).toPNG());
    const readerScreenshot = path.join(profile, 'reader-scale-matrix.png');
    fs.writeFileSync(readerScreenshot, (await reader.capturePage()).toPNG());
    console.log(`UI scale matrix passed · screenshots: ${screenshot} · ${readerScreenshot}`);
  } finally {
    win.destroy();
    reader.destroy();
    app.quit();
  }
})().catch((error) => { console.error(error); app.exit(1); });
