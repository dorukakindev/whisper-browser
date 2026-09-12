'use strict';

(function exposeHlsRecovery(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.WhisperHlsRecovery = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, () => {
  const RECOVERY_KINDS = ['network', 'media'];

  function positiveNumber(value, fallback) {
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
  }

  function createHlsRecoveryState(options = {}) {
    const limits = {
      network: Math.floor(positiveNumber(options.networkLimit, 2)),
      media: Math.floor(positiveNumber(options.mediaLimit, 2)),
    };
    const stableMs = positiveNumber(options.stableMs, 10000);
    const maxProgressGapMs = positiveNumber(options.maxProgressGapMs, 1500);
    const maxSeekJumpSeconds = positiveNumber(options.maxSeekJumpSeconds, 3);

    let epoch = 0;
    let tokenSeq = 0;
    let sourceId = '';
    let active = false;
    const attempts = { network: 0, media: 0 };
    const inFlight = { network: null, media: null };
    const stability = {
      tracking: false,
      elapsedMs: 0,
      lastClockMs: null,
      lastMediaTime: null,
    };

    function assertKind(kind) {
      if (!RECOVERY_KINDS.includes(kind)) throw new TypeError(`Bilinmeyen HLS kurtarma türü: ${kind}`);
    }

    function resetStability() {
      stability.tracking = false;
      stability.elapsedMs = 0;
      stability.lastClockMs = null;
      stability.lastMediaTime = null;
    }

    function invalidate(nextSourceId, nextActive) {
      epoch += 1;
      sourceId = String(nextSourceId || '');
      active = nextActive;
      attempts.network = 0;
      attempts.media = 0;
      inFlight.network = null;
      inFlight.media = null;
      resetStability();
      return epoch;
    }

    function sourceChanged(nextSourceId) {
      return invalidate(nextSourceId, true);
    }

    function deactivate() {
      return invalidate('', false);
    }

    function interruptStability() {
      resetStability();
    }

    function beginRecovery(kind) {
      assertKind(kind);
      interruptStability();
      if (!active) return { ok: false, reason: 'inactive', token: null };
      if (inFlight[kind]) return { ok: false, reason: 'in-flight', token: inFlight[kind] };
      if (attempts[kind] >= limits[kind]) return { ok: false, reason: 'exhausted', token: null };
      attempts[kind] += 1;
      const token = Object.freeze({ epoch, id: ++tokenSeq, kind, sourceId });
      inFlight[kind] = token;
      return { ok: true, reason: 'started', token, attempt: attempts[kind], limit: limits[kind] };
    }

    function isCurrent(token) {
      return !!token && active && token.epoch === epoch && token.sourceId === sourceId
        && RECOVERY_KINDS.includes(token.kind) && inFlight[token.kind] === token;
    }

    function completeRecovery(token) {
      if (!isCurrent(token)) return false;
      inFlight[token.kind] = null;
      return true;
    }

    function completeKind(kind) {
      assertKind(kind);
      return inFlight[kind] ? completeRecovery(inFlight[kind]) : false;
    }

    function playbackStarted(mediaTime, clockMs) {
      if (!active || !Number.isFinite(Number(mediaTime)) || !Number.isFinite(Number(clockMs))) return false;
      // Gerçek oynatma, bekleyen kurtarma komutunun başarı yüzeyidir. Haklar ancak
      // aşağıdaki kesintisiz ilerleme penceresi tamamlandığında geri verilir.
      inFlight.network = null;
      inFlight.media = null;
      stability.tracking = true;
      stability.elapsedMs = 0;
      stability.lastClockMs = Number(clockMs);
      stability.lastMediaTime = Number(mediaTime);
      return true;
    }

    function playbackProgress(mediaTime, clockMs, playbackRate = 1) {
      const now = Number(clockMs);
      const media = Number(mediaTime);
      if (!active || !stability.tracking || !Number.isFinite(now) || !Number.isFinite(media)) {
        return { stable: false, reset: false };
      }
      const wallDelta = now - stability.lastClockMs;
      const mediaDelta = media - stability.lastMediaTime;
      const rate = Math.min(4, Math.max(0.1, Math.abs(Number(playbackRate) || 1)));
      const plausibleJump = Math.max(maxSeekJumpSeconds, (wallDelta / 1000) * rate * 4);

      // Saatin geri gitmesi ve oynatma konumunun geriye/ileri sıçraması yeni bir
      // kararlılık penceresi başlatır. Aynı video karesinin birden çok kez
      // örneklenmesi ise ilerleme değildir ama önceki gerçek ilerlemeyi de silmez.
      if (wallDelta < 0 || mediaDelta < 0 || mediaDelta > plausibleJump) {
        stability.elapsedMs = 0;
        stability.lastClockMs = now;
        stability.lastMediaTime = media;
        return { stable: false, reset: false };
      }

      if (wallDelta === 0 || mediaDelta === 0) {
        stability.lastClockMs = now;
        stability.lastMediaTime = media;
        return { stable: false, reset: false };
      }

      // Arka plan sekmelerinde event aralığı maxProgressGapMs'yi aşabilir. Video
      // zamanı gerçekten ve makul ölçüde ilerlediyse bu aralığı körlemesine
      // sıfırlamak yerine medya ilerlemesiyle sınırlı süreyi say.
      const progressedMs = Math.min(wallDelta, (mediaDelta / rate) * 1000);
      stability.elapsedMs += Math.max(0, progressedMs);
      stability.lastClockMs = now;
      stability.lastMediaTime = media;
      if (stability.elapsedMs < stableMs) return { stable: false, reset: false };

      attempts.network = 0;
      attempts.media = 0;
      stability.elapsedMs = 0;
      return { stable: true, reset: true };
    }

    function snapshot() {
      return {
        active,
        epoch,
        sourceId,
        networkAttempts: attempts.network,
        mediaAttempts: attempts.media,
        networkInFlight: !!inFlight.network,
        mediaInFlight: !!inFlight.media,
        trackingStability: stability.tracking,
        stableElapsedMs: stability.elapsedMs,
      };
    }

    return {
      sourceChanged,
      deactivate,
      beginRecovery,
      completeRecovery,
      completeKind,
      isCurrent,
      playbackStarted,
      playbackProgress,
      interruptStability,
      snapshot,
    };
  }

  return { createHlsRecoveryState };
});
