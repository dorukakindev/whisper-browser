// R323-6 — NDJSON olay-akışı fuzz'ı (50'lik gece kuyruğu).
// Hedefler: createNdjsonLineBuffer (chunk sınırı/UTF-8/overflow invariants)
// + parseNdjsonLine (önek/sonek yapışması kurtarma sözleşmesi, R271 devamı).
// Oracle'lar bağımsız: satır geri-üretimi, olay roundtrip'i, düşme sayımı.
'use strict';

const assert = require('assert');
const { createNdjsonLineBuffer, parseNdjsonLine } = require('../src/ndjson-lines');

let passed = 0;
function test(name, fn) {
  try { fn(); passed += 1; console.log(`  PASS  ${name}`); }
  catch (e) { console.error(`  FAIL  ${name}: ${e.message}`); process.exitCode = 1; }
}
function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const EV = (i, extra) => JSON.stringify({ type: 'segment', i, ...extra });

// =========================================================================
// Bölüm A — chunk sınırı oracle'ı: rastgele bölme asla satır kaybetmez/eklemez
// =========================================================================

test('rastgele chunk bölme: satır seti ham metnin split ile birebir aynı', () => {
  const rnd = mulberry32(42);
  for (let t = 0; t < 300; t++) {
    const lineCount = 1 + Math.floor(rnd() * 40);
    const lines = [];
    for (let i = 0; i < lineCount; i++) lines.push(EV(i));
    const trailing = rnd() < 0.5 ? '' : EV(999); // sondaki yarım satır
    const text = lines.join('\n') + '\n' + trailing;
    const buf = createNdjsonLineBuffer();
    const got = [];
    // rastgele ofsetlerde böl — tek bayt dahil
    let pos = 0;
    while (pos < text.length) {
      const step = Math.max(1, Math.floor(rnd() * (text.length - pos)));
      got.push(...buf.push(text.slice(pos, pos + step)));
      pos += step;
    }
    got.push(...buf.flush());
    assert.deepEqual(got, lines.concat(trailing ? [trailing] : []), `tohum ${t}`);
    for (const l of got) assert.ok(parseNdjsonLine(l), `olay parse edilemedi: ${l.slice(0, 40)}`);
  }
});

test('UTF-8 çoklu-bayt chunk sınırı: Buffer girişi de kayıpsız', () => {
  // setEncoding'siz Buffer beslemesi — decoder sınırları birleştirmeli
  const texts = ['Türkçe', 'çğıöşü', '', '', 'ağaç', '🎬🎥'];
  const wire = Buffer.concat(texts.map((s, i) => Buffer.from(EV(i, { s }) + '\n', 'utf8')));
  for (const cut of [0, 1, 2, 3, 7, 13]) {
    const buf = createNdjsonLineBuffer();
    const got = [];
    for (let pos = 0; pos < wire.length; pos += 1 + ((cut * 31) % 5)) {
      got.push(...buf.push(wire.slice(pos, pos + 1 + ((cut * 31) % 5))));
    }
    got.push(...buf.flush());
    const parsed = got.map(parseNdjsonLine);
    assert.equal(parsed.length, texts.length);
    texts.forEach((s, i) => assert.equal(parsed[i].s, s, `kesim ${cut}, satır ${i}: ${JSON.stringify(parsed[i].s)}`));
  }
});

test('sınır: boş satır, \\r\\n, sadece \\n', () => {
  const buf = createNdjsonLineBuffer();
  assert.deepEqual(buf.push('a\n\nb\r\n\n'), ['a', '', 'b\r', '']);
  assert.deepEqual(buf.flush(), []);
  // boş satır olay değildir ama kaybolmaz
  assert.equal(parseNdjsonLine(''), null);
  assert.equal(parseNdjsonLine('   '), null);
});

// =========================================================================
// Bölüm B — overflow: uzun satır düşer, sonraki satır sağlam
// =========================================================================

test('maxLineChars aşımı: büyük satır düşer, akış toparlanır', () => {
  // Not: modülün sözleşmesi Math.max(1024, maxLineChars) — alt sınır 1KB.
  const drops = [];
  const buf = createNdjsonLineBuffer({ maxLineChars: 1024, onOverflow: (n) => drops.push(n) });
  const big = 'x'.repeat(2048);
  const got = buf.push(`${EV(1)}\n${big}\n${EV(2)}\n`);
  assert.deepEqual(got, [EV(1), EV(2)], 'büyük satır düşmeli, komşular sağlam');
  assert.deepEqual(drops, [2048]);
});

