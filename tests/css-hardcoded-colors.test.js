'use strict';

// Sabit renk sınırı: styles.css'te token (var(--…)) yerine yazılmış sabit renklerin
// sayısı yalnız AZALABİLİR. Açık tema hatalarının neredeyse hepsi koyu temaya göre
// seçilmiş sabit gri/amber tonlarından çıktı. Token blokları (:root ve
// html[data-theme="light"] {…}) sayılmaz; oradaki sabitler tanımın kendisidir.
// Görünür kontrast ayrıca `npm run audit:ui` ile ölçülür.

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const css = fs.readFileSync(path.join(__dirname, '../src/renderer/styles.css'), 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, '');
const baselinePath = path.join(__dirname, 'fixtures', 'css-hardcoded-color-baseline.txt');

function countHardcodedColors(source) {
  let count = 0;
  for (const match of source.matchAll(/([^{}]*)\{([^{}]*)\}/g)) {
    const selector = match[1].trim();
    if (/^(?::root|html\[data-theme="light"\])$/.test(selector.split('\n').pop().trim())) continue;
    for (const declaration of match[2].split(';')) {
      const [prop, ...rest] = declaration.split(':');
      if (!prop || !rest.length || prop.trim().startsWith('--')) continue;
      count += (rest.join(':').match(/#[0-9a-f]{3,8}\b|rgba?\(\s*\d/gi) || []).length;
    }
  }
  return count;
}

const count = countHardcodedColors(css);
const baseline = Number(fs.readFileSync(baselinePath, 'utf8').trim());
assert.ok(count <= baseline,
  `styles.css sabit renk sayısı ${count} > sınır ${baseline}. Yeni kuralda var(--text), var(--text-dim), var(--border)… kullanın.`);
if (count < baseline) console.log(`  not: sabit renk ${baseline} → ${count}; ${path.relative(process.cwd(), baselinePath)} değerini düşürün.`);
console.log(`css-hardcoded-colors: ${count}/${baseline}`);
