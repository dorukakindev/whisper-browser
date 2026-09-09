'use strict';

const assert = require('assert');
const vm = require('vm');
const {
  MAX_PAGE_BLOCKS,
  MAX_PAGE_BLOCK_TEXT,
  MAX_PAGE_CHARACTERS,
  pageBlockScanScript,
  pageApplyScript,
  pageRestoreScript,
  pageVisibilityScript,
  normalizePageBlocks,
  planPageTranslationBatches,
  pageBlockCacheKey,
  pageBlockLooksIncomplete,
  buildPageTranslationUnits,
  pageTranslationRequest,
  decodePageTranslation,
} = require('../src/browser-page-translate');

const normalized = normalizePageBlocks([
  null,
  { id: 'empty', text: '   ' },
  { id: 'symbols', text: '123?!' },
  { id: 'same', text: '  Merhaba   dünya  ', nodes: [8, 5], tagName: 'H2', role: 'Heading' },
  { id: 'same', text: 'yinelenen kimlik atlanır' },
  { id: 'long', text: 'x'.repeat(MAX_PAGE_BLOCK_TEXT + 50), nodeLengths: [2100] },
]);
assert.deepEqual(normalized.map((block) => block.id), ['same', 'long']);
assert.equal(normalized[0].text, 'Merhaba dünya');
assert.deepEqual(normalized[0].nodes, [8, 5]);
assert.equal(normalized[0].tag, 'h2');
assert.equal(normalized[0].role, 'heading');
assert.equal(normalized[1].text.length, MAX_PAGE_BLOCK_TEXT);

const tooMany = Array.from({ length: MAX_PAGE_BLOCKS + 10 }, (_, index) => ({
  id: `block-${index}`, text: `Metin ${index}`,
}));
assert.equal(normalizePageBlocks(tooMany).length, MAX_PAGE_BLOCKS);
const tooLarge = Array.from({ length: 300 }, (_, index) => ({
  id: `large-${index}`, text: `a${'x'.repeat(MAX_PAGE_BLOCK_TEXT - 1)}`,
}));
const bounded = normalizePageBlocks(tooLarge);
assert.ok(bounded.reduce((sum, block) => sum + block.text.length, 0) <= MAX_PAGE_CHARACTERS);
assert.equal(bounded.length, MAX_PAGE_CHARACTERS / MAX_PAGE_BLOCK_TEXT);

const batches = planPageTranslationBatches([
  { id: 'far-before', text: 'Önceki uzak paragraf', top: -1000, bottom: -900, order: 0 },
  { id: 'after', text: 'Sonraki paragraf', top: 700, bottom: 760, order: 3 },
  { id: 'visible-2', text: 'Görünen ikinci paragraf', top: 200, bottom: 240, order: 2 },
  { id: 'visible-1', text: 'Görünen ilk paragraf', top: 20, bottom: 60, order: 1 },
], { viewportTop: 0, viewportBottom: 500, batchSize: 2 });
assert.equal(batches.length, 2);
assert.deepEqual(batches[0].map((block) => block.id), ['visible-1', 'visible-2']);
assert.deepEqual(batches[1].map((block) => block.id), ['after', 'far-before']);
assert.ok(planPageTranslationBatches(tooMany).every((batch) => batch.length <= 20));

const cacheBlock = { id: 'değişebilir', text: 'Aynı kaynak metin' };
assert.equal(pageBlockCacheKey(cacheBlock, { targetLanguage: 'tr', model: 'x' }),
  pageBlockCacheKey({ ...cacheBlock, id: 'başka-id' }, { targetLanguage: 'TR', model: 'x' }));
assert.notEqual(pageBlockCacheKey(cacheBlock, { targetLanguage: 'tr', model: 'x' }),
  pageBlockCacheKey(cacheBlock, { targetLanguage: 'de', model: 'x' }));
assert.notEqual(pageBlockCacheKey({ ...cacheBlock, tag: 'a' }, { targetLanguage: 'tr', model: 'x', contextBefore: ['Önce'] }),
  pageBlockCacheKey({ ...cacheBlock, tag: 'p' }, { targetLanguage: 'tr', model: 'x', contextBefore: ['Önce'] }));
assert.notEqual(pageBlockCacheKey(cacheBlock, { targetLanguage: 'tr', model: 'x', contextBefore: ['Önce'] }),
  pageBlockCacheKey(cacheBlock, { targetLanguage: 'tr', model: 'x', contextBefore: ['Başka'] }));

