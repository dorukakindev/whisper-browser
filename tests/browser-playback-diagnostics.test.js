const assert = require('assert');
const fs = require('fs');
const path = require('path');
const {
  DIAGNOSTIC_CATALOG,
  classifyPlaybackEvidence,
  createPlaybackDiagnosticTracker,
  inferPlaybackResource,
  installPlaybackWebRequestDiagnostics,
  isPlaybackProbeContextCurrent,
  isRelevantPlaybackRequest,
  redactDiagnosticText,
} = require('../src/browser-playback-diagnostics');

let passed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log(`  OK  ${name}`); }
  catch (error) { console.error(`  FAIL ${name}\n${error.stack}`); process.exitCode = 1; }
}

const BASE_CASES = [
  ['cdm-component-unavailable', { kind: 'component', available: false, detail: 'components API yok' }],
  ['cdm-initialization-failed', { kind: 'component', available: true, ready: false, failed: true, detail: 'update failed' }],
  ['eme-api-unavailable', { kind: 'eme', apiAvailable: false, reason: 'EME yok' }],
  ['capability-probe-failed', { kind: 'eme', probeFailed: true, apiAvailable: false, supported: false, reason: 'Object has been destroyed' }],
  ['key-system-unavailable', { kind: 'eme', apiAvailable: true, supported: false, reason: 'NotSupportedError', videoSupported: true, audioSupported: true }],
  ['codec-unsupported', { kind: 'codec', videoSupported: false, audioSupported: true }],
  ['license-dns-error', { kind: 'network', resourceKind: 'license', error: 'net::ERR_NAME_NOT_RESOLVED' }],
  ['license-timeout', { kind: 'network', resourceKind: 'license', error: 'net::ERR_TIMED_OUT' }],
  ['license-access-denied', { kind: 'http', resourceKind: 'license', status: 403 }],
  ['license-rejected', { kind: 'console', message: 'Widevine license request rejected by policy' }],
  ['geo-restricted', { kind: 'http', resourceKind: 'document', status: 451 }],
  ['authentication-required', { kind: 'http', resourceKind: 'document', status: 401 }],
  ['http-access-denied', { kind: 'http', resourceKind: 'playback-api', status: 403 }],
  ['service-throttled', { kind: 'http', resourceKind: 'playback-api', status: 429 }],
  ['service-unavailable', { kind: 'http', resourceKind: 'media', status: 503 }],
  ['dns-error', { kind: 'network', resourceKind: 'document', error: 'net::ERR_NAME_NOT_RESOLVED' }],
  ['network-timeout', { kind: 'network', resourceKind: 'media', error: 'net::ERR_CONNECTION_TIMED_OUT' }],
  ['network-unreachable', { kind: 'network', resourceKind: 'media', error: 'net::ERR_CONNECTION_REFUSED' }],
  ['tls-error', { kind: 'network', resourceKind: 'document', error: 'net::ERR_CERT_DATE_INVALID' }],
  ['media-network-error', { kind: 'media', errorCode: 2, errorMessage: 'MEDIA_ERR_NETWORK' }],
  ['media-decode-error', { kind: 'media', errorCode: 3, errorMessage: 'MEDIA_ERR_DECODE' }],
  ['media-source-unsupported', { kind: 'media', errorCode: 4, errorMessage: 'MEDIA_ERR_SRC_NOT_SUPPORTED' }],
  ['gpu-decode-limited', { kind: 'gpu', videoDecode: 'disabled_software' }],
  ['protected-playback-failed', { kind: 'console', message: 'Playback error 2312400' }],
];

function variantOf(input, index) {
  const value = { ...input, fixtureVariant: index };
  if (typeof value.message === 'string') {
    value.message = [value.message, value.message.toUpperCase(), `player: ${value.message}`, `${value.message} (attempt ${index + 1})`][index];
  }
  if (typeof value.error === 'string') {
    value.error = [value.error, value.error.toLowerCase(), `request failed: ${value.error}`, `${value.error}; retry=${index}`][index];
  }
  return value;
}

