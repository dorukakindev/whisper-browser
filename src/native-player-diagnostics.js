/* V3-T12 — Teknik oynatma fişi: mpv özelliklerinden SALT OKUNUR, sınırlı, redakte sağlık makbuzu.
   Ayrımlar (kanıt kuralları): istenen ≠ etkin hwdec; HDR dosyası ≠ HDR çıkışı; 5.1 dosya ≠ 5.1 ses çıkışı.
   Desteklenmeyen/okunamayan özellik 'unknown' kalır. Bayat örnek reddedilir. Yol/başlık/URL makbuza girmez.
   Panel açıkken 1 Hz, 5 sn pencere; ayar/sürücü değiştirmez. Okuma işlevi (readProperties) enjekte edilir. */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.NativePlayerDiagnostics = api;
})(globalThis, () => {
  'use strict';

  const PROPERTIES = Object.freeze([
    'hwdec-current', 'video-params/gamma', 'video-params/primaries', 'video-out-params/gamma',
    'audio-params/channel-count', 'audio-out-params/channel-count', 'audio-params/format', 'audio-out-params/format',
    'frame-drop-count', 'decoder-frame-drop-count', 'vo-delayed-frame-count', 'avsync', 'paused-for-cache', 'display-fps', 'estimated-vf-fps',
  ]);
  const HDR_GAMMA = new Set(['pq', 'hlg']);
  const DEFAULTS = Object.freeze({ windowMs: 5000, intervalMs: 1000 });
  const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
  const tag = (v) => (typeof v === 'string' && /^[A-Za-z0-9._+-]{1,24}$/.test(v) ? v : null); // yol/URL benzeri değerler elenir

  /** Sayaç dizisinin pencere içindeki artışı; azalış (sıfırlanma) görülürse son kesimden hesaplanır. */
  function counterDelta(values) {
    const v = values.filter((x) => x !== null);
    if (v.length < 2) return null;
    let start = 0;
    for (let i = 1; i < v.length; i++) if (v[i] < v[i - 1]) start = i;
    return v.length - start < 2 ? null : v[v.length - 1] - v[start];
  }

  function buildPlayerHealthReceipt({ samples, requestedHwdec, now, windowMs = DEFAULTS.windowMs, intervalMs = DEFAULTS.intervalMs }) {
    const list = (Array.isArray(samples) ? samples : []).filter((s) => s && typeof s.t === 'number').sort((a, b) => a.t - b.t);
    if (!list.length) return { status: 'no-data', stale: true };
    const last = list[list.length - 1];
    const staleAfter = intervalMs * 2.5;
    if (now - last.t > staleAfter) return { status: 'stale', stale: true, ageMs: now - last.t };
    const win = list.filter((s) => s.t >= now - windowMs);
    const p = last.props || {};
    const col = (name) => win.map((s) => num(s.props && s.props[name]));

    const cur = p['hwdec-current'];
    const decoder = cur === undefined || cur === null ? { state: 'unknown' } : (cur === 'no' || cur === '' ? { state: 'software' } : { state: 'hardware', api: tag(cur) });
    const requested = tag(requestedHwdec) || null;
    const fileGamma = tag(p['video-params/gamma']); const outGamma = tag(p['video-out-params/gamma']);
    const fileCh = num(p['audio-params/channel-count']); const outCh = num(p['audio-out-params/channel-count']);
    const avs = col('avsync').filter((x) => x !== null).map(Math.abs);
    return {
      status: 'ok', stale: false, sampledAt: last.t, windowSeconds: Math.round(windowMs / 1000), samplesInWindow: win.length,
      decode: { requested, current: decoder, requestedMatchesCurrent: requested === null || decoder.state === 'unknown' ? 'unknown' : (requested === 'auto' ? decoder.state === 'hardware' : decoder.api === requested) },
      hdr: {
        fileTransfer: fileGamma, fileIsHdr: fileGamma === null ? 'unknown' : HDR_GAMMA.has(fileGamma),
        outputTransfer: outGamma, outputIsHdr: outGamma === null ? 'unknown' : HDR_GAMMA.has(outGamma), // dosya HDR ≠ çıkış HDR
      },
      audio: {
        fileChannels: fileCh, outputChannels: outCh, fileFormat: tag(p['audio-params/format']), outputFormat: tag(p['audio-out-params/format']),
        surroundDelivered: fileCh === null || outCh === null ? 'unknown' : (fileCh > 2 && outCh >= fileCh), downmixed: fileCh !== null && outCh !== null && outCh < fileCh,
      },
      stalls: {
        droppedFrames: counterDelta(col('frame-drop-count')), decoderDropped: counterDelta(col('decoder-frame-drop-count')), delayedFrames: counterDelta(col('vo-delayed-frame-count')),
        bufferingSamples: win.filter((s) => s.props && s.props['paused-for-cache'] === true).length, maxAvsyncSeconds: avs.length ? Math.max(...avs) : null,
      },
      display: { displayFps: num(p['display-fps']), videoFps: num(p['estimated-vf-fps']) },
    };
  }

  function createDiagnosticsCollector({ readProperties, now = () => Date.now(), requestedHwdec = 'auto', windowMs = DEFAULTS.windowMs, intervalMs = DEFAULTS.intervalMs, schedule = setInterval, cancel = clearInterval }) {
    if (typeof readProperties !== 'function') throw new TypeError('readProperties gerekli');
    const samples = []; let timer = null; let reading = false;
    const keep = Math.ceil(windowMs / intervalMs) + 2;
    async function tick() {
      if (reading) return; reading = true; // üst üste binen okuma yok
      try {
        const raw = await readProperties(PROPERTIES.slice());
        const props = {};
        for (const name of PROPERTIES) if (raw && Object.prototype.hasOwnProperty.call(raw, name) && raw[name] !== undefined && raw[name] !== null) props[name] = raw[name];
        samples.push({ t: now(), props }); while (samples.length > keep) samples.shift();
      } catch (_) { /* okunamayan örnek eklenmez; fiş bayatlayınca 'stale' döner */ } finally { reading = false; }
    }
    return {
      tick, receipt: () => buildPlayerHealthReceipt({ samples, requestedHwdec, now: now(), windowMs, intervalMs }),
      start() { if (!timer) timer = schedule(tick, intervalMs); }, stop() { if (timer) { cancel(timer); timer = null; } samples.length = 0; },
      get running() { return timer !== null; }, get size() { return samples.length; },
    };
  }
  return Object.freeze({ PROPERTIES, counterDelta, buildPlayerHealthReceipt, createDiagnosticsCollector });
});
