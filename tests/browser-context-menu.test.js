'use strict';

// Sağ tık menüsü modeli: bağlama göre öğeler, dil ve arama motoru.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { buildBrowserContextMenuModel, LABELS } = require('../src/browser-context-menu');
const omnibox = require('../src/browser-omnibox');

const ids = (model) => model.filter((item) => item.type !== 'separator').map((item) => item.id);
const build = (params, extra = {}) => buildBrowserContextMenuModel({
  params, canGoBack: true, canGoForward: false, locale: 'en', searchEngineLabel: 'DuckDuckGo', ...extra,
});

// Boş sayfa: gezinme + bul; ayraç başta/sonda/çift yok.
{
  const model = build({ mediaType: 'none' });
  assert.deepEqual(ids(model), ['back', 'forward', 'reload', 'find']);
  assert.equal(model.find((item) => item.id === 'forward').enabled, false);
  assert.notEqual(model[0].type, 'separator');
  assert.notEqual(model.at(-1).type, 'separator');
  model.forEach((item, i) => assert.ok(!(item.type === 'separator' && model[i + 1]?.type === 'separator')));
}

// Bağlantı: Geri/İleri/Yenile GİZLİ.
{
  const got = ids(build({ linkURL: 'https://example.com/a', mediaType: 'none' }));
  assert.deepEqual(got, ['open-link-new-tab', 'copy-link', 'copy-link-markdown']);
}

// Görsel: yeni sekmede aç / kaydet / kopyala / adres.
{
  const got = ids(build({ mediaType: 'image', srcURL: 'https://example.com/x.png' }));
  assert.deepEqual(got, ['open-image-new-tab', 'save-image', 'copy-image', 'copy-image-url']);
  // data: görseli yeni sekmede açılmaz.
  assert.ok(!ids(build({ mediaType: 'image', srcURL: 'data:image/png;base64,AA' })).includes('open-image-new-tab'));
}

// Video: oynat/duraklat, döngü (checkbox), PiP, altyazı çıkar.
{
  const model = build({ mediaType: 'video', srcURL: 'blob:https://x/1',
    mediaFlags: { isPaused: false, isLooping: true, canLoop: true, canShowPictureInPicture: true } });
  assert.deepEqual(ids(model), ['media-play-pause', 'media-loop', 'media-pip', 'media-subtitles']);
  assert.equal(model.find((i) => i.id === 'media-play-pause').label, 'Pause');
  const loop = model.find((i) => i.id === 'media-loop');
  assert.equal(loop.type, 'checkbox');
  assert.equal(loop.checked, true);
  // Ses: PiP ve altyazı yok.
  assert.deepEqual(ids(build({ mediaType: 'audio', mediaFlags: { isPaused: true } })),
    ['media-play-pause', 'media-loop']);
}

// Seçim: kopyala + seçili arama motoruyla ara + çevir + alıntı; gezinme yok.
{
  const model = build({ selectionText: '  hello   world  ', mediaType: 'none' });
  assert.deepEqual(ids(model), ['copy', 'search-selection', 'translate-selection', 'save-quote']);
  assert.equal(model.find((i) => i.id === 'search-selection').label, 'Search DuckDuckGo for “hello world”');
  const long = build({ selectionText: 'x'.repeat(100), mediaType: 'none' });
  assert.ok(long.find((i) => i.id === 'search-selection').label.includes('…'));
  const busy = build({ selectionText: 'a', mediaType: 'none' }, { translateBusy: true });
  assert.equal(busy.find((i) => i.id === 'translate-selection').enabled, false);
}

// Yazı alanı + yazım önerileri (en fazla 5) + sözlüğe ekle.
{
  const model = build({ isEditable: true, misspelledWord: 'teh', mediaType: 'none',
    dictionarySuggestions: ['the', 'ten', 'tea', 'tech', 'tel', 'tee'],
    editFlags: { canCut: false, canCopy: false, canPaste: true, canSelectAll: true } });
  const got = ids(model);
  assert.deepEqual(got.slice(0, 6), ['spell-replace', 'spell-replace', 'spell-replace', 'spell-replace', 'spell-replace', 'spell-add']);
  assert.deepEqual(got.slice(6), ['cut', 'copy', 'paste', 'select-all']);
  assert.equal(model[0].value, 'the');
  assert.equal(model.find((i) => i.id === 'cut').enabled, false);
  const none = build({ isEditable: true, misspelledWord: 'qqq', dictionarySuggestions: [], mediaType: 'none' });
  assert.equal(none[0].id, 'spell-none');
  assert.equal(none[0].enabled, false);
  // Düzenlenemeyen alanda yazım önerisi gösterilmez.
  assert.ok(!ids(build({ misspelledWord: 'teh', mediaType: 'none' })).includes('spell-add'));
}

// Dil: TR ve EN etiket kümeleri aynı anahtarları taşır; TR menü Türkçe.
{
  assert.deepEqual(Object.keys(LABELS.tr).sort(), Object.keys(LABELS.en).sort());
  const trModel = buildBrowserContextMenuModel({ params: { mediaType: 'none' }, locale: 'tr' });
  assert.deepEqual(trModel.filter((i) => i.label).map((i) => i.label), ['Geri', 'İleri', 'Yenile', 'Sayfada bul']);
  const enModel = buildBrowserContextMenuModel({ params: { mediaType: 'none' } });
  assert.equal(enModel[0].label, 'Back', 'varsayılan dil EN');
}

// Arama motoru: enum → URL; bilinmeyen Google'a düşer; ayar şeması ile aynı küme.
{
  assert.equal(omnibox.searchUrl('duckduckgo', 'a b'), 'https://duckduckgo.com/?q=a%20b');
  assert.equal(omnibox.searchUrl('nope', 'x'), 'https://www.google.com/search?q=x');
  assert.equal(omnibox.searchEngineLabel('brave'), 'Brave Search');
  const security = fs.readFileSync(path.join(__dirname, '../src/settings-security.js'), 'utf8');
  const enumMatch = security.match(/browserSearchEngine:\s*\[([^\]]*)\]/);
  assert.ok(enumMatch, 'settings-security browserSearchEngine enum eksik');
  const schema = enumMatch[1].match(/'([^']+)'/g).map((v) => v.slice(1, -1));
  assert.deepEqual(schema.sort(), Object.keys(omnibox.SEARCH_ENGINES).sort());
  const html = fs.readFileSync(path.join(__dirname, '../src/renderer/index.html'), 'utf8');
  const select = html.match(/<select id="browserSearchEngine"[\s\S]*?<\/select>/)[0];
  const options = [...select.matchAll(/value="([^"]+)"/g)].map((m) => m[1]);
  assert.deepEqual(options.sort(), schema.sort());
}

// main.js artık sabit Türkçe şablon ve sabit Google araması içermiyor.
{
  const main = fs.readFileSync(path.join(__dirname, '../src/main.js'), 'utf8');
  const start = main.indexOf('function installBrowserContextMenu');
  const body = main.slice(start, main.indexOf('\nfunction ', start + 10));
  assert.ok(body.includes('buildBrowserContextMenuModel'));
  assert.ok(!/label:\s*'Geri'/.test(body), 'menü etiketleri modelden gelmeli');
  assert.ok(!main.includes('google.com/search?q='), 'arama URL\'si searchUrl() üzerinden kurulmalı');
}

console.log('browser-context-menu: ok');
