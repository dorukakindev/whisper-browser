#!/usr/bin/env node
// Kuyruk-50 madde 23 — capture tekrar oynatma düzeneği.
// HLS/DASH/TTML/CEA yakalama olaylarını kişisel veri içermeyen JSONL kayıtlarla
// gerçek parser/birleştirici modülleri üzerinden yeniden oynatır; sıra
// bozulması, eksik segment ve tekrar teslimlerde sonucu deterministik
// karşılaştırır. Ağ erişimi yoktur.
//
// Kayıt biçimi (satır başına JSON):
//   {"type":"playlist","streamKey":"…","url":"https://capture-fixture.local/…","mimeType":"application/vnd.apple.mpegurl","body":"#EXTM3U…"}
//   {"type":"segment","streamKey":"…","url":"https://capture-fixture.local/…","mimeType":"text/vtt","body":"WEBVTT…"}
//   {"type":"payload","streamKey":"…","mimeType":"application/ttml+xml","body":"<tt…"}
//
// Mahremiyet kapısı: url alanları yalnız `capture-fixture.local` (veya --allow-host)
// altında olabilir; userinfo, query parametresi ve fragment reddedilir. Bu kapı
// gerçek trafik kayıtlarının süzülmemiş haliyle araçta açılmasını engeller.

import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const {
  parseSubtitlePayload, parseHlsSegments, mergeBrowserStreamCues, normalizeCues,
} = require('../src/browser-subtitles.js');

const FIXTURE_HOST = 'capture-fixture.local';
const MAX_BODY = 12 * 1024 * 1024;
const MAX_EVENTS = 20000;

export function sanitizeCaptureEvent(raw, index, { allowHosts = [FIXTURE_HOST] } = {}) {
  if (!raw || typeof raw !== 'object') throw new Error(`olay ${index}: nesne değil`);
  const type = String(raw.type || '');
  if (!['playlist', 'segment', 'payload'].includes(type)) {
    throw new Error(`olay ${index}: bilinmeyen type '${type}'`);
  }
  const streamKey = String(raw.streamKey || '').slice(0, 180);
  const mimeType = String(raw.mimeType || '').slice(0, 80);
  const body = String(raw.body || '');
  if (body.length > MAX_BODY) throw new Error(`olay ${index}: gövde 12MB sınırını aşıyor`);
  const url = String(raw.url || '');
  if (url) {
    let parsed;
    try { parsed = new URL(url); } catch { throw new Error(`olay ${index}: bozuk url`); }
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
      throw new Error(`olay ${index}: http/https dışı şema`);
    }
    if (!allowHosts.includes(parsed.hostname.toLowerCase())) {
      throw new Error(`olay ${index}: fixture dışı alan '${parsed.hostname}' — kayıt anonimleştirilmemiş`);
    }
    if (parsed.username || parsed.password) throw new Error(`olay ${index}: userinfo içeriyor`);
    if (parsed.search || parsed.hash) throw new Error(`olay ${index}: query/fragment kişisel veri taşıyabilir`);
  }
  return { type, streamKey, url, mimeType, body, index };
}

export function loadCaptureRecording(text, options = {}) {
  const events = String(text || '').split(/\r?\n/)
    .map((line) => line.trim()).filter(Boolean)
    .slice(0, MAX_EVENTS + 1)
    .map((line, index) => {
      let parsed;
      try { parsed = JSON.parse(line); } catch (e) { throw new Error(`satır ${index + 1}: JSON hatası — ${e.message}`); }
      return sanitizeCaptureEvent(parsed, index, options);
    });
  if (events.length > MAX_EVENTS) throw new Error(`kayıt ${MAX_EVENTS} olayı aşıyor`);
  return events;
}

// Deterministik PRNG (mulberry32) — aynı tohum aynı karıştırmayı üretir.
function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function scrambleEvents(events, mode = 'inorder', { seed = 1, drop = [] } = {}) {
  const dropSet = new Set((Array.isArray(drop) ? drop : [drop]).map((n) => Math.trunc(Number(n))));
  let list = events.filter((event) => !dropSet.has(event.index));
  if (mode === 'shuffle') {
    const rand = mulberry32(seed);
    for (let i = list.length - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      [list[i], list[j]] = [list[j], list[i]];
    }
  } else if (mode === 'dup') {
    const doubled = [];
    for (const event of list) { doubled.push(event, event); }
    list = doubled;
  } else if (mode !== 'inorder') {
    throw new Error(`bilinmeyen mod '${mode}'`);
  }
  return list;
}

