(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.WhisperBrowserSkipSegments = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const KINDS = new Set(['intro', 'recap']);
  const SCOPES = new Set(['media', 'series']);
  const MAX_SECONDS = 24 * 60 * 60;

  function normalizeRecord(raw) {
    if (!raw || typeof raw !== 'object') return null;
    const id = String(raw.id || '').trim().slice(0, 128);
    const scopeKey = String(raw.scopeKey || '').trim().slice(0, 1024);
    const start = Number(raw.start);
    const end = Number(raw.end);
    if (!id || !scopeKey || !SCOPES.has(raw.scope) || !KINDS.has(raw.kind)
        || !Number.isFinite(start) || !Number.isFinite(end)
        || start < 0 || end > MAX_SECONDS || end - start < .1) return null;
    return { id, scope: raw.scope, scopeKey, kind: raw.kind, start, end,
      autoSkip: raw.autoSkip === true };
  }

  function normalizeRecords(records) {
    if (!Array.isArray(records)) return [];
    const byId = new Map();
    for (const raw of records.slice(0, 500)) {
      const record = normalizeRecord(raw);
      if (record) byId.set(record.id, record);
    }
    return [...byId.values()];
  }

  function upsertRecord(records, raw) {
    const record = normalizeRecord(raw);
    if (!record) return { records: normalizeRecords(records), changed: false };
    const next = normalizeRecords(records);
    const index = next.findIndex(item => item.id === record.id);
    if (index < 0) next.push(record);
    else next[index] = record;
    return { records: next, changed: true };
  }

  function removeRecord(records, id) {
    const current = normalizeRecords(records);
    const next = current.filter(item => item.id !== id);
    return { records: next, changed: next.length !== current.length };
  }

  // state bir oynatıcıya özgüdür; medya değişiminde çağıran boş state vermelidir.
  function decideSkip(records, context = {}, state = {}) {
    const time = Number(context.currentTime);
    if (!Number.isFinite(time) || time < 0) return { candidate: null, shouldSkip: false, state: {} };
    const previous = Number(state.lastTime);
    const hasPrevious = Number.isFinite(previous);
    const backwards = context.manualSeek === true || (hasPrevious && time < previous - .25);
    const candidate = normalizeRecords(records)
      .filter(item => (item.scope === 'media' ? item.scopeKey === context.mediaKey
        : item.scopeKey === context.seriesKey) && time >= item.start && time < item.end)
      .sort((a, b) => a.end - b.end)[0] || null;
    const suppressedId = candidate && (backwards ? candidate.id : state.suppressedId);
    const shouldSkip = !!candidate?.autoSkip && !backwards
      && suppressedId !== candidate.id && context.playing !== false;
    return { candidate, shouldSkip,
      state: { lastTime: time, suppressedId: candidate ? (shouldSkip ? candidate.id : suppressedId) : null } };
  }

  return { normalizeRecord, normalizeRecords, upsertRecord, removeRecord, decideSkip };
});
