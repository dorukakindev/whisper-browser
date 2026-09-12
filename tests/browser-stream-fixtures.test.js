'use strict';

const assert = require('assert');
const {
  mergeBrowserStreamCues, parseDashSubtitleMatchers, parseHlsSegments,
  parseHlsSubtitleTracks, parseSubtitlePayload, matchDashSubtitleUrl,
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
    console.log('browser-stream-fixtures: HLS gecikme/eksik/discontinuity ve DASH eksik segment testleri geçti');
  } finally {
    await fixture.close();
  }
})().catch((error) => { console.error(error); process.exitCode = 1; });
