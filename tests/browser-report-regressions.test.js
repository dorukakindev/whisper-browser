const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const subtitles = require('../src/browser-subtitles');
const assets = require('../src/browser-asset-store');
const places = require('../src/browser-place-url');
const identity = require('../src/browser-media-identity');

for (const start of ['0', '1', '', 'invalid']) {
  const attribute = start ? ` startNumber="${start}"` : '';
  const mpd = `<MPD><Period><AdaptationSet contentType="text" codecs="wvtt"><SegmentTemplate media="sub/$Number$.m4s" duration="6000" timescale="1000"${attribute}/><Representation id="tr"/></AdaptationSet></Period></MPD>`;
  const matchers = subtitles.parseDashSubtitleMatchers(mpd, 'https://cdn.test/manifest.mpd');
  const matched = subtitles.matchDashSubtitleUrl('https://cdn.test/sub/2.m4s', matchers);
  assert.ok(matched);
  assert.strictEqual(matched.startNumber, start === '0' ? 0 : 1);
  assert.strictEqual(subtitles.dashSegmentOffset(matched), start === '0' ? 12 : 6);
}
for (const numbered of [true, false]) {
  const srt = `${numbered ? '1\n' : ''}00:00:01,000 --> 00:00:02,000\nbir\n${numbered ? '2\n' : ''}00:00:03,000 --> 00:00:04,000\niki`;
  assert.deepStrictEqual(subtitles.parseSubtitlePayload(srt, 'application/x-subrip').cues,
    [{ start: 1, end: 2, text: 'bir' }, { start: 3, end: 4, text: 'iki' }]);
}

// Kaydet/yeniden aç yolu: boş satır cue ayıracı olup kalan diyaloğu yutmamalı.
for (const gap of ['\n\n', '\n \n\t\n', '\r\n\r\n']) {
  const encoded = assets.cuesToSrt([
    { start: 1, end: 3, text: `bir${gap}iki` },
    { start: 4, end: 5, text: 'son' },
  ]);
  assert.deepStrictEqual(subtitles.parseSubtitlePayload(encoded, 'application/x-subrip').cues,
    [{ start: 1, end: 3, text: 'bir\niki' }, { start: 4, end: 5, text: 'son' }]);
}
assert.strictEqual(subtitles.cleanCueText('Tom &amp;#39;s &amp;amp; Jerry'), 'Tom &#39;s &amp; Jerry');
assert.strictEqual(subtitles.cleanCueText('&lt;b&gt; &#x1F600; &#39; &unknown; &#99999999;'), "<b> 😀 ' &unknown; �");
const xml = '<tt xmlns:ttp="http://www.w3.org/ns/ttml#parameter" ttp:timeBase="smpte" ttp:frameRate="24"><body><div><p begin="00:00:01:12" end="00:00:03:00">Tom &amp;#39;s</p></div></body></tt>';
assert.deepStrictEqual(subtitles.parseSubtitlePayload(xml, 'application/ttml+xml').cues,
  [{ start: 1.5, end: 3, text: 'Tom &#39;s' }]);
assert.strictEqual(subtitles.isLikelySubtitleResponse({ url: 'https://cdn.test/subtitles/1', mimeType: 'application/mp4' }), true);
assert.strictEqual(subtitles.isLikelySubtitleResponse({ url: 'https://cdn.test/video/1', mimeType: 'application/mp4' }), false);

assert.strictEqual(places.safePlaceUrl('https://a.test/x?v=1&token=secret&utm_source=z&fbclid=y#!/watch?id=9&utm_medium=z'),
  'https://a.test/x?v=1#!/watch?id=9');
assert.strictEqual(identity.SENSITIVE_PARAM_RE, places.SENSITIVE_PARAM_RE);
assert.strictEqual(identity.TRACKING_PARAM_RE, places.TRACKING_PARAM_RE);
// Tarayıcıya yüklenen UMD sürümü de aynı arındırmayı yapmalı.
const context = { URL, URLSearchParams };
vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../src/browser-place-url.js'), 'utf8'), context);
assert.strictEqual(context.BrowserPlaceUrl.safePlaceUrl('https://a.test/?utm_source=z&v=1'), 'https://a.test/?v=1');

// Raporun yanlış yardımcıyla denediği adres çubuğunun gerçek uygulamasını çalıştır.
const main = fs.readFileSync(path.join(__dirname, '../src/main.js'), 'utf8');
const start = main.indexOf('function normalizeBrowserUrl(raw)');
const end = main.indexOf('function browserPopupWindowOptions()', start);
const navigate = vm.runInNewContext(main.slice(start, end) + '\nnormalizeBrowserUrl;', { URL, encodeURIComponent });
assert.strictEqual(navigate('youtube.com'), 'https://youtube.com/');
assert.strictEqual(navigate('iki kelime'), 'https://www.google.com/search?q=iki%20kelime');
assert.strictEqual(navigate('https://a.test/watch?sig=abc&token=xyz'), 'https://a.test/watch?sig=abc&token=xyz');
console.log('Browser rapor regresyonları: SRT, entity, TTML, MP4, kalıcı URL ve gerçek gezinme doğrulandı.');
