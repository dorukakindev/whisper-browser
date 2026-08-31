const assert = require('assert');
const fs = require('fs');
const path = require('path');
const {
  browserNavigationCapabilities,
  cueFingerprint,
  cuesToSrt,
  cuesToVtt,
  isLikelySubtitleResponse,
  manifestFingerprint,
  parseAss,
  parseHlsSubtitleTracks,
  parseHlsSegmentUris,
  parseHlsSegments,
  isHlsSubtitlePlaylist,
  parseDashSubtitleTracks,
  parseDashSubtitleMatchers,
  matchDashSubtitleUrl,
  dashSegmentOffset,
  cuesUseLocalSegmentTimeline,
  browserActiveCuesAt,
  parseMp4WebVtt,
  parseMp4Timescale,
  findSubtitleUrls,
  parseLrc,
  parseSami,
  parseSubtitlePayload,
  parseTime,
} = require('../src/browser-subtitles');

let passed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log(`  OK  ${name}`); }
  catch (err) { console.error(`  FAIL ${name}\n${err.stack}`); process.exitCode = 1; }
}

test('WebVTT satırlarını ve HTML etiketlerini ayrıştırır', () => {
  const result = parseSubtitlePayload(`WEBVTT\n\n00:01.000 --> 00:03.500\n<c.green>Hello &amp; welcome</c>\n\n00:04.000 --> 00:06.000\nSecond line`, 'text/vtt', 'https://cdn.test/captions.vtt');
  assert.equal(result.format, 'vtt');
  assert.deepEqual(result.cues, [
    { start: 1, end: 3.5, text: 'Hello & welcome' },
    { start: 4, end: 6, text: 'Second line' },
  ]);
});

test('Parçalı WebVTT MPEGTS zaman haritasını video zamanına uygular', () => {
  const result = parseSubtitlePayload('WEBVTT\nX-TIMESTAMP-MAP=LOCAL:00:00:00.000,MPEGTS:900000\n\n00:00.500 --> 00:02.000\nMapped cue', 'text/vtt', 'https://cdn.test/seg-1.vtt');
  assert.deepEqual(result.cues, [{ start: 10.5, end: 12, text: 'Mapped cue' }]);
});

test('TTML begin/end ve begin/dur zamanlarını ayrıştırır', () => {
  const result = parseSubtitlePayload(`<tt><body><div>
    <p begin="00:00:02.000" end="00:00:04.250">First<br/>line</p>
    <p begin="5.5s" dur="2s">Second</p>
  </div></body></tt>`, 'application/ttml+xml', 'https://cdn.test/subtitle');
  assert.equal(result.format, 'ttml');
  assert.equal(result.cues.length, 2);
  assert.deepEqual(result.cues[0], { start: 2, end: 4.25, text: 'First\nline' });
  assert.deepEqual(result.cues[1], { start: 5.5, end: 7.5, text: 'Second' });
});

test('TTML tick ve frame zamanlarını kök oranıyla saniyeye çevirir', () => {
  const ticks = parseSubtitlePayload('<tt ttp:tickRate="1000"><body><p begin="1500t" dur="500t">Tick</p></body></tt>', 'application/ttml+xml', 'https://cdn.test/1.m4s');
  assert.deepEqual(ticks.cues, [{ start: 1.5, end: 2, text: 'Tick' }]);
  const frames = parseSubtitlePayload('<tt ttp:frameRate="25"><body><p begin="50f" end="75f">Frame</p></body></tt>', 'application/ttml+xml', 'https://cdn.test/2.m4s');
  assert.deepEqual(frames.cues, [{ start: 2, end: 3, text: 'Frame' }]);
});

test('YouTube json3 olaylarını saniyeye çevirir', () => {
  const result = parseSubtitlePayload(JSON.stringify({ events: [
    { tStartMs: 1250, dDurationMs: 2250, segs: [{ utf8: 'Hello ' }, { utf8: 'world' }] },
    { tStartMs: 4000, dDurationMs: 1000, segs: [{ utf8: 'Again' }] },
  ] }), 'application/json', 'https://youtube.com/api/timedtext?fmt=json3');
  assert.equal(result.format, 'json3');
  assert.deepEqual(result.cues[0], { start: 1.25, end: 3.5, text: 'Hello world' });
});

