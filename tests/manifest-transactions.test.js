const assert = require('assert');
const {
  ManifestTransactionRegistry,
  hasExpectedManifestRoot,
  isCompleteManifestBody,
  manifestDeclaresSubtitleWork,
  manifestResponseMeta,
} = require('../src/manifest-transactions');

let passed = 0;
function test(name, fn) {
  try {
    fn();
    passed++;
    console.log(`  OK  ${name}`);
  } catch (error) {
    console.error(`  FAIL ${name}\n${error.stack}`);
    process.exitCode = 1;
  }
}

function createRegistry(options = {}) {
  const clock = { now: 1000 };
  return {
    clock,
    registry: new ManifestTransactionRegistry({
      maxAttempts: 3,
      baseDelayMs: 100,
      maxDelayMs: 400,
      cooldownMs: 1000,
      now: () => clock.now,
      ...options,
    }),
  };
}

test('başarı kaydı yalnız commit sonrasında görünür', () => {
  const { registry } = createRegistry();
  const begun = registry.begin({ url: 'https://cdn.test/master.m3u8', fingerprint: 'v1' });
  assert.equal(begun.action, 'process');
  assert.deepEqual(registry.snapshot(), { epoch: 0, successful: 0, failures: 0, inFlight: 1 });
  assert.equal(registry.commit(begun.transaction), true);
  assert.deepEqual(registry.snapshot(), { epoch: 0, successful: 1, failures: 0, inFlight: 0 });
});

test('aynı URL değişen içerikle yeniden işlenir, aynı içerik dedupe edilir', () => {
  const { registry } = createRegistry();
  const first = registry.begin({ url: 'https://cdn.test/master.m3u8', fingerprint: 'body-a' });
  registry.commit(first.transaction);
  assert.equal(registry.begin({
    url: 'https://cdn.test/master.m3u8', fingerprint: 'body-a',
    headers: { etag: '"new-validator"' },
  }).action, 'duplicate');
  const changed = registry.begin({
    url: 'https://cdn.test/master.m3u8', fingerprint: 'body-b',
    headers: { ETag: '"v2"' },
  });
  assert.equal(changed.action, 'process');
  assert.equal(changed.transaction.meta.etag, '"v2"');
});

test('redirect son adresiyle canonical dedupe anahtarı oluşturur', () => {
  const { registry } = createRegistry();
  const redirected = registry.begin({
    url: 'https://origin.test/manifest',
    finalUrl: 'https://cdn.test/live/master.m3u8',
    requestUrl: 'https://origin.test/manifest',
    fingerprint: 'same-body',
  });
  registry.commit(redirected.transaction);
  assert.equal(registry.begin({
    url: 'https://cdn.test/live/master.m3u8',
    fingerprint: 'same-body',
  }).action, 'duplicate');
});

test('304 yalnız daha önce commit edilmiş temsil varsa değişmedi sayılır', () => {
  const cold = createRegistry().registry;
  assert.equal(cold.begin({
    url: 'https://cdn.test/master.m3u8', status: 304, fingerprint: 'empty',
  }).action, 'missing-body');
  assert.equal(cold.snapshot().successful, 0);

  const { registry } = createRegistry();
  const first = registry.begin({
    url: 'https://cdn.test/master.m3u8', fingerprint: 'body', headers: { etag: '"v1"' },
  });
  registry.commit(first.transaction);
  assert.equal(registry.begin({
    url: 'https://cdn.test/master.m3u8', status: 304, headers: { etag: '"v1"' },
  }).action, 'not-modified');
  assert.equal(registry.begin({
    url: 'https://cdn.test/master.m3u8', status: 304, headers: { etag: '"v2"' },
  }).action, 'missing-body', 'farklı validator eski başarıya bağlandı');
  assert.equal(registry.begin({
    url: 'https://cdn.test/master.m3u8', fingerprint: 'body', headers: { etag: '"v2"' },
  }).action, 'duplicate', 'aynı byte gövdesi validator değişti diye yeniden işlendi');
  assert.equal(registry.begin({
    url: 'https://cdn.test/master.m3u8', status: 304, headers: { etag: '"v2"' },
  }).action, 'not-modified', 'doğrulanmış yeni validator 304 için saklanmadı');
  assert.equal(registry.snapshot().successful, 1);
});

test('paralel aynı sürüm tek transaction açar ve ilk hata başarı yazmaz', () => {
  const { registry, clock } = createRegistry();
  const first = registry.begin({ url: 'https://cdn.test/a.mpd', fingerprint: 'mpd-a' });
  const parallel = registry.begin({ url: 'https://cdn.test/a.mpd', fingerprint: 'mpd-a' });
  assert.equal(first.action, 'process');
  assert.equal(parallel.action, 'in-flight');
  const failed = registry.fail(first.transaction, new Error('geçici parse hatası'));
  assert.deepEqual(failed, { action: 'retry', attempts: 1, retryAfterMs: 100 });
  assert.equal(registry.snapshot().successful, 0);
  assert.equal(registry.begin({ url: 'https://cdn.test/a.mpd', fingerprint: 'mpd-a' }).action, 'backoff');
  clock.now += 100;
  const retried = registry.begin({ url: 'https://cdn.test/a.mpd', fingerprint: 'mpd-a' });
  assert.equal(retried.action, 'process');
  assert.equal(registry.commit(retried.transaction), true);
});

