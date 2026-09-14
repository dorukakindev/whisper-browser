'use strict';

function cueIdentity(cue, index) {
  const value = cue?.cueId ?? cue?.id;
  return String(value === undefined || value === null || value === '' ? `index:${index}` : value);
}

function summarizeTranslationIntegrity({ sourceCues = [], results = [], state = null } = {}) {
  const source = Array.isArray(sourceCues) ? sourceCues : [];
  const output = results instanceof Map ? [...results.values()] : (Array.isArray(results) ? results : []);
  const sourceIds = new Set(source.map(cueIdentity));
  const translatedIds = new Set(output.map((cue, index) =>
    typeof cue?.text === 'string' && cue.text.trim() ? cueIdentity(cue, index) : null)
    .filter(id => sourceIds.has(id)));
  const failures = Array.isArray(state?.failures) ? state.failures : [];
  const totalSentences = Math.max(0, Math.trunc(Number(state?.total) || 0));
  const completedSentences = Math.max(0, Math.trunc(Number(state?.completed) || 0));
  const pendingSentences = Array.isArray(state?.pending) ? state.pending.length : Math.max(0, Math.trunc(Number(state?.pending) || 0));
  const queuedSentences = Array.isArray(state?.queued) ? state.queued.length : Math.max(0, Math.trunc(Number(state?.queued) || 0));
  const failedSentences = failures.length || Math.max(0, Math.trunc(Number(state?.failed) || 0));
  const missingCueIds = [...sourceIds].filter((id) => !translatedIds.has(id));
  const submittedSentences = Math.min(totalSentences,
    completedSentences + pendingSentences + failedSentences);
  let status = 'ready';
  let reason = 'waiting';
  if (!source.length) { status = 'idle'; reason = 'no-source'; }
  else if (pendingSentences || queuedSentences) { status = 'running'; reason = 'in-progress'; }
  else if (failedSentences) { status = 'partial'; reason = 'provider-failure'; }
  else if (missingCueIds.length) { status = 'partial'; reason = 'output-gap'; }
  else if (totalSentences && completedSentences >= totalSentences) { status = 'complete'; reason = 'complete'; }
  const message = status === 'complete'
    ? `${source.length}/${source.length} kaynak altyazı çıktı ve ekrana ulaştı.`
    : status === 'running'
      ? `${source.length} kaynak altyazıdan ${translatedIds.size} tanesi çıktı; ${queuedSentences + pendingSentences} cümle bekliyor.`
      : status === 'partial'
        ? `${source.length} kaynak altyazıdan ${missingCueIds.length} tanesinin çeviri çıktısı eksik.`
        : status === 'idle' ? 'Henüz çevrilecek kaynak altyazı yok.' : 'Çeviri başlamayı bekliyor.';
  return {
    status, reason, sourceCues: source.length, totalSentences, submittedSentences,
    completedSentences, queuedSentences, pendingSentences, failedSentences,
    translatedCues: translatedIds.size, missingCues: missingCueIds.length,
    missingCueIds: missingCueIds.slice(0, 100), message,
  };
}

module.exports = { summarizeTranslationIntegrity };
