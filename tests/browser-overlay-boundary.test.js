'use strict';

// nextCueBoundaryAt: overlay'in kare başına "sonraki cue sınırı" araması.
// Eski O(2n) tam-taramayla birebir aynı sonucu O(log n + aktif) ile verdiğini
// tohumlu fuzz + kenar vakalarıyla kilitler; 10k-cue'da kare başına
// maliyetin bütçe içinde kaldığını ölçer.

const assert = require('assert');
const { nextCueBoundaryAt } = require('../src/browser-overlay-controller');

// Referans: eski algoritmanın birebir karşılığı (kaynak zamanında min).
const bruteForce = (cues, t) => {
  let best = NaN;
  for (const cue of Array.isArray(cues) ? cues : []) {
    for (const raw of [cue && cue.start, cue && cue.end]) {
      const v = Number(raw);
      if (Number.isFinite(v) && v > t && (!Number.isFinite(best) || v < best)) best = v;
    }
  }
  return best;
};

const mulberry32 = (seed) => () => {
  seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

const makeCues = (rand, n) => {
  const cues = [];
  let cursor = 0;
  for (let i = 0; i < n; i++) {
    const gap = rand() < 0.3 ? rand() * 20 : rand() * 2;
    const start = cursor + gap;
    // Üst üste binme, sıfır süre, çok uzun cue ve ara sıra bozuk değerler.
    const dur = rand() < 0.1 ? 0 : rand() < 0.05 ? 60 + rand() * 120 : rand() * 4;
    const cue = { start, end: start + dur, text: `c${i}` };
    if (rand() < 0.02) cue.end = NaN;           // bozuk bitiş
    if (rand() < 0.02) cue.start = undefined;   // eksik başlangıç
    cues.push(cue);
    cursor = start + dur * (rand() < 0.2 ? 0.2 : 1); // bazen overlap
  }
  return cues;
};

let passed = 0;
const test = (name, fn) => { fn(); passed += 1; console.log('  ✓', name); };

test('boş / tanımsız / NaN zaman girdileri NaN döner', () => {
  for (const bad of [null, undefined, [], 'x']) assert(Number.isNaN(nextCueBoundaryAt(bad, 5)));
  assert(Number.isNaN(nextCueBoundaryAt([{ start: 1, end: 2 }], NaN)));
  assert(Number.isNaN(nextCueBoundaryAt([{ start: 1, end: 2 }], Infinity)));
});

test('tek cue: start/end sınırları sırayla seçilir', () => {
  const cues = [{ start: 10, end: 20 }];
  assert.equal(nextCueBoundaryAt(cues, 5), 10);
  assert.equal(nextCueBoundaryAt(cues, 12), 20);
  assert(Number.isNaN(nextCueBoundaryAt(cues, 20)));
  assert(Number.isNaN(nextCueBoundaryAt(cues, 21)));
});

test('overlap + sıfır süre + uzun cue sınırları doğru', () => {
  const cues = [
    { start: 0, end: 100 },   // uzun cue — her noktada aday
    { start: 10, end: 12 },
    { start: 10, end: 10 },   // sıfır süre
    { start: 50, end: 52 },
  ];
  assert.equal(nextCueBoundaryAt(cues, 5), 10);
  assert.equal(nextCueBoundaryAt(cues, 10), 12); // t=10'da 10-biten/10-başlayan >10 değil; 12 aktif kalır
  assert.equal(nextCueBoundaryAt(cues, 12), 50);
  assert.equal(nextCueBoundaryAt(cues, 49), 50);
  assert.equal(nextCueBoundaryAt(cues, 51), 52);
  assert.equal(nextCueBoundaryAt(cues, 99), 100);
});

test('fuzz: 10k+ rastgele (liste, t) çiftinde brute-force ile birebir', () => {
  const rand = mulberry32(0xC0FFEE);
  for (let round = 0; round < 60; round++) {
    const cues = makeCues(rand, 1 + Math.floor(rand() * 600));
    for (let i = 0; i < 160; i++) {
      const t = rand() * (cues.length ? cues[cues.length - 1].start * 1.2 : 50) - 5;
      const got = nextCueBoundaryAt(cues, t);
      const want = bruteForce(cues, t);
      assert(Number.isNaN(want) ? Number.isNaN(got) : got === want,
        `round ${round} t=${t.toFixed(3)}: ${got} !== ${want} (n=${cues.length})`);
    }
  }
});

test('append uzantısı: liste sona büyüyünce indeks tazelenir', () => {
  const cues = [{ start: 0, end: 5 }, { start: 10, end: 15 }];
  assert.equal(nextCueBoundaryAt(cues, 6), 10);
  cues.push({ start: 16, end: 18 }); // sıralı uzatma (canlı iz senaryosu)
  assert.equal(nextCueBoundaryAt(cues, 6), 10);
  assert.equal(nextCueBoundaryAt(cues, 15.5), 16);
  // Sıra bozan uzatma: bekçi sıralama dışına düşürür → naif tarama korur.
  cues.push({ start: 7, end: 8 });
  assert.equal(nextCueBoundaryAt(cues, 6), 7);
  // Yerinde mutasyon (aynı son cue ama end değişti): WeakMap anahtarı aynı
  // kalır — tailEnd bekçisi bunu yakalayıp yeniden kurmalı.
  cues[3].end = 200;
  assert.equal(nextCueBoundaryAt(cues, 6), 7);
  assert.equal(nextCueBoundaryAt(cues, 7.5), 10);
  assert.equal(nextCueBoundaryAt(cues, 18.5), 200);
});

test('bozuk-dizi enjeksiyonu: junk öğe/seyrek delik atmadan oracle eşliği', () => {
  const rand = mulberry32(0xBAD5);
  const junk = () => {
    const roll = rand();
    if (roll < 0.2) return null;
    if (roll < 0.4) return 'metin';
    if (roll < 0.6) return { start: NaN, end: rand() * 30 };
    if (roll < 0.8) return { start: rand() * 30 };           // end yok
    return { start: `${Math.floor(rand() * 40)}`, end: rand() * 30 }; // dizgi start
  };
  for (let round = 0; round < 40; round++) {
    // Seyrek diziler dahil: length alanını açıkta bırakıp delik üretilir.
    const cues = [];
    cues.length = 1 + Math.floor(rand() * 120);
    for (let i = 0; i < cues.length; i++) {
      if (rand() < 0.25) continue;               // delik — sparse
      cues[i] = rand() < 0.6 ? junk() : { start: rand() * 50, end: rand() * 50 };
    }
    const t = rand() * 60;
    const got = nextCueBoundaryAt(cues, t);
    const want = bruteForce(cues, t);
    assert(Number.isNaN(want) ? Number.isNaN(got) : got === want,
      `round ${round}: ${got} !== ${want} (n=${cues.length})`);
  }
});

test('prob mutasyonu: head/mid/tail start+end değişikliği O(1) yakalanır', () => {
  // Değişmezlik sözleşmesi: yerinde mutasyon yalnız 0, n>>1, n-1
  // noktalarında garantiyle yakalanır (JSDoc). Her prob konumunda
  // cevabı değiştiren bir mutasyon yapılır — indeks bayat kalmamalı.
  const A = () => [0, 10, 20, 30, 100, 200, 210, 220].map((s) => ({ start: s, end: s + 5 }));
  const cases = [
    ['head end',   (c) => { c[0].end = 4.5; },     4,     4.5],
    ['head start', (c) => { c[0].start = 0.8; },   0.5,   0.8],
    ['mid start',  (c) => { c[4].start = 27.5; },  26,    27.5],
    ['mid end',    (c) => { c[4].end = 102; },     101,   102],
    ['tail start', (c) => { c[7].start = 220.5; }, 219.5, 220.5],
    ['tail end',   (c) => { c[7].end = 222.5; },   222,   222.5],
  ];
  for (const [name, mutate, t, want] of cases) {
    const cues = A();
    nextCueBoundaryAt(cues, t);                 // indeksi kur
    mutate(cues);                               // prob konumunda mutasyon
    const got = nextCueBoundaryAt(cues, t);
    assert.equal(got, want, `${name}: ${got} !== ${want}`);
    assert.equal(got, bruteForce(cues, t), `${name}: oracle'dan sapma`);
  }
  // Büyük n'de mid probu da yakalar (n>>1 ölçeklenir).
  const big = [];
  for (let i = 0; i < 200; i++) big.push(i <= 100
    ? { start: i * 10, end: i * 10 + 5 }
    : { start: 1000 + (i - 100) * 10, end: 1000 + (i - 100) * 10 + 5 });
  nextCueBoundaryAt(big, 1001);
  big[100].end = 1002;                          // mid (200>>1) end mutasyonu
  assert.equal(nextCueBoundaryAt(big, 1001), 1002);
  // Kimlik değişimi: yeni dizi referansı WeakMap'i kesin yeniden kurmaya zorlar.
  const a = [{ start: 0, end: 5 }, { start: 10, end: 15 }];
  assert.equal(nextCueBoundaryAt(a, 6), 10);
  const b = [{ start: 0, end: 5 }, { start: 7, end: 9 }];
  assert.equal(nextCueBoundaryAt(b, 6), 7);
});

test('sözleşme notu: prob-dışı mutasyon garanti kapsamı dışıdır', () => {
  // O(1) prob fiyatına tam mutasyon algısı sığmaz; JSDoc bunu belgeler ve
  // mutasyon yapan çağıranın yeni dizi vermesini ister. Bu test yalnız
  // prob-dışı mutasyonun YAKALANAMAYACAĞI gerçeğini belgeler — gelecekte
  // tam algı eklenirse bu vaka assert edilebilir hâle gelir.
  const cues = [];
  for (let i = 0; i < 8; i++) cues.push({ start: i * 10, end: i * 10 + 5 });
  nextCueBoundaryAt(cues, 26);
  cues[2].end = 29;                            // prob-dışı geçerli mutasyon
  const got = nextCueBoundaryAt(cues, 26);
  assert(got === 30 || got === 29,
    'beklenmedik değer; prob-dışı mutasyon ya bayat (30) ya da algılandı (29)');
});

test('birim-agnostik: ms ölçekli cue alanlarında aynı sözleşme', () => {
  const cues = [{ start: 1000, end: 2000 }, { start: 3000, end: 3500 }];
  assert.equal(nextCueBoundaryAt(cues, 500), 1000);
  assert.equal(nextCueBoundaryAt(cues, 1200), 2000);
  assert.equal(nextCueBoundaryAt(cues, 2100), 3000);
  assert(Number.isNaN(nextCueBoundaryAt(cues, 3600)));
});

test('küçülen dizi: length geriye düşünce indeks yeniden kurulur', () => {
  const cues = [];
  for (let i = 0; i < 10; i++) cues.push({ start: i * 10, end: i * 10 + 5 });
  assert.equal(nextCueBoundaryAt(cues, 26), 30);
  cues.length = 3;                             // kalanlar: 0-5,10-15,20-25
  assert(Number.isNaN(nextCueBoundaryAt(cues, 26)));
  assert.equal(nextCueBoundaryAt(cues, 6), 10);
});

test('perf: 10k cue × 20k sınır sorgusu bütçe içinde', () => {
  const rand = mulberry32(0xB10B);
  const cues = makeCues(rand, 10000).filter((c) => Number.isFinite(c.start) && Number.isFinite(c.end));
  const horizon = cues[cues.length - 1].end;
  nextCueBoundaryAt(cues, 0); // indeksi kur
  const t0 = process.hrtime.bigint();
  const N = 20000;
  for (let i = 0; i < N; i++) nextCueBoundaryAt(cues, (i * horizon) / N + 0.001);
  const fastMs = Number(process.hrtime.bigint() - t0) / 1e6;
  const t1 = process.hrtime.bigint();
  for (let i = 0; i < 2000; i++) bruteForce(cues, (i * horizon) / 2000 + 0.001);
  const slowMs = Number(process.hrtime.bigint() - t1) / 1e6 * 10; // 20k ölçeklenmiş
  console.log(`    [perf] indeksli ${N} sorgu ${fastMs.toFixed(1)}ms — tam-tarama eşdeğeri ~${slowMs.toFixed(0)}ms`);
  assert(fastMs < 400, `10k cue'da 20k sorgu ${fastMs.toFixed(1)}ms — bütçe 400ms`);
  assert(slowMs > fastMs * 10, `beklenen hız farkı yok (${fastMs.toFixed(1)} vs ~${slowMs.toFixed(0)}ms)`);
});

console.log(`PASS: browser-overlay-boundary (${passed} kontrol)`);
