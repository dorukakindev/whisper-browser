'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const A = require('../src/stremio-addons');
const { createStremioService } = require('../src/stremio-service');
const { decodeDownloadedSubtitle } = require('../src/browser-subtitle-search');

const json = (data, status = 200, headers = {}) => new Response(JSON.stringify(data), { status, headers });
const HASH = 'a'.repeat(40);

const MANIFESTS = {
  'https://cinemeta.example/manifest.json': { id: 'cine', name: 'Cinemeta', version: '3.0.0', types: ['movie', 'series'], resources: ['catalog', 'meta'], idPrefixes: ['tt'],
    catalogs: [{ type: 'movie', id: 'top', name: 'Popüler', extra: [{ name: 'search' }, { name: 'skip' }] }, { type: 'series', id: 'top', name: 'Diziler', extra: [{ name: 'search' }, { name: 'genre', options: ['Drama'] }] }, { type: 'movie', id: 'need', name: 'Zorunlu', extra: [{ name: 'genre', isRequired: true }] }] },
  'https://torr.example/cfg%3Dsecretkey/manifest.json': { id: 'torr', name: 'Torrentio', version: '0.0.1', behaviorHints:{configurable:true}, types: ['movie', 'series'], resources: [{ name: 'stream', types: ['movie', 'series'], idPrefixes: ['tt'] }], catalogs: [] },
  'https://subs.example/manifest.json': { id: 'subs', name: 'Altyazı', version: '1.0.0', types: ['movie', 'series'], resources: ['subtitles'], catalogs: [] },
  'https://configure.example/manifest.json': { id: 'cfg', name: 'Yapılandır', version: '1.0.0', resources: ['stream'], types: ['movie'], catalogs: [], behaviorHints: { configurationRequired: true } },
};

function harness({ torrentStatus = { ok: true, installed: true }, files, configureAddon, extraManifests={} } = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'stremio-test-'));
  const calls = [], assertCalls = [], torrentCalls = [];
  const fetch = async (url) => {
    calls.push(url);
    if(extraManifests[url])return json(extraManifests[url]);
    if (MANIFESTS[url]) return json(MANIFESTS[url]);
    if (url === 'https://cinemeta.example/meta/series/tt0944947.json') return json({ meta: { id: 'tt0944947', type: 'series', name: 'Dizi', releaseInfo: '2011–2019', poster: 'https://img.example/p.jpg', background: 'http://insecure.example/b.jpg',
      videos: [{ id: 'tt0944947:1:1', season: 1, episode: 1, title: 'Bir', released: '2011-04-17T00:00:00.000Z' }, { id: 'tt0944947:1:2', season: 1, episode: 2, title: 'İki' }] } });
    if (url.startsWith('https://cinemeta.example/catalog/movie/top/search=')) return json({ metas: [{ id: 'tt1', type: 'movie', name: 'Film', releaseInfo: '1999', poster: 'https://img.example/f.jpg' }, { id: 'bad id!', type: 'movie', name: 'Bozuk' }] });
    if (url === 'https://torr.example/cfg%3Dsecretkey/stream/series/tt0944947:1:2.json') return json({ streams: [
      { name: 'Torrentio\n720p', title: 'Dizi.S01E02.720p\n👤 5 💾 1.2 GB ⚙️ A', infoHash: HASH, fileIdx: 3, sources: ['tracker:udp://t.example:80', 'dht:xx'] },
      { name: 'Torrentio\n4k', title: 'Dizi.S01E02.2160p.HDR\n👤 90 💾 9 GB', url: 'https://cdn.example/v.mkv', behaviorHints: { filename: 'v.mkv', notWebReady: true } },
      { name: 'x', url: 'https://192.168.1.5/v.mp4' }, { name: 'h', url: 'https://cdn.example/h.mp4', behaviorHints: { proxyHeaders: { request: { Range: 'bytes=0-' } } } },
      { name: 'r', url: 'https://cdn.example/r.mp4', behaviorHints: { filename: 'r.mp4', proxyHeaders: { request: { Referer: 'https://ref-secret.invalid/', 'User-Agent': 'UA/1' } } } },
      { name: 'yt', ytId: 'dQw4w9WgXcQ' }, { name: 'ext', externalUrl: 'https://site.example/watch' }, { name: 'badhash', infoHash: 'zz' }, null, 'str'] });
    if (url.startsWith('https://subs.example/subtitles/series/tt0944947:1:2')) return json({ subtitles: [{ url: 'https://subs.example/tr.srt', lang: 'tur', id: '1' }, { url: 'https://subs.example/en.srt', lang: 'eng' }, { url: 'http://evil.example/x.srt', lang: 'eng' }] });
    if (url === 'https://subs.example/tr.srt') return new Response('1\n00:00:01,000 --> 00:00:02,000\nMerhaba\n\n', { status: 200 });
    if (url === 'https://redirect.example/manifest.json') return new Response('', { status: 302, headers: { location: 'http://169.254.169.254/x' } });
    if(/\/stream\/(series|movie)\/tt[0-9:]+\.json$/.test(url))return json({streams:[{name:'Alternative edition',url:'https://cdn.example/v.mkv'}]});
    return new Response('nope', { status: 404 });
  };
  const torrents = { handler: async (_event, input) => {
    torrentCalls.push(input);
    if (input.action === 'status') return torrentStatus;
    if (input.action === 'preview') return { ok: true, token: 'tok', hash: HASH, files: files || [{ index: 1, name: 'x/Dizi.S01E01.mkv', size: 10, video: true }, { index: 3, name: 'x/Dizi.S01E02.mkv', size: 8, video: true }] };
    if (input.action === 'play') return { ok: true, url: 'whisper-media://t/video', hash: HASH, index: input.index, title: 'Dizi.S01E02.mkv', key: `torrent:${HASH}:${input.index}` };
    return { ok: false, error: 'x' };
  } };
  const granted = [];
  const service = createStremioService({ root: () => root, fetch, assertUrl: async (u) => { assertCalls.push(u); if (/192\.168|169\.254/.test(u)) throw new A.AddonError('özel', 'UNSAFE'); },
    torrents, configureAddon, decodeSubtitle: (bytes) => decodeDownloadedSubtitle(bytes, 'en'), grantSubtitle: (f) => granted.push(f), searchSubtitles: async () => ({ results: [] }), now: () => 1_700_000_000_000 });
  const install = async (url) => { const p = await service.handle({}, { action: 'addon-preview', url }); return service.handle({}, { action: 'addon-install', token: p.token }); };
  return { root, service, calls, assertCalls, torrentCalls, granted, install };
}

