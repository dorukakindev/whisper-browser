'use strict';

// R164 — literalRanges hızlı-yol ratchet'i.
// Önceki tarama her başlangıç noktasında büyüyen pencereyi yeniden fold ediyordu
// (cue başına O(L²)): ~4000 cue'luk bir altyazıda tek arama ~21s sürüyordu.
// Hızlı yol metni bir kez fold edip indexOf kullanır; uzunluk-değiştiren
// katlamalar (ligature, üst simge, birleşen im) varsa yavaş yola düşer.

const assert = require('node:assert');
const {
  findLiteralMatches,
  literalRanges,
  foldSearchText,
} = require('../src/subtitle-find-replace.js');

let n = 0;
const ok = (cond, msg) => { n += 1; assert(cond, msg); };

// Eski algoritmanın referans kopyası — denklik fuzz'ı için.
function referenceRanges(text, query, options = {}) {
  const source = String(text == null ? '' : text);
  const needle = foldSearchText(query, options.caseSensitive === true);
  if (!source || !needle) return [];
  const boundaries = [0];
  let off = 0;
  for (const ch of source) { off += ch.length; boundaries.push(off); }
  const WORD = /[\p{L}\p{N}_]/u;
  const ranges = [];
  let sp = 0;
  while (sp < boundaries.length - 1) {
    let matched = null;
    for (let ep = sp + 1; ep < boundaries.length; ep++) {
      const cand = foldSearchText(source.slice(boundaries[sp], boundaries[ep]),
        options.caseSensitive === true);
      if (cand === needle) { matched = { start: boundaries[sp], end: boundaries[ep] }; break; }
      if (cand.length > needle.length + 2) break;
    }
    if (!matched) { sp++; continue; }
    if (options.wholeWord === true) {
      const before = source.slice(0, matched.start).match(/[\s\S]$/u)?.[0] || '';
      const after = source.slice(matched.end).match(/^[\s\S]/u)?.[0] || '';
      if ((before && WORD.test(before)) || (after && WORD.test(after))) { sp++; continue; }
    }
    ranges.push(matched);
    while (sp < boundaries.length && boundaries[sp] < matched.end) sp++;
  }
  return ranges;
}

// --- Denklik: deterministik fuzz, hızlı vs referans yol ---
let seed = 11;
const rnd = () => (seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31;
const alphabet = 'abcçdefgğhıiİjklmnopqrstuüvwxyz 0123456789.,:;?!()ﬀﬁ²¹³\u0301é€µʼ—';
let fuzzRounds = 0;
for (let r = 0; r < 500; r += 1) {
  const len = Math.floor(rnd() * 60) + 1;
  const text = Array.from({ length: len },
    () => alphabet[Math.floor(rnd() * alphabet.length)]).join('');
  const q = Array.from({ length: Math.floor(rnd() * 5) + 1 },
    () => alphabet[Math.floor(rnd() * alphabet.length)]).join('');
  for (const opts of [{}, { caseSensitive: true }, { wholeWord: true },
    { wholeWord: true, caseSensitive: true }]) {
    fuzzRounds += 1;
    assert.deepStrictEqual(literalRanges(text, q, opts), referenceRanges(text, q, opts),
      `denklik: ${JSON.stringify(text)} / ${JSON.stringify(q)} ${JSON.stringify(opts)}`);
  }
}
ok(fuzzRounds === 2000, `fuzz turu sayısı: ${fuzzRounds}`);

// --- Uzunluk-değiştiren katlamalar yine çalışmalı (yavaş yol) ---
assert.deepStrictEqual(literalRanges('ﬀ ﬁlmde ﬃ', 'ff'), [{ start: 0, end: 1 }]);
n += 1;
assert.deepStrictEqual(literalRanges('x²y', 'x2y'), [{ start: 0, end: 3 }]);
n += 1;
assert.deepStrictEqual(literalRanges('İİİ İstanbul ısrar İnebolu', 'ısrar'), [{ start: 13, end: 18 }]);
n += 1;

// --- Tam kelime + case aynen çalışmalı ---
assert.deepStrictEqual(
  literalRanges('kelime kelime kelime', 'kelime'),
  [{ start: 0, end: 6 }, { start: 7, end: 13 }, { start: 14, end: 20 }]);
n += 1;
assert.deepStrictEqual(
  literalRanges('kelimeler kelime kelime', 'kelime', { wholeWord: true }),
  [{ start: 10, end: 16 }, { start: 17, end: 23 }]);
n += 1;
assert.deepStrictEqual(literalRanges('Kelime KELİME', 'kelime', { caseSensitive: true }), []);
n += 1;
assert.deepStrictEqual(
  literalRanges('Kelime KELİME', 'kelime'),
  [{ start: 0, end: 6 }, { start: 7, end: 13 }]);
n += 1;

// --- Büyük korpus performans ratchet'i ---
const entries = Array.from({ length: 4000 }, (_, i) => ({
  field: 'source', channel: 'primary', index: i,
  text: 'Bu bir uzun altyazı satırıdır ve içinde birçok kelime vardır. '.repeat(3),
}));
entries[2000].text += ' Aranankelime sonu.';
const t0 = Date.now();
const found = findLiteralMatches(entries, 'aranankelime');
const elapsed = Date.now() - t0;
ok(found.length === 1 && found[0].index === 2000, 'büyük korpusta bulgu');
// Hızlı yol ~620× daha hızlı; 4s üst sınır yavaş makineler için de güvenli.
ok(elapsed < 4000, `4000 cue arama süresi ${elapsed}ms < 4000ms (öncesi ~21000ms)`);

// Bitiş aralığında kaçan eşleşme (indexOf ilerletmesi) kenar durumu
assert.deepStrictEqual(literalRanges('abab', 'abab'), [{ start: 0, end: 4 }]);
n += 1;
assert.deepStrictEqual(literalRanges('aaaa', 'aa'), [{ start: 0, end: 2 }, { start: 2, end: 4 }]);
n += 1;
// Boş/edge girdiler
assert.deepStrictEqual(literalRanges('', 'x'), []);
n += 1;
assert.deepStrictEqual(literalRanges('x', ''), []);
n += 1;
assert.deepStrictEqual(literalRanges(null, 'x'), []);
n += 1;

console.log(`subtitle-find-perf: ${n + fuzzRounds} kontrol geçti`);
