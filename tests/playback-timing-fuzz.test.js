'use strict';
/**
 * Oynatıcı zamanlama fuzz'ı — seek + hız + loop-cue drift.
 *
 * İki saf yüzey deterministik PRNG ile taranır:
 *  - nextCueBoundaryAt (overlay): indeksli hızlı yol ≡ satır-satır brute-force
 *    oracle, her çağrı sonrası (sıralı/sırasız/bozuk/uzayan listeler, uç t'ler).
 *  - playbackLearningAction (playback-policy): aksiyon invariant'ları — seek
 *    asla geriye gitmez, hızlar [0.25,4], loop-cue tekrar sayacı sonludur,
 *    büyük sıçrama (seek) doğal ilerleme sayılmaz.
 */
const assert = require('node:assert/strict');
const { nextCueBoundaryAt } = require('../src/browser-overlay-controller');
const { PLAYBACK_POLICIES, playbackLearningAction } = require('../src/playback-policy');

let passed = 0;
function test(name, fn) {
  try { fn(); passed += 1; console.log(`  PASS ${name}`); }
  catch (e) { console.log(`  FAIL ${name}: ${e.message}`); process.exitCode = 1; }
}

// Deterministik PRNG (mulberry32) — tohum sabit, CI'da tekrarlanabilir.
function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const BOUNDARY_EPS = 1e-9;

function bruteBoundary(cues, t) {
  // Oracle sözleşmeyi kopyalar. Sıralı+sonlu listede (indeksli yol)
  // end<start'lı cue'nun end'i sınır sayılmaz (o cue asla aktifleşemez);
  // bozuk/sırasız listede kod kendi bruteForce'una düşer ve orası TÜM sonlu
  // sınırları sayar. Oracle iki modu da taklit eder.
  const list = Array.isArray(cues) ? cues : [];
  let sorted = true;
  for (let i = 0; i < list.length; i += 1) {
    const start = Number(list[i] && list[i].start);
    if (!Number.isFinite(start)
        || (i > 0 && !(start >= Number(list[i - 1] && list[i - 1].start)))) {
      sorted = false;
      break;
    }
  }
  let best = NaN;
  const keep = (v) => {
    if (Number.isFinite(v) && v > t && (!Number.isFinite(best) || v < best)) best = v;
  };
  for (const cue of list) {
    const start = Number(cue && cue.start);
    const end = Number(cue && cue.end);
    keep(start);
    if (sorted ? (Number.isFinite(start) && end >= start) : true) keep(end);
  }
  return best;
}

function randCueList(rand, opts = {}) {
  const n = Math.floor(rand() * (opts.maxLen || 60));
  const cues = [];
  let cursor = opts.gap === false ? 0 : rand() * 2;
  for (let i = 0; i < n; i += 1) {
    let start = cursor + (opts.gap === false ? rand() * 1.5 : rand() * 4);
    let dur = rand() * 5 + 0.05;
    // Bozuk varyasyonlar: end<start, NaN, negatif, eş zamanlar.
    const dice = rand();
    if (opts.corrupt && dice < 0.06) dur = -(rand() * 3);          // end < start
    else if (opts.corrupt && dice < 0.09) dur = NaN;               // bozuk end
    else if (opts.corrupt && dice < 0.11) start = NaN;             // bozuk start
    // `text` olmayan cue'lar normalizeCueList'te elenir — politika matrisinin
    // boş listeyle çalışmaması için alan zorunlu; arada boş bırakılanlar da
    // normalize-side eleme çeşitliliği sağlar.
    const cue = { start, end: start + dur, id: `c${i}`, text: dice > 0.97 ? '' : `satır ${i}` };
    cues.push(cue);
    cursor = Number.isFinite(start) ? start + Math.max(0.01, dur * (rand() < 0.3 ? rand() : 1)) : cursor + 1;
  }
  if (opts.shuffle && cues.length > 1) {
    for (let i = cues.length - 1; i > 0; i -= 1) {
      const j = Math.floor(rand() * (i + 1));
      [cues[i], cues[j]] = [cues[j], cues[i]];
    }
  }
  return cues;
}

