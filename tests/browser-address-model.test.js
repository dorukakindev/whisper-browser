'use strict';

// Adres çubuğu modeli: sıklık × yakınlık sıralaması, satır içi otomatik tamamlama,
// bölümler ve site simgeleri (src/browser-address-model.js).
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const model = require('../src/browser-address-model.js');
const omnibox = require('../src/browser-omnibox.js');

const DAY = 864e5;
const now = Date.UTC(2026, 8, 22);
let passed = 0;
const test = (name, fn) => { fn(); passed += 1; console.log(`  PASS  ${name}`); };

test('sık ve yakın ziyaret edilen geçmiş kaydı üstte', () => {
  const history = [
    { url: 'https://old.example/docs', title: 'docs eski', visitedAt: now - 200 * DAY, visits: 50 },
    { url: 'https://new.example/docs', title: 'docs yeni', visitedAt: now - 1 * 3600e3, visits: 1 },
    { url: 'https://daily.example/docs', title: 'docs günlük', visitedAt: now - 2 * DAY, visits: 40 },
  ];
  const rows = model.buildAddressResults({ query: 'docs', omnibox, places: { history }, now });
  assert.deepEqual(rows.filter((row) => row.section === 'history').map((row) => row.url),
    ['https://daily.example/docs', 'https://new.example/docs', 'https://old.example/docs']);
});

test('satır içi tamamlama alan adında durur, yol yazılınca yolu tamamlar', () => {
  const items = [
    { url: 'https://github.com/dorukakindev/whisper-browser', visits: 9, visitedAt: now },
    { url: 'https://www.google.com/search?q=a', visits: 30, visitedAt: now },
  ];
  assert.deepEqual(model.inlineCompletion('git', items, now), { text: 'github.com', url: 'https://github.com/' });
  assert.deepEqual(model.inlineCompletion('goo', items, now), { text: 'google.com', url: 'https://www.google.com/' });
  assert.equal(model.inlineCompletion('github.com/d', items, now).url, 'https://github.com/dorukakindev/whisper-browser');
  assert.equal(model.inlineCompletion('GİT', items, now).text.slice(0, 3), 'GİT');
  for (const typed of ['g', 'git hub', 'https:', 'github.com']) assert.equal(model.inlineCompletion(typed, items, now), null, typed);
});

test('tamamlama varsa ilk satır tamamlanan adres, ikinci satır yazılan metin', () => {
  const completion = { text: 'github.com', url: 'https://github.com/' };
  const rows = model.buildAddressResults({ query: 'git', omnibox, completion, now });
  assert.deepEqual(rows.slice(0, 2).map((row) => [row.action, row.url || row.value]), [['url', 'https://github.com/'], ['navigate', 'git']]);
});

test('bölümler sıralı ve simge yalnız veri URL\'sinden', () => {
  const favicon = 'data:image/png;base64,AAAA';
  const rows = model.buildAddressResults({
    query: 'wiki', omnibox, now,
    tabs: [{ id: 't', title: 'Wiki', url: 'https://tr.wikipedia.org/', favicon }],
    places: { bookmarks: [{ url: 'https://wiki.example/', title: 'wiki' }], history: [{ url: 'https://tr.wikipedia.org/x', title: 'wiki x', visitedAt: now }] },
    faviconFor: (url) => (url.startsWith('https://tr.wikipedia.org') ? favicon : ''),
  });
  assert.deepEqual(rows.map((row) => row.section), ['input', 'tabs', 'bookmarks', 'history']);
  assert.equal(rows[1].icon, favicon);
  assert.equal(rows[3].icon, favicon);
  const renderer = fs.readFileSync(path.join(__dirname, '../src/renderer/renderer.js'), 'utf8');
  assert.match(renderer, /\/\^data:image\\\/\/i\.test\(result\.icon\)/, 'uzak simge adresi img.src olarak kullanılmamalı');
  assert.match(renderer, /querySelectorAll\('\[data-address-result\]'\)/, 'başlıklar seçim sırasını bozmamalı');
});

test('geçmiş kaydı ziyaret sayısını tutar', () => {
  const main = fs.readFileSync(path.join(__dirname, '../src/main.js'), 'utf8');
  assert.match(main, /visits: Math\.min\(100000, \(Number\(previous && previous\.visits\) \|\| 0\) \+ 1\)/);
  assert.match(main, /visits: Math\.max\(1, Math\.min\(100000, Math\.floor\(Number\(item && item\.visits\) \|\| 1\)\)\)/);
});

test('model index.html\'de renderer.js\'ten önce yüklenir', () => {
  const html = fs.readFileSync(path.join(__dirname, '../src/renderer/index.html'), 'utf8');
  assert.ok(html.indexOf('../browser-address-model.js') > 0);
  assert.ok(html.indexOf('../browser-address-model.js') < html.indexOf('src="renderer.js"'));
});

console.log(`browser-address-model: ${passed} test geçti`);
