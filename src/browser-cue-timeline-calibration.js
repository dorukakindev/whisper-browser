'use strict';

function normalizeTimelineText(value) {
  return String(value || '').normalize('NFKC').toLocaleLowerCase('en-US')
    .replace(/<[^>]*>/g, ' ')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .replace(/\s+/g, ' ').trim();
}

function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

function calibrateCueTimeline(referenceCues = [], candidateCues = [], options = {}) {
  const maxOffset = Math.max(1, Number(options.maxOffsetSeconds) || 120);
  const tolerance = Math.max(0.05, Number(options.toleranceSeconds) || 0.4);
  const candidateByText = new Map();
  for (const cue of candidateCues || []) {
    const text = normalizeTimelineText(cue?.text);
    const start = Number(cue?.start);
    if (!text || !Number.isFinite(start)) continue;
    const list = candidateByText.get(text) || [];
    list.push({ cue, text, start });
    candidateByText.set(text, list);
  }
  const samples = [];
  for (const cue of referenceCues || []) {
    const text = normalizeTimelineText(cue?.text);
    const start = Number(cue?.start);
    const matches = candidateByText.get(text) || [];
    if (!text || !Number.isFinite(start) || matches.length !== 1) continue;
    const offset = start - matches[0].start;
    if (Math.abs(offset) <= maxOffset) samples.push({ offset, textLength: text.length });
  }
  if (!samples.length) return { accepted: false, reason: 'no-unique-match', matches: 0 };
  const center = median(samples.map((item) => item.offset));
  const inliers = samples.filter((item) => Math.abs(item.offset - center) <= tolerance);
  const strongSingle = inliers.length === 1 && inliers[0].textLength >= 24;
  if (inliers.length < 2 && !strongSingle) {
    return { accepted: false, reason: 'insufficient-evidence', matches: inliers.length };
  }
  const offsetSeconds = Math.round(median(inliers.map((item) => item.offset)) * 1000) / 1000;
  const spreadSeconds = Math.round(Math.max(...inliers.map((item) => Math.abs(item.offset - offsetSeconds))) * 1000) / 1000;
  return {
    accepted: true,
    offsetSeconds,
    matches: inliers.length,
    spreadSeconds,
    confidence: inliers.length >= 3 ? 'high' : 'medium',
  };
}

function shiftCueTimeline(cues = [], offsetSeconds = 0) {
  const offset = Number(offsetSeconds);
  if (!Number.isFinite(offset) || Math.abs(offset) < 0.001) return (cues || []).map((cue) => ({ ...cue }));
  return (cues || []).map((cue) => {
    const start = Math.max(0, Number(cue.start) + offset);
    const end = Math.max(start + 0.001, Number(cue.end) + offset);
    return { ...cue, start, end, timelineCalibrated: true };
  });
}

function matchingReferenceCues(tracks = [], target = {}) {
  const language = String(target.language || '').toLowerCase();
  const labels = new Set([target.label, target.instreamId]
    .map((value) => String(value || '').toLowerCase().trim()).filter(Boolean));
  const compatible = (tracks || []).filter((track) => {
    const trackLanguage = String(track?.language || '').toLowerCase();
    if (language && trackLanguage && language !== trackLanguage) return false;
    const trackLabels = [track?.label, track?.trackId]
      .map((value) => String(value || '').toLowerCase().trim()).filter(Boolean);
    return !labels.size || !trackLabels.length || trackLabels.some((value) => labels.has(value));
  });
  const selected = compatible.length ? compatible : (tracks || []).filter((track) => {
    const trackLanguage = String(track?.language || '').toLowerCase();
    return !language || !trackLanguage || language === trackLanguage;
  });
  return selected.flatMap((track) => Array.isArray(track?.cues) ? track.cues : []);
}

module.exports = {
  calibrateCueTimeline,
  matchingReferenceCues,
  normalizeTimelineText,
  shiftCueTimeline,
};
