const { createHash } = require('crypto');
const { redactCaptureUrl } = require('./browser-adapters');

const BROWSER_CAPTURE_BODY_LIMIT = 12 * 1024 * 1024;
const BROWSER_CAPTURE_CANDIDATE_TTL = 30_000;
const BROWSER_CAPTURE_CANDIDATE_LIMIT = 320;
const BROWSER_CAPTURE_DEDUPE_TTL = 2 * 60_000;
const BROWSER_CAPTURE_DEDUPE_LIMIT = 512;
const SAFE_RESPONSE_HEADERS = new Set([
  'cache-control', 'content-encoding', 'content-language', 'content-length',
  'content-range', 'content-type', 'etag', 'last-modified',
]);

function cleanText(value, max = 512) {
  return String(value == null ? '' : value).trim().slice(0, max);
}

function finiteNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function safeResponseHeaders(raw = {}) {
  const result = {};
  if (!raw || typeof raw !== 'object') return result;
  for (const [rawKey, rawValue] of Object.entries(raw)) {
    const key = cleanText(rawKey, 80).toLowerCase();
    if (!SAFE_RESPONSE_HEADERS.has(key)) continue;
    result[key] = cleanText(rawValue, 512);
  }
  return result;
}

function normalizeBrowserNetworkRecord(raw = {}, options = {}) {
  const context = options.context || raw.context || {};
  const rawUrl = cleanText(raw.rawUrl || raw.url, 16_000);
  const contentType = cleanText(raw.contentType || raw.mimeType || raw.mime, 160).toLowerCase();
  const headers = safeResponseHeaders(raw.responseHeaders || raw.headers);
  const headerSize = finiteNumber(headers['content-length'], 0);
  const responseSize = Math.max(0, finiteNumber(
    raw.responseSize ?? raw.encodedDataLength ?? raw.contentLength, headerSize));
  const source = cleanText(options.source || raw.source || raw.via || 'unknown', 32).toLowerCase();
  const timestamp = finiteNumber(options.timestamp ?? raw.timestamp, Date.now());
  const navigationId = Math.max(0, Math.trunc(finiteNumber(
    options.navigationId ?? raw.navigationId ?? context.generation, 0)));
  return {
    tabId: cleanText(options.tabId || raw.tabId || context.tabId, 128),
    navigationId,
    mediaIdentity: cleanText(options.mediaIdentity || raw.mediaIdentity || context.mediaId, 320),
    requestId: cleanText(raw.requestId, 256),
    rawUrl,
    // `url` ve `mimeType` mevcut ayrıştırıcılarla geriye dönük uyumluluk içindir.
    // Ağ isteği rawUrl/url ile yapılır; UI ve log yalnız safeLogUrl kullanır.
    url: rawUrl,
    safeLogUrl: redactCaptureUrl(rawUrl),
    method: cleanText(raw.method || 'GET', 16).toUpperCase(),
    resourceType: cleanText(raw.resourceType || raw.type, 48).toLowerCase(),
    status: Math.max(0, Math.trunc(finiteNumber(raw.status, 0))),
    // POST ile istenen manifestlerde istek gövdesi — yanıt kaydına taşınır.
    requestPostData: cleanText(raw.requestPostData, 256 * 1024),
    contentType,
    mimeType: contentType,
    responseHeaders: headers,
    responseSize,
    source,
    bodyAvailable: options.bodyAvailable != null ? !!options.bodyAvailable : !!raw.bodyAvailable,
    timestamp,
  };
}

function browserCaptureBodyAllowed(record, maxBytes = BROWSER_CAPTURE_BODY_LIMIT) {
  const size = Math.max(0, finiteNumber(record && record.responseSize, 0));
  return !size || size <= Math.max(1, finiteNumber(maxBytes, BROWSER_CAPTURE_BODY_LIMIT));
}

function browserCapturePayloadAllowed(value, options = {}) {
  const limit = Math.max(1, finiteNumber(options.maxBytes, BROWSER_CAPTURE_BODY_LIMIT));
  if (Buffer.isBuffer(value) || value instanceof Uint8Array) return value.byteLength <= limit;
  const text = String(value == null ? '' : value);
  if (options.base64Encoded) {
    // CDP base64 gövdeleri satır aralığı içermez. Decode etmeden önce üst
    // sınır uygulamak, boyutu response başlıklarında bilinmeyen bir yanıt için
    // ikinci büyük Buffer tahsisini engeller. Decode sonrası kesin byte sınırı
    // ayrıca denetlenir.
    return text.length <= Math.ceil(limit / 3) * 4 + 4;
  }
  return Buffer.byteLength(text, 'utf8') <= limit;
}

function isBrowserCaptureCandidateExpired(record, now = Date.now(), ttl = BROWSER_CAPTURE_CANDIDATE_TTL) {
  const timestamp = finiteNumber(record && record.timestamp, 0);
  return !timestamp || finiteNumber(now, Date.now()) - timestamp > Math.max(1, finiteNumber(ttl, BROWSER_CAPTURE_CANDIDATE_TTL));
}

function pruneBrowserCaptureCandidates(collection, options = {}) {
  const now = finiteNumber(options.now, Date.now());
  const ttl = Math.max(1, finiteNumber(options.ttl, BROWSER_CAPTURE_CANDIDATE_TTL));
  const limit = Math.max(1, Math.trunc(finiteNumber(options.limit, BROWSER_CAPTURE_CANDIDATE_LIMIT)));
  let expired = 0;
  let overflow = 0;
  for (const [key, value] of collection || []) {
    if (!isBrowserCaptureCandidateExpired(value, now, ttl)) continue;
    collection.delete(key);
    expired++;
  }
  while (collection && collection.size > limit) {
    collection.delete(collection.keys().next().value);
    overflow++;
  }
  return { expired, overflow };
}

function browserCaptureContentKey(record = {}, body = Buffer.alloc(0)) {
  const bytes = Buffer.isBuffer(body) ? body : Buffer.from(body || '');
  const contentHash = createHash('sha256').update(bytes).digest('hex');
  return [
    cleanText(record.tabId, 128),
    Math.max(0, Math.trunc(finiteNumber(record.navigationId, 0))),
    cleanText(record.mediaIdentity, 320),
    contentHash,
  ].join('|');
}

function pruneBrowserCaptureDedupe(collection, options = {}) {
  const now = finiteNumber(options.now, Date.now());
  const ttl = Math.max(1, finiteNumber(options.ttl, BROWSER_CAPTURE_DEDUPE_TTL));
  const limit = Math.max(1, Math.trunc(finiteNumber(options.limit, BROWSER_CAPTURE_DEDUPE_LIMIT)));
  for (const [key, timestamp] of collection || []) {
    if (!Number.isFinite(Number(timestamp)) || now - Number(timestamp) > ttl) collection.delete(key);
  }
  while (collection && collection.size > limit) collection.delete(collection.keys().next().value);
  return collection ? collection.size : 0;
}

module.exports = {
  BROWSER_CAPTURE_BODY_LIMIT,
  BROWSER_CAPTURE_CANDIDATE_LIMIT,
  BROWSER_CAPTURE_CANDIDATE_TTL,
  BROWSER_CAPTURE_DEDUPE_LIMIT,
  BROWSER_CAPTURE_DEDUPE_TTL,
  browserCaptureBodyAllowed,
  browserCapturePayloadAllowed,
  browserCaptureContentKey,
  isBrowserCaptureCandidateExpired,
  normalizeBrowserNetworkRecord,
  pruneBrowserCaptureCandidates,
  pruneBrowserCaptureDedupe,
  safeResponseHeaders,
};