test('sınırı aşan yarım satır parçalara bölünse de düşer', () => {
  const drops = [];
  const buf = createNdjsonLineBuffer({ maxLineChars: 1024, onOverflow: (n) => drops.push(n) });
  const big = 'y'.repeat(3000); // newline'sız → pending overflow → dropping
  assert.deepEqual(buf.push(big), []);
  assert.deepEqual(buf.push('daha-fazla'), []); // hâlâ düşürüyor
  assert.deepEqual(buf.push(`\n${EV(7)}\n`), [EV(7)]); // newline sonrası toparlanma
  assert.ok(drops.length >= 1);
});

// =========================================================================
// Bölüm C — parseNdjsonLine sözleşmesi
// =========================================================================

test('temiz satır + yt-dlp yapışması + sonek kurtarması', () => {
  assert.deepEqual(parseNdjsonLine(EV(1)), { type: 'segment', i: 1 });
  // R271: [download] metni aynı satıra yapışır — nesne kurtarılır
  const glued = '[download]  42.3% ' + EV(2);
  assert.deepEqual(parseNdjsonLine(glued), { type: 'segment', i: 2 });
  assert.deepEqual(parseNdjsonLine(EV(3) + ' tail-junk'), { type: 'segment', i: 3 });
  assert.deepEqual(parseNdjsonLine('junk ' + EV(4) + ' tail'), { type: 'segment', i: 4 });
});

test('geçersiz şekiller null döner — crash yok', () => {
  for (const bad of ['', '   ', 'not json', '[1,2,3]', '42', '"str"', 'null', 'true',
    '{kesik', '{}}', '{a:1}', 'NaN', '{', '}', 'undefined',
    '{"a":1}{"b":2}', // tek satırda iki nesne — kurtarma bütünü alamaz
    ]) {
    assert.equal(parseNdjsonLine(bad), null, JSON.stringify(bad));
  }
  assert.equal(parseNdjsonLine('{}') && typeof parseNdjsonLine('{}') === 'object', true);
  assert.equal(parseNdjsonLine(null), null);
  assert.equal(parseNdjsonLine(42), null);
});

test('içinde süslü parantez taşıyan string alanlar kurtarma kesimini bozmaz', () => {
  const ev = { type: 'x', s: '}{"}}{' };
  const line = 'pref ' + JSON.stringify(ev) + ' suf';
  assert.deepEqual(parseNdjsonLine(line), ev);
  // Dış metin '{' veya '}' içerirse ilk-son kesim bozulabilir — bilinen sınır
  const amb = 'pre{fix ' + JSON.stringify({ type: 'y' });
  assert.equal(parseNdjsonLine(amb) === null || parseNdjsonLine(amb).type === 'y', true);
});

// =========================================================================
// Bölüm D — fuzz: rastgele bozulma altında invariant'lar
// =========================================================================

test('rastgele bozulma: kayıp olmaz, çoğalma olmaz, sıra korunur', () => {
  const rnd = mulberry32(777);
  for (let t = 0; t < 200; t++) {
    const events = [];
    for (let i = 0; i < 1 + Math.floor(rnd() * 15); i++) events.push({ type: 'ev', i, v: rnd() });
    // Önek/sonek gürültüsü + chunk bölme
    const wire = events.map((e) => (rnd() < 0.3 ? '[x] ' : '') + JSON.stringify(e) + (rnd() < 0.3 ? ' junk' : '')).join('\n') + '\n';
    const buf = createNdjsonLineBuffer();
    const got = [];
    let pos = 0;
    while (pos < wire.length) {
      const step = 1 + Math.floor(rnd() * 37);
      got.push(...buf.push(wire.slice(pos, pos + step)));
      pos += step;
    }
    got.push(...buf.flush());
    const parsed = got.map(parseNdjsonLine).filter(Boolean);
    assert.equal(parsed.length, events.length, `tohum ${t}: kayıp/fazla`);
    parsed.forEach((p, i) => {
      assert.equal(p.i, i, `tohum ${t}: sıra bozuk`);
      assert.equal(p.v, events[i].v);
    });
  }
});

console.log(`ndjson-stream-fuzz: ${passed} test OK`);
