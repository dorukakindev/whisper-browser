'use strict';
// B-303-02: Self-closing XML öğesi (<Tag/>) sonraki kapalı kardeşin kapanış
// etiketini yutmamalı. `TAG[^>]*>...</TAG>` kalıbı `[^>]*` içinde '/' kabul
// ettiği için `<p/><p>x</p>` ilk eşleşmede her iki öğeyi tek cue'ya yutuyordu.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
  parseSubtitlePayload,
  parseDashSubtitleMatchers,
  parseDashSubtitleTracks,
} = require('../src/browser-subtitles');

test('timedtext: self-closing <p/> sonraki gerçek cue yutulmaz, metne markup sızmaz', () => {
  const xml = '<timedtext><p t="1000" d="2000"/><p t="3000" d="2000">Merhaba dünya</p></timedtext>';
  const { cues } = parseSubtitlePayload(xml, 'text/xml', '');
  assert.equal(cues.length, 1);
  assert.equal(cues[0].text, 'Merhaba dünya');
  assert.equal(cues[0].start, 3);
  assert.equal(cues[0].end, 5);
});

test('timedtext: <text/> self-closing kardeş de aynı kurala uyar', () => {
  const xml = '<timedtext><text t="0" d="1000"/><text t="5000" d="1000">İkinci satır</text></timedtext>';
  const { cues } = parseSubtitlePayload(xml, 'text/xml', '');
  assert.equal(cues.length, 1);
  assert.equal(cues[0].text, 'İkinci satır');
  assert.equal(cues[0].start, 5);
});

test('ttml: <span/> strip yutması span dışı metni kaybetmez', () => {
  const xml = '<timedtext><p begin="1s" dur="2s"><span/>real <span begin="1s" dur="1s">x</span></p></timedtext>';
  const { cues } = parseSubtitlePayload(xml, 'text/xml', '');
  // outsideText korunduğu için paragraf tek cue olarak düşer; span etiketleri
  // whitelist'te olduğundan 'real x' temiz metne katlanır.
  assert.equal(cues.length, 1);
  assert.equal(cues[0].text, 'real x');
});

test('dash: self-closing Representation kapalı kardeşin içeriğini yutmaz', () => {
  const xml = '<MPD mediaPresentationDuration="PT40M"><Period>'
    + '<AdaptationSet mimeType="text/vtt" lang="en">'
    + '<Representation id="empty"/>'
    + '<Representation id="full"><SegmentTemplate timescale="1" media="s-$RepresentationID$-$Number$.vtt" duration="10">'
    + '<SegmentTimeline><S t="0" d="10"/></SegmentTimeline></SegmentTemplate></Representation>'
    + '</AdaptationSet></Period></MPD>';
  const matchers = parseDashSubtitleMatchers(xml, 'https://h/m.mpd');
  assert.equal(matchers.length, 1);
  assert.match(matchers[0].segmentUrl, /s-full-1\.vtt$/);
});

test('dash: self-closing AdaptationSet sonraki kapalı seti yutmaz (dil korunur)', () => {
  const xml = '<MPD mediaPresentationDuration="PT40M"><Period>'
    + '<AdaptationSet mimeType="text/vtt" lang="de"/>'
    + '<AdaptationSet mimeType="text/vtt" lang="en">'
    + '<Representation id="r"><SegmentTemplate timescale="1" media="s$Number$.vtt" duration="10">'
    + '<SegmentTimeline><S t="0" d="10"/></SegmentTimeline></SegmentTemplate></Representation>'
    + '</AdaptationSet></Period></MPD>';
  const matchers = parseDashSubtitleMatchers(xml, 'https://h/m.mpd');
  assert.equal(matchers.length, 1);
  assert.equal(matchers[0].language, 'en');
});

test('dash: self-closing SegmentTemplate kardeşinin timeline\'ını yutmaz', () => {
  const xml = '<MPD mediaPresentationDuration="PT40M"><Period>'
    + '<AdaptationSet mimeType="text/vtt" lang="en"><Representation id="r">'
    + '<SegmentTemplate timescale="1" media="a-$Number$.vtt"/>'
    + '</Representation></AdaptationSet></Period></MPD>';
  // Tek şablonlu durum: self-closing template inner='' döner ve sınırsız
  // templatePath matcher üretir (zaman şablonu olmayan canlı yol).
  const matchers = parseDashSubtitleMatchers(xml, 'https://h/m.mpd');
  assert.equal(matchers.length, 1);
  assert.equal(matchers[0].variable, 'number');
});

test('dash: self-closing Period sonraki dönemin sınırlarını bozmaz', () => {
  const xml = '<MPD mediaPresentationDuration="PT40M">'
    + '<Period id="p0"/>'
    + '<Period id="p1" start="PT30S" duration="PT30S">'
    + '<AdaptationSet mimeType="text/vtt" lang="en">'
    + '<Representation id="r"><SegmentTemplate timescale="1" media="s$Number$.vtt" duration="10">'
    + '<SegmentTimeline><S t="0" d="10"/></SegmentTimeline></SegmentTemplate></Representation>'
    + '</AdaptationSet></Period></MPD>';
  const matchers = parseDashSubtitleMatchers(xml, 'https://h/m.mpd');
  assert.equal(matchers.length, 1);
  assert.equal(matchers[0].periodStart, 30);
});

test('dash: SegmentList içeren self-closing rep doğrudan iz kaydını bozmaz', () => {
  const xml = '<MPD><Period><AdaptationSet mimeType="text/vtt" lang="en">'
    + '<Representation id="empty"/>'
    + '<Representation id="direct"><BaseURL>subs/en.vtt</BaseURL></Representation>'
    + '</AdaptationSet></Period></MPD>';
  const tracks = parseDashSubtitleTracks(xml, 'https://h/m.mpd');
  assert.equal(tracks.length, 1);
  assert.equal(tracks[0].url, 'https://h/subs/en.vtt');
});
