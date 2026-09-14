const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { shouldRetryCaptureResponseBody } = require('../src/browser-capture-recovery');
const { normalizeCueProvenance } = require('../src/browser-capture-provenance');

const main = fs.readFileSync(path.join(__dirname, '..', 'src', 'main.js'), 'utf8');

function extractFunction(startMarker, endMarker, context) {
  const start = main.indexOf(startMarker);
  const end = main.indexOf(endMarker, start);
  assert.ok(start >= 0 && end > start, startMarker + ' kaynakta bulunamadı');
  vm.createContext(context);
  return vm.runInContext('(' + main.slice(start, end) + ')', context);
}

let passed = 0;
async function test(name, fn) {
  try {
    await fn();
    passed++;
    console.log('  OK  ' + name);
  } catch (error) {
    console.error('  FAIL ' + name + '\n' + error.stack);
    process.exitCode = 1;
  }
}

function hlsContext(fetchResults) {
  const publications = new Map();
  const pending = new Map();
  const stored = [];
  const fetchCounts = new Map();
  const context = {
    browserHlsFetchedSegments: new Map(),
    browserHlsInFlight: new Set(),
    browserHlsTimelines: new Map(),
    browserTrackPendingPublications: pending,
    browserTrackPublications: publications,
    cuesUseLocalSegmentTimeline: () => false,
    fetchBrowserBufferWithRetry: async () => Buffer.alloc(0),
    fetchBrowserText: async (url) => {
      fetchCounts.set(url, (fetchCounts.get(url) || 0) + 1);
      const result = fetchResults.get(url);
      if (result instanceof Error) throw result;
      return result;
    },
    fetchBrowserTextWithRetry: async (url) => {
      fetchCounts.set(url, (fetchCounts.get(url) || 0) + 1);
      const result = fetchResults.get(url);
      if (result instanceof Error) throw result;
      return result;
    },
    flushBrowserTrackPublication: (key, force) => {
      assert.equal(force, true);
      const entry = pending.get(key);
      if (!entry) return null;
      pending.delete(key);
      const publication = { id: key, fingerprint: 'published-' + stored.length };
      publications.set(key, publication);
      return publication;
    },
    isCurrentBrowserContext: () => true,
    isHlsSubtitlePlaylist: () => true,
    parseHlsSegments: () => [
      { url: 'https://cdn.test/a.vtt', start: 0, duration: 4,
        sequence: 10, discontinuity: 0, targetDuration: 4 },
      { url: 'https://cdn.test/b.vtt', start: 4, duration: 4,
        sequence: 11, discontinuity: 0, targetDuration: 4 },
    ],
    parseMp4SampleDefaults: () => ({}),
    parseMp4Timescale: () => 1000,
    parseMp4WebVtt: () => [],
    parseSubtitlePayload: (body) => ({
      cues: body ? [{ start: 0, end: 1, text: body }] : [],
    }),
    storeBrowserTrack: (cues, meta) => {
      stored.push(cues);
      pending.set(meta.streamKey, { cues, meta });
      // Üretimde canlı akış önce kararlılık tamponuna alınır ve null döner.
      return null;
    },
    subtitleLanguage: () => 'tr',
    trimInsertionCollection: () => {},
    browserTrackStreamKey: (url) => url,
    activeBrowserTab: () => null,
    normalizeCueProvenance,
    browserDiagnostics: null,
  };
  return { context, fetchCounts, pending, publications, stored };
}

