// SPDX-License-Identifier: MIT
// Original delivery helper, 2026-11-04. Pure candidate assessment; no IO or authority.
'use strict';
const text = x => typeof x === 'string' ? x.normalize('NFKC').trim().toLocaleLowerCase('en-US').replace(/\s+/g, ' ') : '';
const validDuration = x => typeof x === 'number' && Number.isFinite(x) && x > 0;
function assessEpisodeMatch(source = {}, candidate = {}) {
  const evidence = [], conflicts = [];
  const record = (name, a, b, normalize = text) => {
    const left = normalize(a), right = normalize(b);
    if (!left || !right) return;
    (left === right ? evidence : conflicts).push(name);
  };
  record('title', source.title, candidate.title);
  record('publisher', source.publisher, candidate.publisher);
  // GUID is scoped to a feed; Spotify IDs are never compared to RSS GUIDs.
  if (source.feedIdentity && source.feedIdentity === candidate.feedIdentity) {
    record('feed-guid', source.guid, candidate.guid, x => typeof x === 'string' ? x.trim() : '');
  }
  // Cross-source mapping is supplied by a previously verified main-side binding.
  record('verified-binding', source.verifiedBindingId, candidate.verifiedBindingId, x => typeof x === 'string' ? x : '');
  const date = x => typeof x === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(x) && Number.isFinite(Date.parse(x)) ? x : '';
  record('publication-day', source.publicationDay, candidate.publicationDay, date);
  for (const key of ['episodeNumber', 'seasonNumber']) {
    if (Number.isSafeInteger(source[key]) && source[key] >= 0 && Number.isSafeInteger(candidate[key]) && candidate[key] >= 0)
      (source[key] === candidate[key] ? evidence : conflicts).push(key);
  }
  if (validDuration(source.durationSeconds) && validDuration(candidate.durationSeconds)) {
    const delta = Math.abs(source.durationSeconds - candidate.durationSeconds);
    const tolerance = Math.max(15, Math.min(source.durationSeconds, candidate.durationSeconds) * .02);
    (delta <= tolerance ? evidence : conflicts).push('duration');
  }
  const hardConflict = ['feed-guid', 'verified-binding', 'episodeNumber', 'seasonNumber'].some(k => conflicts.includes(k));
  const hasIdentity = evidence.includes('feed-guid') || evidence.includes('verified-binding');
  const broadAgreement = ['title', 'publisher', 'publication-day', 'duration'].every(k => evidence.includes(k));
  const confidence = hardConflict ? 'conflict' : (hasIdentity && conflicts.length === 0) || (broadAgreement && conflicts.length === 0) ? 'high' : evidence.length >= 2 ? 'medium' : 'low';
  return { confidence, evidence, conflicts, autoBind: false, requiresConfirmation: true,
    timelineCompatibility: 'unverified', reason: hardConflict ? 'identity-conflict' : 'candidate-only' };
}
module.exports = { assessEpisodeMatch };