const ordered = Array.from({ length: 12 }, (_, order) => ({
  id: `ordered-${order}`, text: order === 5 ? 'Unfinished thought' : `Complete block ${order}.`,
  tag: order === 2 ? 'h2' : 'p', order,
}));
const units = buildPageTranslationUnits(ordered, ordered.slice(2, 9), { maxTargets: 3 });
assert(units.length >= 3);
assert(units.every((unit) => unit.targets.length <= 3));
assert.deepEqual(units[0].contextBefore.map((item) => item.text), ['Complete block 0.', 'Complete block 1.']);
assert(units.some((unit) => unit.contextAfter.length >= 3));
assert.equal(pageBlockLooksIncomplete({ text: 'Read more', tag: 'a' }), false);
assert.equal(pageBlockLooksIncomplete({ text: 'The unfinished clause', tag: 'p' }), true);

const pageSentence = {
  pieces: [
    { cueId: 'heading', text: 'Home', tag: 'a', role: 'navigation' },
    { cueId: 'body', text: 'Hello {{name}} &amp;', tag: 'p', role: '' },
  ],
  contextBefore: [{ text: 'Previous context only.', tag: 'p', role: '' }],
  contextAfter: [{ text: 'Following context only.', tag: 'p', role: '' }],
  continuitySummary: 'Earlier section summary.',
};
const pageRequest = pageTranslationRequest(pageSentence);
const pagePayload = JSON.parse(pageRequest.payload);
assert.deepEqual(pagePayload.targets.map((row) => [row.id, row.tag]), [['heading', 'a'], ['body', 'p']]);
assert.match(pageRequest.instruction, /yalnız targets/i);
const decodedPage = decodePageTranslation({ translations: [
  { id: 'body', translation: 'Merhaba {{name}} &amp;' },
  { id: 'heading', translation: 'Ana sayfa' },
] }, pageSentence);
assert.deepEqual(decodedPage.parts, ['Ana sayfa', 'Merhaba {{name}} &amp;']);
assert.throws(() => decodePageTranslation({ translations: [
  { id: 'heading', translation: 'Ana sayfa' },
  { id: 'body', translation: 'Merhaba ad' },
] }, pageSentence), /korumalı işaretleri/);
assert.throws(() => decodePageTranslation({ translations: [
  { id: 'heading', translation: 'Ana sayfa' },
] }, pageSentence), /blok sayısıyla/);

const hostile = `tırnak ' " ve \${ifade} </script> \u2028 \u2029`;
const scripts = [
  pageBlockScanScript({ bridgeToken: hostile }),
  pageApplyScript({ mode: 'bilingual', translations: [{ id: hostile, translation: hostile }] }),
  pageRestoreScript(),
  pageVisibilityScript(true),
  pageVisibilityScript(false),
];
for (const script of scripts) {
  assert.doesNotThrow(() => new vm.Script(script));
  assert.doesNotMatch(script, /<\/script>/i);
  assert.doesNotMatch(script, /[\u2028\u2029]/u);
}

