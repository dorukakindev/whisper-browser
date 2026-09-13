'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const main = fs.readFileSync(path.join(__dirname, '..', 'src', 'main.js'), 'utf8');
const renderer = fs.readFileSync(path.join(__dirname, '..', 'src', 'renderer', 'renderer.js'), 'utf8');
assert.match(main, /function scheduleBrowserPageIndex\(tab, delay = 900\)/);
assert.match(main, /if \(!browserPageIndexEnabled\) return;/,
  'sayfa metni kullanıcı izni olmadan indekslenmemeli');
assert.match(main, /runBrowserPageIndexCapture\(\{/,
  'gecikmiş sayfa okuması üretim yarış korumasından geçmeli');
assert.match(main, /pageContextScript\(\{ maxBlocks: 120, maxCharacters: 20000 \}\)/);
assert.match(main, /wc\.on\('did-stop-loading'[\s\S]{0,500}scheduleBrowserPageIndex\(tab\)/);
assert.match(main, /function scheduleBrowserPageIndex[\s\S]{0,500}const wc = tab\?\.view\?\.webContents[\s\S]{0,500}wc\.isDestroyed\(\)/);
assert.ok((main.match(/if \(tab\.pageIndexTimer\) clearTimeout\(tab\.pageIndexTimer\)/g) || []).length >= 2,
  'sayfa indeks zamanlayıcısı unload ve destroy yollarında temizlenmeli');
assert.match(main, /watchIndex\(\)\?\.searchPages\(value, 120\)/);
assert.match(main, /browser:pageIndex:setEnabled/);
assert.match(main, /browser:pageIndex:clear/);
assert.match(main, /browser:pageIndex:clear[\s\S]*browserPageIndexGeneration \+= 1/,
  'temizleme uçuş halindeki indeks yazımlarını iptal etmeli');
assert.match(renderer, /browserPageIndexEnabled/);
assert.match(renderer, /clearBrowserPageIndex/);
assert.match(renderer, /result\.kind === 'pages'.*Sayfa içeriği/);
console.log('browser-page-index-integration: 15 test');
