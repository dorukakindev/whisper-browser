'use strict';

const assert = require('node:assert/strict');
const {
  textItemsToLines,
  mergePdfLines,
  mergePdfTextItems,
  buildPdfParagraphPages,
  readingOrderMetrics,
  createPdfTranslationState,
  normalizePdfTranslationState,
  recordPdfPageTranslation,
  PDF_TRANSLATION_STATE_VERSION,
} = require('../src/pdf-translate');

function item(str, x, y, width = str.length * 5, height = 10, extra = {}) {
  return { str, width, height, transform: [1, 0, 0, height, x, y], ...extra };
}

// Başlık satırı gövdeyle birleşmez; türü 'heading' olarak işaretlenir.
const headingPage = mergePdfTextItems([
  item('Büyük Başlık', 50, 700, 200, 22),
  item('Gövde metni birinci satır.', 50, 676, 200, 10),
  item('Gövde metni ikinci satır.', 50, 664, 200, 10),
], { pageNumber: 1, pageHeight: 800, pageWidth: 600 });
assert.equal(headingPage.length, 2, 'başlık gövdeden ayrı paragraf olmalı');
assert.equal(headingPage[0].kind, 'heading');
assert.equal(headingPage[0].text, 'Büyük Başlık');
assert.equal(headingPage[1].kind, 'body');
assert.equal(headingPage[1].text, 'Gövde metni birinci satır. Gövde metni ikinci satır.');

// Uzun metin başlık sayılmaz (200 karakter sınırı).
const longLine = mergePdfTextItems([
  item('x'.repeat(300), 50, 700, 600, 22),
  item('Gövde.', 50, 676, 200, 10),
], { pageNumber: 1, pageHeight: 800, pageWidth: 600 });
assert.equal(longLine[0].kind, 'body');

// Dipnot: sayfa altındaki küçük yazı gövdeden ayrılır, sayfa numarası hariç.
const footnotePage = mergePdfTextItems([
  item('Gövde paragrafı satırı bir.', 50, 700, 200, 10),
  item('Gövde paragrafı satırı iki.', 50, 688, 200, 10),
  item('1 Kaynak notu.', 50, 60, 80, 6),
], { pageNumber: 2, pageHeight: 800, pageWidth: 600 });
assert.equal(footnotePage.length, 2, 'dipnot gövdeye karışmamalı');
assert.equal(footnotePage[1].kind, 'footnote');
assert.equal(footnotePage[1].text, '1 Kaynak notu.');

// Alt kenardaki tek başına sayfa numarası dipnot sayılmaz.
const pageNumPage = mergePdfTextItems([
  item('Gövde.', 50, 700, 200, 10),
  item('42', 300, 40, 20, 6),
], { pageNumber: 3, pageHeight: 800, pageWidth: 600 });
assert.equal(pageNumPage.at(-1).kind !== 'footnote', true);

// Tablo bölgesi: 3 satır × 3 hizalı sütun satır-öncelikli sırada okunur ve
// hücreler ayrı paragraf kalır; iki sütunlu gövde metni tablo sayılmaz.
const tableItems = [];
const tableRows = [
  ['Ad', 'Tür', 'Sayfa'],
  ['Iliad', 'Destan', '704'],
  ['Odyssey', 'Destan', '541'],
];
const tableYs = [560, 544, 528];
const tableXs = [50, 210, 370];
for (let row = 0; row < 3; row++) {
  for (let col = 0; col < 3; col++) {
    // Hücre genişliği metin uzunluğuna bağlı — tıraşlı sağ kenar tablo imzasıdır.
    tableItems.push(item(tableRows[row][col], tableXs[col], tableYs[row], tableRows[row][col].length * 5, 10));
  }
}
const layout = mergePdfTextItems([
  item('Bölüm Başlığı', 50, 760, 220, 20),
  item('Giriş paragrafı satırı.', 50, 730, 200, 10),
  ...tableItems,
  item('1 Dipnot metni.', 50, 55, 90, 6),
], { pageNumber: 4, pageHeight: 800, pageWidth: 600 });
const order = layout.map((paragraph) => paragraph.text);
assert.equal(layout[0].kind, 'heading');
assert.equal(layout[1].kind, 'body');
// Tablo hücreleri satır-öncelikli sırada: R1C1, R1C2, R1C3, R2C1…
const cellTexts = order.slice(2, -1);
assert.deepEqual(cellTexts, ['Ad', 'Tür', 'Sayfa', 'Iliad', 'Destan', '704', 'Odyssey', 'Destan', '541']);
assert(layout.slice(2, -1).every((paragraph) => paragraph.kind === 'table'));
assert.equal(layout.at(-1).kind, 'footnote');
assert.equal(layout.at(-1).text, '1 Dipnot metni.');

