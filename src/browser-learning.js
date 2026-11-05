const crypto = require('crypto');
const { PLAYBACK_POLICIES, playbackLearningAction } = require('./playback-policy');
const { normalizeTextAnchor } = require('./browser-library-tools');
const { canonicalWatchKey } = require('./watch-library-store');
const {
  normalizeResearchLinks,
  normalizeResearchTags,
  normalizeReviewState,
} = require('./browser-research-notebook');

function normalizeAnnotationBinding(raw) {
  if(!raw||typeof raw!=='object'||Array.isArray(raw))return null;
  const result={};
  for(const key of ['episodeIdentity','revision','resource','mime','declaredLength','etag','length','sha256','fingerprintStatus']){
    const value=raw[key];if(typeof value==='string')result[key]=value.slice(0,2000);else if(typeof value==='number'&&Number.isFinite(value))result[key]=value;
  }
  // Resource identities never retain signed query strings or URL credentials.
  if(result.resource){try{const url=new URL(result.resource);result.resource=url.protocol+'//'+url.host+url.pathname;}catch{result.resource='unknown';}}
  result.probe='unknown';
  return result;
}

function normalizeAnnotation(raw = {}) {
  const type = ['quote', 'word', 'note'].includes(raw.type) ? raw.type : 'note';
  const rawMediaId = String(raw.mediaId || '').slice(0, 240);
  const mediaId = rawMediaId.startsWith('file:') ? canonicalWatchKey(rawMediaId) : rawMediaId;
  const timed = raw.timed !== false;
  const start = timed ? Math.max(0, Number(raw.start) || 0) : null;
  const source = String(raw.source || '').trim().slice(0, 4000);
  const identity = `${mediaId}|${start}|${type}|${source}` + (raw.mediaType === 'podcast' && raw.sourceVersion ? `|podcast-version:${String(raw.sourceVersion).slice(0,500)}` : '');
  const trackIdentity = raw.trackId || raw.cueId ? JSON.stringify([String(raw.trackId || ''), String(raw.cueId || '')]) : '';
  const anchor = normalizeTextAnchor(raw.anchor);
  const fingerprint = crypto.createHash('sha1').update(identity + trackIdentity + (anchor ? JSON.stringify(anchor) : ''), 'utf8').digest('hex').slice(0, 16);
  const review = normalizeReviewState(raw);
  return {
    id: String(raw.id || `annotation:${fingerprint}`).slice(0, 180),
    type,
    mediaId,
    timed,
    start,
    end: timed ? Math.max(start, Number(raw.end) || start) : null,
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
    sourceVersion: String(raw.sourceVersion || '').slice(0, 500),
    episodeIdentity: String(raw.episodeIdentity || '').slice(0, 500),
    playbackOwner: String(raw.playbackOwner || '').slice(0, 40),
    sourceEntryId: String(raw.sourceEntryId || '').slice(0, 240),
    sourceBinding: normalizeAnnotationBinding(raw.sourceBinding),
    trackId: String(raw.trackId || '').trim().slice(0, 300),
    cueId: String(raw.cueId || '').trim().slice(0, 180),
    anchor,
    tags: normalizeResearchTags(raw.tags),
    links: normalizeResearchLinks(raw.links),
    ...review,
  };
}

function matchingLearningAnnotation(annotations, type, raw = {}) {
  const target = normalizeAnnotation({ ...raw, type });
  const rows = (Array.isArray(annotations) ? annotations : []).filter((item) =>
    item && item.type === target.type && item.mediaId === target.mediaId
    && !(target.trackId && item.trackId && item.trackId !== target.trackId)
    && !(target.cueId && item.cueId && item.cueId !== target.cueId));
  const exact = rows.find((item) => item.id === target.id);
  if (exact) return exact;
  if (target.anchor) {
    const signature=JSON.stringify(target.anchor);
    const anchored=rows.filter(item=>JSON.stringify(normalizeTextAnchor(item.anchor))===signature);
    return anchored.length===1 ? anchored[0] : null;
  }
  if (target.trackId && target.cueId) {
    const identified = rows.find((item) => item.trackId === target.trackId && item.cueId === target.cueId);
    if (identified) return identified;
  }
  const timed = rows.filter((item) => item.timed !== false && target.timed !== false && !item.anchor && Math.abs(Number(item.start) - target.start) < .05);
  return timed.length === 1 ? timed[0] : null;
}

module.exports = {
  PLAYBACK_POLICIES,
  matchingLearningAnnotation,
  normalizeAnnotation,
  playbackLearningAction,
};
