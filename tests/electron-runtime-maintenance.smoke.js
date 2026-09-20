'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { app, BrowserWindow } = require('electron');

const testProfile = fs.mkdtempSync(path.join(os.tmpdir(), 'whisper-runtime-ui-'));
app.setPath('userData', testProfile);

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

(async () => {
  await app.whenReady();
  const win = new BrowserWindow({
    show: false,
    width: 1100,
    height: 820,
    webPreferences: { contextIsolation: true, sandbox: true, nodeIntegration: false },
  });
  try {
    await win.loadFile(path.join(__dirname, '../src/renderer/index.html'));
    const readiness = await win.webContents.executeJavaScript(`({
      locale: typeof window.UiLocale,
      runtimeState: typeof runtimeState,
      runtimePanel: !!document.getElementById('runtimeMaintenance')
    })`);
    assert.deepEqual(readiness, { locale: 'object', runtimeState: 'function', runtimePanel: true });
    const state = await win.webContents.executeJavaScript(`(() => {
      try {
      window.UiLocale.set('en');
      document.getElementById('runtimeMaintenance').open = true;
      runtimeState('runtimePython', 'Python 3.12.7', 'ready');
      runtimeState('runtimeFfmpeg', 'ffmpeg 7.1', 'ready');
      runtimeState('runtimeYtdlp', 'yt-dlp 2026.09.18 · verified managed runtime', 'ready');
      runtimeState('runtimeGpu', 'NVIDIA GeForce RTX 4070 SUPER', 'ready');
      runtimeState('runtimeDisk', '120.0 GB free', 'ready');
      document.getElementById('runtimeMaintenance').scrollIntoView({ block: 'center' });
      const details = document.getElementById('runtimeMaintenance');
      const ready = document.getElementById('runtimePython');
      const box = details.getBoundingClientRect();
      return {
        lang: document.documentElement.lang,
        title: details.querySelector('summary span').textContent.trim(),
        pythonLabel: details.querySelector('dt').textContent.trim(),
        python: ready.textContent.trim(),
        marker: getComputedStyle(ready, '::before').content,
        update: document.getElementById('runtimeUpdateYtdlp').textContent.trim(),
        box: { left: box.left, right: box.right, top: box.top, bottom: box.bottom },
        viewport: { width: innerWidth, height: innerHeight },
      };
      } catch (error) { return { error: error && (error.stack || error.message || String(error)) }; }
    })()`);
    assert.ok(!state.error, state.error);
    assert.equal(state.lang, 'en');
    assert.equal(state.title, 'Runtime and maintenance');
    assert.equal(state.pythonLabel, 'Python environment');
    assert.equal(state.python, 'Python 3.12.7');
    assert.match(state.marker, /✓/);
    assert.equal(state.update, 'Update yt-dlp');
    assert.ok(state.box.left >= 0 && state.box.right <= state.viewport.width + 1);
    assert.ok(state.box.top >= 0 && state.box.bottom <= state.viewport.height + 1);

    win.showInactive();
    await wait(150);
    const wideScreenshot = path.join(testProfile, 'runtime-maintenance-en.png');
    fs.writeFileSync(wideScreenshot, (await win.capturePage()).toPNG());

    win.setSize(760, 760);
    await wait(150);
    const narrow = await win.webContents.executeJavaScript(`(() => {
      document.getElementById('runtimeMaintenance').scrollIntoView({ block: 'center' });
      window.UiLocale.set('tr');
      const details = document.getElementById('runtimeMaintenance');
      const box = details.getBoundingClientRect();
      return {
        lang: document.documentElement.lang,
        title: details.querySelector('summary span').textContent.trim(),
        update: document.getElementById('runtimeUpdateYtdlp').textContent.trim(),
        right: box.right,
        width: innerWidth,
        bodyOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      };
    })()`);
    assert.deepEqual({ lang: narrow.lang, title: narrow.title, update: narrow.update }, {
      lang: 'tr', title: 'Çalışma ortamı ve bakım', update: "yt-dlp'yi güncelle",
    });
    assert.ok(narrow.right <= narrow.width + 1);
    assert.ok(narrow.bodyOverflow <= 1, `horizontal overflow: ${narrow.bodyOverflow}px`);
    await wait(150);
    const narrowScreenshot = path.join(testProfile, 'runtime-maintenance-tr-narrow.png');
    fs.writeFileSync(narrowScreenshot, (await win.capturePage()).toPNG());
    console.log(`Runtime maintenance smoke passed · screenshots: ${wideScreenshot} · ${narrowScreenshot}`);
  } finally {
    win.destroy();
    app.quit();
  }
})().catch((error) => {
  console.error(error);
  app.exit(1);
});
