'use strict';

const muxjs = require('mux.js');
const { createDecipheriv } = require('crypto');
const { parseHlsSegments, mp4VideoFragmentCompositionStart } = require('./browser-subtitles');

function normalizeCaptionText(value) {
  return String(value || '').replace(/\r\n?/g, '\n')
    .replace(/[ \t]+\n/g, '\n').replace(/\n[ \t]+/g, '\n')
    .replace(/[ \t]{2,}/g, ' ').trim();
}

function captionToCue(caption) {
  const start = Number(caption && caption.startTime);
  const rawEnd = Number(caption && caption.endTime);
  const text = normalizeCaptionText(caption && caption.text);
  if (!Number.isFinite(start) || start < 0 || !text) return null;
  return {
    start,
    end: Number.isFinite(rawEnd) && rawEnd > start ? rawEnd : start + 0.25,
    text,
    stream: String(caption.stream || '').toUpperCase(),
  };
}

class CeaCaptionDecoder {
  constructor() {
    this.ts = null;
    this.tsDiscontinuity = null;
    this.tsPending = [];
    this.mp4 = null;
    this.mp4Discontinuity = null;
    this.mp4TrackIds = [];
    this.mp4Timescales = {};
  }

  reset() {
    try { this.ts?.reset?.(); } catch (_) {}
    try { this.mp4?.reset?.(); } catch (_) {}
    this.ts = null;
    this.tsDiscontinuity = null;
    this.tsPending = [];
    this.mp4 = null;
    this.mp4Discontinuity = null;
    this.mp4TrackIds = [];
    this.mp4Timescales = {};
  }

  decodeTransportStream(buffer, options = {}) {
    const discontinuity = String(options.discontinuity ?? '0');
    if (!this.ts || this.tsDiscontinuity !== discontinuity) {
      this.ts = new muxjs.partial.Transmuxer({ keepOriginalTimestamps: true });
      this.tsPending = [];
      this.ts.on('caption', (caption) => this.tsPending.push(caption));
      this.tsDiscontinuity = discontinuity;
    }
    this.ts.push(new Uint8Array(Buffer.from(buffer || [])));
    this.ts.flush();
    return this.tsPending.splice(0).map(captionToCue).filter(Boolean);
  }

  decodeFragmentedMp4(buffer, initialization, options = {}) {
    const discontinuity = String(options.discontinuity ?? '0');
    if (!this.mp4 || this.mp4Discontinuity !== discontinuity) {
      this.mp4 = new muxjs.mp4.CaptionParser();
      this.mp4.init();
      this.mp4Discontinuity = discontinuity;
      this.mp4TrackIds = [];
      this.mp4Timescales = {};
    }
    if (initialization && Buffer.byteLength(initialization)) {
      const init = new Uint8Array(Buffer.from(initialization));
      this.mp4TrackIds = muxjs.mp4.probe.videoTrackIds(init);
      this.mp4Timescales = muxjs.mp4.probe.timescale(init);
    }
    if (!this.mp4TrackIds.length || !Object.keys(this.mp4Timescales).length) return [];
    this.mp4.clearParsedCaptions();
    const fragment = Buffer.from(buffer || []);
    const parsed = this.mp4.parse(new Uint8Array(fragment),
      this.mp4TrackIds, this.mp4Timescales);
    const cues = (parsed?.captions || []).map(captionToCue).filter(Boolean);
    const playlistStart = Number(options.start);
    const fragmentStart = mp4VideoFragmentCompositionStart(
      fragment, this.mp4TrackIds, this.mp4Timescales);
    if (!Number.isFinite(playlistStart) || !Number.isFinite(fragmentStart)) return cues;
    // CMAF tfdt can start at a non-zero decode epoch and the first displayed
    // sample can have an additional trun composition offset. CaptionParser
    // emits presentation timestamps, so anchor them to the first presented
    // video sample rather than to decode time before publishing.
    const offset = playlistStart - fragmentStart;
    return cues.map((cue) => ({ ...cue, start: Math.max(0, cue.start + offset),
      end: Math.max(0.001, cue.end + offset), timelineMapped: true }));
  }
}

