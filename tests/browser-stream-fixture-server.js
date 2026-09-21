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
    if (url.pathname === '/hls/rolling-live.m3u8') {
      const later = requests.get(url.pathname) > 1;
      return send(response, 200, 'application/vnd.apple.mpegurl', later
        ? '#EXTM3U\n#EXT-X-MEDIA-SEQUENCE:101\n#EXTINF:4,\nroll-101.vtt\n#EXTINF:4,\nroll-102.vtt\n'
        : '#EXTM3U\n#EXT-X-MEDIA-SEQUENCE:100\n#EXTINF:4,\nroll-100.vtt\n#EXTINF:4,\nroll-101.vtt\n');
    }
    if (url.pathname === '/hls/rollover.m3u8') return send(response, 200, 'application/vnd.apple.mpegurl',
      '#EXTM3U\n#EXT-X-MEDIA-SEQUENCE:200\n#EXTINF:2,\nbefore-rollover.vtt\n#EXTINF:2,\nafter-rollover.vtt\n');
    if (/^\/hls\/roll-10[0-2]\.vtt$/.test(url.pathname)) {
      const sequence = Number(url.pathname.match(/(\d+)\.vtt$/)[1]);
      return send(response, 200, 'text/vtt',
        `WEBVTT\nX-TIMESTAMP-MAP=LOCAL:00:00:00.000,MPEGTS:${(sequence - 100) * 360000}\n\n`
        + `00:00.000 --> 00:04.000\nCanlı ${sequence}\n`);
    }
    if (url.pathname === '/hls/before-rollover.vtt') return send(response, 200, 'text/vtt',
      `WEBVTT\nX-TIMESTAMP-MAP=LOCAL:00:00:00.000,MPEGTS:${(2 ** 33) - 90000}\n\n`
      + '00:00.000 --> 00:01.000\nDevir öncesi\n');
    if (url.pathname === '/hls/after-rollover.vtt') return send(response, 200, 'text/vtt',
      'WEBVTT\nX-TIMESTAMP-MAP=LOCAL:00:00:00.000,MPEGTS:90000\n\n'
      + '00:00.000 --> 00:01.000\nDevir sonrası\n');
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
    // EXT-X-MAP + EXT-X-BYTERANGE: init parçası ve üç medya parçası aynı
    // VTT dosyasının farklı bayt aralıklarında; ikinci aralık örtük (@ yok).
    if (url.pathname === '/hls/byterange.m3u8') return send(response, 200, 'application/vnd.apple.mpegurl',
      '#EXTM3U\n#EXT-X-TARGETDURATION:4\n#EXT-X-MEDIA-SEQUENCE:300\n'
      + '#EXT-X-MAP:URI="shared.vtt",BYTERANGE="11@0"\n'
      + '#EXTINF:4,\n#EXT-X-BYTERANGE:64@11\nshared.vtt\n'
      + '#EXTINF:4,\n#EXT-X-BYTERANGE:40\nshared.vtt\n'
      + '#EXT-X-DISCONTINUITY\n'
      + '#EXTINF:4,\n#EXT-X-BYTERANGE:38@200\nshared.vtt\n');
    // Aynı segment URI'si kayan listede farklı içerikle yeniden kullanılıyor.
    if (url.pathname === '/hls/reused.m3u8') {
      const second = requests.get(url.pathname) > 1;
      return send(response, 200, 'application/vnd.apple.mpegurl', second
        ? '#EXTM3U\n#EXT-X-MEDIA-SEQUENCE:401\n#EXTINF:4,\nsame.vtt\n'
        : '#EXTM3U\n#EXT-X-MEDIA-SEQUENCE:400\n#EXTINF:4,\nsame.vtt\n');
    }
    if (url.pathname === '/hls/same.vtt') {
      const first = requests.get(url.pathname) === 1;
      return send(response, 200, 'text/vtt', first
        ? 'WEBVTT\n\n00:00.000 --> 00:04.000\nİlk pencere içeriği\n'
        : 'WEBVTT\n\n00:00.000 --> 00:04.000\nİkinci pencere içeriği\n');
    }
    // EXT-X-SKIP delta güncellemesi: ilk 2 parça atlanır ama zaman ekseni korunur.
    if (url.pathname === '/hls/skip.m3u8') return send(response, 200, 'application/vnd.apple.mpegurl',
      '#EXTM3U\n#EXT-X-TARGETDURATION:4\n#EXT-X-MEDIA-SEQUENCE:500\n'
      + '#EXT-X-SKIP:SKIPPED-SEGMENTS=2\n#EXTINF:4,\nskip-502.vtt\n#EXT-X-GAP\ngap-503.vtt\n');
    // Başlangıç presentation timestamp'i sıfır değil (yayın 90 sn'de başlıyor).
    if (url.pathname === '/hls/offset.m3u8') return send(response, 200, 'application/vnd.apple.mpegurl',
      '#EXTM3U\n#EXT-X-MEDIA-SEQUENCE:600\n#EXTINF:4,\noffset.vtt\n');
    if (url.pathname === '/hls/offset.vtt') return send(response, 200, 'text/vtt',
      'WEBVTT\nX-TIMESTAMP-MAP=LOCAL:00:00:00.000,MPEGTS:8100000\n\n00:00.000 --> 00:02.000\nDoksanıncı saniyede başlayan\n');
    // Sonraki segment önceki cue'nun metnini düzeltiyor.
    if (url.pathname === '/hls/corrected.m3u8') return send(response, 200, 'application/vnd.apple.mpegurl',
      '#EXTM3U\n#EXT-X-MEDIA-SEQUENCE:700\n#EXTINF:4,\ncorrect-a.vtt\n#EXTINF:4,\ncorrect-b.vtt\n');
    if (url.pathname === '/hls/correct-a.vtt') return send(response, 200, 'text/vtt',
      'WEBVTT\n\n00:00.000 --> 00:02.000\nmeteor düşecek demişti\n\n00:02.000 --> 00:04.000\nsakin ol\n');
    if (url.pathname === '/hls/correct-b.vtt') return send(response, 200, 'text/vtt',
      'WEBVTT\n\n00:00.000 --> 00:02.000\nmeteor düşecek demişti, inanmadım\n\n00:04.000 --> 00:06.000\nsonra gökyüzü karardı\n');
    // Reklam period'u: discontinuity — reklam penceresi — ana içeriğe dönüş.
    if (url.pathname === '/hls/ad-break.m3u8') return send(response, 200, 'application/vnd.apple.mpegurl',
      '#EXTM3U\n#EXT-X-MEDIA-SEQUENCE:800\n#EXT-X-DISCONTINUITY-SEQUENCE:3\n'
      + '#EXTINF:4,\nmain-800.vtt\n#EXT-X-DISCONTINUITY\n#EXTINF:4,\nad-801.vtt\n'
      + '#EXT-X-DISCONTINUITY\n#EXTINF:4,\nmain-802.vtt\n');
    if (url.pathname === '/hls/main-800.vtt') return send(response, 200, 'text/vtt',
      'WEBVTT\n\n00:00.000 --> 00:04.000\nAna içerik öncesi\n');
    if (url.pathname === '/hls/ad-801.vtt') return send(response, 200, 'text/vtt',
      'WEBVTT\n\n00:00.000 --> 00:04.000\nReklam arası\n');
    if (url.pathname === '/hls/main-802.vtt') return send(response, 200, 'text/vtt',
      'WEBVTT\n\n00:00.000 --> 00:04.000\nAna içerik sonrası\n');
    // CEA master: CC1 (608) + SERVICE1 (708) + bilinmeyen instream-id.
    if (url.pathname === '/hls/cea-master.m3u8') return send(response, 200, 'application/vnd.apple.mpegurl',
      '#EXTM3U\n#EXT-X-MEDIA:TYPE=CLOSED-CAPTIONS,GROUP-ID="cc",LANGUAGE="en",NAME="Captions",INSTREAM-ID="CC1"\n'
      + '#EXT-X-MEDIA:TYPE=CLOSED-CAPTIONS,GROUP-ID="cc",LANGUAGE="en",NAME="708 Servisi",INSTREAM-ID="SERVICE1"\n'
      + '#EXT-X-MEDIA:TYPE=CLOSED-CAPTIONS,GROUP-ID="cc",LANGUAGE="en",NAME="Bilinmeyen",INSTREAM-ID="SERVICE9"\n'
      + '#EXT-X-STREAM-INF:BANDWIDTH=1000\nvideo.m3u8\n');
    // CEA medya listesi: aynı fMP4 URI iki bayt aralığı (kalite varyantı senaryosu).
    if (url.pathname === '/hls/cea-media.m3u8') return send(response, 200, 'application/vnd.apple.mpegurl',
      '#EXTM3U\n#EXT-X-MEDIA-SEQUENCE:900\n#EXT-X-TARGETDURATION:4\n'
      + '#EXT-X-MAP:URI="cea-init.mp4"\n'
      + '#EXTINF:4,\n#EXT-X-BYTERANGE:800@0\ncea-media.mp4\n#EXTINF:4,\n#EXT-X-BYTERANGE:800\ncea-media.mp4\n');
    // 304: koşullu manifest yenilemesi (ETag).
    if (url.pathname === '/hls/etag.m3u8') {
      if (request.headers['if-none-match'] === '"v1"') return send(response, 304, 'text/plain', '');
      response.writeHead(200, { 'content-type': 'application/vnd.apple.mpegurl',
        'cache-control': 'no-store', etag: '"v1"' });
      return response.end('#EXTM3U\n#EXT-X-MEDIA-SEQUENCE:950\n#EXTINF:4,\nseg-40.vtt\n');
    }
    if (url.pathname === '/hls/shared.vtt') {
      const file = 'WEBVTTxxx' // 11 bayt init (EXT-X-MAP aralığı)
        + 'filetime\n\n00:00.000 --> 00:04.000\nBirinci aralık gövdesi\n' // @11
        + '00:04.000 --> 00:08.000\nİkinci\n' // örtük, @11+64=75
        + 'PADDING-PADDING-PADDING-PADDING-PADDING-PADDING-PADDING-PADDING-PADDING-PADDING-PADDING-PADDING-PADDING-PADDING-'
        + '00:20.000 --> 00:24.000\nÜçüncü aralık\n'; // @200
      return send(response, 200, 'text/vtt', file);
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
    if (url.pathname === '/dash/multi-period.mpd') return send(response, 200, 'application/dash+xml',
      '<MPD><Period id="p1" duration="PT4S"><BaseURL>p1/</BaseURL>'
      + '<AdaptationSet contentType="text" lang="tr" mimeType="application/ttml+xml">'
      + '<Representation id="tr-p1"><SegmentList timescale="1000" duration="4000" startNumber="1">'
      + '<SegmentURL media="one.m4s"/></SegmentList></Representation></AdaptationSet></Period>'
      + '<Period id="p2" start="PT4S" duration="PT4S"><BaseURL>p2/</BaseURL>'
      + '<AdaptationSet contentType="text" lang="tr" mimeType="application/ttml+xml">'
      + '<Representation id="tr-p2"><SegmentList timescale="1000" duration="4000" startNumber="2">'
      + '<SegmentURL media="two.m4s"/></SegmentList></Representation></AdaptationSet></Period></MPD>');
    if (url.pathname === '/dash/p1/one.m4s') return send(response, 200, 'application/ttml+xml',
      '<tt><body><p begin="0s" end="4s">Birinci dönem</p></body></tt>');
    if (url.pathname === '/dash/p2/two.m4s') return send(response, 200, 'application/ttml+xml',
      '<tt><body><p begin="0s" end="4s">İkinci dönem</p></body></tt>');
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