function canonCue(cue) {
  return {
    start: Math.round(Number(cue.start) * 1000) / 1000,
    end: Math.round(Number(cue.end) * 1000) / 1000,
    text: String(cue.text || '').replace(/\s+/g, ' ').trim(),
  };
}

export function replayCaptureRecording(events, { mode = 'inorder', seed = 1, drop = [] } = {}) {
  const delivered = scrambleEvents(events, mode, { seed, drop });
  const streams = new Map();
  const playlistSegments = new Map();
  const skipped = [];
  for (const event of delivered) {
    const key = event.streamKey || '(default)';
    if (event.type === 'playlist') {
      const segments = parseHlsSegments(event.body, event.url) || [];
      playlistSegments.set(key, (playlistSegments.get(key) || []).concat(
        segments.map((seg) => seg.uri || seg.url || '')));
      continue;
    }
    const { cues, format } = parseSubtitlePayload(event.body, event.mimeType, event.url);
    if (!cues.length) { skipped.push({ index: event.index, reason: 'parse-empty', format }); continue; }
    const previous = streams.get(key) || [];
    streams.set(key, mergeBrowserStreamCues(previous, cues));
  }
  const all = normalizeCues([...streams.values()].flat());
  const canonical = all.map(canonCue).sort((a, b) => a.start - b.start || a.end - b.end || a.text.localeCompare(b.text));
  const digest = createHash('sha256').update(JSON.stringify(canonical), 'utf8').digest('hex');
  const multiset = new Map();
  for (const cue of canonical) {
    const key = `${cue.start}|${cue.end}|${cue.text}`;
    multiset.set(key, (multiset.get(key) || 0) + 1);
  }
  return {
    cues: canonical, digest, multiset,
    streams: [...streams.keys()].sort(),
    playlistSegments,
    delivered: delivered.length, skipped,
  };
}

// İki koşunun kanonik eşitliği + çok-küme farkı (eksik/fazla cue listesi).
export function compareReplayRuns(base, other, limit = 20) {
  const missing = [], extra = [];
  const seen = new Map();
  for (const cue of other.cues) {
    const key = `${cue.start}|${cue.end}|${cue.text}`;
    seen.set(key, (seen.get(key) || 0) + 1);
  }
  for (const [key, count] of base.multiset) {
    const have = seen.get(key) || 0;
    if (have < count) for (let i = 0; i < count - have && missing.length < limit; i++) missing.push(key);
    seen.delete(key);
  }
  for (const [key, count] of seen) {
    for (let i = 0; i < count && extra.length < limit; i++) extra.push(key);
  }
  return { identical: missing.length === 0 && extra.length === 0, missing, extra };
}

export function replaySuite(events, { seeds = [1, 7, 42] } = {}) {
  const base = replayCaptureRecording(events, { mode: 'inorder' });
  const dup = replayCaptureRecording(events, { mode: 'dup' });
  const shuffles = seeds.map((seed) => ({
    seed, result: replayCaptureRecording(events, { mode: 'shuffle', seed }),
  }));
  return {
    base,
    dup: { result: dup, diff: compareReplayRuns(base, dup) },
    shuffles: shuffles.map(({ seed, result }) => ({ seed, digest: result.digest, diff: compareReplayRuns(base, result) })),
    playlistCoverage: [...base.playlistSegments.entries()].map(([stream, uris]) => ({
      stream, declared: uris.length,
    })),
  };
}

function cli() {
  const [file, mode = 'suite'] = process.argv.slice(2);
  if (!file) {
    console.error('kullanım: node tools/capture-replay.mjs <kayıt.jsonl> [inorder|shuffle|dup|suite|drop:<i,j>]');
    process.exit(2);
  }
  const events = loadCaptureRecording(readFileSync(file, 'utf8'));
  if (mode === 'suite') {
    const suite = replaySuite(events);
    console.log(JSON.stringify({
      digest: suite.base.digest, cues: suite.base.cues.length,
      dupStable: suite.dup.diff.identical,
      shuffles: suite.shuffles.map((s) => ({ seed: s.seed, identical: s.diff.identical, missing: s.diff.missing.length, extra: s.diff.extra.length })),
      skipped: suite.base.skipped,
    }, null, 2));
    return;
  }
  const drop = mode.startsWith('drop:') ? mode.slice(5).split(',').map(Number) : [];
  const run = replayCaptureRecording(events, { mode: drop.length ? 'inorder' : mode, drop });
  console.log(JSON.stringify({ digest: run.digest, cues: run.cues.length, skipped: run.skipped }, null, 2));
}

if (process.argv[1] && import.meta.url === `file://${process.argv[1]}`) cli();
