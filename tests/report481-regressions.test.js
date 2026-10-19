'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const io = require('../src/subscriptions-io');
const feed = require('../src/subscription-feed');
const view = require('../src/watch-library-view');
const session = require('../src/browser-session-store');
const chapters = require('../src/browser-chapters');
const words = require('../src/subtitle-word-sidecar');
const timeline = require('../src/renderer/timeline-issue-scan');
const channel = 'UCaaaaaaaaaaaaaaaaaaaaaa';
const feedWith = title => `<feed><title>Channel</title><yt:channelId>${channel}</yt:channelId><entry><yt:videoId>abcdefghijk</yt:videoId><title>${title}</title></entry></feed>`;

test('481-01: exported CSV preserves commas, quotes and embedded newlines', () => {
  const author = 'Bilim, "Uzay"\nKanalı';
  const exported = io.exportSubscriptions([{ authorId: channel, author }], [], 'csv');
  assert.equal(io.parseSubscriptions(exported.text).subs[0].author, author);
  assert.equal(io.parseSubscriptions(`"Unclosed,https://youtube.com/channel/${channel}`).ok, false);
});
test('481-02: OPML round trip decodes XML attributes and accepts single quotes', () => {
  const author = 'Bilim & "Uzay" <TR>';
  const exported = io.exportSubscriptions([{ authorId: channel, author }], [], 'opml');
  assert.equal(io.parseSubscriptions(exported.text).subs[0].author, author);
  assert.equal(io.parseSubscriptions(`<opml><outline text='Bilim &amp; Uzay' htmlUrl='https://youtube.com/channel/${channel}'/></opml>`).subs[0].author, 'Bilim & Uzay');
});
test('481-03: percent-encoded Unicode channel handles survive import/export', () => {
  assert.deepEqual(io.channelRefFromUrl('https://www.youtube.com/@%C3%96rnek'), { handle: '@Örnek' });
  const exported = io.exportSubscriptions([{ handle: '@Örnek', author: 'Örnek' }], [], 'json');
  assert.equal(io.parseSubscriptions(exported.text).subs[0].handle, '@Örnek');
  assert.equal(io.channelRefFromUrl('https://notyoutube.com/@wrong'), null);
});
test('481-04: feed numeric XML entities decode once without losing astral characters', () => {
  assert.equal(feed.parseYouTubeFeed(feedWith('G&#252;ne&#x15F; &#x1F680; &amp;#65;')).videos[0].title, 'Güneş 🚀 &#65;');
});
test('481-05: CDATA entity-looking text stays literal', () => {
  assert.equal(feed.parseYouTubeFeed(feedWith('<![CDATA[A &amp; B <test>]]>')).videos[0].title, 'A &amp; B <test>');
});
test('481-06: shrinking a scrolled virtual list never creates an inverted range', () => {
  for (const total of [0, 3]) {
    const range = view.virtualRange({ total, scrollTop: 120000, viewportHeight: 600, rowHeight: 112 });
    assert.ok(range.start <= range.end && range.end <= total);
    assert.ok(range.topSpace <= total * range.extent);
    if (total) assert.ok(range.end > range.start);
  }
});
test('481-07: missing persisted numeric preferences restore defaults, explicit zero volume stays zero', () => {
  const tab = session.normalizeSessionTab({ url: 'https://example.com', volume: null, rate: '', position: false });
  assert.equal(tab.volume, 1); assert.equal(tab.rate, 1);
  assert.equal(session.normalizeSessionTab({ url: 'https://example.com', volume: 0 }).volume, 0);
});
test('481-08: malformed chapter start is not fabricated as the beginning of the video', () => {
  for (const start of [false, '', ' ']) assert.equal(chapters.normalizeChapter({ start, title: 'Bad' }), null);
  assert.equal(chapters.normalizeChapter({ start: 0, title: 'Intro' }).start, 0);
});
test('481-09: word-sidecar timing cannot escape its parent segment', () => {
  const result = words.sanitizeWordSegments({ segments: [{ start: 10, end: 12, words: [
    { word: 'broken', start: 1, end: 100 }, { word: 'valid', start: 10, end: 11 },
    { word: 'rounding', start: 11.5, end: 12.02 },
  ] }] });
  assert.deepEqual(result[0].words.map(word => [word.word, word.start, word.end]), [['valid', 10, 11], ['rounding', 11.5, 12]]);
});
test('481-10: three subtitle lines trigger the documented line-layout warning', () => {
  assert.ok(timeline.scan([{ start: 0, end: 5, text: 'one\ntwo\nthree' }]).some(issue => issue.kind === 'lines'));
  assert.equal(timeline.scan([{ start: 0, end: 5, text: 'one\ntwo' }]).length, 0);
});
