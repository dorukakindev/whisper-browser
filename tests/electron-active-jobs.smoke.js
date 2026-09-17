'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { app, BrowserWindow } = require('electron');

const testProfile = fs.mkdtempSync(path.join(os.tmpdir(), 'whisper-active-jobs-'));
app.setPath('userData', testProfile);

(async () => {
  await app.whenReady();
  const win = new BrowserWindow({ show: false, width: 1280, height: 800,
    webPreferences: { contextIsolation: true, sandbox: true, nodeIntegration: false } });
  try {
    await win.loadFile(path.join(__dirname, '../src/renderer/index.html'));
    const result = await win.webContents.executeJavaScript(`(() => {
      try {
      const panel = document.getElementById('playerTaskCenter');
      panel.classList.remove('hidden');
      const list = document.getElementById('playerTaskCenterList');
      const rowsData = [
        { label: 'Subtitle translation', state: '17%', detail: 'Processing translation queue',
          context: 'Classical Mythology — Lecture 7', meta: ['39/224 completed', '2 running', '8 waiting', '1 errors'],
          width: '17.4%', actions: ['Stop'], recovery: false },
        { label: 'Full subtitle capture', state: '45%', detail: 'Reading subtitles from video segments',
          context: 'Classical Mythology — Lecture 7', meta: ['410/906 completed'],
          width: '45.3%', actions: ['Stop'], recovery: false },
        { label: 'Page translation', state: 'Interrupted', detail: 'Job left from a previous session',
          context: 'Research article', meta: ['12/20 completed', '2 errors'],
          width: '60%', actions: ['Resume', 'Restart', '×'], recovery: true },
      ];
      for (const row of rowsData) {
        const item = document.createElement('article');
        item.className = 'player-task-row' + (row.recovery ? ' is-recovery is-error' : '');
        item.innerHTML = '<span class="player-task-mark"></span>'
          + '<div class="player-task-copy"><div class="player-task-title-line"><strong></strong><span class="player-task-state"></span></div>'
          + '<span class="player-task-detail"></span><span class="player-task-context" data-ui-untranslated></span>'
          + '<span class="player-task-meta"></span><span class="player-task-progress" role="progressbar"><i></i></span></div>'
          + '<div class="player-task-controls"></div>';
        item.querySelector('strong').textContent = row.label;
        item.querySelector('.player-task-state').textContent = row.state;
        item.querySelector('.player-task-detail').textContent = row.detail;
        item.querySelector('.player-task-context').textContent = row.context;
        const meta = item.querySelector('.player-task-meta');
        row.meta.forEach(value => { const span = document.createElement('span'); span.textContent = value; meta.append(span); });
        item.querySelector('.player-task-progress i').style.width = row.width;
        const controls = item.querySelector('.player-task-controls');
        row.actions.forEach(value => {
          const button = document.createElement('button'); button.type = 'button';
          button.className = value === '×' ? 'player-task-dismiss' : 'player-task-action' + (value === 'Stop' ? ' is-stop' : '');
          button.textContent = value; controls.append(button);
        });
        list.append(item);
      }
      const rows = [...panel.querySelectorAll('.player-task-row')];
      const rect = panel.getBoundingClientRect();
      return {
        lang: document.documentElement.lang,
        hidden: panel.classList.contains('hidden'),
        heading: panel.querySelector('header strong')?.textContent.trim(),
        subtitle: panel.querySelector('header span')?.textContent.trim(),
        rows: rows.length,
        labels: rows.map(row => row.querySelector('strong')?.textContent.trim()),
        actions: [...panel.querySelectorAll('button')].map(button => button.textContent.trim()),
        dismissCount: panel.querySelectorAll('.player-task-dismiss').length,
        progress: [...panel.querySelectorAll('.player-task-progress i')].map(node => node.style.width),
        withinViewport: rect.right <= innerWidth && rect.bottom <= innerHeight,
      };
      } catch (error) {
        return { error: error?.stack || error?.message || String(error) };
      }
    })()`);
    assert.equal(result.error, undefined, result.error);
    assert.equal(result.lang, 'en');
    assert.equal(result.hidden, false);
    assert.equal(result.heading, 'Active jobs');
    assert.equal(result.subtitle, 'Live stages, progress, and job controls');
    assert.equal(result.rows, 3);
    assert.deepEqual(result.labels, ['Subtitle translation', 'Full subtitle capture', 'Page translation']);
    assert(result.actions.includes('Stop'));
    assert(result.actions.includes('Resume'));
    assert(result.actions.includes('Restart'));
    assert.equal(result.dismissCount, 1);
    assert(result.progress.some(value => value.startsWith('17.')));
    assert.equal(result.withinViewport, true);
    const target = process.env.WHISPER_ACTIVE_JOBS_SCREENSHOT;
    if (target) {
      const image = await win.webContents.capturePage();
      fs.writeFileSync(target, image.toPNG());
    }
    console.log('Electron Active Jobs smoke passed:', JSON.stringify(result));
  } finally {
    await win.close();
    await app.quit();
    try { fs.rmSync(testProfile, { recursive: true, force: true }); } catch (_) {}
  }
})().catch(async (error) => {
  console.error(error);
  process.exitCode = 1;
  try { await app.quit(); } catch (_) {}
  try { fs.rmSync(testProfile, { recursive: true, force: true }); } catch (_) {}
});