test('tanı kataloğunda her sınıfın kanıt güveni ve Türkçe kullanıcı mesajı vardır', () => {
  assert.ok(Object.keys(DIAGNOSTIC_CATALOG).length >= 12);
  for (const [code, item] of Object.entries(DIAGNOSTIC_CATALOG)) {
    assert.ok(item.label && item.confidence && item.message, code);
    assert.ok(['yüksek', 'orta', 'düşük'].includes(item.confidence), `${code}: güven`);
    assert.match(item.message, /[çğıöşüİ]/i, `${code}: Türkçe mesaj`);
  }
});

test('24 doğrudan hata sınıfını dört varyantla karıştırmadan sınıflandırır', () => {
  let samples = 0;
  for (const [expected, input] of BASE_CASES) {
    for (let index = 0; index < 4; index++) {
      const actual = classifyPlaybackEvidence(variantOf(input, index));
      assert.equal(actual && actual.code, expected, `${expected} varyant ${index}`);
      samples++;
    }
  }
  assert.equal(samples, 96);
  console.log(`       ${samples} pozitif fault fixture · 0 yanlış sınıflandırma`);
});

test('lisans DNS ve timeout hatalarını lisans reddi saymaz', () => {
  const dns = classifyPlaybackEvidence({
    kind: 'console',
    message: 'Widevine license request failed: https://license.test/key?token=secret net::ERR_NAME_NOT_RESOLVED',
  });
  const timeout = classifyPlaybackEvidence({
    kind: 'console', message: 'License POST failed with net::ERR_TIMED_OUT',
  });
  assert.equal(dns.code, 'license-dns-error');
  assert.equal(timeout.code, 'license-timeout');
  assert.doesNotMatch(dns.evidence, /secret|token=/i);
});

test('DRM server-certificate hatasını TLS sertifika hatası diye yanlış sınıflandırmaz', () => {
  const result = classifyPlaybackEvidence({
    kind: 'console', message: 'Widevine license certificate request failed',
  });
  assert.equal(result.code, 'license-rejected');
});

test('403 coğrafi engel diye kesinleştirilmez; yalnız 451/açık bölge kanıtı geo olur', () => {
  assert.equal(classifyPlaybackEvidence({ kind: 'http', resourceKind: 'document', status: 403 }).code, 'http-access-denied');
  assert.equal(classifyPlaybackEvidence({ kind: 'http', resourceKind: 'document', status: 451 }).code, 'geo-restricted');
  assert.equal(classifyPlaybackEvidence({ kind: 'console', message: 'This title is not available in your region' }).code, 'geo-restricted');
});

test('normal ve ilgisiz belirtiler false positive üretmez', () => {
  const negatives = [
    { kind: 'component', available: true, ready: false, failed: false, detail: 'hazırlanıyor' },
    { kind: 'eme', apiAvailable: true, supported: true, videoSupported: true, audioSupported: true },
    { kind: 'codec', videoSupported: true, audioSupported: true },
    { kind: 'gpu', videoDecode: 'enabled' },
    { kind: 'gpu', videoDecode: 'bilinmiyor' },
    { kind: 'http', resourceKind: 'media', status: 200 },
    { kind: 'http', resourceKind: 'document', status: 302 },
    { kind: 'http', resourceKind: 'media', status: 404 },
    { kind: 'network', resourceKind: 'media', error: 'net::ERR_ABORTED' },
    { kind: 'network', resourceKind: 'media', error: 'net::ERR_BLOCKED_BY_CLIENT' },
    { kind: 'network', resourceKind: 'media', error: 'net::ERR_TIMED_OUT', canceled: true },
    { kind: 'media', errorCode: 1, errorMessage: 'MEDIA_ERR_ABORTED' },
    { kind: 'console', message: 'License acquired successfully' },
    { kind: 'console', message: 'License failover endpoint selected' },
    { kind: 'console', message: 'License request aborted because page navigated' },
    { kind: 'console', message: 'Region selector opened' },
    { kind: 'console', message: 'Regional restriction settings loaded and ready' },
    { kind: 'console', message: 'TypeError: cannot read properties of undefined' },
  ];
  for (const input of negatives) assert.equal(classifyPlaybackEvidence(input), null, JSON.stringify(input));
  console.log(`       ${negatives.length} negatif fixture · 0 false positive`);
});

