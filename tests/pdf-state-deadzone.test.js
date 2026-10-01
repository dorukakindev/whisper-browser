'use strict';

// R334 ölü-bölge kilidi — PDF çeviri durum hattı (src/main.js):
// pdfTranslationStatePath, writePdfTranslationState, readPdfTranslationState,
// preparePdfPageRequests, inspectPdfDocument — sıfır test referanslı.
// Alt modül (src/pdf-translate.js) saf Node; gerçek implementasyonu
// vm bağlamına enjekte edilir, yalnız Electron/app/fs-yüzey stub'lanır.
// Sözleşmeler:
//   - statePath: userData/pdf-translations/<stem>.json
//   - write: mevcut dosya → .bak kopyası + atomik yazma (gerçek fs)
//   - prepare: sayfa sayısı [1,3], sayfa no safe-int ≥1, item≤8000/blok≤2000,
//     toplam item≤16000/karakter≤400000; items paragrafa çözülür, yoksa bloklar
//   - inspect: pdfHash+resourceId türetilir, LRU 100 belge üstü en eskiyi atar

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const vm = require('vm');
const crypto = require('crypto');

const source = fs.readFileSync(path.join(__dirname, '..', 'src', 'main.js'), 'utf8');
const pdfTranslate = require('../src/pdf-translate.js');

function section(start, end) {
  const from = source.indexOf(start);
  const to = source.indexOf(end, from);
  assert(from >= 0 && to > from);
  return source.slice(from, to);
}

function makeCtx(userData, over = {}) {
  const calls = { atomic: [] };
  const ctx = vm.createContext(Object.assign({
    String, Number, Array, Set, Map, WeakMap, JSON, RegExp, Error, Promise, Buffer, URL,
    Math, Object, Date, console, process, require,
    path, fs, createHash: crypto.createHash,
    app: { getPath: (k) => k === 'userData' ? userData : `/tmp/${k}` },
    loadPdfTranslationState: pdfTranslate.loadPdfTranslationState,
    pdfTranslationStateFileStem: pdfTranslate.pdfTranslationStateFileStem,
    mapPdfItemsThroughViewport: pdfTranslate.mapPdfItemsThroughViewport,
    buildPdfParagraphPages: pdfTranslate.buildPdfParagraphPages,
    pdfHashPlan: pdfTranslate.pdfHashPlan,
    pdfHashFromFirstChunk: pdfTranslate.pdfHashFromFirstChunk,
    writeJsonAtomic: (target, obj) => {
      calls.atomic.push(target);
      fs.writeFileSync(target, JSON.stringify(obj));
    },
    pdfFileAccess: {
      inspect: (p) => p,
      has: (p) => fs.existsSync(p),
    },
    pdfDocuments: new Map(),
    pdfDocumentsByResourceId: new Map(),
    pdfResourceNonce: 'nonce-test',
    __calls: calls,
  }, over));
  return { ctx, calls };
}

function evalFns(ctx) {
  vm.runInContext(
    section('function pdfTranslationDirectory()', 'async function translatePdfPage('),
    ctx);
}

function t_state_path_and_write() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pdfstate-'));
  const { ctx, calls } = makeCtx(dir);
  evalFns(ctx);
  const p = vm.runInContext("pdfTranslationStatePath('h1','ep1')", ctx);
  assert.strictEqual(p, path.join(dir, 'pdf-translations',
    `${pdfTranslate.pdfTranslationStateFileStem('h1', 'ep1')}.json`));
  // ilk yazım: .bak üretmez
  ctx.__state = { pdfHash: 'h1', endpoint: 'ep1', pages: { 1: ['a'] } };
  vm.runInContext('writePdfTranslationState(__state)', ctx);
  assert.strictEqual(calls.atomic.length, 1);
  assert.strictEqual(fs.existsSync(`${p}.bak`), false, 'ilk yazımda .bak olmamalı');
  // ikinci yazım: önceki içerik .bak'a döner
  ctx.__state2 = { pdfHash: 'h1', endpoint: 'ep1', pages: { 1: ['b'] } };
  vm.runInContext('writePdfTranslationState(__state2)', ctx);
  const bak = JSON.parse(fs.readFileSync(`${p}.bak`, 'utf8'));
  assert.deepStrictEqual(bak.pages, { 1: ['a'] }, '.bak eski içeriği tutmadı');
  const cur = JSON.parse(fs.readFileSync(p, 'utf8'));
  assert.deepStrictEqual(cur.pages, { 1: ['b'] });
}

function t_read_state() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pdfstate-'));
  const { ctx } = makeCtx(dir);
  evalFns(ctx);
  const stem = pdfTranslate.pdfTranslationStateFileStem('h2', 'ep2');
  fs.mkdirSync(path.join(dir, 'pdf-translations'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'pdf-translations', `${stem}.json`),
    JSON.stringify({ version: 1, pdfHash: 'h2', endpoint: 'ep2', pages: {} }));
  const r = vm.runInContext(
    "readPdfTranslationState({ pdfHash: 'h2', endpoint: 'ep2' })", ctx);
  assert.ok(r && r.pdfHash === 'h2', 'state okunamadı');
}

