'use strict';

/**
 * Light theme WCAG-AA kontrast regression test.
 *
 * Test edilen alan: src/renderer/styles.css :root + html[data-theme="light"]
 * CSS değişkenleri (satır 3330-3402 civarı).
 *
 * WCAG 2.1 SC 1.4.3: metin/kullanıcı arayüzü bileşenleri için minimum 4.5:1
 * kontrast oranı.
 *
 * Bulgu (light tema):
 *   --text-muted  (#6d655d) on --bg-3 (#e9e3d9) → 4.48:1 → AA başarısız
 *   --accent      (#985b1a) on --bg-3 (#e9e3d9) → 4.28:1 → AA başarısız
 *   --accent-dim  (#896d4b) on --bg-1 (#f7f4ed) → 4.39:1 → AA başarısız
 *   --accent-dim  (#896d4b) on --bg-3 (#e9e3d9) → 3.78:1 → AA başarısız
 *
 * Etkilenen UI öğeleri (örnekler):
 *   - .cue-card.active .cue-card-time (bg-3 üzerinde accent rengi)
 *   - .status-pill.active (bg-3 yakın vurgu yüzeylerinde)
 *   - .stage.active small (bg-3 yakın yüzeylerde accent)
 *   - .browser-error-kicker (accent-hover; bg-3 yakın yüzeylerde)
 *   - .drawer-page-tab.active (bg-3 yakın vurgu yüzeylerinde)
 *   - .browser-manga-button[data-state="ready"] (bg-3 üzerinde accent-soft arka plan)
 *   - .browser-settings-categories button.active (bg-3 yakın vurgu)
 *
 * Düzeltme: light temada --bg-3 rengini daha koyu ton yap (örn. #ddd5c8 →
 *   #c9c0b1) ya da accent rengini biraz daha koyulaştır (#985b1a → #7a4810).
 */

const fs = require('fs');
const path = require('path');
const assert = require('assert');

const ROOT = path.join(__dirname, '..');
const CSS = fs.readFileSync(path.join(ROOT, 'src/renderer/styles.css'), 'utf8');