assert.match(pageBlockScanScript(), /createTreeWalker/);
assert.match(pageBlockScanScript(), /shadowRoot/);
assert.match(pageBlockScanScript(), /MutationObserver/);
assert.match(pageBlockScanScript(), /setTimeout\([\s\S]*400/);
assert.match(pageApplyScript({}), /whisper-page-tr/);

function fakeElement(display, rect = { top: 10, bottom: 40, left: 5, right: 200 },
  tagName = 'DIV', role = '') {
  return {
    display, tagName, parentElement: null, shadowRoot: null, offsetParent: {}, children: [],
    matches: () => false,
    getAttribute(name) { return name === 'role' ? role : null; },
    getRootNode() { return fakeDocument; },
    getClientRects: () => [rect],
    getBoundingClientRect: () => rect,
    appendChild(child) { this.children.push(child); child.parentElement = this; },
  };
}
const body = fakeElement('block');
const paragraph = fakeElement('block', undefined, 'P', 'article');
const bold = fakeElement('inline');
paragraph.parentElement = body;
bold.parentElement = paragraph;
const textNodes = [
  { nodeType: 3, nodeValue: 'Merhaba ', parentElement: paragraph },
  { nodeType: 3, nodeValue: 'dünya', parentElement: bold },
  { nodeType: 3, nodeValue: '.', parentElement: paragraph },
];
const fakeDocument = {
  hidden: false, body, documentElement: body,
  querySelectorAll: () => [body, paragraph, bold],
  createTreeWalker: () => {
    let index = -1;
    return { nextNode: () => textNodes[++index] || null };
  },
  addEventListener() {}, removeEventListener() {},
};
const scanResult = vm.runInNewContext(pageBlockScanScript({ observe: false }), {
  window: {}, document: fakeDocument, NodeFilter: { SHOW_TEXT: 4 }, innerHeight: 600,
  getComputedStyle: (element) => ({ display: element.display }),
  Map, Set, WeakMap, Math, Number, String,
});
assert.equal(scanResult.blocks.length, 1);
assert.equal(scanResult.blocks[0].text, 'Merhaba dünya.');
assert.deepEqual([...scanResult.blocks[0].nodes], [8, 5, 1]);
assert.equal(scanResult.blocks[0].tag, 'p');
assert.equal(scanResult.blocks[0].role, 'article');

const firstNode = { nodeValue: 'Merhaba ', isConnected: true };
const secondNode = { nodeValue: 'dünya.', isConnected: true };
const applyRoot = { children: [], appendChild(element) { this.children.push(element); } };
const pageState = {
  refs: new Map([['0:key', {
    id: '0:key', root: applyRoot, nodes: [firstNode, secondNode], originals: ['Merhaba ', 'dünya.'],
    active: false, applied: false,
  }]]),
  latestIdByRoot: new WeakMap([[applyRoot, '0:key']]), activeByRoot: new WeakMap(), visible: true,
  observers: new Map(),
};
const elementsById = new Map();
const makeDomElement = (tag) => ({
  tag, style: { setProperty(name, value) { this[name] = value; } }, hidden: false,
  setAttribute(name, value) { this[name] = value; },
  remove() { this.removed = true; },
});
const applyDocument = {
  head: { appendChild(element) { if (element.id) elementsById.set(element.id, element); } },
  documentElement: { appendChild() {} },
  createElement: makeDomElement,
  getElementById: (id) => elementsById.get(id) || null,
  querySelectorAll: () => [],
  removeEventListener() {},
};
const pageContext = { window: { __whisperPageTranslateState: pageState }, document: applyDocument,
  Map, Set, WeakMap, String, Array, Math };
const applied = vm.runInNewContext(pageApplyScript({
  mode: 'replace', id: '0:key', translation: 'Hello world.',
}), pageContext);
assert.equal(applied.applied, 1);
assert.equal(firstNode.nodeValue + secondNode.nodeValue, 'Hello world.');
vm.runInNewContext(pageVisibilityScript(false), pageContext);
assert.equal(firstNode.nodeValue + secondNode.nodeValue, 'Merhaba dünya.');
vm.runInNewContext(pageVisibilityScript(true), pageContext);
assert.equal(firstNode.nodeValue + secondNode.nodeValue, 'Hello world.');
assert.equal(firstNode.nodeValue, 'Hello ', 'görünürlük dönüşü kelimeyi DOM düğümleri arasında bölmemeli');
const bilingual = vm.runInNewContext(pageApplyScript({
  mode: 'bilingual', targetLanguage: 'en', translations: [{ id: '0:key', text: 'Hello world.' }],
}), pageContext);
assert.equal(bilingual.applied, 1);
assert.equal(firstNode.nodeValue + secondNode.nodeValue, 'Merhaba dünya.');
assert.equal(applyRoot.children.at(-1).className, 'whisper-page-tr');
assert.equal(applyRoot.children.at(-1).translate, 'no');

const layoutParent = {
  children: [],
  insertBefore(node, before) {
    const index = before ? this.children.indexOf(before) : -1;
    if (index < 0) this.children.push(node); else this.children.splice(index, 0, node);
    node.parentNode = this;
  },
};
const flexRoot = { parentNode: layoutParent, nextSibling: null, children: [],
  appendChild(node) { this.children.push(node); node.parentNode = this; } };
layoutParent.children.push(flexRoot);
const flexState = {
  refs: new Map([['flex:key', { id: 'flex:key', root: flexRoot, rootDisplay: 'flex',
    nodes: [{ nodeValue: 'Kart metni', isConnected: true }], originals: ['Kart metni'], active: false, applied: false }]]),
  latestIdByRoot: new WeakMap([[flexRoot, 'flex:key']]), activeByRoot: new WeakMap(), visible: true,
};
const flexContext = { ...pageContext, window: { __whisperPageTranslateState: flexState } };
vm.runInNewContext(pageApplyScript({ mode: 'bilingual', id: 'flex:key', translation: 'Card text' }), flexContext);
assert.equal(flexRoot.children.length, 0, 'çeviri flex/grid kapsayıcıda yeni düzen öğesi olmamalı');
assert.equal(layoutParent.children[1].className, 'whisper-page-tr');
vm.runInNewContext(pageRestoreScript(), pageContext);
assert.equal(firstNode.nodeValue + secondNode.nodeValue, 'Merhaba dünya.');

console.log('browser-page-translate: semantik bağlam, atomik çıktı ve DOM geri yükleme testleri geçti');
