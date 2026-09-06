const assert = require('assert');
const {
  BROWSER_CAPTURE_BODY_LIMIT,
  browserCaptureBodyAllowed,
  browserCapturePayloadAllowed,
  browserCaptureContentKey,
  isBrowserCaptureCandidateExpired,
  normalizeBrowserNetworkRecord,
  pruneBrowserCaptureCandidates,
  pruneBrowserCaptureDedupe,
  safeResponseHeaders,
} = require('../src/browser-network-capture');

let passed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log(`  OK  ${name}`); }
  catch (error) { console.error(`  FAIL ${name}\n${error.stack}`); process.exitCode = 1; }
}

test('imzalı ham URL korunur, teşhis URLsi sırları maskeler', () => {
  const rawUrl = 'https://cdn.test/en.vtt?token=secret&sig=abc&expires=999&lang=en#private';
  const record = normalizeBrowserNetworkRecord({ url: rawUrl, mimeType: 'Text/VTT' }, {
    context: { tabId: 'tab-1', generation: 7, mediaId: 'youtube:video-a' }, source: 'fetch',
  });
  assert.equal(record.rawUrl, rawUrl);
  assert.equal(record.url, rawUrl);
  assert.equal(record.safeLogUrl, 'https://cdn.test/en.vtt?lang=en');
  assert.equal(record.contentType, 'text/vtt');
  assert.equal(record.tabId, 'tab-1');
  assert.equal(record.navigationId, 7);
  assert.equal(record.mediaIdentity, 'youtube:video-a');
  assert.doesNotMatch(record.safeLogUrl, /secret|sig|expires|private/);
});

test('yalnız güvenli response başlıkları tutulur', () => {
  const headers = safeResponseHeaders({
    'Content-Type': 'text/vtt', 'Content-Length': '120', ETag: 'abc',
    Authorization: 'Bearer secret', Cookie: 'sid=secret', 'Set-Cookie': 'sid=secret',
  });
  assert.deepEqual(headers, { 'content-type': 'text/vtt', 'content-length': '120', etag: 'abc' });
  assert.doesNotMatch(JSON.stringify(headers), /secret|authorization|cookie/i);
});

test('bilinen büyük gövde reddedilir, bilinmeyen boyut aday kalır', () => {
  assert.equal(browserCaptureBodyAllowed({ responseSize: BROWSER_CAPTURE_BODY_LIMIT }), true);
  assert.equal(browserCaptureBodyAllowed({ responseSize: BROWSER_CAPTURE_BODY_LIMIT + 1 }), false);
  assert.equal(browserCaptureBodyAllowed({ responseSize: 0 }), true);
});

test('boyutu başlıkta bilinmeyen CDP gövdesi decode öncesi ve sonrası sınırlanır', () => {
  const limit = 12;
  const exact = Buffer.alloc(limit, 1);
  const tooLarge = Buffer.alloc(limit + 1, 1);
  assert.equal(browserCapturePayloadAllowed(exact, { maxBytes: limit }), true);
  assert.equal(browserCapturePayloadAllowed(tooLarge, { maxBytes: limit }), false);
  assert.equal(browserCapturePayloadAllowed(exact.toString('base64'), { base64Encoded: true, maxBytes: limit }), true);
  assert.equal(browserCapturePayloadAllowed('A'.repeat(25), { base64Encoded: true, maxBytes: limit }), false);
  assert.equal(browserCapturePayloadAllowed('ç'.repeat(6), { maxBytes: limit }), true);
  assert.equal(browserCapturePayloadAllowed('ç'.repeat(7), { maxBytes: limit }), false);
});

test('adaylar TTL ve kapasite sınırıyla temizlenir', () => {
  const candidates = new Map([
    ['expired', { timestamp: 1 }],
    ['one', { timestamp: 95_000 }],
    ['two', { timestamp: 96_000 }],
    ['three', { timestamp: 97_000 }],
  ]);
  const result = pruneBrowserCaptureCandidates(candidates, { now: 100_000, ttl: 30_000, limit: 2 });
  assert.deepEqual(result, { expired: 1, overflow: 1 });
  assert.deepEqual([...candidates.keys()], ['two', 'three']);
  assert.equal(isBrowserCaptureCandidateExpired({ timestamp: 69_999 }, 100_000, 30_000), true);
  assert.equal(isBrowserCaptureCandidateExpired({ timestamp: 70_000 }, 100_000, 30_000), false);
});

test('aynı gövde farklı yakalama yollarında tek anahtar üretir', () => {
  const base = { tabId: 'tab-1', navigationId: 3, mediaIdentity: 'video-a' };
  const body = Buffer.from('WEBVTT\n\n00:00.000 --> 00:01.000\nMerhaba');
  assert.equal(
    browserCaptureContentKey({ ...base, source: 'cdp', rawUrl: 'https://a.test/a.vtt' }, body),
    browserCaptureContentKey({ ...base, source: 'xhr', rawUrl: 'https://b.test/signed?v=2' }, body),
  );
  assert.notEqual(
    browserCaptureContentKey(base, body),
    browserCaptureContentKey({ ...base, mediaIdentity: 'video-b' }, body),
  );
  assert.notEqual(
    browserCaptureContentKey(base, body),
    browserCaptureContentKey({ ...base, navigationId: 4 }, body),
  );
});

test('işlenmiş gövde anahtarları süre ve adetle sınırlanır', () => {
  const seen = new Map([['old', 1], ['one', 95_000], ['two', 96_000], ['three', 97_000]]);
  pruneBrowserCaptureDedupe(seen, { now: 100_000, ttl: 30_000, limit: 2 });
  assert.deepEqual([...seen.keys()], ['two', 'three']);
});

if (!process.exitCode) console.log(`\n${passed} browser ağ yakalama sözleşmesi testi geçti.`);
