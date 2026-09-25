'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const css = fs.readFileSync(path.join(root, 'src', 'renderer', 'styles.css'), 'utf8');
const html = fs.readFileSync(path.join(root, 'src', 'renderer', 'index.html'), 'utf8');

assert.match(css, /button, input, select, textarea, a, summary, \[role="button"\]\s*\{\s*-webkit-app-region:\s*no-drag;/,
  'summary kontrolleri frameless toolbar sürükleme alanından çıkarılmalı');
for (const id of ['browserGo', 'browserSubtitleSettingsToggle', 'browserMoreMenu']) {
  assert.match(html, new RegExp('id="' + id + '"'), id + ' markup eksik');
}
assert.match(html, /<details class="browser-more" id="browserMoreMenu">[\s\S]*?<summary/,
  'Diğer menüsü summary kontrolü kullanıyor');
assert.match(html, /<details class="browser-translate-split browser-translate-menu" id="browserTranslateMenu">[\s\S]*?<summary/,
  'Altyazı menüsü summary kontrolü kullanıyor');
console.log('browser-toolbar-clickability: summary no-drag contract passed');