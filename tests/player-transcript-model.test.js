// player-transcript-model — kaynak rolü, 1:N eşleme, iki bağımsız ofset, aday/uncertain, kimlik anahtarı.
const assert = require('node:assert');
const M = require('../src/renderer/player-transcript-model.js');

const track = (id, role, cues, extra = {}) => ({ id, revision: 'r1', language: 'en', role, origin: 'human', offsetSeconds: 0, cues, ...extra });
const cue = (id, start, end, text) => ({ id, start, end, text });

// 1) Kaynak rolü: yalnız role=source; ikincil kanalda da olabilir; ikisi birden → null
{
  const src = track('S', 'source', [cue('s1', 10, 14, 'Hello')]); const tr = track('T', 'translation', [cue('t1', 10, 14, 'Merhaba')]);
  const a = M.resolveSourceRole({ primary: src, secondary: tr, mediaTime: 11 });
  assert.strictEqual(a.channel, 0); assert.strictEqual(a.trackId, 'S'); assert.strictEqual(a.activeCueId, 's1');
  const b = M.resolveSourceRole({ primary: tr, secondary: src, mediaTime: 11 });
  assert.strictEqual(b.channel, 1, 'kaynak ikinci kanalda'); assert.strictEqual(b.trackId, 'S');
  assert.strictEqual(M.resolveSourceRole({ primary: tr, secondary: null, mediaTime: 0 }), null, 'çeviri kaynak sanılmaz');
  const amb = M.explainSourceRole({ primary: src, secondary: track('S2', 'source', []), mediaTime: 0 });
  assert.strictEqual(amb.reason, 'ambiguous'); assert.strictEqual(amb.resolution, null);
  assert.strictEqual(M.resolveSourceRole({ primary: { ...src, offsetSeconds: 2 }, secondary: null, mediaTime: 12.5 }).activeCueId, 's1', 'ofset: 10+2=12 ≤ 12.5');
  assert.strictEqual(M.resolveSourceRole({ primary: { ...src, offsetSeconds: 2 }, secondary: null, mediaTime: 11 }).activeCueId, null);
}

// 2) Fixture: s1 → t1+t2 (ardışık, çakışmayan); s2 karşılıksız; iki bağımsız ofset
{
  const src = track('S', 'source', [cue('s1', 10, 14, 'One two three four'), cue('s2', 20, 22, 'Silent')]);
  const tr = track('T', 'translation', [cue('t1', 10, 12, 'Bir iki'), cue('t2', 12, 14, 'üç dört')], { offsetSeconds: 0 });
  const rows = M.buildTranscriptRows({ sourceTrack: src, secondaryTrack: tr, mediaKey: 'media:A', generation: 3 });
  assert.strictEqual(rows.length, 2);
  assert.deepStrictEqual(rows[0].secondaryCueIds, ['t1', 't2']); assert.strictEqual(rows[0].secondaryText, 'Bir iki\nüç dört'); assert.strictEqual(rows[0].pairing, 'time-overlap');
  assert.strictEqual(rows[1].pairing, 'missing'); assert.strictEqual(rows[1].secondaryText, '', 'kaynak metni çeviri yerine konmaz');
  assert.strictEqual(rows[0].generation, 3); assert.strictEqual(rows[0].mediaKey, 'media:A');
  // +0.5 kaynak / -0.2 ikincil: medya zamanı kaydırılır, eşleşme korunur
  const shifted = M.buildTranscriptRows({ sourceTrack: { ...src, offsetSeconds: 0.5 }, secondaryTrack: { ...tr, offsetSeconds: -0.2 }, mediaKey: 'media:A', generation: 3 });
  assert.strictEqual(shifted[0].videoStart, 10.5); assert.strictEqual(shifted[0].secondaryCandidates[0].videoStart, 9.8);
  assert.deepStrictEqual(shifted[0].secondaryCueIds, ['t1', 't2']);
  // Büyük ofset farkı eşleşmeyi bozar: iki izin ofseti birbirinden bağımsızdır
  const apart = M.buildTranscriptRows({ sourceTrack: src, secondaryTrack: { ...tr, offsetSeconds: 30 }, mediaKey: 'm', generation: 1 });
  assert.strictEqual(apart[0].pairing, 'missing');
}

// 3) Eşik: ov > min(0.4, min(süreler)*0.25)
{
  const src = track('S', 'source', [cue('s1', 0, 4, 'a')]);
  const pair = (tStart, tEnd) => M.buildTranscriptRows({ sourceTrack: src, secondaryTrack: track('T', 'translation', [cue('t1', tStart, tEnd, 'x')]), mediaKey: 'm', generation: 1 })[0].pairing;
  assert.strictEqual(pair(3.7, 6), 'missing', 'ov 0.3 < 0.4 → eşleşmez (süre 2.3 → 0.4 sınırı)');
  assert.strictEqual(pair(3.5, 6), 'time-overlap', 'ov 0.5 > 0.4');
  const shortSrc = track('S', 'source', [cue('s1', 0, 1, 'a')]); // 0.25*1 = 0.25 sınır
  const p2 = (s, e) => M.buildTranscriptRows({ sourceTrack: shortSrc, secondaryTrack: track('T', 'translation', [cue('t1', s, e, 'x')]), mediaKey: 'm', generation: 1 })[0].pairing;
  assert.strictEqual(p2(0.8, 3), 'missing', 'ov 0.2 ≤ 0.25');
  assert.strictEqual(p2(0.7, 3), 'time-overlap', 'ov 0.3 > 0.25');
}

