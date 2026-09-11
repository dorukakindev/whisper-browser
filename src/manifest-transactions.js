'use strict';

function headerValue(headers, name) {
  if (!headers) return '';
  if (typeof headers.get === 'function') return String(headers.get(name) || '');
  const wanted = String(name || '').toLowerCase();
  for (const [key, value] of Object.entries(headers)) {
    if (String(key).toLowerCase() === wanted) return String(value || '');
  }
  return '';
}

function manifestResponseMeta(candidate = {}) {
  const status = Number(candidate.status || candidate.statusCode || 0);
  const headers = candidate.responseHeaders || candidate.headers;
  return {
    key: String(candidate.key || candidate.manifestKey || candidate.finalUrl || candidate.url || ''),
    url: String(candidate.finalUrl || candidate.url || ''),
    requestUrl: String(candidate.requestUrl || ''),
    status: Number.isFinite(status) ? status : 0,
    etag: headerValue(headers, 'etag'),
    lastModified: headerValue(headers, 'last-modified'),
  };
}

function hasExpectedManifestRoot(body, kind) {
  const text = String(body || '').replace(/^\uFEFF/, '').trimStart();
  if (kind === 'hls') return /^#EXTM3U(?:\s|$)/i.test(text);
  if (kind === 'dash') {
    const withoutPreamble = text
      .replace(/^<\?xml\b[^>]*>\s*/i, '')
      .replace(/^(?:<!--[\s\S]*?-->\s*)+/, '')
      .replace(/^<!DOCTYPE\s+MPD\b[^>]*>\s*/i, '');
    return /^<MPD\b/i.test(withoutPreamble);
  }
  return false;
}