test('yeniden deneme üstel, sınırlı ve sonrasında cooldown ile kesilir', () => {
  const { registry, clock } = createRegistry();
  const candidate = { url: 'https://cdn.test/bad.m3u8', fingerprint: 'bad' };
  let begun = registry.begin(candidate);
  assert.deepEqual(registry.fail(begun.transaction, 'bir'), {
    action: 'retry', attempts: 1, retryAfterMs: 100,
  });
  assert.equal(registry.begin(candidate).action, 'backoff');
  clock.now += 100;
  begun = registry.begin(candidate);
  assert.deepEqual(registry.fail(begun.transaction, 'iki'), {
    action: 'retry', attempts: 2, retryAfterMs: 200,
  });
  clock.now += 200;
  begun = registry.begin(candidate);
  assert.deepEqual(registry.fail(begun.transaction, 'üç'), {
    action: 'abandon', attempts: 3, retryAfterMs: 1000,
  });
  assert.equal(registry.snapshot().successful, 0);
  assert.equal(registry.begin(candidate).action, 'cooldown');
  clock.now += 1000;
  assert.equal(registry.begin(candidate).action, 'process');
});

test('reset devam eden transaction commitini geçersiz kılar', () => {
  const { registry } = createRegistry();
  const begun = registry.begin({ url: 'https://cdn.test/live.mpd', fingerprint: 'one' });
  registry.reset();
  assert.equal(registry.commit(begun.transaction), false);
  assert.deepEqual(registry.snapshot(), { epoch: 1, successful: 0, failures: 0, inFlight: 0 });
});

test('geçici bozuk gövde manifest kökü sayılmaz, sonraki geçerli gövde kabul edilir', () => {
  assert.equal(hasExpectedManifestRoot('<html>upstream error</html>', 'hls'), false);
  assert.equal(hasExpectedManifestRoot('<Period></Period>', 'dash'), false);
  assert.equal(hasExpectedManifestRoot('\uFEFF  #EXTM3U\n#EXTINF:4,', 'hls'), true);
  assert.equal(hasExpectedManifestRoot('<?xml version="1.0"?>\n<MPD><Period/></MPD>', 'dash'), true);
  assert.equal(isCompleteManifestBody('#EXTM3U', 'hls'), false);
  assert.equal(isCompleteManifestBody(
    '#EXTM3U\n#EXT-X-MEDIA:TYPE=SUBTITLES,URI="captions.m3u8', 'hls'), false);
  assert.equal(isCompleteManifestBody('#EXTM3U\n#EXTINF:4,\na.vtt', 'hls'), true);
  assert.equal(isCompleteManifestBody('<MPD><Period>', 'dash'), false);
  assert.equal(isCompleteManifestBody(
    '<?xml version="1.0"?>\n<!--manifest-->\n<MPD><Period/></MPD>', 'dash'), true);
  assert.equal(manifestDeclaresSubtitleWork(
    '#EXTM3U\n#EXT-X-MEDIA:GROUP-ID="cc",TYPE="SUBTITLES"', 'hls'), true);
  assert.equal(manifestDeclaresSubtitleWork(
    '#EXTM3U\n#EXT-X-MEDIA:GROUP-ID="cc",TYPE="CLOSED-CAPTIONS",INSTREAM-ID="CC1"', 'hls'), true);
  assert.equal(manifestDeclaresSubtitleWork(
    '<MPD><Representation codecs="wvtt"/></MPD>', 'dash'), true);
  assert.equal(manifestDeclaresSubtitleWork(
    '<MPD><AdaptationSet contentType="video"/></MPD>', 'dash'), false);
});

test('validator başlıkları büyük küçük harften bağımsız okunur', () => {
  assert.deepEqual(manifestResponseMeta({
    finalUrl: 'https://cdn.test/a.mpd',
    requestUrl: 'https://origin.test/a',
    statusCode: 200,
    headers: { ETag: '"abc"', 'Last-Modified': 'Mon, 01 Jan 2024 00:00:00 GMT' },
  }), {
    key: 'https://cdn.test/a.mpd',
    url: 'https://cdn.test/a.mpd',
    requestUrl: 'https://origin.test/a',
    status: 200,
    etag: '"abc"',
    lastModified: 'Mon, 01 Jan 2024 00:00:00 GMT',
  });
});

test('başarı ve hata kayıtları belirlenen bellek sınırında tutulur', () => {
  const { registry } = createRegistry({ maxEntries: 8 });
  for (let index = 0; index < 12; index++) {
    const begun = registry.begin({
      url: `https://cdn.test/${index}.m3u8`,
      fingerprint: `body-${index}`,
    });
    registry.commit(begun.transaction);
  }
  assert.equal(registry.snapshot().successful, 8);
});

if (!process.exitCode) console.log(`\n${passed} manifest transaction testi geçti.`);