test('YouTube srv3 kısa t/d değerlerini de milisaniye kabul eder', () => {
  const result = parseSubtitlePayload('<timedtext><body><p t="80" d="40">Kısa</p></body></timedtext>',
    'text/xml', 'https://youtube.com/api/timedtext?fmt=srv3');
  // Normalleştirici, görünür kalması için bloklara en az 80 ms süre verir.
  assert.deepEqual(result.cues, [{ start: .08, end: .16, text: 'Kısa' }]);
});

test('Genel altyazı JSON dizisini açık zaman alanlarıyla ayrıştırır', () => {
  const result = parseSubtitlePayload(JSON.stringify({ captions: [
    { startTimeMs: 1250, endTimeMs: 2500, text: 'Bir' },
    { startTimeMs: 3000, durationMs: 750, text: 'İki' },
  ] }), 'application/json', 'https://cdn.test/captions');
  assert.deepEqual(result.cues, [
    { start: 1.25, end: 2.5, text: 'Bir' },
    { start: 3, end: 3.75, text: 'İki' },
  ]);
});

test('Normal JSON API yanıtını altyazı diye kabul etmez', () => {
  const result = parseSubtitlePayload('{"status":"ok","items":[1,2,3]}', 'application/json', 'https://example.test/api/caption-settings');
  assert.equal(result.cues.length, 0);
});

test('Altyazı ipucu olmayan genel metin yanıtını izlemez', () => {
  assert.equal(isLikelySubtitleResponse({ url: 'https://example.test/api/profile', mimeType: 'application/json' }), false);
  assert.equal(isLikelySubtitleResponse({ url: 'https://example.test/media/movie.vtt', mimeType: 'text/vtt' }), true);
  assert.equal(isLikelySubtitleResponse({ url: 'https://example.test/api/timedtext?lang=en', mimeType: 'application/json' }), true);
});

test('Aynı cue içeriği kararlı parmak izi üretir', () => {
  const cues = [{ start: 1, end: 2, text: 'A' }, { start: 3, end: 4, text: 'B' }];
  assert.equal(cueFingerprint(cues), cueFingerprint(cues.map((cue) => ({ ...cue }))));
  assert.notEqual(cueFingerprint(cues), cueFingerprint([{ start: 1, end: 2, text: 'C' }]));
});

test('Manifest parmak izi aynı uzunluktaki orta bölüm değişikliğini yakalar', () => {
  const prefix = 'A'.repeat(500);
  const suffix = 'Z'.repeat(500);
  assert.notEqual(manifestFingerprint(`${prefix}X${suffix}`), manifestFingerprint(`${prefix}Y${suffix}`));
});

test('SRT çıktısı UTF-8 metni ve zamanları korur', () => {
  const srt = cuesToSrt([{ start: 1.005, end: 3.21, text: 'Türkçe metin' }]);
  assert.match(srt, /00:00:01,005 --> 00:00:03,210/);
  assert.match(srt, /Türkçe metin/);
});

test('WebVTT dışa aktarımı başlık ve noktalı zaman damgası üretir', () => {
  const vtt = cuesToVtt([{ start: 1.005, end: 3.21, text: 'Türkçe metin' }]);
  assert.match(vtt, /^WEBVTT\r?\n\r?\n/);
  assert.match(vtt, /00:00:01\.005 --> 00:00:03\.210/);
  assert.match(vtt, /Türkçe metin/);
});

test('Zaman ayrıştırıcı saatli ve birimli değerleri destekler', () => {
  assert.equal(parseTime('01:02:03.500'), 3723.5);
  assert.equal(parseTime('2500ms'), 2.5);
  assert.equal(parseTime('1.5m'), 90);
});

