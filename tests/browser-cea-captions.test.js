'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { createCipheriv } = require('crypto');
const {
  CeaCaptionDecoder,
  buildHlsCeaSegmentMatchers,
  ceaStreamMatchesInstream,
  decryptHlsAes128,
  hlsAes128Iv,
  isLikelyMpegTsResponse,
  matchHlsCeaSegmentUrl,
} = require('../src/browser-cea-captions');
const {
  mp4VideoFragmentCompositionStart,
  mp4VideoFragmentStart,
} = require('../src/browser-subtitles');
const {
  normalizeBrowserNetworkRecord,
  BROWSER_CAPTURE_BODY_LIMIT,
  BROWSER_CAPTURE_CANDIDATE_LIMIT,
  BROWSER_CAPTURE_CANDIDATE_TTL,
} = require('../src/browser-network-capture');

const ROOT = path.join(__dirname, '..');
let passed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`  OK  ${name}`);
    passed++;
  } catch (error) {
    console.error(`  FAIL ${name}`);
    throw error;
  }
}

test('gerçek MPEG-TS segmentinden CC1 ve CC3 cue üretir', () => {
  const fixture = fs.readFileSync(path.join(ROOT,
    'node_modules', 'mux.js', 'test', 'segments', 'multi-channel-608-captions.ts'));
  const cues = new CeaCaptionDecoder().decodeTransportStream(fixture);
  assert.ok(cues.some((cue) => cue.stream === 'CC1' && /PERIOD, FOLKS/.test(cue.text)));
  assert.ok(cues.some((cue) => cue.stream === 'CC3' && cue.text.includes('période')));
  assert.ok(cues.every((cue) => cue.end > cue.start));
});

test('gerçek fMP4 segmentinden CC1 cue üretir', () => {
  const dir = path.join(ROOT, 'node_modules', 'mux.js', 'test', 'segments');
  const init = fs.readFileSync(path.join(dir, 'dash-608-captions-init.mp4'));
  const segment = fs.readFileSync(path.join(dir, 'dash-608-captions-seg.m4s'));
  const cues = new CeaCaptionDecoder().decodeFragmentedMp4(segment, init);
  assert.deepEqual(cues.map((cue) => [cue.stream, cue.text, cue.start, cue.end]),
    [['CC1', '00:00:00', 0, 119]]);
});

test('fMP4 tfdt epoku HLS parça başlangıcına taşınır', () => {
  const dir = path.join(ROOT, 'node_modules', 'mux.js', 'test', 'segments');
  const init = fs.readFileSync(path.join(dir, 'dash-608-captions-init.mp4'));
  const shifted = Buffer.from(fs.readFileSync(path.join(dir, 'dash-608-captions-seg.m4s')));
  const tfdt = shifted.indexOf('tfdt');
  assert.ok(tfdt > 0);
  assert.equal(shifted[tfdt + 4], 1);
  shifted.writeBigUInt64BE(8n * 90000n, tfdt + 8);
  const raw = new CeaCaptionDecoder().decodeFragmentedMp4(shifted, init);
  assert.equal(raw[0].start, 8);
  const mapped = new CeaCaptionDecoder().decodeFragmentedMp4(shifted, init,
    { start: 0, duration: 120 });
  assert.equal(mapped[0].start, 0);
  assert.equal(mapped[0].timelineMapped, true);
  const later = new CeaCaptionDecoder().decodeFragmentedMp4(shifted, init,
    { start: 20, duration: 120 });
  assert.equal(later[0].start, 20);
});

test('fMP4 trun kompozisyon ofseti decode zamanından ayrı tutulur', () => {
  const box = (type, payload) => {
    const header = Buffer.alloc(8);
    header.writeUInt32BE(payload.length + 8, 0);
    header.write(type, 4, 4, 'ascii');
    return Buffer.concat([header, payload]);
  };
  const tfhd = Buffer.alloc(8);
  tfhd.writeUInt32BE(0, 0);
  tfhd.writeUInt32BE(1, 4);
  const tfdt = Buffer.alloc(12);
  tfdt[0] = 1;
  tfdt.writeBigUInt64BE(0n, 4);
  const trun = Buffer.alloc(12);
  trun.writeUInt32BE(0x00000800, 0);
  trun.writeUInt32BE(1, 4);
  trun.writeUInt32BE(8 * 90000, 8);
  const fragment = box('moof', box('traf', Buffer.concat([
    box('tfhd', tfhd), box('tfdt', tfdt), box('trun', trun),
  ])));
  assert.equal(mp4VideoFragmentStart(fragment, [1], { 1: 90000 }), 0);
  assert.equal(mp4VideoFragmentCompositionStart(fragment, [1], { 1: 90000 }), 8);
});

