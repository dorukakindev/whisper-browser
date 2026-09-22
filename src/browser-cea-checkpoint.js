'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');

const VERSION = 1;
const MAX_BYTES = 2 * 1024 * 1024;
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

function checkpointId(sourceUrl, mediaId, tracks = []) {
  let source = '';
  try {
    const url = new URL(String(sourceUrl || ''));
    if (!['https:', 'http:'].includes(url.protocol)) return '';
    // Signed query strings must never enter the filename or persisted payload.
    source = `${url.origin}${url.pathname}`;
  } catch (_) { return ''; }
  const channels = tracks.map((track) => String(track?.instreamId || '').toUpperCase())
    .filter(Boolean).sort().join(',');
  if (!channels || !mediaId) return '';
  return createHash('sha256').update(`${source}\n${mediaId}\n${channels}`).digest('hex');
}

function checkpointPath(root, id) {
  if (!/^[a-f0-9]{64}$/.test(String(id || ''))) throw new Error('Invalid CEA checkpoint identity');
  return path.join(root, `cea-${id}.json`);
}

function normalizeCue(cue) {
  const start = Number(cue?.start), end = Number(cue?.end);
  const text = String(cue?.text || '').slice(0, 2000);
  if (!Number.isFinite(start) || !Number.isFinite(end) || start < 0 || end <= start || !text.trim()) return null;
  const out = { start, end, text,
    sequence: Number.isFinite(Number(cue.sequence)) ? Number(cue.sequence) : null,
    discontinuity: Number.isFinite(Number(cue.discontinuity)) ? Number(cue.discontinuity) : null };
  // Sunum kimliği alanları korunmazsa checkpoint'ten dönen cue, decode'dan
  // gelen aynı cue ile birleşemeyip ikiz satır üretiyordu (B83-01).
  // Boş değerler anahtar üretmez — normalize sözleşmesi alan-düşürme
  // davranışını korur.
  const captionMode = String(cue.captionMode || cue.mode || cue.sourceMode || '').trim().slice(0, 24);
  if (captionMode) out.captionMode = captionMode;
  const speaker = String(cue.speaker || '').trim().slice(0, 120);
  if (speaker) out.speaker = speaker;
  const language = String(cue.language || '').trim().slice(0, 24);
  if (language) out.language = language;
  if (cue.provenance && typeof cue.provenance === 'object' && cue.provenance.streamKey) {
    out.provenance = { streamKey: String(cue.provenance.streamKey).slice(0, 200) };
  }
  return out;
}

function normalizeTracks(tracks) {
  if (!Array.isArray(tracks)) return [];
  return tracks.slice(0, 8).map((entry) => ({
    instreamId: String(entry?.instreamId || '').replace(/[^A-Z0-9_]/gi, '').slice(0, 20),
    cues: (Array.isArray(entry?.cues) ? entry.cues : []).slice(0, 20000)
      .map(normalizeCue).filter(Boolean),
  })).filter((entry) => entry.instreamId && entry.cues.length);
}

function saveCeaCheckpoint(root, id, tracks, progress = 0, now = Date.now(), fsImpl = fs) {
  const records = normalizeTracks(tracks);
  if (!records.length) return false;
  const target = checkpointPath(root, id);
  const payload = JSON.stringify({ version: VERSION, id, updatedAt: now,
    completedSegments: Math.max(0, Math.floor(Number(progress) || 0)), tracks: records });
  if (Buffer.byteLength(payload) > MAX_BYTES) return false;
  fsImpl.mkdirSync(root, { recursive: true });
  const temporary = `${target}.${process.pid}.tmp`;
  try {
    fsImpl.writeFileSync(temporary, payload, { encoding: 'utf8', flag: 'w' });
    fsImpl.renameSync(temporary, target);
  } catch (error) {
    try { fsImpl.unlinkSync(temporary); } catch (_) {}
    throw error;
  }
  return true;
}

function loadCeaCheckpoint(root, id, now = Date.now(), fsImpl = fs) {
  const target = checkpointPath(root, id);
  let data;
  try {
    if (fsImpl.statSync(target).size > MAX_BYTES) return null;
    data = JSON.parse(fsImpl.readFileSync(target, 'utf8'));
  } catch (_) { return null; }
  if (data?.version !== VERSION || data.id !== id
      || !Number.isFinite(Number(data.updatedAt))
      || now - Number(data.updatedAt) < 0
      || now - Number(data.updatedAt) > MAX_AGE_MS) return null;
  const tracks = normalizeTracks(data.tracks);
  return tracks.length ? { tracks,
    completedSegments: Math.max(0, Math.floor(Number(data.completedSegments) || 0)) } : null;
}

function clearCeaCheckpoint(root, id) {
  try { fs.unlinkSync(checkpointPath(root, id)); return true; }
  catch (error) { if (error?.code === 'ENOENT') return false; throw error; }
}

module.exports = { checkpointId, checkpointPath, saveCeaCheckpoint,
  loadCeaCheckpoint, clearCeaCheckpoint };