(async () => {
  // C855-01: absent or structured episode numbers are not real specials (0:0).
  const absent=[undefined,null,'','   ',false,true,[],[0],{}, {valueOf:()=>0}];
  for(const value of absent){
    const normalized=A.normalizeMeta({id:'tt855',type:'series',name:'Metadata fixture',videos:[{id:'unknown-one',season:value,episode:value},{id:'unknown-two',season:value,number:value}]});
    assert(normalized.videos.every(v=>v.season===null&&v.episode===null),'missing episode values must stay unknown: '+String(value));
    assert.notEqual(A.videoKey(normalized.videos[0]),A.videoKey(normalized.videos[1]),'unknown entries retain distinct ids');
  }
  const numbered=A.normalizeMeta({id:'tt855',type:'series',name:'Metadata fixture',videos:[{id:'special-zero',season:0,episode:0},{id:'numeric-string',season:'0',number:' 2 '},{id:'normal',season:'1',episode:'12'}]});
  assert.deepEqual(numbered.videos.map(v=>[v.season,v.episode]),[[0,0],[0,2],[1,12]],'real zero and numeric strings stay supported');
  // --- Adres normalizasyonu / gizlilik
  assert.equal(A.normalizeAddonUrl('stremio://torr.example/cfg=1').manifestUrl, 'https://torr.example/cfg=1/manifest.json');
  assert.equal(A.publicLabel('https://torr.example/cfg%3Dsecretkey/manifest.json'), 'torr.example/…');
  for (const bad of ['http://x.example/manifest.json', 'https://192.168.0.9/manifest.json', 'https://10.1.1.1/', 'https://169.254.169.254/', 'https://u:p@x.example/', 'javascript:alert(1)', 'https://x.example/a.json', '']) {
    assert.throws(() => A.normalizeAddonUrl(bad), (e) => e.code === 'BAD_URL', bad);
  }
  assert.equal(A.normalizeAddonUrl('http://127.0.0.1:7000/manifest.json').loopback, true);

  // --- Kaynak URL'leri
  assert.equal(A.buildResourceUrl('https://x.example', 'stream', 'series', 'tt1:2:3'), 'https://x.example/stream/series/tt1:2:3.json');
  assert.equal(A.buildResourceUrl('https://x.example', 'catalog', 'movie', 'top', { search: 'a/b c', skip: 20 }), 'https://x.example/catalog/movie/top/search=a%2Fb%20c&skip=20.json');
  assert.throws(() => A.buildResourceUrl('https://x.example', 'stream', 'movie', '../../etc'), (e) => e.code === 'BAD_REQUEST');

  // --- Manifest
  assert.throws(() => A.validateManifest({ id: 'a' }), (e) => e.code === 'BAD_MANIFEST');
  const m = A.validateManifest(MANIFESTS['https://torr.example/cfg%3Dsecretkey/manifest.json']);
  assert.equal(A.supports(m, 'stream', 'series', 'tt1:1:1'), true);
  assert.equal(A.supports(m, 'stream', 'series', 'kitsu:1'), false);
  assert.equal(A.supports(m, 'subtitles', 'movie', 'tt1'), false);

  // --- Torrent yardımcıları
  assert.equal(A.normalizeInfoHash('MFRGGZDFMZTWQ2LKNNWG23TPOBYXE43U').length, 40);
  assert.equal(A.normalizeInfoHash('xyz'), '');
  const magnet = A.buildMagnet({ infoHash: HASH, trackers: ['udp://t.example:80'], name: 'A B' });
  assert.match(magnet, /^magnet:\?xt=urn:btih:a{40}&dn=A%20B&tr=udp%3A%2F%2Ft\.example%3A80$/);
  const files = [{ index: 0, name: 'a/Show.S02E01.mkv', size: 5, video: true }, { index: 1, name: 'a/Show.S02E02.mkv', size: 4, video: true }, { index: 2, name: 'a/sample.txt', size: 99, video: false }, { index: 3, name: 'Show 2x02 extras.mkv', size: 1, video: true }];
  assert.equal(A.chooseTorrentFile(files, { fileIdx: 0 }, { season: 2, episode: 2 }).index, 0, 'fileIdx önce gelir');
  assert.equal(A.chooseTorrentFile(files, {}, { season: 2, episode: 2 }).index, 1);
  assert.equal(A.chooseTorrentFile(files, {}, { season: 2, episode: 12 }),null,'belirsiz çok dosyalı sezonda başka bölüm seçilmez');assert.equal(A.chooseTorrentFile(files,{fileIdx:999}),null,'geçersiz açık dosya kimliği başka dosyaya düşmez');
  assert.equal(A.chooseTorrentFile([{ index: 0, name: 'a.txt', size: 1, video: false }], {}), null);

  // --- Dil
  assert.equal(A.normalizeLanguage('tur'), 'tr');
  assert.equal(A.normalizeLanguage('pob'), 'pt-br');
  assert.equal(A.languageMatches('pt', 'pt-BR'), true);
  assert.equal(A.languageMatches('tr', 'eng'), false);

  // --- Yönlendirme ve boyut sınırı
  await assert.rejects(A.fetchJson('https://redirect.example/manifest.json', { fetch: async () => new Response('', { status: 302, headers: { location: 'http://169.254.169.254/x' } }) }), (e) => e.code === 'REDIRECT');
  await assert.rejects(A.fetchJson('https://big.example/x.json', { fetch: async () => new Response('x'.repeat(2000)), maxBytes: 100 }), (e) => e.code === 'TOO_LARGE');
  await assert.rejects(A.fetchJson('https://bad.example/x.json', { fetch: async () => new Response('not json') }), (e) => e.code === 'BAD_JSON');

  // --- Servis: kurulum akışı
  const h = harness();
  assert.deepEqual((await h.service.handle({}, { action: 'status' })).addons, []);
  const preview = await h.service.handle({}, { action: 'addon-preview', url: 'stremio://torr.example/cfg%3Dsecretkey' });
  assert.equal(preview.provides.streams, true);
  assert.equal(preview.label, 'torr.example/…');
  assert.ok(!JSON.stringify(preview).includes('secretkey'), 'gizli adres yolu renderer yanıtına sızmamalı');
  await assert.rejects(h.service.handle({}, { action: 'addon-install', token: 'yok' }), (e) => e.code === 'EXPIRED');
  const afterInstall = await h.service.handle({}, { action: 'addon-install', token: preview.token });
  assert.equal(afterInstall.addons.length, 1);
  assert.ok(!JSON.stringify(afterInstall).includes('secretkey'));
  assert.ok(fs.readFileSync(path.join(h.root, 'stremio-addons.json'), 'utf8').includes('secretkey'), 'adres yalnız ana süreç dosyasında');
  const cfgPreview = await h.service.handle({}, { action: 'addon-preview', url: 'https://configure.example/manifest.json' });
  await assert.rejects(h.service.handle({}, { action: 'addon-install', token: cfgPreview.token }), (e) => e.code === 'NEEDS_CONFIG');
  await h.install('https://cinemeta.example/manifest.json');
  await h.install('https://subs.example/manifest.json');
  assert.equal((await h.service.handle({}, { action: 'status' })).addons.length, 3);

  // --- Katalog, arama, meta
  const cats = (await h.service.handle({}, { action: 'catalogs' })).catalogs;
  assert.deepEqual(cats.map((c) => c.type + ':' + c.id), ['movie:top', 'series:top'], 'zorunlu ek alanlı katalog gizlenir');
  const found = await h.service.handle({}, { action: 'search', query: 'film' });
  assert.deepEqual(found.items.map((i) => i.id), ['tt1'], 'geçersiz kimlikli satır elenir');
  assert.equal(found.items[0].year, 1999);
  const metaResult = await h.service.handle({}, { action: 'meta', type: 'series', id: 'tt0944947' });
  assert.equal(metaResult.meta.videos.length, 2);
  assert.equal(metaResult.meta.background, '', 'http görsel reddedilir');
  assert.equal(metaResult.meta.poster, 'https://img.example/p.jpg');

  // --- Akışlar
  const listed = await h.service.handle({}, { action: 'streams', type: 'series', id: 'tt0944947', season: 1, episode: 2 });
  assert.equal(listed.videoId, 'tt0944947:1:2');
  const byKind = (k) => listed.streams.filter((s) => s.kind === k);
  assert.equal(byKind('torrent').length, 1);
  assert.equal(byKind('url').filter((s) => s.playable).length, 2, 'özel IP elenir; izinsiz başlık isteyen URL oynatılamaz; güvenli başlıklı URL oynatılabilir');
  assert.equal(byKind('url').filter((s) => s.usesHeaders).length, 1, 'yalnız güvenli başlıklı kaynak başlık kullanır');
  assert.ok(!JSON.stringify(listed).includes('ref-secret.invalid') && !JSON.stringify(listed).includes('UA/1'), 'başlık değerleri renderer\u2019a verilmez');
  assert.ok(!listed.streams.some((s) => s.host === '192.168.1.5'), 'özel hedef akış listesine girmez');
  assert.equal(listed.streams[0].resolution, '2160p', 'varsayılan sıra çözünürlüğe göre');
  assert.ok(!JSON.stringify(listed).includes('cdn.example/v.mkv'), 'akış URL\u2019si renderer\u2019a verilmez');
  assert.ok(listed.streams.find((s) => s.kind === 'url').notWebReady);
  assert.equal(listed.groups.length, 1);
  assert.ok(listed.streams.some((s) => s.reason === 'needs-headers' && !s.playable));
  assert.ok(listed.streams.some((s) => s.kind === 'youtube' && !s.playable));

  // --- Oynatma: URL
  const direct = listed.streams.find((s) => s.kind === 'url' && s.playable);
  const urlPlay = await h.service.handle({}, { action: 'play', token: listed.token, streamId: direct.id, title: 'Dizi · S1E2' });
  assert.equal(urlPlay.url, 'https://cdn.example/v.mkv');
  assert.match(urlPlay.key, /^stream:[0-9a-f]{64}$/);
  assert.match(urlPlay.workKey,/^work:stremio:[0-9a-f]{64}$/);const secondSource=await h.service.handle({}, {action:'play',token:listed.token,streamId:direct.id});assert.equal(secondSource.workKey,urlPlay.workKey);
  assert.equal(urlPlay.resume, null);
  const unplayable = listed.streams.find((s) => !s.playable);
  await assert.rejects(h.service.handle({}, { action: 'play', token: listed.token, streamId: unplayable.id }), (e) => e.code === 'UNPLAYABLE');
  const headered = listed.streams.find((x) => x.usesHeaders);
  const headeredPlay = await h.service.handle({}, { action: 'play', token: listed.token, streamId: headered.id });
  assert.equal(headeredPlay.usesHeaders, true);
  assert.equal(headeredPlay.workKey,urlPlay.workKey);
  assert.deepEqual(h.service.headersFor(headeredPlay.url), [['Referer', 'https://ref-secret.invalid/'], ['User-Agent', 'UA/1']], 'başlıklar yalnız oynatılan adrese verilir');
  assert.deepEqual(h.service.headersFor('https://cdn.example/other.mp4'), [], 'başka adrese başlık verilmez');
  assert.deepEqual(A.sanitizeRequestHeaders({ Host: 'evil' }), [], 'Host izinsiz');
  assert.deepEqual(A.sanitizeRequestHeaders({ Referer: 'a\r\nX: y' }), [], 'CRLF reddedilir');
  assert.deepEqual(A.sanitizeRequestHeaders({ 'X-Token': 'abc', Cookie: 'a=b' }).length, 2);
  await assert.rejects(h.service.handle({}, { action: 'play', token: 'x', streamId: 'y' }), (e) => e.code === 'EXPIRED');

  // --- Oynatma: torrent (fileIdx 3 → S01E02 dosyası)
  const torrent = byKind('torrent')[0];
  const tPlay = await h.service.handle({}, { action: 'play', token: listed.token, streamId: torrent.id });
  assert.equal(tPlay.index, 3);
  assert.equal(tPlay.workKey,urlPlay.workKey);
  const workFor=async scope=>{const items=await h.service.handle({}, {action:'streams',...scope});return h.service.handle({}, {action:'play',token:items.token,streamId:items.streams.find(x=>x.playable).id});};
  const unknownEpisode=await workFor({type:'series',id:'tt0944947'});assert.equal(unknownEpisode.workKey,'','unknown episodes are not grouped by title');
  const anotherEpisode=await workFor({type:'series',id:'tt0944947',season:2,episode:1});assert.notEqual(anotherEpisode.workKey,urlPlay.workKey);assert.equal(anotherEpisode.key,urlPlay.key,'same URL is not the same work');
  const movie=await workFor({type:'movie',id:'tt0944947'});assert.notEqual(movie.workKey,anotherEpisode.workKey,'type is part of work identity');
  assert.equal(tPlay.url, 'whisper-media://t/video');
  const previewCall = h.torrentCalls.find((c) => c.action === 'preview');
  assert.match(previewCall.magnet, /xt=urn:btih:a{40}/);
  assert.match(previewCall.magnet, /tr=udp/);
  assert.ok(!previewCall.magnet.includes('dht'), 'yalnız tracker: kaynakları magnete girer');
  const noEngine = harness({ torrentStatus: { ok: true, installed: false } });
  await noEngine.install('https://torr.example/cfg%3Dsecretkey/manifest.json');
  const l2 = await noEngine.service.handle({}, { action: 'streams', type: 'series', id: 'tt0944947', season: 1, episode: 2 });
  await assert.rejects(noEngine.service.handle({}, { action: 'play', token: l2.token, streamId: l2.streams.find((s) => s.kind === 'torrent').id }), (e) => e.code === 'NEEDS_TORRENT_ENGINE');
  assert.ok(!noEngine.torrentCalls.some((c) => c.action === 'preview'), 'motor yokken torrent önizlemesi başlatılmaz');

  // --- Altyazılar
  const subs = await h.service.handle({}, { action: 'subtitles', type: 'series', id: 'tt0944947', season: 1, episode: 2, language: 'tr', title: 'Dizi' });
  assert.equal(subs.fallback, false);
  assert.deepEqual(subs.subtitles.map((s) => s.language), ['tr', 'en'], 'tercih edilen dil önce; http altyazı elenir');
  assert.ok(!JSON.stringify(subs).includes('subs.example/tr.srt'), 'altyazı URL\u2019si renderer\u2019a verilmez');
  const saved = await h.service.handle({}, { action: 'subtitle-save', token: subs.token, id: subs.subtitles[0].id });
  assert.ok(fs.readFileSync(saved.filePath, 'utf8').includes('Merhaba'));
  assert.deepEqual(h.granted, [saved.filePath]);
  assert.ok(saved.filePath.startsWith(h.root));

  // --- Devam kaydı
  const save = (extra) => h.service.handle({}, { action: 'progress-save', type: 'series', id: 'tt0944947', name: 'Dizi', season: 1, episode: 1, episodeTitle: 'Bir', position: 600, duration: 3000, next: { season: 1, episode: 2, title: 'İki' }, ...extra });
  await save({});
  let list = (await h.service.handle({}, { action: 'continue-list' })).items;
  assert.equal(list.length, 1); assert.equal(list[0].position, 600); assert.equal(list[0].completed, false);
  await save({ position: 2900 });
  list = (await h.service.handle({}, { action: 'continue-list' })).items;
  assert.equal(list[0].completed, true); assert.deepEqual(list[0].next, { season: 1, episode: 2, title: 'İki' }, 'bitince sıradaki bölüm önerilir');
  await h.service.handle({}, { action: 'progress-save', type: 'movie', id: 'tt1', name: 'Film', position: 3000, duration: 3000 });
  assert.equal((await h.service.handle({}, { action: 'continue-list' })).items.length, 1, 'biten film listede kalmaz');
  await h.service.handle({}, { action: 'progress-save', type: 'series', id: 'tt0944947', name: 'Dizi', season: 1, episode: 2, position: 100, duration: 3000 });
  const resumed = await h.service.handle({}, { action: 'streams', type: 'series', id: 'tt0944947', season: 1, episode: 2 });
  const resumedPlay = await h.service.handle({}, { action: 'play', token: resumed.token, streamId: resumed.streams.find((s) => s.kind === 'url' && s.playable).id });
  assert.deepEqual(resumedPlay.resume, { position: 100, duration: 3000 }, 'aynı bölüm başka kaynakla açılınca konum sürer');
  await assert.rejects(h.service.handle({}, { action: 'progress-save', type: 'movie', id: 'bad id', position: 1, duration: 2 }), (e) => e.code === 'BAD_REQUEST');
  assert.equal((await h.service.handle({}, { action: 'progress-title', type: 'series', id: 'tt0944947' })).entries.length, 2);

  // --- Yönetim
  const order = (await h.service.handle({}, { action: 'status' })).addons.map((a) => a.name);
  const moved = await h.service.handle({}, { action: 'addon-move', key: (await h.service.handle({}, { action: 'status' })).addons[1].key, direction: 'up' });
  assert.notDeepEqual(moved.addons.map((a) => a.name), order);
  const key = moved.addons[0].key;
  assert.equal((await h.service.handle({}, { action: 'addon-toggle', key, enabled: false })).addons[0].enabled, false);
  assert.equal((await h.service.handle({}, { action: 'addon-remove', key })).addons.length, 2);
  await assert.rejects(h.service.handle({}, { action: 'bilinmeyen' }), (e) => e.code === 'BAD_REQUEST');
  // VTT → SRT (dublaj hattı yalnız .srt kabul eder)
  const { vttToSrt } = require('../src/stremio-service');
  const srt = vttToSrt('WEBVTT\n\nNOTE x\n\n1\n00:01.000 --> 00:02.500 align:start\n<v A>Merhaba</v>\n\n01:00:01.5 --> 01:00:02.000\nİkinci\nsatır\n');
  assert.equal(srt, '1\n00:00:01,000 --> 00:00:02,500\nMerhaba\n\n2\n01:00:01,500 --> 01:00:02,000\nİkinci\nsatır\n');
  assert.equal(vttToSrt('WEBVTT\n\n'), '', 'boş VTT boş döner');
  // Listem
  assert.deepEqual((await h.service.handle({}, { action: 'library-list' })).items, []);
  const added = await h.service.handle({}, { action: 'library-toggle', type: 'movie', id: 'tt9', name: 'Film', poster: 'https://img.example/p.jpg', year: 2020, imdbRating: 7.5 });
  assert.equal(added.saved, true); assert.equal(added.items[0].name, 'Film');
  assert.equal((await h.service.handle({}, { action: 'library-has', type: 'movie', id: 'tt9' })).saved, true);
  assert.equal((await h.service.handle({}, { action: 'library-toggle', type: 'movie', id: 'tt9' })).saved, false);
  await assert.rejects(h.service.handle({}, { action: 'library-toggle', type: 'movie', id: '../x' }), (e) => e.code === 'BAD_REQUEST');
  // progress-clear: yalnız belirtilen bölüm silinir
  for (const ep of [1, 2]) await h.service.handle({}, { action: 'progress-save', type: 'series', id: 'tt777', season: 1, episode: ep, name: 'Dizi', position: 100, duration: 2000 });
  await h.service.handle({}, { action: 'progress-clear', type: 'series', id: 'tt777', season: 1, episode: 1 });
  assert.deepEqual((await h.service.handle({}, { action: 'progress-title', type: 'series', id: 'tt777' })).entries.map((e) => e.episode), [2], 'yalnız 1. bölüm silinir');
  await h.service.handle({}, { action: 'progress-clear', type: 'series', id: 'tt777' });
  assert.equal((await h.service.handle({}, { action: 'progress-title', type: 'series', id: 'tt777' })).entries.length, 0, 'bölüm verilmezse tüm başlık silinir');
  // Kaynak puanı + etiketler
  const rich = A.normalizeStream({ name: 'T\n4k', title: 'Film.2160p.UHD.BluRay.HEVC.TrueHD.Atmos.7.1-GRP.mkv\n👤 320 💾 58 GB', infoHash: 'a'.repeat(40), behaviorHints: { filename: 'Film.2160p.UHD.BluRay.HEVC.TrueHD.Atmos.7.1-GRP.mkv' } }, { key: 'k', name: 'T', host: 'torrentio.strem.fun' });
  assert.ok(rich.score >= 60 && rich.score <= 100, 'iyi kaynak yüksek puan alır: ' + rich.score);
  assert.ok(rich.tags.includes('bluray') && rich.tags.includes('hevc') && rich.tags.includes('fast'), 'etiketler');
  assert.equal(rich.audio, 'truehd'); assert.equal(rich.channels, '7.1'); assert.equal(rich.group, 'GRP');
  const cam = A.normalizeStream({ name: 'T\n720p', title: 'Film.720p.CAM.x264\n👤 2', infoHash: 'b'.repeat(40) }, { key: 'k', name: 'T', host: 'x.example' });
  assert.ok(cam.score < rich.score - 30 && cam.warns.includes('cam') && cam.warns.includes('lowseed'), 'kamera kaydı cezalı');
  assert.equal(A.scoreStream({ playable: false }).score, 0);
  // Meta zenginleştirme
  const richMeta = A.normalizeMeta({ id: 'tt1', type: 'movie', name: 'F', cast: ['A'], writer: ['W'], awards: 'Ödül', country: 'TR', released: '2020-05-01T00:00:00.000Z', trailers: [{ source: 'dQw4w9WgXcQ', type: 'Trailer' }, { source: 'bad id' }] }, { host: 'x.example' });
  assert.deepEqual(richMeta.writer, ['W']); assert.equal(richMeta.released, '2020-05-01'); assert.deepEqual(richMeta.trailers, [{ ytId: 'dQw4w9WgXcQ', title: 'Trailer' }]);
  // Puan / durum / not
  assert.equal((await h.service.handle({}, { action: 'rating-get', type: 'movie', id: 'tt55' })).rating, null);
  const rated = await h.service.handle({}, { action: 'rating-set', type: 'movie', id: 'tt55', name: 'Film', score: 14, note: ' güzel ', status: 'watched' });
  assert.equal(rated.rating.score, 10, 'puan 0–10 ile sınırlı'); assert.equal(rated.rating.note, 'güzel'); assert.equal(rated.rating.status, 'watched');
  assert.equal((await h.service.handle({}, { action: 'rating-set', type: 'movie', id: 'tt55', name: 'Film', score: 7, status: 'bogus' })).rating.status, '', 'bilinmeyen durum boşa düşer');
  assert.equal((await h.service.handle({}, { action: 'rating-list' })).items.length, 1);
  assert.equal((await h.service.handle({}, { action: 'rating-set', type: 'movie', id: 'tt55', score: 0, note: '', status: '' })).rating, null, 'boş değerlendirme silinir');
  await assert.rejects(h.service.handle({}, { action: 'rating-set', type: 'movie', id: '../x', score: 3 }), (e) => e.code === 'BAD_REQUEST');
  // Geçmiş + istatistik
  await h.service.handle({}, { action: 'progress-save', type: 'movie', id: 'tt88', name: 'Bitti', position: 5900, duration: 6000 });
  const hist = await h.service.handle({}, { action: 'history-list' });
  assert.ok(hist.items.length >= 1 && hist.stats.titles >= 1 && hist.stats.episodes >= 1 && hist.stats.hours > 0 && hist.stats.thisWeek >= 1 && hist.stats.streak >= 1, JSON.stringify(hist.stats));

  // Kişisel kayıtlar kapasitede veya bozuk diskte sessizce ezilmez.
  const capped=harness();
  for(const [file,data,request]of [
   ['stremio-ratings.json',{version:1,entries:Object.fromEntries(Array.from({length:2000},(_,i)=>['movie:tt'+i,{type:'movie',id:'tt'+i,score:8,updatedAt:i}]))},{action:'rating-set',type:'movie',id:'ttNew',score:9}],
   ['stremio-library.json',{version:1,items:Array.from({length:500},(_,i)=>({type:'movie',id:'tt'+i,name:'Saved '+i}))},{action:'library-toggle',type:'movie',id:'ttNew'}],
   ['stremio-progress.json',{version:1,entries:Object.fromEntries(Array.from({length:2000},(_,i)=>['movie:tt'+i,{type:'movie',id:'tt'+i,position:10,duration:100,lastWatched:i}]))},{action:'progress-save',type:'movie',id:'ttNew',position:20,duration:100}]
  ]){const filePath=path.join(capped.root,file),before=JSON.stringify(data);fs.writeFileSync(filePath,before);await assert.rejects(capped.service.handle({},request),e=>e.code==='CAPACITY');assert.equal(fs.readFileSync(filePath,'utf8'),before);}
  const corrupt=path.join(capped.root,'stremio-ratings.json');fs.writeFileSync(corrupt,'{broken');await assert.rejects(capped.service.handle({},{action:'rating-set',type:'movie',id:'tt1',score:1}),e=>e.code==='STORAGE_READ');assert.equal(fs.readFileSync(corrupt,'utf8'),'{broken');
  const configured=A.normalizeAddonUrl('https://addon.example/config/manifest.json?token=fixture');assert.equal(A.buildResourceUrl(configured.baseUrl,'meta','movie','tt1'),'https://addon.example/config/meta/movie/tt1.json?token=fixture');
  let requested=0;await assert.rejects(A.fetchJson('https://addon.example/manifest.json',{signal:AbortSignal.abort(),fetch:async()=>{requested++;return json({});}}),e=>e.code==='ABORTED');assert.equal(requested,0);
  // Configuration is token-owned, origin/id checked and only committed after explicit save.
  assert.equal(A.addonConfigureUrl('https://torr.example/cfg%3Dfixture/manifest.json?locale=tr'),'https://torr.example/cfg%3Dfixture/configure?locale=tr');
  let configResponse,configArgs;const configuredUrl='https://torr.example/debrid-fixture/manifest.json',otherUrl='https://torr.example/other-fixture/manifest.json';
  const extraManifests={[configuredUrl]:MANIFESTS['https://torr.example/cfg%3Dsecretkey/manifest.json'],[otherUrl]:{...MANIFESTS['https://torr.example/cfg%3Dsecretkey/manifest.json'],id:'another.addon'}};
  const config=harness({extraManifests,configureAddon:async args=>{configArgs=args;return configResponse;}});await config.install('https://cinemeta.example/manifest.json');await config.install('https://torr.example/cfg%3Dsecretkey/manifest.json');await config.install('https://subs.example/manifest.json');
  const configFile=path.join(config.root,'stremio-addons.json'),initial=JSON.parse(fs.readFileSync(configFile,'utf8')),originalKey=initial.addons[1].key;initial.addons[1].enabled=false;initial.addons[1].personalMarker='keep';delete initial.addons[1].manifest.configurable;fs.writeFileSync(configFile,JSON.stringify(initial));const beforeConfig=fs.readFileSync(configFile,'utf8');assert.equal((await config.service.handle({},{action:'status'})).addons[1].configurationUnknown,true,'legacy installed capability is unknown, not false');const oldManifestFetches=config.calls.filter(url=>url===initial.addons[1].manifestUrl).length;
  configResponse={manifestUrl:'stremio://torr.example/debrid-fixture/manifest.json'};const configPreview=await config.service.handle({},{action:'addon-configure',key:originalKey});assert.equal(configArgs.url,'https://torr.example/cfg%3Dsecretkey/configure');assert.equal(configArgs.expectedOrigin,'https://torr.example');assert.equal(config.calls.filter(url=>url===initial.addons[1].manifestUrl).length,oldManifestFetches+1,'only the selected legacy addon is revalidated before opening settings');assert(configPreview.configured&&configPreview.replacing);assert.equal(fs.readFileSync(configFile,'utf8'),beforeConfig,'returning settings does not persist before save');assert(!JSON.stringify(configPreview).includes('debrid-fixture'));assert(!JSON.stringify(configPreview).includes('secretkey'));
  const configuredAfter=await config.service.handle({},{action:'addon-install',token:configPreview.token});assert.equal(configuredAfter.addons.length,3);const savedConfig=JSON.parse(fs.readFileSync(configFile,'utf8'));assert.equal(savedConfig.addons[1].manifestUrl,configuredUrl);assert.equal(savedConfig.addons[1].enabled,false);assert.equal(savedConfig.addons[1].installedAt,initial.addons[1].installedAt);assert.equal(savedConfig.addons[1].personalMarker,'keep');assert.equal(savedConfig.addons[1].manifest.configurable,true);assert.equal((await config.service.handle({},{action:'status'})).addons[1].configurationUnknown,false);assert.equal(savedConfig.addons[0].key,initial.addons[0].key);assert.equal(savedConfig.addons[2].key,initial.addons[2].key);
  const newKey=savedConfig.addons[1].key,savedBytes=fs.readFileSync(configFile,'utf8');configResponse={cancelled:true};assert.deepEqual(await config.service.handle({},{action:'addon-configure',key:newKey}),{cancelled:true});assert.equal(fs.readFileSync(configFile,'utf8'),savedBytes);
  configResponse={manifestUrl:'https://foreign.example/debrid-fixture/manifest.json'};await assert.rejects(config.service.handle({},{action:'addon-configure',key:newKey}),e=>e.code==='CONFIG_ORIGIN'&&!e.message.includes('debrid-fixture'));configResponse={manifestUrl:otherUrl};await assert.rejects(config.service.handle({},{action:'addon-configure',key:newKey}),e=>e.code==='CONFIG_ID');assert.equal(fs.readFileSync(configFile,'utf8'),savedBytes);
  configResponse={manifestUrl:configuredUrl};const staleConfig=await config.service.handle({},{action:'addon-configure',key:newKey});await config.service.handle({},{action:'addon-remove',key:newKey});const afterRemove=fs.readFileSync(configFile,'utf8');await assert.rejects(config.service.handle({},{action:'addon-install',token:staleConfig.token}),e=>e.code==='CONFIG_STALE');assert.equal(fs.readFileSync(configFile,'utf8'),afterRemove);

  let nonConfigOpened=0;const legacyReplies={};const legacyPlain=harness({extraManifests:legacyReplies,configureAddon:async()=>{nonConfigOpened++;return {cancelled:true};}});await legacyPlain.install('https://cinemeta.example/manifest.json');const legacyPlainFile=path.join(legacyPlain.root,'stremio-addons.json'),legacyPlainData=JSON.parse(fs.readFileSync(legacyPlainFile,'utf8'));delete legacyPlainData.addons[0].manifest.configurable;fs.writeFileSync(legacyPlainFile,JSON.stringify(legacyPlainData));const plainBytes=fs.readFileSync(legacyPlainFile,'utf8');assert((await legacyPlain.service.handle({},{action:'status'})).addons[0].configurationUnknown);await assert.rejects(legacyPlain.service.handle({},{action:'addon-configure',key:legacyPlainData.addons[0].key}),e=>e.code==='NOT_CONFIGURABLE');assert.equal(nonConfigOpened,0,'legacy nonconfigurable addons do not open a guessed 404 settings page');assert.equal(fs.readFileSync(legacyPlainFile,'utf8'),plainBytes,'legacy preflight is read-only');legacyReplies['https://cinemeta.example/manifest.json']={...MANIFESTS['https://cinemeta.example/manifest.json'],id:'changed.identity',behaviorHints:{configurable:true}};await assert.rejects(legacyPlain.service.handle({},{action:'addon-configure',key:legacyPlainData.addons[0].key}),e=>e.code==='CONFIG_ID');assert.equal(nonConfigOpened,0);assert.equal(fs.readFileSync(legacyPlainFile,'utf8'),plainBytes);
  const requiredUrl='https://configure.example/saved-fixture/manifest.json',required=harness({extraManifests:{[requiredUrl]:{...MANIFESTS['https://configure.example/manifest.json'],behaviorHints:{configurable:true}}},configureAddon:async()=>({manifestUrl:requiredUrl})});
  const needed=await required.service.handle({},{action:'addon-preview',url:'https://configure.example/manifest.json'});assert(needed.configurationRequired);const readyConfig=await required.service.handle({},{action:'addon-configure',token:needed.token});assert(readyConfig.configured&&!readyConfig.configurationRequired&&!readyConfig.replacing);assert.equal((await required.service.handle({},{action:'addon-install',token:readyConfig.token})).addons.length,1);
  const duplicated=harness({extraManifests,configureAddon:async()=>({manifestUrl:configuredUrl})});await duplicated.install('https://torr.example/cfg%3Dsecretkey/manifest.json');await duplicated.install(configuredUrl);const duplicateFile=path.join(duplicated.root,'stremio-addons.json'),duplicateBytes=fs.readFileSync(duplicateFile,'utf8');const duplicatePreview=await duplicated.service.handle({},{action:'addon-configure',key:JSON.parse(duplicateBytes).addons[0].key});await assert.rejects(duplicated.service.handle({},{action:'addon-install',token:duplicatePreview.token}),e=>e.code==='CONFIG_CONFLICT');assert.equal(fs.readFileSync(duplicateFile,'utf8'),duplicateBytes);
  const full=harness({extraManifests,configureAddon:async()=>({manifestUrl:configuredUrl})});await full.install('https://torr.example/cfg%3Dsecretkey/manifest.json');const fullFile=path.join(full.root,'stremio-addons.json'),fullData=JSON.parse(fs.readFileSync(fullFile,'utf8'));for(let i=1;i<40;i++)fullData.addons.push({...fullData.addons[0],key:'fixture-'+i,manifestUrl:'https://full'+i+'.example/manifest.json'});fs.writeFileSync(fullFile,JSON.stringify(fullData));const fullPreview=await full.service.handle({},{action:'addon-configure',key:fullData.addons[0].key});assert.equal((await full.service.handle({},{action:'addon-install',token:fullPreview.token})).addons.length,40,'replacement is allowed at capacity without deleting addons');

  // Main configuration window: isolated sandbox, owned callback, child/iframe and cancellation.
  const {EventEmitter}=require('node:events'),windows=[];class ConfigWindow extends EventEmitter{
    constructor(options){super();this.options=options;this.closed=false;this.webContents=new EventEmitter();this.webContents.session=new EventEmitter();this.handledSchemes=new Map();this.unhandledSchemes=[];this.webContents.session.protocol={handle:(scheme,handler)=>this.handledSchemes.set(scheme,handler),unhandle:scheme=>{this.unhandledSchemes.push(scheme);this.handledSchemes.delete(scheme);}};this.webContents.session.clearStorageData=async()=>{this.storageCleared=true;};this.webContents.session.clearCache=async()=>{this.cacheCleared=true;};this.webContents.session.setPermissionRequestHandler=fn=>{this.requestPermission=fn;};this.webContents.session.setPermissionCheckHandler=fn=>{this.checkPermission=fn;};this.webContents.setWindowOpenHandler=fn=>{this.openWindow=fn;};windows.push(this);}
    loadURL(url){this.loadedUrl=url;return Promise.resolve();}show(){this.shown=true;}isDestroyed(){return this.closed;}destroy(){if(this.closed)return;this.closed=true;this.emit('closed');}
  }
  const ownerWindow=new EventEmitter();ownerWindow.isDestroyed=()=>false;const configureWindow=require('../src/stremio-config-window').createStremioConfigurator({BrowserWindow:ConfigWindow,owner:()=>ownerWindow});
  let prevented=0;const preventEvent=()=>({preventDefault(){prevented++;}}),origin='https://addon.example';
  const windowResult=configureWindow({url:origin+'/private-fixture/configure',expectedOrigin:origin}),settingsWindow=windows.at(-1);assert(settingsWindow.options.webPreferences.sandbox);assert(settingsWindow.options.webPreferences.contextIsolation);assert.equal(settingsWindow.options.webPreferences.nodeIntegration,false);assert.equal(settingsWindow.options.webPreferences.preload,undefined);assert(!settingsWindow.options.webPreferences.partition.startsWith('persist:'));
  assert.equal(settingsWindow.checkPermission(),false);let granted=true;settingsWindow.requestPermission(null,'camera',ok=>{granted=ok;});assert.equal(granted,false);
  settingsWindow.webContents.emit('will-navigate',preventEvent(),'file:///private');settingsWindow.webContents.emit('will-navigate',preventEvent(),'https://169.254.169.254/private');assert.equal(prevented,2);assert.equal(settingsWindow.openWindow({url:'unknown://private'}).action,'deny');
  const childOptions=settingsWindow.openWindow({url:'https://debrid.example/api-key-help'});assert.equal(childOptions.action,'allow');assert.equal(childOptions.overrideBrowserWindowOptions.webPreferences.partition,settingsWindow.options.webPreferences.partition);const child=new ConfigWindow(childOptions.overrideBrowserWindowOptions);settingsWindow.webContents.emit('did-create-window',child);child.webContents.emit('will-frame-navigate',preventEvent(),{isMainFrame:false,url:'stremio://addon.example/fixture-key/manifest.json'});assert.deepEqual(await windowResult,{manifestUrl:origin+'/fixture-key/manifest.json'});assert(settingsWindow.closed&&child.closed);assert.deepEqual(settingsWindow.unhandledSchemes,['stremio']);assert.equal(settingsWindow.handledSchemes.size,0);assert(settingsWindow.storageCleared&&settingsWindow.cacheCleared);
  const iframeSchemeResult=configureWindow({url:origin+'/configure',expectedOrigin:origin}),iframeWindow=windows.at(-1);assert.deepEqual([...iframeWindow.handledSchemes.keys()],['stremio']);const iframeHandler=iframeWindow.handledSchemes.get('stremio');const iframeReply=await iframeHandler({url:'stremio://addon.example/iframe-fixture/manifest.json'});assert.equal(iframeReply.status,204);assert.deepEqual(await iframeSchemeResult,{manifestUrl:origin+'/iframe-fixture/manifest.json'});assert(iframeWindow.closed);assert.deepEqual(iframeWindow.unhandledSchemes,['stremio']);assert.equal(iframeWindow.handledSchemes.size,0);assert(iframeWindow.storageCleared&&iframeWindow.cacheCleared);
  const foreignSchemeResult=configureWindow({url:origin+'/configure',expectedOrigin:origin}),foreignSchemeWindow=windows.at(-1);await foreignSchemeWindow.handledSchemes.get('stremio')({url:'stremio://foreign.example/fixture-key/manifest.json'});await assert.rejects(foreignSchemeResult,e=>e.code==='CONFIG_ORIGIN'&&!e.message.includes('fixture-key'));assert.deepEqual(foreignSchemeWindow.unhandledSchemes,['stremio']);
  const foreignResult=configureWindow({url:origin+'/configure',expectedOrigin:origin});windows.at(-1).webContents.emit('will-navigate',preventEvent(),'stremio://foreign.example/fixture-key/manifest.json');await assert.rejects(foreignResult,e=>e.code==='CONFIG_ORIGIN'&&!e.message.includes('fixture-key'));
  const cancelledWindow=configureWindow({url:origin+'/configure',expectedOrigin:origin});const cancelledRoot=windows.at(-1);cancelledRoot.destroy();assert.deepEqual(await cancelledWindow,{cancelled:true});assert.deepEqual(cancelledRoot.unhandledSchemes,['stremio']);
  const disposedWindow=configureWindow({url:origin+'/configure',expectedOrigin:origin});configureWindow.dispose();assert.deepEqual(await disposedWindow,{cancelled:true});
  const failedWindow=configureWindow({url:origin+'/configure',expectedOrigin:origin});windows.at(-1).webContents.emit('did-fail-load',{},-105,'URL contained fixture-key',origin+'/fixture-key',true);await assert.rejects(failedWindow,e=>e.code==='CONFIG_LOAD'&&!e.message.includes('fixture-key'));
  console.log('stremio-addons.test.js: OK');
})().catch((e) => { console.error(e); process.exit(1); });