test('Hulu benzeri HLS manifestinden altyazı izlerini çıkarır', () => {
  const tracks = parseHlsSubtitleTracks('#EXT-X-MEDIA:TYPE=SUBTITLES,GROUP-ID="cc",LANGUAGE="en",NAME="English",URI="captions/en.m3u8"\n#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="a",URI="audio.m3u8"', 'https://cdn.test/video/master.m3u8');
  assert.deepEqual(tracks, [{ url: 'https://cdn.test/video/captions/en.m3u8', language: 'en', label: 'English', forced: false }]);
  assert.deepEqual(parseHlsSegmentUris('#EXTINF:4,\npart-1.vtt\n#EXTINF:4,\npart-2.vtt', 'https://cdn.test/video/captions/en.m3u8'), ['https://cdn.test/video/captions/part-1.vtt', 'https://cdn.test/video/captions/part-2.vtt']);
  assert.deepEqual(parseHlsSegments('#EXTINF:4,\npart-1.vtt\n#EXTINF:5.5,\npart-2.vtt', 'https://cdn.test/video/captions/en.m3u8'), [
    { url: 'https://cdn.test/video/captions/part-1.vtt', start: 0, duration: 4 },
    { url: 'https://cdn.test/video/captions/part-2.vtt', start: 4, duration: 5.5 },
  ]);
  assert.deepEqual(parseHlsSegments('#EXTINF:2,\nsame.vtt\n#EXTINF:3,\nsame.vtt\n#EXTINF:4,\nnext.vtt', 'https://cdn.test/video/captions/en.m3u8'), [
    { url: 'https://cdn.test/video/captions/same.vtt', start: 0, duration: 2 },
    { url: 'https://cdn.test/video/captions/same.vtt', start: 2, duration: 3 },
    { url: 'https://cdn.test/video/captions/next.vtt', start: 5, duration: 4 },
  ]);
  assert.equal(isHlsSubtitlePlaylist('#EXTM3U\n#EXTINF:4,\npart-1.vtt', 'https://cdn.test/master.m3u8'), true);
  assert.equal(isHlsSubtitlePlaylist('#EXTM3U\n#EXTINF:4,\nvideo-1.ts', 'https://cdn.test/video.m3u8'), false);
});

test('DASH MPD içindeki doğrudan TTML ve VTT adaptasyonlarını bulur', () => {
  const mpd = '<MPD><Period><AdaptationSet contentType="text" lang="en" mimeType="application/ttml+xml"><Representation id="en"><BaseURL>subs/en.ttml</BaseURL></Representation></AdaptationSet><AdaptationSet contentType="video"><Representation><BaseURL>video.m4s</BaseURL></Representation></AdaptationSet></Period></MPD>';
  assert.deepEqual(parseDashSubtitleTracks(mpd, 'https://cdn.test/movie/manifest.mpd'), [{ url: 'https://cdn.test/movie/subs/en.ttml', language: 'en', label: 'en', format: 'ttml' }]);
  const nested = '<MPD><BaseURL>https://media.test/root/</BaseURL><Period><BaseURL>period/</BaseURL><AdaptationSet contentType="text" lang="tr"><BaseURL>subs/</BaseURL><Representation id="tr"><BaseURL>main.ttml</BaseURL></Representation></AdaptationSet></Period></MPD>';
  assert.equal(parseDashSubtitleTracks(nested, 'https://origin.test/a.mpd')[0].url, 'https://media.test/root/period/subs/main.ttml');
  const selfClosing = '<MPD><Period><AdaptationSet contentType="text" mimeType="text/vtt"><BaseURL>captions.vtt</BaseURL><Representation id="tr"/></AdaptationSet></Period></MPD>';
  assert.deepEqual(parseDashSubtitleTracks(selfClosing, 'https://cdn.test/movie/manifest.mpd'), [
    { url: 'https://cdn.test/movie/captions.vtt', language: '', label: 'tr', format: 'vtt' },
  ]);
});

