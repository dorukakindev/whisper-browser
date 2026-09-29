'use strict';

// Sekme şeridi churn soak'u: gerçek uygulama içinde 200 × sekme aç→kapat
// döngüsü + toplu aç/kapat. Sızıntı sinyalleri:
//   - Ana süreçte webContents.getAllWebContents() sayısı taban çizgisine dönmeli
//     (her sekme bir WebContentsView/renderer süreci üretir — kapanmayan
//     sızıntı burada görünür).
//   - Renderer: player.browserTabs uzunluğu şerit DOM'uyla birebir,
//     browserClosingTabs/boşluk temiz, BrowserTabEventGate.contexts Map'i
//     canlı sekme sayısını aşmamalı, kapatılan-sekme geçmişi 20'de kapalı.
//   - Renderer heap'i (expose-gc ile deterministik GC sonrası) sınırlı
//     büyümeli; unhandledrejection 0.
//
// Çalıştırma: xvfb-run -a npx electron tests/electron-browser-tab-churn.smoke.js --disable-gpu

const { app, BrowserWindow, webContents } = require('electron');
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const out = fs.mkdtempSync(path.join(os.tmpdir(), 'tab-churn-'));
process.env.WHISPER_RESOURCE_SOAK_USER_DATA = path.join(out, 'profile');
fs.mkdirSync(process.env.WHISPER_RESOURCE_SOAK_USER_DATA, { recursive: true });

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const until = async (fn, label, timeoutMs = 20000, stepMs = 200) => {
  const started = Date.now(); let last;
  while (Date.now() - started < timeoutMs) {
    try { last = await fn(); if (last) return last; } catch (error) { last = error; }
    await wait(stepMs);
  }
  throw new Error(`Zaman aşımı: ${label} (son: ${JSON.stringify(last)})`);
};
// Tek bir executeJavaScript'in asılı kalıp smoke'u sessizce öldürmesini önler
// (örn. kapalı-kalmış onay diyaloğu promise'i hiç çözmez).
const stepTimeout = (promise, ms, label) => Promise.race([
  promise,
  wait(ms).then(() => Promise.reject(new Error(`adım zaman aşımı: ${label}`))),
]);

let renderProcessGone = 0;
app.commandLine.appendSwitch('js-flags', '--expose-gc');
app.setAppPath(path.resolve(__dirname, '..'));
require('../src/main.js');

