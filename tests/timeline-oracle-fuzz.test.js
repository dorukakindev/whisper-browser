// R323-2 — zamanlama kalibrasyon/kaydırma oracle fuzz'ı (50'lik gece kuyruğu).
// subs-shift-accuracy.test.js shiftTimecodes'u (metin düzeyi) kilitler; buradaki
// hedefler cue nesneleri üzerinde çalışan iki yardımcı:
//   - calibrateCueTimeline: median-ofset kestiricisi (eşleşme → inlier → kabul)
//   - shiftCueTimeline: cue kaydırma (negatif düşümü + [0,∞) kelepçe)
// Oracle yaklaşımı: bilinen ofsetle üretilen senaryolarda fonksiyonun kabul/
// red kararı ve raporladığı ofset doğrulanır; bozulmaya dayanıklılık (dropout,
// yinelenen metin, aykırı ofset) invariant olarak denetlenir.

'use strict';

const assert = require('assert');
const {
  calibrateCueTimeline,
  shiftCueTimeline,
  normalizeTimelineText,
} = require('../src/browser-cue-timeline-calibration');

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

// =========================================================================
// Bölüm A — calibrateCueTimeline oracle'ı
// =========================================================================

test('uniform ofset: tohumlu fuzz — kabul edilir ve ofset gerçeğe yakın', () => {
  const rnd = mulberry32(20260930);
  for (let trial = 0; trial < 400; trial++) {
    const n = 2 + Math.floor(rnd() * 28);
    const offset = (rnd() * 110) * (rnd() < 0.5 ? -1 : 1);
    const refs = [];
    for (let i = 0; i < n; i++) {
      refs.push({ start: i * (1.5 + rnd() * 4) + 1, text: `Unique caption line number ${i} spoken now` });
    }
    const jitter = () => (rnd() - 0.5) * 0.04; // ±20 ms algılayıcı gürültüsü
    const cands = refs
      .filter(() => rnd() < 0.75) // dropout — her cue eşleşmeyebilir
      .map((cue) => {
        let start = cue.start + offset + jitter();
        if (start < 0) start = 0.001; // sitenin gördüğü eksen negatife inmez
        return { start, text: cue.text };
      });
    const result = calibrateCueTimeline(refs, cands);
    if (cands.length >= 2) {
      assert.equal(result.accepted, true, `trial ${trial}: uniform shift reddedildi`);
      assert.ok(Math.abs(result.offsetSeconds - offset) <= 0.051,
        `trial ${trial}: offset ${result.offsetSeconds} gerçek ${offset}'ten uzak`);
      assert.ok(result.matches >= 2);
    }
  }
});

test('maxOffset dışı kayma: |ofset|>120 reddedilir', () => {
  const rnd = mulberry32(7);
  for (let trial = 0; trial < 40; trial++) {
    const offset = 121 + rnd() * 60;
    const refs = [
      { start: 1, text: 'First line that is long enough to match' },
      { start: 4, text: 'Second line that is long enough to match' },
    ];
    const cands = refs.map((c) => ({ start: c.start + offset + 1 + rnd() * 400, text: c.text }));
    assert.equal(calibrateCueTimeline(refs, cands).accepted, false);
  }
});

test('yinelenen metin eşleşmeden düşer — kalan tekil eşleşmelerle kabul', () => {
  const rnd = mulberry32(11);
  for (let trial = 0; trial < 150; trial++) {
    const offset = 5 + rnd() * 10;
    const refs = [];
    for (let i = 0; i < 6; i++) refs.push({ start: i * 3 + 1, text: `Line ${i} sufficiently long for test` });
    const cands = refs.map((c) => ({ start: c.start + offset, text: c.text }));
    // İlk iki metni aday listede çoğalt → eşleşme tekilleşmez, ikisi de düşer.
    cands.push({ start: refs[0].start + offset + 0.3, text: refs[0].text });
    cands.push({ start: refs[1].start + offset - 0.2, text: refs[1].text });
    const result = calibrateCueTimeline(refs, cands);
    assert.equal(result.accepted, true);
    assert.ok(Math.abs(result.offsetSeconds - offset) <= 0.001,
      `trial ${trial}: ${result.offsetSeconds} != ${offset}`);
    assert.equal(result.matches, 4, `trial ${trial}: yinelenenler düşmeli`);
  }
});

