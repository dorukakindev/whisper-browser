'use strict';

const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const {
  PDF_TRANSLATION_STATE_VERSION,
  textItemsToLines,
  mergePdfLines,
  mergePdfTextItems,
  filterRepeatedMarginalLines,
  buildPdfParagraphPages,
  createPdfTranslationState,
  normalizePdfTranslationState,
  translatedPdfPages,
  pendingPdfPages,
  recordPdfPageTranslation,
  pdfHashPlan,
  pdfHashFromFirstChunk,
} = require('../src/pdf-translate');

function item(str, x, y, width = str.length * 5, height = 10, extra = {}) {
  return { str, width, height, transform: [1, 0, 0, height, x, y], ...extra };
}

// Aynı satırdaki pdf.js parçaları y yüksekliğinin %30'u toleransıyla birleşir.
const sameLine = textItemsToLines([
  item('dünya', 42, 699), item('Merhaba', 0, 700, 35), item('.', 68, 700, 2),
  item('İkinci satır', 0, 680),
], { pageHeight: 800 });
assert.equal(sameLine.length, 2);
assert.equal(sameLine[0].text, 'Merhaba dünya.');
assert.equal(sameLine[1].text, 'İkinci satır');

// Tireli satır sonu kayıpsız birleşir; normal satır ve cümle sınırları ayrılır.
const paragraphs = mergePdfTextItems([
  item('olağan-', 0, 700),
  item('üstü bir durum', 0, 688),
  item('devam ediyor', 0, 676),
  item('ve burada bitiyor.', 0, 652),
  item('Yeni paragraf.', 0, 640),
], { pageNumber: 3, pageHeight: 800 });
assert.deepEqual(paragraphs.map((paragraph) => paragraph.text), [
  'olağanüstü bir durum devam ediyor',
  've burada bitiyor.',
  'Yeni paragraf.',
]);
assert(paragraphs.every((paragraph) => paragraph.id.startsWith('3:')));
assert.equal(paragraphs[0].lineCount, 3, 'tire kaldırılırken kaynak satır geometrisi korunmalı');

// Ortak sentenceEnded Türkçe ve noktalı kısaltmaları paragraf sonu saymaz.
assert.deepEqual(mergePdfLines([
  { text: 'Elma, armut vb.', x: 0, y: 100, width: 50, height: 10 },
  { text: 'meyveleri aldım.', x: 0, y: 90, width: 50, height: 10 },
  { text: 'L.A.', x: 0, y: 80, width: 20, height: 10 },
  { text: 'kentinde yaşadı.', x: 0, y: 70, width: 50, height: 10 },
], { pageNumber: 1 }).map((paragraph) => paragraph.text), [
  'Elma, armut vb. meyveleri aldım.',
  'L.A. kentinde yaşadı.',
]);

// Üst/alt %7 içindeki tekrar eden kısa satırlar ve sayfa numaraları elenir.
const rawPages = [1, 2, 3].map((pageNumber) => ({
  pageNumber,
  pageHeight: 1000,
  lines: [
    { text: 'Örnek Kitap', x: 0, y: 960, width: 80, height: 10 },
    { text: `Bölüm ${pageNumber}`, x: 0, y: 850, width: 60, height: 10 },
    { text: String(pageNumber), x: 0, y: 30, width: 10, height: 10 },
  ],
}));
const filtered = filterRepeatedMarginalLines(rawPages);
assert.deepEqual(filtered.map((page) => page.lines.map((line) => line.text)), [
  ['Bölüm 1'], ['Bölüm 2'], ['Bölüm 3'],
]);
assert.deepEqual(buildPdfParagraphPages(rawPages).map((page) => page.paragraphs[0].text),
  ['Bölüm 1', 'Bölüm 2', 'Bölüm 3']);
const itemPages = rawPages.map((page) => ({ ...page, items: page.lines.map((line) => item(
  line.text, line.x, line.y, line.width, line.height)), lines: undefined }));
assert.deepEqual(buildPdfParagraphPages(itemPages).map((page) => page.paragraphs[0].text),
  ['Bölüm 1', 'Bölüm 2', 'Bölüm 3'], 'getTextContent öğeleri doğrudan işlenebilmeli');

const identity = { pdfHash: '123:abc', targetLanguage: 'tr', model: 'gpt-test' };
assert.deepEqual(createPdfTranslationState(identity), {
  version: PDF_TRANSLATION_STATE_VERSION,
  ...identity,
  pages: {},
});

// Sürüm/kimlik uyuşmazlığı eski sonuçları karıştırmaz.
const stale = { version: PDF_TRANSLATION_STATE_VERSION - 1, ...identity,
  pages: { 1: [{ id: 'a', source: 'Hello', translation: 'Merhaba' }] } };
assert.deepEqual(normalizePdfTranslationState(stale, identity).pages, {});
assert.deepEqual(normalizePdfTranslationState({ ...stale, version: PDF_TRANSLATION_STATE_VERSION,
  targetLanguage: 'de' }, identity).pages, {});

// Geçerli kısmi durum korunur; tamamlanmış sayfa atlanır, başarısız sayfa sürdürülür.
const partial = normalizePdfTranslationState({
  version: PDF_TRANSLATION_STATE_VERSION,
  ...identity,
  pages: {
    1: [{ id: 'a', source: 'Hello.', translation: 'Merhaba.', status: 'translated' }],
    2: [{ id: 'b', source: 'Retry.', status: 'failed', error: 'Ağ hatası' }],
    bad: [{ id: 'x', source: 'Atlanır', translation: 'No' }],
  },
}, identity);
assert.deepEqual(translatedPdfPages(partial), [1]);
assert.deepEqual(pendingPdfPages([1, 2, 2, 3], partial), [2, 3]);
assert.equal(partial.pages['2'][0].error, 'Ağ hatası');
assert.equal(partial.pages.bad, undefined);

const completed = recordPdfPageTranslation(partial, 2, [
  { id: 'b', source: 'Retry.', translation: 'Yeniden dene.' },
]);
assert.deepEqual(translatedPdfPages(completed), [1, 2]);
assert.equal(partial.pages['2'][0].status, 'failed', 'durum güncellemesi girdiyi değiştirmemeli');

// Karma yalnız dosya boyutu ve ilk 1 MiB üzerinden planlanır/üretilir.
assert.deepEqual(pdfHashPlan(2 * 1024 * 1024), {
  fileSize: 2 * 1024 * 1024, offset: 0, length: 1024 * 1024, algorithm: 'sha256',
});
assert.equal(pdfHashPlan(17).length, 17);
const chunk = Buffer.alloc(1024 * 1024 + 10, 7);
const expectedDigest = createHash('sha256').update(chunk.subarray(0, 1024 * 1024)).digest('hex');
assert.equal(pdfHashFromFirstChunk(2 * 1024 * 1024, chunk), `${2 * 1024 * 1024}:${expectedDigest}`);
assert.throws(() => pdfHashFromFirstChunk(100, Buffer.alloc(99)), /eksik/u);

console.log('pdf-translate: satır/paragraf, kenar eleme, devam durumu ve hızlı karma testleri geçti');