test('HLS segment eşleyicisi imzalı sorgu değişse de yalnız tanımlı yolu kabul eder', () => {
  const playlist = '#EXTM3U\n#EXT-X-TARGETDURATION:6\n#EXT-X-MAP:URI="init.mp4"\n'
    + '#EXTINF:6,\nseg-1.m4s?token=old\n#EXTINF:6,\nseg-2.m4s?token=old\n';
  const tracks = [{ instreamId: 'CC1', language: 'en', supported: true }];
  const matchers = buildHlsCeaSegmentMatchers(playlist,
    'https://cdn.test/v/playlist.m3u8', tracks, 'https://cdn.test/master.m3u8');
  assert.equal(matchers.length, 2);
  const match = matchHlsCeaSegmentUrl('https://cdn.test/v/seg-2.m4s?token=fresh', matchers);
  assert.equal(match.sequence, 1);
  assert.equal(match.initializationUrl, 'https://cdn.test/v/init.mp4');
  assert.equal(match.tracks[0].instreamId, 'CC1');
  assert.equal(matchHlsCeaSegmentUrl('https://cdn.test/v/other.m4s', matchers), null);
});

test('aynı URLli byte-range parçaları Content-Range olmadan eşleşmeyi reddeder', () => {
  const playlist = '#EXTM3U\n#EXT-X-TARGETDURATION:6\n'
    + '#EXTINF:6,\n#EXT-X-BYTERANGE:1000@0\nseg.ts\n'
    + '#EXTINF:6,\n#EXT-X-BYTERANGE:1000\nseg.ts\n';
  const tracks = [{ instreamId: 'CC1', language: 'en', supported: true }];
  const matchers = buildHlsCeaSegmentMatchers(playlist,
    'https://cdn.test/v/playlist.m3u8', tracks, 'https://cdn.test/master.m3u8');
  assert.equal(matchers.length, 2);
  assert.equal(matchers[0].byteRange.start, 0);
  assert.equal(matchers[0].byteRange.end, 999);
  assert.equal(matchers[1].byteRange.start, 1000);
  assert.equal(matchers[1].byteRange.end, 1999);
  const url = 'https://cdn.test/v/seg.ts';
  // Content-Range yok + istek bilgisi yok → belirsiz, rastgele parça seçilemez.
  assert.equal(matchHlsCeaSegmentUrl(url, matchers), null);
  assert.equal(matchHlsCeaSegmentUrl(url, matchers, {}), null);
  assert.equal(matchHlsCeaSegmentUrl(url, matchers, {}, { status: 200 }), null);
  // Content-Range varsa yetkili eşleşme çalışmaya devam eder.
  const withRange = matchHlsCeaSegmentUrl(url, matchers,
    { 'Content-Range': 'bytes 1000-1999/4096' });
  assert.equal(withRange.sequence, 1);
  assert.equal(withRange.byteRange.start, 1000);
  // İstek Range başlığı 206 yanıtında ayırt edicidir.
  const byRequest = matchHlsCeaSegmentUrl(url, matchers, {},
    { seen: true, range: { start: 0, end: 999 }, status: 206 });
  assert.equal(byRequest.sequence, 0);
  const byRequest2 = matchHlsCeaSegmentUrl(url, matchers, {},
    { seen: true, range: { start: 1000, end: 1999 }, status: 206 });
  assert.equal(byRequest2.sequence, 1);
  // 200 yanıt = sunucu Range'i yok saydı → gövde tam dosya, parçaya bağlanamaz.
  assert.equal(matchHlsCeaSegmentUrl(url, matchers, {},
    { seen: true, range: { start: 0, end: 999 }, status: 200 }), null);
  // Range'siz gözlenen istek → tam-dosya indirme; düz aday yoksa reddedilir.
  assert.equal(matchHlsCeaSegmentUrl(url, matchers, {},
    { seen: true, range: null, status: 200 }), null);
  // 206 ama aralık bilgisi hiç yok → yine belirsiz.
  assert.equal(matchHlsCeaSegmentUrl(url, matchers, {},
    { seen: true, range: null, status: 206 }), null);
});

