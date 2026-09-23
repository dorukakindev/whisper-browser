// R114-B live HLS fixture: rolling media-sequence, no ENDLIST until stream end.
// Serves real TS segments (16 x ~2s) + WebVTT subtitle playlist in lockstep.
'use strict';
const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');

const DIR = '/home/ubuntu/qa-114/hls';
const SEG_COUNT = 16;
const SEG_DUR = 30.945 / 16;           // ~1.934s
const WINDOW = 4;                      // sliding window size
const LIVE_LEAD = 3;                   // segments ready when stream "starts"
const requests = new Map();
let t0 = null;
let endlistAt = Infinity;

function now() { return t0 ? (Date.now() - t0) / 1000 : 0; }
function produced() { return Math.min(SEG_COUNT, LIVE_LEAD + Math.floor(now() / SEG_DUR)); }

function livePlaylist(kind) {
  const n = produced();
  const seq = Math.max(0, n - WINDOW);
  const lines = ['#EXTM3U', `#EXT-X-TARGETDURATION:${Math.ceil(SEG_DUR)}`, `#EXT-X-MEDIA-SEQUENCE:${seq}`];
  for (let i = seq; i < n; i++) {
    if (kind === 'video' && i === 8) lines.push('#EXT-X-DISCONTINUITY');
    lines.push(`#EXTINF:${(i === SEG_COUNT - 1 ? SEG_DUR - 0.03 : SEG_DUR).toFixed(3)},`);
    lines.push(kind === 'video' ? `seg-${String(i).padStart(3, '0')}.ts` : `sub-${String(i).padStart(3, '0')}.vtt`);
  }
  if (now() >= endlistAt && n >= SEG_COUNT) lines.push('#EXT-X-ENDLIST');
  return lines.join('\n') + '\n';
}

function send(res, status, type, body) {
  res.writeHead(status, { 'content-type': type, 'cache-control': 'no-store', 'access-control-allow-origin': '*' });
  res.end(body);
}

const useTls = fs.existsSync(path.join(__dirname, 'cert.pem'));
const server = useTls
  ? https.createServer({ cert: fs.readFileSync(path.join(__dirname, 'cert.pem')), key: fs.readFileSync(path.join(__dirname, 'key.pem')) }, handler)
  : http.createServer(handler);

function handler(req, res) {
  const url = new URL(req.url, 'http://127.0.0.1');
  requests.set(url.pathname, (requests.get(url.pathname) || 0) + 1);
  const p = url.pathname;
  if (p === '/live/master.m3u8') return send(res, 200, 'application/vnd.apple.mpegurl',
    '#EXTM3U\n#EXT-X-MEDIA:TYPE=SUBTITLES,GROUP-ID="subs",LANGUAGE="en",NAME="English",AUTOSELECT=YES,DEFAULT=YES,URI="subs.m3u8"\n'
    + '#EXT-X-STREAM-INF:BANDWIDTH=800000,SUBTITLES="subs"\nvideo.m3u8\n');
  if (p === '/live/video.m3u8') return send(res, 200, 'application/vnd.apple.mpegurl', livePlaylist('video'));
  if (p === '/live/subs.m3u8') return send(res, 200, 'application/vnd.apple.mpegurl', livePlaylist('subs'));
  if (p === '/stats') return send(res, 200, 'application/json',
    JSON.stringify({ now: now(), produced: produced(), requests: Object.fromEntries(requests) }));
  const m = p.match(/^\/live\/(seg|sub)-(\d+)\.(ts|vtt)$/);
  if (m) {
    const i = Number(m[2]);
    const n = produced();
    if (i >= n) return send(res, 404, 'text/plain', 'segment henuz uretilmedi');
    // seg-12: ilk istek 404, tekrar 200 (retry → farklı yanıt)
    if (m[1] === 'seg' && i === 12 && requests.get(p) === 1) return send(res, 404, 'text/plain', 'gecici hata — tekrar dene');
    const real = path.join(DIR, m[1] === 'seg' ? 'seg' : 'subs', `${m[1]}-${m[2]}.${m[3]}`);
    if (!fs.existsSync(real)) return send(res, 404, 'text/plain', 'dosya yok');
    const extra = m[1] === 'seg' && i === 10 ? 250 : 0;   // gecikmeli segment
    return setTimeout(() => send(res, 200, m[3] === 'ts' ? 'video/mp2t' : 'text/vtt', fs.readFileSync(real)), extra);
  }
  return send(res, 404, 'text/plain', 'bulunamadı');
}

process.argv.slice(2).forEach(a => {
  const m = a.match(/^--endlist-at=(\d+)$/);
  if (m) endlistAt = Number(m[1]);
});

server.listen(0, '127.0.0.1', () => {
  t0 = Date.now();
  const port = server.address().port;
  console.log(JSON.stringify({ port, tls: useTls, url: `http${useTls ? 's' : ''}://127.0.0.1:${port}/live/master.m3u8` }));
});
process.on('SIGTERM', () => process.exit(0));
