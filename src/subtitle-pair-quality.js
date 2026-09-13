'use strict';

const crypto = require('crypto');
const { decodeSubtitleBuffer, parseSubtitlePayload } = require('./browser-subtitles');
const { normalizeText, translationMeaningIssues } = require('./subtitle-sentence-layout');

const timestampKey = cue => `${Math.round(Number(cue.start) * 1000)}:${Math.round(Number(cue.end) * 1000)}`;
const echo = (source, target) => {
  const left = normalizeText(source).toLocaleLowerCase('und');
  const right = normalizeText(target).toLocaleLowerCase('und');
  return left.length >= 12 && left === right && /\p{L}/u.test(left);
};
const cueRef = cue => ({
  startMs: Math.round(Number(cue.start) * 1000),
  endMs: Math.round(Number(cue.end) * 1000),
});

function parseSubtitleFile(buffer, filename = 'subtitle.srt') {
  const text = decodeSubtitleBuffer(Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer || ''));
  const parsed = parseSubtitlePayload(text, '', filename);
  return { ...parsed, text };
}

function alignByTimestamp(sourceCues, targetCues) {
  const targetBuckets = new Map();
  for (const cue of targetCues) {
    const key = timestampKey(cue);
    if (!targetBuckets.has(key)) targetBuckets.set(key, []);
    targetBuckets.get(key).push(cue);
  }
  const matched = [];
  const missing = [];
  for (const source of sourceCues) {
    const bucket = targetBuckets.get(timestampKey(source));
    if (bucket?.length) matched.push({ source, target: bucket.shift() });
    else missing.push(source);
  }
  const extra = [...targetBuckets.values()].flat();
  return { matched, missing, extra };
}

function cueOverlapSeconds(left, right) {
  const start = Math.max(Number(left?.start) || 0, Number(right?.start) || 0);
  const end = Math.min(Number(left?.end) || 0, Number(right?.end) || 0);
  return Math.max(0, end - start);
}

function alignByOverlap(sourceCues, targetCues, minimumOverlapSeconds = 0.15) {
  const threshold = Math.max(0.001, Number(minimumOverlapSeconds) || 0.15);
  const source = Array.isArray(sourceCues) ? sourceCues : [];
  const target = Array.isArray(targetCues) ? targetCues : [];
  const sortedTargets = target.map((cue, index) => ({ cue, index }))
    .sort((a, b) => Number(a.cue.start) - Number(b.cue.start)
      || Number(a.cue.end) - Number(b.cue.end) || a.index - b.index);
  const sourceRows = source.map((cue, index) => ({ cue, index }))
    .sort((a, b) => Number(a.cue.start) - Number(b.cue.start)
      || Number(a.cue.end) - Number(b.cue.end) || a.index - b.index);
  const coveredBySourceIndex = new Map();
  const coveredTargetIndexes = new Set();
  let cursor = 0;
  for (const sourceRow of sourceRows) {
    const sourceStart = Number(sourceRow.cue.start) || 0;
    const sourceEnd = Number(sourceRow.cue.end) || 0;
    while (cursor < sortedTargets.length
        && (Number(sortedTargets[cursor].cue.end) || 0) - sourceStart < threshold) {
      cursor += 1;
    }
    const overlaps = [];
    for (let index = cursor; index < sortedTargets.length; index++) {
      const targetRow = sortedTargets[index];
      if ((Number(targetRow.cue.start) || 0) > sourceEnd - threshold) break;
      const seconds = cueOverlapSeconds(sourceRow.cue, targetRow.cue);
      if (seconds >= threshold) {
        overlaps.push({ target: targetRow.cue, targetIndex: targetRow.index, seconds });
        coveredTargetIndexes.add(targetRow.index);
      }
    }
    if (overlaps.length) coveredBySourceIndex.set(sourceRow.index, overlaps);
  }
  const coveredSource = [];
  const missing = [];
  for (let index = 0; index < source.length; index++) {
    const overlaps = coveredBySourceIndex.get(index);
    if (overlaps) coveredSource.push({ source: source[index], overlaps });
    else missing.push(source[index]);
  }
  const extra = target.filter((_cue, index) => !coveredTargetIndexes.has(index));
  return { coveredSource, missing, extra, coveredTargetIndexes };
}

