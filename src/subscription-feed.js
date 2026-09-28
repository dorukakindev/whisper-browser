'use strict';
// YouTube kanal RSS/Atom beslemesi (feeds/videos.xml) — bağımsız ayrıştırıcı.
// Yerel aboneliklerin son videolarını API anahtarı/oturum olmadan getirir.
// Amaçlı sınırlar: yalnız metin ayrıştırma (DOM yok), alan başına uzunluk
// kapağı, besleme başına girdi tavanı — kötü niyetli/devasa XML şişmez.
const FEED_ENTRY_MAX = 200;
const FIELD_MAX = 4000;

function decodeXmlEntities(value) {
  return String(value || '')
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'")
    .replace(/&amp;/g, '&');
}

// `<entry>…</entry>` içinden isimli etiketin ilk eşleşmesini al. İsim alanı
// öneki (yt:, media:) olabilir — `tag` tam ad veya sade son-parça desenidir.
function entryField(entry, pattern) {
  const m = entry.match(pattern);
  return m ? decodeXmlEntities(m[1] || '').trim().slice(0, FIELD_MAX) : '';
}

function parseYouTubeFeed(xml) {
  const text = String(xml || '');
  if (!/<feed[\s>]|<rss[\s>]|<entry[\s>]/i.test(text)) {
    return { ok: false, error: 'feed-xml-degisil' };
  }
  const channelName = entryField(text.slice(0, 4000),
    /<title[^>]*>([\s\S]*?)<\/title>/i);
  const channelId = entryField(text.slice(0, 4000),
    /<yt:channelId[^>]*>([\s\S]*?)<\/yt:channelId>/i)
    || entryField(text.slice(0, 4000), /<channelId[^>]*>([\s\S]*?)<\/channelId>/i);
  const videos = [];
  const entries = text.match(/<entry\b[\s\S]*?<\/entry>/gi) || [];
  for (const entry of entries.slice(0, FEED_ENTRY_MAX)) {
    const videoId = entryField(entry, /<yt:videoId[^>]*>([\s\S]*?)<\/yt:videoId>/i)
      || entryField(entry, /<videoId[^>]*>([\s\S]*?)<\/videoId>/i);
    if (!/^[\w-]{6,20}$/.test(videoId)) continue;
    const title = entryField(entry, /<media:title[^>]*>([\s\S]*?)<\/media:title>/i)
      || entryField(entry, /<title[^>]*>([\s\S]*?)<\/title>/i);
    const author = entryField(entry, /<name[^>]*>([\s\S]*?)<\/name>/i) || channelName;
    const published = entryField(entry, /<published[^>]*>([\s\S]*?)<\/published>/i);
    const views = entryField(entry, /media:statistics[^>]*views="(\d+)"/i);
    // Bozuk tarih dizesi Date.parse → NaN üretir; IPC'de null'a düşüp sıralama
    // karşılaştırmasını kirletir — sayısal olmayan hiçbir değer saklanmasın.
    const parsedDate = Date.parse(published);
    videos.push({
      videoId,
      title,
      author,
      authorId: channelId,
      published: Number.isFinite(parsedDate) ? parsedDate / 1000 : 0,
      viewCount: Number(views) || 0,
      lengthSeconds: 0,
      videoThumbnails: [{ url: `https://i.ytimg.com/vi/${videoId}/mqdefault.jpg`, quality: 'medium' }],
    });
  }
  return { ok: true, channel: { authorId: channelId, author: channelName }, videos };
}

// Kanal beslemelerini tek akışta birleştirir; yeni→eski sıralar.
function mergeFeedVideos(listOfVideos, max = 60) {
  const seen = new Set();
  const out = [];
  for (const videos of listOfVideos) {
    for (const v of videos || []) {
      if (!v || !v.videoId || seen.has(v.videoId)) continue;
      seen.add(v.videoId);
      out.push(v);
    }
  }
  out.sort((a, b) => (b.published || 0) - (a.published || 0));
  return out.slice(0, max);
}

module.exports = { parseYouTubeFeed, mergeFeedVideos, FEED_ENTRY_MAX };