test('yalnız oynatma ile ilgili ağ kaynakları tanı matrisine girer', () => {
  assert.equal(inferPlaybackResource({ url: 'https://svc.test/wv/license', resourceType: 'xhr' }), 'license');
  assert.equal(inferPlaybackResource({ url: 'https://license.svc.test/wv', resourceType: 'xhr' }), 'license');
  assert.equal(inferPlaybackResource({ url: 'https://svc.test/movie.mpd', resourceType: 'xhr' }), 'media');
  assert.equal(inferPlaybackResource({ url: 'https://svc.test/playback/session', resourceType: 'fetch' }), 'playback-api');
  assert.equal(inferPlaybackResource({ url: 'https://svc.test/embed/player', resourceType: 'subFrame' }), 'document');
  assert.equal(inferPlaybackResource({ url: 'https://svc.test/images/license-badge.png', resourceType: 'image' }), 'other');
  assert.equal(inferPlaybackResource({ url: 'https://svc.test/pixel.gif', resourceType: 'image' }), 'other');
  assert.equal(isRelevantPlaybackRequest({ url: 'https://svc.test/pixel.gif', resourceType: 'image', statusCode: 403 }), false);
});

test('fake Electron webRequest oturumu HTTP ve ağ kanıtlarını deterministik taşır', () => {
  const listeners = {};
  const webRequest = {
    onCompleted(_filter, callback) { listeners.completed = callback; },
    onErrorOccurred(_filter, callback) { listeners.error = callback; },
  };
  const evidence = [];
  assert.equal(installPlaybackWebRequestDiagnostics(webRequest, (item) => evidence.push(item), {
    acceptDetails: (details) => details.webContentsId === undefined || details.webContentsId === 7,
  }), true);
  listeners.completed({ webContentsId: 7, url: 'https://media.test/playback/session', resourceType: 'xhr', statusCode: 403 });
  listeners.completed({ webContentsId: 7, url: 'https://media.test/movie.mpd', resourceType: 'media', statusCode: 503 });
  listeners.completed({ webContentsId: 7, url: 'https://media.test/pixel.gif', resourceType: 'image', statusCode: 403 });
  listeners.error({ webContentsId: 7, url: 'https://license.test/wv/license', resourceType: 'xhr', error: 'net::ERR_NAME_NOT_RESOLVED' });
  listeners.error({ webContentsId: 7, url: 'https://media.test/movie.mpd', resourceType: 'media', error: 'net::ERR_ABORTED', canceled: true });
  listeners.completed({ webContentsId: 8, url: 'https://popup.test/playback/session', resourceType: 'xhr', statusCode: 403 });
  assert.deepEqual(evidence.map((item) => classifyPlaybackEvidence(item).code), [
    'http-access-denied', 'service-unavailable', 'license-dns-error',
  ]);
});

test('EME probe sonucu yalnız başladığı gezinme ve WebContents bağlamında geçerlidir', () => {
  const expected = { generation: 4, webContentsId: 7, url: 'https://video.test/watch' };
  assert.equal(isPlaybackProbeContextCurrent(expected, { ...expected, destroyed: false }), true);
  assert.equal(isPlaybackProbeContextCurrent(expected, { ...expected, generation: 5 }), false);
  assert.equal(isPlaybackProbeContextCurrent(expected, { ...expected, webContentsId: 8 }), false);
  assert.equal(isPlaybackProbeContextCurrent(expected, { ...expected, url: 'https://video.test/other' }), false);
  assert.equal(isPlaybackProbeContextCurrent(expected, { ...expected, destroyed: true }), false);
});