test('azınlık aykırı ofset medyanı saptırmaz', () => {
  const rnd = mulberry32(13);
  for (let trial = 0; trial < 150; trial++) {
    const offset = (rnd() * 40) - 20;
    const refs = [];
    for (let i = 0; i < 9; i++) refs.push({ start: i * 2.5 + 2, text: `Distinct spoken line ${i} of the scene` });
    const cands = refs.map((c, i) => {
      // İlk 3 cue aykırı (dokuzun üçte biri < yarısı)
      const bad = i < 3 ? offset + (2 + rnd() * 5) * (rnd() < 0.5 ? -1 : 1) : offset;
      return { start: c.start + bad, text: c.text };
    });
    const result = calibrateCueTimeline(refs, cands);
    assert.equal(result.accepted, true);
    assert.ok(Math.abs(result.offsetSeconds - offset) <= 0.001,
      `trial ${trial}: medyan aykırıya kaydı (${result.offsetSeconds} vs ${offset})`);
  }
});

test('tek güçlü eşleşme kabul, tek kısa eşleşme red; boşluklar red', () => {
  const long = 'This caption line is certainly long enough for a single anchor';
  const res = calibrateCueTimeline([{ start: 2, text: long }], [{ start: 10, text: long }]);
  assert.equal(res.accepted, true);
  assert.equal(res.offsetSeconds, -8);
  const short = 'Hi';
  assert.equal(calibrateCueTimeline([{ start: 2, text: short }], [{ start: 10, text: short }]).accepted, false);
  assert.equal(calibrateCueTimeline([], [{ start: 1, text: 'x' }]).accepted, false);
  assert.equal(calibrateCueTimeline([{ start: 1, text: 'x' }], []).accepted, false);
});

test('metin normalizasyonu eşleşmeyi kurtarır (büyük/küçük, işaret, tag)', () => {
  const res = calibrateCueTimeline(
    [{ start: 1, text: 'İşaretli KELIME, noktalı!' }, { start: 5, text: 'İkinci satır yeterince uzun olsun' }],
    [{ start: 4.5, text: 'isaretli kelime noktali' }, { start: 8.5, text: '<i>İkinci</i> satır yeterince uzun olsun' }]);
  assert.equal(res.accepted, true);
  assert.equal(res.offsetSeconds, -3.5);
});

test('hostile girişler: NaN başlangıçlar, düz metinler, null cue çöküşsüz reddedilir', () => {
  assert.equal(calibrateCueTimeline([{ start: NaN, text: 'a' }], [{ start: 1, text: 'a' }]).accepted, false);
  assert.equal(calibrateCueTimeline(null, null).accepted, false);
  assert.equal(calibrateCueTimeline(
    [{ start: 1, text: 'only' }],
    [{ start: Infinity, text: 'only' }]).accepted, false);
});

// =========================================================================
// Bölüm B — shiftCueTimeline oracle'ı
// =========================================================================