test('DASH parçalı altyazı eşleştiricisi video segmentlerini dışarıda bırakır', () => {
  const mpd = `<MPD><Period><AdaptationSet contentType="video" mimeType="video/mp4"><SegmentTemplate media="video/$Number$.m4s" duration="5000" timescale="1000"/><Representation id="v1"/></AdaptationSet><AdaptationSet contentType="text" lang="en" mimeType="application/mp4" codecs="stpp"><SegmentTemplate media="text/$RepresentationID$/$Number%05d$.m4s" duration="6000" timescale="1000" startNumber="1"/><Representation id="eng" bandwidth="1000"/></AdaptationSet></Period></MPD>`;
  const matchers = parseDashSubtitleMatchers(mpd, 'https://cdn.test/movie/manifest.mpd');
  assert.equal(matchers.length, 1);
  assert.equal(matchDashSubtitleUrl('https://cdn.test/movie/video/2.m4s', matchers), null);
  const subtitle = matchDashSubtitleUrl('https://cdn.test/movie/text/eng/00003.m4s', matchers);
  assert.equal(subtitle.language, 'en');
  assert.equal(dashSegmentOffset(subtitle), 12);
  assert.ok(matchDashSubtitleUrl('https://cdn.test/movie/text/eng/00003.m4s?token=signed', matchers));
  const repTyped = '<MPD><Period><AdaptationSet><SegmentTemplate media="cc/$Number$.m4s"/><Representation id="tr" mimeType="application/ttml+xml"/></AdaptationSet></Period></MPD>';
  assert.equal(parseDashSubtitleMatchers(repTyped, 'https://cdn.test/a.mpd').length, 1);
  const initOnly = '<MPD><Period><AdaptationSet contentType="text" codecs="wvtt"><SegmentTemplate media="cc/$Number$.m4s" initialization="cc/$RepresentationID$/init.mp4"/><Representation id="en"/></AdaptationSet></Period></MPD>';
  const initMatcher = parseDashSubtitleMatchers(initOnly, 'https://cdn.test/movie/a.mpd')[0];
  assert.equal(initMatcher.timescale, 0);
  assert.equal(initMatcher.initializationUrl, 'https://cdn.test/movie/cc/en/init.mp4');
});

test('Segment zaman kararı mutlak cueyu ikinci kez kaydırmaz', () => {
  assert.equal(cuesUseLocalSegmentTimeline([{ start: 0.25, end: 3, text: 'Yerel' }], 6, 12), true);
  assert.equal(cuesUseLocalSegmentTimeline([{ start: 3.5, end: 5.8, text: 'Müzikten sonra' }], 6, 12), true);
  assert.equal(cuesUseLocalSegmentTimeline([{ start: 6.1, end: 9, text: 'Mutlak' }], 6, 6), false);
  assert.equal(cuesUseLocalSegmentTimeline([{ start: 4, end: 7.5, text: 'Mutlak HLS' }], 4, 4), false);
});

test('Aynı anda etkin olan çakışan altyazıların tamamını korur', () => {
  const cues = [
    { start: 1, end: 4, text: 'Konuşmacı bir' },
    { start: 2, end: 5, text: 'Konuşmacı iki' },
    { start: 6, end: 7, text: 'Sonraki' },
  ];
  assert.deepEqual(browserActiveCuesAt(cues, 3).map((cue) => cue.text),
    ['Konuşmacı bir', 'Konuşmacı iki']);
  assert.deepEqual(browserActiveCuesAt(cues, 5.5), []);
});

test('DASH wvtt MP4 örneklerini gerçek trun zamanlarıyla ayrıştırır', () => {
  const box = (type, payload) => {
    const head = Buffer.alloc(8); head.writeUInt32BE(payload.length + 8); head.write(type, 4, 4, 'ascii');
    return Buffer.concat([head, payload]);
  };
  const full = (flags, payload, version = 0) => {
    const head = Buffer.alloc(4); head[0] = version; head.writeUIntBE(flags, 1, 3);
    return Buffer.concat([head, payload]);
  };
  const cueSample = (text) => box('vttc', box('payl', Buffer.from(text, 'utf-8')));
  const first = cueSample('Bir'); const second = cueSample('İki');
  const tfhdPayload = Buffer.alloc(4); tfhdPayload.writeUInt32BE(1);
  const tfdtPayload = Buffer.alloc(4); tfdtPayload.writeUInt32BE(6000);
  const rows = Buffer.alloc(4 + 2 * 8); rows.writeUInt32BE(2);
  rows.writeUInt32BE(2000, 4); rows.writeUInt32BE(first.length, 8);
  rows.writeUInt32BE(2000, 12); rows.writeUInt32BE(second.length, 16);
  const traf = box('traf', Buffer.concat([
    box('tfhd', full(0, tfhdPayload)), box('tfdt', full(0, tfdtPayload)), box('trun', full(0x300, rows)),
  ]));
  const fragment = Buffer.concat([box('moof', traf), box('mdat', Buffer.concat([first, second]))]);
  assert.deepEqual(parseMp4WebVtt(fragment, { timescale: 1000 }), [
    { start: 6, end: 8, text: 'Bir' }, { start: 8, end: 10, text: 'İki' },
  ]);
  const mdhd = Buffer.alloc(20); mdhd.writeUInt32BE(1000, 12);
  const init = box('moov', box('trak', box('mdia', box('mdhd', mdhd))));
  assert.equal(parseMp4Timescale(init), 1000);
  assert.deepEqual(parseMp4WebVtt(fragment, {}), []);
});

