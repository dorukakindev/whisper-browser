const assert = require('assert');
const { createNdjsonLineBuffer } = require('../src/ndjson-lines');

let pass = 0;
function test(name, fn) {
  try { fn(); pass++; console.log(`  PASS  ${name}`); }
  catch (error) { console.error(`  FAIL  ${name} — ${error.message}`); process.exitCode = 1; }
}

test('parçalı NDJSON satırlarını eksiksiz birleştirir', () => {
  const parser = createNdjsonLineBuffer();
  assert.deepEqual(parser.push('{"type":"pro'), []);
  assert.deepEqual(parser.push('gress","percent":50}\n{"type":"done"}\n'), [
    '{"type":"progress","percent":50}',
    '{"type":"done"}',
  ]);
});

test('1 MB üzerindeki geçerli olayı kesmeden geçirir', () => {
  const payload = JSON.stringify({ type: 'translation_refresh', text: 'x'.repeat(1_500_000) });
  const parser = createNdjsonLineBuffer();
  assert.deepEqual(parser.push(payload.slice(0, 700_000)), []);
  const lines = parser.push(payload.slice(700_000) + '\n');
  assert.equal(lines.length, 1);
  assert.equal(JSON.parse(lines[0]).text.length, 1_500_000);
});

test('sınırı aşan satırı görünür biçimde reddedip sonraki olaya toparlanır', () => {
  const overflows = [];
  const parser = createNdjsonLineBuffer({ maxLineChars: 1024, onOverflow: (n) => overflows.push(n) });
  assert.deepEqual(parser.push('x'.repeat(1100)), []);
  assert.deepEqual(parser.push('devam\n{"type":"done"}\n'), ['{"type":"done"}']);
  assert.equal(overflows.length, 1);
});

test('newline olmadan kapanan son geçerli olayı flush eder', () => {
  const parser = createNdjsonLineBuffer();
  parser.push('{"type":"done"}');
  assert.deepEqual(parser.flush(), ['{"type":"done"}']);
});

if (!process.exitCode) console.log(`\n${pass} NDJSON tampon testi geçti.`);
