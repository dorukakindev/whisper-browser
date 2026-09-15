'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { parseDashSubtitleMatchers, parseDashSubtitleTracks, matchDashSubtitleUrl, dashSegmentOffset } = require('../src/browser-subtitles');
const { captureDashSegments } = require('../src/browser-dash-capture');
const { BrowserTranslationScheduler, assembleCueSentences } = require('../src/browser-translation-scheduler');

const base = 'https://fixture.example/episode/manifest.mpd';
function manifest(count = 240, extra = '') {
  return `<MPD mediaPresentationDuration="PT40M"><Period><AdaptationSet mimeType="video/mp4"><Representation><SegmentList><SegmentURL media="video.m4s"/></SegmentList></Representation></AdaptationSet>
    <AdaptationSet mimeType="text/vtt" lang="en"><Representation id="english"><SegmentList timescale="1" duration="10">${extra}
    ${Array.from({ length: count }, (_, i) => `<SegmentURL media="text/${i}.vtt"/>`).join('')}
    </SegmentList></Representation></AdaptationSet></Period></MPD>`;
}
function fixture() {
  const stored = [], fetched = [], completed = new Map();
  const options = {
    current: () => true, completed,
    fetchBuffer: async url => {
      fetched.push(url);
      return Buffer.from(`WEBVTT\n\n00:00.000 --> 00:05.000\nLine ${url.match(/(\d+)\.vtt/)[1]}.\n`);
    },
    store: cues => { stored.push(...cues); return true; },
  };
  return { stored, fetched, completed, options };
}

test('40 dakika: 240 parça son repliğe kadar yakalanır ve tümü çeviri kuyruğundan geçer', async () => {
  const matchers = parseDashSubtitleMatchers(manifest(), base);
  assert.equal(matchers.length, 240);
  assert.equal(dashSegmentOffset(matchDashSubtitleUrl('https://fixture.example/episode/text/239.vtt', matchers)), 2390);
  const f = fixture();
  assert.equal(await captureDashSegments(matchers, f.options), true);
  assert.equal(f.fetched.length, 240);
  assert.equal(f.stored.length, 240);
  assert.equal(f.stored.at(-1).end, 2395);
  assert(f.fetched.every(url => url.includes('/text/')));
  const translated = [];
  const scheduler = new BrowserTranslationScheduler({
    maxConcurrent: 4, lookAhead: 30,
    translate: async sentence => sentence.text.replace('Line', 'Replik'),
    onResult: result => translated.push(...result.cues),
  });
  scheduler.setSentences(assembleCueSentences(f.stored));
  scheduler.completeAll();
  await scheduler.whenIdle();
  assert.equal(translated.length, 240);
  assert.equal(Math.max(...translated.map(cue => cue.end)), 2395);
  assert.equal(scheduler.snapshot().remaining, 0);
});

test('geç parça hatasında eksik tamamlandı sayılmaz; yalnız eksik parça yeniden alınır', async () => {
  const matchers = parseDashSubtitleMatchers(manifest(), base);
  const f = fixture(), fetch = f.options.fetchBuffer;
  const errors = [];
  let fail = true;
  f.options.onError = error => errors.push(error.retryAction);
  f.options.fetchBuffer = async url => {
    if (fail && url.endsWith('/230.vtt')) throw Object.assign(Error('İmza süresi doldu.'), { retryAction: 'refresh-manifest' });
    return fetch(url);
  };
  assert.equal(await captureDashSegments(matchers, f.options), false);
  assert.equal(f.stored.length, 239);
  assert.deepEqual(errors, ['refresh-manifest']);
  fail = false;
  assert.equal(await captureDashSegments(matchers, f.options), true);
  assert.equal(f.fetched.length, 240);
  assert.equal(f.stored.length, 240);
  assert.equal(f.fetched.at(-1), matchers[230].segmentUrl);
});

