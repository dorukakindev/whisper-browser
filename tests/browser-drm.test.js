const assert = require('assert');
const {
  browserDrmFailureMessage,
  isProtectedBrowserHost,
  redactConsoleUrls,
  sanitizeBrowserUserAgent,
} = require('../src/browser-drm');

let passed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log(`  OK  ${name}`); }
  catch (error) { console.error(`  FAIL ${name}\n${error.stack}`); process.exitCode = 1; }
}

test('Electron ürün adını kaldırırken gerçek Chromium sürümünü korur', () => {
  const ua = sanitizeBrowserUserAgent('Mozilla/5.0 Chrome/142.0.0.0 Electron/43.2.0 Safari/537.36');
  assert.doesNotMatch(ua, /Electron/i);
  assert.match(ua, /Chrome\/142\.0\.0\.0/);
  assert.match(ua, /Safari\/537\.36/);
});

test('DRM lisans hatasını yakalar ve hassas sorgu parametrelerini gizler', () => {
  const message = browserDrmFailureMessage('Widevine license request failed: https://license.test/v1/key?token=secret&sig=private');
  assert.match(message, /Widevine license request failed/i);
  assert.match(message, /https:\/\/license\.test\/v1\/key/);
  assert.doesNotMatch(message, /secret|private|token=|sig=/i);
});

test('Discovery hata kodunu güçlü DRM sinyali olarak gösterir', () => {
  assert.equal(browserDrmFailureMessage('Playback error 2312400'), 'Playback error 2312400');
});

test('normal lisans bilgisi ve ilgisiz JavaScript hatası false positive üretmez', () => {
  assert.equal(browserDrmFailureMessage('License acquired successfully'), '');
  assert.equal(browserDrmFailureMessage('TypeError: cannot read properties of undefined'), '');
  assert.equal(browserDrmFailureMessage('Failed to load resource: net::ERR_BLOCKED_BY_CLIENT'), '');
});

test('korumalı servis alan adlarını doğru sınıflandırır', () => {
  assert.equal(isProtectedBrowserHost('https://play.discoveryplus.com/video/watch/abc'), true);
  assert.equal(isProtectedBrowserHost('https://www.hulu.com/watch/abc'), true);
  assert.equal(isProtectedBrowserHost('https://example.com/video'), false);
  assert.equal(isProtectedBrowserHost('not a url'), false);
});

test('genel URL temizleyici sorgu ve fragmenti dışarı sızdırmaz', () => {
  const value = redactConsoleUrls('GET https://cdn.test/file.mpd?jwt=abc#secret failed');
  assert.equal(value, 'GET https://cdn.test/file.mpd failed');
});

if (!process.exitCode) console.log(`\n${passed} DRM testi geçti.`);
