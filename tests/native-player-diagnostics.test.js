// V3-T12 — istenen≠etkin hwdec, HDR dosya≠çıkış, 5.1 dosya≠çıkış, bayat örnek, sayaç sıfırlanması, redaksiyon.
const assert = require('node:assert');
const D = require('../src/native-player-diagnostics.js');

const S = (t, props) => ({ t, props });
const base = { 'hwdec-current': 'd3d11va', 'video-params/gamma': 'pq', 'audio-params/channel-count': 6, 'audio-out-params/channel-count': 2 };

// 1) --hwdec=auto istenmiş ama etkin yok → donanım kanıtı değil
{
  const r = D.buildPlayerHealthReceipt({ samples: [S(9000, { ...base, 'hwdec-current': 'no' })], requestedHwdec: 'auto', now: 9500 });
  assert.strictEqual(r.decode.current.state, 'software'); assert.strictEqual(r.decode.requestedMatchesCurrent, false);
  const hw = D.buildPlayerHealthReceipt({ samples: [S(9000, base)], requestedHwdec: 'auto', now: 9500 });
  assert.strictEqual(hw.decode.current.api, 'd3d11va'); assert.strictEqual(hw.decode.requestedMatchesCurrent, true);
  assert.strictEqual(D.buildPlayerHealthReceipt({ samples: [S(9000, base)], requestedHwdec: 'nvdec', now: 9500 }).decode.requestedMatchesCurrent, false, 'özel istenen API ≠ etkin API');
  const unk = D.buildPlayerHealthReceipt({ samples: [S(9000, {})], requestedHwdec: 'auto', now: 9500 });
  assert.strictEqual(unk.decode.current.state, 'unknown'); assert.strictEqual(unk.decode.requestedMatchesCurrent, 'unknown', 'ölçülemeyen unknown kalır');
}
// 2) HDR dosyası HDR çıkışı değil; çıkış bilinmiyorsa unknown
{
  const r = D.buildPlayerHealthReceipt({ samples: [S(9000, { ...base, 'video-target-params/gamma': 'bt.1886' })], now: 9500 });
  assert.deepStrictEqual([r.hdr.fileIsHdr, r.hdr.outputIsHdr], [true, false]);
  assert.strictEqual(D.buildPlayerHealthReceipt({ samples: [S(9000, { ...base, 'video-out-params/gamma': 'pq' })], now: 9500 }).hdr.outputIsHdr, 'unknown');
  const converted = D.buildPlayerHealthReceipt({ samples: [S(9000, {
    ...base, 'video-dec-params/gamma': 'pq', 'video-params/gamma': 'bt.1886',
    'video-out-params/gamma': 'pq', 'video-target-params/gamma': 'gamma2.2'
  })], now: 9500 });
  assert.deepStrictEqual([converted.hdr.fileIsHdr, converted.hdr.outputIsHdr], [true, false]);
  assert.strictEqual(D.buildPlayerHealthReceipt({ samples: [S(9000, { ...base, 'video-target-params/gamma': 'hlg' })], now: 9500 }).hdr.outputIsHdr, true);
}
// 3) 5.1 dosya 5.1 çıkış değil
{
  const r = D.buildPlayerHealthReceipt({ samples: [S(9000, base)], now: 9500 });
  assert.deepStrictEqual([r.audio.fileChannels, r.audio.outputChannels, r.audio.surroundDelivered, r.audio.downmixed], [6, 2, false, true]);
  const ok = D.buildPlayerHealthReceipt({ samples: [S(9000, { ...base, 'audio-out-params/channel-count': 6 })], now: 9500 }); assert.strictEqual(ok.audio.surroundDelivered, true);
  assert.strictEqual(D.buildPlayerHealthReceipt({ samples: [S(9000, { 'audio-params/channel-count': 6 })], now: 9500 }).audio.surroundDelivered, 'unknown');
}
// 4) Takılma penceresi: sayaç farkı; sıfırlanma (azalış) son kesimden; pencere dışı örnek sayılmaz
{
  assert.strictEqual(D.counterDelta([1, 3, 3, 9]), 8); assert.strictEqual(D.counterDelta([5, 9, 2, 4]), 2, 'sıfırlanma sonrası kesim'); assert.strictEqual(D.counterDelta([4]), null); assert.strictEqual(D.counterDelta([null, null]), null);
  const samples = [S(2000, { 'frame-drop-count': 100 }), S(5000, { 'frame-drop-count': 110, 'paused-for-cache': true }), S(7000, { 'frame-drop-count': 114, avsync: -0.2 }), S(9000, { 'frame-drop-count': 120, avsync: 0.05, 'paused-for-cache': false })];
  const r = D.buildPlayerHealthReceipt({ samples, now: 9500, windowMs: 5000 });
  assert.strictEqual(r.samplesInWindow, 3, '5 sn pencere: t≥4500'); assert.strictEqual(r.stalls.droppedFrames, 10); assert.strictEqual(r.stalls.bufferingSamples, 1); assert.strictEqual(r.stalls.maxAvsyncSeconds, 0.2);
}
// 5) Bayat örnek reddedilir; veri yok; redaksiyon yol/URL sızdırmaz
{
  assert.strictEqual(D.buildPlayerHealthReceipt({ samples: [S(1000, base)], now: 9000 }).status, 'stale');
  assert.strictEqual(D.buildPlayerHealthReceipt({ samples: [], now: 1 }).status, 'no-data');
  const r = D.buildPlayerHealthReceipt({ samples: [S(9000, { ...base, 'hwdec-current': 'C:\\Users\\x\\video.mkv', 'audio-params/format': 'https://evil/x', 'video-params/gamma': '/home/u/f' })], now: 9500 });
  assert.strictEqual(JSON.stringify(r).match(/C:\\|https:|\/home/), null, 'yol/URL makbuza girmez'); assert.strictEqual(r.decode.current.api, null);
}
// 6) Toplayıcı: 1 Hz sınırlı halka; üst üste binen okuma yok; başlat/durdur; okunamayan örnek eklenmez
(async () => {
  let t = 10000; let calls = 0; let fail = false; let tickFn = null; const cancelled = [];
  const c = D.createDiagnosticsCollector({ readProperties: async () => { calls++; if (fail) throw new Error('mpv kapandı'); return { 'frame-drop-count': calls, 'hwdec-current': 'd3d11va', extra: 'yok sayılır' }; }, now: () => t, schedule: (fn, ms) => { tickFn = fn; assert.strictEqual(ms, 1000); return 1; }, cancel: (h) => cancelled.push(h) });
  c.start(); c.start(); assert.ok(c.running);
  for (let i = 0; i < 12; i++) { await c.tick(); t += 1000; }
  assert.strictEqual(c.size, 7, 'ceil(5000/1000)+2 = 7 ile sınırlı'); assert.strictEqual(c.receipt().status, 'ok');
  assert.ok(!('extra' in (c.receipt().props || {}))); fail = true; await c.tick(); assert.strictEqual(c.size, 7, 'hata örnek eklemez');
  t += 5000; assert.strictEqual(c.receipt().status, 'stale', 'okuma durunca fiş bayatlar');
  const slow = D.createDiagnosticsCollector({ readProperties: () => new Promise((r) => setTimeout(() => r({}), 20)), now: () => t }); await Promise.all([slow.tick(), slow.tick(), slow.tick()]); assert.strictEqual(slow.size, 1, 'üst üste binen okuma yok');
  c.stop(); assert.deepStrictEqual(cancelled, [1]); assert.strictEqual(c.size, 0); assert.ok(!c.running);
  assert.throws(() => D.createDiagnosticsCollector({}), TypeError);
  console.log('native-player-diagnostics.test.js: OK');
})().catch((e) => { console.error(e); process.exit(1); });
