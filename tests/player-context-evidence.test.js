// player-context-evidence — "Bu konuma kadar" sınırı, bütçe, kısmi cue, kopuk seçim, ikincil sızıntı.
const assert = require('node:assert');
const E = require('../src/renderer/player-context-evidence.js');

const cue = (id, start, end, text) => ({ id, start, end, text });
const source = { id: 'S', revision: 'r1', language: 'en', role: 'source', origin: 'human', offsetSeconds: 0,
  cues: [cue('s0', 0, 3, 'Zero.'), cue('s1', 10, 14.5, 'We should leave now.'), cue('s2', 15, 18, 'Why so soon?'), cue('s3', 18, 21, 'Trust me.'), cue('s4', 30, 33, 'Future line.')] };
const second = { id: 'T', revision: 'r1', language: 'tr', role: 'translation', origin: 'machine-translation', offsetSeconds: 0,
  cues: [cue('t1', 10, 14.5, 'Şimdi gitmeliyiz.'), cue('t2', 15, 18, 'Neden bu kadar erken?')] };
const snap = (time, extra = {}) => ({ mediaKey: 'M', generation: 2, title: 'Fixture', time, sourceTrack: { id: 'S', revision: 'r1' }, secondaryTrack: { id: 'T', revision: 'r1' }, ...extra });
const cap = (time, selection, scope = 'watched', extra = {}) => E.captureSelectionEvidence({ snapshot: snap(time, extra.snap), selection, scope, tracks: extra.tracks || [source, second], now: 0 });

