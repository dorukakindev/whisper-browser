const crypto = require('crypto');
const { PLAYBACK_POLICIES, playbackLearningAction } = require('./playback-policy');

function normalizeAnnotation(raw = {}) {
  const type = ['quote', 'word', 'note'].includes(raw.type) ? raw.type : 'note';
  const mediaId = String(raw.mediaId || '').slice(0, 240);
  const start = Math.max(0, Number(raw.start) || 0);
  const source = String(raw.source || '').trim().slice(0, 4000);
  const fingerprint = crypto.createHash('sha1').update(`${mediaId}|${start}|${type}|${source}`, 'utf8').digest('hex').slice(0, 16);
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
  };
}

module.exports = {
  PLAYBACK_POLICIES,
  normalizeAnnotation,
  playbackLearningAction,
};
