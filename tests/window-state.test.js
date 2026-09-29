'use strict';
/**
 * Çok-ekran pencere durumu sözleşmesi (src/window-state.js).
 *
 * Kilitlenen politika: pozisyon ASLA saklanmaz/geri yüklenmez (monitör
 * kopması/ekran-dışı pencere riski); yalnız boyut + maximized. Kayıtlı
 * boyut birincil ekran workArea'ya kelepçelenir; bozuk JSON değerleri
 * (tip-bozuk, eksik, devasa, negatif) güvenli varsayılana düşer.
 */
const assert = require('node:assert/strict');
const {
  MIN_WIDTH, MIN_HEIGHT, DEFAULT_WIDTH, DEFAULT_HEIGHT,
  clampedWindowSize, windowStateForDisk,
} = require('../src/window-state');

let passed = 0;
function test(name, fn) {
  try { fn(); passed += 1; console.log(`  PASS ${name}`); }
  catch (e) { console.log(`  FAIL ${name}: ${e.message}`); process.exitCode = 1; }
}

const WORK = { width: 1920, height: 1080 };

// --- Bozuk/tip-dışı kayıtlar varsayılana düşer ---
for (const [label, st] of [
  ['null', null], ['undefined', undefined], ['sayı', 5], ['dizgi', 'x'],
  ['dizi', [2000, 1200]], ['boolean', true],
  ['NaN genişlik', { width: NaN, height: NaN }],
  ['negatif', { width: -500, height: -100 }],
  ['sıfır', { width: 0, height: 0 }],
  ['minimum altı', { width: MIN_WIDTH - 1, height: MIN_HEIGHT - 1 }],
  ['eksik anahtar', {}],
  ['Infinity', { width: Infinity, height: Infinity }],
]) {
  test(`bozuk kayıt ${label} → varsayılan kelepçe`, () => {
    const out = clampedWindowSize(st, WORK);
    assert.equal(out.width, DEFAULT_WIDTH);
    assert.equal(out.height, DEFAULT_HEIGHT);
  });
}

// --- Monitör kopması: kayıtlı büyük boyut küçük ekrana kelepçelenir ---
test('2560x1440 kayıt + 1366x768 ekran → ekrana kelepçelenir', () => {
  const out = clampedWindowSize({ width: 2560, height: 1440 }, { width: 1366, height: 768 });
  assert.deepEqual(out, { width: 1366, height: 768 });
});

test('devasa kayıt (99k) ekran boyutuna kelepçelenir', () => {
  const out = clampedWindowSize({ width: 99999, height: 99999 }, WORK);
  assert.deepEqual(out, { width: 1920, height: 1080 });
});

// --- Geçerli kayıt korunur ---
test('geçerli 1400x900 kayıt korunur', () => {
  assert.deepEqual(clampedWindowSize({ width: 1400, height: 900 }, WORK),
    { width: 1400, height: 900 });
});

test('minimum sınır değerleri korunur', () => {
  assert.deepEqual(
    clampedWindowSize({ width: MIN_WIDTH, height: MIN_HEIGHT }, WORK),
    { width: MIN_WIDTH, height: MIN_HEIGHT });
});

test('float kayıt tabana yuvarlanır', () => {
  assert.deepEqual(clampedWindowSize({ width: 1200.9, height: 800.4 }, WORK),
    { width: 1200, height: 800 });
});

// --- Bağımsız boyutlar: biri bozuk diğeri geçerli ---
test('genişlik bozuk + yükseklik geçerli → karışık sonuç', () => {
  const out = clampedWindowSize({ width: 'abc', height: 900 }, WORK);
  assert.equal(out.width, DEFAULT_WIDTH);
  assert.equal(out.height, 900);
});

// --- Bozuk workArea da ezmez ---
test('bozuk workArea → pozitif boyut döner', () => {
  const out = clampedWindowSize({ width: 1400, height: 900 }, { width: 0, height: 0 });
  assert.ok(out.width > 0 && out.height > 0);
});

// --- disk-yazım sözleşmesi: pozisyon ASLA saklanmaz ---
test('windowStateForDisk x/y saklamaz (ekran-dışı riski kilitli)', () => {
  const out = windowStateForDisk({ x: 5000, y: -300, width: 1600, height: 900 }, true);
  assert.equal('x' in out, false);
  assert.equal('y' in out, false);
  assert.deepEqual(out, { width: 1600, height: 900, maximized: true });
});

test('windowStateForDisk bozuk bounds → güvenli varsayılan', () => {
  assert.deepEqual(windowStateForDisk({ width: -1, height: 0 }, false),
    { width: DEFAULT_WIDTH, height: DEFAULT_HEIGHT, maximized: false });
  assert.deepEqual(windowStateForDisk(null, 'evet'),
    { width: DEFAULT_WIDTH, height: DEFAULT_HEIGHT, maximized: true });
});

console.log(`${passed} kontrol geçti`);
if (process.exitCode) process.exit(process.exitCode);