function repeatedTranslationGroups(matched) {
  const groups = new Map();
  for (const pair of matched) {
    const target = normalizeText(pair.target.text).toLocaleLowerCase('tr');
    const source = normalizeText(pair.source.text).toLocaleLowerCase('und');
    if (!target) continue;
    if (!groups.has(target)) groups.set(target, { sources: new Set(), cues: [] });
    const group = groups.get(target);
    group.sources.add(source);
    group.cues.push(cueRef(pair.target));
  }
  return [...groups.values()]
    .filter(group => group.cues.length >= 3 && group.sources.size >= 2)
    .map(group => ({ occurrences: group.cues.length, distinctSources: group.sources.size,
      cues: group.cues.slice(0, 20) }));
}

function auditSubtitlePair(sourceCues, targetCues, options = {}) {
  const source = Array.isArray(sourceCues) ? sourceCues : [];
  const target = Array.isArray(targetCues) ? targetCues : [];
  const aligned = alignByTimestamp(source, target);
  const coverage = alignByOverlap(source, target, options.minimumOverlapSeconds);
  const issues = {
    sourceBelowMinimum: [],
    targetBelowMinimum: [],
    // Bir hedef cue birden çok kaynak cue'yu kapsayabilir. Yapısal kayıp
    // hükmünü cue sayısı/birebir sınır yerine gerçek zaman kapsamından üret.
    missingTarget: coverage.missing.map(cueRef),
    extraTarget: coverage.extra.map(cueRef),
    nonExactTimestamp: aligned.missing.map(cueRef),
    emptyTarget: [],
    sourceEcho: [],
    numberMismatch: [],
    negationReview: [],
    heavyCompression: [],
    repeatedTranslation: [],
    contextReview: [],
  };
  const expectedMinSourceCues = Math.max(0, Math.trunc(Number(options.expectedMinSourceCues) || 0));
  const expectedMinTargetCues = Math.max(0, Math.trunc(Number(options.expectedMinTargetCues) || 0));
  if (expectedMinSourceCues && source.length < expectedMinSourceCues) {
    issues.sourceBelowMinimum.push({ actual: source.length, expectedMinimum: expectedMinSourceCues });
  }
  if (expectedMinTargetCues && target.length < expectedMinTargetCues) {
    issues.targetBelowMinimum.push({ actual: target.length, expectedMinimum: expectedMinTargetCues });
  }
  let sourceCharacters = 0;
  let targetCharacters = 0;
  for (const pair of aligned.matched) {
    const sourceText = normalizeText(pair.source.text);
    const targetText = normalizeText(pair.target.text);
    sourceCharacters += sourceText.length;
    targetCharacters += targetText.length;
    const ref = cueRef(pair.source);
    if (!targetText) issues.emptyTarget.push(ref);
    if (echo(sourceText, targetText)) issues.sourceEcho.push(ref);
    const meaning = translationMeaningIssues(sourceText, targetText, options.targetLanguage || 'tr');
    if (meaning.includes('number_mismatch')) issues.numberMismatch.push(ref);
    if (meaning.includes('negation_missing')) issues.negationReview.push(ref);
    if (sourceText.length >= 24 && targetText.length / Math.max(1, sourceText.length) < 0.28) {
      issues.heavyCompression.push({ ...ref,
        ratio: Number((targetText.length / sourceText.length).toFixed(3)) });
    }
    if (sourceText.length <= 36 || !/[.!?…。！？]["'“”‘’)}\]»]*$/u.test(sourceText)) {
      issues.contextReview.push(ref);
    }
  }
  issues.repeatedTranslation = repeatedTranslationGroups(aligned.matched);
  const blockingCount = issues.sourceBelowMinimum.length + issues.targetBelowMinimum.length
    + issues.missingTarget.length + issues.extraTarget.length
    + issues.emptyTarget.length + issues.sourceEcho.length + issues.numberMismatch.length;
  const advisoryCount = issues.negationReview.length + issues.heavyCompression.length
    + issues.repeatedTranslation.length;
  return {
    schemaVersion: 1,
    sourceCues: source.length,
    targetCues: target.length,
    matchedCues: aligned.matched.length,
    coveredSourceCues: coverage.coveredSource.length,
    coveredTargetCues: coverage.coveredTargetIndexes.size,
    sourceCharacters,
    targetCharacters,
    characterRatio: Number((targetCharacters / Math.max(1, sourceCharacters)).toFixed(4)),
    blockingCount,
    advisoryCount,
    pass: blockingCount === 0,
    issues,
  };
}

function sha256(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

module.exports = {
  alignByOverlap,
  alignByTimestamp,
  auditSubtitlePair,
  parseSubtitleFile,
  sha256,
};
