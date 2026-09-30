'use strict';
// R312 — PDF çeviri büyük-belge sınırı: tüm-kitap çevirisi metin çıkarmayı
// paket başına tembel yapar, çizilmemiş sayfa kopyalarını tahliye eder ve
// büyük belgede önce maliyet onayı sorar.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const vm = require('node:vm');

const ROOT = path.join(__dirname, '..');
const RENDERER = path.join(ROOT, 'src', 'renderer', 'renderer.js');

function sliceTranslate() {
  const src = fs.readFileSync(RENDERER, 'utf8').replace(/\r\n/g, '\n');
  const start = src.indexOf('async function translateVisiblePdfPages(');
  const end = src.indexOf('async function openPdfReader');
  assert.ok(start > 0 && end > start, 'PDF çeviri dilimi bulunamadı');
  return src.slice(start, end);
}

function el(id) {
  return { id, disabled: false, textContent: '', value: '', style: {},
    dataset: {}, classList: { toggle() {}, add() {}, remove() {}, contains: () => false },
    addEventListener() {}, removeEventListener() {}, appendChild() {}, append() {},
    remove() {}, querySelectorAll: () => [], setAttribute() {}, getAttribute: () => null };
}

function makeContext(opts) {
  const elements = new Map();
  const get = (id) => { if (!elements.has(id)) elements.set(id, el(id)); return elements.get(id); };
  const order = [];
  const dialogCalls = [];
  const reader = {
    pdf: { numPages: opts.numPages },
    pdfHash: 'hash-1',
    state: { pages: {} },
    currentPage: 1,
    pages: new Map(),
    rendered: new Map(),
    rendering: new Set(),
    viewMode: 'both',
  };
  for (const pre of opts.prefilled || []) {
    reader.pages.set(pre, { blocks: [{ id: `${pre}:0`, source: 'x' }],
      items: [{ str: 'x' }], article: { fake: true }, translation: { fake: true },
      pageHeight: 1, pageWidth: 1, viewportTransform: [] });
  }
  const ctx = {
    console,
    PDF_TRANSLATE_ALL_CONFIRM_PAGES: 40,
    player: { pdfReader: reader },
    window: { api: {
      translatePdfPages: async ({ pages }) => {
        order.push(`translate:${pages.map((p) => p.pageNumber).join(',')}`);
        return { ok: true, state: { pages: {} } };
      },
    } },
    document: { getElementById: () => null, querySelectorAll: () => [],
      createElement: () => el('stub') },
    $: get,
    $$: () => [],
    openAppDialog: async (opts2) => { dialogCalls.push(opts2); return opts.dialogAnswer; },
    interfaceChoice: (tr) => tr,
    pdfReaderSetStatus: () => {},
    updatePdfReaderProgress: () => {},
    updatePlayerTaskCenter: () => {},
    renderPdfTranslation: () => {},
    renderPdfReaderPage: async (n) => { order.push(`render:${n}`); },
    extractPdfReaderPage: async (n) => {
      order.push(`extract:${n}`);
      if (!reader.pages.has(n)) {
        reader.pages.set(n, { blocks: [{ id: `${n}:0`, source: 'x' }], items: [{ str: 'x' }],
          article: null, translation: null, pageHeight: 1, pageWidth: 1, viewportTransform: [] });
      }
      return reader.pages.get(n).blocks;
    },
    setBrowserSignal: () => {},
    localStorage: { getItem: () => null, setItem: () => {} },
  };
  ctx.globalThis = ctx;
  vm.createContext(ctx);
  vm.runInContext(`${sliceTranslate()}\nthis.__api = { translateVisiblePdfPages, PDF_TRANSLATE_ALL_CONFIRM_PAGES };`, ctx);
  return { ctx, reader, order, dialogCalls };
}

test('tüm-kitap çevirisi çıkarmayı paket başına tembel yapar', async () => {
  const { ctx, order } = makeContext({ numPages: 7, dialogAnswer: true });
  await ctx.__api.translateVisiblePdfPages(true);
  const firstTranslate = order.findIndex((e) => e.startsWith('translate:'));
  const extractsBefore = order.slice(0, firstTranslate).filter((e) => e.startsWith('extract:')).length;
  assert.ok(firstTranslate > 0, 'çeviri çağrısı yapılmalı');
  assert.ok(extractsBefore <= 3, `ilk çeviriden önce en fazla 3 sayfa çıkarılmalı, ${extractsBefore} çıkarıldı`);
  const translates = order.filter((e) => e.startsWith('translate:'));
  assert.deepStrictEqual(translates, ['translate:1,2,3', 'translate:4,5,6', 'translate:7']);
});

test('çizilmemiş sayfaların metin kopyası paket sonrası tahliye edilir', async () => {
  const { ctx, reader } = makeContext({ numPages: 7, dialogAnswer: true });
  await ctx.__api.translateVisiblePdfPages(true);
  assert.strictEqual(reader.pages.size, 0, 'metin kopyaları Map içinde birikmemeli');
});

test('büyük belgede tüm-kitap çevirisi önce onay ister', async () => {
  const { ctx, order, dialogCalls } = makeContext({ numPages: 50, dialogAnswer: false });
  await ctx.__api.translateVisiblePdfPages(true);
  assert.strictEqual(dialogCalls.length, 1, 'onay diyaloğu gösterilmeli');
  assert.strictEqual(order.filter((e) => e.startsWith('translate:')).length, 0, 'ret edilince çeviri başlamamalı');
  assert.strictEqual(order.filter((e) => e.startsWith('extract:')).length, 0, 'ret edilince çıkarma yapılmamalı');
});

test('onay verilirse büyük belge tüm sayfaları paketler hâlinde çevirir', async () => {
  const { ctx, order, reader } = makeContext({ numPages: 50, dialogAnswer: true });
  await ctx.__api.translateVisiblePdfPages(true);
  const translates = order.filter((e) => e.startsWith('translate:'));
  assert.strictEqual(translates.length, 17, '50 sayfa 17 paket olmalı');
  assert.strictEqual(order.filter((e) => e.startsWith('extract:')).length, 50);
  assert.strictEqual(reader.pages.size, 0);
});

test('küçük belgede (≤40 sayfa) onay sorulmaz', async () => {
  const { ctx, dialogCalls } = makeContext({ numPages: 10, dialogAnswer: false });
  await ctx.__api.translateVisiblePdfPages(true);
  assert.strictEqual(dialogCalls.length, 0);
});

test('görünen-sayfa yolu mevcut davranışı korur ve çizimli girdileri tahliye etmez', async () => {
  const { ctx, order, reader } = makeContext({ numPages: 5, prefilled: [1, 2], dialogAnswer: true });
  await ctx.__api.translateVisiblePdfPages(false);
  const translates = order.filter((e) => e.startsWith('translate:'));
  assert.deepStrictEqual(translates, ['translate:1,2']);
  assert.strictEqual(reader.pages.size, 2, 'çizilmiş sayfalar (article/translation) tutulur');
});
