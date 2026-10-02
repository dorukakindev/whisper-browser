// Kuyruk-50 madde 36–40 — PDF/manga kullanım-tamamlama kilidi.
// 36: çift görünümde karşılık vurgusu (block.box + pdf-source-marker).
// 37: belirsiz tablo sırası (orderAmbiguous) + kullanıcı düzeltmesi (userText).
// 38: sayfa seçimi (aralık/başarısızlar/çevrilmemişler) + kapsam önizlemesi.
// 39: manga OCR-kaynak düzeltmesi + yalnız bölge yeniden çevirisi.
// 40: kullanıcı düzeltmeleri yeniden OCR/çeviri/sayfa değişiminde korunur.
'use strict';

const assert = require('assert');
const fs = require('fs');
const vm = require('vm');

const PDF = require('../src/pdf-translate');
const MAIN = fs.readFileSync('src/main.js', 'utf8');
const MANGA = fs.readFileSync('src/browser-manga.js', 'utf8');
const PRELOAD = fs.readFileSync('src/preload.js', 'utf8');
const HELPERS = fs.readFileSync('src/renderer/renderer-helpers.js', 'utf8');
const RENDERER = fs.readFileSync('src/renderer/renderer.js', 'utf8');
const HTML = fs.readFileSync('src/renderer/index.html', 'utf8');
const CSS = fs.readFileSync('src/renderer/styles.css', 'utf8');

let passed = 0;
function test(name, fn) {
  try { fn(); passed += 1; console.log(`  PASS  ${name}`); }
  catch (e) { console.error(`  FAIL  ${name}: ${e.message}`); process.exitCode = 1; }
}

// =========================================================================
// Madde 37 — orderAmbiguous: ragged tablo bölgesi (column === -1) işaretlenir
// =========================================================================

function tableParagraphLines() {
  // İki sütunlu ragged tablo: hücre metinleri bandın %40'ından dar →
  // ragged algısı column=-1 atar → orderAmbiguous doğar.
  const line = (text, x, y, width) => ({
    text, x, y, width, height: 12, column: 0, kind: 'body', parts: null,
  });
  // mergePdfLines'e giden "parça" yapısı: sayfa satırları column gruplu.
  return [
    { text: 'Ad', x: 50, y: 800, width: 20, height: 12 },
    { text: 'Fiyat', x: 300, y: 800, width: 25, height: 12 },
    { text: 'Elma', x: 50, y: 780, width: 30, height: 12 },
    { text: '5', x: 300, y: 780, width: 8, height: 12 },
    { text: 'Armut', x: 50, y: 760, width: 35, height: 12 },
    { text: '7', x: 300, y: 760, width: 8, height: 12 },
  ];
}

test('normalizePdfBlock: orderAmbiguous bayrağı korunur', () => {
  const state = PDF.createPdfTranslationState({ pdfHash: 'h', targetLanguage: 'tr', model: 'm', endpoint: 'e' });
  const next = PDF.recordPdfPageTranslation(state, 1, [
    { id: '1:0:x', source: 's', translation: 't', status: 'translated', kind: 'table', orderAmbiguous: true },
  ]);
  assert.strictEqual(next.pages['1'][0].orderAmbiguous, true, 'orderAmbiguous düştü');
});

test('recordPdfPageTranslation: yeniden işlemede userText korunur', () => {
  let state = PDF.createPdfTranslationState({ pdfHash: 'h', targetLanguage: 'tr', model: 'm', endpoint: 'e' });
  state = PDF.recordPdfPageTranslation(state, 1, [
    { id: '1:0:a', source: 's1', translation: 'm1', status: 'translated' },
    { id: '1:1:b', source: 's2', translation: 'm2', status: 'translated' },
  ]);
  state = PDF.applyPdfBlockEdit(state, 1, '1:1:b', 'kullanıcı düzeltmesi') ? state : state;
  // Yeniden çeviri aynı kimliklerle döner — düzeltme taşınmalı.
  state = PDF.recordPdfPageTranslation(state, 1, [
    { id: '1:0:a', source: 's1', translation: 'yeni1', status: 'translated' },
    { id: '1:1:b', source: 's2', translation: 'yeni2', status: 'translated' },
  ]);
  const block = state.pages['1'][1];
  assert.strictEqual(block.translation, 'yeni2');
  assert.strictEqual(block.userText, 'kullanıcı düzeltmesi');
  assert.strictEqual(block.edited, true);
});