test('iptal edilen yakalama sonuç yayımlamaz; aynı anda en çok altı istek çalışır', async () => {
  const f = fixture();
  let active = true, concurrent = 0, peak = 0;
  f.options.current = () => active;
  f.options.fetchBuffer = async () => {
    peak = Math.max(peak, ++concurrent);
    await new Promise(resolve => setImmediate(resolve));
    active = false; concurrent--;
    return Buffer.from('WEBVTT\n\n00:00.000 --> 00:05.000\nHello.');
  };
  assert.equal(await captureDashSegments(parseDashSubtitleMatchers(manifest(), base), f.options), false);
  assert.equal(peak, 6);
  assert.equal(f.stored.length, 0);
  assert.equal([...f.completed.values()][0].size, 0);
});

test('yayımlanamayan kaynak yeniden denenebilir; boş WebVTT ile bozuk içerik ayrılır', async () => {
  const matchers = parseDashSubtitleMatchers(manifest(2), base), f = fixture();
  f.options.store = () => false;
  assert.equal(await captureDashSegments(matchers, f.options), false);
  assert.equal([...f.completed.values()][0].size, 0);
  f.options.store = cues => { f.stored.push(...cues); return true; };
  assert.equal(await captureDashSegments(matchers, f.options), true);
  assert.equal(f.fetched.length, 4);
  const blank = fixture();
  blank.options.fetchBuffer = async () => Buffer.from('WEBVTT\n\n');
  assert.equal(await captureDashSegments(matchers, blank.options), true);
  assert.equal([...blank.completed.values()][0].size, 2);
  const bad = fixture();
  bad.options.fetchBuffer = async () => Buffer.from('WEBVTT\n\nwrong --> time\nLost dialogue');
  assert.equal(await captureDashSegments(matchers, bad.options), false);
});

test('SegmentTimeline, dönem ve sunum ofseti korunur; aynı URL bayt aralıkları kaybolmaz', async () => {
  const xml = `<MPD><Period start="PT30S"><AdaptationSet mimeType="text/vtt"><Representation id="en"><BaseURL>text.vtt</BaseURL>
    <SegmentList timescale="10" presentationTimeOffset="100"><Initialization range="0-19"/>
    <SegmentTimeline><S t="100" d="100"/><S d="150" r="-1"/></SegmentTimeline>
    <SegmentURL mediaRange="20-59"/><SegmentURL mediaRange="60-99"/><SegmentURL mediaRange="100-139"/>
    </SegmentList></Representation></AdaptationSet></Period></MPD>`;
  const list = parseDashSubtitleMatchers(xml, base);
  assert.equal(list.length, 3);
  assert.deepEqual(list.map(dashSegmentOffset), [30, 40, 55]);
  assert.deepEqual(list[0].initializationRange, { start: 0, end: 19 });
  assert.deepEqual(parseDashSubtitleTracks(xml, base), []);
  const f = fixture(), ranges = [];
  f.options.fetchBuffer = async (_url, range) => {
    ranges.push(range);
    return Buffer.from('WEBVTT\n\n00:00.000 --> 00:05.000\nHello.');
  };
  assert.equal(await captureDashSegments(list, f.options), true);
  assert.deepEqual(ranges, [{ start: 20, end: 59 }, { start: 60, end: 99 }, { start: 100, end: 139 }]);
  assert.deepEqual(f.stored.map(cue => cue.start), [30, 40, 55]);
  assert.equal([...f.completed.values()][0].size, 3);
});

test('aşırı liste sessizce kesilmez; canlı şablondan URL tahmin edilmez', async () => {
  assert.throws(() => parseDashSubtitleMatchers(manifest(10001), base), /10.000/);
  const list = parseDashSubtitleMatchers('<MPD type="dynamic"><Period><AdaptationSet mimeType="text/vtt"><SegmentTemplate media="$Number$.vtt" duration="10"/></AdaptationSet></Period></MPD>', base);
  const f = fixture();
  await captureDashSegments(list, f.options);
  assert.equal(f.fetched.length, 0);
});

