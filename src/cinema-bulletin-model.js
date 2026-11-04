/* V3-T05/T06 — Kişisel sinema bülteni modeli (saf, cache-first).
   Kütüphanedeki yapımla ilişkili yeni yazılar; kapsam (hangi feed denendi, hangisi kaldı) açık.
   304 yeni item değildir; 403/429/hata boş başarı değildir; okundu ≠ beğenildi ≠ izlendi. */
(function (root, factory) {
  const api = factory(typeof require === 'function' && typeof module === 'object' ? require('./feed-story-identity.js') : root.FeedStoryIdentity);
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.CinemaBulletinModel = api;
})(globalThis, (Stories) => {
  'use strict';

  const fold = (v) => String(v == null ? '' : v).normalize('NFKD').replace(/\p{M}/gu, '').toLocaleLowerCase('tr-TR').replace(/ı/g, 'i').replace(/[^a-z0-9]+/g, ' ').trim();
  const deepFreeze = (o) => { Object.values(o).forEach((v) => { if (v && typeof v === 'object' && !Object.isFrozen(v)) deepFreeze(v); }); return Object.freeze(o); };
  const FEED_STATUS = ['ok', 'not-modified', 'forbidden', 'rate-limited', 'unavailable', 'error', 'not-attempted'];

  /** Kapsam makbuzu: tamamlanmış sayılması için her feed ok/not-modified olmalı. */
  function summarizeCoverage(feedResults, allFeedIds) {
    const byId = new Map((Array.isArray(feedResults) ? feedResults : []).map((r) => [String(r.feedId), r]));
    const rows = (Array.isArray(allFeedIds) ? allFeedIds : Array.from(byId.keys())).map((id) => {
      const r = byId.get(String(id));
      const status = r && FEED_STATUS.includes(r.status) ? r.status : 'not-attempted';
      return { feedId: String(id), title:String(r?.title||id),lastAttempt:Number(r?.lastAttempt)||0,status, newItems: status === 'ok' ? Math.max(0, Number(r.newItems) || 0) : 0, retryAfterSeconds: Number.isFinite(r && r.retryAfterSeconds) ? r.retryAfterSeconds : null };
    });
    const checked = rows.filter((r) => r.status === 'ok' || r.status === 'not-modified');
    const remaining = rows.filter((r) => !(r.status === 'ok' || r.status === 'not-modified'));
    return { rows, checkedFeeds: checked.length, remainingFeeds: remaining.length, remaining: remaining.map((r) => ({ feedId: r.feedId, title:r.title,lastAttempt:r.lastAttempt,status: r.status })), complete: remaining.length === 0, anyNewItems: rows.some((r) => r.newItems > 0) };
  }

  /** Yazıyı kütüphane yapımına bağlar: onaylı bağlantı > başlık/takma ad adayı. Aday 'candidate' kalır. */
  function linkEntryToLibrary(entry, library) {
    if (entry && entry.workId && (library || []).some((w) => w.workId === entry.workId)) return { workId: entry.workId, confidence: 'confirmed' };
    const hay = fold((entry && entry.title) + ' ' + ((entry && entry.summary) || ''));
    const hits = (library || []).filter((w) => [w.title].concat(w.aliases || []).map(fold).filter((n) => n.length >= 4).some((n) => hay.includes(n)));
    if (hits.length === 1) return { workId: hits[0].workId, confidence: 'candidate' };
    if (hits.length > 1) return { workId: null, confidence: 'ambiguous', candidates: hits.map((w) => w.workId) };
    return { workId: null, confidence: 'unknown' };
  }

  /**
   * buildBulletin → donmuş zarf: { capturedAt, revision, coverage, sections:[{workId, topics}], unlinked:[topics] }.
   * readState (okundu) ayrı sözlük olarak girer; beğeni/izlendi bu modelde YOK.
   */
  function buildBulletin({ entries, library, feedResults, allFeedIds, readState = {}, capturedAt }) {
    const linked = []; const unlinked = [];
    for (const entry of Array.isArray(entries) ? entries : []) {
      const link = linkEntryToLibrary(entry, library);
      const merged = { ...entry, workId: link.confidence === 'confirmed' || link.confidence === 'candidate' ? link.workId : null };
      (link.workId ? linked : unlinked).push({ entry: merged, link });
    }
    const makeTopics = (list) => Stories.groupStories(list.map((x) => ({ ...x.entry }))).map(t => ({ ...t, read: t.stories.every(s => s.entryIds.every(id => readState[id] === true)) }));
    const byWork = new Map();
    linked.forEach((x) => (byWork.get(x.link.workId) || byWork.set(x.link.workId, []).get(x.link.workId)).push(x));
    const sections = Array.from(byWork.entries()).map(([workId, list]) => ({
      workId, title: ((library || []).find((w) => w.workId === workId) || {}).title || '',
      linkConfidence: list.every((x) => x.link.confidence === 'confirmed') ? 'confirmed' : 'candidate',
      topics: makeTopics(list),
    })).sort((a, b) => (a.title < b.title ? -1 : 1));
    const coverage = summarizeCoverage(feedResults, allFeedIds);
    const body = { schema: 'cinema-bulletin-v1', capturedAt: String(capturedAt || ''), coverage, sections, unlinked: makeTopics(unlinked) };
    body.revision = 'cb1-' + Stories.canonicalizeUrl('https://x.invalid/' + JSON.stringify(sections.map((s) => [s.workId, s.topics.map((t) => t.topicId)])).length) + '-' + sections.length + '-' + unlinked.length;
    return deepFreeze(body);
  }
  return Object.freeze({ summarizeCoverage, linkEntryToLibrary, buildBulletin });
});