test('düşüm kuralı: yalnız end+ofset<=0 olan cue düşer, kalanları korur', () => {
  const rnd = mulberry32(17);
  for (let trial = 0; trial < 300; trial++) {
    const cues = [];
    for (let i = 0; i < 20; i++) {
      const start = rnd() * 12;
      cues.push({ start, end: start + 0.5 + rnd() * 3, text: `t${i}` });
    }
    const offset = (rnd() * 20) - 10;
    const out = shiftCueTimeline(cues, offset);
    const expectedKept = cues.filter((c) => c.end + offset > 0);
    assert.equal(out.length, expectedKept.length, `trial ${trial}`);
    for (let i = 0; i < out.length; i++) {
      const src = expectedKept[i];
      assert.equal(out[i].text, src.text);
      assert.ok(out[i].start >= 0, `trial ${trial}: negatif başlangıç`);
      assert.ok(out[i].end - out[i].start >= 0.0009, `trial ${trial}: end<=start`);
      const wantStart = Math.max(0, src.start + offset);
      assert.ok(Math.abs(out[i].start - wantStart) < 1e-9, `trial ${trial}: start ${out[i].start} != ${wantStart}`);
    }
  }
});

test('roundtrip: dokunulmayan cue ±O ile kimliğe döner; kelepçelenen sürüklenir', () => {
  const rnd = mulberry32(19);
  for (let trial = 0; trial < 250; trial++) {
    const offset = (rnd() * 16) - 8;
    const cues = [];
    for (let i = 0; i < 12; i++) {
      const start = 2 + rnd() * 10;
      cues.push({ start, end: start + 0.4 + rnd() * 2, text: `cue${i}`, extra: i });
    }
    const fwd = shiftCueTimeline(cues, offset);
    const back = shiftCueTimeline(fwd, -offset);
    // İleri yönde hayatta kalanlar: end+O > 0
    const survivors = cues.filter((c) => c.end + offset > 0);
    assert.equal(back.length, survivors.length, `trial ${trial}`);
    for (let i = 0; i < survivors.length; i++) {
      const src = survivors[i];
      const clamped = src.start + offset < 0; // yalnız O<0 için mümkün
      const expectedStart = clamped ? Math.max(0, -offset) : src.start;
      assert.ok(Math.abs(back[i].start - expectedStart) < 1e-9,
        `trial ${trial}: start ${back[i].start} != ${expectedStart}`);
      assert.ok(Math.abs(back[i].end - src.end) < 1e-9, `trial ${trial}: end sürüklendi`);
      assert.equal(back[i].extra, src.extra, 'ek alanlar korunur');
      assert.equal(back[i].timelineCalibrated, true, 'işaret bayrağı sürer');
    }
  }
});

test('sıfır/naN/küçük ofset kopya döner — girdi mutasyonsuz', () => {
  const cues = [{ start: 1, end: 2, text: 'x' }, { start: 3, end: 4, text: 'y' }];
  for (const offset of [0, 0.0005, -0.0009, NaN, Infinity, undefined]) {
    const out = shiftCueTimeline(cues, offset);
    assert.equal(out.length, 2);
    assert.deepEqual(out.map((c) => [c.start, c.end]), [[1, 2], [3, 4]]);
    assert.ok(out !== cues && out[0] !== cues[0], 'kopya beklenir');
  }
  assert.deepEqual(cues, [{ start: 1, end: 2, text: 'x' }, { start: 3, end: 4, text: 'y' }]);
});

test('çıkış her zaman sıralı kalmaz gerekmeksizin girdi sırası korunur', () => {
  const cues = [{ start: 5, end: 6, text: 'a' }, { start: 1, end: 2, text: 'b' }];
  const out = shiftCueTimeline(cues, 0.5);
  assert.deepEqual(out.map((c) => c.text), ['a', 'b']);
});

// =========================================================================
// Bölüm C — normalizeTimelineText dayanıklılığı
// =========================================================================

test('normalizeTimelineText: birleşik işaret/etiket/noktalama katlaması', () => {
  assert.equal(normalizeTimelineText('  İĞNE<i>, kelime </i>uzunluğu—deneme! '), 'igne kelime uzunlugu deneme');
  assert.equal(normalizeTimelineText(null), '');
  assert.equal(normalizeTimelineText('<br>'), '');
});

console.log(`timeline-oracle-fuzz: ${passed}/${passed} OK`);
