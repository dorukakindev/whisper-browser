const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { createNdjsonLineBuffer, parseNdjsonLine } = require('../src/ndjson-lines');

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

test('tek karakterlik parçalar Türkçe, CJK, Tayca ve emoji içeriğini bozmaz', () => {
  const records = [
    { type: 'log', text: 'İşlem sürüyor 🙂' },
    { type: 'segment', text: 'こんにちは世界' },
    { type: 'segment', text: 'สวัสดีโลก' },
  ];
  const stream = records.map((row) => JSON.stringify(row)).join('\r\n') + '\r\n';
  const parser = createNdjsonLineBuffer();
  const lines = [];
  for (const char of stream) lines.push(...parser.push(char));
  lines.push(...parser.flush());
  assert.deepEqual(lines.map((line) => JSON.parse(line)), records);
});

test('bozuk ve boş satırlar tamponu sonraki geçerli IPC olayından koparmaz', () => {
  const parser = createNdjsonLineBuffer();
  const lines = parser.push('\n{bozuk}\n\n{"type":"done","ok":true}\n');
  const parsed = lines.map((line) => {
    try { return JSON.parse(line); } catch (_) { return null; }
  }).filter(Boolean);
  assert.deepEqual(parsed, [{ type: 'done', ok: true }]);
});

test('parseNdjsonLine temiz JSON satırını döndürür', () => {
  assert.deepEqual(parseNdjsonLine('{"type":"done","ok":true}'), { type: 'done', ok: true });
});

test('parseNdjsonLine yt-dlp ilerleme metni öncesinde yapışan olayı kurtarır', () => {
  const glued = '[download]    416.00B at  Unknown B/s (00:00:00){"type":"subs","path":"/tmp/x.en.srt"}';
  assert.deepEqual(parseNdjsonLine(glued), { type: 'subs', path: '/tmp/x.en.srt' });
});

test('parseNdjsonLine sonda kalan ilerleme metnini de eler', () => {
  const glued = '{"type":"downloaded","path":"/tmp/v.mp4"} [download] 100%';
  assert.deepEqual(parseNdjsonLine(glued), { type: 'downloaded', path: '/tmp/v.mp4' });
});

test('parseNdjsonLine JSON olmayan ve boş satırlarda null döner', () => {
  for (const bad of ['', '   ', 'plain text', '[download] 50%', '{bozuk}', '123', 'null']) {
    assert.equal(parseNdjsonLine(bad), null, `reddedilmeli: ${JSON.stringify(bad)}`);
  }
});

test('parseNdjsonLine aynı satıra yapışan ÇİFT olaydan ilkini kurtarmaz — sözleşme notu', () => {
  // İki JSON olayının aynı satıra yapışması gerçek senaryoda görülmedi;
  // kurtarma yolu ilk '{' .. son '}' arasını alır, parse başarısızsa null döner.
  assert.equal(parseNdjsonLine('{"a":1}{"b":2}'), null);
});

test('sözleşme: tüm yardımcı-süreç stdout tüketicileri parseNdjsonLine kullanır', () => {
  const main = fs.readFileSync(path.join(__dirname, '..', 'src', 'main.js'), 'utf8');
  // NDJSON akışı okuyan hiçbir yerde ham JSON.parse(line) kalmasın —
  // yapışan ilerleme metni olayı düşürür (R271 gerçek bug).
  assert(!/JSON\.parse\(line\)/.test(main), 'main.js içinde ham JSON.parse(line) kaldı');
  const required = [
    "ev = parseNdjsonLine(line)",            // media/youtube/invidious
    "event = parseNdjsonLine(line)",         // live-asr
    "const _parsed = parseNdjsonLine(line)", // transcribe
    "parsed = parseNdjsonLine(line)",        // model benchmark
    "result = parseNdjsonLine(line)",        // yt-dlp güncelleyici
  ];
  for (const needle of required) {
    assert(main.includes(needle), `main.js eksik: ${needle}`);
  }
});

test('sözleşme: yt-dlp ilerleme çıktısı backend tarafında da susturulmuş', () => {
  for (const f of ['media.py', 'transcribe.py']) {
    const src = fs.readFileSync(path.join(__dirname, '..', 'backend', f), 'utf8');
    assert(src.includes('"noprogress": True'), `${f} noprogress ayarlamamış`);
  }
});

if (!process.exitCode) console.log(`\n${pass} NDJSON tampon testi geçti.`);
