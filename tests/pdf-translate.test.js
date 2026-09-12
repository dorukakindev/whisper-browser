'use strict';

const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const {
  PDF_TRANSLATION_STATE_VERSION,
  mapPdfItemsThroughViewport,
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

const rotatedItems = mapPdfItemsThroughViewport([
  { str: 'Döndürülmüş', width: 50, height: 10, transform: [1, 0, 0, 10, 100, 500] },
], { pageHeight: 600, viewportTransform: [0, 1, 1, 0, 0, 0] });
assert.equal(rotatedItems[0].transform[4], 500);
assert.equal(rotatedItems[0].transform[5], 500);

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
const overhang = textItemsToLines([
  item('Geniş', 0, 700, 200), item('Son', 50, 700, 10),
], { pageHeight: 800 });
assert.equal(overhang[0].width, 200, 'satır genişliği son değil en sağ parça sınırını kullanmalı');

// Tireli satır sonu kayıpsız birleşir; yalnız geometrik paragraf aralığı ayırır.
const paragraphs = mergePdfTextItems([
  item('olağan-', 0, 700),
  item('üstü bir durum', 0, 688),
  item('devam ediyor', 0, 676),
  item('ve burada bitiyor.', 0, 652),
  item('Yeni paragraf.', 0, 640),
], { pageNumber: 3, pageHeight: 800 });
assert.deepEqual(paragraphs.map((paragraph) => paragraph.text), [
  'olağanüstü bir durum devam ediyor',
  've burada bitiyor. Yeni paragraf.',
]);
assert(paragraphs.every((paragraph) => paragraph.id.startsWith('3:')));
assert.equal(paragraphs[0].lineCount, 3, 'tire kaldırılırken kaynak satır geometrisi korunmalı');

// Normal satır aralığında nokta paragrafı bölmez; CJK gliflerine yapay boşluk eklenmez.
assert.deepEqual(mergePdfLines([
  { text: 'Birinci cümle.', x: 0, y: 100, width: 80, height: 10 },
  { text: 'Aynı paragrafın devamı.', x: 0, y: 90, width: 100, height: 10 },
]).map((paragraph) => paragraph.text), ['Birinci cümle. Aynı paragrafın devamı.']);
assert.deepEqual(mergePdfLines([
  { text: 'Ana gövde.', x: 0, y: 100, width: 80, height: 10, column: 0 },
  { text: 'Yukarıdaki bağımsız not.', x: 0, y: 140, width: 100, height: 10, column: 0 },
]).map((paragraph) => paragraph.text), ['Ana gövde.', 'Yukarıdaki bağımsız not.']);
assert.equal(textItemsToLines([
  item('这', 0, 100, 8), item('是', 10, 100, 8), item('测', 20, 100, 8), item('试', 30, 100, 8),
])[0].text, '这是测试');

// İki sütun aynı Y koordinatlarını kullansa da okuma sırası önce sol sütunu,
// sonra sağ sütunu tamamlar; satırlar yatayda birbirine yapışmaz.
const columns = mergePdfTextItems([
  item('Sol sütun satır 1.', 50, 700, 100, 12),
  item('Sağ sütun satır 1.', 300, 700, 100, 12),
  item('Sol sütun satır 2.', 50, 685, 100, 12),
  item('Sağ sütun satır 2.', 300, 685, 100, 12),
], { pageNumber: 1, pageHeight: 800, pageWidth: 500 });
assert.deepEqual(columns.map((paragraph) => paragraph.text), [
  'Sol sütun satır 1. Sol sütun satır 2.',
  'Sağ sütun satır 1. Sağ sütun satır 2.',
]);

// Ortak sentenceEnded Türkçe ve noktalı kısaltmaları paragraf sonu saymaz.
assert.deepEqual(mergePdfLines([
  { text: 'Elma, armut vb.', x: 0, y: 100, width: 50, height: 10 },
  { text: 'meyveleri aldım.', x: 0, y: 90, width: 50, height: 10 },
  { text: 'L.A.', x: 0, y: 80, width: 20, height: 10 },
  { text: 'kentinde yaşadı.', x: 0, y: 70, width: 50, height: 10 },
], { pageNumber: 1 }).map((paragraph) => paragraph.text), [
  'Elma, armut vb. meyveleri aldım. L.A. kentinde yaşadı.',
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

// Tek bozuk/ayraç blok, aynı sayfadaki sağlam çevirileri geçersiz kılmaz.
const salvaged = recordPdfPageTranslation(partial, 3, [
  { id: 'ok', source: 'Korunan paragraf.', translation: 'Preserved paragraph.' },
  { id: 'blank', source: '   ', translation: '' },
]);
assert.deepEqual(salvaged.pages['3'].map((block) => block.id), ['ok']);
const restoredSalvage = normalizePdfTranslationState({
  version: PDF_TRANSLATION_STATE_VERSION, ...identity,
  pages: { 4: [
    { id: 'ok-2', source: 'Diskteki paragraf.', translation: 'Stored paragraph.' },
    { id: 'blank-2', source: '  ' },
  ] },
}, identity);
assert.deepEqual(restoredSalvage.pages['4'].map((block) => block.id), ['ok-2']);
assert.throws(() => recordPdfPageTranslation(partial, 4, [{ source: ' ' }]), /geçersiz/u);

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
