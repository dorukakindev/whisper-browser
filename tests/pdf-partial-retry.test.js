// Kuyruk-g17 — PDF kısmi hata: iptal/yeniden denemede tamamlanan sayfaların
// korunması. pendingPdfPages davranış kilidi + pdf:translatePages kaynak
// değişmezleri (retry tamamlanmış sayfayı atlar, iptal yarım sayfayı yazmaz).
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const mainSource = fs.readFileSync(path.join(root, 'src/main.js'), 'utf8');
const {
  createPdfTranslationState,
  isPdfPageComplete,
  pendingPdfPages,
  recordPdfPageTranslation,
  translatedPdfPages,
} = require('../src/pdf-translate');

let passed = 0;
function test(name, fn) {
  try { fn(); passed++; }
  catch (error) { error.message = `${name}: ${error.message}`; throw error; }
}

const identity = { pdfHash: 'h1', targetLanguage: 'tr', model: 'm', endpoint: 'e' };

test('pendingPdfPages tamamlanmamış sayfayı döndürür, tamamlananı atlar', () => {
  let state = createPdfTranslationState(identity);
  state = recordPdfPageTranslation(state, 1, [
    { id: 'b1', source: 'a', translation: 'çeviri', status: 'translated' },
  ]);
  state = recordPdfPageTranslation(state, 2, [
    { id: 'b2', source: 'b', translation: '', status: 'failed', error: 'timeout' },
  ]);
  assert.deepStrictEqual(pendingPdfPages([1, 2, 3], state), [2, 3]);
  assert.deepStrictEqual(translatedPdfPages(state), [1]);
  assert.strictEqual(isPdfPageComplete(state.pages['1']), true);
  assert.strictEqual(isPdfPageComplete(state.pages['2']), false);
});

test('başarısız sayfa yeniden denenince yeni sonuç eski kaydı ezer', () => {
  let state = createPdfTranslationState(identity);
  state = recordPdfPageTranslation(state, 2, [
    { id: 'b2', source: 'b', translation: '', status: 'failed', error: 'timeout' },
  ]);
  state = recordPdfPageTranslation(state, 2, [
    { id: 'b2', source: 'b', translation: 'şimdi oldu', status: 'translated' },
  ]);
  assert.strictEqual(state.pages['2'][0].status, 'translated');
  assert.deepStrictEqual(pendingPdfPages([2], state), []);
});

test('skipped blok da sayfayı tamamlanmış sayar; karışık sayfa bekler', () => {
  let state = createPdfTranslationState(identity);
  state = recordPdfPageTranslation(state, 1, [
    { id: 'a', source: 'x', translation: 'y', status: 'translated' },
    { id: 'b', source: '', translation: '', status: 'skipped' },
  ]);
  assert.strictEqual(isPdfPageComplete(state.pages['1']), true);
  state = recordPdfPageTranslation(state, 3, [
    { id: 'c', source: 'x', translation: 'y', status: 'translated' },
    { id: 'd', source: 'z', translation: '', status: 'failed' },
  ]);
  assert.strictEqual(isPdfPageComplete(state.pages['3']), false);
  assert.deepStrictEqual(pendingPdfPages([1, 3], state), [3]);
});

test('istek listesi temizlenir: geçersiz sayfa numaraları atılır, tekrar tekilleşir', () => {
  assert.deepStrictEqual(pendingPdfPages([0, -1, 2.5, 'x', 2, 2, 3], null), [2, 3]);
});

test('pdf:translatePages pendingPdfPages ile tamamlanan sayfayı atlar', () => {
  assert.match(mainSource, /const todo = new Set\(pendingPdfPages\(pages\.map/);
  // Madde 38 — havuz: bekleyen liste tek seferde süzülür, işçi imleçle alır.
  assert.match(mainSource, /const pending = pages\.filter\(\(page\) => todo\.has\(page\.pageNumber\)\);/);
});

test('sayfalar sınırlı paralellikte işler: işçi havuzu ≤2, durum tek zincirde', () => {
  const handler = mainSource.slice(
    mainSource.indexOf("ipcMain.handle('pdf:translatePages'"),
    mainSource.indexOf("ipcMain.handle('pdf:cancel'"));
  assert.match(handler, /length: Math\.min\(2, pending\.length\)/);
  assert.ok(handler.indexOf('translatePdfPageBlocks') > 0, 'işçi sayfa bloklarını hesaplar');
  assert.ok(handler.indexOf('recordPdfPageTranslation(state, page.pageNumber, pageBlocks)') > 0,
    'durum yazımı havuz içinde seri kalmalı');
});

test('iptal paket-içi sayfa yazımından önce durur (yarım sayfa diske düşmez)', () => {
  // Abort kontrolü blok hesaplayıcıda, kayıt havuzun seri yazımında — iki
  // dilimi ayrı ayrı doğrula: kayıt yalnız hesaplayıcı döndükten sonra gelir.
  const body = mainSource.slice(
    mainSource.indexOf('async function translatePdfPageBlocks'),
    mainSource.indexOf('function mangaJobIsCurrent'));
  const abortIdx = body.indexOf("throw new Error('PDF çevirisi iptal edildi.')");
  const returnIdx = body.indexOf('return { pageNumber, pageBlocks }');
  assert.ok(abortIdx > 0 && returnIdx > abortIdx, 'iptal kontrolü blok dönüşünden önce olmalı');
});

test('iptal eden iş döngüde de erken durur (işçi başı abort kontrolü)', () => {
  const handler = mainSource.slice(
    mainSource.indexOf("ipcMain.handle('pdf:translatePages'"),
    mainSource.indexOf("ipcMain.handle('pdf:cancel'"));
  const workerIdx = handler.indexOf('while (true)');
  const abortIdx = handler.indexOf('job.controller.signal.aborted', workerIdx);
  assert.ok(workerIdx > 0 && abortIdx > workerIdx, 'işçi döngüsünde abort kontrolü olmalı');
  const cursorIdx = handler.indexOf('pending[cursor++]');
  assert.ok(cursorIdx > abortIdx, 'abort kontrolü sayfa alımından önce olmalı');
});

console.log(`PASS ${passed}/8`);