test('applyPdfBlockEdit: düzeltme yazar, boş metin geri alır, bilinmeyen blok reddedilir', () => {
  let state = PDF.createPdfTranslationState({ pdfHash: 'h', targetLanguage: 'tr', model: 'm', endpoint: 'e' });
  state = PDF.recordPdfPageTranslation(state, 2, [
    { id: '2:0:a', source: 's', translation: 'm', status: 'translated' },
  ]);
  const edited = PDF.applyPdfBlockEdit(state, 2, '2:0:a', '  elle  yazılan  ');
  assert.strictEqual(edited.userText, 'elle yazılan');
  assert.strictEqual(edited.edited, true);
  assert.strictEqual(state.pages['2'][0].edited, true);
  const cleared = PDF.applyPdfBlockEdit(state, 2, '2:0:a', '');
  assert.ok(!('userText' in cleared) && !('edited' in cleared), 'düzeltme kaldırılmadı');
  assert.strictEqual(PDF.applyPdfBlockEdit(state, 2, 'yok', 'x'), null);
  assert.strictEqual(PDF.applyPdfBlockEdit(state, 9, '2:0:a', 'x'), null);
});

test('normalizePdfBlock: box koordinatları geçerli dörtlüyse korunur', () => {
  const state = PDF.createPdfTranslationState({ pdfHash: 'h', targetLanguage: 'tr', model: 'm', endpoint: 'e' });
  const next = PDF.recordPdfPageTranslation(state, 1, [
    { id: '1:0:a', source: 's', translation: 't', status: 'translated',
      box: { top: 700, bottom: 680, left: 50, right: 300 } },
    { id: '1:1:b', source: 's', translation: 't', status: 'translated',
      box: { top: 'x', bottom: 0, left: 0, right: 0 } },
  ]);
  assert.deepStrictEqual(next.pages['1'][0].box, { top: 700, bottom: 680, left: 50, right: 300 });
  assert.ok(!('box' in next.pages['1'][1]), 'bozuk box düşürülmedi');
});

// =========================================================================
// Madde 38 — parsePdfPageSelection + renderer ikizi aynı sözleşmeyi tutar
// =========================================================================

test('parsePdfPageSelection: aralık/tekil/boş/sıralama', () => {
  assert.deepStrictEqual(PDF.parsePdfPageSelection('1-4, 8, 12-14', 20).pages, [1, 2, 3, 4, 8, 12, 13, 14]);
  assert.deepStrictEqual(PDF.parsePdfPageSelection('5', 20).pages, [5]);
  assert.deepStrictEqual(PDF.parsePdfPageSelection('', 20), { pages: [], scope: 'all' });
  assert.deepStrictEqual(PDF.parsePdfPageSelection('3-1', 20), null);
  assert.deepStrictEqual(PDF.parsePdfPageSelection('0-3', 20), null);
  assert.deepStrictEqual(PDF.parsePdfPageSelection('18-30', 20), null);
  assert.deepStrictEqual(PDF.parsePdfPageSelection('abc', 20), null);
  assert.deepStrictEqual(PDF.parsePdfPageSelection('2,2,2', 20).pages, [2]);
});

test('renderer parsePdfPageSelectionInput ana sözleşmeyle birebir aynı davranır', () => {
  const m = HELPERS.match(/function parsePdfPageSelectionInput\(input, numPages\) \{[\s\S]*?\n\}/);
  assert.ok(m, 'renderer kopyası bulunamadı');
  const fn = vm.runInNewContext(`(${m[0].replace('parsePdfPageSelectionInput', 'parsePdfPageSelection')})`, {});
  for (const input of ['1-4, 8', '5', '', '3-1', '0-3', '18-30', 'abc', '2,2,2']) {
    // vm realm prototipi farklı — yapısal eşitlik yerine değer eşitliği karşılaştırılır.
    assert.deepStrictEqual(JSON.stringify(fn(input, 20)), JSON.stringify(PDF.parsePdfPageSelection(input, 20)), `uyumsuz: ${input}`);
  }
});