// 4) Aynı zamanlı iki kaynak cue ayrı kimlikte kalır; aynı ikincil cue iki satırda görünebilir
{
  const src = track('S', 'source', [cue('a', 10, 13, 'TOKYO STATION'), cue('b', 10, 13, 'Where did you go?')]);
  const tr = track('T', 'translation', [cue('t', 10, 13, 'Tek çeviri')]);
  const rows = M.buildTranscriptRows({ sourceTrack: src, secondaryTrack: tr, mediaKey: 'm', generation: 1 });
  assert.notStrictEqual(rows[0].key, rows[1].key); assert.deepStrictEqual(rows.map((r) => r.secondaryCueIds), [['t'], ['t']]);
}

// 5) Birbirinin üstüne binen adaylar + açık ilişki yok → uncertain, birleştirilmez
{
  const src = track('S', 'source', [cue('s1', 10, 14, 'x')]);
  const tr = track('T', 'translation', [cue('t1', 10, 14, 'Aday bir'), cue('t2', 11, 14, 'Aday iki')]);
  const row = M.buildTranscriptRows({ sourceTrack: src, secondaryTrack: tr, mediaKey: 'm', generation: 1 })[0];
  assert.strictEqual(row.pairing, 'uncertain'); assert.strictEqual(row.secondaryText, ''); assert.deepStrictEqual(row.secondaryCueIds, []);
  assert.strictEqual(row.secondaryCandidates.length, 2);
}

// 6) Açık source-cue ilişkisi (aynı kaynak revizyonu) önceliklidir; revizyon farklıysa kullanılmaz
{
  const src = track('S', 'source', [cue('s1', 10, 14, 'x'), cue('s2', 14, 18, 'y')]);
  const links = [{ cueId: 't9', sourceCueIds: ['s2'], sourceTrackId: 'S', sourceRevision: 'r1' }];
  const tr = track('T', 'translation', [cue('t9', 10, 14, 'ilişkili metin')], { sourceLinks: links });
  const rows = M.buildTranscriptRows({ sourceTrack: src, secondaryTrack: tr, mediaKey: 'm', generation: 1 });
  assert.strictEqual(rows[1].pairing, 'origin-linked'); assert.deepStrictEqual(rows[1].secondaryCueIds, ['t9'], 'zaman örtüşmesi olmasa da açık ilişki');
  assert.strictEqual(rows[0].pairing, 'time-overlap', 's1 zaman eşleşmesiyle');
  const stale = track('T', 'translation', [cue('t9', 30, 31, 'z')], { sourceLinks: [{ ...links[0], sourceRevision: 'r0' }] });
  assert.strictEqual(M.buildTranscriptRows({ sourceTrack: src, secondaryTrack: stale, mediaKey: 'm', generation: 1 })[1].pairing, 'missing', 'eski revizyon ilişkisi kullanılmaz');
}

// 7) Kelime zamanı yoksa wordTiming:false; anahtar çakışmasız; ikincil iz yoksa tüm satırlar missing
{
  const src = track('S', 'source', [{ ...cue('s1', 0, 2, 'a b'), words: [{ text: 'a', start: 0, end: 1 }] }, cue('s2', 2, 4, 'c')]);
  const rows = M.buildTranscriptRows({ sourceTrack: src, secondaryTrack: null, mediaKey: 'm|1', generation: 1 });
  assert.deepStrictEqual(rows.map((r) => r.wordTiming), [true, false]); assert.ok(rows.every((r) => r.pairing === 'missing'));
  assert.notStrictEqual(M.rowKey('a|b', 'c', 'd', 'e'), M.rowKey('a', 'b|c', 'd', 'e'), 'ayraç çakışması yok');
  assert.deepStrictEqual(M.buildTranscriptRows({ sourceTrack: null, secondaryTrack: null, mediaKey: 'm', generation: 1 }), []);
}

// 8) Etkin satır ve filtre dışı aktif satır
{
  const src = track('S', 'source', [cue('s1', 0, 2, 'a'), cue('s2', 2, 4, 'b')]);
  const rows = M.buildTranscriptRows({ sourceTrack: src, secondaryTrack: null, mediaKey: 'm', generation: 1 });
  assert.strictEqual(M.activeRowIndex(rows, 2.5), 1); assert.strictEqual(M.activeRowIndex(rows, 9), -1);
  assert.deepStrictEqual(M.activeRowVisibility(rows, new Set([rows[0].key]), 2.5), { index: 1, visible: false }, 'filtre silinmez; aktif satıra dön eylemi');
}
console.log('player-transcript-model.test.js: OK');

{ // Her cümle atlaması cümlenin hemen içine iner; seçilen satır etkin satır olur
 const M=require('../src/renderer/player-transcript-model'),rows=[{cueId:'a',videoStart:10,videoEnd:12},{cueId:'b',videoStart:12,videoEnd:14}].map(r=>({...r}));
 assert.equal(M.landingTime(12,14),12.01);assert.equal(M.landingTime(12,14,0.5),12.51);assert.equal(M.landingTime(0,2,-1),0,'never negative');
 assert.equal(M.landingTime(5,5.004),5.002,'a very short sentence lands at its midpoint');assert.equal(M.landingTime(7),7.01);
 // A media element may settle a few milliseconds before the requested time; the landing margin keeps the chosen row active.
 for(const settle of [0,0.004,0.009])assert.equal(M.activeRowIndex(rows,M.landingTime(rows[1].videoStart,rows[1].videoEnd)-settle),1);
 assert.equal(M.activeRowIndex(rows,rows[1].videoStart-0.004),0,'jumping to the exact start can leave the previous row active');
}
