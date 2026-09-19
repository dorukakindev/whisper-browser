'use strict';
/**
 * Tek kaynak: tarayıcı tarafında "secret" sayılan URL parametre adları.
 * Hem snake/kebab-case hem camelCase varyantlarını yakalar.
 *
 * Kullanım:
 *   const { isSensitiveKey } = require('./browser-sensitive-keys');
 *   if (isSensitiveKey(key)) { /* redakte et *\/ }
 *
 * Bu liste; src/browser-place-url.js, src/browser-adblock.js (safeFilterRule),
 * src/browser-adapters.js (SENSITIVE_MEDIA_URL_PARAM), src/browser-playback-diagnostics.js
 * (redactDiagnosticText), src/browser-tab-history.js, src/browser-session-package.js
 * gibi yerlerde kullanılır. Renderer'da window.BrowserSensitiveKeys olarak da görünür.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.BrowserSensitiveKeys = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {

// Canonical sözlük — küçük harfle saklanır.
const SENSITIVE_KEY_NAMES = Object.freeze([
  // OAuth/JWT/access tokens
  'token', 'access_token', 'access-token', 'accessToken',
  'id_token', 'id-token', 'idToken',
  'refresh_token', 'refresh-token', 'refreshToken',
  'oauth_token', 'oauth-token', 'oauthToken',
  'jwt', 'bearer', 'assertion', 'id_assertion',
  // API/session
  'api_key', 'api-key', 'apiKey',
  'apikey',
  'session', 'session_id', 'session-id', 'sessionId',
  'sid',
  'client_secret', 'client-secret', 'clientSecret',
  'client_id', 'client-id', 'clientId',
  'appSecret',
  'x-api-key', 'x_api_key', 'xApiKey',
  'authorization', 'auth', 'authToken',
  'auth_token', 'auth-token', 'auth_code', 'auth-code', 'authCode',
  // Klasik credential kalıpları
  'sig', 'signature', 'sigv4',
  'csrf', 'xsrf',
  'password', 'pass', 'passcode', 'passwd', 'secret',
  'private_key', 'private-key', 'privateKey',
  'app_secret', 'app-secret',
  'oauth_verifier', 'oauth-verifier', 'oauthVerifier',
  'oauth_signature', 'oauth-signature', 'oauthSignature',
  'oauth_nonce', 'oauth-nonce', 'oauthNonce',
  'expires', 'expire', 'expiration', 'exp',
  'credential', 'credentials',
  'policy', 'key-pair-id', 'keyPairId',
  // AWS / CloudFront imzaları
  'x-amz-signature', 'x-amz-credential', 'x-amz-security-token',
  // Cloudflare Stream/HLS
  'hdnts', 'hdnea',
  // State/nonce
  'state', 'nonce', 'code', 'verifier',
  'token_type', 'tokenType',
]);

const SENSITIVE_KEY_SET = new Set(SENSITIVE_KEY_NAMES.map((k) => k.toLowerCase()));

/** Sorgu/parametre adının hassas olup olmadığını döndürür. Case-insensitive. */
function isSensitiveKey(key) {
  if (!key) return false;
  return SENSITIVE_KEY_SET.has(String(key).toLowerCase());
}

/** Bu adlarla başlayan tüm anahtarları hassas saymak için regex (örn. x-amz-*) */
function startsWithSensitivePrefix(value) {
  if (!value) return false;
  const lower = String(value).toLowerCase();
  return /^(?:x-amz-|x-goog-|x-api-|aws-|google-)/.test(lower);
}

return {
  SENSITIVE_KEY_NAMES,
  SENSITIVE_KEY_SET,
  isSensitiveKey,
  startsWithSensitivePrefix,
};
});
