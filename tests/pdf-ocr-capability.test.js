// Kuyruk-50 madde 37 — yerel OCR yetenek yönetimi kilidi.
// Sözleşme: metin katmanı olan sayfalar OCR'dan geçirilmez; görüntü tabanlı
// sayfada motor yokluğu, dil paketi ve düşük güven durumları açık raporlanır.
// backend ocr_status sözleşmesi, ocr_frame kutu çıktısı, IPC kanal yüzeyi ve
// ocrLinesToBlocks okuma sırası/gruplaması kaynak-slice ile doğrulanır.
'use strict';

const assert = require('assert');
const fs = require('fs');
const vm = require('vm');

const PY = fs.readFileSync('backend/browser_media_tools.py', 'utf8');
const MAIN = fs.readFileSync('src/main.js', 'utf8');
const PRELOAD = fs.readFileSync('src/preload.js', 'utf8');
const HELPERS = fs.readFileSync('src/renderer/renderer-helpers.js', 'utf8');
const RENDERER = fs.readFileSync('src/renderer/renderer.js', 'utf8');
const CSS = fs.readFileSync('src/renderer/styles.css', 'utf8');

let passed = 0;
function test(name, fn) {
  try { fn(); passed += 1; console.log(`  PASS  ${name}`); }
  catch (e) { console.error(`  FAIL  ${name}: ${e.message}`); process.exitCode = 1; }
}

// =========================================================================
// backend ocr_status — motor yokluğu ve dil paketi açık raporlanır
// =========================================================================

