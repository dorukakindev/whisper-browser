'use strict';
// Çift dilli altyazı: varsayılan yığın düzeni (ikisi altta, aynı stil) + sıfırsız sayaç.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const read = (p) => fs.readFileSync(path.join(__dirname, '..', p), 'utf8');
const html = read('src/renderer/index.html');
const css = read('src/renderer/styles.css');
const js = read('src/renderer/renderer.js');
assert.match(html, /<div class="subtitle-stack" id="subtitleStack">\s*<div[^>]*id="subtitleOverlay2"[\s\S]*?id="subtitleOverlay"/);
assert.match(js, /dualLayout: 'stacked'/, 'varsayılan yığın düzeni');
assert.match(css, /\.player-stage:not\(\.sub-split\) \.subtitle-stack > \.subtitle-secondary \{\s*font-size: var\(--sub-size\);\s*font-weight: var\(--sub-weight\);\s*color: var\(--sub-color\);/);
assert.match(css, /\.player-stage\.sub-split \.subtitle-stack \{ display: contents; \}/);
assert.doesNotMatch(js, /padStart\(3, '0'\)\} \/ /, 'sayaç sıfır dolgulu olmamalı');
assert.match(js, /`\$\{player\.activeIdx \+ 1\} \/ \$\{total\}`/);
console.log('player-dual-subtitle-layout: ok');
