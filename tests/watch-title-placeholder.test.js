'use strict';
// Kütüphane/geçmiş başlığı "Tarayıcı" veya "Oynatıcı" gibi arayüz yer tutucusu olamaz.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const state = require('../src/watch-library-state');

const renderer = fs.readFileSync(path.join(__dirname, '../src/renderer/renderer.js'), 'utf8');
const start = renderer.indexOf('function playerHistoryTitle()');
const end = renderer.indexOf('// --- browser jobs dock');
assert(start > 0 && end > start, 'playerHistoryTitle bulunamadı');
function titleFor(shown, player) {
  const sandbox = { $: () => ({ textContent: shown }), player, URL };
  vm.createContext(sandbox);
  vm.runInContext(renderer.slice(start, end) + '\nthis.run = playerHistoryTitle;', sandbox);
  return sandbox.run();
}
// Tarayıcı: sayfa başlığı yoksa yer tutucu yerine sunucu adı.
assert.equal(titleFor('Tarayıcı', { workspaceMode: 'browser', browserPageTitle: '', browserPageUrl: 'https://www.example.com/watch?v=1' }), 'example.com');
assert.equal(titleFor('Tarayıcı', { workspaceMode: 'browser', browserPageTitle: 'Gerçek Sayfa', browserPageUrl: 'https://example.com/' }), 'Gerçek Sayfa');
assert.equal(titleFor('Browser', { workspaceMode: 'browser', browserPageTitle: '', browserPageUrl: '' }), '');
// Yerel/YouTube: yer tutucu yerine dosya adı veya YouTube başlığı.
assert.equal(titleFor('Oynatıcı', { workspaceMode: 'player', localPath: 'D:\\Filmler\\Heart of the Beast.mkv' }), 'Heart of the Beast.mkv');
assert.equal(titleFor('Oynatıcı', { workspaceMode: 'player', ytInfo: { title: 'There Is No Salvation' } }), 'There Is No Salvation');
assert.equal(titleFor('Seçili Film', { workspaceMode: 'player', localPath: 'x.mp4' }), 'Seçili Film');

// Depo: yer tutucu, var olan gerçek başlığı ezmez; ilk kayıt ve gerçek başlık değişimi çalışır.
assert.equal(state.isPlaceholderWatchTitle('Tarayıcı'), true);
assert.equal(state.isPlaceholderWatchTitle(' oynatıcı '), true);
assert.equal(state.isPlaceholderWatchTitle('Oynatıcı Video'), false);
const empty = () => ({ revision: 0, items: {}, tombstones: {} });
let doc = empty();
const first = state.applyWatchUpsert(doc, { key: 'youtube:abc', type: 'youtube', title: 'Gerçek Başlık', position: 5, duration: 100 }, { now: 1000 });
doc = first.document || first.doc || first;
const second = state.applyWatchUpsert(doc, { key: 'youtube:abc', type: 'youtube', title: 'Oynatıcı', position: 9, duration: 100 }, { now: 2000 });
const after = (second.document || second.doc || second);
const item = (after.items || after.watch || {})['youtube:abc'] || Object.values(after.items || {})[0];
assert(item, 'kayıt bulunamadı');
assert.equal(item.title, 'Gerçek Başlık', 'yer tutucu gerçek başlığı ezdi');
assert.equal(item.position, 9, 'diğer alanlar güncellenmeli');
console.log('watch-title-placeholder: başlık yer tutucuları kütüphaneye girmiyor.');
