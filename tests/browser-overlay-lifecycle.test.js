'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { browserActiveCuesAt } = require('../src/browser-subtitles');

class FakeElement {
  constructor(document, tagName) {
    this.ownerDocument = document;
    this.tagName = String(tagName || '').toUpperCase();
    this.children = [];
    this.parentNode = null;
    this.dataset = {};
    this.style = {};
    this.id = '';
  }

  append(...nodes) { nodes.forEach((node) => this.appendChild(node)); }
  appendChild(node) {
    if (node.parentNode) node.parentNode.children = node.parentNode.children.filter((item) => item !== node);
    node.parentNode = this;
    this.children.push(node);
    return node;
  }
  remove() {
    if (this.parentNode) this.parentNode.children = this.parentNode.children.filter((item) => item !== this);
    this.parentNode = null;
  }
  get isConnected() {
    let node = this;
    while (node) {
      if (node === this.ownerDocument.documentElement) return true;
      node = node.parentNode;
    }
    return false;
  }
  allDescendants() {
    return this.children.flatMap((child) => [child, ...child.allDescendants()]);
  }
  querySelectorAll(selector) {
    const nodes = this.allDescendants();
    if (selector === '*') return nodes;
    if (selector === '[data-kind="source"]') return nodes.filter((node) => node.dataset.kind === 'source');
    if (selector === '[data-kind="translation"]') return nodes.filter((node) => node.dataset.kind === 'translation');
    if (selector === 'video') return nodes.filter((node) => node.tagName === 'VIDEO');
    return [];
  }
  querySelector(selector) { return this.querySelectorAll(selector)[0] || null; }
}

class FakeDocument {
  constructor() {
    this.documentElement = new FakeElement(this, 'html');
    this.body = new FakeElement(this, 'body');
    this.documentElement.appendChild(this.body);
    this.fullscreenElement = null;
    this.listeners = new Map();
  }
  createElement(tag) { return new FakeElement(this, tag); }
  allNodes() { return [this.documentElement, ...this.documentElement.allDescendants()]; }
  getElementById(id) { return this.allNodes().find((node) => node.id === id) || null; }
  querySelectorAll(selector) {
    if (selector === '[data-whisper-browser-overlay="true"]') {
      return this.allNodes().filter((node) => node.dataset.whisperBrowserOverlay === 'true');
    }
    if (selector === '*') return this.documentElement.allDescendants();
    return [];
  }
  addEventListener(type, listener) { this.listeners.set(type, listener); }
}

function overlayFactory() {
  const main = fs.readFileSync(path.join(__dirname, '..', 'src', 'main.js'), 'utf8');
  const start = main.indexOf('function browserOverlayScript(');
  const end = main.indexOf('\nasync function applyBrowserOverlay', start);
  assert.ok(start >= 0 && end > start, 'browserOverlayScript kaynakta bulunamadı');
  return vm.runInNewContext(`(${main.slice(start, end)})`, { browserActiveCuesAt });
}

const buildScript = overlayFactory();
let passed = 0;
function test(name, fn) {
  try { fn(); passed += 1; console.log(`  OK  ${name}`); }
  catch (error) { console.error(`  FAIL ${name}: ${error.message}`); process.exitCode = 1; }
}

function createPage() {
  const document = new FakeDocument();
  const window = {};
  const context = vm.createContext({ document, window, requestAnimationFrame: () => 1 });
  return { document, window, context };
}

function inject(page, text = 'Bir') {
  vm.runInContext(buildScript({
    source: [{ start: 0, end: 10, text }], translation: [], mode: 'source', offset: 0,
  }), page.context);
}

function roots(page) {
  return page.document.querySelectorAll('[data-whisper-browser-overlay="true"]');
}

test('ilk tam belgede tek ve eksiksiz overlay kurar', () => {
  const page = createPage(); inject(page);
  const root = roots(page)[0];
  assert.equal(roots(page).length, 1);
  assert.ok(root.querySelector('[data-kind="source"]'));
  assert.ok(root.querySelector('[data-kind="translation"]'));
  assert.equal(page.window.__whisperBrowserSubLoopStarts, 1);
});

test('aynı belgeye yinelenen kurulum kök ve animasyon döngüsü çoğaltmaz', () => {
  const page = createPage(); inject(page); inject(page); inject(page);
  assert.equal(roots(page).length, 1);
  assert.equal(page.window.__whisperBrowserSubLoopStarts, 1);
});

test('fault-injection ile eklenen ikinci işaretli kökü temizler', () => {
  const page = createPage(); inject(page);
  const duplicate = page.document.createElement('div');
  duplicate.dataset.whisperBrowserOverlay = 'true';
  page.document.documentElement.appendChild(duplicate);
  inject(page);
  assert.equal(roots(page).length, 1);
});

test('site overlay kökünü ve çeviri çocuğunu silerse yeniden kurar', () => {
  const page = createPage(); inject(page);
  const root = roots(page)[0];
  root.querySelector('[data-kind="translation"]').remove();
  root.remove();
  inject(page);
  assert.equal(roots(page).length, 1);
  assert.ok(roots(page)[0].querySelector('[data-kind="translation"]'));
  assert.equal(page.window.__whisperBrowserSubLoopStarts, 1);
});

test('SPA geçişini temsil eden aynı belgede payload yenilenir', () => {
  const page = createPage(); inject(page, 'Önce'); inject(page, 'Sonra');
  assert.equal(page.window.__whisperBrowserSubs.source[0].text, 'Sonra');
  assert.equal(roots(page).length, 1);
});

test('tam gezinme ve reload yeni belgeye birer overlay kurar', () => {
  const first = createPage(); const second = createPage(); const reload = createPage();
  inject(first); inject(second); inject(reload);
  assert.equal(roots(first).length, 1);
  assert.equal(roots(second).length, 1);
  assert.equal(roots(reload).length, 1);
});

test('video bulunmayan hata belgesinde kurulum çökmez', () => {
  const errorPage = createPage();
  assert.doesNotThrow(() => inject(errorPage));
  assert.equal(roots(errorPage).length, 1);
});

test('eski belge payload güncellemesi yeni belgeye sızmaz', () => {
  const oldPage = createPage(); const newPage = createPage();
  inject(oldPage, 'Eski'); inject(newPage, 'Yeni'); inject(oldPage, 'Gecikmiş eski');
  assert.equal(newPage.window.__whisperBrowserSubs.source[0].text, 'Yeni');
});

if (!process.exitCode) console.log(`browser-overlay-lifecycle: ${passed} test`);
