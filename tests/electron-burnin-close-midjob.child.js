'use strict';

// electron-burnin-close-midjob.smoke.js tarafından fazlar hâlinde spawn
// edilen iç süreç (runner glob'una girmesin diye .smoke.js uzantısı DEĞİL).
//   run       : burn-in başlatır, 'start' olayını görünce pencereyi kapatır
//               → düzenli kapanış = temiz iptal (artık/kurtarma kalmamalı).
//   crash     : burn-in başlatır, 'start' olayını görünce işaret basar ve
//               canlı kalır → sürücü SIGKILL ile çökme simüle eder.
//   check     : açılır, getBurnInRecovery sonucunu basar, kapanır.
//   recover   : kurtarma kaydını doğrular, recoveryId ile bitirir.
//
// Ortam: BURN_VIDEO, BURN_SUB, WHISPER_RESOURCE_SOAK_USER_DATA.

const { app, BrowserWindow, dialog } = require('electron');
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const PHASE = (process.argv.find((a) => a.startsWith('--phase=')) || '').split('=')[1] || 'run';
const VIDEO = process.env.BURN_VIDEO;
const SUB = process.env.BURN_SUB;
assert(VIDEO && SUB, 'fixture env eksik');

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const until = async (fn, label, timeoutMs = 20000, stepMs = 200) => {
  const started = Date.now(); let last;
  while (Date.now() - started < timeoutMs) {
    try { last = await fn(); if (last) return last; } catch (error) { last = error; }
    await wait(stepMs);
  }
  throw new Error(`Zaman aşımı: ${label} (son: ${JSON.stringify(last)})`);
};
const stepTimeout = (promise, ms, label) => Promise.race([
  promise,
  wait(ms).then(() => Promise.reject(new Error(`adım zaman aşımı: ${label}`))),
]);

app.setAppPath(path.resolve(__dirname, '..'));
require('../src/main.js');

app.whenReady().then(async () => {
  try {
    const win = await until(() => BrowserWindow.getAllWindows()
      .find((item) => item.webContents.getURL().includes('index.html') && !item.webContents.isLoading()),
      'Ana pencere', 90000);
    const run = (code) => stepTimeout(
      win.webContents.executeJavaScript(`(async()=>{${code}})()`, true), 30000, code.slice(0, 60));
    dialog.showMessageBox = async () => ({ response: 1 });
    await run(`window.__burnEvents = [];
      window.api.onBurnInEvent((ev) => window.__burnEvents.push(ev));
      return true;`);
    if (PHASE !== 'recover') {
      // Kurtarma diyaloğu initialSettingsReady İÇİNDE kullanıcı yanıtı bekler;
      // recover fazı modalı DOM'dan yanıtladığı için bu beklemeyi atlar.
      await until(() => run('return typeof initialSettingsReady !== "undefined"'
        + ' ? await initialSettingsReady.then(()=>true).catch(()=>false) : false'), 'Ayarlar', 90000);
    }

    if (PHASE === 'run' || PHASE === 'crash') {
      const started = await run(`return window.api.burnInStart(${JSON.stringify(VIDEO)}, ${JSON.stringify(SUB)});`);
      assert.equal(started.ok, true, `burnin:start: ${JSON.stringify(started)}`);
      await until(() => run(`return window.__burnEvents.some((e) => e.type === 'start')`),
        'start olayı', 30000);
      console.log('[child] iş koşuyor' + (PHASE === 'crash' ? ' (çökme bekleniyor)' : ', pencere kapanıyor'));
      if (PHASE === 'crash') {
        setInterval(() => {}, 1000); // sürücü SIGKILL atana dek canlı kal
        return;
      }
      win.close();
      // Kapanış hattı (flush→destroy→window-all-closed→quit) uygulamayı bitirir.
      await until(() => run('return false'), 'kapanış', 15000).catch(() => {});
      return;
    }

    if (PHASE === 'check') {
      const rec = await run('return window.api.getBurnInRecovery();');
      console.log(`[child] check: ${JSON.stringify(rec)}`);
      win.close();
      app.exit(0);
      return;
    }

    // recover fazı — gerçek kullanıcı akışı: açılışta "Yarım kalan gömmeyi
    // sürdür" modalı çıkar, onaylayınca recoverBurnIn→burnInStart(recoveryId).
    const outName = `${path.basename(VIDEO, path.extname(VIDEO))}.altyazili.mp4`;
    const outPath = path.join(path.dirname(VIDEO), outName);
    assert(!fs.existsSync(outPath), 'yarım iş çıktısı önceden var olmamalı');

    const rec = await until(() => run('return window.api.getBurnInRecovery().then((r) => r && r.available ? r : null)'),
      'kurtarma kaydı', 30000);
    assert.equal(path.resolve(rec.recovery.videoPath), path.resolve(VIDEO), 'kurtarma video yolu');
    assert.equal(path.resolve(rec.recovery.subPath), path.resolve(SUB), 'kurtarma srt yolu');
    console.log('[child] kurtarma bulundu:', rec.recovery.id.slice(0, 8));

    // Diyaloğu kullanıcı gibi onayla (Baştan başlat / Çıktıyı kurtar / Doğrula).
    await until(() => run(`const b = document.getElementById('appDialogConfirm');
      return !!(b && !b.disabled && b.offsetParent !== null)`), 'kurtarma diyaloğu', 60000);
    await run(`document.getElementById('appDialogConfirm').click(); return true;`);
    const done = await until(() => run(`return window.__burnEvents.find((e) => e.type === 'done' || e.type === 'error') || null`),
      'burnin done/error', 120000);
    assert.equal(done.type, 'done', `kurtarma gömmesi: ${JSON.stringify(done)}`);
    assert(fs.existsSync(outPath), 'kurtarma çıktısı yazılmadı');
    const after = await run('return window.api.getBurnInRecovery();');
    assert(!after || !after.available, 'kurtarma kaydı hâlâ duruyor');
    console.log('[child] kurtarma tamamlandı, çıktı doğrulandı');
    win.close();
    app.exit(0);
  } catch (error) {
    console.error('[child] hata:', error && error.stack || error);
    app.exit(1);
  }
});
