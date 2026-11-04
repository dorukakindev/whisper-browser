/* V3-T10/T11 — İzlerken asistan: soru anı + spoiler ufku DONDURULUR; geçmiş pencere sınırlı; otomatik seek yok.
   Katalog oyuncu bilgisi karedeki kişiyi doğrulamaz; yüz/kimlik tahmini YOK. Bilinmeyen medya yeteneği kapalıdır
   (bilinmeyen image/audio için byte gönderilmez). Google Live örneği mevcut chat/completions'a kopyalanamaz. */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.AssistantWatchContext = api;
})(globalThis, () => {
  'use strict';

  const NO_IDENTITY_RULE = 'Görüntüdeki gerçek kişileri tanıma veya adlandırma; yalnız görünür sahneyi betimle. İsim bağlantısı yalnız bağımsız replik, kullanıcı atfı veya katalog kanıtına dayanır.';
  const DEFAULTS = Object.freeze({ windowSeconds: 120, maxCues: 40, maxChars: 6000 });
  const EPS = 1e-9;

  /** Soru anında dondurur: sonradan oynatma ilerlese de ufuk genişlemez (12:43 sorusu 12:58'e taşınmaz). */
  function freezeWatchAnchor({ snapshot, question, now }) {
    if (!snapshot || !snapshot.sourceTrack) return { ok: false, code: 'missing-source' };
    return Object.freeze({
      ok: true, schema: 'watch-anchor-v1', mediaKey: snapshot.mediaKey, generation: snapshot.generation,
      sourceTrackId: snapshot.sourceTrack.id, sourceRevision: snapshot.sourceTrack.revision,
      horizon: Number.isFinite(snapshot.time) ? snapshot.time : 0, activeCueId: snapshot.activeCueId || null,
      question: String(question || '').slice(0, 2000), askedAt: new Date(typeof now === 'number' ? now : Date.now()).toISOString(),
    });
  }
  /** Medya/nesil/iz revizyonu değiştiyse bağlam eskidir (çalışan istek başka bağlama boyanmaz). */
  function anchorStillValid(anchor, snapshot) {
    return !!anchor && !!snapshot && !!snapshot.sourceTrack && anchor.mediaKey === snapshot.mediaKey && anchor.generation === snapshot.generation
      && anchor.sourceTrackId === snapshot.sourceTrack.id && anchor.sourceRevision === snapshot.sourceTrack.revision;
  }

  /**
   * Geçmiş pencere: bitişi ufku aşmayan tam cue'lar, ufuktan geriye windowSeconds; gelecekteki cue/metadata dışarıda.
   * catalogFacts: [{text, safeAtHorizon:boolean}] — yalnız güvenli işaretliler; kimlik doğrulaması vaat edilmez.
   */
  function buildWatchContext({ anchor, track, catalogFacts = [], options = {} }) {
    if (!anchor || !track) return { ok: false, code: 'missing-input' };
    if (track.id !== anchor.sourceTrackId || track.revision !== anchor.sourceRevision) return { ok: false, code: 'stale-track' };
    const o = { ...DEFAULTS, ...options }; const off = Number.isFinite(track.offsetSeconds) ? track.offsetSeconds : 0;
    const from = anchor.horizon - o.windowSeconds;
    let past = (track.cues || []).map((c) => ({ cueId: c.id, text: c.text, videoStart: c.start + off, videoEnd: c.end + off }))
      .filter((c) => c.videoEnd <= anchor.horizon + EPS && c.videoEnd >= from).sort((a, b) => a.videoStart - b.videoStart);
    const limitations = ['transcript-only', 'no-auto-seek'];
    if (past.length > o.maxCues) { past = past.slice(-o.maxCues); limitations.push('window-trimmed-by-count'); }
    let chars = 0; const kept = [];
    for (let i = past.length - 1; i >= 0; i--) { chars += past[i].text.length; if (chars > o.maxChars) { limitations.push('window-trimmed-by-chars'); break; } kept.unshift(past[i]); }
    const facts = catalogFacts.filter((f) => f && f.safeAtHorizon === true).map((f) => String(f.text).slice(0, 400));
    if (catalogFacts.length !== facts.length) limitations.push('catalog-facts-withheld-spoiler');
    const active = (track.cues || []).find((c) => c.id === anchor.activeCueId);
    const partial = !!active && active.end + off > anchor.horizon + EPS;
    if (partial) limitations.push('active-cue-partial-excluded');
    return Object.freeze({ ok: true, anchor, horizon: anchor.horizon, cues: kept, catalogFacts: facts, limitations: Array.from(new Set(limitations)), actions: Object.freeze([]), identityRule: NO_IDENTITY_RULE });
  }

  // ---- T11: sağlayıcı yeteneği ve açık capture oturumu -------------------------------------------------
  /** declared: ayarlardan/kanıttan gelen açık yetenekler; bilinmeyen = kapalı. */
  function resolveProviderCapability({ provider, declared }) {
    const d = declared && declared[provider] ? declared[provider] : {};
    const yes = (v) => v === true;
    return Object.freeze({ provider: String(provider || ''), text: d.text !== false, image: yes(d.image), audio: yes(d.audio), imageUnknown: d.image === undefined, audioUnknown: d.audio === undefined });
  }
  const canSendFrame = (cap) => !!cap && cap.image === true;
  const canSendAudio = (cap) => !!cap && cap.audio === true;
  /** API anahtarı yalnız yapılandırılmış host'a gider. */
  function assertSameHost(endpoint, allowedHost) {
    try { return new URL(endpoint).hostname.toLowerCase() === String(allowedHost || '').toLowerCase(); } catch (_) { return false; }
  }

  /**
   * Açık, tek kaynaklı capture oturumu: izin süresi bitince veya durdurulunca timer + track temizlenir.
   * start/stop/schedule/cancel enjekte edilir (Electron/getDisplayMedia bu dosyada yok).
   */
  function createCaptureSession({ kind, source, start, stop, schedule = setTimeout, cancel = clearTimeout, maxSeconds = 30 }) {
    let active = false; let timer = null; let handle = null;
    return {
      async begin() {
        if (active) return { ok: false, code: 'already-active' };
        if (!source) return { ok: false, code: 'no-explicit-source' };
        handle = await start({ kind, source }); active = true;
        timer = schedule(() => { this.end('expired'); }, maxSeconds * 1000);
        return { ok: true, kind, maxSeconds };
      },
      async end(reason = 'stopped') {
        if (!active) return { ok: true, noop: true };
        active = false; if (timer) cancel(timer); timer = null;
        try { await stop(handle, reason); } finally { handle = null; }
        return { ok: true, reason };
      },
      get active() { return active; },
    };
  }
  return Object.freeze({ NO_IDENTITY_RULE, freezeWatchAnchor, anchorStillValid, buildWatchContext, resolveProviderCapability, canSendFrame, canSendAudio, assertSameHost, createCaptureSession });
});
