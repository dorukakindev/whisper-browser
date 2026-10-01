'use strict';

// electron tests/electron-ui-theme-contrast.smoke.js
// Kuyruk görev 4 — açık/koyu temada okunabilirlik. Görünür metin taşıyan
// krom öğelerinde WCAG kontrast oranı ölçülür:
//   normal metin ≥ 4.5, kasıtlı ikincil (muted/hint) metin ≥ 3.0.
// Odak halkası için :focus-visible'da outline-color ↔ arka plan
// kontrastı ≥ 3.0 denetlenir (temsili odaklanabilir öğeler).
// Kullanıcı-verisi bölgeleri (data-ui-untranslated, cueList, medya
// başlığı, dosya adı) kapsam dışı.

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { app, BrowserWindow } = require('electron');
require('./electron-stub-ipc').registerBareWindowIpcStubs();

const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'whisper-contrast-'));
app.setPath('userData', profile);
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const PROBE = `(() => {
  const SKIP = '[data-ui-untranslated], #cueList, .cue-text, .download-name, .queue-title, script, style, svg';
  const MUTED = '.hint, .muted, .jobs-toolbar-copy, .browser-menu-hint, .st-display-hint, .field-note, .settings-note, .browser-session-memory, .browser-cookie-note, .cue-empty, .player-task-meta, .player-task-detail';
  const rgb = (str) => { const m = String(str).match(/rgba?\\(([\\d.]+)[,\\s]+([\\d.]+)[,\\s]+([\\d.]+)(?:[,/\\s]+([\\d.]+))?\\)/); return m ? { r:+m[1], g:+m[2], b:+m[3], a:m[4]===undefined?1:+m[4] } : null; };
  const lum = ({r,g,b}) => { const c=[r,g,b].map(v=>{v/=255;return v<=0.03928?v/12.92:Math.pow((v+0.055)/1.055,2.4);}); return 0.2126*c[0]+0.7152*c[1]+0.0722*c[2]; };
  const ratio = (f,b) => { const l1=lum(f),l2=lum(b); const hi=Math.max(l1,l2),lo=Math.min(l1,l2); return (hi+0.05)/(lo+0.05); };
  const over = (top, under) => { // top over under alfa birleştirme
    const a = top.a + under.a * (1 - top.a);
    if (a <= 0) return { r: 0, g: 0, b: 0, a: 0 };
    return { r: (top.r*top.a + under.r*under.a*(1-top.a))/a,
             g: (top.g*top.a + under.g*under.a*(1-top.a))/a,
             b: (top.b*top.a + under.b*under.a*(1-top.a))/a, a };
  };
  const canvas = (() => {
    const c = rgb(getComputedStyle(document.documentElement).backgroundColor);
    if (c && c.a === 1) return c;
    const v = getComputedStyle(document.documentElement).getPropertyValue('--bg-0').trim();
    return rgb(v) || { r: 255, g: 255, b: 255, a: 1 };
  })();
  const effBg = (el) => {
    let node = el, acc = { r: 0, g: 0, b: 0, a: 0 };
    while (node) {
      const c = rgb(getComputedStyle(node).backgroundColor);
      if (c && c.a > 0) { acc = over(c, acc); if (acc.a >= 1) return acc; }
      node = node.parentElement;
    }
    return over(acc, canvas);
  };
  const hasText = (el) => { for (const n of el.childNodes) if (n.nodeType===3 && n.textContent.trim()) return true; return false; };
  const out = { fails: [], warns: [], focus: [] };
  for (const el of document.querySelectorAll('body *')) {
    if (el.closest(SKIP)) continue;
    if (!hasText(el)) continue;
    if (!el.offsetParent && el.tagName !== 'BODY' && !el.getClientRects().length) continue;
    const cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden' || +cs.opacity === 0) continue;
    const fg = rgb(cs.color); const bg = effBg(el);
    if (!fg || !bg) continue;
    const r = ratio(fg, bg);
    const tag = el.id ? '#'+el.id : el.tagName.toLowerCase()+'.'+String(el.className).split(' ')[0];
    const label = tag + ' "' + el.textContent.trim().slice(0,40) + '" ' + r.toFixed(2) + ':1 [fg ' + cs.color + ' / bg rgb(' + Math.round(bg.r) + ',' + Math.round(bg.g) + ',' + Math.round(bg.b) + ')]';
    const disabled = el.disabled || el.getAttribute('aria-disabled') === 'true';
    const mutedEl = el.closest(MUTED) || cs.fontSize < 12;
    if (disabled) { if (r < 2) out.fails.push('DEVREDISI ' + label); else if (r < 3) out.warns.push('devredisi ' + label); }
    else if (mutedEl) { if (r < 3) out.fails.push('MUTED ' + label); else if (r < 4.5) out.warns.push('muted ' + label); }
    else { if (r < 4.5) out.fails.push(label); else if (r < 4.5) out.warns.push(label); }
  }
  // Odak halkası: temsili odaklanabilir öğelerde outline ↔ komşu bg.
  for (const el of document.querySelectorAll('button:not([disabled]), select, input:not([type=hidden]), [tabindex="0"], summary')) {
    if (el.closest(SKIP)) continue;
    if (!el.offsetParent && !el.getClientRects().length) continue;
    el.focus();
    const cs = getComputedStyle(el);
    if (cs.outlineStyle === 'none' || +cs.outlineWidth === 0) continue;
    const oc = rgb(cs.outlineColor); if (!oc) continue;
    const bg = effBg(el.parentElement || el);
    const r = ratio(oc, bg);
    if (r < 3) out.focus.push((el.id?'#'+el.id:el.className) + ' outline ' + r.toFixed(2) + ':1');
  }
  return out;
})()`;