// İki sütunlu gövde metni hâlâ sütun-öncelikli (tablo dedektörü ≥3 parça ister).
const twoCol = mergePdfTextItems([
  item('Sol sütun satır 1.', 50, 700, 100, 12),
  item('Sağ sütun satır 1.', 300, 700, 100, 12),
  item('Sol sütun satır 2.', 50, 685, 100, 12),
  item('Sağ sütun satır 2.', 300, 685, 100, 12),
], { pageNumber: 5, pageHeight: 800, pageWidth: 500 });
assert.deepEqual(twoCol.map((paragraph) => paragraph.text), [
  'Sol sütun satır 1. Sol sütun satır 2.',
  'Sağ sütun satır 1. Sağ sütun satır 2.',
]);

// readingOrderMetrics: sayfa ilişkileri + tür dağılımı ölçülür.
const metrics = readingOrderMetrics([
  { pageNumber: 4, pageHeight: 800, pageWidth: 600, items: [
    item('Bölüm Başlığı', 50, 760, 220, 20),
    item('Giriş paragrafı satırı.', 50, 730, 200, 10),
    ...tableItems,
    item('1 Dipnot metni.', 50, 55, 90, 6),
  ] },
]);
assert.equal(metrics.pageCount, 1);
assert.equal(metrics.pages[0].paragraphCount, 12);
assert.equal(metrics.pages[0].kinds.heading, 1);
assert.equal(metrics.pages[0].kinds.body, 1);
assert.equal(metrics.pages[0].kinds.table, 9);
assert.equal(metrics.pages[0].kinds.footnote, 1);
assert.deepEqual(metrics.pages[0].order.slice(0, 3), ['Bölüm Başlığı', 'Giriş paragrafı satırı.', 'Ad']);

// Kaynak↔hedef eşleme: blok türü durum dosyasına taşınır, kimlik korunur.
const identity = { pdfHash: '9:xyz', targetLanguage: 'tr', model: 'm', endpoint: 'e' };
const state = createPdfTranslationState(identity);
const after = recordPdfPageTranslation(state, 4, [
  { id: 'h1', source: 'Title', translation: 'Başlık', kind: 'heading' },
  { id: 'b1', source: 'Body.', translation: 'Gövde.' },
]);
assert.equal(after.pages['4'][0].kind, 'heading');
assert.equal(after.pages['4'][1].kind, undefined);
const restored = normalizePdfTranslationState(
  { version: PDF_TRANSLATION_STATE_VERSION, ...identity, pages: after.pages }, identity);
assert.equal(restored.pages['4'][0].kind, 'heading', 'kind kalıcı durumda korunmalı');
const bogusKind = recordPdfPageTranslation(state, 5, [
  { id: 'x', source: 'S', translation: 'T', kind: 'bogus' },
]);
const restoredBogus = normalizePdfTranslationState(
  { version: PDF_TRANSLATION_STATE_VERSION, ...identity, pages: bogusKind.pages }, identity);
assert.equal(restoredBogus.pages['5'][0].kind, undefined, 'bilinmeyen kind düşürülür');

// Geri uyumluluk: tür işaretlenmemiş satırlar 'body' sayılır.
assert.equal(mergePdfLines([{ text: 'Düz satır.', x: 0, y: 100, width: 80, height: 10 }])[0].kind, 'body');

console.log('pdf-reading-order: başlık/dipnot/tablo sırası, eşleme ve ölçüm testleri geçti');
