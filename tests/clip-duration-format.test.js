'use strict';
// R389: formatClipDur yuvarlama taşması kilidi — Math.round(sec % 60) = 60
// durumunda "1 dk 60 sn" gibi saçma çıktı veriyordu (B-389-01).
// Fonksiyon renderer-helpers.js'ten kesilip çalıştırılır — metin kilidi değil.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const helpers = fs.readFileSync(path.join(__dirname, '../src/renderer/renderer-helpers.js'), 'utf8');
const start = helpers.indexOf('function formatClipDur(');
const end = helpers.indexOf('function updateClipHint(', start);
assert(start >= 0 && end > start, 'formatClipDur kesiti bulunamadı');
const formatClipDur = vm.runInNewContext(
  `${helpers.slice(start, end)}; formatClipDur;`, {});

let pass = 0;
function test(name, fn) {
  try { fn(); pass++; console.log(`  PASS  ${name}`); }
  catch (error) { console.error(`  FAIL  ${name} — ${error.message}`); process.exitCode = 1; }
}

test('dakika/saniye normal değerler', () => {
  assert.equal(formatClipDur(0), '0 sn');
  assert.equal(formatClipDur(45), '45 sn');
  assert.equal(formatClipDur(90), '1 dk 30 sn');
  assert.equal(formatClipDur(600), '10 dk 0 sn');
});

test('saniye 60\'a yuvarlanınca elde dakikaya taşınır', () => {
  assert.equal(formatClipDur(59.9), '1 dk 0 sn');
  assert.equal(formatClipDur(119.9), '2 dk 0 sn');
  assert.equal(formatClipDur(3599.9), '60 dk 0 sn');
});

test('taşma olmayan ondalıklar dokunulmaz', () => {
  assert.equal(formatClipDur(59.4), '59 sn');
  assert.equal(formatClipDur(90.4), '1 dk 30 sn');
});

console.log(`clip-duration-format: ${pass} test geçti`);