test('siyah kare ve sonsuz spinner örnekleri zaman penceresiyle ayrılır', () => {
  const black = createPlaybackDiagnosticTracker({ dedupeMs: 1 });
  black.observeMediaSample({ paused: false, area: 1000, readyState: 4, videoWidth: 1280, videoHeight: 720, currentTime: 1, totalVideoFrames: 0 }, 1000);
  black.observeMediaSample({ paused: false, area: 1000, readyState: 4, videoWidth: 1280, videoHeight: 720, currentTime: 5, totalVideoFrames: 0 }, 5000);
  const blackResult = black.observeMediaSample({ paused: false, area: 1000, readyState: 4, videoWidth: 1280, videoHeight: 720, currentTime: 14, totalVideoFrames: 0 }, 14000);
  assert.equal(blackResult[0] && blackResult[0].code, 'black-video');

  const stalled = createPlaybackDiagnosticTracker({ dedupeMs: 1 });
  stalled.observeMediaSample({ paused: false, area: 1000, readyState: 2, currentTime: 2, totalVideoFrames: 4, spinnerVisible: true }, 1000);
  stalled.observeMediaSample({ paused: false, area: 1000, readyState: 2, currentTime: 2, totalVideoFrames: 4, spinnerVisible: true }, 5000);
  const stalledResult = stalled.observeMediaSample({ paused: false, area: 1000, readyState: 2, currentTime: 2, totalVideoFrames: 4, spinnerVisible: true }, 14000);
  assert.equal(stalledResult[0] && stalledResult[0].code, 'stalled-player');
});

test('aynı kalıcı HTML medya hatasını her örnekleme turunda yeniden yayınlamaz', () => {
  const tracker = createPlaybackDiagnosticTracker({ dedupeMs: 5000 });
  assert.deepEqual(tracker.observeMediaSample({ errorCode: 3, errorMessage: 'MEDIA_ERR_DECODE' }, 1000).map((x) => x.code), [
    'media-decode-error',
  ]);
  assert.deepEqual(tracker.observeMediaSample({ errorCode: 3, errorMessage: 'MEDIA_ERR_DECODE' }, 7000), []);
  tracker.observeMediaSample({ errorCode: 0 }, 8000);
  assert.deepEqual(tracker.observeMediaSample({ errorCode: 3, errorMessage: 'MEDIA_ERR_DECODE' }, 14000).map((x) => x.code), [
    'media-decode-error',
  ]);
});

test('ilerleyen kareler siyah video veya stall tanısı üretmez', () => {
  const tracker = createPlaybackDiagnosticTracker({ dedupeMs: 1 });
  for (let i = 0; i < 8; i++) {
    const emitted = tracker.observeMediaSample({
      paused: false, area: 1000, readyState: 4, currentTime: i * 2,
      videoWidth: 1280, videoHeight: 720, totalVideoFrames: i * 48, spinnerVisible: false,
    }, 1000 + i * 3000);
    assert.deepEqual(emitted, []);
  }
});

test('tarayıcı kare sayacı sunmadığında siyah video tahmini yapmaz', () => {
  const tracker = createPlaybackDiagnosticTracker({ dedupeMs: 1 });
  for (let i = 0; i < 5; i++) {
    const emitted = tracker.observeMediaSample({
      paused: false, area: 1000, readyState: 4, currentTime: i * 4,
      videoWidth: 1280, videoHeight: 720, totalVideoFrames: null, spinnerVisible: false,
    }, 1000 + i * 5000);
    assert.deepEqual(emitted, []);
  }
});

test('ses-only veya boyutsuz medya siyah video diye sınıflandırılmaz', () => {
  const tracker = createPlaybackDiagnosticTracker({ dedupeMs: 1 });
  for (let i = 0; i < 5; i++) {
    const emitted = tracker.observeMediaSample({
      paused: false, area: 1000, readyState: 4, currentTime: i * 4,
      videoWidth: 0, videoHeight: 0, totalVideoFrames: 0, spinnerVisible: false,
    }, 1000 + i * 5000);
    assert.deepEqual(emitted, []);
  }
});

test('uzun tek sayfa oturumunda son tanılar ve dedupe anahtarları sınırlıdır', () => {
  const tracker = createPlaybackDiagnosticTracker({ limit: 24, dedupeLimit: 64, dedupeMs: 1 });
  for (let i = 0; i < 2000; i++) {
    tracker.record({ kind: 'console', message: `Widevine license failed attempt-${i}` }, 1000 + i * 2);
  }
  const snapshot = tracker.snapshot();
  assert.equal(snapshot.recent.length, 24);
  assert.equal(snapshot.dedupeEntries, 64);
  assert.equal(snapshot.counts['license-rejected'], 2000);
});

