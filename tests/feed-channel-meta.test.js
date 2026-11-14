'use strict';
// Channel level metadata (description, artwork, author) survives parsing, storage and refresh.
const test = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const P = require('../src/feed-parser'), { createFeedStore } = require('../src/feed-store');
const rss = (extra = '') => `<?xml version="1.0"?><rss version="2.0" xmlns:itunes="http://www.itunes.com/dtds/podcast-1.0.dtd"><channel><title>Night Show</title><link>https://pod.example/night</link><description>Long talks about film &amp; sound.</description><itunes:author>Deniz Arda</itunes:author>${extra}<item><title>Episode 1</title><guid>e1</guid><pubDate>Mon, 10 Nov 2026 08:00:00 GMT</pubDate><enclosure url="https://cdn.pod.example/e1.mp3" type="audio/mpeg" length="1000"/></item></channel></rss>`;

test('RSS channel description, itunes artwork and author are parsed; unsafe artwork is dropped', () => {
  const ok = P.parseFeed(rss('<itunes:image href="https://cdn.pod.example/art.jpg"/>'), 'https://pod.example/night.xml');
  assert.equal(ok.description, 'Long talks about film & sound.'); assert.equal(ok.imageUrl, 'https://cdn.pod.example/art.jpg'); assert.equal(ok.author, 'Deniz Arda');
  const bad = P.parseFeed(rss('<itunes:image href="javascript:alert(1)"/>'), 'https://pod.example/night.xml');
  assert.equal(bad.imageUrl, '');
  const classic = P.parseFeed(rss('<image><url>https://cdn.pod.example/classic.png</url></image>'), 'https://pod.example/night.xml');
  assert.equal(classic.imageUrl, 'https://cdn.pod.example/classic.png');
});

test('JSON Feed and Atom expose the same fields', () => {
  const json = P.parseFeed(JSON.stringify({ version: 'https://jsonfeed.org/version/1.1', title: 'J', description: 'About J', icon: 'https://cdn.pod.example/j.png', authors: [{ name: 'Ayşe' }], items: [{ id: '1', url: 'https://pod.example/1', content_text: 'x' }] }), 'https://pod.example/j.json');
  assert.deepEqual([json.description, json.imageUrl, json.author], ['About J', 'https://cdn.pod.example/j.png', 'Ayşe']);
  const atom = P.parseFeed('<?xml version="1.0"?><feed xmlns="http://www.w3.org/2005/Atom"><title>A</title><subtitle>Atom sub</subtitle><logo>https://cdn.pod.example/a.png</logo><author><name>Can</name></author><entry><id>1</id><title>t</title><link href="https://pod.example/1"/><updated>2026-11-01T00:00:00Z</updated><summary>s</summary></entry></feed>', 'https://pod.example/a.xml');
  assert.deepEqual([atom.description, atom.imageUrl, atom.author], ['Atom sub', 'https://cdn.pod.example/a.png', 'Can']);
});

test('the store keeps channel metadata on subscribe and refreshes it on a later snapshot', (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'feed-meta-')); t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const store = createFeedStore(path.join(dir, 'feeds.json')), first = P.parseFeed(rss('<itunes:image href="https://cdn.pod.example/art.jpg"/>'), 'https://pod.example/night.xml');
  const { feed } = store.subscribe({ url: first.url, title: first.title, description: first.description, imageUrl: first.imageUrl, author: first.author, format: first.format }, first.entries, 'all');
  const saved = () => store.list({}).feeds.find((f) => f.id === feed.id);
  assert.deepEqual([saved().description, saved().imageUrl, saved().author], ['Long talks about film & sound.', 'https://cdn.pod.example/art.jpg', 'Deniz Arda']);
  const next = P.parseFeed(rss('<itunes:image href="https://cdn.pod.example/new.jpg"/>').replace('Long talks', 'Updated talks'), 'https://pod.example/night.xml');
  store.commit(feed.id, next);
  assert.equal(saved().description, 'Updated talks about film & sound.'); assert.equal(saved().imageUrl, 'https://cdn.pod.example/new.jpg');
});
