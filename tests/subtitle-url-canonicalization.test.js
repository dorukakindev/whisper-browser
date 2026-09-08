const assert = require('assert');
const fs = require('fs');
const http = require('http');
const path = require('path');
const { performance } = require('perf_hooks');
const {
  browserTrackStreamKey,
  manifestFingerprint,
  normalizeSubtitleResourceUrl,
  parseDashSubtitleTracks,
  parseHlsSegmentUris,
  parseHlsSubtitleTracks,
  resolveSubtitleUrl,
  responseResourceUrl,
} = require('../src/browser-subtitles');

let passed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log(`  OK  ${name}`); }
  catch (error) { console.error(`  FAIL ${name}\n${error.stack}`); process.exitCode = 1; }
}

const bases = [
  'https://origin.test/a/b/master.m3u8',
  'http://origin.test:8080/a/b/master.m3u8?session=1',
  'https://[2001:db8::1]:8443/a/b/master.m3u8',
  'https://münich.test/a/b/master.m3u8',
  'https://xn--mnich-kva.test/a/b/master.m3u8',
  'https://origin.test/a%2Fb/c/master.m3u8',
  'https://origin.test/a/b/',
  'https://origin.test/a/b/master.mpd#period',
  'https://sub.origin.test/root/master.m3u8',
  'https://origin.test:443/root/master.m3u8',
  'http://[::1]/root/master.m3u8',
  'https://origin.test/altyazı/master.m3u8',
];
const references = [
  'https://cdn.test/subs/tr.vtt?token=a%2Fb',
  '//cdn.test/subs/tr.vtt',
  '/subs/tr.vtt',
  'captions/tr.vtt',
  '../captions/tr.vtt',
  './encoded%2Fslash.vtt',
  './boşluk%20adı.vtt?lang=tr',
  '?lang=tr&profile=a%26b%3Dc',
];

test('96 sabit URL fixture mutlak, göreli, IPv6, Unicode ve encoded slash çözümünü korur', () => {
  let fixtures = 0;
  for (const base of bases) {
    for (const reference of references) {
      const expected = resolveSubtitleUrl(reference, base);
      const hls = parseHlsSegmentUris(`#EXTM3U\n#EXTINF:1,\n${reference}`, base);
      assert.equal(hls[0], expected);
      fixtures++;
    }
  }
  assert.equal(fixtures, 96);
  console.log(`    ÖLÇÜM sabit_fixture=${fixtures}`);
});

test('HLS ve DASH manifest tabanları protocol-relative, kök ve üst dizin yollarını aynı çözer', () => {
  const hls = '#EXT-X-MEDIA:TYPE=SUBTITLES,GROUP-ID="cc",LANGUAGE="tr",NAME="Türkçe",URI="../cc/tr.m3u8?sig=x%2Fy"';
  assert.equal(parseHlsSubtitleTracks(hls, 'https://media.test/video/live/master.m3u8')[0].url,
    'https://media.test/video/cc/tr.m3u8?sig=x%2Fy');
  const dash = '<MPD><BaseURL>//cdn.test/root/</BaseURL><Period><BaseURL>../period/</BaseURL>'
    + '<AdaptationSet contentType="text" lang="tr"><Representation><BaseURL>./altyazı%2Ftr.vtt</BaseURL>'
    + '</Representation></AdaptationSet></Period></MPD>';
  assert.equal(parseDashSubtitleTracks(dash, 'https://origin.test/a/master.mpd')[0].url,
    'https://cdn.test/period/altyaz%C4%B1%2Ftr.vtt');
});

