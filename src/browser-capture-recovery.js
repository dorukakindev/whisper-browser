'use strict';

const SUBTITLE_URL_RE = /(?:^|[\/?&_.=-])(?:caption|captions|subtitle|subtitles|timedtext|texttrack|webvtt|ttml|dfxp|srt|vtt|srv3|json3|altyazi|altyazilar)(?:[\/?&_.=-]|$)/i;

function captureBodyFingerprint(value) {
  const text = String(value || '');
  let first = 0x811c9dc5;
  let second = 0x85ebca6b;
  for (let index = 0; index < text.length; index++) {
    const code = text.charCodeAt(index);
    first = Math.imul(first ^ code, 0x01000193);
    second = Math.imul(second ^ code, 0x27d4eb2d);
  }
  return text.length.toString(36) + ':' + (first >>> 0).toString(36)
    + ':' + (second >>> 0).toString(36);
}

function shouldRetryCaptureResponseBody(candidate = {}) {
  const mime = String(candidate.mimeType || candidate.contentType || '').toLowerCase();
  const url = String(candidate.url || candidate.rawUrl || '');
  const value = mime + ' ' + url;
  if (/(?:mpegurl|dash\+xml|text\/vtt|application\/ttml|x-subrip|\.(?:vtt|srt|ttml|dfxp|srv3|json3|m3u8|mpd)(?:[?#]|$))/i
    .test(value)) return true;
  if (!SUBTITLE_URL_RE.test(url)) return false;
  return /(?:text|xml|json|octet-stream|unknown|application\/mp4|video\/mp4)/i
    .test(mime || 'unknown');
}

module.exports = {
  captureBodyFingerprint,
  shouldRetryCaptureResponseBody,
};