(async () => {
  await app.whenReady();
  const win = new BrowserWindow({ show: false, width: 1280, height: 840,
    webPreferences: { contextIsolation: true, sandbox: true, nodeIntegration: false } });
  try {
    await win.loadFile(path.join(__dirname, '../src/renderer/index.html'));
    await wait(250);
    await win.webContents.executeJavaScript(`(() => {
      for (const id of ['appMenu','browserMoreMenu','browserTranslateMenu']) { const m = document.getElementById(id); if (m) m.open = true; }
      for (const id of ['settingsDrawer','playerLayer','playerTaskCenter','queueToolbar','historyToolbar','browserDownloadsPanel','browserDiagnosticsPanel']) { const p = document.getElementById(id); if (p) p.classList.remove('hidden'); }
    })()`);
    // Renk geçişleri (transition: color .2s) ölçümü bozmasın — prob sırasında
    // tüm geçiş/animasyonları kapatıyoruz.
    await win.webContents.executeJavaScript(`(() => {
      const s = document.createElement('style'); s.id='contrast-probe-nofx';
      s.textContent='*, *::before, *::after { transition: none !important; animation: none !important; }';
      document.head.appendChild(s);
    })()`);
    const results = {};
    for (const theme of ['dark', 'light']) {
      await win.webContents.executeJavaScript(`document.documentElement.dataset.theme='${theme}'`);
      await wait(150);
      results[theme] = await win.webContents.executeJavaScript(PROBE);
    }
    let bad = 0;
    for (const [theme, r] of Object.entries(results)) {
      console.log(`--- tema: ${theme}`);
      console.log(`    FAIL (${r.fails.length}):`); for (const f of r.fails.slice(0, 50)) console.log('      ' + f);
      console.log(`    odak-halkası FAIL (${r.focus.length}):`); for (const f of r.focus.slice(0, 20)) console.log('      ' + f);
      console.log(`    uyarı-muted (${r.warns.length}):`); for (const f of r.warns.slice(0, 30)) console.log('      ' + f);
      bad += r.fails.length + r.focus.length;
    }
    assert.equal(bad, 0, 'kontrast ihlali bulundu — yukarıdaki liste');
    console.log('electron-ui-theme-contrast: GEÇTİ — iki temada da okunabilirlik yeterli');
  } finally { win.destroy(); }
  app.quit();
})().catch((error) => { console.error(error); process.exit(1); });