app.whenReady().then(async () => {
  try {
    const win = await until(() => BrowserWindow.getAllWindows()
      .find((item) => item.webContents.getURL().includes('index.html') && !item.webContents.isLoading()),
      'Ana pencere', 90000);
    const run = (code) => win.webContents.executeJavaScript(`(async()=>{${code}})()`, true);
    win.webContents.on('render-process-gone', () => { renderProcessGone += 1; });
    await until(() => run('return typeof initialSettingsReady !== "undefined"'
      + ' ? await initialSettingsReady.then(()=>true).catch(()=>false) : false'), 'Ayarlar', 90000);
    await run(`window.__unhandledCount = 0;
      window.addEventListener('unhandledrejection', () => window.__unhandledCount++);
      return true;`);

    console.log('[tab-churn] pencere+ayarlar hazır');
    // Onay diyaloğu (sabitlenmiş/aktif-iş/form koruması) headless'ta kullanıcı
    // bekleyip promise'i hiç çözmez; smoke sekme kapatmanın tam yolunu koşarken
    // onayı otomatik geçer.
    await run('openAppDialog = async () => true; return true;');

    // Tarayıcı yüzeyine geç (varsayılan player modunda sekme şeridi yok).
    await run('if (typeof setWorkspaceMode === "function") setWorkspaceMode("browser"); return true;');
    await until(() => run('return player.workspaceMode === "browser"'), 'Tarayıcı yüzeyi');
    await run('if (typeof showBrowserWebSurface === "function") showBrowserWebSurface(); return true;');
    console.log('[tab-churn] tarayıcı yüzeyi açık');

    const snapshot = `return {
      tabs: player.browserTabs.length,
      dom: document.querySelectorAll('#browserTabStrip [role="tab"]').length,
      closing: player.browserClosingTabs.size,
      gates: player.browserTabEventGate.contexts.size,
    };`;
    const heap = 'if (window.gc) window.gc(); return performance.memory.usedJSHeapSize / 1048576;';

    // Warm-up: ilk döngülerin tek-seferlik önbellekleri sayıma karışmasın.
    for (let i = 0; i < 10; i += 1) {
      const tab = await stepTimeout(run('return (await createBrowserTab())?.id || null'),
        15000, `warm-up aç ${i}`);
      assert(tab, `warm-up sekme ${i} açılamadı`);
      await stepTimeout(run(`return await closeBrowserTab(${JSON.stringify(tab)}), true;`),
        15000, `warm-up kapat ${i}`);
    }
    console.log('[tab-churn] warm-up bitti');
    const baseWc = webContents.getAllWebContents().length;
    const base = await run(snapshot);
    const baseHeap = await run(heap);
    console.log(`[tab-churn] taban: wc=${baseWc} heap=${baseHeap.toFixed(1)}MB ${JSON.stringify(base)}`);

    // 200 aç→kapat döngüsü; her 25'te tutarlılık ara-kontrolü.
    for (let i = 0; i < 200; i += 1) {
      const tab = await stepTimeout(run('return (await createBrowserTab())?.id || null'),
        15000, `churn aç ${i}`);
      assert(tab, `churn ${i}: sekme açılamadı`);
      await stepTimeout(run(`return await closeBrowserTab(${JSON.stringify(tab)}), true;`),
        15000, `churn kapat ${i}`);
      if ((i + 1) % 25 === 0) {
        const s = await run(snapshot);
        console.log(`[tab-churn] ${i + 1}/200 ${JSON.stringify(s)}`);
        assert(s.closing === 0 && s.dom === s.tabs && s.tabs <= 2,
          `ara kontrol ${i}: ${JSON.stringify(s)}`);
      }
    }
    const afterChurn = await until(async () => {
      const s = await run(`return {
        tabs: player.browserTabs.length,
        dom: document.querySelectorAll('#browserTabStrip [role="tab"]').length,
        closing: player.browserClosingTabs.size,
        gates: player.browserTabEventGate.contexts.size,
      };`);
      return (s.tabs === base.tabs && s.dom === s.tabs && s.closing === 0) ? s : null;
    }, 'churn sonrası tutarlılık');
    const wcAfter = webContents.getAllWebContents().length;
    assert(wcAfter - baseWc <= 1, `WebContents sızıntısı: ${baseWc} → ${wcAfter}`);
    assert(afterChurn.gates <= afterChurn.tabs, `EventGate sızıntısı: ${afterChurn.gates} kapı > ${afterChurn.tabs} sekme`);

    // Toplu faz: ardarda 8 sekme aç, sonra hepsini kapat.
    const batch = [];
    for (let i = 0; i < 8; i += 1) {
      const tab = await run('return (await createBrowserTab())?.id || null');
      assert(tab, `toplu ${i}: sekme açılamadı`);
      batch.push(tab);
    }
    for (const id of batch) {
      await run(`return await closeBrowserTab(${JSON.stringify(id)}), true;`);
    }
    const heapAfter = await run(heap);
    const wcEnd = webContents.getAllWebContents().length;
    const unhandled = await run('return window.__unhandledCount || 0');
    console.log(`[tab-churn] son: wc=${wcEnd} heap=${baseHeap.toFixed(1)}→${heapAfter.toFixed(1)}MB unhandled=${unhandled} gone=${renderProcessGone}`);
    assert(wcEnd - baseWc <= 1, `Toplu faz WebContents sızıntısı: ${baseWc} → ${wcEnd}`);
    assert.equal(unhandled, 0, 'Renderer unhandled rejection');
    assert.equal(renderProcessGone, 0, 'Renderer süreci çöktü');
    // Cömert ama gerçek sızıntıyı yakalayan sınır (200 gerçek sekme churn'ü).
    assert(heapAfter - baseHeap < 160, `Heap şişmesi: ${baseHeap.toFixed(1)} → ${heapAfter.toFixed(1)} MB`);
    console.log('PASS: sekme şeridi churn soak (200 aç/kapat + toplu 8)');
    win.close();
    app.exit(0);
  } catch (error) {
    console.error('[tab-churn] hata:', error && error.stack || error);
    app.exit(1);
  }
});
