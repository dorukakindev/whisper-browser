// player-workspace-model — tek komut geçidi: stale-source/stale-track, A–B 0.25, geç cevap, abonelik.
const assert = require('node:assert');
const W = require('../src/renderer/player-workspace-model.js');

function harness(over = {}) {
  const state = {
    snap: {
      mediaKey: 'A', generation: 1, engine: 'html', title: 'A', sourceKind: 'local', time: 15, duration: 600, state: 'paused', paused: true, rate: 1,
      sourceTrack: { id: 'S', revision: 'r1', language: 'en', origin: 'human', offsetSeconds: 0 },
      secondaryTrack: { id: 'T', revision: 'r1', language: 'tr', origin: 'machine-translation', offsetSeconds: 0 },
      activeCueId: 's1', capabilities: { seek: { support: 'yes' } },
    },
    role: { trackId: 'S', trackRevision: 'r1', channel: 0, offsetSeconds: 0, cues: [{ id: 's1', start: 10, end: 14, text: 'x' }], activeCueId: 's1' },
    calls: [], listeners: new Set(), exec: async (c) => { state.calls.push(c); return { ok: true, applied: true, owner: c }; },
  };
  Object.assign(state, over);
  const bridge = W.createPlayerWorkspaceBridge({
    readSnapshot: () => state.snap, resolveSourceRole: () => state.role,
    executeExisting: (c) => state.exec(c), subscribeExisting: (l) => { state.listeners.add(l); return () => state.listeners.delete(l); },
  });
  return { state, bridge };
}
const own = (extra) => ({ mediaKey: 'A', generation: 1, ...extra });
(async () => {
  // 1) Hızlı A→B: A nesil 1 komutu B (nesil 2) üzerinde reddedilir, motor çağrısı 0
  {
    const { state, bridge } = harness();
    state.snap = { ...state.snap, mediaKey: 'B', generation: 2 };
    const r = await bridge.dispatch(own({ type: 'seekCue', cueId: 's1', trackId: 'S', trackRevision: 'r1', playback: 'preserve' }));
    assert.deepStrictEqual([r.ok, r.code], [false, 'stale-source']); assert.strictEqual(state.calls.length, 0);
    // Aynı medya yeniden açıldı (nesil değişti) de eskidir
    state.snap = { ...state.snap, mediaKey: 'A', generation: 5 };
    assert.strictEqual((await bridge.dispatch(own({ type: 'pause' }))).code, 'stale-source');
  }
  // 2) Aynı nesilde iz değişti → stale-track; ham seek iz referansı istemez
  {
    const { state, bridge } = harness();
    const r = await bridge.dispatch(own({ type: 'nextCue', trackId: 'S', trackRevision: 'r0' }));
    assert.strictEqual(r.code, 'stale-track'); assert.strictEqual(state.calls.length, 0);
    assert.strictEqual((await bridge.dispatch(own({ type: 'seek', time: 30 }))).ok, true);
    const off = await bridge.dispatch(own({ type: 'setTrackOffset', trackId: 'T', revision: 'rX', offsetSeconds: 0.5 }));
    assert.strictEqual(off.code, 'stale-track', 'ofset de revizyon denetler');
    assert.strictEqual((await bridge.dispatch(own({ type: 'setTrackOffset', trackId: 'T', revision: 'r1', offsetSeconds: 0.5 }))).ok, true);
    assert.strictEqual((await bridge.dispatch(own({ type: 'seekCue', cueId: 'yok', trackId: 'S', trackRevision: 'r1', playback: 'play' }))).code, 'unknown-cue');
    state.role = null;
    assert.strictEqual((await bridge.dispatch(own({ type: 'replay', trackId: 'S', trackRevision: 'r1' }))).code, 'stale-track', 'kaynak rolü yoksa komut gitmez');
  }
  // 3) A–B: 0.25 dahil kabul, altı ret; NaN/negatif/medya sonu aşan ret
  {
    const { state, bridge } = harness();
    assert.strictEqual((await bridge.dispatch(own({ type: 'setAB', a: 10, b: 10.25 }))).ok, true, '0.25 tam kabul');
    assert.strictEqual((await bridge.dispatch(own({ type: 'setAB', a: 10, b: 10.24 }))).code, 'invalid-range');
    assert.strictEqual((await bridge.dispatch(own({ type: 'setAB', a: NaN, b: 20 }))).code, 'invalid-range');
    assert.strictEqual((await bridge.dispatch(own({ type: 'setAB', a: -1, b: 20 }))).code, 'invalid-range');
    assert.strictEqual((await bridge.dispatch(own({ type: 'setAB', a: 590, b: 601 }))).code, 'invalid-range', 'medya sonunu aşar');
    assert.strictEqual(state.calls.length, 1);
    assert.ok(W.validateAbRange(1, 1.25) && !W.validateAbRange(1, 1.2499));
  }
  // 4) Aralık/hız/yetenek
  {
    const { state, bridge } = harness();
    assert.strictEqual((await bridge.dispatch(own({ type: 'setRate', rate: 9 }))).code, 'invalid-range');
    assert.strictEqual((await bridge.dispatch(own({ type: 'setRate', rate: 1.25 }))).ok, true);
    assert.strictEqual((await bridge.dispatch(own({ type: 'seek', time: -3 }))).code, 'invalid-range');
    assert.strictEqual((await bridge.dispatch({ type: 'pause' })).code, 'stale-source', 'sahibi olmayan komut reddedilir');
    state.snap = { ...state.snap, capabilities: { seek: { support: 'no' } } };
    assert.strictEqual((await bridge.dispatch(own({ type: 'seek', time: 5 }))).code, 'unsupported');
    assert.strictEqual((await bridge.dispatch(own({ type: 'play' }))).ok, true, 'seek gerektirmeyen komut geçer');
  }
  // 5) Geç cevap: motor yanıtlarken kaynak değiştiyse uygulanmış sayılmaz
  {
    const { state, bridge } = harness();
    state.exec = async (c) => { state.calls.push(c); state.snap = { ...state.snap, mediaKey: 'B', generation: 2 }; return { ok: true, applied: true }; };
    assert.strictEqual((await bridge.dispatch(own({ type: 'seek', time: 5 }))).code, 'stale-source');
  }
  // 6) Motor reddi/hatası görünür; geçersiz sonuç engine-error; applied yalnız kabul
  {
    const { state, bridge } = harness();
    state.exec = async () => ({ ok: false, code: 'engine-error', message: 'mpv zaman aşımı' });
    const r = await bridge.dispatch(own({ type: 'seek', time: 5 })); assert.deepStrictEqual([r.ok, r.code], [false, 'engine-error']);
    state.exec = async () => { throw new Error('boom'); };
    assert.strictEqual((await bridge.dispatch(own({ type: 'play' }))).message, 'boom');
    state.exec = async () => undefined;
    assert.strictEqual((await bridge.dispatch(own({ type: 'play' }))).code, 'engine-error');
  }
  // 7) Snapshot değiştirilemez; çıktıyı değiştirmek gerçek player'ı değiştirmez
  {
    const { state, bridge } = harness();
    const s = bridge.getSnapshot(); assert.throws(() => { 'use strict'; s.time = 99; }, TypeError); assert.strictEqual(state.snap.time, 15);
  }
  // 8) Abonelik: aynı durumda her tick yayılmaz; ≥0.25 sn veya durum değişimi yayılır; dispose temizler
  {
    const { state, bridge } = harness();
    const seen = []; const off = bridge.subscribe((s) => seen.push(s.time));
    const tick = () => state.listeners.forEach((l) => l());
    tick(); assert.strictEqual(seen.length, 1, 'ilk yayın');
    state.snap = { ...state.snap, time: 15.05 }; tick(); assert.strictEqual(seen.length, 1, 'küçük zaman sıçraması yayılmaz');
    state.snap = { ...state.snap, time: 15.4 }; tick(); assert.strictEqual(seen.length, 2);
    state.snap = { ...state.snap, paused: false, state: 'playing' }; tick(); assert.strictEqual(seen.length, 3, 'durum değişimi hemen');
    off(); assert.strictEqual(state.listeners.size, 0);
    bridge.subscribe(() => seen.push('x')); bridge.dispose(); assert.strictEqual(state.listeners.size, 0);
    assert.strictEqual((await bridge.dispatch(own({ type: 'play' }))).code, 'stale-source', 'dispose sonrası komut yok');
  }
  console.log('player-workspace-model.test.js: OK');
})().catch((e) => { console.error(e); process.exit(1); });
