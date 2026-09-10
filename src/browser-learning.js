const crypto = require('crypto');
const { PLAYBACK_POLICIES, playbackLearningAction } = require('./playback-policy');
const { normalizeTextAnchor } = require('./browser-library-tools');
const {
  normalizeResearchLinks,
  normalizeResearchTags,
  normalizeReviewState,
} = require('./browser-research-notebook');

function normalizeAnnotation(raw = {}) {
  const type = ['quote', 'word', 'note'].includes(raw.type) ? raw.type : 'note';
  const mediaId = String(raw.mediaId || '').slice(0, 240);
  const start = Math.max(0, Number(raw.start) || 0);
  const source = String(raw.source || '').trim().slice(0, 4000);
  const fingerprint = crypto.createHash('sha1').update(`${mediaId}|${start}|${type}|${source}`, 'utf8').digest('hex').slice(0, 16);
  const review = normalizeReviewState(raw);
  return {
    id: String(raw.id || `annotation:${fingerprint}`).slice(0, 180),
    type,
    mediaId,
    start,
    end: Math.max(start, Number(raw.end) || start),
    source,
    translation: String(raw.translation || '').trim().slice(0, 4000),
    note: String(raw.note || '').trim().slice(0, 8000),
    status: ['new', 'learning', 'known'].includes(raw.status) ? raw.status : 'new',
    screenshotRef: String(raw.screenshotRef || '').slice(0, 500),
    audioRef: String(raw.audioRef || '').slice(0, 500),
    createdAt: Number(raw.createdAt) || Date.now(),
    updatedAt: Number(raw.updatedAt) || Date.now(),
    mediaTitle: String(raw.mediaTitle || '').trim().slice(0, 500),
    mediaType: String(raw.mediaType || '').trim().slice(0, 40),
    mediaUrl: String(raw.mediaUrl || '').trim().slice(0, 2000),
    trackId: String(raw.trackId || '').trim().slice(0, 300),
    cueId: String(raw.cueId || '').trim().slice(0, 180),
    anchor: normalizeTextAnchor(raw.anchor),
    tags: normalizeResearchTags(raw.tags),
    links: normalizeResearchLinks(raw.links),
    ...review,
  };
}

function matchingLearningAnnotation(annotations, type, raw = {}) {
  const target = normalizeAnnotation({ ...raw, type });
  const rows = (Array.isArray(annotations) ? annotations : []).filter((item) =>
    item && item.type === target.type && item.mediaId === target.mediaId);
  const exact = rows.find((item) => item.id === target.id);
  if (exact) return exact;
  if (target.trackId && target.cueId) {
    const identified = rows.find((item) => item.trackId === target.trackId && item.cueId === target.cueId);
    if (identified) return identified;
  }
  const timed = rows.filter((item) => Math.abs(Number(item.start) - target.start) < .05);
  return timed.length === 1 ? timed[0] : null;
}

module.exports = {
  PLAYBACK_POLICIES,
  matchingLearningAnnotation,
  normalizeAnnotation,
  playbackLearningAction,
};
