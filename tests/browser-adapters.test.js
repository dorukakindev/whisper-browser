const assert = require('assert');
const fs = require('fs');
const path = require('path');
const {
  adapterAcceptsResponse,
  browserAdapterForUrl,
  browserResponseAdapter,
  persistentBrowserMediaUrl,
  redactCaptureUrl,
  sanitizeManifestPreview,
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

test('Hulu v6 playlist JSON yanıtını servis bağlamında kabul eder', () => {
  const hulu = browserResponseAdapter(
    'https://www.hulu.com/watch/abc',
    'https://play.hulu.com/v6/playlist');
  assert.equal(hulu.id, 'hulu');
  assert.equal(adapterAcceptsResponse(hulu, {
    url: 'https://play.hulu.com/v6/playlist', mimeType: 'application/json',
  }), true);
  assert.equal(adapterAcceptsResponse(browserAdapterForUrl('https://example.com/movie'), {
    url: 'https://example.com/v6/playlist', mimeType: 'application/json',
  }), false, 'genel playlist JSON yanıtı altyazı adayı sayıldı');
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

test('tanı paketi manifest özetindeki imzalı URLleri temizler', () => {
  const preview = sanitizeManifestPreview('#EXTM3U\nhttps://cdn.test/sub.m4s?X-Goog-Signature=SECRET&lang=en\nkey?token=PRIVATE');
  assert.match(preview, /sub\.m4s\?lang=en/);
  assert.doesNotMatch(preview, /SECRET|PRIVATE/);
});

test('kalıcı medya URLsi video kimliğini korur, sırları ayıklar', () => {
  const value = persistentBrowserMediaUrl(
    'https://www.youtube.com/watch?v=abc123XYZ_9&t=30&token=secret&sig=private#sensitive');
  assert.equal(value, 'https://www.youtube.com/watch?v=abc123XYZ_9&t=30');
  assert.doesNotMatch(value, /secret|private|token|sig|#/);

  const main = fs.readFileSync(path.join(__dirname, '..', 'src', 'main.js'), 'utf8');
  const selection = main.slice(main.indexOf('async function saveBrowserSelectionNote'),
    main.indexOf('function captureBrowserMangaPosition'));
  const toggle = main.slice(main.indexOf("ipcMain.handle('library:annotations:toggle'"),
    main.indexOf("ipcMain.handle('library:annotations:restoreAnchor'"));
  assert.match(selection, /mediaUrl:\s*persistentBrowserMediaUrl\(/);
  assert.match(toggle, /mediaUrl:[^\n]+persistentBrowserMediaUrl\(requestedMediaUrl\)/);
});

if (!process.exitCode) console.log(`\n${passed} tarayıcı adaptörü testi geçti.`);
