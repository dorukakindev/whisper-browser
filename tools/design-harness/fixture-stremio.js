'use strict';
// Local loopback Stremio addons for design/E2E checks (no network, no personal data).
// Two addons (Alpha, Beta) so cross-addon de-duplication is exercised. One stream points at a real local test video.
const http = require('node:http'), fs = require('node:fs');
const PORT = Number(process.env.STREMIO_FIXTURE_PORT || 47123), BASE = `http://127.0.0.1:${PORT}`;
const VIDEO = process.env.STREMIO_FIXTURE_VIDEO || '';
const SERIES = 'tt7000001', MOVIE = 'tt7000002', DAY = 86400000, NOW = Date.UTC(2026, 10, 13);
const longTitle = 'The night the harbour lights went out and nobody on the island could explain why the keepers had left';
const seasons = { 0: 2, 1: 8, 2: 10, 3: 6 };
const videos = [];
for (const [s, n] of Object.entries(seasons)) for (let e = 1; e <= n; e++) {
  const season = Number(s), future = season === 3 && e >= 5;
  videos.push({ id: `${SERIES}:${season}:${e}`, season, episode: e, title: season === 2 && e === 4 ? longTitle : season === 0 ? `Special ${e}: Behind the light` : `Chapter ${e}`,
    released: new Date(future ? NOW + e * 7 * DAY : NOW - (40 - season * 10 - e) * 7 * DAY).toISOString(),
    ...(season === 1 ? { thumbnail: `https://episodes.example/${season}-${e}.jpg`, overview: `Episode ${e} of the first season. The keepers argue about the storm and the missing logbook.` } : {}) });
}
const meta = {
  [SERIES]: { id: SERIES, type: 'series', name: 'The Lighthouse Keepers', releaseInfo: '2023–', imdbRating: '8.4', genres: ['Drama', 'Mystery'], description: 'Three keepers, one island and a light that keeps failing at the same hour.', poster: 'https://images.metahub.space/poster/medium/tt7000001/img', background: 'https://images.metahub.space/background/medium/tt7000001/img', videos },
  [MOVIE]: { id: MOVIE, type: 'movie', name: 'Night Harbour', releaseInfo: '2026', imdbRating: '7.6', runtime: '118 min', genres: ['Thriller'], description: 'A harbour pilot finds a ship that should not exist.', poster: 'https://images.metahub.space/poster/medium/tt7000002/img', background: 'https://images.metahub.space/background/medium/tt7000002/img' },
};
const GB = 1024 ** 3, HASH_A = 'a1'.repeat(20), HASH_B = 'b2'.repeat(20), HASH_C = 'c3'.repeat(20);
function streams(addon, label) {
  const file = `${label}.2160p.WEB-DL.DV.HDR10.HEVC.DDP5.1.Atmos-NIGHTOWL.mkv`;
  const common = [
    { name: `[TB+] ${addon}\n2160p`, description: `${file}\n💾 18.2 GB ⚙️ ${addon}`, url: `https://cdn.debrid.example/${addon}/${label}/2160.mkv`, behaviorHints: { filename: file, videoSize: Math.round(18.2 * GB) } },
    { name: `${addon}\n1080p`, description: `${label}.1080p.BluRay.x264.DTS-HD.MA.5.1-CINEFILE.mkv\n👤 240 💾 6.1 GB ⚙️ RARBG`, infoHash: HASH_A, fileIdx: 0, sources: [`tracker:udp://tracker.${addon.toLowerCase()}.example:1337/announce`], behaviorHints: { filename: `${label}.1080p.BluRay.x264.DTS-HD.MA.5.1-CINEFILE.mkv`, videoSize: Math.round(6.1 * GB) } },
  ];
  if (addon === 'Beta') return common;
  return [...common,
    { name: `[TB download] ${addon}\n1080p`, description: `${label}.1080p.WEB-DL.DDP5.1.H.264-FLUX.mkv\n💾 4.2 GB`, url: `https://cdn.debrid.example/${addon}/${label}/pending.mkv`, behaviorHints: { filename: `${label}.1080p.WEB-DL.DDP5.1.H.264-FLUX.mkv`, videoSize: Math.round(4.2 * GB) } },
    ...(VIDEO ? [{ name: `${addon} Local\n720p`, description: `${label}.720p.WEBRip.TR.EN.Multi.Subs.webm\n💾 2 MB 🇹🇷 🇬🇧`, url: `${BASE}/media/test.webm?edition=${encodeURIComponent(label)}`, behaviorHints: { filename: `${label}.720p.WEBRip.TR.EN.Multi.Subs.webm`, videoSize: fs.statSync(VIDEO).size } }] : []),
    { name: `${addon}\n720p`, description: `${label}.720p.HDTV.x264-LOL.mkv\n👤 3 💾 900 MB`, infoHash: HASH_B, behaviorHints: { filename: `${label}.720p.HDTV.x264-LOL.mkv`, videoSize: 900 * 1024 ** 2 } },
    { name: `${addon}\n1080p`, description: `${label}.1080p.HDCAM.x264-TRASH.mkv\n👤 61 💾 2.3 GB`, infoHash: HASH_C, behaviorHints: { filename: `${label}.1080p.HDCAM.x264-TRASH.mkv`, videoSize: Math.round(2.3 * GB) } },
    { name: `${addon} HLS\n1080p`, description: `${label} adaptive stream`, url: `https://hls.example/${label}/master.m3u8` },
    { name: `${addon} Mirror\n1080p`, description: `${label}.1080p.mkv`, url: `https://mirror.example/${label}.mkv`, behaviorHints: { proxyHeaders: { request: { 'X-Secret-Token': 'abc' } } } },
    { name: `${addon} Trailer`, description: 'Official trailer', ytId: 'dQw4w9WgXcQ' },
  ];
}
function manifest(addon) { return { id: `fixture.${addon.toLowerCase()}`, name: `${addon} Streams`, version: '1.0.0', description: `${addon} fixture addon`, types: ['movie', 'series'], resources: ['stream', 'meta', 'subtitles', 'catalog'], catalogs: [{type:'movie',id:'fixture-movies',name:'Fixture films'},{type:'series',id:'fixture-series',name:'Fixture series'}], idPrefixes: ['tt'] }; }
let server;
module.exports = function seed() {
  if (server) return;
  server = http.createServer((req, res) => {
    const url = new URL(req.url, BASE), parts = url.pathname.split('/').filter(Boolean);
    const json = (value) => { res.writeHead(200, { 'content-type': 'application/json', 'access-control-allow-origin': '*' }); res.end(JSON.stringify(value)); };
    if (url.pathname === '/media/test.webm' && VIDEO) {
      const size = fs.statSync(VIDEO).size, range = /bytes=(\d+)-(\d*)/.exec(req.headers.range || '');
      if (range) { const start = Number(range[1]), end = range[2] ? Number(range[2]) : size - 1; res.writeHead(206, { 'content-type': 'video/webm', 'accept-ranges': 'bytes', 'content-range': `bytes ${start}-${end}/${size}`, 'content-length': end - start + 1 }); fs.createReadStream(VIDEO, { start, end }).pipe(res); }
      else { res.writeHead(200, { 'content-type': 'video/webm', 'accept-ranges': 'bytes', 'content-length': size }); fs.createReadStream(VIDEO).pipe(res); }
      return;
    }
    const addon = parts[0] === 'beta' ? 'Beta' : 'Alpha', rest = parts[0] === 'beta' || parts[0] === 'alpha' ? parts.slice(1) : parts;
    if (url.pathname === '/captions/source.srt') { res.writeHead(200, {'content-type':'application/x-subrip'});res.end('1\n00:00:00,200 --> 00:00:00,850\nBirinci test cümlesi.\n\n2\n00:00:01,800 --> 00:00:02,500\nİkinci test cümlesi.\n');return; }
    if (rest[0] === 'subtitles') return json({subtitles:[{id:'fixture-tr',lang:'tur',url:BASE+'/captions/source.srt'}]});
    if (rest[0] === 'manifest.json') return json(manifest(addon));
    if (rest[0] === 'catalog') return json({metas:Array.from({length:8},(_,i)=>({...meta[rest[1]==='series'?SERIES:MOVIE],id:i===0?(rest[1]==='series'?SERIES:MOVIE):'tt'+(7000010+i),name:i===0&&rest[1]==='series'?'The Lighthouse Keepers':['Night Harbour','After the Last Train','A Map of Quiet Places','The Sound Between Rooms','Winter Letters','Beyond the Blue Horizon','The Long Way Home','The Lighthouse Keepers'][i]}))});
    if (rest[0] === 'meta') { const id = decodeURIComponent((rest[2] || '').replace(/\.json$/, '')); return meta[id] ? json({ meta: meta[id] }) : json({ meta: null }); }
    if (rest[0] === 'stream') { const id = decodeURIComponent((rest[2] || '').replace(/\.json$/, '')), [base, s, e] = id.split(':'); const label = base === MOVIE ? 'Night.Harbour.2026' : `The.Lighthouse.Keepers.S${String(s).padStart(2, '0')}E${String(e).padStart(2, '0')}`; return json({ streams: streams(addon, label) }); }
    res.writeHead(404); res.end('{}');
  });
  server.listen(PORT, '127.0.0.1');
};
module.exports.BASE = BASE; module.exports.SERIES = SERIES; module.exports.MOVIE = MOVIE;
