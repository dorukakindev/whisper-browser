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

console.log('\nTüm WCAG kontrast regresyon testleri geçti.');
