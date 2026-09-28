'use strict';
// R148: src/subscription-feed.js — YouTube RSS/Atom besleme ayrıştırıcısı
// + main.js subs:rssFeed işleyicisinin kaynak ratchet'i.
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { parseYouTubeFeed, mergeFeedVideos } = require('../src/subscription-feed');

let n = 0; const ok = (c, m) => { n += 1; assert(c, m); };

const FEED = `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns:yt="http://www.youtube.com/xml/schemas/2015" xmlns:media="http://search.yahoo.com/mrss/">
<yt:channelId>UCabcDEF1234567890ab</yt:channelId>
<title>Test Kanalı</title>
<entry><yt:videoId>vid001abc</yt:videoId><title>İlk &amp; Video</title>
<author><name>Test Kanalı</name></author>
<published>2026-09-20T10:00:00+00:00</published>
<media:group><media:title>İlk &amp; Video</media:title>
<media:statistics views="12345"/></media:group></entry>
<entry><yt:videoId>vid002xyz</yt:videoId><title><![CDATA[İkinci <b>video</b>]]></title>
<published>2026-09-24T10:00:00+00:00</published>
<media:group><media:statistics views="77"/></media:group></entry>
<entry><yt:videoId></yt:videoId><title>Kimliksiz</title></entry>
</feed>`;

{
  const r = parseYouTubeFeed(FEED);
  ok(r.ok === true, 'feed ayrıştı');
  ok(r.channel.authorId === 'UCabcDEF1234567890ab', 'channelId');
  ok(r.videos.length === 2, 'kimliksiz entry atlandı');
  ok(r.videos[0].videoId === 'vid001abc', 'videoId');
  ok(r.videos[0].title === 'İlk & Video', `entity decode: ${r.videos[0].title}`);
  ok(r.videos[0].viewCount === 12345, 'viewCount');
  ok(r.videos[1].title.includes('İkinci'), 'CDATA başlık');
  ok(r.videos[0].videoThumbnails[0].url.includes('i.ytimg.com/vi/vid001abc'), 'thumbnail');
  ok(r.videos[0].published > 0 && r.videos[1].published > r.videos[0].published, 'published ts');
}

{ const r = parseYouTubeFeed('<html><body>yok</body></html>'); ok(r.ok === false, 'xml değil'); }
{ const r = parseYouTubeFeed(''); ok(r.ok === false, 'boş'); }
{ const r = parseYouTubeFeed('<feed><entry><yt:videoId>;</yt:videoId></entry></feed>');
  ok(r.ok === true && r.videos.length === 0, 'geçersiz id atlanır'); }
{ const entry = '<entry><yt:videoId>vxxxxxxxxx</yt:videoId><title>t</title><published>2026-01-01T00:00:00Z</published></entry>';
  const huge = `<feed>${entry.repeat(400)}</feed>`;
  const r = parseYouTubeFeed(huge); ok(r.ok && r.videos.length === 200, 'FEED_ENTRY_MAX tavanı'); }

// R197: bozuk <published> dizesi NaN üretmemeli — saklanan değer sayısal 0'a düşer.
{
  const bad = `<feed><entry><yt:videoId>badvid000</yt:videoId><title>t</title>
    <published>gecersiz-tarih</published></entry></feed>`;
  const r = parseYouTubeFeed(bad);
  ok(r.ok === true && r.videos.length === 1, 'bozuk tarihli entry kabul edilir');
  ok(r.videos[0].published === 0, `NaN yerine 0: ${r.videos[0].published}`);
  ok(Number.isFinite(r.videos[0].published), 'published her zaman sonlu sayı');
  // NaN hiçbir koşulda kaydedilmesin — JSON dönüşümünde null zehirlemesi yok.
  ok(JSON.stringify(r.videos[0]).includes('"published":0'), 'JSON güvenli');
}

{
  const a = [{ videoId: 'a1', published: 100 }, { videoId: 'a2', published: 300 }];
  const b = [{ videoId: 'b1', published: 200 }, { videoId: 'a1', published: 999 }];
  const merged = mergeFeedVideos([a, b], 10);
  ok(merged.length === 3, 'dedupe');
  ok(merged[0].videoId === 'a2' && merged[2].videoId === 'a1', 'yeni→eski');
  ok(mergeFeedVideos([a], 1).length === 1, 'max kapağı');
}

// IPC ratchet: işleyici yetki kapağı + URL yalnız kimlikten kurulur.
{
  const src = fs.readFileSync(path.join(__dirname, '..', 'src', 'main.js'), 'utf8');
  const i = src.indexOf("ipcMain.handle('subs:rssFeed'");
  ok(i > 0, 'handler kayıtlı');
  const body = src.slice(i, i + 3200);
  ok(body.includes('authorizedBrowserSender(event)'), 'yetki kapağı ilk adım');
  ok(body.includes('https://www.youtube.com/feeds/videos.xml?channel_id='), 'sabit feed ucu');
  ok(!/feeds\/videos\.xml\?[^`]*\$\{(?!next\.authorId)/.test(body), 'UC dışı alan URL\'e girmez');
  ok(body.includes('256 * 1024') && body.includes('abort'), 'boyut + timeout sınırı');
  const pre = fs.readFileSync(path.join(__dirname, '..', 'src', 'preload.js'), 'utf8');
  ok(pre.includes("ipcRenderer.invoke('subs:rssFeed'"), 'preload köprüsü');
  // R180: gövde okuma akış-sınırlı olmalı — res.text() tamamını belleğe alırdı.
  ok(body.includes('readResponseBufferLimited'), 'sınırlı okuyucu kullanılıyor');
  ok(!/await res\.text\(\)/.test(body), 'sınırsız res.text() kalmadı');
}

// R180: readResponseBufferLimited — akışta boyut sınırı (yalan content-length).
{
  const src = fs.readFileSync(path.join(__dirname, '..', 'src', 'main.js'), 'utf8');
  const i = src.indexOf('function readResponseBufferLimited');
  ok(i > 0, 'sınırlı okuyucu tanımlı');
  const body = src.slice(i, i + 1400);
  ok(body.includes('getReader'), 'akış okuyucu');
  ok(body.includes('reader.cancel'), 'aşan akış iptal edilir');
  ok(body.includes('declared > limit'), 'content-length beyanı kontrol edilir');
}

console.log(`subscription-feed: ${n} kontrol geçti`);
