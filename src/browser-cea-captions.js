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

function matchHlsCeaSegmentUrl(url, matchers = []) {
  const key = ceaUrlKey(url);
  for (let index = matchers.length - 1; index >= 0; index--) {
    if (matchers[index]?.urlKey === key) return matchers[index];
  }
  return null;
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
  ceaUrlKey,
  decryptHlsAes128,
  hlsAes128Iv,
  isLikelyMpegTsResponse,
  matchHlsCeaSegmentUrl,
};
