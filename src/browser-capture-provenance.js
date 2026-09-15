'use strict';

const { redactCaptureUrl } = require('./browser-adapters');

function finite(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function normalizeCueProvenance(value = {}) {
  return {
    layer: String(value.layer || 'unknown').slice(0, 40),
    streamKey: String(value.streamKey || '').slice(0, 180),
    segmentUrl: redactCaptureUrl(value.segmentUrl || ''),
    epoch: String(value.epoch || '').slice(0, 180),
    discontinuity: Math.max(0, Math.trunc(finite(value.discontinuity))),
    sequence: Math.trunc(finite(value.sequence, -1)),
    automatic: value.automatic === true,
    translatedByService: value.translatedByService === true,
  };
}

function mergeCoverageRanges(ranges = [], tolerance = .05) {
  const sorted = (Array.isArray(ranges) ? ranges : []).map((range) => ({
    start: Math.max(0, finite(range.start)), end: Math.max(0, finite(range.end)),
  })).filter((range) => range.end > range.start).sort((a, b) => a.start - b.start || a.end - b.end);
  const output = [];
  for (const range of sorted) {
    const previous = output[output.length - 1];
    if (previous && range.start <= previous.end + Math.max(0, finite(tolerance))) {
      previous.end = Math.max(previous.end, range.end);
    } else output.push({ ...range });
  }
  return output;
}

function coverageGaps(ranges = []) {
  const merged = mergeCoverageRanges(ranges);
  const gaps = [];
  for (let index = 1; index < merged.length; index++) {
    if (merged[index].start > merged[index - 1].end) {
      gaps.push({ start: merged[index - 1].end, end: merged[index].start });
    }
  }
  return gaps;
}

function subtractCoverageRanges(expected = [], covered = [], tolerance = .05) {
  const wanted = mergeCoverageRanges(expected, tolerance);
  const have = mergeCoverageRanges(covered, tolerance);
  const missing = [];
  for (const range of wanted) {
    let cursor = range.start;
    for (const current of have) {
      if (current.end <= cursor + tolerance || current.start >= range.end - tolerance) continue;
      if (current.start > cursor + tolerance) missing.push({ start: cursor, end: Math.min(current.start, range.end) });
      cursor = Math.max(cursor, current.end);
      if (cursor >= range.end - tolerance) break;
    }
    if (cursor < range.end - tolerance) missing.push({ start: cursor, end: range.end });
  }
  return mergeCoverageRanges(missing, tolerance);
}
class CaptureCoverageMap {
  constructor(limit = 64) { this.limit = Math.max(1, Number(limit) || 64); this.streams = new Map(); }
  entry(key) {
    const safeKey = String(key || '').slice(0, 180);
    if (!this.streams.has(safeKey)) this.streams.set(safeKey, {
      ranges: [], expectedRanges: [], cueRanges: [], failures: [],
    });
    while (this.streams.size > this.limit) this.streams.delete(this.streams.keys().next().value);
    return this.streams.get(safeKey);
  }
  expect(key, segments = []) {
    const entry = this.entry(key);
    const additions = (Array.isArray(segments) ? segments : []).map((segment) => ({
      start: finite(segment?.start),
      end: finite(segment?.end, finite(segment?.start) + finite(segment?.duration)),
    })).filter((range) => range.end > range.start);
    entry.expectedRanges = mergeCoverageRanges([...entry.expectedRanges, ...additions]);
    return this.snapshot(key);
  }
  observeCues(key, cues = []) {
    const entry = this.entry(key);
    const additions = (Array.isArray(cues) ? cues : []).map((cue) => ({
      start: finite(cue?.start), end: finite(cue?.end),
    })).filter((range) => range.end > range.start);
    entry.cueRanges = mergeCoverageRanges([...entry.cueRanges, ...additions]);
    return this.snapshot(key);
  }
  success(key, segment = {}) {
    const entry = this.entry(key);
    entry.ranges = mergeCoverageRanges([...entry.ranges, {
      start: finite(segment.start), end: finite(segment.end, finite(segment.start) + finite(segment.duration)),
    }]);
    return this.snapshot(key);
  }
  failure(key, segment = {}, error = '') {
    const entry = this.entry(key);
    entry.failures.push({ start: finite(segment.start), end: finite(segment.end,
      finite(segment.start) + finite(segment.duration)), sequence: Math.trunc(finite(segment.sequence, -1)),
      discontinuity: Math.max(0, Math.trunc(finite(segment.discontinuity))),
      url: redactCaptureUrl(segment.url || ''), error: String(error || 'segment-failed').slice(0, 120) });
    entry.failures = entry.failures.slice(-100);
    return this.snapshot(key);
  }
  snapshot(onlyKey = null) {
    const rows = [];
    for (const [key, entry] of this.streams) {
      if (onlyKey !== null && key !== String(onlyKey).slice(0, 180)) continue;
      const ranges = mergeCoverageRanges(entry.ranges);
      const expectedRanges = mergeCoverageRanges(entry.expectedRanges);
      const cueRanges = mergeCoverageRanges(entry.cueRanges);
      rows.push({ streamKey: key, ranges, expectedRanges,
        missingRanges: subtractCoverageRanges(expectedRanges, ranges), gaps: coverageGaps(ranges),
        cueRanges, cueGaps: coverageGaps(cueRanges), failures: entry.failures.slice(-20),
        coveredSeconds: ranges.reduce((sum, range) => sum + range.end - range.start, 0) });
    }
    return rows;
  }
}

module.exports = { CaptureCoverageMap, coverageGaps, mergeCoverageRanges, normalizeCueProvenance, subtractCoverageRanges };
