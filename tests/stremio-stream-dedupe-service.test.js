'use strict';
// End to end through the real Stremio service with a fake fetch: two addons, one release.
const test = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const { createStremioService } = require('../src/stremio-service');

test('streams() shows one row for a release returned by two addons and still reports both addons', async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'stremio-dedupe-')); t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const hash = 'c'.repeat(40), bases = { one: 'https://one.example/cfg', two: 'https://two.example/cfg' };
  const stream = (name, seeds, trackers) => ({ name, description: `Movie.2020.1080p.WEB-DL.mkv\n👤 ${seeds}`, infoHash: hash, sources: trackers, behaviorHints: { filename: 'Movie.2020.1080p.WEB-DL.mkv', videoSize: 3000000000 } });
  const service = createStremioService({ root: () => root, fetch: async (url) => {
    let value;
    for (const [key, base] of Object.entries(bases)) {
      if (url === `${base}/manifest.json`) value = { id: `fixture.${key}`, name: `Addon ${key}`, version: '1', types: ['movie'], resources: ['stream'], catalogs: [] };
      if (url === `${base}/stream/movie/tt1234567.json`) value = { streams: [stream(key === 'one' ? 'One\n1080p' : '[TB+] Two\n1080p', key === 'one' ? 8 : 70, [`tracker:udp://${key}.tracker:1337`])] };
    }
    if (!value) throw Error(`Unexpected fixture endpoint ${url}`);
    return new Response(JSON.stringify(value), { headers: { 'Content-Type': 'application/json' } });
  } });
  for (const base of Object.values(bases)) {
    const preview = await service.handle({}, { action: 'addon-preview', url: `${base}/manifest.json` });
    await service.handle({}, { action: 'addon-install', token: preview.token });
  }
  const result = await service.handle({}, { action: 'streams', type: 'movie', id: 'tt1234567' });
  assert.equal(result.streams.length, 1, 'the same release must be listed once');
  assert.equal(result.streams[0].availability, 'cached', 'the cached copy is the one kept');
  assert.equal(result.streams[0].seeders, 70);
  assert.equal(result.streams[0].alsoFrom.length, 1);
  assert.deepEqual(result.groups.map((g) => g.count), [1, 1], 'per-addon counts still describe what each addon returned');
});
