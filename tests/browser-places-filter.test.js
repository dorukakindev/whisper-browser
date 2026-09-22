'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

// Gerçek renderer işlevleri: klasör, sekme ve arama birlikte kullanılır.
const source = fs.readFileSync(path.join(__dirname, '../src/renderer/renderer.js'), 'utf8');
class Node {
  constructor() {
    this.value = ''; this.children = []; this.dataset = {}; this.attributes = {}; this.classes = new Set();
    this.classList = { toggle: (key, value) => value ? this.classes.add(key) : this.classes.delete(key) };
  }
  setAttribute(key, value) { this.attributes[key] = value; }
  replaceChildren(...nodes) { this.children = nodes; }
  append(...nodes) { this.children.push(...nodes); }
  appendChild(node) { this.append(node); }
}
const nodes = Object.fromEntries(['browserPlacesSearch', 'browserPlacesFolder', 'browserPlacesList', 'browserPlacesCount', 'browserPlacesResetFilters'].map(id => [id, new Node()]));
const context = {
  $: id => nodes[id], Option: function(text, value) { this.textContent = text; this.value = value; },
  document: { querySelectorAll: () => [], createElement: () => new Node() },
  player: { browserPlaceTab: 'bookmarks', browserPlaces: {
    bookmarks: [{ title: 'İstanbul', url: 'https://istanbul.test', folder: 'Gezi' }, { title: 'Ders', url: 'https://ders.test', folder: 'Eğitim' }],
    history: [{ title: 'İstanbul gezisi', url: 'https://gezi.test' }, { title: 'Başka sayfa', url: 'https://baska.test' }],
  } },
  browserCloseIcon: () => new Node(),
};
vm.createContext(context);
// Arama katlaması renderer'ın ortak yardımcısıdır (I/İ/ı → i).
vm.runInContext(source.slice(source.indexOf('function foldSearch(value)'), source.indexOf('// Dil kodunu dosya adindan cikar')), context);
vm.runInContext(source.slice(source.indexOf('function browserPlaceTitle('), source.indexOf('function browserPlaceKey(')), context);
vm.runInContext(source.slice(source.indexOf('function browserPlaceList('), source.indexOf('let browserAddressSearchTimer')), context);
context.renderBrowserQuickPlaces = () => {};
context.updateBrowserBookmarkButton = () => {};
nodes.browserPlacesFolder.value = 'Gezi';
context.renderBrowserPlaces();
assert.equal(context.browserPlaceList().length, 1);
assert.equal(nodes.browserPlacesCount.textContent, '1 kayıt eşleşti');
context.player.browserPlaceTab = 'history';
context.renderBrowserPlaces();
assert.equal(context.browserPlaceList().length, 2, 'Gizlenen yer imi klasörü geçmişi filtrelememeli');
assert.equal(nodes.browserPlacesFolder.value, 'Gezi', 'Yer imlerine dönüldüğünde klasör tercihi korunmalı');
nodes.browserPlacesSearch.value = 'istanbul';
context.renderBrowserPlaces();
assert.equal(context.browserPlaceList().length, 1, 'Türkçe başlık araması çalışmalı');
nodes.browserPlacesSearch.value = 'bulunmayan';
context.renderBrowserPlaces();
assert.match(nodes.browserPlacesList.children[0].textContent, /eşleşen kayıt bulunamadı/);
assert.equal(nodes.browserPlacesCount.textContent, '0 kayıt eşleşti');
assert.equal(nodes.browserPlacesResetFilters.classes.has('hidden'), false);
nodes.browserPlacesSearch.value = '';
context.player.browserPlaces.history = [];
context.renderBrowserPlaces();
assert.match(nodes.browserPlacesList.children[0].textContent, /Henüz ziyaret/);
assert.equal(nodes.browserPlacesResetFilters.classes.has('hidden'), true);
context.player.browserPlaceTab = 'bookmarks';
context.renderBrowserPlaces();
assert.equal(context.browserPlaceList().length, 1);
console.log('Yer imi/geçmiş klasör ayrımı, Türkçe arama, sonuç sayısı ve boş durumlar geçti.');