function hexToRgb(hex) {
  const m = hex.replace('#', '');
  return [parseInt(m.slice(0, 2), 16), parseInt(m.slice(2, 4), 16), parseInt(m.slice(4, 6), 16)];
}
function relativeLuminance([r, g, b]) {
  const ch = [r, g, b].map((v) => {
    const x = v / 255;
    return x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * ch[0] + 0.7152 * ch[1] + 0.0722 * ch[2];
}
function contrast(hex1, hex2) {
  const l1 = relativeLuminance(hexToRgb(hex1));
  const l2 = relativeLuminance(hexToRgb(hex2));
  return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
}

function getVar(theme, name) {
  const block = theme === 'dark'
    ? CSS.match(/:root\s*\{[\s\S]*?\n\}/m)
    : CSS.match(/html\[data-theme="light"\]\s*\{[\s\S]*?\n\}/m);
  if (!block) return null;
  const re = new RegExp(`${name}\\s*:\\s*(#[0-9a-fA-F]+)`);
  const m = block[0].match(re);
  return m ? m[1].toLowerCase() : null;
}

console.log('  T-01: Light theme --text-muted on --bg-3 >= 4.5:1');
{
  const muted = getVar('light', '--text-muted');
  const bg3 = getVar('light', '--bg-3');
  assert.ok(muted && bg3, 'Light --text-muted ve --bg-3 bulunmalı');
  const ratio = contrast(muted, bg3);
  console.log(`    muted=${muted} on bg-3=${bg3} → ${ratio.toFixed(2)}:1`);
  assert.ok(ratio >= 4.5, 'T-01: Light theme --text-muted on --bg-3 WCAG-AA altında');
}

console.log('  T-02: Light theme --accent on --bg-3 >= 4.5:1');
{
  const accent = getVar('light', '--accent');
  const bg3 = getVar('light', '--bg-3');
  const ratio = contrast(accent, bg3);
  console.log(`    accent=${accent} on bg-3=${bg3} → ${ratio.toFixed(2)}:1`);
  assert.ok(ratio >= 4.5, 'T-02: Light theme --accent on --bg-3 WCAG-AA altında');
}

console.log('  T-03: Light theme --accent-dim on --bg-1 >= 4.5:1');
{
  const dim = getVar('light', '--accent-dim');
  const bg1 = getVar('light', '--bg-1');
  const ratio = contrast(dim, bg1);
  console.log(`    accent-dim=${dim} on bg-1=${bg1} → ${ratio.toFixed(2)}:1`);
  assert.ok(ratio >= 4.5, 'T-03: Light theme --accent-dim on --bg-1 WCAG-AA altında');
}

console.log('  T-04: Light theme --accent-dim on --bg-3 >= 4.5:1');
{
  const dim = getVar('light', '--accent-dim');
  const bg3 = getVar('light', '--bg-3');
  const ratio = contrast(dim, bg3);
  console.log(`    accent-dim=${dim} on bg-3=${bg3} → ${ratio.toFixed(2)}:1`);
  assert.ok(ratio >= 4.5, 'T-04: Light theme --accent-dim on --bg-3 WCAG-AA altında');
}

console.log('  T-05: Dark theme --text on --bg-1 ≥ 4.5:1 (kontrol)');
{
  const text = getVar('dark', '--text');
  const bg1 = getVar('dark', '--bg-1');
  const ratio = contrast(text, bg1);
  console.log(`    text=${text} on bg-1=${bg1} → ${ratio.toFixed(2)}:1`);
  assert.ok(ratio >= 4.5,
    'T-05: Dark theme --text on --bg-1 ≥ 4.5:1 olmalı (kontrol)');
  console.log('    ✓ Dark tema ana metin kontrastı yeterli (kontrol)');
}

// ---------------------------------------------------------------------------
// R124 Adim 4.4 — açık tema eşitliği: browser chrome + yan panel.
// Tarayıcı chrome paleti light temada `html[data-theme="light"] .player-layer`
// kapsamlı blokta tanımlanır; yan panel yüzeyleri `--bg-*`/`--text*` ailesini
// kullanır. Aşağıdaki çiftler bu iki yüzey ailesindeki metin kontrastını
// CI'a sabitler.
// ---------------------------------------------------------------------------

// Seçici kapsamlı blok içinden token değeri okur; `var(--x)` zincirlerini
// kök bloklar üzerinden çözer (light .player-layer var() referanslarıyla
// temaya bağlıdır — hex kalmaz).
function blockVars(selector) {
  // Tam seçici eşleşmesiyle blok(lar) içindeki --token: değer tanımlarını toplar.
  const map = {};
  for (const m of CSS.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const sel = m[1].trim().split('\n').pop().trim();
    if (sel !== selector) continue;
    for (const decl of m[2].split(';')) {
      const d = decl.match(/^\s*(--[\w-]+)\s*:\s*(.+?)\s*$/s);
      if (d) map[d[1]] = d[2].trim();
    }
  }
  return map;
}
const CHROME_SCOPE_VARS = {
  playerLight: blockVars('html[data-theme="light"] .player-layer'),
  playerBase: blockVars('.player-layer'),
  lightRoot: blockVars('html[data-theme="light"]'),
  darkRoot: blockVars(':root'),
};
function resolveChromeVar(name, depth = 0) {
  if (depth > 6) return null;
  const raw = CHROME_SCOPE_VARS.playerLight[name]
    ?? CHROME_SCOPE_VARS.playerBase[name]
    ?? CHROME_SCOPE_VARS.lightRoot[name]
    ?? CHROME_SCOPE_VARS.darkRoot[name];
  if (!raw) return null;
  const ref = raw.match(/^var\((--[\w-]+)\)$/);
  if (ref) return resolveChromeVar(ref[1], depth + 1);
  const hex = raw.match(/^(#[0-9a-fA-F]{3,8})$/);
  return hex ? hex[1].toLowerCase() : null;
}

const CHROME_PAIRS = [
  // [etiket, ön plan token, arka plan token] — light .player-layer kapsamı
  ['chrome muted on panel', '--player-muted', '--player-panel'],
  ['chrome muted on panel-2', '--player-muted', '--player-panel-2'],
  ['chrome text on panel', '--player-text', '--player-panel'],
  ['chrome amber on panel', '--player-amber', '--player-panel'],
  ['chrome muted on ink', '--player-muted', '--player-ink'],
];
for (const [i, [label, fg, bg]] of CHROME_PAIRS.entries()) {
  const num = i + 6;
  console.log(`  T-${String(num).padStart(2, '0')}: Light .player-layer ${fg} on ${bg} >= 4.5:1 (${label})`);
  const fgVal = resolveChromeVar(fg);
  const bgVal = resolveChromeVar(bg);
  assert.ok(fgVal && bgVal, `Light .player-layer ${fg}/${bg} tanımlı olmalı (bulunan: ${fgVal}, ${bgVal})`);
  const ratio = contrast(fgVal, bgVal);
  console.log(`    ${fg}=${fgVal} on ${bg}=${bgVal} → ${ratio.toFixed(2)}:1`);
  assert.ok(ratio >= 4.5, `${label}: light tema kontrastı ${ratio.toFixed(2)}:1 < 4.5:1`);
}

const SIDE_PAIRS = [
  // [etiket, ön plan token, arka plan token] — global light token'ları
  ['yan panel ikincil metin', '--text-muted', '--bg-1'],
  ['yan panel dim metin', '--text-dim', '--bg-1'],
  ['yan panel vurgu', '--accent', '--bg-1'],
];
for (const [i, [label, fg, bg]] of SIDE_PAIRS.entries()) {
  const num = CHROME_PAIRS.length + i + 6;
  console.log(`  T-${String(num).padStart(2, '0')}: Light ${fg} on ${bg} >= 4.5:1 (${label})`);
  const fgVal = getVar('light', fg);
  const bgVal = getVar('light', bg);
  assert.ok(fgVal && bgVal, `Light ${fg}/${bg} tanımlı olmalı`);
  const ratio = contrast(fgVal, bgVal);
  console.log(`    ${fg}=${fgVal} on ${bg}=${bgVal} → ${ratio.toFixed(2)}:1`);
  assert.ok(ratio >= 4.5, `${label}: light tema kontrastı ${ratio.toFixed(2)}:1 < 4.5:1`);
}

console.log('\nTüm WCAG kontrast regresyon testleri geçti.');