test('JSON manifest içindeki timed-text URLlerini false positive üretmeden bulur', () => {
  const body = JSON.stringify({ movieId: 'x', timedtexttracks: [{ language: 'en', url: '/text/en.ttml' }], image: '/poster.jpg' });
  assert.deepEqual(findSubtitleUrls(body, 'https://media.test/playback/manifest'), ['https://media.test/text/en.ttml']);
  assert.deepEqual(findSubtitleUrls('{"status":"ok","url":"/api/profile"}', 'https://media.test/'), []);
});

test('ASS, SAMI ve LRC metinleri ortak cue modeline dönüştürür', () => {
  assert.deepEqual(parseAss('[Events]\nDialogue: 0,0:00:01.00,0:00:03.00,Default,,0,0,0,,{\\i1}Merhaba\\N dünya'), [{ start: 1, end: 3, text: 'Merhaba\ndünya' }]);
  assert.equal(parseSami('<SAMI><SYNC Start=1000><P>Bir</P><SYNC Start=3000><P>İki</P></SYNC>').length, 2);
  assert.deepEqual(parseLrc('[00:01.00]Bir\n[00:03.00]İki').map((cue) => cue.start), [1, 3]);
});

test('Tarayıcı geri/ileri durumu yeni Electron API ve eski API ile güvenli okunur', () => {
  const modern = browserNavigationCapabilities({
    navigationHistory: {
      canGoBack: () => true,
      canGoForward: () => false,
    },
    canGoBack: () => false,
    canGoForward: () => true,
  });
  assert.deepEqual(modern, { canGoBack: true, canGoForward: false });

  const legacy = browserNavigationCapabilities({
    canGoBack: () => false,
    canGoForward: () => true,
  });
  assert.deepEqual(legacy, { canGoBack: false, canGoForward: true });

  const unavailable = browserNavigationCapabilities({
    navigationHistory: { canGoBack: () => { throw new Error('hazır değil'); } },
  });
  assert.deepEqual(unavailable, { canGoBack: false, canGoForward: false });
});

