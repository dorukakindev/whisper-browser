'use strict';

const http = require('http');

function send(response, status, type, body) {
  response.writeHead(status, { 'content-type': type, 'cache-control': 'no-store' });
  response.end(body);
}

async function createBrowserStreamFixtureServer() {
  const requests = new Map();
  const server = http.createServer((request, response) => {
    const url = new URL(request.url, 'http://127.0.0.1');
    requests.set(url.pathname, (requests.get(url.pathname) || 0) + 1);
    const delayed = (body, type = 'text/vtt') => setTimeout(() => send(response, 200, type, body), 80);
    if (url.pathname === '/hls/master.m3u8') return send(response, 200, 'application/vnd.apple.mpegurl',
      '#EXTM3U\n#EXT-X-MEDIA:TYPE=SUBTITLES,GROUP-ID="cc",LANGUAGE="tr",NAME="Türkçe",URI="live.m3u8"\n');
    if (url.pathname === '/hls/live.m3u8') return send(response, 200, 'application/vnd.apple.mpegurl',
      '#EXTM3U\n#EXT-X-MEDIA-SEQUENCE:40\n#EXT-X-TARGETDURATION:4\n'
      + '#EXTINF:4,\nseg-40.vtt\n#EXTINF:4,\nmissing.vtt\n#EXT-X-DISCONTINUITY\n#EXTINF:4,\ndelayed.vtt\n');
    if (url.pathname === '/hls/seg-40.vtt') return send(response, 200, 'text/vtt',
      'WEBVTT\nX-TIMESTAMP-MAP=LOCAL:00:00:00.000,MPEGTS:0\n\n00:00.000 --> 00:04.000\nBugün Sidney\'de\n');
    if (url.pathname === '/hls/delayed.vtt') return delayed(
      'WEBVTT\nX-TIMESTAMP-MAP=LOCAL:00:00:00.000,MPEGTS:720000\n\n00:00.000 --> 00:04.000\nBölüm sonrası\n');
    if (url.pathname === '/hls/wrong-mime.vtt') return send(response, 200, 'application/octet-stream',
      'WEBVTT\n\n00:12.000 --> 00:14.000\nYanlış MIME ile gelen altyazı\n');
    if (url.pathname === '/hls/partial.vtt') {
      if (requests.get(url.pathname) === 1) return send(response, 200, 'text/vtt', 'WEBVTT\n\n00:16.000 -->');
      return send(response, 200, 'text/vtt', 'WEBVTT\n\n00:16.000 --> 00:18.000\nYeniden denemede tamamlandı\n');
    }
    if (url.pathname === '/hls/signed-live.m3u8') {
      if (url.searchParams.get('token') !== 'fresh') return send(response, 403, 'text/plain', 'imza süresi doldu');
      return send(response, 200, 'application/vnd.apple.mpegurl',
        '#EXTM3U\n#EXT-X-MEDIA-SEQUENCE:90\n#EXTINF:4,\nseg-40.vtt\n');
    }
    if (url.pathname === '/hls/missing.vtt' || url.pathname === '/dash/missing.m4s') {
      return send(response, 404, 'text/plain', 'fixture segment eksik');
    }
    if (url.pathname === '/dash/manifest.mpd') return send(response, 200, 'application/dash+xml',
      '<MPD><Period><AdaptationSet contentType="text" lang="tr" mimeType="application/ttml+xml">'
      + '<Representation id="tr"><BaseURL>./</BaseURL><SegmentList timescale="1000" duration="4000" startNumber="1">'
      + '<SegmentURL media="one.m4s"/><SegmentURL media="missing.m4s"/><SegmentURL media="delayed.m4s"/>'
      + '</SegmentList></Representation></AdaptationSet></Period></MPD>');
    if (url.pathname === '/dash/one.m4s') return send(response, 200, 'application/ttml+xml',
      '<tt><body><p begin="0s" end="4s">Birinci bölüm</p></body></tt>');
    if (url.pathname === '/dash/delayed.m4s') return delayed(
      '<tt><body><p begin="0s" end="4s">Geciken bölüm</p></body></tt>', 'application/ttml+xml');
    return send(response, 404, 'text/plain', 'fixture bulunamadı');
  });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address();
  return {
    baseUrl: `http://127.0.0.1:${address.port}`,
    requests,
    close: () => new Promise((resolve) => server.close(resolve)),
  };
}

module.exports = { createBrowserStreamFixtureServer };
