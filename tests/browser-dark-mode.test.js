'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { MAX_DARK_READER_CSS_CHARS, buildDarkReaderCssScript } = require('../src/browser-dark-mode');
const bundle = fs.readFileSync(path.join(__dirname, '..', 'node_modules', 'darkreader', 'darkreader.js'), 'utf8');
const script = buildDarkReaderCssScript(bundle, { brightness: 999, contrast: 10, sepia: 20 });
const main = fs.readFileSync(path.join(__dirname, '..', 'src', 'main.js'), 'utf8');
assert.match(script, /"brightness":150/);
assert.match(script, /"contrast":50/);
assert.match(script, /exportGeneratedCSS/);
assert.match(script, /DarkReader\.disable/);
assert.match(script, /Dark Reader CSS güvenli boyut sınırını aşıyor/);
assert.match(script, new RegExp(`text\\.length > ${MAX_DARK_READER_CSS_CHARS}`));
assert.doesNotMatch(script, /\.slice\(0,\s*2000000\)/,
  'CSS bir kuralın ortasında kesilip bozuk biçimde uygulanmamalı');
assert.throws(() => buildDarkReaderCssScript('alert(1)'), /geçersiz/);
assert.match(main, /darkModeRequestSeq !== requestSeq/,
  'eski Dark Reader isteği yeni aç-kapat kararının üzerine yazabilmemeli');
console.log('browser-dark-mode: 9 test');