function isCompleteManifestBody(body, kind) {
  const text = String(body || '').replace(/^\uFEFF/, '').trim();
  if (!hasExpectedManifestRoot(text, kind)) return false;
  if (kind === 'dash') {
    return /(?:<MPD\b[^>]*\/\s*>|<\/MPD>)\s*(?:<!--[\s\S]*?-->\s*)*$/i.test(text);
  }
  if (kind === 'hls') {
    const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
    if (lines.length < 2) return false;
    for (const line of lines) {
      if (line.startsWith('#EXT') && (line.match(/"/g) || []).length % 2 !== 0) return false;
      if (line.endsWith(',') && !/^#EXTINF:/i.test(line)) return false;
    }
    return lines.slice(1).some((line) => !line.startsWith('#')
      || /^#EXTINF:/i.test(line)
      || /^#EXT-X-(?:STREAM-INF|I-FRAME-STREAM-INF|MEDIA|ENDLIST|PLAYLIST-TYPE|TARGETDURATION|SKIP)\b/i.test(line));
  }
  return false;
}

function manifestDeclaresSubtitleWork(body, kind) {
  const text = String(body || '');
  if (kind === 'hls') {
    return /#EXT-X-MEDIA:[^\r\n]*TYPE\s*=\s*"?SUBTITLES"?/i.test(text);
  }
  if (kind === 'dash') {
    return /<(?:AdaptationSet|Representation)\b[^>]*(?:contentType\s*=\s*["']text["']|mimeType\s*=\s*["'][^"']*(?:ttml|vtt|text)[^"']*["']|codecs\s*=\s*["'][^"']*(?:stpp|wvtt)[^"']*["'])/i.test(text);
  }
  return false;
}

class ManifestTransactionRegistry {
  constructor(options = {}) {
    this.maxAttempts = Math.max(1, Number(options.maxAttempts) || 3);
    this.baseDelayMs = Math.max(1, Number(options.baseDelayMs) || 500);
    this.maxDelayMs = Math.max(this.baseDelayMs, Number(options.maxDelayMs) || 8000);
    this.cooldownMs = Math.max(this.maxDelayMs, Number(options.cooldownMs) || 30000);
    this.maxEntries = Math.max(8, Number(options.maxEntries) || 128);
    this.now = typeof options.now === 'function' ? options.now : Date.now;
    this.epoch = 0;
    this.sequence = 0;
    this.successful = new Map();
    this.failures = new Map();
    this.inFlight = new Map();
  }

  _touch(map, key, value) {
    map.delete(key);
    map.set(key, value);
    while (map.size > this.maxEntries) map.delete(map.keys().next().value);
  }

  begin(candidate = {}) {
    const meta = manifestResponseMeta(candidate);
    const fingerprint = String(candidate.fingerprint || '');
    const now = this.now();
    const successful = this.successful.get(meta.key);

    if (!meta.key) return { action: 'invalid', reason: 'manifest-key-missing' };
    if (meta.status === 304) {
      if (!successful) return { action: 'missing-body', reason: 'not-modified-without-success' };
      const validatorChanged = (meta.etag && successful.etag && meta.etag !== successful.etag)
        || (meta.lastModified && successful.lastModified
          && meta.lastModified !== successful.lastModified);
      if (validatorChanged) {
        return { action: 'missing-body', reason: 'not-modified-validator-mismatch' };
      }
      this._touch(this.successful, meta.key, {
        ...successful,
        etag: meta.etag || successful.etag,
        lastModified: meta.lastModified || successful.lastModified,
        checkedAt: now,
      });
      return { action: 'not-modified', successful };
    }
    if (!fingerprint) return { action: 'missing-body', reason: 'manifest-body-missing' };
    if (successful && successful.fingerprint === fingerprint) {
      this._touch(this.successful, meta.key, {
        ...successful,
        etag: meta.etag || successful.etag,
        lastModified: meta.lastModified || successful.lastModified,
        checkedAt: now,
      });
      return { action: 'duplicate', successful };
    }

    const token = `${meta.key}|${fingerprint}`;
    const active = this.inFlight.get(token);
    if (active) {
      return { action: 'in-flight', retryAfterMs: this.baseDelayMs, transaction: active };
    }

    let failure = this.failures.get(token);
    if (failure && failure.nextAttemptAt > now) {
      return {
        action: failure.attempts >= this.maxAttempts ? 'cooldown' : 'backoff',
        attempts: failure.attempts,
        retryAfterMs: failure.nextAttemptAt - now,
      };
    }
    if (failure && failure.attempts >= this.maxAttempts) {
      this.failures.delete(token);
      failure = null;
    }

    const transaction = {
      id: ++this.sequence,
      epoch: this.epoch,
      token,
      key: meta.key,
      fingerprint,
      meta,
      priorAttempts: failure ? failure.attempts : 0,
      startedAt: now,
    };
    this.inFlight.set(token, transaction);
    return { action: 'process', transaction };
  }

  isActive(transaction) {
    return Boolean(transaction && transaction.epoch === this.epoch
      && this.inFlight.get(transaction.token) === transaction);
  }

  commit(transaction) {
    if (!this.isActive(transaction)) return false;
    this.inFlight.delete(transaction.token);
    this.failures.delete(transaction.token);
    this._touch(this.successful, transaction.key, {
      fingerprint: transaction.fingerprint,
      etag: transaction.meta.etag,
      lastModified: transaction.meta.lastModified,
      url: transaction.meta.url,
      committedAt: this.now(),
    });
    return true;
  }

  fail(transaction, error) {
    if (!this.isActive(transaction)) return { action: 'cancelled', attempts: 0, retryAfterMs: 0 };
    this.inFlight.delete(transaction.token);
    const now = this.now();
    const attempts = transaction.priorAttempts + 1;
    const exhausted = attempts >= this.maxAttempts;
    const retryAfterMs = exhausted
      ? this.cooldownMs
      : Math.min(this.maxDelayMs, this.baseDelayMs * (2 ** (attempts - 1)));
    this._touch(this.failures, transaction.token, {
      attempts,
      nextAttemptAt: now + retryAfterMs,
      error: String(error && error.message || error || ''),
    });
    return { action: exhausted ? 'abandon' : 'retry', attempts, retryAfterMs };
  }

  cancel(transaction) {
    if (!this.isActive(transaction)) return false;
    this.inFlight.delete(transaction.token);
    return true;
  }

  reset() {
    this.epoch += 1;
    this.successful.clear();
    this.failures.clear();
    this.inFlight.clear();
  }

  snapshot() {
    return {
      epoch: this.epoch,
      successful: this.successful.size,
      failures: this.failures.size,
      inFlight: this.inFlight.size,
    };
  }
}

module.exports = {
  ManifestTransactionRegistry,
  hasExpectedManifestRoot,
  headerValue,
  isCompleteManifestBody,
  manifestDeclaresSubtitleWork,
  manifestResponseMeta,
};