test('madde 38 — sayfa seçim diyaloğu üç kapsamı da sunar', () => {
  assert.ok(/id="pdfTranslateScope"/.test(HTML), 'Sayfa seç düğmesi yok');
  assert.ok(/value: 'range'/.test(HELPERS) && /value: 'failed'/.test(HELPERS) && /value: 'untranslated'/.test(HELPERS), 'kapsam seçenekleri eksik');
  assert.ok(/function pdfFailedPages/.test(HELPERS) && /function pdfUntranslatedPages/.test(HELPERS), 'kapsam yardımcıları eksik');
});

test('madde 38 — kapsam çevirisi sıralı sayfa listesiyle işler ve önizleme gösterir', () => {
  assert.ok(/translateVisiblePdfPagesNow\(reader, all, explicitPages/.test(RENDERER), 'explicitPages imzası yok');
  assert.ok(/sort\(\(a, b\) => a - b\)/.test(RENDERER), 'sayfa listesi sıralanmıyor');
  assert.ok(/Kapsam: \$\{pages\.length\} sayfa/.test(RENDERER), 'kapsam önizlemesi yok');
  assert.ok(/reader\.lastFailedPages/.test(RENDERER), 'başarısız sayfa kaydı yok');
});

// =========================================================================
// Madde 36 — çift görünüm karşılık vurgusu
// =========================================================================

test('madde 36 — pair tıklaması kaynak sayfada konum işareti çizer', () => {
  assert.ok(/function focusPdfCounterpart/.test(HELPERS), 'focusPdfCounterpart yok');
  assert.ok(/pdf-source-marker/.test(HELPERS), 'marker DOM yok');
  assert.ok(/\.pdf-source-marker/.test(CSS), 'marker CSS yok');
  assert.ok(/pair\.addEventListener\('click'/.test(HELPERS), 'tık dinleyicisi yok');
  assert.ok(/pair\.tabIndex = 0/.test(HELPERS), 'klavye odağı yok');
});

test('madde 36 — blok koordinatı extract→normalize→render zincirinde taşınır', () => {
  assert.ok(/top: Math\.max\(\.\.\.lines\.map/.test(HELPERS), 'extract box yok');
  assert.ok(/paragraph\.box \? \{ box: paragraph\.box \}/.test(MAIN), 'prepare box yok');
  assert.ok(/normalized\.box = \{/.test(fs.readFileSync('src/pdf-translate.js', 'utf8')), 'normalize box yok');
});

// =========================================================================
// Madde 37 — pdf:editBlock IPC + preload + düzenleme diyaloğu
// =========================================================================

test('pdf:editBlock kanalı yetki + userText yazımı uygular', () => {
  const m = MAIN.match(/ipcMain\.handle\('pdf:editBlock'[\s\S]*?\n\}\);/);
  assert.ok(m, 'pdf:editBlock handler yok');
  assert.ok(/authorizedBrowserSender/.test(m[0]), 'yetki kontrolü eksik');
  assert.ok(/applyPdfBlockEdit/.test(m[0]), 'applyPdfBlockEdit çağrılmıyor');
  assert.ok(/writePdfTranslationState/.test(m[0]), 'durum yazılmıyor');
  assert.ok(/editPdfBlock:/.test(PRELOAD), 'preload bağı yok');
  assert.ok(/pdf:editBlock/.test(PRELOAD), 'preload kanal adı yanlış');
});

test('madde 37 — düzenleme diyaloğu + düzeltme görsel işareti', () => {
  assert.ok(/function editPdfBlockPair/.test(HELPERS), 'editPdfBlockPair yok');
  assert.ok(/openAppDialog\(\{[\s\S]*?inputLabel/.test(HELPERS), 'input diyaloğu yok');
  assert.ok(/pdf-pair-edited/.test(CSS) && /pdf-pair-editnote/.test(CSS), 'edited CSS yok');
  assert.ok(/pdf-pair-ambiguous/.test(CSS) && /pdf-pair-ambiguous-note/.test(CSS), 'ambiguous CSS yok');
  assert.ok(/orderAmbiguous/.test(fs.readFileSync('src/pdf-translate.js', 'utf8')), 'orderAmbiguous üretimi yok');
});

// =========================================================================
// Madde 39 — manga OCR-kaynak düzeltmesi + tek bölge yeniden çevirisi
// =========================================================================

test('madde 39 — manga editörü kaynak metni düzenlenebilir + retranslate köprüsü', () => {
  assert.ok(/sourceArea = document\.createElement\('textarea'\)/.test(MANGA), 'kaynak textarea yok');
  assert.ok(/Kaynaktan yeniden çevir/.test(MANGA), 'retranslate düğmesi yok');
  assert.ok(/'manga-retranslate'/.test(MANGA), 'köprü mesajı gönderilmiyor');
  assert.ok(/dataset\.sourceEdited = 'true'/.test(MANGA), 'sourceEdited bayrağı set edilmiyor');
});

test('madde 39 — manga-retranslate köprüsü metin-yolu çeviri yapar', () => {
  assert.ok(/message\.type === 'manga-retranslate'\) void retranslateMangaRegionFromSource/.test(MAIN), 'köprü rotası yok');
  const m = MAIN.match(/async function retranslateMangaRegionFromSource[\s\S]*?\n\}/);
  assert.ok(m, 'retranslateMangaRegionFromSource yok');
  assert.ok(/requestBrowserSentenceTranslation/.test(m[0]), 'metin-yolu çeviri çağrılmıyor');
  assert.ok(/learnTerminology/.test(m[0]), 'terminoloji öğrenilmiyor');
  assert.ok(/browserMangaCache\(\)\.set/.test(m[0]), 'önbellek yazılmıyor');
});

// =========================================================================
// Madde 40 — kullanıcı düzeltmeleri korunur
// =========================================================================

test('madde 40 — normalizeMangaRegions düzeltme bayraklarını geçirir', () => {
  assert.ok(/sourceEdited === true \? \{ sourceEdited: true \}/.test(MANGA), 'sourceEdited passthrough yok');
  assert.ok(/edited === true \? \{ edited: true \}/.test(MANGA), 'edited passthrough yok');
  assert.ok(/dataset\.sourceEdited = item\.sourceEdited/.test(MANGA), 'dataset bayrağı yok');
});

test('madde 40 — mangaRegionsStateScript kaynak + bayrakları döndürür', () => {
  const m = MANGA.match(/function mangaRegionsStateScript[\s\S]*?\}\)\(\)`;\n\}/);
  assert.ok(m, 'stateScript bulunamadı');
  assert.ok(/source: region\.dataset\.source/.test(m[0]), 'source dönmüyor');
  assert.ok(/sourceEdited: region\.dataset\.sourceEdited === 'true'/.test(m[0]), 'sourceEdited dönmüyor');
});

test('madde 40 — applyMangaEditFromPage kaynak düzeltmesini saklar', () => {
  const m = MAIN.match(/function applyMangaEditFromPage[\s\S]*?\n\}/);
  assert.ok(m, 'applyMangaEditFromPage bulunamadı');
  assert.ok(/next\.source = payload\.source/.test(m[0]), 'kaynak saklanmıyor');
  assert.ok(/next\.sourceEdited = true/.test(m[0]), 'sourceEdited saklanmıyor');
});

test('madde 40 — retry merged\'da düzeltmeler korunur + sourceEdited metin-yolu', () => {
  const m = MAIN.match(/const merged = page\.regions\.map[\s\S]*?page\.regions = decorateMangaRegionColors/);
  assert.ok(m, 'merged bloğu bulunamadı');
  assert.ok(/local\.sourceEdited === true \? \{ sourceEdited: true \}/.test(m[0]), 'merged sourceEdited korumuyor');
  assert.ok(/local\.edited === true \? \{ edited: true \}/.test(m[0]), 'merged edited korumuyor');
  assert.ok(/selectedLocal\?\.sourceEdited === true && selectedLocal\?\.source/.test(m[0]), 'sourceEdited dalı yok');
  assert.ok(/requestBrowserSentenceTranslation\(\s*String\(selectedLocal\.source\)/.test(m[0]), 'metin-yolu çağrı yok');
});

console.log(`\n${passed} kontrol tamamlandı.`);
