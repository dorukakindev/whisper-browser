'use strict';

// Console-error ratchet: ana yüzeylerde gezinirken renderer'ın
// `console-message` akışında severity=error (level 3) mesajı
// çıkmadığını kilitler. Ürün kodunda sessizce biriken hata sınıfını
// (yakalanmamış DOM yolu, kaynak 404, deprecation) her CI koşusunda yakalar.
//
// Yürüme yüzeyleri: ayarlar → oynatıcı (side tab'ler + görünüm modları) →
// tarayıcı (NTP, ⋯ menüleri, komut paleti, sayfada-bul, split, sekme kapat) →
// diyalog aç/kapa. Ağ gerektiren akış yok — tamamen yerel.
//
// Çalıştırma: xvfb-run -a npx electron tests/electron-console-ratchet.smoke.js --disable-gpu

const { app, BrowserWindow } = require('electron');
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const out = fs.mkdtempSync(path.join(os.tmpdir(), 'console-ratchet-'));
process.env.WHISPER_RESOURCE_SOAK_USER_DATA = path.join(out, 'profile');
fs.mkdirSync(process.env.WHISPER_RESOURCE_SOAK_USER_DATA, { recursive: true });

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const until = async (fn, label, timeoutMs = 15000, stepMs = 150) => {
  const started = Date.now(); let last;
  while (Date.now() - started < timeoutMs) {
    try { last = await fn(); if (last) return last; } catch (error) { last = error; }
    await wait(stepMs);
  }
  throw new Error(`Zaman aşımı: ${label} (son: ${JSON.stringify(last)})`);
};

// Bilinen, ürünle ilgisiz hata mesajları — yeni kural eklenmeden önce rapor/
// devir notunda belgelenmeli. Boş başlar: beklenti sıfır hata.
const ERROR_ALLOW = [
  /Autofill/i, // Chromium autofill altyapısı headless'ta devre dışı
];

const errors = [];
const warnings = [];
app.setAppPath(path.resolve(__dirname, '..'));
require('../src/main.js');

app.whenReady().then(async () => {
  try {
    const win = await until(() => BrowserWindow.getAllWindows()
      .find((item) => item.webContents.getURL().includes('index.html') && !item.webContents.isLoading()),
      'Ana pencere', 90000);
    const run = (code) => win.webContents.executeJavaScript(`(async()=>{${code}})()`, true);
    win.webContents.on('console-message', (_event, level, message, line, sourceId) => {
      const entry = { level, message, line, sourceId };
      if (level >= 3) { if (!ERROR_ALLOW.some((rx) => rx.test(message))) errors.push(entry); }
      else if (level === 2) warnings.push(entry);
    });
    await until(() => run('return typeof initialSettingsReady !== "undefined"'
      + ' ? await initialSettingsReady.then(()=>true).catch(()=>false) : false'), 'Ayarlar', 90000);
    console.log('[ratchet] hazır');

    // ── 1) Ayarlar yüzeyi: bölümler, kontroller, EN/TR geçişi ──
    await run(`document.querySelectorAll('details').forEach((d) => { d.open = true; });
      const lang = document.querySelector('[data-lang]') || document.querySelector('#langSelect') || document.querySelector('select[name="lang"]');
      if (lang && lang.tagName === 'SELECT') { lang.value = lang.value === 'tr' ? 'en' : 'tr'; lang.dispatchEvent(new Event('change', { bubbles: true })); }
      return true;`);
    await wait(400);

    // ── 2) Oynatıcı: openPlayer → side tab'ler → görünüm modları ──
    await run('openPlayer(); return true;');
    await wait(300);
    for (const tab of ['subs', 'ai', 'library', 'tools']) {
      await run(`setSideTab(${JSON.stringify(tab)}); return true;`);
      await wait(150);
    }
    await run(`for (const mode of ['cinema', 'reading', 'study']) {
      const btn = document.querySelector(\`.vm[data-mode="\${mode}"]\`);
      if (btn) btn.click(); }
      return true;`);
    await wait(300);

    // ── 3) Tarayıcı: yeni sekme, NTP, menüler, palet, find, split ──
    await run('setWorkspaceMode("browser"); return true;');
    await until(() => run('return player.workspaceMode === "browser"'), 'Tarayıcı yüzeyi');
    await run('showBrowserWebSurface(); return true;');
    const tab = await run('return (await createBrowserTab())?.id || null');
    assert(tab, 'sekme açılamadı');
    await run('openAppDialog = async () => true; return true;');
    for (const menuId of ['appMenu', 'browserMoreMenu', 'browserTranslateMenu',
      'browserPageQuickMenu', 'browserSignalMenu', 'browserSplitMenu',
      'appModeMenu', 'playerLayoutQuickMenu']) {
      await run(`const m = document.getElementById(${JSON.stringify(menuId)}); if (m) { m.open = true; } return true;`);
      await wait(80);
      await run(`const m = document.getElementById(${JSON.stringify(menuId)}); if (m) { m.open = false; } return true;`);
    }
    // Komut paleti + sayfada-bul (klavye yolundan değil işlevden — köprü R233'te tekleştirildi)
    await run(`if (typeof openCommandPalette === 'function') { openCommandPalette(); } else {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', ctrlKey: true, bubbles: true })); }
      return true;`);
    await wait(200);
    await run(`const p = document.getElementById('commandPalette') || document.querySelector('.command-palette, [data-command-palette]');
      if (p) { const esc = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }); document.dispatchEvent(esc); }
      return true;`);
    await run(`document.dispatchEvent(new KeyboardEvent('keydown', { key: 'f', ctrlKey: true, bubbles: true })); return true;`);
    await wait(200);
    await run(`document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); return true;`);
    // Split aç/kapa
    const other = await run('return (await createBrowserTab())?.id || null');
    await run(`await setBrowserSplit(${JSON.stringify(other)}, 50); return true;`);
    await wait(200);
    await run('await setBrowserSplit("", 50); return true;');
    // Sekmeleri kapat
    for (const id of [tab, other]) {
      await run(`await closeBrowserTab(${JSON.stringify(id)}); return true;`);
    }

    // ── 4) Diyalog aç/kapa + ayar moduna geri dönüş ──
    await run('setWorkspaceMode("player"); return true;');
    await wait(200);

    console.log(`[ratchet] ${errors.length} hata, ${warnings.length} uyarı`);
    for (const e of errors) console.log(`  ERR ${e.sourceId}:${e.line} ${e.message.slice(0, 160)}`);
    assert.equal(errors.length, 0, `${errors.length} renderer console hatası`);
    console.log('PASS: console-error ratchet — yüzey turunda 0 console hatası');
    win.close();
    app.exit(0);
  } catch (error) {
    console.error('[ratchet] hata:', error && error.stack || error);
    app.exit(1);
  }
});
