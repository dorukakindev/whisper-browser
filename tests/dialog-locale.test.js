const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

// R175: EN arayüzde yerel diyalogların (showMessageBox/showOpenDialog/
// showSaveDialog/setSaveDialogOptions) Türkçe kalmasını kilitleyen ratchet.
// title/message/detail/buttonLabel/name/buttons pozisyonundaki Türkçe karakterli
// dizgi literal'leri dt(...) / dl(...) / dialogText(...) sarmalından geçmeli.
// Ters yönde hata dizgileri (return { error: '...' }) renderer'da sözlükle
// çevrilir; bu test yalnız doğal diyalog pozisyonlarını denetler.

const FILES = [
  'src/main.js',
  'src/browser-downloads.js',
  'src/browser-feature-services.js',
  'src/browser-mini-player.js',
  'src/catalog-extensions.js',
  'src/media-catalog-service.js',
];

const TR = /[çğıöşüÇĞİÖŞÜ]/;
const ROOT = path.join(__dirname, '..');
const { entries } = require('../src/renderer/ui-locale');
const localized = new Set(entries.map(([tr]) => tr));

// message:/detail: alanları native diyalogda DE renderer'da (sendBrowserEvent
// payload'ları, messageKey'li hata nesneleri) da kullanılır; DOM yoluyla
// çevrilenler sözlükte kilitlidir — yalnız sözlükte olmayanlar raporlanır.
const RENDERER_FIELDS = new Set(['message', 'detail']);

// Bilinçli istisnalar: marka adı her dilde aynı kalır (görev çubuğu/alt-tab).
const EXEMPT = new Set(['Whisper Altyazı']);

const violations = [];

for (const rel of FILES) {
  const source = fs.readFileSync(path.join(ROOT, rel), 'utf8');
  // dt('...') / dl('...') / dialogText('...') içindeki ilk dizgi zaten sarmalıdır;
  // onları atlamak için sarmal çağrısının ilk argümanını maskeleriz.
  const masked = source.replace(/\b(?:dt|dl|dialogText)\(\s*'(?:[^'\\]|\\.)*'/g, 'WRAPPED()');
  for (const match of masked.matchAll(/\b(title|message|detail|buttonLabel|name):\s*'((?:[^'\\]|\\.)*)'/g)) {
    const [_, field, value] = match;
    if (!TR.test(value) || EXEMPT.has(value)) continue;
    if (RENDERER_FIELDS.has(field) && localized.has(value)) continue;
    violations.push(`${rel}: ${field}: '${value.slice(0, 60)}'`);
  }
  for (const match of masked.matchAll(/\bbuttons:\s*\[([^\]]*)\]/g)) {
    for (const item of match[1].matchAll(/'((?:[^'\\]|\\.)*)'/g)) {
      if (TR.test(item[1])) violations.push(`${rel}: buttons[] '${item[1].slice(0, 60)}'`);
    }
  }
}

assert.deepEqual(violations, [], 'Native dialog strings must go through dt()/dl()/dialogText() or be dictionary-covered');
console.log('dialog-locale: all native dialog strings wrapped');
