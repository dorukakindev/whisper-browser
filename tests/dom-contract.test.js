/**
 * R357 — DOM sözleşmesi ratchet'i.
 *
 * renderer JS'indeki bütün literal id aramaları (`$('x')`, `el('x')`,
 * `getElementById('x')`, `querySelector('#x')`) statik index.html id'lerine
 * ya da JS'in dinamik ürettiği id'lere çözümlenmelidir. Çözümlenemeyen id
 * `null` referansı demektir; ratchet yeni eksikleri sert düşürür.
 *
 * Ayrıca index.html'de yinelenen id olamaz — getElementById sessizce
 * ilkini döndürür ve sonrakini ulaşılmaz kılar.
 *
 * Bilinen yanlış-pozitif kaynakları:
 *  - `$$('seçici')` querySelectorAll yardımcısıdır ve CSS seçicisi alır;
 *    yakalanan ilk #id parçası yine geçerli bir id olmalı.
 *  - media-catalog.js kendi hyperscript `$` yardımcısını kullanır (etiket
 *    adı alır); id literal'ı olmayan argümanlar atlanır.
 *  - browser-mini.js browser-mini.html'e bağlanır; index.html'de yoktur.
 */
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const RENDERER = path.join(__dirname, '..', 'src', 'renderer');
const INDEX_HTML = path.join(RENDERER, 'index.html');

function readAllJs() {
  return fs.readdirSync(RENDERER)
    .filter((f) => f.endsWith('.js'))
    .map((f) => fs.readFileSync(path.join(RENDERER, f), 'utf8'));
}

// index.html'deki id'ler: set + yineleme tespiti.
const html = fs.readFileSync(INDEX_HTML, 'utf8');
const staticIds = new Set();
const duplicates = new Set();
for (const m of html.matchAll(/\bid\s*=\s*"([^"]+)"/g)) {
  if (staticIds.has(m[1])) duplicates.add(m[1]);
  staticIds.add(m[1]);
}
assert.deepStrictEqual([...duplicates], [], `index.html yinelenen id: ${[...duplicates].join(', ')}`);

// browser-mini.html kendi sayfasına bağlanır; onun id'leri de geçerlidir.
const miniHtml = path.join(RENDERER, 'browser-mini.html');
if (fs.existsSync(miniHtml)) {
  for (const m of fs.readFileSync(miniHtml, 'utf8').matchAll(/\bid\s*=\s*"([^"]+)"/g)) staticIds.add(m[1]);
}

const sources = readAllJs();

// JS'in dinamik ürettiği id'ler: `el.id = 'x'`, innerHTML `id="x"`, setAttribute('id', ...).
const created = new Set();
for (const src of sources) {
  for (const re of [/\bid\s*=\s*'([^']+)'/g, /\bid="([^"$]+)"/g, /\bsetAttribute\(\s*'id',\s*'([^']+)'/g]) {
    for (const m of src.matchAll(re)) created.add(m[1]);
  }
}

// renderer.js'in `$` = getElementById, `$$` = querySelectorAll; bazı dosyalar
// kendi `$` yardımcısını tanımlar (ör. media-catalog.js `(tag, className)` —
// argümanı id değil etiket adıdır). Yerel `$` tanımı olan dosyada `$` desenini atla.
const dollarAccessor = /(?<![\w$])\$\(\s*['"]([A-Za-z][\w-]*)['"]\s*\)/g;
const otherPatterns = [
  /(?<![\w$])el\(\s*'([A-Za-z][\w-]*)'\s*\)/g,
  /(?<![\w$])getElementById\(\s*'([^']+)'\s*\)/g,
  // querySelector(All)('#id ...') — ilk bileşen #id olmalı.
  /(?<![\w$])querySelector(?:All)?\(\s*'#([A-Za-z][\w-]*)[\s>+~.'"]/g,
  /(?<![\w$])querySelector(?:All)?\(\s*'#([A-Za-z][\w-]*)'\s*\)/g,
];
const lookups = [];
for (const src of sources) {
  const localDollar = /\bconst \$\s*=\s*\(\s*tag/.test(src) || /\bfunction \$\s*\(\s*tag/.test(src);
  for (const re of [...(localDollar ? [] : [dollarAccessor]), ...otherPatterns]) {
    for (const m of src.matchAll(re)) lookups.push(m[1]);
  }
}
// $$('#id ...') içindeki id'ler de çözümlenmelidir.
for (const src of sources) {
  for (const m of src.matchAll(/(?<![\w$])\$\$\(\s*'#([A-Za-z][\w-]*)[\s>+~.'"]?/g)) lookups.push(m[1]);
}

const missing = [...new Set(lookups)].filter((id) => !staticIds.has(id) && !created.has(id));
assert.deepStrictEqual(missing.sort(), [], `çözümlenemeyen id araması: ${missing.join(', ')}`);

console.log(`dom-contract: ${new Set(lookups).size} id araması, ${staticIds.size} statik id, ${created.size} dinamik — eksik 0`);
