'use strict';

const assert = require('assert');
const {
  mergeBrowserStreamCues, parseDashSubtitleMatchers, parseHlsSegments,
  parseHlsSubtitleTracks, parseSubtitlePayload, matchDashSubtitleUrl, dashSegmentOffset,
} = require('../src/browser-subtitles');
const { createBrowserStreamFixtureServer } = require('./browser-stream-fixture-server');

(async () => {
  const fixture = await createBrowserStreamFixtureServer();
  try {
    const masterUrl = `${fixture.baseUrl}/hls/master.m3u8`;
    const master = await (await fetch(masterUrl)).text();
    const [track] = parseHlsSubtitleTracks(master, masterUrl);
    const playlist = await (await fetch(track.url)).text();
    const segments = parseHlsSegments(playlist, track.url);
    assert.deepEqual(segments.map(({ sequence, discontinuity }) => ({ sequence, discontinuity })), [
      { sequence: 40, discontinuity: 0 }, { sequence: 41, discontinuity: 0 }, { sequence: 42, discontinuity: 1 },
    ]);
    const first = parseSubtitlePayload(await (await fetch(segments[0].url)).text(), 'text/vtt', segments[0].url).cues;
    assert.equal(first[0].text, "Bugün Sidney'de");
    assert.equal((await fetch(segments[1].url)).status, 404, 'eksik HLS segmenti gerçekten 404 dönmeli');
    const started = Date.now();
    const delayed = parseSubtitlePayload(await (await fetch(segments[2].url)).text(), 'text/vtt', segments[2].url).cues;
    assert(Date.now() - started >= 60, 'geciken segment anında dönmemeli');
    assert.equal(delayed[0].start, 8, 'discontinuity sonrası MPEGTS zamanı korunmalı');

    const wrongMimeUrl = `${fixture.baseUrl}/hls/wrong-mime.vtt`;
    const wrongMimeResponse = await fetch(wrongMimeUrl);
    const wrongMime = parseSubtitlePayload(await wrongMimeResponse.text(),
      wrongMimeResponse.headers.get('content-type'), wrongMimeUrl).cues;
    assert.equal(wrongMime[0].text, 'Yanlış MIME ile gelen altyazı',
      'dosya uzantısı geçerli VTT içeriğini yanlış MIME yüzünden kaybetmemeli');

    const partialUrl = `${fixture.baseUrl}/hls/partial.vtt`;
    const partialFirst = parseSubtitlePayload(await (await fetch(partialUrl)).text(), 'text/vtt', partialUrl).cues;
    assert.equal(partialFirst.length, 0, 'yarım kalan cue başarı sayılmamalı');
    const partialRetry = parseSubtitlePayload(await (await fetch(partialUrl)).text(), 'text/vtt', partialUrl).cues;
    assert.equal(partialRetry[0].text, 'Yeniden denemede tamamlandı');

    const staleSigned = await fetch(`${fixture.baseUrl}/hls/signed-live.m3u8?token=expired`);
    assert.equal(staleSigned.status, 403, 'süresi dolan imzalı manifest 403 dönmeli');
    const refreshedSigned = await fetch(`${fixture.baseUrl}/hls/signed-live.m3u8?token=fresh`);
    assert.equal(refreshedSigned.status, 200, 'manifest URL yenilendiğinde akış açılmalı');
    assert.equal(parseHlsSegments(await refreshedSigned.text(), refreshedSigned.url)[0].sequence, 90);

    const rollingUrl = `${fixture.baseUrl}/hls/rolling-live.m3u8`;
    const rollingFirst = parseHlsSegments(await (await fetch(rollingUrl)).text(), rollingUrl);
    const rollingSecond = parseHlsSegments(await (await fetch(rollingUrl)).text(), rollingUrl);
    assert.deepEqual(rollingFirst.map((item) => item.sequence), [100, 101]);
    assert.deepEqual(rollingSecond.map((item) => item.sequence), [101, 102]);
    let rollingCues = [];
    const fetchedSequences = new Set();
    for (const segment of [...rollingFirst, ...rollingSecond]) {
      if (fetchedSequences.has(segment.sequence)) continue;
      fetchedSequences.add(segment.sequence);
      const parsed = parseSubtitlePayload(await (await fetch(segment.url)).text(), 'text/vtt', segment.url).cues;
      rollingCues = mergeBrowserStreamCues(rollingCues, parsed.map((cue) => ({ ...cue, sequence: segment.sequence })));
    }
    assert.deepEqual([...fetchedSequences], [100, 101, 102], 'canlı pencere yenilenirken ortak segment tekrar alınmamalı');
    assert.deepEqual(rollingCues.map((cue) => cue.text), ['Canlı 100', 'Canlı 101', 'Canlı 102']);

    const rolloverUrl = `${fixture.baseUrl}/hls/rollover.m3u8`;
    const rolloverSegments = parseHlsSegments(await (await fetch(rolloverUrl)).text(), rolloverUrl);
    const mpegTsState = {};
    const rolloverCues = [];
    for (const segment of rolloverSegments) {
      const response = await fetch(segment.url);
      rolloverCues.push(...parseSubtitlePayload(await response.text(), response.headers.get('content-type'),
        segment.url, { mpegTsState }).cues);
    }
    assert.equal(rolloverCues.length, 2);
    assert(rolloverCues[1].start > rolloverCues[0].start,
      'MPEGTS 33-bit devrinden sonra HTTP segment zamanı geriye gitmemeli');
    assert(Math.abs(rolloverCues[1].start - rolloverCues[0].start - 2) < 0.001);

    const mpdUrl = `${fixture.baseUrl}/dash/manifest.mpd`;
    const mpd = await (await fetch(mpdUrl)).text();
    const dash = parseDashSubtitleMatchers(mpd, mpdUrl);
    assert.equal(dash.length, 3);
    const dashOneUrl = `${fixture.baseUrl}/dash/one.m4s`;
    const dashMissingUrl = `${fixture.baseUrl}/dash/missing.m4s`;
    assert(matchDashSubtitleUrl(dashOneUrl, dash));
    assert(matchDashSubtitleUrl(dashMissingUrl, dash));
    assert.equal((await fetch(dashMissingUrl)).status, 404);
    const dashCue = parseSubtitlePayload(await (await fetch(dashOneUrl)).text(), 'application/ttml+xml', dashOneUrl).cues;
    assert.equal(dashCue[0].text, 'Birinci bölüm');

    const multiPeriodUrl = `${fixture.baseUrl}/dash/multi-period.mpd`;
    const multiPeriod = parseDashSubtitleMatchers(await (await fetch(multiPeriodUrl)).text(), multiPeriodUrl);
    assert.equal(multiPeriod.length, 2, 'iki DASH Period ayrı altyazı segmenti üretmeli');
    const periodUrls = [`${fixture.baseUrl}/dash/p1/one.m4s`, `${fixture.baseUrl}/dash/p2/two.m4s`];
    const periodTexts = [];
    for (const periodUrl of periodUrls) {
      const matcher = matchDashSubtitleUrl(periodUrl, multiPeriod);
      assert(matcher, `${periodUrl} çok dönemli manifestte eşleşmedi`);
      const response = await fetch(periodUrl);
      const cues = parseSubtitlePayload(await response.text(), response.headers.get('content-type'), periodUrl).cues;
      periodTexts.push(cues[0].text);
    }
    assert.deepEqual(periodTexts, ['Birinci dönem', 'İkinci dönem']);
    assert.deepEqual(multiPeriod.map((matcher) => dashSegmentOffset(matcher)), [0, 4],
      'DASH dönem segment numaralarının zaman tabanı korunmalı');

    const merged = mergeBrowserStreamCues(first,
      [{ ...first[0], start: 3.95, end: 6, text: "Bugün Sidney'de" }]);
    assert.equal(merged.length, 1, 'segment sınırındaki tekrar tek cue olmalı');
    assert.equal(merged[0].end, 6);

    const afterDiscontinuity = mergeBrowserStreamCues(
      [{ start: 11, end: 12, text: 'aynı anons', discontinuity: 0, sequence: 41 }],
      [{ start: 12, end: 13, text: 'aynı anons', discontinuity: 1, sequence: 42 }]);
    assert.equal(afterDiscontinuity.length, 2, 'reklam/bölüm geçişinin iki yanı birleştirilmemeli');

    const delayedOutOfOrder = mergeBrowserStreamCues(
      [{ start: 8, end: 9, text: 'sonraki', sequence: 42 }],
      [{ start: 4, end: 5, text: 'geciken', sequence: 41 }]);
    assert.deepEqual(delayedOutOfOrder.map((cue) => cue.text), ['geciken', 'sonraki']);

    const seekRevision = mergeBrowserStreamCues(
      [{ start: 20, end: 22, text: 'eski canlı hipotez' }],
      [{ start: 20, end: 23, text: 'kesinleşen canlı altyazı' }]);
    assert.deepEqual(seekRevision.map((cue) => cue.text), ['kesinleşen canlı altyazı']);
    console.log('browser-stream-fixtures: HLS canlı yenileme/gecikme/eksik/discontinuity/MPEGTS rollover/imza ve çok dönemli DASH testleri geçti');
  } finally {
    await fixture.close();
  }
})().catch((error) => { console.error(error); process.exitCode = 1; });