test('5.000 üretilmiş URL resolve-serileştir-resolve özelliğini korur', () => {
  const started = performance.now();
  const heapBefore = process.memoryUsage().heapUsed;
  for (let index = 0; index < 5000; index++) {
    const host = index % 7 === 0 ? '[2001:db8::2]' : (index % 11 === 0 ? 'münich.test' : `h${index % 37}.test`);
    const base = `https://${host}/root/${index % 29}/manifest.m3u8?session=${index}`;
    const reference = index % 5 === 0 ? `../subs/seg-${index}.vtt?profile=p%26v%3D${index}`
      : index % 5 === 1 ? `/captions/${index}%2Ftr.vtt`
        : index % 5 === 2 ? `//cdn${index % 13}.test/live/${index}.vtt?lang=tr`
          : index % 5 === 3 ? `./altyazı-${index}.vtt#cue`
            : `https://absolute.test/${index}.vtt?x=${index}`;
    const resolved = resolveSubtitleUrl(reference, base);
    const serialized = new URL(resolved).toString();
    assert.equal(resolveSubtitleUrl(serialized, 'https://unused.test/'), resolved);
  }
  const elapsedMs = performance.now() - started;
  const heapDelta = process.memoryUsage().heapUsed - heapBefore;
  console.log(`    ÖLÇÜM üretilmiş_varyant=5000 süre_ms=${elapsedMs.toFixed(2)} heap_delta_byte=${heapDelta}`);
});

test('İmzalı sorgu yenilemeleri tek logical akış olurken kalıcı sorgular çarpışmaz', () => {
  const logicalSources = 100;
  const tokenVariants = 10;
  const raw = [];
  for (let source = 0; source < logicalSources; source++) {
    for (let token = 0; token < tokenVariants; token++) {
      raw.push(`https://cdn.test/subs/${source}/seg-${token}.vtt?profile=p${source}&token=t${token}&expires=${1000 + token}`);
    }
  }
  const canonical = new Set(raw.map((url) => browserTrackStreamKey(url, 'TR')));
  assert.equal(canonical.size, logicalSources);
  assert.equal(raw.length - canonical.size, 900);

  const encodedValue = browserTrackStreamKey('https://cdn.test/subs/live.m3u8?profile=x%26variant%3Dy');
  const splitParams = browserTrackStreamKey('https://cdn.test/subs/live.m3u8?profile=x&variant=y');
  assert.notEqual(encodedValue, splitParams);
  let falseCollisions = 0;
  for (let index = 0; index < 1000; index++) {
    const encoded = browserTrackStreamKey(`https://cdn.test/subs/${index}.m3u8?profile=x%26variant%3D${index}`);
    const split = browserTrackStreamKey(`https://cdn.test/subs/${index}.m3u8?profile=x&variant=${index}`);
    if (encoded === split) falseCollisions++;
  }
  assert.equal(falseCollisions, 0);
  assert.equal(browserTrackStreamKey('https://cdn.test/subs/1.vtt?token=old&expires=1', 'TR'),
    browserTrackStreamKey('https://cdn.test/subs/2.vtt?token=new&expires=2', 'tr'));
  assert.notEqual(browserTrackStreamKey('https://cdn.test/subs/a%2Fb.vtt'),
    browserTrackStreamKey('https://cdn.test/subs/a/b.vtt'));
  assert.equal(browserTrackStreamKey('https://münich.test/subs/tr.vtt'),
    browserTrackStreamKey('https://xn--mnich-kva.test/subs/tr.vtt'));
  console.log(`    ÖLÇÜM raw_signed=1000 canonical=100 redundant_önlenen=900 adversarial_pair=1000 false_collision=${falseCollisions}`);
});

