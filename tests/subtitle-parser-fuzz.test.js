const assert = require('assert');
const {
  parseAss,
  parseMp4Stpp,
  parseMp4WebVtt,
  parseSubtitlePayload,
} = require('../src/browser-subtitles');

const CASES_PER_FORMAT = 12500;
const CASE_TIMEOUT_MS = 100;
const TOTAL_TIMEOUT_MS = 15000;
const HEAP_GROWTH_LIMIT_MIB = 128;
const MAX_FAILURES = 12;

let seed = 0x25f00d;
function random() {
  seed ^= seed << 13;
  seed ^= seed >>> 17;
  seed ^= seed << 5;
  return (seed >>> 0) / 0x100000000;
}

function pick(values) {
  return values[Math.floor(random() * values.length)];
}

function stamp(seconds, separator = '.') {
  const millis = Math.round(seconds * 1000);
  const hh = Math.floor(millis / 3600000);
  const mm = Math.floor((millis % 3600000) / 60000);
  const ss = Math.floor((millis % 60000) / 1000);
  const ms = millis % 1000;
  return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}:`
    + `${String(ss).padStart(2, '0')}${separator}${String(ms).padStart(3, '0')}`;
}

function expectedCue(start, end, text) {
  return { start, end, text };
}

function makeWebVtt(index) {
  const start = (index % 4000) / 10;
  const end = start + 1.25;
  const kind = index % 10;
  const first = `${stamp(start)} --> ${stamp(end)}`;
  const second = `${stamp(end + .5)} --> ${stamp(end + 1.5)}`;
  let body = `WEBVTT\n\n${first}\nBir\n\n${second}\nİki`;
  let expected = [expectedCue(start, end, 'Bir'), expectedCue(end + .5, end + 1.5, 'İki')];
  let differential = true;
  if (kind === 0) body = `\uFEFF${body.replace(/\n/g, '\r\n')}`;
  if (kind === 1) {
    const nestedEntity = index % 20 === 11;
    body = `WEBVTT\n\n${first}\n<c.green>${nestedEntity ? 'Bir &amp;lt;iki&amp;gt;' : 'Bir &amp; iki'}</c>`;
    expected = [expectedCue(start, end, nestedEntity ? 'Bir &lt;iki&gt;' : 'Bir & iki')];
  }
  if (kind === 2) body = `WEBVTT\n\nkimlik\n${first} align:start\nBir`;
  if (kind === 2) expected = [expectedCue(start, end, 'Bir')];
  // Bozuk dış araç çıktılarında boş cue ayıracı kaybolsa da iki açık zaman satırı
  // birbirinin metni değildir. Satır tabanlı bağımsız oracle ikisini korur.
  if (kind === 3) {
    const numericIdentifier = index % 20 === 13;
    body = numericIdentifier
      ? `1\n${first}\nBir\n2\n${second}\nİki`
      : `WEBVTT\n\n${first}\nBir\n${second}\nİki`;
  }
  if (kind === 4) { body = `WEBVTT\n\n-00:00:01.000 --> ${stamp(end)}\nNegatif`; expected = []; differential = false; }
  if (kind === 5) { body = 'WEBVTT\n\n00:00:99.000 --> 00:01:01.000\nTaşma'; differential = false; }
  if (kind === 6) { body = `WEBVTT\n\n${first}\n`; expected = []; }
  if (kind === 7) {
    const damaged = index % 20 === 7 ? 'A\uFFFDB' : 'A\ud800B';
    body = `WEBVTT\n\n${first}\n${damaged}`;
    expected = [expectedCue(start, end, damaged)];
  }
  if (kind === 8) body = `WEBVTT\n\n${first}\n${'<c>'.repeat(24)}Derin${'</c>'.repeat(24)}`;
  if (kind === 8) expected = [expectedCue(start, end, 'Derin')];
  if (kind === 9) { body = ''; expected = []; }
  return { body, mime: 'text/vtt', url: 'https://fixture.test/sub.vtt', expected, differential };
}

function makeTtml(index) {
  const start = (index % 50) + .5;
  const end = start + 1;
  const kind = index % 10;
  let body = `<tt><body><div><p begin="${start}s" end="${end}s">Bir</p></div></body></tt>`;
  let expected = [expectedCue(start, end, 'Bir')];
  let differential = true;
  if (kind === 0) {
    body = index % 20 === 10
      ? `<tt:tt xmlns:tt="urn:ttml"><tt:body><tt:p begin="${start}s" end="${end}s">Bir</tt:p></tt:body></tt:tt>`
      : `\uFEFF${body.replace(/></g, '>\r\n<')}`;
  }
  if (kind === 1) body = `<tt><body><p begin="${start}s" dur="1s"><span>Bir &amp; iki</span><br/>Satır</p></body></tt>`;
  if (kind === 1) expected = [expectedCue(start, end, 'Bir & iki\nSatır')];
  if (kind === 2) body = '<tt ttp:tickRate="1000"><body><p begin="1500t" dur="500t">Tick</p></body></tt>';
  if (kind === 2) expected = [expectedCue(1.5, 2, 'Tick')];
  if (kind === 3) body = '<tt ttp:frameRate="25"><body><p begin="50f" end="75f">Frame</p></body></tt>';
  if (kind === 3) expected = [expectedCue(2, 3, 'Frame')];
  // TTML clock-time'in frame bileşeni (hh:mm:ss:frames) geçerli bir taşıma biçimidir.
  if (kind === 4) body = '<tt ttp:frameRate="25"><body><p begin="00:00:01:12" end="00:00:02:00">Clock frame</p></body></tt>';
  if (kind === 4) expected = [expectedCue(1.48, 2, 'Clock frame')];
  if (kind === 5) { body = '<tt><body><p begin="-1s" end="2s">Negatif</p></body></tt>'; expected = []; differential = false; }
  if (kind === 6) { body = '<tt><body><p begin="1s" end="2s"></p></body></tt>'; expected = []; }
  if (kind === 7) { body = '<tt><body><p begin="1s">Eksik kapanış'; expected = []; differential = false; }
  if (kind === 8) body = `<tt><body><p begin="${start}s" end="${end}s">${'<span>'.repeat(24)}Derin${'</span>'.repeat(24)}</p></body></tt>`;
  if (kind === 8) expected = [expectedCue(start, end, 'Derin')];
  if (kind === 9) { body = '<tt><body/></tt>'; expected = []; }
  return { body, mime: 'application/ttml+xml', url: 'https://fixture.test/sub.ttml', expected, differential };
}

function makeSrv(index) {
  const startMs = (index % 5000) * 10;
  const durationMs = 750;
  const kind = index % 10;
  let body = `<timedtext><body><p t="${startMs}" d="${durationMs}">Bir</p></body></timedtext>`;
  let expected = [expectedCue(startMs / 1000, (startMs + durationMs) / 1000, 'Bir')];
  let differential = true;
  if (kind === 0) body = `\uFEFF${body.replace(/></g, '>\r\n<')}`;
  if (kind === 1) body = `<timedtext><body><p t="${startMs}" d="${durationMs}"><s>Bir</s> &amp; iki</p></body></timedtext>`;
  if (kind === 1) expected = [expectedCue(startMs / 1000, (startMs + durationMs) / 1000, 'Bir & iki')];
  if (kind === 2) body = `<transcript><text start="${startMs / 1000}" dur=".75">Bir</text></transcript>`;
  if (kind === 3) body = `<timedtext><body><p t="${startMs}" d="${durationMs}">A\udfffB</p></body></timedtext>`;
  if (kind === 3) expected = [expectedCue(startMs / 1000, (startMs + durationMs) / 1000, 'A\udfffB')];
  if (kind === 4) body = `<timedtext><body><p t="${startMs}" d="${durationMs}">${'<s>'.repeat(24)}Derin${'</s>'.repeat(24)}</p></body></timedtext>`;
  if (kind === 4) expected = [expectedCue(startMs / 1000, (startMs + durationMs) / 1000, 'Derin')];
  if (kind === 5) { body = '<timedtext><body><p t="-1000" d="500">Negatif</p></body></timedtext>'; expected = []; differential = false; }
  if (kind === 6) { body = '<timedtext><body><p t="0" d="0">Sıfır</p></body></timedtext>'; expected = [expectedCue(0, 3, 'Sıfır')]; }
  if (kind === 7) { body = '<timedtext><body><p t="0" d="1000"></p></body></timedtext>'; expected = []; }
  if (kind === 8) { body = '<timedtext><body><p t="0" d="1000">Eksik'; expected = []; differential = false; }
  if (kind === 9) { body = ''; expected = []; }
  return { body, mime: 'text/xml', url: 'https://fixture.test/timedtext?fmt=srv3', expected, differential };
}

function makeJson(index) {
  const startMs = (index % 5000) * 10;
  const durationMs = 750;
  const kind = index % 10;
  let value = { events: [{ tStartMs: startMs, dDurationMs: durationMs, segs: [{ utf8: 'Bir' }] }] };
  let body = JSON.stringify(value);
  let expected = [expectedCue(startMs / 1000, (startMs + durationMs) / 1000, 'Bir')];
  let differential = true;
  if (kind === 0) body = `\uFEFF${body}`;
  if (kind === 1) {
    value = { captions: [{ startTimeMs: startMs, durationMs, text: 'Bir & iki' }] };
    body = JSON.stringify(value);
    expected = [expectedCue(startMs / 1000, (startMs + durationMs) / 1000, 'Bir & iki')];
  }
  if (kind === 2) body = JSON.stringify({ events: [{ tStartMs: String(startMs), dDurationMs: String(durationMs), text: 'Bir' }] });
  if (kind === 3) { body = '{"events":['; expected = []; differential = false; }
  if (kind === 4) { body = JSON.stringify({ events: [{ tStartMs: -1, dDurationMs: 5, text: 'Negatif' }] }); expected = []; differential = false; }
  if (kind === 5) { body = JSON.stringify({ status: 'ok', items: [1, 2] }); expected = []; }
  if (kind === 6) { body = JSON.stringify({ events: [{ tStartMs: startMs, dDurationMs: durationMs, text: '' }] }); expected = []; }
  if (kind === 7) { body = JSON.stringify([{ start: startMs / 1000, end: (startMs + durationMs) / 1000, text: 'Bir' }]); }
  if (kind === 8) { body = JSON.stringify({ cues: [{ startMs, durationMs, text: 'A\ud800B' }] }); expected = [expectedCue(startMs / 1000, (startMs + durationMs) / 1000, 'A\ud800B')]; }
  if (kind === 9) { body = ''; expected = []; }
  return { body, mime: 'application/json', url: 'https://fixture.test/timedtext?fmt=json3', expected, differential };
}

function assertCueInvariant(cues) {
  assert(Array.isArray(cues));
  assert(cues.length <= 20000, `cue tavanı aşıldı: ${cues.length}`);
  let previous = -Infinity;
  for (const cue of cues) {
    assert(Number.isFinite(cue.start) && cue.start >= 0, `geçersiz başlangıç: ${cue.start}`);
    assert(Number.isFinite(cue.end) && cue.end > cue.start, `geçersiz bitiş: ${cue.end}`);
    assert(cue.start >= previous, 'cue sırası monoton değil');
    assert.equal(typeof cue.text, 'string');
    assert(cue.text.length > 0);
    previous = cue.start;
  }
}

function compareCues(actual, expected) {
  if (actual.length !== expected.length) return `cue sayısı ${actual.length} != ${expected.length}`;
  for (let i = 0; i < expected.length; i++) {
    if (Math.abs(actual[i].start - expected[i].start) > 0.001
      || Math.abs(actual[i].end - expected[i].end) > 0.001
      || actual[i].text !== expected[i].text) {
      return `cue ${i}: ${JSON.stringify(actual[i])} != ${JSON.stringify(expected[i])}`;
    }
  }
  return '';
}

function box(type, payload) {
  const head = Buffer.alloc(8);
  head.writeUInt32BE(payload.length + 8);
  head.write(type, 4, 4, 'ascii');
  return Buffer.concat([head, payload]);
}

function full(flags, payload, version = 0) {
  const head = Buffer.alloc(4);
  head[0] = version;
  head.writeUIntBE(flags, 1, 3);
  return Buffer.concat([head, payload]);
}

function offsetTimedFixture(sample, baseTime = 1000) {
  const tfhdPayload = Buffer.alloc(4); tfhdPayload.writeUInt32BE(1);
  const tfdtPayload = Buffer.alloc(4); tfdtPayload.writeUInt32BE(baseTime);
  const rows = Buffer.alloc(16);
  rows.writeUInt32BE(1, 0); // sample_count
  // data_offset daha sonra moof boyutu bilindiğinde yazılır.
  rows.writeUInt32BE(0, 4);
  rows.writeUInt32BE(1000, 8);
  rows.writeUInt32BE(sample.length, 12);
  let traf = box('traf', Buffer.concat([
    box('tfhd', full(0, tfhdPayload)), box('tfdt', full(0, tfdtPayload)),
    box('trun', full(0x301, rows)),
  ]));
  let moof = box('moof', traf);
  const prefix = Buffer.from('not-a-vtt-sample');
  rows.writeInt32BE(moof.length + 8 + prefix.length, 4);
  traf = box('traf', Buffer.concat([
    box('tfhd', full(0, tfhdPayload)), box('tfdt', full(0, tfdtPayload)),
    box('trun', full(0x301, rows)),
  ]));
  moof = box('moof', traf);
  return Buffer.concat([moof, box('mdat', Buffer.concat([prefix, sample]))]);
}

function offsetWvttFixture() {
  return offsetTimedFixture(box('vttc', box('payl', Buffer.from('Ofset', 'utf-8'))));
}

function offsetStppFixture() {
  const xml = '<tt><body><div><p begin="0s" end="1s">STPP</p></div></body></tt>';
  return offsetTimedFixture(Buffer.from(xml, 'utf8'));
}

const started = performance.now();
const initialHeap = process.memoryUsage().heapUsed;
let peakHeap = initialHeap;
let peakCaseMs = 0;
let cases = 0;
let differentialCases = 0;
const failures = [];
let failureCount = 0;
const failureGroups = new Map();
function recordFailure(failure) {
  failureCount++;
  const key = `${failure.generator}:${failure.kind}`;
  failureGroups.set(key, (failureGroups.get(key) || 0) + 1);
  if (failures.length < MAX_FAILURES) failures.push(failure);
}
const generators = [makeWebVtt, makeTtml, makeSrv, makeJson];

for (const generator of generators) {
  for (let index = 0; index < CASES_PER_FORMAT; index++) {
    const fixture = generator(index);
    const caseStart = performance.now();
    let parsed;
    try {
      parsed = parseSubtitlePayload(fixture.body, fixture.mime, fixture.url);
      assertCueInvariant(parsed.cues);
    } catch (error) {
      recordFailure({ generator: generator.name, index, kind: 'crash/invariant', detail: error.message });
      cases++;
      continue;
    }
    const elapsed = performance.now() - caseStart;
    peakCaseMs = Math.max(peakCaseMs, elapsed);
    if (elapsed > CASE_TIMEOUT_MS) recordFailure({ generator: generator.name, index, kind: 'timeout', detail: elapsed });
    if (fixture.differential) {
      differentialCases++;
      const difference = compareCues(parsed.cues, fixture.expected);
      if (difference) recordFailure({ generator: generator.name, index, kind: 'differential', detail: difference });
    }
    cases++;
    if ((cases & 255) === 0) peakHeap = Math.max(peakHeap, process.memoryUsage().heapUsed);
  }
}

// Grammar mutationlardan ayrı olarak bir dev satır ve eksik gövde bütçesi.
for (const size of [64 * 1024, 512 * 1024]) {
  const line = 'x'.repeat(size);
  const parsed = parseSubtitlePayload(`WEBVTT\n\n00:00.000 --> 00:01.000\n${line}`, 'text/vtt', 'https://fixture.test/huge.vtt');
  assert.equal(parsed.cues.length, 1);
  assert.equal(parsed.cues[0].text.length, size);
}

const incompleteXml = `<tt><body>${'<p begin="1s">x'.repeat(10000)}</body></tt>`;
const incompleteStart = performance.now();
assert.deepEqual(parseSubtitlePayload(incompleteXml, 'application/ttml+xml',
  'https://fixture.test/incomplete.ttml').cues, []);
const incompleteMs = performance.now() - incompleteStart;
assert(incompleteMs <= CASE_TIMEOUT_MS,
  `eksik kapanışlı TTML ${incompleteMs.toFixed(1)} ms > ${CASE_TIMEOUT_MS} ms`);

const brokenMarkup = `<${'<'.repeat(19999)}`;
const markupStart = performance.now();
const markupCues = parseSubtitlePayload(`WEBVTT\n\n00:00.000 --> 00:01.000\n${brokenMarkup}`,
  'text/vtt', 'https://fixture.test/broken-markup.vtt').cues;
const markupMs = performance.now() - markupStart;
assert.equal(markupCues[0].text, brokenMarkup);
assert(markupMs <= CASE_TIMEOUT_MS,
  `kapanmayan cue markup ${markupMs.toFixed(1)} ms > ${CASE_TIMEOUT_MS} ms`);

const brokenAss = '{\\'.repeat(10000);
const assStart = performance.now();
const assCues = parseAss(`[Events]\nDialogue: 0,0:00:00.00,0:00:01.00,Default,,0,0,0,,${brokenAss}`);
const assMs = performance.now() - assStart;
assert.equal(assCues[0].text, brokenAss);
assert(assMs <= CASE_TIMEOUT_MS,
  `kapanmayan ASS override ${assMs.toFixed(1)} ms > ${CASE_TIMEOUT_MS} ms`);

// Geçerli fMP4'te trun data_offset, mdat başındaki başka veriyi atlamalıdır.
const offsetCues = parseMp4WebVtt(offsetWvttFixture(), { timescale: 1000 });
if (compareCues(offsetCues, [expectedCue(1, 2, 'Ofset')])) {
  recordFailure({ generator: 'container', index: 0, kind: 'data_offset', detail: JSON.stringify(offsetCues) });
}

const stppCues = parseMp4Stpp(offsetStppFixture(), { timescale: 1000 });
if (compareCues(stppCues, [expectedCue(1, 2, 'STPP')])) {
  recordFailure({ generator: 'container', index: 1, kind: 'stpp', detail: JSON.stringify(stppCues) });
}

// Yeni fMP4 biçimleri için hedefli kutu mutasyonları: sıfır trun süresi,
// geriye giden tfdt, yarım mdat ve vttc içindeki bilinmeyen alt kutu.
const containerSeed = offsetWvttFixture();
const structuralMutations = [];
const zeroDuration = Buffer.from(containerSeed);
const trunType = zeroDuration.indexOf(Buffer.from('trun'));
if (trunType >= 0) zeroDuration.writeUInt32BE(0, trunType + 16);
structuralMutations.push(zeroDuration);
const backwardTfdt = Buffer.from(containerSeed);
const tfdtType = backwardTfdt.indexOf(Buffer.from('tfdt'));
if (tfdtType >= 0) backwardTfdt.writeUInt32BE(0, tfdtType + 8);
structuralMutations.push(backwardTfdt);
structuralMutations.push(containerSeed.subarray(0, containerSeed.length - 5));
const unknownChild = box('vttc', Buffer.concat([
  box('zzzz', Buffer.from([0, 1, 2, 3])),
  box('payl', Buffer.from('Bilinmeyen kutu', 'utf8')),
]));
structuralMutations.push(offsetTimedFixture(unknownChild));
for (let index = 0; index < 1024; index++) {
  const mutated = structuralMutations[index % structuralMutations.length];
  assert.doesNotThrow(() => assertCueInvariant(parseMp4WebVtt(mutated, { timescale: 1000 })));
  cases++;
}
assert.equal(parseMp4WebVtt(structuralMutations[3], { timescale: 1000 })[0]?.text,
  'Bilinmeyen kutu');

// Container mutasyonları: kısa/taşan box boyları veya rastgele byte değişimi crash üretmemeli.
for (let index = 0; index < 2000; index++) {
  const mutated = Buffer.from(containerSeed);
  const changes = 1 + Math.floor(random() * 4);
  for (let n = 0; n < changes; n++) mutated[Math.floor(random() * mutated.length)] = Math.floor(random() * 256);
  assert.doesNotThrow(() => assertCueInvariant(parseMp4WebVtt(mutated, { timescale: pick([0, 1, 1000]) })));
  cases++;
}
const stppSeed = offsetStppFixture();
for (let index = 0; index < 1000; index++) {
  const mutated = Buffer.from(stppSeed);
  const changes = 1 + Math.floor(random() * 4);
  for (let n = 0; n < changes; n++) mutated[Math.floor(random() * mutated.length)] = Math.floor(random() * 256);
  assert.doesNotThrow(() => assertCueInvariant(parseMp4Stpp(mutated, { timescale: pick([0, 1, 1000]) })));
  cases++;
}

// 188 byte'lık yasal TS paket yapısı mevcut parser modelinde demux edilmez.
const tsPacket = Buffer.alloc(188, 0xff);
tsPacket[0] = 0x47; tsPacket[1] = 0x40; tsPacket[2] = 0x20; tsPacket[3] = 0x10;
// Sıfır uzunluklu, geçerli ID3v2.4 başlığı; TS taşıma katmanı bilinçli olarak
// parserın desteklemediği PES/ID3/CEA demux sınırını temsil eder.
Buffer.from([0x49, 0x44, 0x33, 0x04, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]).copy(tsPacket, 4);
const tsResult = parseSubtitlePayload(tsPacket.toString('latin1'), 'video/mp2t', 'https://fixture.test/subtitle.ts');
assert.deepEqual(tsResult, { cues: [], format: '' });

const totalMs = performance.now() - started;
peakHeap = Math.max(peakHeap, process.memoryUsage().heapUsed);
const heapGrowthMiB = Math.max(0, peakHeap - initialHeap) / (1024 * 1024);
assert(cases >= 50000, `fuzz bütçesi eksik: ${cases}`);
assert(totalMs <= TOTAL_TIMEOUT_MS, `toplam fuzz süresi ${totalMs.toFixed(1)} ms`);
assert(heapGrowthMiB <= HEAP_GROWTH_LIMIT_MIB,
  `heap büyümesi ${heapGrowthMiB.toFixed(1)} MiB > ${HEAP_GROWTH_LIMIT_MIB} MiB`);
assert.equal(failureCount, 0, `${failureCount} sapma ${JSON.stringify(Object.fromEntries(failureGroups))}; `
  + `minimize edilecek ilk örnekler:\n${JSON.stringify(failures, null, 2)}`);

console.log(`subtitle-parser-fuzz: ${cases} vaka, ${differentialCases} differential, `
  + `${totalMs.toFixed(1)} ms toplam, ${peakCaseMs.toFixed(3)} ms en yavaş vaka, `
  + `${heapGrowthMiB.toFixed(1)} MiB tepe heap büyümesi`);
