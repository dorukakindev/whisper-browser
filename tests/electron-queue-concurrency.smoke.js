'use strict';
// R217: eşzamanlılık stresi — gerçek kuyruk (3 dosya, gerçek tiny/CPU
// faster-whisper backend'i) çalışırken eşzamanlı IPC fırtınası
// (getEnvInfo subprocess spawn'ı + history/library okumaları) ve çift
// başlatma kapısının kuyruğu bozmadığını doğrular. Kuyruk sırası,
// terminal durumlar, çıktı dosyaları ve sıfır unhandled rejection kilitli.
const { app, BrowserWindow, dialog } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');

const root = path.resolve(__dirname, '..');
const out = path.join(root, '.uiprev', 'queue-concurrency');

// Ön koşullar: gerçek backend venv + ffmpeg flite + tiny model erişimi.
// npm test kapsamında değil; yalnız --all/manüel koşulur — eksik ortamda SKIP.
const venvPy = process.platform === 'win32'
  ? path.join(root, 'backend', 'venv', 'Scripts', 'python.exe')
  : path.join(root, 'backend', 'venv', 'bin', 'python3');
if (!fs.existsSync(venvPy)) {
  console.log('SKIP: backend/venv yok (pip kurulumu gerekli)');
  process.exit(0);
}
const clips = [];
fs.mkdirSync(out, { recursive: true });
const userData = path.join(out, `profile-${process.pid}-${Date.now()}`);
process.env.WHISPER_RESOURCE_SOAK_USER_DATA = userData;
fs.mkdirSync(userData, { recursive: true });
const inputDir = path.join(out, 'girdi');
const outputDir = path.join(out, 'cikti');
fs.mkdirSync(inputDir, { recursive: true });
fs.mkdirSync(outputDir, { recursive: true });
fs.writeFileSync(path.join(userData, 'settings.json'),
  JSON.stringify({ settingsVersion: 3, ui: { uiLocale: 'tr' }, inputDir, outputDir }));
for (const [i, sentence] of [
  'The queue is running now.',
  'Second job overlaps with events.',
  'Final item finishes cleanly.',
].entries()) {
  const file = path.join(inputDir, `clip-${i}.wav`);
  execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error',
    '-f', 'lavfi', '-i', `flite=text='${sentence}':voice=slt`,
    '-ar', '16000', '-ac', '1', '-y', file], { timeout: 30000 });
  clips.push(file);
}

let unhandledRejections = 0;
process.on('unhandledRejection', () => { unhandledRejections += 1; });

app.setAppPath(root);
app.commandLine.appendSwitch('disable-gpu');
require('../src/main.js');

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function until(fn, label, timeout = 60000) {
  const end = Date.now() + timeout; let value;
  while (Date.now() < end) { value = await fn(); if (value) return value; await wait(150); }
  throw new Error(`${label} zaman aşımı: ${JSON.stringify(value)}`);
}