test('yeni gezinme önceki sayfanın capability ve tanı durumunu taşımaz', () => {
  const tracker = createPlaybackDiagnosticTracker();
  tracker.setCapabilities({ eme: { supported: true } });
  tracker.record({ kind: 'http', resourceKind: 'media', status: 503 });
  tracker.reset({ clearCapabilities: true });
  const snapshot = tracker.snapshot();
  assert.deepEqual(snapshot.capabilities, {});
  assert.deepEqual(snapshot.recent, []);
});

test('tanı kanıtları URL query/fragment ve token değerlerini dışarı sızdırmaz', () => {
  const text = redactDiagnosticText('GET https://cdn.test/movie.mpd?jwt=abc#private token=secret sig=hidden failed');
  assert.equal(text, 'GET https://cdn.test/movie.mpd token=[gizlendi] sig=[gizlendi] failed');
  const headers = redactDiagnosticText('Authorization: Bearer SECRET.JWT.VALUE\nCookie: sid=PRIVATE; x-api-key=KEY');
  assert.doesNotMatch(headers, /SECRET|PRIVATE|\bKEY\b/);
  assert.match(headers, /authorization=\[gizlendi\]/);
  assert.match(headers, /cookie=\[gizlendi\]/);
});

test('üretim bağlantısı resmi ağ/EME API’lerini ve kanıt matrisini kullanır', () => {
  const root = path.join(__dirname, '..');
  const main = fs.readFileSync(path.join(root, 'src', 'main.js'), 'utf8');
  const diagnostics = fs.readFileSync(path.join(root, 'src', 'browser-playback-diagnostics.js'), 'utf8');
  const renderer = fs.readFileSync(path.join(root, 'src', 'renderer', 'renderer.js'), 'utf8');
  const html = fs.readFileSync(path.join(root, 'src', 'renderer', 'index.html'), 'utf8');
  assert.match(main, /installPlaybackWebRequestDiagnostics/);
  assert.match(main, /acceptDetails\(details\)/);
  assert.match(main, /details && details\.webContentsId/);
  assert.match(diagnostics, /webRequest\.onCompleted/);
  assert.match(diagnostics, /webRequest\.onErrorOccurred/);
  assert.match(main, /requestMediaKeySystemAccess\('com\.widevine\.alpha'/);
  assert.match(main, /probeFailed: true, apiAvailable: null, supported: null/);
  assert.match(main, /isPlaybackProbeContextCurrent\(probeContext/);
  assert.match(main, /widevineComponentStatus = \{ available: true, ready: false, failed: true,[^\n]+\};\s*if \(browserView[\s\S]{0,180}setTimeout\(\(\) => reportBrowserDrmSupport\(\), 0\)/);
  assert.match(main, /media\.canPlayType\(videoType\)/);
  assert.match(main, /observeMediaSample\(media\)/);
  assert.ok(main.indexOf("wc.on('did-start-navigation'") < main.indexOf("wc.on('did-navigate'"));
  assert.match(main, /resetBrowserCaptureState\(\{ resetPlayback: false \}\)/);
  assert.match(main, /wc\.on\('did-navigate-in-page'[\s\S]{0,350}reportBrowserDrmSupport\(\)/);
  assert.match(main, /redactDiagnosticText\(url\)/);
  assert.doesNotMatch(main, /browserDrmFailureMessage\(rawMsg\)/);
  assert.match(renderer, /event\.type === 'playback-diagnostics'/);
  assert.match(renderer, /eme\.probeFailed \? 'ölçülemedi'/);
  assert.match(renderer, /\? 'bilinmiyor' : decodeStatus\.startsWith\('enabled'\)/);
  assert.doesNotMatch(renderer, /Korumalı video lisans aşamasında reddedildi/);
  assert.match(html, /id="browserPlaybackRecent"/);
});

if (!process.exitCode) console.log(`\n${passed} oynatma tanısı testi geçti.`);