// 1) Normal zaman 15: s1 (bitiş 14.5) uygun; komşular yalnız kapsamdaysa; gelecek metin dışarıda
{
  const r = cap(15, { text: 'leave now', cueIds: ['s1'] });
  assert.strictEqual(r.ok, true);
  const env = r.envelope;
  assert.deepStrictEqual(env.cueIds, ['s0', 's1'], 's2 bitişi 18 > 15 → dışarıda; s0 önceki komşu');
  assert.strictEqual(env.schema, 'player-evidence-v1'); assert.strictEqual(env.scope, 'watched'); assert.strictEqual(env.scopeEnd, 15);
  assert.strictEqual(env.generation, 2); assert.strictEqual(env.evidence.find((e) => e.cueId === 's1').secondary, 'Şimdi gitmeliyiz.');
  assert.ok(env.limitations.includes('transcript-only'));
  assert.ok(!JSON.stringify(env).includes('Future line'));
}
// 2) Sınır örneği: zaman 14 → s1 reddedilir (kısmi), otomatik kapsam genişletme yok
{
  const r = cap(14, { text: 'leave now', cueIds: ['s1'] });
  assert.deepStrictEqual([r.ok, r.code], [false, 'requires-scope-change']);
  // Seçili aralık kapsamında aynı seçim kabul; gelecek komşular kullanıcının açık tercihiyle
  const sel = cap(14, { text: 'leave now', cueIds: ['s1'] }, 'selection');
  assert.strictEqual(sel.ok, true); assert.strictEqual(sel.envelope.scopeEnd, null);
  assert.ok(sel.envelope.cueIds.includes('s2'), 'selection kapsamında sonraki komşu girebilir');
}
// 3) İkincil eşleşme eşiği aşıyorsa ikincil metin envelope'a girmez ve limitations bunu söyler
{
  const lateSecond = { ...second, cues: [cue('t1', 10, 14.5, 'Şimdi gitmeliyiz.'), cue('t9', 14, 16, 'Geç gelen çeviri')] };
  const s = { ...source, cues: [cue('s1', 10, 16, 'We should leave now, friend.')] };
  const r = E.captureSelectionEvidence({ snapshot: snap(16), selection: { text: 'leave now', cueIds: ['s1'] }, scope: 'watched', tracks: [s, lateSecond], now: 0 });
  assert.strictEqual(r.ok, true);
  const t = E.captureSelectionEvidence({ snapshot: snap(15), selection: { text: 'leave now', cueIds: ['s1'] }, scope: 'selection', tracks: [s, lateSecond], now: 0 });
  assert.strictEqual(t.ok, true);
  const w = E.captureSelectionEvidence({ snapshot: snap(16), selection: { text: 'leave now', cueIds: ['s1'] }, scope: 'watched', tracks: [s, { ...lateSecond, cues: [cue('t1', 10, 17, 'Çeviri 17 sn’de bitiyor')] }], now: 0 });
  assert.strictEqual(w.ok, true); assert.strictEqual(w.envelope.evidence[0].secondary, '');
  assert.ok(w.envelope.limitations.some((l) => l.startsWith('secondary-beyond-scope')));
}
// 4) Boşta yapıştırılmış / kaynak olmayan metin videodan alıntı sayılmaz
{
  assert.strictEqual(cap(15, { text: 'bu videoda geçmeyen cümle', cueIds: ['s1'] }).code, 'missing-source');
  assert.strictEqual(cap(15, { text: 'x', cueIds: [] }).code, 'missing-source');
  assert.strictEqual(cap(15, { text: 'x', cueIds: ['yok'] }).code, 'missing-source');
}
// 5) Bütçe: seçili metin 3000, toplam 6000; sessiz ellipsis yok
{
  const long = 'a'.repeat(3100);
  const big = { ...source, cues: [cue('b1', 0, 5, long)] };
  assert.strictEqual(E.captureSelectionEvidence({ snapshot: snap(99), selection: { text: long, cueIds: ['b1'] }, scope: 'watched', tracks: [big, second], now: 0 }).code, 'selection-too-large');
  const mid = 'b'.repeat(2900);
  const cues = [cue('m0', 0, 1, 'c'.repeat(2000)), cue('m1', 1, 2, mid), cue('m2', 2, 3, 'd'.repeat(2000))];
  const r = E.captureSelectionEvidence({ snapshot: snap(99), selection: { text: mid, cueIds: ['m1'] }, scope: 'watched', tracks: [{ ...source, cues }, second], now: 0 });
  assert.strictEqual(r.ok, true);
  assert.deepStrictEqual(r.envelope.cueIds, ['m0', 'm1'], 'önce en yakın önceki sığar (4900); sonraki sığmaz (6900) → eklenmez, kesilmez');
  assert.ok(r.envelope.evidence.every((e) => !e.source.endsWith('…')));
  // Toplam bütçe ayrı denetlenir: seçili metin 3000 altında olsa da seçili cue'ların toplamı 6000'i aşarsa ret.
  const three = [cue('x1', 0, 1, 'e'.repeat(2900)), cue('x2', 1, 2, 'f'.repeat(2900)), cue('x3', 2, 3, 'g'.repeat(2900))];
  assert.strictEqual(E.captureSelectionEvidence({ snapshot: snap(99), selection: { text: 'e', cueIds: ['x1', 'x2', 'x3'] }, scope: 'watched', tracks: [{ ...source, cues: three }, second], now: 0 }).code, 'selection-too-large');
  const two = [cue('y1', 0, 1, 'e'.repeat(2900)), cue('y2', 1, 2, 'f'.repeat(2900))];
  assert.strictEqual(E.captureSelectionEvidence({ snapshot: snap(99), selection: { text: 'e', cueIds: ['y1', 'y2'] }, scope: 'watched', tracks: [{ ...source, cues: two }, second], now: 0 }).ok, true, '5800 ≤ 6000 kabul');
}
// 6) İz revizyonu değişimi: eski izle yakalama reddedilir
{
  assert.strictEqual(cap(15, { text: 'leave', cueIds: ['s1'] }, 'watched', { tracks: [{ ...source, revision: 'r2' }, second] }).code, 'stale-track');
  assert.strictEqual(cap(15, { text: 'leave', cueIds: ['s1'] }, 'watched', { snap: { sourceTrack: null } }).code, 'missing-source');
}
// 7) Kaynak ofseti: eşik medya zamanında uygulanır
{
  const shifted = { ...source, offsetSeconds: 2 }; // s1 bitişi 16.5
  assert.strictEqual(E.captureSelectionEvidence({ snapshot: snap(15), selection: { text: 'leave', cueIds: ['s1'] }, scope: 'watched', tracks: [shifted, second], now: 0 }).code, 'requires-scope-change');
  assert.strictEqual(E.captureSelectionEvidence({ snapshot: snap(17), selection: { text: 'leave', cueIds: ['s1'] }, scope: 'watched', tracks: [shifted, second], now: 0 }).ok, true);
}
// 8) Zaman bağlantısı: eski medyaya kör seek yok
{
  const env = cap(15, { text: 'leave', cueIds: ['s1'] }).envelope;
  assert.strictEqual(E.resolveTimeLink({ envelope: env, current: { mediaKey: 'M', generation: 2 } }).action, 'seek');
  assert.deepStrictEqual(E.resolveTimeLink({ envelope: env, current: { mediaKey: 'N', generation: 7 } }), { action: 'offer-open', reason: 'different-media' });
  assert.strictEqual(E.resolveTimeLink({ envelope: env, current: { mediaKey: 'M', generation: 3 } }).reason, 'generation-changed');
}
console.log('player-context-evidence.test.js: OK');