function assertBoundaryEq(cues, t, ctx) {
  const expected = bruteBoundary(cues, t);
  const got = nextCueBoundaryAt(cues, t);
  if (Number.isNaN(expected)) {
    assert.ok(Number.isNaN(got), `${ctx}: t=${t} oracle NaN, got ${got}`);
    return;
  }
  assert.ok(Number.isFinite(got), `${ctx}: t=${t} beklenen ${expected}, got NaN`);
  // Sonuç aynı aday kümesinden (cue sınırları) seçilir — t±1e-12 problarının
  // çözünürlüğü için EPS toleransı değil, kesin eşitlik gerekir.
  assert.strictEqual(got, expected, `${ctx}: t=${t} got ${got} oracle ${expected}`);
}

test('nextCueBoundaryAt ≡ oracle — 4000 rastgele senaryo', () => {
  for (let seed = 1; seed <= 400; seed += 1) {
    const rand = rng(seed * 7919);
    for (let variant = 0; variant < 10; variant += 1) {
      const corrupt = variant % 3 === 2;
      const shuffle = variant % 5 === 4;
      const cues = randCueList(rand, { corrupt, shuffle, maxLen: 200 });
      const times = [
        -5, 0, rand() * 50, cues.length ? Number(cues[0].start) - BOUNDARY_EPS : 0,
        cues.length ? Number(cues[cues.length - 1].end) + 1 : 0,
        rand() * 100 - 10,
      ];
      // Tam sınır ±ε: bitiş/ çakışması kayan-nokta uçlarını döver.
      if (cues.length > 2) {
        const pick = cues[Math.floor(rand() * cues.length)];
        times.push(Number(pick.end) - 1e-12, Number(pick.end), Number(pick.end) + 1e-12);
      }
      for (const t of times) {
        assertBoundaryEq(cues, t, `seed=${seed} v=${variant}`);
      }
    }
  }
});

test('nextCueBoundaryAt — kuyruğa uzama (append) indeksi doğru günceller', () => {
  // state.translation büyüyen listeyle güncellenir; WeakMap+extend yolu
  // prefixMax/suffixMin'i doğru uzatmalı (1. sorgu → push → 2. sorgu).
  const rand = rng(424242);
  for (let round = 0; round < 200; round += 1) {
    const cues = randCueList(rand, { maxLen: 40 });
    const t = rand() * 30;
    assertBoundaryEq(cues, t, `append-ilk round=${round}`);
    // Kuyruk sonuna 1-3 cue push (üretimdeki tek in-place desen).
    const extra = 1 + Math.floor(rand() * 3);
    let tail = cues.length ? Number(cues[cues.length - 1].end) || 0 : 0;
    for (let k = 0; k < extra; k += 1) {
      tail += rand() * 3;
      cues.push({ start: tail, end: tail + 1 + rand() * 3, id: `x${k}` });
    }
    assertBoundaryEq(cues, t, `append-sonra round=${round}`);
    // Ayrıca t'yi sona yaklaştır — yeni cue'ların sınır olabilmesi için.
    assertBoundaryEq(cues, tail - 0.5, `append-tail round=${round}`);
  }
});

test('nextCueBoundaryAt — NaN t ve boş liste NaN döner', () => {
  assert.ok(Number.isNaN(nextCueBoundaryAt([{ start: 1, end: 2 }], NaN)));
  assert.ok(Number.isNaN(nextCueBoundaryAt([], 5)));
  assert.ok(Number.isNaN(nextCueBoundaryAt(null, 5)));
  assert.ok(Number.isNaN(nextCueBoundaryAt('x', 5)));
});

// ---- playbackLearningAction invariant'ları ----
// Politika id'leri anahtar değil: 'loop-cue', 'accelerate-gaps', 'skip-gaps'.
const POLICIES = ['normal', 'accelerate-gaps', 'skip-gaps', 'shadowing', 'loop-cue'];