test('Tarayıcı modu IPC ve güvenlik sınırları üç katmanda bağlıdır', () => {
  const root = path.join(__dirname, '..', 'src');
  const main = fs.readFileSync(path.join(root, 'main.js'), 'utf8');
  const preload = fs.readFileSync(path.join(root, 'preload.js'), 'utf8');
  const renderer = fs.readFileSync(path.join(root, 'renderer', 'renderer.js'), 'utf8');
  const html = fs.readFileSync(path.join(root, 'renderer', 'index.html'), 'utf8');
  assert.match(main, /new WebContentsView/);
  assert.match(main, /app\.commandLine\.appendSwitch\('disable-quic'\)/);
  assert.match(main, /partition: BROWSER_PARTITION/);
  assert.match(main, /BROWSER_PARTITION = 'persist:whisper-browser'/);
  assert.match(main, /browserSession\.flushStorageData\(\)/);
  assert.match(main, /browserSession\.cookies\.flushStore\(\)/);
  assert.match(main, /flushBrowserSession\(\)\.finally/);
  assert.match(main, /nodeIntegration: false/);
  assert.match(main, /contextIsolation: true/);
  assert.match(main, /sandbox: true/);
  assert.match(main, /ipcMain\.handle\('browser:navigate'/);
  assert.match(main, /parseHlsSubtitleTracks/);
  assert.match(main, /findSubtitleUrls/);
  assert.match(main, /Network\.responseReceived/);
  assert.match(main, /Target\.setAutoAttach/);
  assert.match(main, /browserCaptureHookScript/);
  assert.match(main, /const bodyBase64 = String\(entry\.bodyBase64/);
  assert.match(main, /\(!body && !bodyBase64\)/);
  assert.match(main, /processBrowserCapturedPayload/);
  assert.match(main, /capture-status/);
  assert.match(main, /\.framesInSubtree/);
  assert.match(main, /node\.shadowRoot/);
  assert.match(main, /executeBrowserFrames\(browserOverlayScript/);
  assert.match(main, /document\.fullscreenElement/);
  assert.match(main, /fullscreenchange/);
  assert.match(main, /state\.offset/);
  assert.match(main, /browserSeenManifests = new Map/);
  assert.match(main, /requestMediaKeySystemAccess\('com\.widevine\.alpha'/);
  assert.match(main, /components\.whenReady\(\)/);
  assert.match(main, /waitForProtectedPlayback\(url\)/);
  assert.match(main, /type: 'drm-wait'/);
  assert.match(main, /widevineReadinessPromise = readiness/);
  assert.match(main, /setUserAgent\(sanitizeBrowserUserAgent\(/);
  assert.match(main, /drm-playback-error/);
  assert.match(main, /require\('\.\/browser-drm'\)/);
  assert.match(main, /matchDashSubtitleUrl/);
  assert.match(main, /parseMp4Timescale\(init\)/);
  assert.match(main, /browserNavigationCapabilities\(wc\)/);
  assert.match(main, /type: 'load-error'[\s\S]*browserNavigationState\(\{ loading: false \}\)/);
  assert.match(main, /overrideBrowserWindowOptions: browserPopupWindowOptions\(\)/);
  assert.doesNotMatch(main, /setTimeout\(\(\) => wc\.loadURL\(safe\)/);
  assert.match(main, /'frame-step', 'speed'/);
  assert.match(main, /updatedAt: Date\.now\(\)/);
  assert.match(main, /browser:places:list/);
  assert.match(main, /browser:places:toggleBookmark/);
  assert.match(main, /browser:places:clearHistory/);
  assert.match(main, /browser:cookies:clearSite/);
  assert.match(main, /browser:cookies:clearAll/);
  assert.match(main, /clearStorageData\(\{ storages: \['cookies'\] \}\)/);
  assert.match(main, /browserCookieMatchesHost/);
  assert.match(main, /browser:session:reset/);
  assert.match(main, /browser:subtitle:export/);
  assert.match(main, /rememberBrowserVisit\(wc\.getURL\(\)/);
  assert.match(preload, /navigateBrowser:/);
  assert.match(preload, /onBrowserEvent:/);
  assert.match(preload, /listBrowserPlaces:/);
  assert.match(preload, /toggleBrowserBookmark:/);
  assert.match(preload, /resetBrowserSession:/);
  assert.match(preload, /clearBrowserSiteCookies:/);
  assert.match(preload, /clearBrowserCookies:/);
  assert.match(preload, /exportBrowserSubtitle:/);
  assert.match(renderer, /function setWorkspaceMode/);
  assert.match(renderer, /offset: player\.offset/);
  assert.match(renderer, /scheduleActiveBrowserTrackRefresh/);
  assert.match(renderer, /waitForBrowserTrackStable/);
  assert.match(renderer, /opts\.language = browserLanguage/);
  assert.match(renderer, /browserSourceCueCount/);
  assert.doesNotMatch(renderer, /attempt < 120/);
  assert.match(renderer, /selectedBefore \|\| event\.track\.id/);
  assert.match(renderer, /preserveInspector/);
  assert.match(renderer, /function renderBrowserPlaces/);
  assert.match(renderer, /browserPlacesSeq/);
  assert.match(renderer, /browserAddressSuggestions/);
  assert.match(renderer, /browserBookmarkToggle/);
  assert.match(renderer, /function renderBrowserDiagnostics/);
  assert.match(html, /id="workspaceBrowserMode"/);
  assert.match(html, /id="browserTrackTranslate"/);
  assert.match(html, /id="browserDiagnosticsPanel"/);
  assert.match(html, /id="browserPlacesPanel"/);
  assert.match(html, /id="browserBookmarkToggle"/);
  assert.match(html, /id="browserAddressSuggestions"/);
  assert.match(html, /id="browserPlacesClear"/);
  assert.match(html, /id="browserSessionReset"/);
  assert.match(html, /id="browserSiteCookiesClear"/);
  assert.match(html, /id="browserCookiesClear"/);
  assert.match(renderer, /clearBrowserCookieScope/);
  assert.match(renderer, /clearBrowserSiteCookies/);
  assert.match(renderer, /clearBrowserCookies/);
  const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'package.json'), 'utf8'));
  assert.match(pkg.devDependencies.electron, /castlabs\/electron-releases#v43\.2\.0\+wvcus/);
});

if (!process.exitCode) console.log(`\n${passed} tarayıcı altyazısı testi geçti.`);
