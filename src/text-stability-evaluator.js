'use strict';

function finite(value, fallback) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

class TextStabilityEvaluator {
  constructor(options = {}) {
    this.settleDelayMs = Math.max(50, finite(options.settleDelayMs, 650));
    this.maxWaitMs = Math.max(this.settleDelayMs, finite(options.maxWaitMs, 5000));
    this.duplicateWindowMs = Math.max(0, finite(options.duplicateWindowMs, 1500));
    this.maxPendingCandidates = Math.max(1, Math.trunc(finite(options.maxPendingCandidates, 64)));
    this.candidates = new Map();
  }

  observe(candidate = {}, now = Date.now()) {
    const key = String(candidate.scopeId || candidate.sourceId || candidate.itemId || '');
    if (!key) return { state: 'cancelled', reason: 'missing_identity', explanation: 'Aday kimliği bulunamadı.' };
    const text = String(candidate.normalizedText ?? candidate.text ?? '').trim();
    if (!text && candidate.intentionalEmpty !== true) {
      return { state: 'waiting', reason: 'empty_text', explanation: 'Metin henüz oluşmadı.' };
    }
    const time = finite(now, Date.now());
    const revision = Math.max(0, Math.trunc(finite(candidate.revision, 0)));
    const fingerprint = String(candidate.fingerprint || text);
    const previous = this.candidates.get(key);
    if (!previous) {
      if (this.candidates.size >= this.maxPendingCandidates) {
        const oldest = [...this.candidates.entries()].sort((a, b) => a[1].lastChangedAt - b[1].lastChangedAt)[0];
        if (oldest) this.candidates.delete(oldest[0]);
      }
      this.candidates.set(key, { fingerprint, revision, firstSeenAt: time, lastChangedAt: time, stableSince: time });
      return { state: 'waiting', reason: 'new_text', explanation: 'Metin sabitleniyor.', revision };
    }
    if (previous.fingerprint !== fingerprint || revision > previous.revision) {
      previous.fingerprint = fingerprint;
      previous.revision = revision;
      previous.lastChangedAt = time;
      previous.stableSince = time;
      delete previous.publishedAt;
      return { state: 'waiting', reason: 'changed', explanation: 'Yeni sürüm geldi; son metin bekleniyor.', revision };
    }
    const age = Math.max(0, time - previous.stableSince);
    const waited = Math.max(0, time - previous.firstSeenAt);
    if (age < this.settleDelayMs && waited < this.maxWaitMs) {
      return { state: 'waiting', reason: 'settle_delay', explanation: 'Metin henüz yeterince uzun süre değişmeden kalmadı.', revision };
    }
    if (age >= this.settleDelayMs || waited >= this.maxWaitMs) {
      if (previous.publishedAt != null) {
        return { state: 'duplicate', reason: 'already_published', explanation: 'Aynı sabit metin zaten işlendi.', revision };
      }
      previous.publishedAt = time;
      return { state: 'stable', reason: waited >= this.maxWaitMs ? 'max_wait' : 'settled', explanation: 'Metin sabitlendi; işlenebilir.', revision };
    }
    return { state: 'waiting', reason: 'pending', explanation: 'Metin bekleniyor.', revision };
  }

  cancel(key, reason = 'cancelled') {
    this.candidates.delete(String(key || ''));
    return { state: 'cancelled', reason, explanation: 'Bekleyen aday iptal edildi.' };
  }

  clear() { this.candidates.clear(); }
}

module.exports = { TextStabilityEvaluator };