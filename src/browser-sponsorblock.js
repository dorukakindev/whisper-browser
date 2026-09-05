'use strict';

const crypto = require('crypto');

const SPONSORBLOCK_VERSION = 1;
const DEFAULT_CATEGORIES = ['sponsor'];
const KNOWN_CATEGORIES = ['sponsor', 'selfpromo', 'interaction', 'intro', 'outro', 'preview', 'music_offtopic'];

function youtubeVideoId(input) {
  try {
    const url = new URL(String(input || '').trim());
    const host = url.hostname.toLowerCase().replace(/^www\./, '');
    if (host === 'youtu.be') return (url.pathname.split('/').filter(Boolean)[0] || '').match(/^[A-Za-z0-9_-]{11}$/)?.[0] || '';
    if (!['youtube.com', 'm.youtube.com', 'music.youtube.com'].includes(host)) return '';
    if (url.pathname === '/watch') return (url.searchParams.get('v') || '').match(/^[A-Za-z0-9_-]{11}$/)?.[0] || '';
    const match = url.pathname.match(/^\/(?:shorts|embed|live)\/([A-Za-z0-9_-]{11})(?:$|\/)/);
    return match ? match[1] : '';
  } catch (_) { return ''; }
}

function hashPrefix(videoId, length = 4) {
  return crypto.createHash('sha256').update(String(videoId)).digest('hex').slice(0, Math.max(1, Math.min(8, length)));
}

function normalizeCategories(categories) {
  const allowed = new Set(KNOWN_CATEGORIES);
  return [...new Set((Array.isArray(categories) && categories.length ? categories : DEFAULT_CATEGORIES)
    .map(String).filter((category) => allowed.has(category)))].sort();
}

function extractHashSegments(payload, videoId) {
  if (!Array.isArray(payload)) return [];
  const record = payload.find((item) => String(item?.videoID || item?.videoId || '') === videoId);
  if (!record || !Array.isArray(record.segments)) return [];
  return record.segments.slice(0, 1000).map((segment) => ({ ...segment, videoID: videoId }));
}

function validateSegments(payload, videoId, duration = 0) {
  if (!Array.isArray(payload)) return { segments: [], invalid: 1, error: 'SponsorBlock yanıtı dizi değil.' };
  const segments = [];
  let invalid = 0;
  for (const item of payload) {
    const start = Number(item?.segment?.[0]);
    const end = Number(item?.segment?.[1]);
    const category = String(item?.category || '');
    const actionType = String(item?.actionType || 'skip');
    const uuid = String(item?.UUID || item?.uuid || '').slice(0, 180);
    const id = String(item?.videoID || item?.videoId || '');
    if (id !== videoId || !Number.isFinite(start) || !Number.isFinite(end) || start < 0 || end <= start
      || end - start > 2 * 60 * 60 || (Number.isFinite(duration) && duration > 0 && end > duration)
      || !normalizeCategories([category]).includes(category) || actionType !== 'skip') { invalid += 1; continue; }
    segments.push({ videoId, start, end, category, actionType, uuid, videoDuration: duration || null });
  }
  segments.sort((a, b) => a.start - b.start || a.end - b.end || a.uuid.localeCompare(b.uuid));
  return { segments, invalid, error: '' };
}

class SponsorBlockCache {
  constructor({ maxEntries = 64, ttlMs = 30 * 60 * 1000, negativeTtlMs = 2 * 60 * 1000 } = {}) {
    this.maxEntries = maxEntries; this.ttlMs = ttlMs; this.negativeTtlMs = negativeTtlMs; this.entries = new Map();
  }
  key(videoId, categories, actionType = 'skip') { return `${SPONSORBLOCK_VERSION}|${videoId}|${normalizeCategories(categories).join(',')}|${actionType}`; }
  get(videoId, categories, actionType = 'skip', now = Date.now()) {
    const key = this.key(videoId, categories, actionType); const entry = this.entries.get(key);
    if (!entry || now - entry.at > (entry.negative ? this.negativeTtlMs : this.ttlMs)) { this.entries.delete(key); return null; }
    this.entries.delete(key); this.entries.set(key, entry); return entry.value;
  }
  set(videoId, categories, value, { negative = false, now = Date.now(), actionType = 'skip' } = {}) {
    const key = this.key(videoId, categories, actionType); this.entries.delete(key); this.entries.set(key, { value, negative, at: now });
    while (this.entries.size > this.maxEntries) this.entries.delete(this.entries.keys().next().value);
  }
}

module.exports = { SPONSORBLOCK_VERSION, DEFAULT_CATEGORIES, KNOWN_CATEGORIES, youtubeVideoId, hashPrefix, normalizeCategories, extractHashSegments, validateSegments, SponsorBlockCache };