function t_prepare_validation() {
  const { ctx } = makeCtx('/tmp/x');
  evalFns(ctx);
  const prep = (pages) => {
    ctx.__pages = pages;
    return vm.runInContext('preparePdfPageRequests(__pages)', ctx);
  };
  const bad = (pages, re) => assert.throws(() => prep(pages), re);
  bad([], /bir ile üç sayfa/);
  bad([1, 2, 3, 4].map((n) => ({ pageNumber: n })), /bir ile üç sayfa/);
  bad([{ pageNumber: 0 }], /sayfa numarası geçersiz/);
  bad([{ pageNumber: 'x' }], /sayfa numarası geçersiz/);
  bad([{ pageNumber: 1.5 }], /sayfa numarası geçersiz/);
  bad([{ pageNumber: 1, items: new Array(8001).fill({ str: 'a' }) }], /metin sınırını aşıyor/);
  bad([{ pageNumber: 1, blocks: new Array(2001).fill({ source: 'a' }) }], /metin sınırını aşıyor/);
  bad([{ pageNumber: 1, blocks: [{ source: 'x'.repeat(400001) }] }], /400.000 karakter/);
  // items > 16000: 3 sayfa × 8000 (sayfa başına sınıra takılmadan toplam aşılır)
  bad([
    { pageNumber: 1, items: new Array(8000).fill({ str: 'a' }) },
    { pageNumber: 2, items: new Array(8000).fill({ str: 'a' }) },
    { pageNumber: 3, items: new Array(8000).fill({ str: 'a' }) },
  ], /16.000 metin parçası/);
}

function t_prepare_output() {
  const { ctx } = makeCtx('/tmp/x');
  evalFns(ctx);
  // items yok → bloklar korunur
  ctx.__pages = [{ pageNumber: 1, blocks: [{ id: 'b1', source: 'metin' }] }];
  let r = vm.runInContext('preparePdfPageRequests(__pages)', ctx);
  assert.strictEqual(r[0].blocks[0].source, 'metin');
  // items var → paragraflar bloklara dönüşür
  ctx.__pages = [{
    pageNumber: 1, pageHeight: 800,
    items: [
      { str: 'Birinci', width: 50, height: 10, transform: [1, 0, 0, 1, 0, 100], hasEOL: false },
      { str: ' satır', width: 40, height: 10, transform: [1, 0, 0, 1, 55, 100], hasEOL: true },
    ],
  }];
  r = vm.runInContext('preparePdfPageRequests(__pages)', ctx);
  assert.ok(r[0].blocks.length >= 1, 'items paragrafa çözülemedi');
  assert.ok(r[0].blocks.every((b) => typeof b.source === 'string' && b.source.length));
  // çıktı şeması {pageNumber, blocks} — items'lı sayfa bloklara indirgenir
  ctx.__pages = [{ pageNumber: 2, pageHeight: 'x', items: [] }];
  r = vm.runInContext('preparePdfPageRequests(__pages)', ctx);
  assert.deepStrictEqual(Object.keys(r[0]).sort(), ['blocks', 'pageNumber']);
}

function t_inspect_lru() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pdfdoc-'));
  const { ctx } = makeCtx(dir);
  evalFns(ctx);
  const f = path.join(dir, 'doc.pdf');
  fs.writeFileSync(f, Buffer.from('%PDF-1.7 fake body'));
  ctx.__f = f;
  const doc = vm.runInContext('inspectPdfDocument(__f)', ctx);
  assert.ok(doc.pdfHash && doc.resourceId, 'hash/resourceId türetilmedi');
  assert.strictEqual(doc.filePath, f);
  assert.strictEqual(ctx.pdfDocuments.get(doc.pdfHash), doc);
  // resourceId nonce'a bağlı: bilinen formül
  const expect = crypto.createHash('sha256')
    .update(`pdf-resource:nonce-test:${doc.pdfHash}`, 'utf8').digest('hex');
  assert.strictEqual(doc.resourceId, expect);
  // LRU: >100 belge → en eski atılır
  ctx.pdfDocuments.clear();
  ctx.pdfDocumentsByResourceId.clear();
  for (let i = 0; i < 105; i++) {
    const fp = path.join(dir, `d${i}.pdf`);
    fs.writeFileSync(fp, `doc-${i}`);
    ctx.__f = fp;
    vm.runInContext('inspectPdfDocument(__f)', ctx);
  }
  assert.strictEqual(ctx.pdfDocumentsByResourceId.size, 100, 'LRU 100 sınırı aşıldı');
  // pdfDocumentByHash: silinmiş dosya → null
  const lastFile = path.join(dir, 'd104.pdf');
  ctx.__f = lastFile;
  const first = vm.runInContext('inspectPdfDocument(__f)', ctx);
  fs.unlinkSync(lastFile);
  const got = vm.runInContext(`pdfDocumentByHash('${first.pdfHash}')`, ctx);
  assert.strictEqual(got, null, 'silinmiş dosya belgesi döndü');
}

function main() {
  t_state_path_and_write();
  t_read_state();
  t_prepare_validation();
  t_prepare_output();
  t_inspect_lru();
  console.log('pdf-state-deadzone: 5 senaryo geçti');
}

main();