test('playbackLearningAction — 4000 senaryo invariant matrisi', () => {
  for (let seed = 1; seed <= 400; seed += 1) {
    const rand = rng(seed * 104729);
    for (let variant = 0; variant < 10; variant += 1) {
      const raw = randCueList(rand, { corrupt: false, maxLen: 80 });
      const policy = POLICIES[variant % POLICIES.length];
      const prev = rand() < 0.15 ? NaN : rand() * 60;
      const now = Number.isFinite(prev)
        ? prev + (rand() < 0.8 ? rand() * 1.2 : rand() * 20)   // küçük tick veya seek
        : rand() * 60;
      const opts = {
        baseRate: 0.5 + rand() * 1.5, gapRate: 1 + rand() * 3,
        minGap: rand() * 3, lead: rand() * 0.5,
        autoPause: variant % 2 === 0, repeatCount: 2 + Math.floor(rand() * 8),
        loopCueId: raw.length ? raw[Math.floor(rand() * raw.length)].id : '',
        completedRepeats: Math.floor(rand() * 10),
        shadowingFactor: 0.5 + rand() * 2, lastShadowCueId: '',
      };
      const a = playbackLearningAction(raw, now, prev, policy, opts);
      assert.ok(a && typeof a.type === 'string', `seed=${seed} tip yok`);
      const cues = (Array.isArray(raw) ? raw : [])
        .filter((c) => c && Number(c.end) > Number(c.start) && String(c.text || '').trim())
        .sort((x, y) => x.start - y.start);

      if (a.type === 'seek') {
        // skipGaps: ileri sıçrama — asla geriye seek yok.
        assert.ok(a.time >= now - 1e-9, `seek geriye: ${a.time} < ${now}`);
      }
      if (a.type === 'set-rate') {
        assert.ok(a.rate >= 0.25 && a.rate <= 4, `oran aralık dışı: ${a.rate}`);
      }
      if (a.type === 'loop-cue' || a.type === 'pause-at-cue-end' || a.type === 'pause-for-shadowing') {
        // Bu eylemler yalnız doğal ilerlemede (seek değil) doğar.
        assert.ok(Number.isFinite(prev) && now >= prev && now - prev < 1.5,
          `${a.type} doğal olmayan sıçramada doğdu: ${prev}→${now}`);
        const ended = cues.find((c) => c.id === a.cueId);
        assert.ok(ended, `${a.type} cueId listede yok: ${a.cueId}`);
        if (a.type === 'pause-for-shadowing') {
          assert.ok(a.durationMs >= 1000 && a.durationMs <= 8000,
            `shadow süresi aralık dışı: ${a.durationMs}`);
        }
      }
      if (a.type === 'loop-cue') {
        assert.ok(a.completedRepeats < a.repeatCount,
          `tekrar sayacı taştı: ${a.completedRepeats}/${a.repeatCount}`);
      }
      // Determinizm: aynı girdi → aynı çıktı.
      const b = playbackLearningAction(raw, now, prev, policy, opts);
      assert.deepEqual(b, a, 'aynı girdi farklı çıktı üretti');
    }
  }
});

test('loop-cue tekrar döngüsü sonludur (tamamlayınca biter)', () => {
  const cues = [{ start: 10, end: 12, text: 'x' }, { start: 14, end: 16, text: 'y' }];
  // Doğal ilerleme: cue sonu 12 geçildi.
  for (let rep = 0; rep < 20; rep += 1) {
    const a = playbackLearningAction(cues, 12.1, 11.9, 'loop-cue',
      { repeatCount: 3, loopCueId: '0', completedRepeats: rep });
    if (rep < 2) assert.equal(a.type, 'loop-cue', `rep=${rep}`);
    else assert.equal(a.type, 'loop-cue-finished', `rep=${rep}`);
  }
});

test('büyük seek (≥1.5 sn) loop/pause eylemi üretmez', () => {
  const cues = [{ start: 10, end: 12, text: 'x' }];
  for (const jump of [1.5, 5, 60, -3]) {
    for (const policy of POLICIES) {
      const a = playbackLearningAction(cues, 12 + jump, 11.9, policy, { autoPause: true });
      assert.ok(a.type === 'set-rate' || a.type === 'seek',
        `${policy} seek ${jump}sn'de ${a.type} üretti`);
    }
  }
});

console.log(`${passed} kontrol geçti`);
if (process.exitCode) process.exit(process.exitCode);
