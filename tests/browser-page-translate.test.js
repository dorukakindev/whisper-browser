'use strict';

const assert = require('assert');
const vm = require('vm');
const {
  MAX_PAGE_BLOCKS,
  MAX_PAGE_BLOCK_TEXT,
  MAX_PAGE_CHARACTERS,
  pageBlockScanScript,
  pageContextScript,
  pageContextRevealScript,
  pageApplyScript,
  pageActionResultScript,
  pageRestoreScript,
  pageMemoryClearScript,
  pageVisibilityScript,
  pageViewScript,
  pageAutoContinueScript,
  pageExcludeScript,
  normalizePageBlocks,
  planPageTranslationBatches,
  pageBlockCacheKey,
  pageTranslationMemoryKey,
  pagePreviewSummary,
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
assert.deepEqual(normalizePageBlocks([{ id: 'year', text: '2026', tag: 'h2' }])
  .map((block) => [block.text, block.tag]), [['2026', 'h2']]);

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
assert.deepEqual(planPageTranslationBatches(tooMany, { maxBlocks: 0 }), []);
assert.deepEqual(planPageTranslationBatches(tooMany, { maxCharacters: 0 }), []);

const cacheBlock = { id: 'değişebilir', text: 'Aynı kaynak metin' };
assert.equal(pageBlockCacheKey(cacheBlock, { targetLanguage: 'tr', model: 'x' }),
  pageBlockCacheKey({ ...cacheBlock, id: 'başka-id' }, { targetLanguage: 'TR', model: 'x' }));
assert.notEqual(pageBlockCacheKey(cacheBlock, { targetLanguage: 'tr', model: 'x' }),
  pageBlockCacheKey(cacheBlock, { targetLanguage: 'de', model: 'x' }));
assert.notEqual(pageBlockCacheKey({ ...cacheBlock, tag: 'a' }, { targetLanguage: 'tr', model: 'x', contextBefore: ['Önce'] }),
  pageBlockCacheKey({ ...cacheBlock, tag: 'p' }, { targetLanguage: 'tr', model: 'x', contextBefore: ['Önce'] }));
assert.notEqual(pageBlockCacheKey(cacheBlock, { targetLanguage: 'tr', model: 'x', contextBefore: ['Önce'] }),
  pageBlockCacheKey(cacheBlock, { targetLanguage: 'tr', model: 'x', contextBefore: ['Başka'] }));
assert.equal(pageTranslationMemoryKey(cacheBlock, { targetLanguage: 'tr', model: 'x' }),
  pageTranslationMemoryKey({ ...cacheBlock, id: 'başka-id' }, { targetLanguage: 'TR', model: 'x' }));
assert.notEqual(pageTranslationMemoryKey(cacheBlock, { targetLanguage: 'tr', model: 'x' }),
  pageTranslationMemoryKey(cacheBlock, { targetLanguage: 'de', model: 'x' }));
assert.notEqual(pageTranslationMemoryKey({ ...cacheBlock, tag: 'a', section: 'Menü' }, { targetLanguage: 'tr', model: 'x' }),
  pageTranslationMemoryKey({ ...cacheBlock, tag: 'p', section: 'Gövde' }, { targetLanguage: 'tr', model: 'x' }));

const preview = pagePreviewSummary([
  { id: 'far', text: 'Uzak blok metni', top: 900, bottom: 950, order: 0, section: 'Gövde' },
  { id: 'visible', text: 'Görünen blok metni', top: 10, bottom: 30, order: 1, section: 'Gövde' },
  { id: 'memory', text: 'Bellekte olan blok', top: 50, bottom: 80, order: 2, section: 'Gövde' },
  { id: 'excluded', text: 'Dışlanan bölüm', top: 100, bottom: 120, order: 3, section: 'Yorumlar' },
], { viewportTop: 0, viewportBottom: 500, excludedSections: ['Yorumlar'], memoryIds: new Set(['memory']),
  characterBudget: 30, apiCharactersUsed: 12 });
assert.equal(preview.apiBlocks, 1, 'önizleme kalan bütçede görünür bloğu öncelemeli');
assert.equal(preview.pendingBlocks, 1);
assert.equal(preview.memoryBlocks, 1);
assert.equal(preview.excludedBlocks, 1);
assert.equal(preview.apiCharactersUsed, 12);

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
const normalizedTokens = decodePageTranslation({ translations: [
  { id: 'heading', translation: 'Ana sayfa' },
  { id: 'body', translation: 'Ayrıntılar https://example.test/docs için & bilgi.' },
] }, { pieces: [
  { cueId: 'heading', text: 'Home' },
  { cueId: 'body', text: 'Details at https://example.test/docs. &amp; info.' },
] });
assert.deepEqual(normalizedTokens.parts,
  ['Ana sayfa', 'Ayrıntılar https://example.test/docs için & bilgi.']);
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
  pageContextScript(),
  pageContextRevealScript(hostile),
  pageApplyScript({ mode: 'bilingual', translations: [{ id: hostile, translation: hostile }] }),
  pageActionResultScript({ id: hostile, ok: true }),
  pageRestoreScript(),
  pageMemoryClearScript(),
  pageVisibilityScript(true),
  pageVisibilityScript(false),
  pageViewScript('both'),
  pageAutoContinueScript(false),
  pageExcludeScript([hostile]),
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
assert.match(pageBlockScanScript({ scope: 'selection', visibleOnly: true, autoContinue: false }), /intersectsNode/);
assert.match(pageBlockScanScript({ scope: 'article' }), /article,main/);
assert.match(pageContextScript(), /querySelectorAll/);
assert.match(pageContextScript(), /maxCharacters/);
assert.match(pageContextScript(), /__whisperPageContextState/);
assert.match(pageContextScript(), /button,a,pre,code/,
  'teknik belge bağlamı sınırlı pre/code içeriğini kapsamalı');
assert.doesNotMatch(pageContextScript(), /noscript,code,pre,textarea/,
  'pre/code bağlam engel listesinde kalmamalı');
assert.match(pageBlockScanScript(), /blocks\.sort\(\(a, b\) => a\.order - b\.order\)/,
  'görünürlük seçimi sonrasında LLM blokları belge sırasına dönmeli');
assert.match(pageBlockScanScript({ excludedSelectors: ['.comments', '.ads'] }), /matchesExtraExcluded/);
assert.match(pageApplyScript({ targetLanguage: 'tr' }), /sessionStorage/);
assert.match(pageMemoryClearScript(), /removeItem/);
assert.match(pageApplyScript({}), /hideTools/);
assert.match(pageApplyScript({}), /pointerout/);
assert.match(pageApplyScript({}), /whisperPendingId/);
assert.doesNotMatch(pageApplyScript({}), /globalThis\.prompt/,
  'Electron web içeriğinde desteklenmeyen prompt kullanılmamalı');
assert.match(pageApplyScript({}), /data-whisper-action', 'edit-save'/,
  'çeviri düzeltme yerleşik DOM düzenleyicisiyle kaydedilebilmeli');
assert.match(pageApplyScript({}), /flushPersistedTranslations\(\)/,
  'çeviri belleği blok başına değil paket sonunda yazılmalı');
assert.match(pageApplyScript({}), /document\.documentElement\.appendChild\(tools\)/,
  'body transformu sabit araç kutusunun koordinat sistemini değiştirmemeli');

const retryButton = {
  disabled: true,
  textContent: 'Yeniden deneniyor…',
  dataset: { whisperPendingId: 'retry-id' },
};
const retryState = { tools: { querySelector: () => retryButton } };
assert.equal(vm.runInNewContext(pageActionResultScript({ id: 'retry-id', ok: true }), {
  window: { __whisperPageTranslateState: retryState }, document: { querySelectorAll: () => [] }, String, Array,
}), true);
assert.equal(retryButton.disabled, false);
assert.equal(retryButton.textContent, 'Yeniden çevir');
assert.equal(retryButton.dataset.whisperPendingId, undefined);

const badgeRetryButton = {
  disabled: true,
  textContent: 'Yeniden deneniyor…',
  dataset: { whisperPendingId: 'badge-id' },
};
assert.equal(vm.runInNewContext(pageActionResultScript({ id: 'badge-id', ok: false }), {
  window: { __whisperPageTranslateState: retryState },
  document: { querySelectorAll: () => [badgeRetryButton] }, String, Array,
}), true);
assert.equal(badgeRetryButton.disabled, false);
assert.equal(badgeRetryButton.textContent, 'Yeniden dene');
assert.equal(badgeRetryButton.dataset.whisperPendingId, undefined);

let emitted = 0;
const viewState = {
  refs: new Map([['view:key', { active: true }]]), view: 'both', lastVisibleView: 'both',
  setView(next) { this.view = next; return 1; }, emitNewBlocks() { emitted++; },
};
const viewContext = { window: { __whisperPageTranslateState: viewState }, globalThis: {
  scrollX: 12, scrollY: 340, scrollTo(x, y) { this.restored = [x, y]; },
}, Number, Map, Set };
const viewResult = vm.runInNewContext(pageViewScript('translation'), viewContext);
assert.deepEqual(viewResult, { ok: true, view: 'translation', visible: true, applied: 1 });
assert.deepEqual(viewContext.globalThis.restored, [12, 340]);
const autoResult = vm.runInNewContext(pageAutoContinueScript(false), viewContext);
assert.deepEqual(autoResult, { ok: true, autoContinue: false });
assert.equal(emitted, 0);

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

const previewWindow = {};
const previewScan = vm.runInNewContext(pageBlockScanScript({ preview: true, observe: false }), {
  window: previewWindow, document: fakeDocument, NodeFilter: { SHOW_TEXT: 4 }, innerHeight: 600,
  getComputedStyle: (element) => ({ display: element.display }), Map, Set, WeakMap, Math, Number, String,
});
assert.equal(previewScan.blocks.length, 1);
assert.equal(previewWindow.__whisperPageTranslateState, undefined,
  'önizleme kalıcı tarama durumu oluşturmamalı');

const excludedWindow = {};
const excludedContext = {
  window: excludedWindow, document: fakeDocument, NodeFilter: { SHOW_TEXT: 4 }, innerHeight: 600,
  getComputedStyle: (element) => ({ display: element.display }), Map, Set, WeakMap, Math, Number, String,
};
const excludedScan = vm.runInNewContext(pageBlockScanScript({
  observe: false, excludedSections: ['Genel'],
}), excludedContext);
assert.equal(excludedScan.blocks.length, 0, 'dışlanan bölüm DOM taramasından çıkmalı');
assert.equal(excludedScan.stats.found, 0, 'dışlanan bölüm keşif sayısına girmemeli');
assert.equal(excludedWindow.__whisperPageTranslateState.knownIds.size, 0,
  'dışlanan bölüm yeniden dahil edildiğinde keşfedilebilmek için knownIds içine yazılmamalı');
assert.equal(excludedWindow.__whisperPageTranslateState.emittedCharacters, 0,
  'dışlanan bölüm tarama karakter bütçesini tüketmemeli');
const reIncludedScan = vm.runInContext(pageBlockScanScript({
  observe: false, excludedSections: [],
}), vm.createContext(excludedContext));
assert.equal(reIncludedScan.blocks.length, 1,
  'dışlama kaldırılınca daha önce bütçeye alınmamış bölüm keşfedilmeli');
excludedWindow.__whisperPageTranslateState.emittedCount = 1500;
const resetScan = vm.runInContext(pageBlockScanScript({
  observe: false, resetSession: true,
}), vm.createContext(excludedContext));
assert.equal(resetScan.blocks.length, 1, 'yeni çeviri oturumu eski blok bütçesini devralmamalı');

const memoryRows = JSON.stringify([{
  page: 'https://example.com/article?v=1', target: 'tr', memoryVersion: 'm',
  source: 'Merhaba dünya.', tag: 'p', role: 'article', section: 'Genel', translation: 'Hello world.',
}]);
const memoryStorage = { getItem: () => memoryRows };
const memoryContext = (search) => ({
  window: {}, document: fakeDocument, NodeFilter: { SHOW_TEXT: 4 }, innerHeight: 600,
  location: { origin: 'https://example.com', pathname: '/article', search },
  sessionStorage: memoryStorage,
  getComputedStyle: (element) => ({ display: element.display }), Map, Set, WeakMap, Math, Number, String,
});
assert.equal(vm.runInNewContext(pageBlockScanScript({
  preview: true, observe: false, targetLanguage: 'tr', memoryVersion: 'm',
}), memoryContext('?v=2')).restoredTranslations.length, 0,
'farklı query parametreli sayfa çeviri belleğini paylaşmamalı');
assert.equal(vm.runInNewContext(pageBlockScanScript({
  preview: true, observe: false, targetLanguage: 'tr', memoryVersion: 'm',
}), memoryContext('?v=1')).restoredTranslations.length, 1,
'aynı query parametreli sayfa çevirisi geri yüklenmeli');

const sourceElement = {
  tagName: 'P', textContent: 'Kaynak paragraf metni.', isConnected: true, style: {},
  matches: () => false, closest: () => null, getAttribute: () => '',
  getClientRects: () => [{}], getBoundingClientRect: () => ({ width: 320, height: 60 }),
  scrollIntoView(options) { this.scrollOptions = options; },
};
const sourceRoot = { querySelectorAll: () => [sourceElement] };
const sourceWindow = {};
const sourceCapture = vm.runInNewContext(pageContextScript(), {
  window: sourceWindow,
  document: { title: 'Test', body: sourceRoot, querySelectorAll: () => [sourceRoot] },
  location: { origin: 'https://example.com', pathname: '/article' },
  Map, Set, Math, Number, String,
});
assert.equal(sourceCapture.blocks[0].id, 'S1');
assert.equal(sourceWindow.__whisperPageContextState.refs.get('S1'), sourceElement);
const sourceReveal = vm.runInNewContext(pageContextRevealScript('S1'), {
  window: sourceWindow, Map, String, clearTimeout() {}, setTimeout() { return 1; },
});
assert.deepEqual(sourceReveal, { ok: true, id: 'S1' });
assert.equal(sourceElement.style.outline, '3px solid #d5a35c');
assert.equal(sourceElement.scrollOptions.block, 'center');
assert.deepEqual(vm.runInNewContext(pageContextRevealScript('bad'), { window: sourceWindow }),
  { ok: false, message: 'Geçersiz sayfa kaynağı.' });

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
const detachedMiddle = { nodeValue: 'kopuk', isConnected: false };
pageState.refs.get('0:key').nodes = [firstNode, detachedMiddle, secondNode];
pageState.refs.get('0:key').originals = ['Merhaba ', 'kopuk ', 'dünya.'];
vm.runInNewContext(pageApplyScript({
  mode: 'replace', id: '0:key', translation: 'Eksiksiz çevrilmiş cümle.',
}), pageContext);
assert.equal(firstNode.nodeValue + secondNode.nodeValue, 'Eksiksiz çevrilmiş cümle.',
  'kopmuş düğümün payı bağlı düğümlerde kaybolmamalı');
pageState.refs.get('0:key').nodes = [firstNode, secondNode];
pageState.refs.get('0:key').originals = ['Merhaba ', 'dünya.'];
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
const tableParent = {
  tagName: 'DIV', children: [],
  insertBefore(node, before) {
    const index = before ? this.children.indexOf(before) : -1;
    if (index < 0) this.children.push(node); else this.children.splice(index, 0, node);
    node.parentNode = this;
  },
};
const table = { tagName: 'TABLE', parentNode: tableParent, nextSibling: null };
const tbody = { tagName: 'TBODY', parentNode: table, nextSibling: null };
const row = { tagName: 'TR', parentNode: tbody, nextSibling: null, children: [],
  appendChild(node) { this.children.push(node); } };
tableParent.children.push(table);
const tableState = {
  refs: new Map([['table:key', { id: 'table:key', root: row,
    nodes: [{ nodeValue: 'Satır', isConnected: true }], originals: ['Satır'],
    active: false, applied: false }]]),
  latestIdByRoot: new WeakMap([[row, 'table:key']]), activeByRoot: new WeakMap(), visible: true,
};
vm.runInNewContext(pageApplyScript({ mode: 'bilingual', id: 'table:key', translation: 'Row' }),
  { ...pageContext, window: { __whisperPageTranslateState: tableState } });
assert.equal(row.children.length, 0, 'çeviri doğrudan tr içine eklenmemeli');
assert.equal(tableParent.children[1].className, 'whisper-page-tr');
vm.runInNewContext(pageRestoreScript(), pageContext);
assert.equal(firstNode.nodeValue + secondNode.nodeValue, 'Merhaba dünya.');

console.log('browser-page-translate: semantik bağlam, atomik çıktı ve DOM geri yükleme testleri geçti');
