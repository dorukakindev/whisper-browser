'use strict';

// electron tests/electron-ui-narrow-tr.smoke.js
// Kuyruk görev 3 — dar pencerede TR/büyük yazıda kesilen düğme ve taşan
// panel denetimi. Görünür krom öğelerinde (düğme, menü öğesi, etiket,
// başlık) üç şey kontrol edilir:
//   1) belge yatay taşması (scrollWidth > clientWidth)
//   2) menü/popover panellerinin görüntü alanı sağ kenarını aşması
//   3) kırpılmış metin: beyaz-boşluk nowrap/overflow-hidden altında
//      scrollWidth > clientWidth (ellipsis/clip) — kullanıcı verisi
//      bölgeleri (data-ui-untranslated, cueList, dosya adları) hariç.

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { app, BrowserWindow } = require('electron');

const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'whisper-narrow-tr-'));
app.setPath('userData', profile);
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const PROBE = `(() => {
  const uiUntranslatedRoots = '[data-ui-untranslated], #cueList, .cue-text, .download-name, .queue-title';
  const sel = 'button:not(.btn-icon), .btn:not(.btn-icon), [role="menuitem"], summary, label, strong, .browser-menu-item, .jobs-toolbar-actions button, .player-task-state, .player-task-detail, .player-task-meta span, .cue-empty, header span';
  const out = { overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth, clipped: [], pastRight: [], panels: [] };
  for (const el of document.querySelectorAll('details[open] .browser-menu-popover, .browser-menu-popover, .settings-drawer, .player-task-center, .app-dialog, #browserCommandPalette')) {
    const r = el.getBoundingClientRect();
    if (!r.width && !r.height) continue;
    out.panels.push({ name: el.id || el.className, right: r.right });
    if (r.right > innerWidth + 1) out.pastRight.push((el.id || el.className) + ' right=' + Math.round(r.right));
  }
  for (const el of document.querySelectorAll(sel)) {
    if (!el.offsetParent && !el.getClientRects().length) continue;
    if (el.closest(uiUntranslatedRoots)) continue;
    const cs = getComputedStyle(el);
    const r = el.getBoundingClientRect();
    if (r.width < 8 || r.height < 6) continue;
    const clipping = (cs.overflowX === 'hidden' || cs.whiteSpace === 'nowrap') && el.scrollWidth > el.clientWidth + 2;
    const pastEdge = r.right > innerWidth + 2 && r.left < innerWidth;
    if (clipping || pastEdge) {
      const path = el.id ? '#' + el.id : el.tagName.toLowerCase() + '.' + String(el.className).split(' ')[0];
      out.clipped.push(path + ' [' + Math.round(r.width) + 'px/' + el.clientWidth + '→' + el.scrollWidth + '] "' + (el.textContent || '').trim().slice(0, 60) + '"' + (pastEdge ? ' KENAR' : ''));
    }
  }
  return out;
})()`;

(async () => {
  await app.whenReady();
  const win = new BrowserWindow({ show: false, width: 640, height: 780,
    webPreferences: { contextIsolation: true, sandbox: true, nodeIntegration: false } });
  try {
    await win.loadFile(path.join(__dirname, '../src/renderer/index.html'));
    await wait(250);
    const results = {};
    for (const zoom of [1, 1.5]) {
      win.webContents.setZoomFactor(zoom);
      for (const locale of ['tr']) {
        await win.webContents.executeJavaScript(`window.UiLocale && UiLocale.set('${locale}', false)`);
        await wait(120);
        // Görünür krom yüzeylerini aç: menüler, ayar çekmecesi, görev merkezi.
        await win.webContents.executeJavaScript(`(() => {
          for (const id of ['appMenu','browserMoreMenu','browserTranslateMenu','browserPageQuickMenu']) { const m = document.getElementById(id); if (m) m.open = true; }
          const drawer = document.getElementById('settingsDrawer'); if (drawer) drawer.classList.remove('hidden');
          const layer = document.getElementById('playerLayer'); if (layer) layer.classList.remove('hidden');
          const tc = document.getElementById('playerTaskCenter'); if (tc) tc.classList.remove('hidden');
          const qt = document.getElementById('queueToolbar'); if (qt) qt.classList.remove('hidden');
          for (const id of ['browserDownloadsPanel','aiChat','browserCommandPalette','browserFindBar','browserDiagnosticsPanel']) { const p = document.getElementById(id); if (p) p.classList.remove('hidden'); }
          const ht = document.getElementById('historyToolbar'); if (ht) ht.classList.remove('hidden');
        })()`);
        await wait(150);
        results[`z${zoom}-${locale}`] = await win.webContents.executeJavaScript(PROBE);
      }
    }
    let bad = 0;
    for (const [name, r] of Object.entries(results)) {
      console.log(`--- ${name} (vw=640)`);
      console.log(`    belge yatay taşması: ${r.overflow}px`);
      console.log(`    kenar-aşan panel: ${r.pastRight.length ? r.pastRight.join(' | ') : 'yok'}`);
      console.log(`    kırpılmış öğe (${r.clipped.length}):`);
      for (const c of r.clipped.slice(0, 40)) console.log('      ' + c);
      bad += r.clipped.length + r.pastRight.length + (r.overflow > 2 ? 1 : 0);
    }
    assert.equal(bad, 0, 'dar pencerede kesilen/taşan krom öğesi bulundu — yukarıdaki liste');
    console.log('electron-ui-narrow-tr: GEÇTİ — dar pencerede taşma/kesilme yok');
  } finally { win.destroy(); }
  app.quit();
})().catch((error) => { console.error(error); process.exit(1); });