function ceaUrlKey(value) {
  try {
    const url = new URL(String(value || ''));
    return `${url.origin}${url.pathname}`;
  } catch (_) {
    return String(value || '').split(/[?#]/)[0];
  }
}

function buildHlsCeaSegmentMatchers(playlistBody, playlistUrl, tracks = [], sourceUrl = '') {
  const streamTracks = (tracks || []).filter((track) => track?.supported !== false)
    .map((track) => ({ ...track, instreamId: String(track.instreamId || '').toUpperCase() }));
  if (!streamTracks.length) return [];
  return parseHlsSegments(playlistBody, playlistUrl).map((segment) => ({
    ...segment,
    urlKey: ceaUrlKey(segment.url),
    playlistUrl,
    sourceUrl: sourceUrl || playlistUrl,
    tracks: streamTracks,
  }));
}

function contentRangeOf(headers = {}) {
  for (const [name, value] of Object.entries(headers || {})) {
    if (String(name).toLowerCase() !== 'content-range') continue;
    const match = String(value).match(/bytes\s+(\d+)\s*-\s*(\d+)/i);
    if (match) return { start: Number(match[1]), end: Number(match[2]) };
  }
  return null;
}

function matchHlsCeaSegmentUrl(url, matchers = [], headers = null, request = null) {
  const key = ceaUrlKey(url);
  // EXT-X-BYTERANGE parçaları aynı URL'i paylaşır; ayırt edici bilgi yanıtın
  // Content-Range başlığı ya da isteğin Range başlığıdır. Content-Range her
  // zaman yetkilidir; istekteki Range ancak 206 yanıtında yanıt aralığının
  // yerine geçer — 200 alınmışsa sunucu Range'i yok saymıştır ve gövde tam
  // dosyadır, bir byte-range parçasına bağlanamaz.
  const responseRange = headers ? contentRangeOf(headers) : null;
  const requestRange = request && request.range ? request.range : null;
  const status = request ? Number(request.status) || 0 : 0;
  const range = responseRange || (status === 206 ? requestRange : null);
  const candidates = [];
  for (const matcher of matchers) {
    if (matcher?.urlKey === key) candidates.push(matcher);
  }
  if (!candidates.length) return null;
  if (range) {
    return candidates.find((matcher) => matcher.byteRange
        && matcher.byteRange.start === range.start && matcher.byteRange.end === range.end)
      || candidates.find((matcher) => !matcher.byteRange) || null;
  }
  const plain = candidates.filter((matcher) => !matcher.byteRange);
  const ranged = candidates.length - plain.length;
  if (!ranged) return candidates[candidates.length - 1];
  if (request && request.seen) {
    // İstek gözlendi: Range'siz istek veya 200 yanıt gövde tam dosyadır;
    // yalnız düz parça adayı kabul edilir. Aralık istenip yanıt aralığı
    // doğrulanamadıysa hangi parçanın geldiği bilinemez — kapalı kal.
    if (status !== 206 && (!requestRange || status)) {
      return plain.length ? plain[plain.length - 1] : null;
    }
    if (status !== 206) return null;
  }
  // Ne istek ne yanıt aralık bilgisi taşımıyorsa birden çok byte-range
  // adayından birini tahmin etmek altyazıları yanlış zaman çizgisine
  // yerleştirir. Rastgele son adaya bağlanmak yerine eşleşmeyi reddet.
  if (ranged > 1 || plain.length) return null;
  return candidates[0];
}

function ceaStreamMatchesInstream(instreamId, stream) {
  // Manifest INSTREAM-ID'si 608 izleri için CC1-CC4, 708 hizmetleri için
  // SERVICE1-63 taşır; mux.js çözülen cue'ları CC* ya da "cc708_<n>" olarak
  // etiketler. Düz karşılaştırma SERVICE1 ≠ CC708_1 olduğundan 708 izleri
  // sessizce düşüyordu — iki adlandırma burada eşlenir.
  const instream = String(instreamId || '').toUpperCase();
  const decoded = String(stream || '').toUpperCase();
  if (!instream || !decoded) return false;
  if (instream === decoded) return true;
  const service = instream.match(/^SERVICE(\d+)$/);
  if (service) return decoded === `CC708_${Number(service[1])}`;
  return false;
}

function isLikelyMpegTsResponse(response = {}) {
  const mime = String(response.mimeType || response.mime || response.contentType || '').toLowerCase();
  const url = String(response.url || '');
  return /(?:video|application)\/(?:mp2t|mpeg2?ts)/i.test(mime)
    || /\.(?:ts|m2ts)(?:[?#]|$)/i.test(url);
}

function hlsAes128Iv(sequence, explicitIv = '') {
  const text = String(explicitIv || '').replace(/^0x/i, '').replace(/[^0-9a-f]/gi, '');
  if (text) {
    const padded = text.padStart(32, '0').slice(-32);
    return Buffer.from(padded, 'hex');
  }
  const iv = Buffer.alloc(16);
  let value = BigInt(Math.max(0, Number(sequence) || 0));
  for (let index = 15; index >= 0 && value > 0n; index--) {
    iv[index] = Number(value & 0xffn);
    value >>= 8n;
  }
  return iv;
}

function decryptHlsAes128(buffer, key, sequence = 0, explicitIv = '') {
  const keyBytes = Buffer.from(key || []);
  if (keyBytes.length !== 16) throw new Error('HLS AES-128 anahtarı 16 bayt değil.');
  const decipher = createDecipheriv('aes-128-cbc', keyBytes, hlsAes128Iv(sequence, explicitIv));
  return Buffer.concat([decipher.update(Buffer.from(buffer || [])), decipher.final()]);
}

module.exports = {
  CeaCaptionDecoder,
  buildHlsCeaSegmentMatchers,
  captionToCue,
  ceaStreamMatchesInstream,
  ceaUrlKey,
  decryptHlsAes128,
  hlsAes128Iv,
  isLikelyMpegTsResponse,
  matchHlsCeaSegmentUrl,
};
