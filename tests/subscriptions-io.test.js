// A06/A07 — yerel abonelik deposu + içe/dışa aktarma biçimleri.
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const io = require('../src/subscriptions-io');
const renderer = fs.readFileSync(path.join(__dirname, '..', 'src', 'renderer', 'renderer.js'), 'utf8');
const main = fs.readFileSync(path.join(__dirname, '..', 'src', 'main.js'), 'utf8');
const preload = fs.readFileSync(path.join(__dirname, '..', 'src', 'preload.js'), 'utf8');
const indexHtml = fs.readFileSync(path.join(__dirname, '..', 'src', 'renderer', 'index.html'), 'utf8');

const UC = 'UCaaaaaaaaaaaaaaaaaaaaaa';

// channelRefFromUrl
assert.equal(io.channelRefFromUrl(`https://www.youtube.com/channel/${UC}`).authorId, UC);
assert.equal(io.channelRefFromUrl('https://www.youtube.com/@linus').handle, '@linus');
assert.equal(io.channelRefFromUrl('https://invidious.io/channel/UCbbbcccccccccccccccccccc').authorId, 'UCbbbcccccccccccccccccccc');
assert.equal(io.channelRefFromUrl('https://example.com/nope'), null);

// NewPipe Takeout
{
  const text = JSON.stringify({ app_version: 'x', subscriptions: [
    { service_id: 0, url: `https://www.youtube.com/channel/${UC}`, name: 'A Kanal' },
    { service_id: 9, url: 'https://peertube.test/c/x', name: 'başka ağ' },   // YouTube dışı düşer
    { service_id: 0, url: 'https://www.youtube.com/@tr', name: 'TR' },
  ] });
  const r = io.parseSubscriptions(text, 'newpipe_subscriptions.json');
  assert.equal(r.format, 'newpipe');
  assert.equal(r.subs.length, 2);
  assert.equal(r.subs[0].authorId, UC);
  assert.equal(r.subs[1].handle, '@tr');
}

// OPML
{
  const text = `<?xml version="1.0"?><opml><body>
    <outline text="A" title="A Kanal" xmlUrl="https://www.youtube.com/feeds/videos.xml?channel_id=${UC}" htmlUrl="https://www.youtube.com/channel/${UC}"/>
    <outline text="X" xmlUrl="https://blog.test/rss"/></body></opml>`;
  const r = io.parseSubscriptions(text, 'subs.opml');
  assert.equal(r.format, 'opml');
  assert.equal(r.subs.length, 1);
  assert.equal(r.subs[0].authorId, UC);
}

// CSV
{
  const r = io.parseSubscriptions(`Kanal,URL\nBir,https://www.youtube.com/channel/${UC}\n`, 'x.csv');
  assert.equal(r.format, 'csv');
  assert.equal(r.subs[0].authorId, UC);
  assert.equal(io.parseSubscriptions('a,b\n', 'x.csv').ok, false);
}

// Kendi JSON formatı + gruplar + dedupe
{
  const r = io.parseSubscriptions(JSON.stringify({ channels: [
    { authorId: UC, author: 'A', group: 'bilim' },
    { channelId: UC, name: 'kopya' },
  ], groups: ['bilim'] }));
  assert.equal(r.subs.length, 1, 'UCID tekilleşir');
  assert.deepEqual(r.groups, ['bilim']);
}

// Export turu: JSON → OPML → CSV → newpipe
{
  const subs = [{ authorId: UC, author: 'A "Kanal"', group: 'bilim' }, { handle: '@tr', author: 'TR', group: '' }];
  const j = io.exportSubscriptions(subs, ['bilim'], 'json');
  assert.equal(j.fileName, 'whisper-abonelikler.json');
  const rj = io.parseSubscriptions(j.text, j.fileName);
  assert.equal(rj.subs.length, 2);
  const o = io.exportSubscriptions(subs, [], 'opml');
  assert.equal(o.fileName, 'whisper-abonelikler.opml');
  assert.match(o.text, /channel_id=/);
  const ro = io.parseSubscriptions(o.text, o.fileName);
  assert.equal(ro.subs.length, 2);
  const c = io.exportSubscriptions(subs, [], 'csv');
  assert.match(c.text, /"A ""Kanal"""/, 'CSV quote escape');
  const n = io.exportSubscriptions(subs, [], 'newpipe');
  assert.equal(n.fileName, 'newpipe_subscriptions.json');
  assert.ok(!JSON.stringify(n).includes('password'), 'hesap bilgisi yok');
  assert.ok(!JSON.stringify(n).includes('sid'), 'oturum yok');
}

// Sınırlar
assert.equal(io.normSub({ authorId: 'UC<script>' }), null, 'bozuk kimlik reddedilir');
assert.equal(io.normSub({ author: 'x', url: 'https://youtube.com' }), null, 'kimliksiz kayıt düşer');

// Bağlantılar
assert.match(main, /subscriptions:export/, 'export IPC');
assert.match(main, /subscriptions:import/, 'import IPC');
assert.match(main, /2 \* 1024 \* 1024/, 'boyut sınırı');
assert.match(main, /whisper-abonelikler\./, 'dosya adı whitelist');
assert.match(preload, /importSubscriptions/, 'preload');
assert.match(preload, /exportSubscriptions/, 'preload');
assert.ok(indexHtml.includes('subscriptions-io.js'), 'modül renderer sayfasına dahil');
assert.match(renderer, /renderStSubsPanel\(grid\)/, 'panel bağlı');
assert.match(renderer, /Kanala abone ol/, 'kart menüsü abone öğesi');
assert.match(renderer, /stSubToggle/, 'toggle çağrısı');
assert.match(renderer, /section === 'subscriptions' && !youtubeLoggedIn/, 'oturumsuz yerel dal');

console.log('subscriptions-io.test.js OK');
