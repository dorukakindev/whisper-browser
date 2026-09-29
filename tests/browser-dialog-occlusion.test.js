'use strict';
// R269 — açık <dialog> native WebContentsView'in arkasında kalmasın.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const read = (rel) => fs.readFileSync(path.join(__dirname, '..', rel), 'utf8');
const renderer = read('src/renderer/renderer.js');
const catalog = read('src/renderer/media-catalog.js');
let passed = 0;
const test = (name, fn) => { try { fn(); passed++; } catch (e) { console.error(`FAIL ${name}\n${e.stack}`); process.exitCode = 1; } };

test('occlusion hesabı açık <dialog> öğesini kapsar', () => {
  const body = renderer.slice(renderer.indexOf('function syncBrowserOcclusion'), renderer.indexOf('async function applyBrowserOcclusion'));
  assert.match(body, /document\.querySelector\('dialog\[open\]'\)/);
});

test('retranslate-review diyaloğu açılışta occlusion senkronlar', () => {
  const i = renderer.indexOf("className = 'retranslate-review'");
  const seg = renderer.slice(i, i + 4000);
  assert.match(seg, /dialog\.showModal\(\);\s*syncBrowserOcclusion\(\);/);
});

test('retranslate-review kapanış yolları occlusion resync yapar', () => {
  const i = renderer.indexOf("className = 'retranslate-review'");
  const seg = renderer.slice(i, i + 4000);
  assert.match(seg, /dialog\.remove\(\); syncBrowserOcclusion\(\); \}/);
  assert.match(seg, /dialog\.addEventListener\('cancel', \(\) => \{ dialog\.remove\(\); syncBrowserOcclusion\(\); \}\)/);
});

test('katalog diyaloğu showModal sonrası resync eder', () => {
  assert.match(catalog, /dialog\.showModal\(\);\s*if \(typeof syncBrowserOcclusion === 'function'\) syncBrowserOcclusion\(\)/);
  assert.match(catalog, /dialog\.addEventListener\('close',/);
});

console.log(`${passed} test geçti`);