app.whenReady().then(async () => {
  dialog.showOpenDialog = async () => ({ canceled: false, filePaths: clips });
  try {
    const win = await until(() => BrowserWindow.getAllWindows()
      .find((item) => item.webContents.getURL().includes('index.html') && !item.webContents.isLoading()),
      'Ana pencere', 90000);
    const run = (code) => win.webContents.executeJavaScript(`(async()=>{${code}})()`, true);
    await until(() => run('return typeof initialSettingsReady !== "undefined"'
      + ' ? await initialSettingsReady.then(()=>true).catch(()=>false) : false'), 'Ayarlar', 90000);
    await run('window.__unhandledCount=0;'
      + 'window.addEventListener("unhandledrejection",()=>window.__unhandledCount++);return true');

    // Hızlı ve deterministik: tiny + CPU + faster motor, çeviri kapalı.
    await run(`
      const set=(id,v)=>{const el=document.getElementById(id); el.value=v; el.dispatchEvent(new Event('change',{bubbles:true}));};
      set('model','tiny'); set('engine','faster'); set('device','cpu');
      for (const id of ['translate','diarize','enableTranslation','showOriginal']) {
        const el=document.getElementById(id); if (el && el.checked) el.click();
      }
      return true;`);

    // Tek seçim çağrısı 3 dosya döndürür → dropZone hepsini kuyruğa ekler.
    await run('document.getElementById("dropZone").click(); return true;');
    await until(() => run('return typeof state !== "undefined" && state.queue.length === 3'), '3 öğe kuyrukta');
    await run('document.getElementById("startQueueBtn").click(); return true;');
    await until(() => run('return state.queueRunning === true'), 'Kuyruk başladı');

    // Çift başlatma kapısı: kuyruk çalışırken doğrudan transcribe:start reddedilmeli.
    const busy = await run(`return await window.api.startTranscribe({ input: ${JSON.stringify(clips[0])} })`);
    assert(busy && busy.ok === false && busy.busy === true,
      `Çift başlatma kapısı atlandı: ${JSON.stringify(busy)}`);

    // Kuyruk işlerken IPC fırtınası: gerçek subprocess spawn (getEnvInfo
    // python -V çalıştırır) + history/library okumaları — hepsi çözümlenmeli.
    const storm = run(`
      window.__stormErrors = [];
      window.__stormDone = (async () => {
        while (state.queueRunning) {
          try {
            await Promise.all([
              window.api.getEnvInfo(),
              window.api.listHistory(),
              window.api.listWatchLibrary(),
              window.api.searchUnifiedLibrary('kuyruk'),
            ]);
          } catch (e) { window.__stormErrors.push(String(e)); }
          await new Promise(r => setTimeout(r, 120));
        }
        return true;
      })();
      return true;`);
    assert(await storm === true, 'Fırtına başlatılamadı');

    // Kuyruk boşalana dek bekle (3 × gerçek tiny transkripsiyonu).
    await until(() => run('return state.queueRunning === false && state.queue.every(i => i.status === "done")'),
      'Kuyruk terminal durumu', 240000);

    // persist debounce'unun diske düşmesini yokla.
    const disk = await until(() => {
      try {
        const snap = JSON.parse(fs.readFileSync(path.join(userData, 'queue-state.json'), 'utf8'));
        return (snap.queueRunning === false && !snap.currentQueueId
          && snap.items.length === 3 && snap.items.every((i) => i.status === 'done')) ? snap : null;
      } catch (_) { return null; }
    }, 'Kuyruk disk durumu', 30000);
    assert.deepEqual(disk.items.map((i) => i.status), ['done', 'done', 'done'],
      `Kuyruk sırası/terminal: ${disk.items.map((i) => i.status)}`);
    // Sıra koruması: diskteki item'lar ekleme sırasını korumalı.
    assert.deepEqual(disk.items.map((i) => path.basename(String(i.input || i.label || ''))),
      ['clip-0.wav', 'clip-1.wav', 'clip-2.wav'], 'Kuyruk sırası bozuldu');

    const written = fs.readdirSync(outputDir).filter((f) => f.endsWith('.srt'));
    assert(written.length >= 3, `Çıktı eksik: ${written}`);

    const stormErrors = await run('return window.__stormErrors || []');
    assert.deepEqual(stormErrors, [], `IPC fırtınası hata verdi: ${stormErrors.slice(0, 3)}`);
    const rendererRejections = await run('return window.__unhandledCount || 0');
    assert.equal(unhandledRejections, 0, 'Ana süreçte unhandled rejection');
    assert.equal(rendererRejections || 0, 0, 'Renderer unhandled rejection');

    console.log(JSON.stringify({ ok: true, stormErrors: stormErrors.length, unhandledRejections }));
    app.exit(0);
  } catch (error) {
    console.error('queue-concurrency smoke FAILED:', error && error.stack || error);
    app.exit(1);
  }
});
