const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

// Kuyruk-50/17: kaynak/hedef ortak arama dizini. Eski davranış her tuşta tüm
// listeyi tarardı; şimdi n-gram posting listeleri + substring doğrulaması var.
// Kilitler: eski tarama ile birebir sonuç, iki dilde zaman-eşleşen eşleşme,
// Türkçe harf / birleşik Unicode / noktalama varyantları, mutasyon geçersizleme.
const modelSrc = fs.readFileSync(path.join(__dirname, '../src/browser-address-model.js'), 'utf8');
const renderer = fs.readFileSync(path.join(__dirname, '../src/renderer/renderer.js'), 'utf8');

let passed = 0, failed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log(`ok ${passed + failed} - ${name}`); }
  catch (error) { failed++; console.error(`not ok ${passed + failed} - ${name}\n  ${error.stack || error}`); }
}
function slice(from, to) {
  const start = renderer.indexOf(from);
  assert(start >= 0, 'baslangic bulunamadi: ' + from);
  const end = renderer.indexOf(to, start);
  assert(end > start, 'bitis bulunamadi: ' + to);
  return renderer.slice(start, end);
}

const slices = [
  slice('const _cueIndexCache', 'function findCueAt('),
  slice('function translationsForCues(', 'function appendHighlighted'),
  slice('function foldSearch(value)', 'function updateSubtitleChips'),
].join('\n');

function mkCtx() {
  const ctx = { console: { log() {} } };
  ctx.globalThis = ctx;
  vm.createContext(ctx);
  vm.runInContext(modelSrc, ctx);
  vm.runInContext(slices + `
    this.indexOf = cueTextSearchIndex;
    this.foldQ = foldQuery;
    this.foldI = foldIndexCached;`, ctx);
  return ctx;
}

const mk = (n, prefix = 'Satir') => Array.from({ length: n }, (_, i) => ({
  start: i * 5, end: i * 5 + 4.5, text: `${prefix} ${i} ornek icerik`,
}));

// Eski tarama semantiği: kaynak.dense.includes(q) || karşıt.dense.includes(q)
function oracleScan(ctx, cues, cues2, q) {
  const out = new Set();
  const dense = (t) => ctx.foldI(String(t || '')).dense;
  const c2 = cues2 || [];
  for (let i = 0; i < cues.length; i++) {
    const cp = (typeof translationsForCues !== 'undefined') ? undefined : undefined;
    if (dense(cues[i] && cues[i].text).includes(q)
        || (c2[i] && dense(c2[i].text).includes(q))) out.add(i);
  }
  return out;
}

test('ortak dizin sonucu eski tarama ile birebir (kaynak+hedef)', () => {
  const ctx = mkCtx();
  const cues = mk(4000);
  const cues2 = cues.map((c, i) => ({ ...c, text: `Çeviri ${i} örnek içerik` }));
  // translationsForCues zaman-eşleştirir: cues2 başlangıçları aynı → eşleşme var
  const ix = ctx.indexOf(cues, cues2);
  for (const raw of ['satir', 'TÜRKÇE', 'turkce', 'icerik', 'çeviri', 'satir 500',
                     'x', 'a', 'ç', 'ornek icerik', 'SATIR 10']) {
    const q = ctx.foldQ(raw);
    const got = ix.query(q);
    const want = oracleScan(ctx, cues, cues2, q);
    assert.deepEqual([...got].sort((a, b) => a - b), [...want].sort((a, b) => a - b),
      `sorgu=${JSON.stringify(raw)}`);
  }
});

test('hedef dilindeki eşleşme zaman-eşleşen kaynak cue indeksine düşer', () => {
  const ctx = mkCtx();
  const cues = mk(100);
  const cues2 = cues.map((c, i) => ({ ...c, text: i === 42 ? 'unique-target-word' : `Çeviri ${i}` }));
  const ix = ctx.indexOf(cues, cues2);
  const hit = ix.query(ctx.foldQ('unique-target-word'));
  assert.deepEqual([...hit], [42], 'hedef metindeki tek eşleşme kaynak indeksine bağlanmalı');
});

test('Türkçe harf katlaması: I/İ/ı/i ve aksanlı harfler eşleşir', () => {
  const ctx = mkCtx();
  const model = require('../src/browser-address-model.js');
  const f = model.foldSearchIndex;
  assert.ok(f('Işık').dense.includes(f('isik').dense));
  assert.ok(f('TÜRKÇE').dense.includes(f('turkce').dense));
  assert.ok(f('İZMİR').dense.includes(f('izmir').dense));
  assert.ok(f('çağrı').dense.includes(f('cagri').dense));
  assert.ok(f('şükür').dense.includes(f('sukur').dense));
});

test('birleşik Unicode: NFD ayrışımı temel harfe iner', () => {
  const ctx = mkCtx();
  const model = require('../src/browser-address-model.js');
  const f = model.foldSearchIndex;
  // cafe\u0301 (NFD é) ile café (NFC) aynı yoğun form
  assert.equal(f('café').dense, f('café').dense);
  assert.ok(f('naïve').dense.includes('naive'));
});

test('noktalama varyantları: tipografik işaretler ASCII karşılığıyla eşleşir', () => {
  const ctx = mkCtx();
  const model = require('../src/browser-address-model.js');
  const f = model.foldSearchIndex;
  assert.ok(f('don’t').dense.includes(f("don't").dense), 'kıvrık kesme vs ASCII kesme');
  assert.ok(f('a—b').dense.includes('a-b'), 'uzun tire vs kısa tire');
  assert.ok(f('bekle…').dense.includes('bekle...'), 'ellipsis vs üç nokta');
  assert.ok(f('“merhaba”').dense.includes('"merhaba"'), 'kıvrık tırnak vs düz tırnak');
  assert.ok(f('bitti？').dense.includes('bitti?'), 'tam genişlik soru işareti');
});

test('10k cue’da seçici sorgu taramasız kalır (perf sınırı)', () => {
  const ctx = mkCtx();
  const cues = mk(10000);
  const cues2 = cues.map((c, i) => ({ ...c, text: `Çeviri ${i}` }));
  const ix = ctx.indexOf(cues, cues2);
  ix.query(ctx.foldQ('satir')); // ısınma
  const t0 = performance.now();
  for (let k = 0; k < 200; k++) {
    ix.query(ctx.foldQ('satir 999x'));   // hiç eşleşmeyen seçici sorgu
    ix.query(ctx.foldQ('satir 500'));    // dar eşleşme
  }
  const dt = performance.now() - t0;
  assert.ok(dt < 250, `400 seçici sorgu ${dt.toFixed(1)}ms — liste taraması var`);
});

test('yerinde mutasyon sonrası bayat dizin dönmez (_cueIndexVersion)', () => {
  const ctx = mkCtx();
  const cues = mk(2000);
  const ix = ctx.indexOf(cues, []);
  assert.equal(ix.query(ctx.foldQ('mutasyon')).size, 0);
  cues[100].text = 'mutasyon kelimesi';
  cues._cueIndexVersion = (cues._cueIndexVersion || 0) + 1;
  const ix2 = ctx.indexOf(cues, []);
  const hit = ix2.query(ctx.foldQ('mutasyon'));
  assert.ok(hit.has(100), 'metin değişince dizin yenilenmeli');
});

console.log(`\ncue-search-index: ${passed} gecti, ${failed} basarisiz`);
if (failed) process.exit(1);