(async () => {
  await test('eski playlist canlı zaman çizelgesinin ileri ucunu geri çekmez', async () => {
    const harness = hlsContext(new Map());
    let parts = [{ url: 'a.vtt', start: 0, duration: 4, sequence: 10, discontinuity: 0 },
      { url: 'b.vtt', start: 4, duration: 10, sequence: 11, discontinuity: 0 }];
    harness.context.parseHlsSegments = () => parts.map(part => ({ ...part }));
    harness.context.fetchBrowserTextWithRetry = async () => 'metin';
    const capture = extractFunction('async function captureHlsSubtitlePlaylist(', 'const CAPTURE_PROCESSED', harness.context);
    const url = 'https://cdn.test/live.m3u8';
    await capture('#EXTM3U', url);
    parts = [parts[0]];
    await capture('#EXTM3U', url);
    const timeline = harness.context.browserHlsTimelines.get(url);
    assert.equal(timeline.nextSequence, 12);
    assert.equal(timeline.nextStart, 14);
    parts = [{ url: 'd.vtt', start: 0, duration: 5, sequence: 13, discontinuity: 0 }];
    await capture('#EXTM3U', url);
    assert.equal(timeline.starts.get(13), 19);
  });

  await test('kısmi HLS başarısı korunur; yalnız eksik parça yeniden indirilir', async () => {
    const results = new Map([
      ['https://cdn.test/a.vtt', 'ilk'],
      ['https://cdn.test/b.vtt', new Error('geçici ağ hatası')],
    ]);
    const harness = hlsContext(results);
    const capture = extractFunction('async function captureHlsSubtitlePlaylist(',
      'const CAPTURE_PROCESSED', harness.context);

    assert.equal(await capture('#EXTM3U', 'https://cdn.test/subs.m3u8'), false);
    const fetched = harness.context.browserHlsFetchedSegments
      .get('https://cdn.test/subs.m3u8');
    assert.deepEqual([...fetched], ['0:10:https://cdn.test/a.vtt']);
    assert.equal(harness.pending.has('https://cdn.test/subs.m3u8'), true,
      'geçerli kısmi cue yayın tamponuna alınmadı');

    results.set('https://cdn.test/b.vtt', 'ikinci');
    assert.equal(await capture('#EXTM3U', 'https://cdn.test/subs.m3u8'), true);
    assert.equal(harness.fetchCounts.get('https://cdn.test/a.vtt'), 1,
      'başarılı parça gereksiz yere yeniden indirildi');
    assert.equal(harness.fetchCounts.get('https://cdn.test/b.vtt'), 2);
    assert.equal(harness.publications.has('https://cdn.test/subs.m3u8'), true,
      'tam iz transaction commitinden önce yayımlanmadı');
    assert.equal(await capture('#EXTM3U', 'https://cdn.test/subs.m3u8'), true,
      'tamamlanmış playlist yeni ağ isteği üretmeden başarı dönmedi');
  });

  await test('bütün HLS parçaları başarısızsa çıktı ve başarı üretilmez', async () => {
    const results = new Map([
      ['https://cdn.test/a.vtt', new Error('timeout')],
      ['https://cdn.test/b.vtt', new Error('timeout')],
    ]);
    const harness = hlsContext(results);
    const capture = extractFunction('async function captureHlsSubtitlePlaylist(',
      'const CAPTURE_PROCESSED', harness.context);
    assert.equal(await capture('#EXTM3U', 'https://cdn.test/subs.m3u8'), false);
    assert.equal(harness.stored.length, 0);
    assert.equal(harness.pending.size, 0);
    assert.equal(harness.publications.size, 0);
  });

  await test('imzalı HLS segmenti 403 alınca eski playlist tekrarına değil manifest yenilemeye yönelir', async () => {
    const expired = Object.assign(new Error('HTTP 403'), {
      code: 'EBROWSER_HTTP', status: 403, retryAction: 'refresh-manifest',
    });
    const results = new Map([
      ['https://cdn.test/a.vtt', expired],
      ['https://cdn.test/b.vtt', 'korunan parça'],
    ]);
    const harness = hlsContext(results);
    const capture = extractFunction('async function captureHlsSubtitlePlaylist(',
      'const CAPTURE_PROCESSED', harness.context);
    let refreshes = 0;
    const completed = await capture('#EXTM3U', 'https://cdn.test/subs.m3u8', {
      onRefreshManifest: () => { refreshes++; },
    });
    assert.equal(completed, false);
    assert.equal(refreshes, 1);
    assert.equal(harness.pending.has('https://cdn.test/subs.m3u8'), true,
      '403 dışındaki geçerli parça manifest yenilenirken kayboldu');
  });

  await test('CDP timed-text gövdesi sınırlı yeniden denenir ve sekme değişince kesilir', async () => {
    let current = true;
    let calls = 0;
    const tab = {
      view: { webContents: { debugger: { sendCommand: async () => {
        calls++;
        if (calls < 3) throw new Error('CDP gövdesi hazır değil');
        return { body: '#EXTM3U', base64Encoded: false };
      } } } },
    };
    const context = {
      BROWSER_SCRIPT_TIMEOUT: 50,
      browserSubtitleStateError: (code, message) => Object.assign(new Error(message), { code }),
      browserTabById: () => tab,
      isCurrentBrowserContext: () => current,
      setTimeout: (callback) => { callback(); return 1; },
      shouldRetryCaptureResponseBody,
      withTimeout: (task) => task,
    };
    const readBody = extractFunction('async function getBrowserCapturedResponseBody(',
      'async function captureBrowserResponse(', context);
    const browserContext = { tabId: 'tab-1', generation: 7, stateGeneration: 9 };
    const result = await readBody({
      url: 'https://cdn.test/subtitle.vtt',
      mimeType: 'text/vtt',
      requestId: 'one',
    }, browserContext);
    assert.equal(result.body, '#EXTM3U');
    assert.equal(calls, 3);

    calls = 0;
    current = true;
    tab.view.webContents.debugger.sendCommand = async () => {
      calls++;
      current = false;
      return { body: '#EXTM3U', base64Encoded: false };
    };
    await assert.rejects(() => readBody({
      url: 'https://cdn.test/subtitle.vtt',
      mimeType: 'text/vtt',
      requestId: 'cancelled',
    }, browserContext), (error) => error.code === 'EBROWSER_STALE');
    assert.equal(calls, 1, 'iptal edilmiş gövde isteği yeniden denendi');
  });

  if (!process.exitCode) console.log('\n' + passed + ' manifest işleme testi geçti.');
})();
