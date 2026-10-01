'use strict';

// Real Chromium layout catches <summary>'s default list-item alignment and
// later .btn-icon rules shrinking the player/browser icon hit targets.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { app, BrowserWindow } = require('electron');
require('./electron-stub-ipc').registerBareWindowIpcStubs();

const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'whisper-icon-smoke-'));
app.setPath('userData', profile);
app.commandLine.appendSwitch('disable-gpu');
const watchdog = setTimeout(() => app.exit(1), 20000);

async function measure(win, mode, ids) {
  return win.webContents.executeJavaScript(`
    (() => {
      const layer = document.getElementById('playerLayer');
      layer.classList.remove('hidden');
      layer.classList.toggle('workspace-browser', ${JSON.stringify(mode)} === 'browser');
      layer.style.animation = 'none';
      return Object.fromEntries(${JSON.stringify(ids)}.map(id => {
        const el = document.getElementById(id);
        const icon = el.querySelector('svg');
        const outer = el.getBoundingClientRect();
        const inner = icon.getBoundingClientRect();
        return [id, {
          width: outer.width, height: outer.height,
          dx: inner.x + inner.width / 2 - (outer.x + outer.width / 2),
          dy: inner.y + inner.height / 2 - (outer.y + outer.height / 2),
          display: getComputedStyle(el).display,
        }];
      }));
    })()
  `);
}

app.whenReady().then(async () => {
  const win = new BrowserWindow({ width: 1380, height: 800, show: false,
    webPreferences: { sandbox: true, contextIsolation: true } });
  await win.loadFile(path.join(__dirname, '..', 'src', 'renderer', 'index.html'));
  // Let renderer startup settle before switching the synthetic icon surfaces.
  await new Promise(resolve => setTimeout(resolve, 1000));
  win.showInactive();
  const groups = [
    ['player', ['playerQuickDownload', 'playerBookmark', 'playerLayoutQuick',
      'playerSidebarToggle', 'playerHeadSettings']],
    ['browser', ['sideRailCollapse', 'sideSubtitleExport', 'sideSubtitleLayout']],
  ];
  for (const [mode, ids] of groups) {
    const icons = await measure(win, mode, ids);
    for (const [id, icon] of Object.entries(icons)) {
      assert.notEqual(icon.display, 'none', `${id} hidden`);
      assert.equal(icon.width, 34, `${id} width`);
      assert.equal(icon.height, 34, `${id} height`);
      assert.ok(Math.abs(icon.dx) < 0.6 && Math.abs(icon.dy) < 0.6,
        `${id} icon off center: ${JSON.stringify(icon)}`);
    }
  }
  win.close();
  clearTimeout(watchdog);
  // Chromium still holds profile files until the process exits on Windows.
  // The isolated temporary profile contains only this synthetic UI run.
  app.quit();
}).catch(error => {
  console.error(error);
  clearTimeout(watchdog);
  app.exit(1);
});
