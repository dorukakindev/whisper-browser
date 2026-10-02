// 50-kuyruk b2 (madde 6–10) — zamanlama masası saf yardımcı kilitleri.
// Kapsam: sorun taraması (boş/kısa/çakışma/CPS/satır), CPS şerit kesri,
// kurtarma kaydı taban imzası kararlılığı ve bozuk girdi dayanıklılığı.

'use strict';

const assert = require('assert');
const scan_ = require('../src/renderer/timeline-issue-scan');

let passed = 0;
function test(name, fn) {
  try { fn(); passed += 1; console.log(`  PASS  ${name}`); }
  catch (e) { console.error(`  FAIL  ${name}: ${e.message}`); process.exitCode = 1; }
}

const cue = (start, end, text) => ({ start, end, text });

test('temiz dizi → sorun yok', () => {
  const cues = [cue(0, 3, 'Selam dünya'), cue(4, 7, 'İkinci satır')];
  assert.deepEqual(scan_.scan(cues, { cpsLimit: 20, lineLimit: 80 }), []);
});

test('boş metin + kısa süre + çakışma + hızlı + satır ayrımı', () => {
  const cues = [
    cue(0, 5, ''),                       // empty
    cue(6, 6.5, 'kısa'),                 // dur<1 → short (4 cps, fast değil)
    cue(7, 8, 'x'.repeat(25)),           // 25 cps → fast
    cue(8.5, 20, 'a\nb\nc\nd'),          // 4 satır → lines
    cue(19.9, 25, 'üst üste'),           // prev.end(20) > 19.9 → overlap
    cue(26, 30, 'normal'),
  ];
  const kinds = scan_.scan(cues, { cpsLimit: 20, lineLimit: 80 }).map((x) => x.kind).sort();
  assert.deepEqual(kinds, ['empty', 'fast', 'lines', 'overlap', 'short'].sort());
  // Türü birleşimi de doğrulanır: tek cue birden çok tür üretebilir.
  const multi = scan_.scan([cue(0, .5, 'x'.repeat(30))], { cpsLimit: 20 });
  assert.deepEqual(multi.map((x) => x.kind).sort(), ['fast', 'short'].sort());
});

test('çakışma bir sonraki bloğa yazılır', () => {
  const cues = [cue(0, 5, 'a'), cue(4.9, 7, 'b')];
  const out = scan_.scan(cues, {});
  assert.equal(out.length, 1);
  assert.equal(out[0].i, 1);
  assert.equal(out[0].kind, 'overlap');
});

test('1s eşiği: 0.999 kısa, 1.0 değil', () => {
  assert.equal(scan_.scan([cue(0, .999, 'x')], {}).length, 1);
  assert.equal(scan_.scan([cue(0, 1, 'x')], {}).length, 0);
});

test('satır genişliği: lineLimit aşımı işaretlenir', () => {
  assert.equal(scan_.scan([cue(0, 5, 'x'.repeat(81))], { lineLimit: 80, cpsLimit: 9999 }).length, 1);
  assert.equal(scan_.scan([cue(0, 5, 'x'.repeat(80))], { lineLimit: 80, cpsLimit: 9999 }).length, 0);
});

test('cpsTier: 0 taban, 1 tavan', () => {
  assert.equal(scan_.cpsTier(cue(0, 10, ''), 20), 0);
  assert.equal(scan_.cpsTier(cue(0, 1, 'x'.repeat(1000)), 20), 1);
  // limit üzeri ama tavan altı: 20 cps limit, 24 cps → 24/(20*1.6)=.75
  assert.ok(Math.abs(scan_.cpsTier(cue(0, 1, 'x'.repeat(24)), 20) - .75) < .001);
});

test('sıfır/negatif süre patlamaz', () => {
  const out = scan_.scan([cue(5, 5, 'x'), cue(9, 2, 'y'.repeat(300))], { cpsLimit: 20 });
  assert.ok(out.length >= 1); // short + fast beklenir; NaN/∞ üretmez
});

test('cueSignature: aynı küme aynı imza, zamanlama farkı imzayı değiştirir', () => {
  const a = [cue(0, 1, 'a'), cue(2, 3, 'b')];
  const b = [cue(0, 1, 'a'), cue(2, 3, 'b')];
  const c = [cue(0, 1.001, 'a'), cue(2, 3, 'b')];
  assert.equal(scan_.cueSignature(a), scan_.cueSignature(b));
  assert.notEqual(scan_.cueSignature(a), scan_.cueSignature(c));
  // metin uzunluğu yalnız ilk/son cue'a bakar — içerik değişimi imzayı bozabilir
  const d = [cue(0, 1, 'a'), cue(2, 3, 'cc')];
  assert.notEqual(scan_.cueSignature(a), scan_.cueSignature(d));
});

test('bozuk girdi: null/eksik alanlar çökmeden taranır', () => {
  const out = scan_.scan([null, { text: 'x' }, { start: 'NaN-ish', end: 2, text: 'y' }], {});
  assert.ok(Array.isArray(out));
  assert.equal(scan_.cueSignature(undefined), '#0#0#0');
  assert.equal(scan_.cueSignature(null), '#0#0#0');
});

console.log(`timeline-issue-scan: ${passed} kontrol geçti`);
