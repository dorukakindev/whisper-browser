'use strict';

// Yeni-100 madde 4 — kuyruk ortada-iptal yolculuğu (GERÇEK backend):
//   3 dosya kuyruk → startQueueBtn → ilk iş 'running' olarak diske düşene
//   bekle → cancelBtn (kullanıcı iptali) → tüm kuyruk durur, çalışan iş
//   'pending'e döner, bekleyenler kaybolmaz → yeniden startQueueBtn →
//   üç iş de 'done' + üç .srt çıktısı.
// kill-resume çökmeyi (SIGKILL), bu smoke kullanıcı iptalini kilitler.
// Ön koşul: backend venv + ffmpeg flite + tiny model — queue-concurrency
// ile aynı ortam; eksikse SKIP.
// Çalıştırma: xvfb-run -a node_modules/.bin/electron tests/electron-queue-cancel-mid.smoke.js --disable-gpu

const { app, BrowserWindow, dialog } = require('electron');
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');
const { findTestPython } = require('./python-runtime');

const root = path.resolve(__dirname, '..');
const out = fs.mkdtempSync(path.join(os.tmpdir(), 'wb-qcancel-'));
const userData = path.join(out, 'ud');
const inputDir = path.join(out, 'in');
const outputDir = path.join(out, 'out');
for (const d of [userData, inputDir, outputDir]) fs.mkdirSync(d, { recursive: true });
process.env.WHISPER_RESOURCE_SOAK_USER_DATA = userData;
const queueFile = path.join(userData, 'queue-state.json');

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, label, timeoutMs = 30000, stepMs = 200) => {
  const started = Date.now(); let last;
  while (Date.now() - started < timeoutMs) {
    try { last = await fn(); if (last) return last; } catch (e) { last = e && e.message; }
    await wait(stepMs);
  }
  throw new Error(`zaman aşımı: ${label} (son: ${JSON.stringify(last)})`);
};

// Ön koşul: gerçek backend (tiny/CPU) — ortam yoksa SKIP.
const py = findTestPython();
const pyCheck = py && (() => {
  try {
    const r = execFileSync(py, ['-c', 'import faster_whisper'], { timeout: 30000 });
    return true;
  } catch (_) { return false; }
})();
if (!pyCheck) {
  console.log('SKIP: backend venv/faster_whisper yok (queue-cancel-mid gerçek model ister)');
  app.exit(0);
}

fs.writeFileSync(path.join(userData, 'settings.json'), JSON.stringify({
  settingsVersion: 3, inputDir, outputDir, ui: { uiLocale: 'en' },
}));

const sentences = ['First clip runs and gets cancelled.', 'Second clip resumes the queue.', 'Third clip finishes the queue.'];
const clips = sentences.map((s, i) => {
  const file = path.join(inputDir, `clip-${i}.wav`);
  execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error',
    '-f', 'lavfi', '-i', `flite=text='${s}':voice=slt`,
    '-ar', '16000', '-ac', '1', '-y', file], { timeout: 30000 });
  return file;
});

app.setAppPath(root);
app.commandLine.appendSwitch('disable-gpu');
require('../src/main.js');

app.whenReady().then(async () => {
  try {
    dialog.showMessageBox = async () => ({ response: 1 });
    const win = await until(() => BrowserWindow.getAllWindows()
      .find((w) => w.webContents.getURL().includes('index.html') && !w.webContents.isLoading()),
      'ana pencere', 120000);
    const run = (code) => win.webContents.executeJavaScript(`(async()=>{${code}})()`, true);
    await until(() => run('return typeof initialSettingsReady !== "undefined"'
      + ' ? await initialSettingsReady.then(()=>true).catch(()=>false) : false'), 'ayarlar', 120000);

    await run(`window.__jobEvents = [];
      window.api.onEvent((ev) => window.__jobEvents.push(ev));
      const set = (id, v) => { const el = document.getElementById(id);
        el.value = v; el.dispatchEvent(new Event('change', { bubbles: true })); };
      set('model', 'tiny'); set('engine', 'faster'); set('device', 'cpu');
      set('formats', 'srt');
      for (const id of ['translate', 'diarize', 'llmPostprocess', 'langSuffix']) {
        const el = document.getElementById(id); if (el && el.checked) el.click();
      }
      return true;`);

    // 3 dosya kuyruğa — gerçek dropZone + diyalog.
    dialog.showOpenDialog = async () => ({ canceled: false, filePaths: clips });
    await run('document.getElementById("dropZone").click(); return true;');
    await until(() => run('return state.queue.length === 3'), '3 öğe kuyrukta');
    await run('document.getElementById("startQueueBtn").click(); return true;');
    await until(() => run('return state.queueRunning === true'), 'kuyruk başladı');

    // İlk iş gerçekten 'running' diske yazılana dek bekle — iptalin anlamlı
    // olması için backend çalışıyor olmalı.
    await until(() => {
      try {
        const parsed = JSON.parse(fs.readFileSync(queueFile, 'utf8'));
        return (parsed.items || []).some((i) => i.status === 'running');
      } catch (_) { return false; }
    }, 'running diske yazıldı', 120000);
    console.log('[qcancel] ilk iş running — kullanıcı iptali gönderiliyor');

    await run('document.getElementById("cancelBtn").click(); return true;');
    const afterCancel = await until(() => run(`return (!state.queueRunning && !state.running)
      ? { items: state.queue.map((i) => i.status), cur: state.currentQueueId }
      : null`), 'kuyruk durdu', 60000);
    assert.equal(afterCancel.cur, null, `currentQueueId temizlenmedi: ${JSON.stringify(afterCancel)}`);
    assert(afterCancel.items.every((s) => s === 'pending'),
      `iptal sonrası öğeler pending değil: ${JSON.stringify(afterCancel)}`);
    assert.equal(afterCancel.items.length, 3, 'öğe kayboldu');
    console.log('[qcancel] kuyruk durdu — 3 öğe pending, devam kararı kullanıcıda');

    // Kullanıcı yeniden başlatır → üç iş de biter, üç srt çıkar.
    await run('document.getElementById("startQueueBtn").click(); return true;');
    await until(() => run('return state.queueRunning === true'), 'kuyruk yeniden başladı', 30000);
    const done = await until(() => run(`return state.queue.every((i) => i.status === 'done')
      && !state.queueRunning ? state.queue.map((i) => i.status) : null`), '3 iş done', 300000);
    assert.equal(done.length, 3);
    for (let i = 0; i < 3; i++) {
      const srt = path.join(outputDir, `clip-${i}.srt`);
      await until(() => fs.existsSync(srt) && fs.statSync(srt).size > 40, `clip-${i}.srt`, 20000);
    }
    // Kalıcı durum da tutarlı: kuyruk kapalı, öğeler done.
    const persisted = JSON.parse(fs.readFileSync(queueFile, 'utf8'));
    assert.equal(persisted.queueRunning, false, 'disk: queueRunning true kaldı');
    assert((persisted.items || []).every((i) => i.status === 'done'),
      `disk: öğeler done değil: ${JSON.stringify(persisted.items.map((i) => i.status))}`);
    console.log('[qcancel] yeniden başlatma sonrası 3/3 done + disk tutarlı');

    console.log('PASS: kuyruk ortada-iptal — çalışan pending\'e döner, yeniden başlatma tamamlar');
    win.close();
    app.exit(0);
  } catch (e) {
    console.error('[qcancel] hata:', e && e.stack || e);
    app.exit(1);
  }
});