test('tek byte-range parçası belirsizlik olmadan eşleşmeye devam eder', () => {
  const playlist = '#EXTM3U\n#EXT-X-TARGETDURATION:6\n'
    + '#EXTINF:6,\n#EXT-X-BYTERANGE:1000@0\nseg.ts\n';
  const tracks = [{ instreamId: 'CC1', language: 'en', supported: true }];
  const matchers = buildHlsCeaSegmentMatchers(playlist,
    'https://cdn.test/v/playlist.m3u8', tracks);
  const match = matchHlsCeaSegmentUrl('https://cdn.test/v/seg.ts', matchers);
  assert.equal(match.byteRange.start, 0);
});

test('byte-range ve düz parça aynı URLi paylaşırsa belirsizlikte reddedilir', () => {
  const playlist = '#EXTM3U\n#EXT-X-TARGETDURATION:6\n'
    + '#EXTINF:6,\n#EXT-X-BYTERANGE:500@0\nseg.ts\n'
    + '#EXTINF:6,\nseg.ts\n';
  const tracks = [{ instreamId: 'CC1', language: 'en', supported: true }];
  const matchers = buildHlsCeaSegmentMatchers(playlist,
    'https://cdn.test/v/playlist.m3u8', tracks);
  const url = 'https://cdn.test/v/seg.ts';
  assert.equal(matchHlsCeaSegmentUrl(url, matchers), null);
  // Range'siz gözlenen istek düz parçayı seçer.
  const plain = matchHlsCeaSegmentUrl(url, matchers, {},
    { seen: true, range: null, status: 200 });
  assert.equal(plain.byteRange, undefined);
  assert.equal(plain.sequence, 1);
});

