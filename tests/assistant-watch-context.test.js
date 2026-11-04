// V3-T10/T11 — dondurulmuş soru anı, spoiler ufku, bilinmeyen yetenek kapalı, capture temizliği.
const assert = require('node:assert');
const W = require('../src/renderer/assistant-watch-context.js');

const cue = (id, s, e, t) => ({ id, start: s, end: e, text: t });
const track = { id: 'S', revision: 'r1', offsetSeconds: 0, cues: [cue('a', 600, 610, 'Eski satır'), cue('b', 700, 708, 'Soru anından önce'), cue('c', 755, 765, 'Şu an konuşuluyor'), cue('d', 790, 795, 'Gelecek sızıntısı')] };
const snap = (time, extra = {}) => ({ mediaKey: 'M', generation: 1, time, activeCueId: 'c', sourceTrack: { id: 'S', revision: 'r1' }, ...extra });

// 1) 12:43 (763 sn) sorusu 12:58'e taşınmaz: ufuk dondurulur
{
  const anchor = W.freezeWatchAnchor({ snapshot: snap(763), question: 'Bu kim?', now: 0 });
  assert.strictEqual(anchor.horizon, 763); assert.ok(Object.isFrozen(anchor));
  const later = W.buildWatchContext({ anchor, track, options: { windowSeconds: 100 } });
  assert.deepStrictEqual(later.cues.map((c) => c.cueId), ['b'], 'c bitişi 765 > 763 → kısmi, dışarıda; d gelecek');
  assert.ok(later.limitations.includes('active-cue-partial-excluded')); assert.ok(!JSON.stringify(later).includes('Gelecek sızıntısı'));
  assert.deepStrictEqual(later.actions, [], 'otomatik seek/eylem yok'); assert.ok(later.identityRule.includes('tanıma'));
  assert.strictEqual(W.buildWatchContext({ anchor: W.freezeWatchAnchor({ snapshot: snap(778), question: 'x', now: 0 }), track, options: { windowSeconds: 100 } }).cues.length, 2, 'ufuk yalnız yeni soruda ilerler');
}
// 2) Pencere sınırı: windowSeconds geriye; sayı/karakter bütçesi açık sınırlama
{
  const anchor = W.freezeWatchAnchor({ snapshot: snap(800), question: 'q', now: 0 });
  assert.deepStrictEqual(W.buildWatchContext({ anchor, track, options: { windowSeconds: 50 } }).cues.map((c) => c.cueId), ['c', 'd'], 'son 50 sn');
  const many = { ...track, cues: Array.from({ length: 60 }, (_, i) => cue('k' + i, i * 10, i * 10 + 5, 'x'.repeat(10))) };
  const a2 = W.freezeWatchAnchor({ snapshot: snap(1000), question: 'q', now: 0 });
  const r = W.buildWatchContext({ anchor: a2, track: many, options: { windowSeconds: 10000, maxCues: 10 } }); assert.strictEqual(r.cues.length, 10); assert.ok(r.limitations.includes('window-trimmed-by-count'));
  const r2 = W.buildWatchContext({ anchor: a2, track: many, options: { windowSeconds: 10000, maxChars: 35 } }); assert.strictEqual(r2.cues.length, 3); assert.ok(r2.limitations.includes('window-trimmed-by-chars'));
  assert.strictEqual(r2.cues[r2.cues.length - 1].cueId, 'k59', 'en yeni satırlar korunur');
}
// 3) Katalog bilgisi yalnız ufukta güvenli işaretliyse; yoksa gizlenir ve belirtilir
{
  const anchor = W.freezeWatchAnchor({ snapshot: snap(763), question: 'q', now: 0 });
  const r = W.buildWatchContext({ anchor, track, catalogFacts: [{ text: 'Kurgu: 1984, Tokyo', safeAtHorizon: true }, { text: 'Final sürprizi', safeAtHorizon: false }] });
  assert.deepStrictEqual(r.catalogFacts, ['Kurgu: 1984, Tokyo']); assert.ok(r.limitations.includes('catalog-facts-withheld-spoiler'));
}
// 4) Geçerlilik: medya/nesil/iz revizyonu değişirse eski; iz revizyonu uyuşmazsa bağlam üretilmez
{
  const anchor = W.freezeWatchAnchor({ snapshot: snap(763), question: 'q', now: 0 });
  assert.ok(W.anchorStillValid(anchor, snap(900)));
  assert.ok(!W.anchorStillValid(anchor, snap(763, { generation: 2 }))); assert.ok(!W.anchorStillValid(anchor, snap(763, { mediaKey: 'N' })));
  assert.ok(!W.anchorStillValid(anchor, snap(763, { sourceTrack: { id: 'S', revision: 'r2' } })));
  assert.strictEqual(W.buildWatchContext({ anchor, track: { ...track, revision: 'r2' } }).code, 'stale-track');
  assert.strictEqual(W.freezeWatchAnchor({ snapshot: { mediaKey: 'M' }, question: 'q' }).code, 'missing-source');
}
// 5) Sağlayıcı yeteneği: bilinmeyen image/audio KAPALI; metin yolu tam
{
  const cap = W.resolveProviderCapability({ provider: 'custom-chat', declared: {} });
  assert.deepStrictEqual([cap.text, cap.image, cap.audio, cap.imageUnknown, cap.audioUnknown], [true, false, false, true, true]);
  assert.ok(!W.canSendFrame(cap) && !W.canSendAudio(cap));
  const vis = W.resolveProviderCapability({ provider: 'p', declared: { p: { image: true } } }); assert.ok(W.canSendFrame(vis)); assert.ok(!W.canSendAudio(vis));
  assert.ok(W.assertSameHost('https://api.example.com/v1/chat', 'API.example.com')); assert.ok(!W.assertSameHost('https://evil.example.net/v1', 'api.example.com')); assert.ok(!W.assertSameHost('çöp', 'x'));
}
// 6) Capture: açık tek kaynak; süre bitince/durdurunca temizlenir; çift başlatma yok
(async () => {
  const log = []; let fire = null;
  const s = W.createCaptureSession({ kind: 'frame', source: 'tab-1', start: async () => { log.push('start'); return { id: 'h1' }; }, stop: async (h, why) => { log.push('stop:' + why); }, schedule: (fn) => { fire = fn; return 7; }, cancel: () => log.push('cancel') });
  assert.deepStrictEqual(await s.begin(), { ok: true, kind: 'frame', maxSeconds: 30 }); assert.strictEqual((await s.begin()).code, 'already-active');
  fire(); await new Promise((r) => setImmediate(r)); assert.ok(log.includes('stop:expired') && !s.active, 'izin süresi bitince oturum kapanır');
  const s2 = W.createCaptureSession({ kind: 'audio', source: null, start: async () => ({}), stop: async () => {} }); assert.strictEqual((await s2.begin()).code, 'no-explicit-source');
  const s3 = W.createCaptureSession({ kind: 'frame', source: 't', start: async () => ({}), stop: async (h, w) => log.push('s3:' + w), schedule: () => 1, cancel: () => log.push('c3') });
  await s3.begin(); await s3.end(); assert.ok(log.includes('c3') && log.includes('s3:stopped')); assert.strictEqual((await s3.end()).noop, true);
  console.log('assistant-watch-context.test.js: OK');
})().catch((e) => { console.error(e); process.exit(1); });
