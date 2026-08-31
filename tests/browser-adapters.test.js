const assert = require('assert');
const {
  adapterAcceptsResponse,
  browserAdapterForUrl,
  browserResponseAdapter,
  redactCaptureUrl,
} = require('../src/browser-adapters');

let passed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log(`  OK  ${name}`); }
  catch (error) { console.error(`  FAIL ${name}\n${error.stack}`); process.exitCode = 1; }
}

test('sayfa adresini doğru servis adaptörüne eşler', () => {
  assert.equal(browserAdapterForUrl('https://www.netflix.com/watch/123').id, 'netflix');
  assert.equal(browserAdapterForUrl('https://www.disneyplus.com/video/abc').id, 'disney');
  assert.equal(browserAdapterForUrl('https://play.max.com/video/watch/abc').id, 'max');
  assert.equal(browserAdapterForUrl('https://www.hulu.com/watch/abc').id, 'hulu');
  assert.equal(browserAdapterForUrl('https://example.com/movie').id, 'generic');
});

test('sayfa ile CDN yanıtını aynı servis bağlamında tutar', () => {
  const adapter = browserResponseAdapter(
    'https://www.netflix.com/watch/123',
    'https://cdn.example.net/timedtext/en/segment-2.vtt?token=secret');
  assert.equal(adapter.id, 'netflix');
});

test('gerçek altyazı ve manifest adaylarını kabul eder', () => {
  const max = browserAdapterForUrl('https://play.max.com/video/abc');
  assert.equal(adapterAcceptsResponse(max, {
    url: 'https://cdn.example.net/playback/captions/en.vtt', mimeType: 'text/vtt',
  }), true);
  assert.equal(adapterAcceptsResponse(max, {
    url: 'https://api.max.com/playback/manifest', mimeType: 'application/json',
  }), true);
});

test('genel JSON ve resim yanıtlarını altyazı diye kabul etmez', () => {
  const generic = browserAdapterForUrl('https://example.com/movie');
  assert.equal(adapterAcceptsResponse(generic, {
    url: 'https://example.com/api/profile', mimeType: 'application/json',
  }), false);
  assert.equal(adapterAcceptsResponse(generic, {
    url: 'https://example.com/poster.jpg', mimeType: 'image/jpeg',
  }), false);
  const netflix = browserAdapterForUrl('https://www.netflix.com/watch/123');
  assert.equal(adapterAcceptsResponse(netflix, {
    url: 'https://ipv4-c001-ord001.nflxvideo.net/range/video-1080.mp4', mimeType: 'video/mp4',
  }), false);
});

test('teşhis URLsi imza, token ve fragmentleri göstermez', () => {
  const value = redactCaptureUrl('https://cdn.test/subs/en.vtt?token=secret&sig=abc&lang=en#private');
  assert.equal(value, 'https://cdn.test/subs/en.vtt?lang=en');
  assert.doesNotMatch(value, /secret|sig|private/);
});

if (!process.exitCode) console.log(`\n${passed} tarayıcı adaptörü testi geçti.`);