test('ocr_status tanımlı ve dispatch\'e bağlı', () => {
  assert.ok(/def ocr_status\(/.test(PY), 'ocr_status fonksiyonu yok');
  assert.ok(/operation == "ocrStatus"/.test(PY), 'ocrStatus dispatch dalı yok');
});

test('ocr_status yokluk raporu: available:false + kurulum rehberi', () => {
  const m = PY.match(/def ocr_status\([\s\S]*?\n\n/);
  assert.ok(m, 'ocr_status gövdesi bulunamadı');
  assert.ok(/"available": False/.test(m[0]), 'unavailable dalı yok');
  assert.ok(/requirements-browser-tools\.txt/.test(m[0]), 'kurulum rehberi eksik');
  assert.ok(/"languages"/.test(m[0]), 'dil paketi listesi yok');
});

test('ocr_status başarı raporu: engine + languages + languageNote', () => {
  assert.ok(/"engine": "RapidOCR/.test(PY), 'engine alanı yok');
  assert.ok(/"languageNote"/.test(PY), 'languageNote alanı yok');
});

test('ocr_frame kutu koordinatlarını döndürür (okuma sırası için)', () => {
  const m = PY.match(/def ocr_frame\([\s\S]*?return \{[^}]*"lines": lines\}/);
  assert.ok(m, 'ocr_frame gövdesi bulunamadı');
  assert.ok(/"box"/.test(m[0]), 'box çıktısı yok');
  assert.ok(/"left".*"top".*"right".*"bottom"/s.test(m[0]), 'box sözlüğü eksik');
});

// =========================================================================
// IPC yüzeyi — ocr:status + ocr:frame yetkili gönderici kapısı
// =========================================================================

test("main.js 'ocr:status' + 'ocr:frame' authorizedBrowserSender kapılı", () => {
  for (const channel of ["ocr:status", "ocr:frame"]) {
    const m = MAIN.match(new RegExp(`ipcMain\\.handle\\('${channel}'[\\s\\S]*?\\}\\);`));
    assert.ok(m, `${channel} handler yok`);
    assert.ok(/authorizedBrowserSender/.test(m[0]), `${channel} yetki kapısı yok`);
  }
});

test('ocr:status sonucu önbelleğe alınır; refresh ile yenilenir', () => {
  const m = MAIN.match(/ipcMain\.handle\('ocr:status'[\s\S]*?\}\);/);
  assert.ok(m, 'handler yok');
  assert.ok(/ocrStatusCache/.test(m[0]), 'önbellek yok');
  assert.ok(/payload\.refresh !== true/.test(m[0]), 'refresh baypas yok');
});

test('preload ocrStatus + ocrFrame köprüler', () => {
  assert.ok(/ocrStatus:\s*\(/.test(PRELOAD), 'ocrStatus preload yok');
  assert.ok(/ocrFrame:\s*\(/.test(PRELOAD), 'ocrFrame preload yok');
});

// =========================================================================
// extractPdfReaderPage — metin katmanı olan sayfa OCR'dan geçmez
// =========================================================================

test('OCR yalnız metin katmanı boşken çalışır (items.length kapısı)', () => {
  const m = HELPERS.match(/async function extractPdfReaderPage[\s\S]*?^}/m);
  assert.ok(m, 'extractPdfReaderPage bulunamadı');
  const gate = m[0].match(/if \(!items\.length\) \{[\s\S]*?ocrPdfPage\(/);
  assert.ok(gate, 'items boşken OCR kapısı yok — metin katmanlı sayfa OCR\'a girebilir');
});

test('OCR sonucu entry.ocr ile sayfa kaydına işlenir', () => {
  const m = HELPERS.match(/async function extractPdfReaderPage[\s\S]*?^}/m);
  assert.ok(/ocr,\s*article: null/.test(m[0]), 'ocr alanı entry\'ye yazılmıyor');
});

test('ocrPdfPage önce yetenek durumunu sorgular', () => {
  const m = HELPERS.match(/async function ocrPdfPage[\s\S]*?^}/m);
  assert.ok(m, 'ocrPdfPage bulunamadı');
  assert.ok(m[0].indexOf('ocrStatus') < m[0].indexOf('ocrFrame'), 'status sorgusu frame\'den önce değil');
  assert.ok(/!status\?\.available/.test(m[0]), 'unavailable kısa devresi yok');
});

test('ocrPdfPage render tuvalini 2048px ile sınırlar (bellek)', () => {
  const m = HELPERS.match(/async function ocrPdfPage[\s\S]*?^}/m);
  assert.ok(/2048/.test(m[0]), 'tuval piksel sınırı yok');
});

test('renderPdfReaderPage ocr rozeti bağlı', () => {
  assert.ok(/renderPdfOcrNote\(pageNumber, entry\)/.test(RENDERER), 'renderPdfReaderPage rozeti çağırmıyor');
});

// =========================================================================
// ocrLinesToBlocks — okuma sırası + paragraf gruplama
// =========================================================================

function loadOcrLinesToBlocks() {
  const m = HELPERS.match(/function ocrLinesToBlocks\(lines, pageNumber\) \{[\s\S]*?\n\}/);
  assert.ok(m, 'ocrLinesToBlocks bulunamadı');
  const sandbox = {};
  vm.createContext(sandbox);
  vm.runInContext(m[0], sandbox);
  return sandbox.ocrLinesToBlocks;
}
const ocrLinesToBlocks = loadOcrLinesToBlocks();
const box = (top, left, bottom, right) => ({ left, top, right, bottom });
const line = (text, top, left = 0, h = 10, score = 0.9) => ({ text, score, box: box(top, left, top + h, left + 100) });

test('okuma sırası: yukarıdan aşağı, soldan sağa sıralanır', () => {
  const blocks = ocrLinesToBlocks([line('üçüncü', 30), line('birinci', 0), line('ikinci', 15)], 1);
  assert.equal(blocks.length, 1, 'aynı paragraf grubu bekleniyor');
  assert.equal(blocks[0].source, 'birinci ikinci üçüncü');
});

test('büyük dikey aralık yeni paragraf başlatır', () => {
  const blocks = ocrLinesToBlocks([line('a', 0), line('b', 12), line('c', 100)], 1);
  assert.equal(blocks.length, 2);
  assert.equal(blocks[0].source, 'a b');
  assert.equal(blocks[1].source, 'c');
});

test('blok kimlikleri deterministic: sayfa:ocr:sıra', () => {
  const blocks = ocrLinesToBlocks([line('x', 0), line('y', 100)], 7);
  assert.equal(blocks[0].id, '7:ocr:0');
  assert.equal(blocks[1].id, '7:ocr:1');
});

test('blok skoru satır skorlarının ortalaması', () => {
  const blocks = ocrLinesToBlocks([line('a', 0, 0, 10, 0.8), line('b', 12, 0, 10, 1.0)], 1);
  assert.ok(Math.abs(blocks[0].score - 0.9) < 1e-9, `score ${blocks[0].score}`);
});

test('boş girdi boş blok listesi', () => {
  assert.deepEqual(ocrLinesToBlocks([], 1), []);
});

// =========================================================================
// renderPdfOcrNote — dört durum rozeti
// =========================================================================

test('renderPdfOcrNote dört durumu da karşılar', () => {
  const m = HELPERS.match(/function renderPdfOcrNote[\s\S]*?^}/m);
  assert.ok(m, 'renderPdfOcrNote bulunamadı');
  assert.ok(/ocr\.unavailable/.test(m[0]), 'motor yokluğu durumu yok');
  assert.ok(/ocr\.failed/.test(m[0]), 'OCR hata durumu yok');
  assert.ok(/ocr\.lowConfidence/.test(m[0]), 'düşük güven durumu yok');
  assert.ok(/languageNote/.test(m[0]), 'dil paketi notu yüzeye çıkmıyor');
});

test('rozet stilleri tanımlı', () => {
  assert.ok(/\.pdf-ocr-note/.test(CSS), '.pdf-ocr-note stili yok');
  assert.ok(/\.pdf-ocr-warn/.test(CSS), '.pdf-ocr-warn stili yok');
});

// =========================================================================
// browser-media-tools.js ocrStatus sarmalayıcısı
// =========================================================================

test('browser-media-tools.ocrStatus python ocrStatus operasyonunu çağırır', () => {
  const src = fs.readFileSync('src/browser-media-tools.js', 'utf8');
  const m = src.match(/ocrStatus\(\{[\s\S]*?return python\('ocrStatus'/);
  assert.ok(m, 'ocrStatus sarmalayıcısı yok veya yanlış operasyon');
});

console.log(`\npdf-ocr-capability: ${passed} senaryo geçti`);