test('canlı DASH penceresi yenilendiğinde yalnız yeni segment alınır ve düşen eski pencere seek tekrarına yol açmaz', async () => {
  const live = (times) => '<MPD type="dynamic"><Period><AdaptationSet mimeType="text/vtt" lang="en">'
    + '<Representation id="live"><SegmentTemplate timescale="1" media="text/$Time$.vtt">'
    + '<SegmentTimeline>' + times.map((time) => '<S t="' + time + '" d="2"/>').join('')
    + '</SegmentTimeline></SegmentTemplate></Representation></AdaptationSet></Period></MPD>';
  const f = fixture();
  const recordFetch = f.options.fetchBuffer;
  f.options.fetchBuffer = async (url) => {
    await recordFetch(url);
    return Buffer.from('WEBVTT\n\n00:00.000 --> 00:01.500\nLine ' + url.match(/(\d+)\.vtt/)[1] + '.\n');
  };
  const coverage = new (require('../src/browser-capture-provenance').CaptureCoverageMap)();
  f.options.coverage = coverage;
  const first = parseDashSubtitleMatchers(live([100, 102, 104]), base);
  assert.deepEqual(first.map((item) => item.segmentValue), [100, 102, 104]);
  assert.equal(await captureDashSegments(first, f.options), true);
  const second = parseDashSubtitleMatchers(live([102, 104, 106]), base);
  assert.equal(await captureDashSegments(second, f.options), true);
  assert.deepEqual(f.fetched.map((url) => Number(url.match(/(\d+)\.vtt/)[1])), [100, 102, 104, 106]);
  assert.deepEqual(f.stored.map((cue) => cue.start), [100, 102, 104, 106]);
  assert.deepEqual(coverage.snapshot()[0].missingRanges, []);
  // Eski pencereye seek, tamamlanmış segmenti tekrar indirmemeli.
  assert.equal(await captureDashSegments(first, f.options), true);
  assert.equal(f.fetched.length, 4);
});

test('sonu açık canlı SegmentTimeline URL tahmin etmez ve eksik aralığı tamamlandı saymaz', async () => {
  const open = '<MPD type="dynamic"><Period><AdaptationSet mimeType="text/vtt"><Representation>'
    + '<SegmentTemplate timescale="1" media="text/$Time$.vtt"><SegmentTimeline>'
    + '<S t="100" d="2" r="-1"/></SegmentTimeline></SegmentTemplate>'
    + '</Representation></AdaptationSet></Period></MPD>';
  assert.equal(parseDashSubtitleMatchers(open, base).some((item) => item.segmentUrl), false);

  const f = fixture();
  const coverage = new (require('../src/browser-capture-provenance').CaptureCoverageMap)();
  f.options.coverage = coverage;
  const list = parseDashSubtitleMatchers(liveWindowManifest(), base);
  const fetch = f.options.fetchBuffer;
  f.options.fetchBuffer = async (url) => {
    if (url.endsWith('/104.vtt')) throw Error('Canlı segment gecikti.');
    return fetch(url);
  };
  assert.equal(await captureDashSegments(list, f.options), false);
  assert.deepEqual(coverage.snapshot()[0].missingRanges, [{ start: 104, end: 106 }]);
});

function liveWindowManifest() {
  return '<MPD type="dynamic"><Period><AdaptationSet mimeType="text/vtt"><Representation>'
    + '<SegmentTemplate timescale="1" media="text/$Time$.vtt"><SegmentTimeline>'
    + '<S t="100" d="2"/><S t="102" d="2"/><S t="104" d="2"/>'
    + '</SegmentTimeline></SegmentTemplate></Representation></AdaptationSet></Period></MPD>';
}
test('aynı altyazı izinin birden fazla dönemi aynı yayında korunur', async () => {
  const period = start => `<Period start="PT${start}S"><AdaptationSet mimeType="text/vtt" lang="en"><Representation id="en"><SegmentList duration="10"><SegmentURL media="text/0.vtt"/></SegmentList></Representation></AdaptationSet></Period>`;
  const list = parseDashSubtitleMatchers(`<MPD>${period(0)}${period(1200)}</MPD>`, base);
  assert.equal(list.length, 2);
  const f = fixture();
  assert.equal(await captureDashSegments(list, f.options), true);
  assert.deepEqual(f.stored.map(cue => cue.start), [0, 1200]);
  assert.equal(f.completed.size, 1);
});