test('CDP ağ yolu: istek Range bilgisi eşleyiciye taşınır, belirsizlikte parça atanmaz', () => {
  // wc.debugger.on('message', ...) işleyicisini main.js kaynağından kesip
  // sanal requestWillBeSent/responseReceived olaylarıyla çalıştırır.
  const main = fs.readFileSync(path.join(ROOT, 'src', 'main.js'), 'utf8').replace(/\r\n/g, '\n');
  const start = main.indexOf('(_event, method, params, sessionId) => {');
  const end = main.indexOf(');\n  return view;', start);
  assert.ok(start >= 0 && end > start, 'debugger mesaj işleyicisi kaynakta bulunamadı');
  const playlist = '#EXTM3U\n#EXT-X-TARGETDURATION:6\n'
    + '#EXTINF:6,\n#EXT-X-BYTERANGE:1000@0\nseg.ts\n'
    + '#EXTINF:6,\n#EXT-X-BYTERANGE:1000\nseg.ts\n';
  const tracks = [{ instreamId: 'CC1', language: 'en', supported: true }];
  const browserPendingResponses = new Map();
  const browserRequestRanges = new Map();
  const captured = [];
  const view = {};
  const context = {
    BROWSER_CAPTURE_BODY_LIMIT,
    BROWSER_CAPTURE_CANDIDATE_LIMIT,
    BROWSER_CAPTURE_CANDIDATE_TTL,
    adapterAcceptsResponse: () => false,
    browserActiveTabId: 'tab-1',
    browserCaptureBodyAllowed: () => true,
    browserCaptureEnabled: true,
    browserDashSubtitleMatchers: [],
    browserEventContext: () => ({}),
    browserHlsCeaActive: null,
    browserHlsCeaSegmentMatchers: buildHlsCeaSegmentMatchers(playlist,
      'https://cdn.test/v/playlist.m3u8', tracks, 'https://cdn.test/master.m3u8'),
    browserPendingResponses,
    browserRequestRanges,
    browserResponseAdapter: () => null,
    browserStateGeneration: 0,
    browserView: view,
    captureBrowserResponse: (key) => captured.push(key),
    handleYoutubePlayerResponsePaused: async () => {},
    isCurrentBrowserContext: () => true,
    isLikelyMpegTsResponse,
    isLikelySubtitleResponse: (r) => /\.ts(?:[?#]|$)/i.test(String(r.url || '')),
    matchDashSubtitleUrl: () => null,
    matchHlsCeaSegmentUrl,
    normalizeBrowserNetworkRecord,
    noteBrowserCapture: () => {},
    pruneBrowserCaptureCandidates: () => ({}),
    tab: { id: 'tab-1', view, compatibilityMode: false },
    wc: { getURL: () => 'https://video.example/page' },
  };
  vm.createContext(context);
  const handler = vm.runInContext('(' + main.slice(start, end) + ')', context);
  const url = 'https://cdn.test/v/seg.ts';
  // 1) İstek Range'i saklanır ve Content-Range'siz 206 yanıtını doğru parçaya bağlar.
  handler(null, 'Network.requestWillBeSent', {
    requestId: 'r1', request: { url, headers: { Range: 'bytes=1000-1999' } } });
  assert.deepEqual(browserRequestRanges.get('root:r1'), { range: { start: 1000, end: 1999 } });
  handler(null, 'Network.responseReceived', {
    requestId: 'r1', type: 'Media',
    response: { url, status: 206, headers: {}, mimeType: 'video/mp2t' } });
  const first = browserPendingResponses.get('root:r1');
  assert.ok(first, 'r1 yanıtı yakalama adayı olmalı');
  assert.equal(first.ceaSegment.byteRange.start, 1000);
  assert.equal(first.ceaSegment.sequence, 1);
  // 2) İstek gözlenmeden gelen yanıt belirsizdir — parçaya bağlanmaz.
  handler(null, 'Network.responseReceived', {
    requestId: 'r2', type: 'Media',
    response: { url, status: 206, headers: {}, mimeType: 'video/mp2t' } });
  const second = browserPendingResponses.get('root:r2');
  assert.ok(second, 'r2 gövdesi yine yakalanır');
  assert.equal(second.ceaSegment, undefined,
    'Content-Range ve istek Range yoksa rastgele parçaya bağlanmamalı');
  // 3) Range'siz gözlenen istek → tam dosya; aralıklı parçalara bağlanamaz.
  handler(null, 'Network.requestWillBeSent', {
    requestId: 'r3', request: { url, headers: {} } });
  handler(null, 'Network.responseReceived', {
    requestId: 'r3', type: 'Media',
    response: { url, status: 200, headers: {}, mimeType: 'video/mp2t' } });
  assert.equal(browserPendingResponses.get('root:r3').ceaSegment, undefined);
  // 4) loadingFinished kaydı tüketir ve aralık kaydını temizler.
  handler(null, 'Network.loadingFinished', { requestId: 'r1' });
  assert.deepEqual(captured, ['root:r1']);
  assert.equal(browserRequestRanges.has('root:r1'), false);
  assert.equal(browserRequestRanges.has('root:r3'), true, 'r3 bitmedi, kaydı durur');
});

test('yalnız MPEG-TS video yanıtını erken yakalama adayı sayar', () => {
  assert.equal(isLikelyMpegTsResponse({ mimeType: 'video/mp2t', url: 'https://x/seg' }), true);
  assert.equal(isLikelyMpegTsResponse({ mimeType: 'video/mp4', url: 'https://x/seg.m4s' }), false);
  assert.equal(isLikelyMpegTsResponse({ mimeType: 'text/vtt', url: 'https://x/a.vtt' }), false);
});

test('AES-128 HLS segmentini örtük sıra IV değeriyle çözer', () => {
  const key = Buffer.from('00112233445566778899aabbccddeeff', 'hex');
  const plain = Buffer.from('CEA segment deneme gövdesi');
  const cipher = createCipheriv('aes-128-cbc', key, hlsAes128Iv(258));
  const encrypted = Buffer.concat([cipher.update(plain), cipher.final()]);
  assert.deepEqual(decryptHlsAes128(encrypted, key, 258), plain);
  assert.equal(hlsAes128Iv(258).toString('hex'), '00000000000000000000000000000102');
});

// R51-19: aynı playlist'in segment yanıtları ters sırada tamamlanırsa CEA-708
// decoder'ına geliş sırasıyla değil medya sırasıyla beslenmeli.
async function testOutOfOrderHlsSegments() {
  const main = fs.readFileSync(path.join(ROOT, 'src', 'main.js'), 'utf8').replace(/\r\n/g, '\n');
  const start = main.indexOf('async function captureBrowserHlsCeaSegment(');
  const end = main.indexOf('\nfunction browserConfiguredSubtitlePath(', start);
  assert.ok(start >= 0 && end > start, 'captureBrowserHlsCeaSegment kaynakta bulunamadı');
  const decodedOrder = [];
  const browserPendingResponses = new Map();
  class FakeDecoder {
    decodeTransportStream(_buffer, segment) { decodedOrder.push(segment.sequence); return []; }
    decodeFragmentedMp4() { return []; }
    reset() {}
  }
  const context = {
    Date, Number, Promise, Set, Map, setTimeout, Buffer,
    browserHlsCeaArrivals: new Map(),
    browserHlsCeaDecodeQueues: new Map(),
    browserHlsCeaDecoders: new Map(),
    browserHlsCeaFetchedSegments: new Set(),
    browserHlsCeaFullCaptureJob: null,
    browserHlsCeaInitializations: new Map(),
    browserPendingResponses,
    browserTrackPublications: new Map(),
    browserTrackPendingPublications: new Map(),
    ceaUrlKey: (value) => String(value || ''),
    CeaCaptionDecoder: FakeDecoder,
    cuesUseLocalSegmentTimeline: () => false,
    decryptHlsAes128: (buffer) => buffer,
    fetchBrowserBufferWithRetry: async () => Buffer.alloc(0),
    getBrowserHlsCeaKey: async () => Buffer.alloc(16),
    browserTrackStreamKey: () => 'stream',
    hlsCeaSegmentFetchKey: (segment = {}) =>
      [segment.playlistUrl || '', segment.discontinuity || 0, segment.sequence ?? '', segment.url || ''].join('|'),
    isCurrentBrowserContext: () => true,
    normalizeCueProvenance: (value) => value,
    noteBrowserCapture: () => {},
    storeBrowserTrack: () => ({ ok: true }),
    trimInsertionCollection: () => {},
  };
  vm.createContext(context);
  const capture = vm.runInContext('(' + main.slice(start, end) + ')', context);
  const seg = (sequence) => ({
    playlistUrl: 'https://cdn.test/v/playlist.m3u8', sourceUrl: 'https://cdn.test/master.m3u8',
    url: `https://cdn.test/v/seg${sequence}.ts`, sequence, discontinuity: 0,
    start: sequence * 6, duration: 6, tracks: [],
  });
  // seq=1 yanıtı CDP'de görüldü ama gövdesi hâlâ okunuyor (pending'de).
  browserPendingResponses.set('root:r1', { ceaSegment: seg(1) });
  // seq=2 önce tamamlandı — yakalama çağrısı önce girer.
  const p2 = capture(Buffer.from('two'), { ceaSegment: seg(2) }, null);
  // seq=1'in gövde okuması bitti, yakalama şimdi sıraya giriyor.
  browserPendingResponses.delete('root:r1');
  const p1 = capture(Buffer.from('one'), { ceaSegment: seg(1) }, null);
  await Promise.all([p1, p2]);
  assert.deepEqual(decodedOrder, [1, 2],
    `ters tamamlanan segmentler decoder'a medya sırasıyla gitmedi: ${decodedOrder}`);
  console.log('  OK  R51-19 ters sıralı HLS segmentleri medya sırasıyla çözülür');
}

// R51-16: manifest INSTREAM-ID="SERVICE1" (CEA-708) mux.js'in "cc708_1"
// stream adıyla eşleşmeli; düz karşılaştırma tüm 708 cue'larını düşürürdü.
test('R51-16: SERVICE<n> manifest kimliği cc708_<n> çözülmüş akışıyla eşleşir', () => {
  assert.equal(ceaStreamMatchesInstream('SERVICE1', 'cc708_1'), true);
  assert.equal(ceaStreamMatchesInstream('service3', 'CC708_3'), true);
  assert.equal(ceaStreamMatchesInstream('SERVICE1', 'cc708_2'), false);
  assert.equal(ceaStreamMatchesInstream('CC1', 'CC1'), true);
  assert.equal(ceaStreamMatchesInstream('CC1', 'cc708_1'), false);
  assert.equal(ceaStreamMatchesInstream('SERVICE1', 'CC1'), false);
  assert.equal(ceaStreamMatchesInstream('', 'cc708_1'), false);
  assert.equal(ceaStreamMatchesInstream('SERVICE1', ''), false);
  // Üretim eşleme noktası yardımcıyı kullanmak zorunda — ham === kalmamalı.
  const main = fs.readFileSync(path.join(ROOT, 'src', 'main.js'), 'utf8');
  assert.ok(/ceaStreamMatchesInstream\(track\.instreamId, cue\.stream\)/.test(main),
    'main.js iz eşleşmesi SERVICE↔cc708 köprüsünü kullanmıyor');
  assert.ok(/ceaStreamMatchesInstream/.test(main.slice(0, main.indexOf('= require(\'./browser-cea-captions\')'))),
    'ceaStreamMatchesInstream import edilmemiş');
});

testOutOfOrderHlsSegments()
  .then(() => console.log(`browser-cea-captions: ${passed + 1}/${passed + 1} OK`))
  .catch((error) => { console.error('  FAIL R51-19', error); process.exitCode = 1; });