test('Yaygın CDN signer ailelerinin yenilenen auth alanları logical kaynak kimliğini değiştirmez', () => {
  const signerFamilies = [
    (source, revision) => `https://cdn.test/${source}/captions.vtt?profile=main&X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Credential=KEY${revision}%2Fscope&X-Amz-Date=20260901T1${revision}0000Z&X-Amz-Expires=300&X-Amz-SignedHeaders=host&X-Amz-Signature=s${revision}`,
    (source, revision) => `https://cdn.test/${source}/captions.vtt?profile=main&X-Goog-Algorithm=GOOG4-RSA-SHA256&X-Goog-Credential=KEY${revision}%2Fscope&X-Goog-Date=20260901T1${revision}0000Z&X-Goog-Expires=300&X-Goog-SignedHeaders=host&X-Goog-Signature=s${revision}`,
    (source, revision) => `https://cdn.test/${source}/captions.vtt?profile=main&sv=2025-01-05&se=2026-09-01T1${revision}:00Z&sp=r&sr=b&sig=s${revision}`,
    (source, revision) => `https://cdn.test/${source}/captions.vtt?profile=main&hdnts=exp=${revision}~acl=/*~hmac=s${revision}`,
    (source, revision) => `https://cdn.test/${source}/captions.vtt?profile=main&Expires=${revision}&Signature=s${revision}&Key-Pair-Id=K${revision}&Policy=p${revision}`,
  ];
  const raw = [];
  for (let family = 0; family < signerFamilies.length; family++) {
    for (let source = 0; source < 100; source++) {
      for (let revision = 0; revision < 5; revision++) {
        raw.push(signerFamilies[family](`f${family}/s${source}`, revision));
      }
    }
  }
  const canonical = new Set(raw.map((url) => browserTrackStreamKey(url, 'tr')));
  assert.equal(raw.length, 2500);
  assert.equal(canonical.size, 500);

  assert.notEqual(
    browserTrackStreamKey('https://cdn.test/s.vtt?policy=editorial-a'),
    browserTrackStreamKey('https://cdn.test/s.vtt?policy=editorial-b'),
  );
  assert.notEqual(
    browserTrackStreamKey('https://cdn.test/s.vtt?X-Amz-Meta-Language=tr&X-Amz-Signature=a'),
    browserTrackStreamKey('https://cdn.test/s.vtt?X-Amz-Meta-Language=en&X-Amz-Signature=b'),
  );
  assert.notEqual(
    browserTrackStreamKey('https://cdn.test/s.vtt?profile=main&X-Amz-Signature=a'),
    browserTrackStreamKey('https://cdn.test/s.vtt?profile=alternate&X-Amz-Signature=b'),
  );
  console.log('    ÖLÇÜM signer_family=5 raw_signed=2500 canonical=500 redundant_önlenen=2000 semantic_countertest=3');
});

test('Manifest gövde parmak izi ETag değişimini değil içerik ve çocuk token yenilemesini ölçer', () => {
  const bodyA = '#EXTM3U\n#EXTINF:2,\nseg-1.vtt?token=child-one';
  const bodyB = '#EXTM3U\n#EXTINF:2,\nseg-2.vtt?token=child-one';
  const bodyWithFreshChildToken = '#EXTM3U\n#EXTINF:2,\nseg-1.vtt?token=child-two';
  const first = { url: 'https://cdn.test/live/master.m3u8?token=one', etag: '"v1"', body: bodyA };
  const sameBodyRefresh = { url: 'https://cdn.test/live/master.m3u8?token=two', etag: '"v2"', body: bodyA };
  const changedBodyRefresh = { ...sameBodyRefresh, etag: '"v3"', body: bodyB };
  assert.equal(browserTrackStreamKey(first.url), browserTrackStreamKey(sameBodyRefresh.url));
  assert.notEqual(first.etag, sameBodyRefresh.etag);
  assert.equal(manifestFingerprint(first.body), manifestFingerprint(sameBodyRefresh.body));
  assert.notEqual(manifestFingerprint(first.body), manifestFingerprint(changedBodyRefresh.body));
  assert.notEqual(manifestFingerprint(first.body), manifestFingerprint(bodyWithFreshChildToken));
});

test('Üretim fetch, HLS ve sayfa kancası son yanıt URL’sini taşır', () => {
  const main = fs.readFileSync(path.join(__dirname, '..', 'src', 'main.js'), 'utf-8');
  assert.match(main, /finalUrl: responseResourceUrl\(safe, response\.url\)/);
  assert.match(main, /captureHlsSubtitlePlaylist\(fetched\.text, fetched\.finalUrl, discovered\)/);
  assert.match(main, /parseSubtitlePayload\(partBody, resource\.mimeType, resource\.finalUrl\)/);
  assert.match(main, /const finalUrl = String\(response\.url \|\| requestUrl \|\| ''\)/);
  assert.match(main, /url: finalUrl, requestUrl:/);
  assert.match(main, /const safe = normalizeSubtitleResourceUrl\(url\)/);
});

