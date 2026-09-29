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
    this.parent = null; this.ownerDocument = null; this._className = '';
    const classes = this.classes;
    this.classList = {
      toggle: (key, value) => value ? classes.add(key) : classes.delete(key),
      contains: (key) => classes.has(key),
    };
  }
  get className() { return this._className; }
  set className(value) {
    this._className = value;
    this.classes = new Set(String(value).split(/\s+/).filter(Boolean));
    const classes = this.classes;
    this.classList = {
      toggle: (key, v) => v ? classes.add(key) : classes.delete(key),
      contains: (key) => classes.has(key),
    };
  }
  setAttribute(key, value) { this.attributes[key] = value; }
  replaceChildren(...nodes) { nodes.forEach((n) => this._attach(n)); this.children = nodes; }
  append(...nodes) { nodes.forEach((n) => { this._attach(n); this.children.push(n); }); }
  appendChild(node) { this.append(node); }
  _attach(node) {
    if (!node || typeof node !== 'object') return;
    node.parent = this; node.ownerDocument = this.ownerDocument;
    if (Array.isArray(node.children)) node.children.forEach((c) => node._attach(c));
  }
  contains(node) { for (let n = node; n; n = n.parent) if (n === this) return true; return false; }
  _matches(selector) {
    if (selector.startsWith('.')) return this.classes.has(selector.slice(1));
    const data = selector.match(/^\[data-([a-z-]+)\]$/);
    if (data) {
      const key = data[1].replace(/-([a-z])/g, (_, c) => c.toUpperCase());
      return this.dataset[key] !== undefined;
    }
    return false;
  }
  _walk(out, selector) { for (const child of this.children) { if (child._matches(selector)) out.push(child); child._walk(out, selector); } return out; }
  querySelectorAll(selector) { return this._walk([], selector); }
  querySelector(selector) { return this._walk([], selector)[0] || null; }
  closest(selector) { for (let n = this; n; n = n.parent) if (n._matches && n._matches(selector)) return n; return null; }
  focus() { if (this.ownerDocument) this.ownerDocument.activeElement = this; }
}
const nodes = Object.fromEntries(['browserPlacesSearch', 'browserPlacesFolder', 'browserPlacesList', 'browserPlacesCount', 'browserPlacesResetFilters'].map(id => [id, new Node()]));
const fakeDocument = { querySelectorAll: () => [], createElement: () => new Node(), activeElement: null };
const context = {
  $: id => nodes[id], Option: function(text, value) { this.textContent = text; this.value = value; },
  document: fakeDocument,
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
Object.values(nodes).forEach((n) => { n.ownerDocument = fakeDocument; });
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

// Odak yeniden kurulumu kayıt kimliğiyle yapılır: odaklı satırın önüne yeni
// kayıt eklendiğinde aynı sıra numarası farklı kayda düşmez.
const rows = () => nodes.browserPlacesList.querySelectorAll('.browser-place-row');
const istanbulOpen = rows().find((r) => r.querySelector('[data-place-open]')?.dataset.placeOpen === 'https://istanbul.test')
  .querySelector('.browser-place-open');
istanbulOpen.focus();
context.player.browserPlaces.bookmarks.unshift({ title: 'En Yeni', url: 'https://enyeni.test', folder: 'Gezi' });
context.renderBrowserPlaces();
assert.equal(fakeDocument.activeElement?.dataset?.placeOpen, 'https://istanbul.test',
  'yeni kayıt öne eklenince odak aynı kayıtta kalmalı');
console.log('Yer imi/geçmiş klasör ayrımı, Türkçe arama, sonuç sayısı, boş durumlar ve kimlik-bazlı odak geri yükleme geçti.');
