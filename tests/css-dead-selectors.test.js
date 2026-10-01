'use strict';

// R372 — ölü CSS seçici ratchet'i.
// styles.css / browser-chrome.css içindeki her .sınıf seçicisi, üretim
// kaynağında (src/**/*.js, index.html) ya birebir geçmeli ya da dinamik
// üretim kalıbının (`sonek-${` şablon birleştirmesi) parçası olmalı.
// Geçmişte DOM üretimi kaldırılmış ama kuralları kalmış ~20 seçici bulundu
// (cue-row ailesi, back-to-active, browser-tab-pin, pdf-source-text…);
// bu dosya yeni ölü kuralların birikmesini engeller.

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const repoRoot = path.join(__dirname, '..');
const cssDir = path.join(repoRoot, 'src', 'renderer');

const css = fs.readdirSync(cssDir)
  .filter((name) => name.endsWith('.css'))
  .map((name) => fs.readFileSync(path.join(cssDir, name), 'utf8'))
  .join('\n')
  .replace(/\/\*[\s\S]*?\*\//g, '');

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue;
      walk(full, out);
    } else if (/\.(js|html)$/.test(entry.name)) {
      out.push(full);
    }
  }
  return out;
}

const productionSrc = walk(path.join(repoRoot, 'src'))
  .map((file) => fs.readFileSync(file, 'utf8'))
  .join('\n');

// Dinamik üretim aileleri: üretim kodunda `<sonek>-${` şablonuyla kurulan
// sınıflar (ör. `log-${level}`, `segment-state-${key}`, `is-${state}`).
// Literla arama şablonu göremez; sonek başına bir kez doğrulanır.
function dynamicFamilyOf(className) {
  const parts = className.split('-');
  for (let i = parts.length - 1; i >= 1; i--) {
    const prefix = parts.slice(0, i).join('-');
    if (new RegExp(prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '-\\$\\{').test(productionSrc)) {
      return prefix;
    }
  }
  return null;
}

// Bilinçli ölü kural: DOM'u olmayan ama player-ui.test.js'in kilitlediği
// alet-sırası varyantı (test, kural gövdesinin saydam zeminini doğrular).
const ALLOW_DEAD = new Set(['tool-row-quiet']);

const classNames = new Set();
for (const match of css.matchAll(/\.([a-zA-Z_çğıöşüÇĞİÖŞÜ][\wçğıöşüÇĞİÖŞÜ-]*)/g)) {
  classNames.add(match[1]);
}

const dead = [];
for (const name of classNames) {
  if (ALLOW_DEAD.has(name)) continue;
  if (productionSrc.includes(name)) continue;
  if (dynamicFamilyOf(name)) continue;
  dead.push(name);
}
dead.sort();

assert.deepEqual(dead, [],
  `Üretim DOM'unda hiç üretilmeyen CSS seçicileri: ${dead.join(', ')} — ` +
  'kuralı silin ya da üretilen sınıfa bağlayın.');
console.log(`css-dead-selectors: ${classNames.size} seçici, 0 ölü`);
