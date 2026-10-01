'use strict';
// R401 (kuyruk-g14): kuyruk siralama — bekleyen isler ↑/↓ ile yer degistirir;
// islem sirasi (ilk 'pending' once kosar) yeni dizilimi izler; kalici
// snapshot yeni sirayi tasir. Gercek renderer'da DOM+state dogrulanir.
const assert = require('node:assert');
const { app, BrowserWindow } = require('electron');
const fs = require('fs'); const os = require('os'); const path = require('path');
const root = path.join(__dirname, '..');
const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'wb-queue-reorder-'));

process.env.WHISPER_RESOURCE_SOAK_USER_DATA = userData;
require(path.join(root, 'src/main.js'));

app.whenReady().then(async () => {
  let win;
  for (let i = 0; i < 240; i++) {
    win = BrowserWindow.getAllWindows()
      .find((w) => (w.webContents.getURL() || '').endsWith('index.html'));
    if (win) break;
    await new Promise((r) => setTimeout(r, 250));
  }
  assert(win, 'ana pencere bulunamadı');
  const run = (code) => win.webContents.executeJavaScript(`(async()=>{${code}})()`, true);
  const until = async (fn, label, ms = 30000) => {
    const t0 = Date.now();
    while (Date.now() - t0 < ms) { const v = await fn(); if (v) return v; await new Promise((r) => setTimeout(r, 250)); }
    throw new Error(`${label} zaman asimi`);
  };
  let failures = 0;
  const check = (name, cond) => { if (cond) console.log(`ok ${name}`); else { failures++; console.error(`FAIL ${name}`); } };

  await until(() => run('return typeof state !== "undefined" && !!document.getElementById("queueList")'), 'renderer hazır');

  // Uc bekleyen is ekle (opts dondurma icin farkli label'lar).
  await run(`state.queue = [
    { id: 1, type: 'file', input: '/tmp/a.mp4', label: 'a.mp4', status: 'pending', files: [], opts: { model: 'tiny' } },
    { id: 2, type: 'file', input: '/tmp/b.mp4', label: 'b.mp4', status: 'pending', files: [], opts: { model: 'base' } },
    { id: 3, type: 'file', input: '/tmp/c.mp4', label: 'c.mp4', status: 'pending', files: [], opts: { model: 'small' } },
    { id: 9, type: 'file', input: '/tmp/old.mp4', label: 'old.mp4', status: 'done', files: ['x.srt'], opts: {} },
  ]; renderQueue(); return true;`);

  const first = await run(`return {
    moves: [...document.querySelectorAll('.queue-move')].map((b) => b.dataset.id + ':' + b.dataset.move),
    order: state.queue.filter((i) => i.status === 'pending').map((i) => i.id),
  }`);
  check('her pending ogide uygun yon tuslari var', first.moves.sort().join(',') === '1:1,2:-1,2:1,3:-1');
  check('baslangic sirasi 1,2,3', first.order.join(',') === '1,2,3');

  // 2. ogeyi yukari → sirasi 2,1,3; islem sirasi b'ye gecmeli.
  await run(`moveQueueItem(2, -1); return true;`);
  const afterUp = await run(`return {
    order: state.queue.map((i) => i.id),
    pendingOrder: state.queue.filter((i) => i.status === 'pending').map((i) => i.id),
    nextIsB: state.queue.find((i) => i.status === 'pending').id === 2,
  }`);
  check('yukari tasi sonrasi pending sirasi 2,1,3', afterUp.pendingOrder.join(',') === '2,1,3');
  check('done oge dizi konumunu korudu', afterUp.order[3] === 9);

  // 2. ogeyi asagi → 1,2,3 geri doner; iki kez asagi → 1,3,2.
  await run(`moveQueueItem(2, 1); return true;`);
  await run(`moveQueueItem(2, 1); return true;`);
  const afterDown = await run(`return state.queue.filter((i) => i.status === 'pending').map((i) => i.id)`);
  check('asagi tasi sonrasi pending sirasi 1,3,2', afterDown.join(',') === '1,3,2');

  // Sinir: ilk pending yukari tasiyamaz, son pending asagi tasiyamaz.
  await run(`moveQueueItem(1, -1); moveQueueItem(2, 1); return true;`);
  const afterBounds = await run(`return state.queue.filter((i) => i.status === 'pending').map((i) => i.id)`);
  check('sinir disi tasi islem yapmadi', afterBounds.join(',') === '1,3,2');

  // Kalici snapshot yeni sirayi tasimali (debounce ~80ms → bekle).
  await new Promise((r) => setTimeout(r, 400));
  const snap = JSON.parse(fs.readFileSync(path.join(userData, 'queue-state.json'), 'utf8'));
  const snapPending = snap.items.filter((i) => i.status === 'pending').map((i) => i.id);
  check('disk snapshot yeni sirayi tasir', snapPending.join(',') === '1,3,2');

  console.log(failures ? `FAIL ${failures} kontrol` : 'PASS: kuyruk siralama sozlesmesi gecti');
  app.exit(failures ? 1 : 0);
});
