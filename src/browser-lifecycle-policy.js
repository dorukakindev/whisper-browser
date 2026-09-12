'use strict';

const RETRYABLE_NET_ERRORS = new Set([
  -7, -21, -100, -101, -102, -105, -106, -118, -137, -138, -352,
]);
const LOAD_RETRY_DELAYS_MS = Object.freeze([10000, 30000, 60000]);
const SUBTITLE_RETRY_DELAYS_MS = Object.freeze([250, 1000, 3000]);

function finiteInt(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.trunc(number) : fallback;
}

function navigationRetryPolicy(input = {}) {
  const attempt = Math.max(0, finiteInt(input.attempt));
  const code = finiteInt(input.code, NaN);
  const status = finiteInt(input.status, 0);
  const retryAfterMs = Math.max(0, finiteInt(input.retryAfterMs));
  const url = String(input.url || '');
  if (status === 404) return { action: 'terminal', reason: 'http-404', delayMs: 0 };
  if (status === 403 && /[?&](?:sig|signature|token|expires?|x-amz-|x-goog-)/i.test(url)) {
    return { action: 'refresh-manifest', reason: 'signed-url-expired', delayMs: 0 };
  }
  const retryable = status === 429 || status >= 500 || RETRYABLE_NET_ERRORS.has(code);
  if (!retryable || attempt >= LOAD_RETRY_DELAYS_MS.length) {
    return { action: 'terminal', reason: retryable ? 'retry-limit' : 'not-retryable', delayMs: 0 };
  }
  const delayMs = status === 429 && retryAfterMs
    ? Math.min(5 * 60 * 1000, retryAfterMs) : LOAD_RETRY_DELAYS_MS[attempt];
  return { action: 'retry', reason: status ? `http-${status}` : `net-${code}`, delayMs,
    nextAttempt: attempt + 1 };
}

function parseRetryAfterMs(value, now = Date.now()) {
  const text = String(value == null ? '' : value).trim();
  if (!text) return 0;
  if (/^\d+(?:\.\d+)?$/.test(text)) {
    return Math.min(5 * 60 * 1000, Math.max(0, Math.ceil(Number(text) * 1000)));
  }
  const target = Date.parse(text);
  const current = Number(now);
  if (!Number.isFinite(target) || !Number.isFinite(current)) return 0;
  return Math.min(5 * 60 * 1000, Math.max(0, target - current));
}

function subtitleRequestRetryPolicy(input = {}) {
  const attempt = Math.max(0, finiteInt(input.attempt));
  const status = finiteInt(input.status, 0);
  const retryAfterMs = Math.max(0, finiteInt(input.retryAfterMs));
  const url = String(input.url || '');
  if (status === 404) return { action: 'terminal', reason: 'http-404', delayMs: 0 };
  if (status === 403 && /[?&](?:sig|signature|token|expires?|x-amz-|x-goog-)/i.test(url)) {
    return { action: 'refresh-manifest', reason: 'signed-url-expired', delayMs: 0 };
  }
  const retryable = status === 429 || status >= 500 || input.retryable === true;
  if (!retryable || attempt >= SUBTITLE_RETRY_DELAYS_MS.length) {
    return { action: 'terminal', reason: retryable ? 'retry-limit' : 'not-retryable', delayMs: 0 };
  }
  const delayMs = status === 429 && retryAfterMs
    ? retryAfterMs : SUBTITLE_RETRY_DELAYS_MS[attempt];
  return { action: 'retry', reason: status ? `http-${status}` : 'network', delayMs,
    nextAttempt: attempt + 1 };
}

function crashRecoveryPolicy(reasonValue) {
  const reason = String(reasonValue || 'crashed').toLowerCase();
  if (reason === 'clean-exit') return { action: 'ignore', reason, severity: 'none', message: '' };
  const memory = ['oom', 'memory-eviction'].includes(reason);
  const recoverable = ['crashed', 'killed', 'abnormal-exit', 'oom', 'memory-eviction'].includes(reason);
  return {
    action: recoverable ? 'recreate-once' : 'manual-reload',
    reason,
    severity: memory ? 'memory' : 'crash',
    message: memory
      ? 'Sekmenin web işlemi bellek baskısı nedeniyle kapandı. URL ve oturum kaydı korundu; sekme bir kez yeniden oluşturulacak.'
      : recoverable
        ? 'Sekmenin web işlemi beklenmedik biçimde kapandı. URL ve oturum kaydı korundu; sekme bir kez yeniden oluşturulacak.'
        : `Sekmenin web işlemi kapandı (${reason}). URL korundu; yeniden yüklemeyi kullanıcı başlatabilir.`,
  };
}

module.exports = {
  LOAD_RETRY_DELAYS_MS,
  SUBTITLE_RETRY_DELAYS_MS,
  RETRYABLE_NET_ERRORS,
  crashRecoveryPolicy,
  navigationRetryPolicy,
  parseRetryAfterMs,
  subtitleRequestRetryPolicy,
};
