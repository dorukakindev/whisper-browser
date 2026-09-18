'use strict';

function normalizedId(value) {
  return String(value === undefined || value === null ? '' : value).replace(/^web-tr-/, '');
}

function cueIdentity(cue, index) {
  const value = cue?.cueId ?? cue?.id;
  return normalizedId(value === undefined || value === null || value === '' ? 'index:' + index : value);
}

function cueIdsForStage(values, source) {
  const rows = values instanceof Map ? [...values.values()] : (Array.isArray(values) ? values : []);
  const sourceRows = source.map((cue, index) => ({
    id: cueIdentity(cue, index), start: Number(cue?.start), end: Number(cue?.end),
  }));
  const sourceIds = new Set(sourceRows.map((row) => row.id));
  const ids = new Set();
  for (const [index, cue] of rows.entries()) {
    if (typeof cue?.text !== 'string' || !cue.text.trim()) continue;
    const explicit = cue?.cueId ?? cue?.id;
    const explicitId = normalizedId(explicit);
    if (explicitId && sourceIds.has(explicitId)) { ids.add(explicitId); continue; }
    const start = Number(cue?.sourceStart ?? cue?.start);
    const end = Number(cue?.sourceEnd ?? cue?.end);
    if (Number.isFinite(start)) {
      const match = sourceRows.find((row) => !ids.has(row.id) && Number.isFinite(row.start)
        && Math.abs(row.start - start) <= .05
        && (!Number.isFinite(end) || !Number.isFinite(row.end) || Math.abs(row.end - end) <= .1));
      if (match) { ids.add(match.id); continue; }
    }
    if (!explicitId && !Number.isFinite(start) && sourceRows[index]) ids.add(sourceRows[index].id);
  }
  return ids;
}

function normalizedIdSet(values) {
  const rows = values instanceof Set ? [...values] : (Array.isArray(values) ? values : []);
  return new Set(rows.map(normalizedId).filter(Boolean));
}

function missingIds(sourceIds, presentIds) {
  return [...sourceIds].filter((id) => !presentIds.has(id));
}

function summarizeTranslationIntegrity({
  sourceCues = [], results = [], state = null, capture = null,
  fileCues = null, fileCueIds = null, displayedCues = null, displayedCueIds = null,
} = {}) {
  const source = Array.isArray(sourceCues) ? sourceCues : [];
  const sourceIds = new Set(source.map(cueIdentity));
  const translatedIds = cueIdsForStage(results, source);
  const fileObserved = Array.isArray(fileCues) || fileCueIds instanceof Set || Array.isArray(fileCueIds);
  const displayObserved = Array.isArray(displayedCues)
    || displayedCueIds instanceof Set || Array.isArray(displayedCueIds);
  const writtenIds = fileCueIds !== null ? normalizedIdSet(fileCueIds) : cueIdsForStage(fileCues, source);
  const displayedIds = displayedCueIds !== null
    ? normalizedIdSet(displayedCueIds) : cueIdsForStage(displayedCues, source);

  const failures = Array.isArray(state?.failures) ? state.failures : [];
  const totalSentences = Math.max(0, Math.trunc(Number(state?.total) || 0));
  const completedSentences = Math.max(0, Math.trunc(Number(state?.completed) || 0));
  const pendingSentences = Array.isArray(state?.pending) ? state.pending.length : Math.max(0, Math.trunc(Number(state?.pending) || 0));
  const queuedSentences = Array.isArray(state?.queued) ? state.queued.length : Math.max(0, Math.trunc(Number(state?.queued) || 0));
  const failedSentences = failures.length || Math.max(0, Math.trunc(Number(state?.failed) || 0));
  const missingCueIds = missingIds(sourceIds, translatedIds);
  const missingFileCueIds = fileObserved ? missingIds(sourceIds, writtenIds) : [];
  const missingDisplayCueIds = displayObserved ? missingIds(sourceIds, displayedIds) : [];
  const captureRows = Array.isArray(capture) ? capture : (capture ? [capture] : []);
  const captureMissingRanges = captureRows.flatMap((row) => Array.isArray(row?.missingRanges)
    ? row.missingRanges.map((range) => ({ streamKey: String(row.streamKey || ''), ...range })) : []);
  const submittedSentences = Math.min(totalSentences,
    completedSentences + pendingSentences + queuedSentences + failedSentences);

  let status = 'ready';
  let reason = 'waiting';
  if (!source.length) { status = 'idle'; reason = 'no-source'; }
  else if (pendingSentences || queuedSentences) { status = 'running'; reason = 'in-progress'; }
  else if (captureMissingRanges.length) { status = 'partial'; reason = 'capture-gap'; }
  else if (failedSentences) { status = 'partial'; reason = 'provider-failure'; }
  else if (missingCueIds.length) { status = 'partial'; reason = 'output-gap'; }
  else if (missingFileCueIds.length) { status = 'partial'; reason = 'file-gap'; }
  else if (missingDisplayCueIds.length) { status = 'partial'; reason = 'display-gap'; }
  else if (totalSentences && completedSentences >= totalSentences) { status = 'complete'; reason = 'complete'; }

  const message = status === 'complete'
    ? source.length + '/' + source.length + ' kaynak altyazı çevrildi'
      + (displayObserved ? ' ve ekrana uygulandı' : '') + (fileObserved ? ' ve dosyada doğrulandı' : '') + '.'
    : status === 'running'
      ? source.length + ' kaynak altyazıdan ' + translatedIds.size + ' tanesi çevrildi; '
        + (queuedSentences + pendingSentences) + ' cümle bekliyor.'
      : status === 'partial' && reason === 'capture-gap'
        ? 'Altyazı yakalamasında ' + captureMissingRanges.length + ' zaman aralığı eksik; çeviri tam sayılamaz.'
        : status === 'partial' && reason === 'file-gap'
          ? source.length + ' kaynak altyazıdan ' + missingFileCueIds.length + ' tanesi doğrulanan dosyada eksik.'
          : status === 'partial' && reason === 'display-gap'
            ? source.length + ' kaynak altyazıdan ' + missingDisplayCueIds.length + ' tanesi ekrana uygulanmadı.'
            : status === 'partial'
              ? source.length + ' kaynak altyazıdan ' + missingCueIds.length + ' tanesinin çeviri çıktısı eksik.'
              : status === 'idle' ? 'Henüz çevrilecek kaynak altyazı yok.' : 'Çeviri başlamayı bekliyor.';

  return {
    status, reason, sourceCues: source.length, totalSentences, submittedSentences,
    completedSentences, queuedSentences, pendingSentences, failedSentences,
    capturedRanges: captureRows.reduce((sum, row) => sum + (Array.isArray(row?.ranges) ? row.ranges.length : 0), 0),
    captureMissingRanges: captureMissingRanges.slice(0, 100),
    translatedCues: translatedIds.size, missingCues: missingCueIds.length,
    missingCueIds: missingCueIds.slice(0, 100),
    fileObserved, writtenCues: writtenIds.size, missingFileCues: missingFileCueIds.length,
    missingFileCueIds: missingFileCueIds.slice(0, 100),
    displayObserved, displayedCues: displayedIds.size, missingDisplayCues: missingDisplayCueIds.length,
    missingDisplayCueIds: missingDisplayCueIds.slice(0, 100), message,
  };
}

module.exports = { summarizeTranslationIntegrity };