test('Altyazı kaynak fetch’i yalnız mutlak HTTP(S) URL’lerini kabul eder', () => {
  const accepted = [
    ['https://münich.test/subs/a%2Fb.vtt?token=x', 'https://xn--mnich-kva.test/subs/a%2Fb.vtt?token=x'],
    ['http://[2001:db8::4]:8080/live/master.m3u8', 'http://[2001:db8::4]:8080/live/master.m3u8'],
  ];
  for (const [input, expected] of accepted) assert.equal(normalizeSubtitleResourceUrl(input), expected);

  const rejected = [
    'data:PRIVATE-CAPTION',
    'javascript:alert(1)',
    'blob:https://media.test/secret',
    'file:///C:/subtitle.vtt',
    'ws://media.test/subtitles',
    '//media.test/subtitles.vtt',
    '../subtitles.vtt',
    '',
  ];
  for (const input of rejected) assert.equal(normalizeSubtitleResourceUrl(input), '');

  const injected = parseHlsSubtitleTracks(
    '#EXT-X-MEDIA:TYPE=SUBTITLES,URI=data:PRIVATE-CAPTION', 'https://media.test/master.m3u8',
  )[0];
  assert.equal(injected.url, 'data:PRIVATE-CAPTION');
  assert.equal(normalizeSubtitleResourceUrl(injected.url), '');
  console.log(`    ÖLÇÜM resource_scheme_accept=${accepted.length} resource_scheme_reject=${rejected.length}`);
});

async function runRedirectFixture() {
  const requests = [];
  const server = http.createServer((request, response) => {
    requests.push(request.url);
    if (request.url === '/redirect/master.m3u8') {
      response.writeHead(302, { Location: '/redirect/second' }); response.end(); return;
    }
    if (request.url === '/redirect/second') {
      response.writeHead(307, { Location: '/cdn/live/subs/index.m3u8?token=fresh' }); response.end(); return;
    }
    if (request.url === '/cdn/live/subs/index.m3u8?token=fresh') {
      response.writeHead(200, { 'Content-Type': 'application/vnd.apple.mpegurl', ETag: '"fixture-v1"' });
      response.end('#EXTM3U\n#EXTINF:2,\n../parts/part-1.vtt?sig=a%2Fb'); return;
    }
    response.writeHead(404); response.end();
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  try {
    const address = server.address();
    const documentUrl = `http://127.0.0.1:${address.port}/player/watch.html`;
    const requestUrl = resolveSubtitleUrl('/redirect/master.m3u8', documentUrl);
    const response = await fetch(requestUrl, { redirect: 'follow' });
    const body = await response.text();
    const finalUrl = responseResourceUrl(requestUrl, response.url);
    const segments = parseHlsSegmentUris(body, finalUrl);
    assert.equal(finalUrl, `http://127.0.0.1:${address.port}/cdn/live/subs/index.m3u8?token=fresh`);
    assert.deepEqual(segments, [`http://127.0.0.1:${address.port}/cdn/live/parts/part-1.vtt?sig=a%2Fb`]);
    assert.notEqual(parseHlsSegmentUris(body, requestUrl)[0], segments[0]);
    const faultCases = [
      ['', requestUrl],
      ['javascript:alert(1)', requestUrl],
      ['data:text/plain,WEBVTT', requestUrl],
      ['file:///C:/captions.vtt', requestUrl],
      ['http://[invalid', requestUrl],
      ['../fallback/subs.m3u8', `http://127.0.0.1:${address.port}/fallback/subs.m3u8`],
      [`//127.0.0.1:${address.port}/cdn/protocol-relative.m3u8`, `http://127.0.0.1:${address.port}/cdn/protocol-relative.m3u8`],
    ];
    for (const [candidate, expected] of faultCases) {
      assert.equal(responseResourceUrl(requestUrl, candidate), expected);
    }
    assert.deepEqual(requests, [
      '/redirect/master.m3u8', '/redirect/second', '/cdn/live/subs/index.m3u8?token=fresh',
    ]);
    console.log(`    ÖLÇÜM redirect_hop=2 final_base_kayıp=0 fault_case=${faultCases.length}`);
    passed++;
    console.log('  OK  Yönlendirme zinciri göreli HLS segmentlerini son yanıt URL’sine bağlar');
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

runRedirectFixture().catch((error) => {
  console.error(`  FAIL Yönlendirme zinciri göreli HLS segmentlerini son yanıt URL’sine bağlar\n${error.stack}`);
  process.exitCode = 1;
});

process.on('exit', () => console.log(`${passed} test geçti`));
