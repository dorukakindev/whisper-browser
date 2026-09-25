'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'src', 'renderer', 'index.html'), 'utf8');
const renderer = fs.readFileSync(path.join(root, 'src', 'renderer', 'renderer.js'), 'utf8');
const css = fs.readFileSync(path.join(root, 'src', 'renderer', 'styles.css'), 'utf8')
  + fs.readFileSync(path.join(root, 'src', 'renderer', 'browser-chrome.css'), 'utf8');
const menuStart = html.indexOf('id="browserTranslateMenu"');
const menuEnd = html.indexOf('</details>', menuStart);
assert.ok(menuStart >= 0 && menuEnd > menuStart);
const menu = html.slice(menuStart, menuEnd);
for (const [menuId, targetId, label] of [
  ['browserWhisperSubtitlesMenu', 'browserWhisperSubtitles', 'Whisper ile altyazı çıkar'],
  ['browserWhisperTranslateMenu', 'browserWhisperTranslate', 'Whisper + çeviri'],
]) {
  assert.ok(menu.includes(`id="${menuId}"`));
  assert.ok(menu.includes(`data-browser-proxy="${targetId}"`));
  assert.ok(menu.includes(label));
}
assert.ok(renderer.includes("if ($('browserWhisperSubtitles')) $('browserWhisperSubtitles').addEventListener"));
assert.ok(renderer.includes("if ($('browserWhisperTranslate')) $('browserWhisperTranslate').addEventListener"));
assert.ok(renderer.includes('const menuButton = $(`${id}Menu`)'));
assert.ok(renderer.includes('menuButton.disabled = !url || busy'));
assert.match(css, /\.browser-menu-popover button:disabled/);
console.log('Browser subtitle menu: Whisper seçenekleri ve proxy tıklamaları bağlı.');