test('gerçek ağ yardımcısı yanlış/eksik HTTP bayt aralığını kabul etmez', async () => {
  const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
  const source = fs.readFileSync(path.join(__dirname, '../src/main.js'), 'utf8');
  const code = source.slice(source.indexOf('async function fetchBrowserBuffer('), source.indexOf('async function fetchBrowserText('));
  let response = { status: 206, ok: true, headers: new Map([['content-range', 'bytes 20-23/100']]), arrayBuffer: async () => Buffer.from('part') };
  const context = {
    URL, Buffer, BROWSER_FETCH_TIMEOUT: 1000,
    activeBrowserTab: () => ({ view: { webContents: { isDestroyed: () => false, session: { fetch: async (_url, opts) => {
      assert.equal(opts.headers.Range, 'bytes=20-23'); return response;
    } } } } }),
    assertPublicBrowserSubtitleUrl: async () => {},
    withAbortTimeout: fn => fn(undefined),
    browserSubtitleStateError: (code, message) => Object.assign(Error(message), { code }),
  };
  vm.createContext(context); vm.runInContext(code, context);
  const fetch = () => context.fetchBrowserBuffer('https://fixture.example/text', 1024, null, { start: 20, end: 23 });
  assert.equal((await fetch()).toString(), 'part');
  response = { ...response, status: 200 };
  await assert.rejects(fetch(), /bayt aralığını/);
  response = { ...response, status: 206, headers: new Map([['content-range', 'bytes 0-3/100']]) };
  await assert.rejects(fetch(), /bayt aralığını/);
});

test('gerçek MPD işleyicisi init dosyasını bir kez alır ve 240 parçayı yayımlar', async () => {
  const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
  const source = fs.readFileSync(path.join(__dirname, '../src/main.js'), 'utf8');
  const code = source.slice(source.indexOf('async function processBrowserCapturedPayloadOnce('), source.indexOf('function scheduleBrowserManifestRetry('));
  const f = fixture();
  let initCount = 0, commits = 0, failSegment = false;
  const context = {
    ...require('../src/browser-subtitles'), captureDashSegments, Buffer,
    decodeSubtitleBuffer: buffer => ({ text: buffer.toString() }),
    browserDashSubtitleMatchers: [], browserDashFetchedSegments: new Map(), browserDiagnostics: null,
    browserTrackPublications: new Map(), activeBrowserTab: () => ({}),
    adoptBrowserStreamMediaIdentity: () => ({ changed: false, identity: 'fixture-stream' }),
    noteBrowserCapture() {}, browserTrackStreamKey: url => url, manifestResponseMeta: candidate => candidate,
    browserManifestTransactions: { begin: () => ({ action: 'process', transaction: {} }), isActive: () => true, commit: () => { commits++; return true; } },
    hasExpectedManifestRoot: () => true, isCompleteManifestBody: () => true, manifestDeclaresSubtitleWork: () => true,
    manifestRetryOutcome: () => 'retry', CAPTURE_RETRY: 'retry', CAPTURE_PROCESSED: 'processed', CAPTURE_DISCARDED: 'discarded',
    parseMp4Timescale: () => 1, parseMp4SampleDefaults: () => ({}),
    fetchBrowserBufferWithRetry: async url => {
      if (url.endsWith('/init.mp4')) { initCount++; return Buffer.from('fixture init'); }
      if (failSegment && url.endsWith('/230.vtt')) throw Error('Eksik parça.');
      return f.options.fetchBuffer(url);
    },
    storeBrowserTrack: (cues, meta) => { assert.equal(meta.finalize, true); f.stored.push(...cues); return {}; },
  };
  vm.createContext(context); vm.runInContext(code, context);
  const run = () => context.processBrowserCapturedPayloadOnce(Buffer.from(manifest(240, '<Initialization sourceURL="init.mp4"/>')), { url: base, mimeType: 'application/dash+xml' });
  assert.equal(await run(), 'processed');
  assert.equal(initCount, 1);
  assert.equal(commits, 1);
  assert.equal(f.stored.length, 240);
  assert.equal(f.stored.at(-1).end, 2395);
  failSegment = true; context.browserDashFetchedSegments.clear();
  assert.equal(await run(), 'retry');
  assert.equal(commits, 1, 'Kısmi yakalama manifesti tamamlandı olarak işaretlememeli.');
});
