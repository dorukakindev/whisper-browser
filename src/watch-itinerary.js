/* V3-T03 + T04 — Süreli izleme rotası taslağı (salt okunur) ve kontrollü uygulama sınırı.
   Taslak yalnız mevcut katalog öğelerini sıralar: metadata oynatılabilir sayılmaz, bilinmeyen süre uydurulmaz,
   'tamamlandı/beğenildi' üretilmez. Uygulama (T04) yalnız tam üye/sıra/revizyon önizlemesi sonrası ve yalnız kendi farkını yazar/geri alır. */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.WatchItinerary = api;
})(globalThis, () => {
  'use strict';

  const isMin = (v) => typeof v === 'number' && Number.isFinite(v) && v > 0;
  const hash = (s) => { let h = 0x811c9dc5; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; } return h.toString(36); };

  /**
   * candidates: [{itemId,title,runtimeMinutes|null,sourceReady:'ready'|'needs-source'|'unknown',reason?}]
   * Uyum kuralı: Σ süre + Σ mola ≤ bütçe. Bilinmeyen süre toplama katılmaz ama 'unknown' olarak açık kalır.
   */
  function buildWatchItinerary({ candidates, budgetMinutes, breakMinutes = 10, maxItems = 12, order = 'given' }) {
    const budget = isMin(budgetMinutes) ? budgetMinutes : null;
    const brk = typeof breakMinutes === 'number' && breakMinutes >= 0 ? breakMinutes : 10;
    const seen = new Set(); const pool = [];
    const skipped = [];
    for (const c of Array.isArray(candidates) ? candidates : []) {
      const id = c && String(c.itemId == null ? '' : c.itemId);
      if (!id) continue;
      if (seen.has(id)) { skipped.push({ itemId: id, reason: 'duplicate' }); continue; }
      seen.add(id); pool.push({ ...c, itemId: id });
    }
    if (order === 'shortest-first') pool.sort((a, b) => (isMin(a.runtimeMinutes) ? a.runtimeMinutes : Infinity) - (isMin(b.runtimeMinutes) ? b.runtimeMinutes : Infinity) || (a.itemId < b.itemId ? -1 : 1));

    const items = []; let cursor = 0; let unknownCount = 0;
    for (const c of pool) {
      if (items.length >= maxItems) { skipped.push({ itemId: c.itemId, reason: 'max-items' }); continue; }
      const known = isMin(c.runtimeMinutes);
      const gap = items.length ? brk : 0;
      if (known && budget !== null && cursor + gap + c.runtimeMinutes > budget) { skipped.push({ itemId: c.itemId, reason: 'exceeds-budget', needsMinutes: cursor + gap + c.runtimeMinutes }); continue; }
      const start = cursor + gap;
      const end = known ? start + c.runtimeMinutes : start;
      items.push({
        itemId: c.itemId, title: String(c.title || ''), order: items.length + 1, runtimeMinutes: known ? c.runtimeMinutes : null, runtimeKnown: known,
        startOffsetMinutes: start, endOffsetMinutes: known ? end : null,
        sourceReady: c.sourceReady === 'ready' ? 'ready' : (c.sourceReady === 'needs-source' ? 'needs-source' : 'unknown'),
        reason: String(c.reason || ''),
      });
      if (!known) unknownCount++;
      cursor = end;
    }
    const total = items.length ? cursor : 0;
    return {
      readOnly: true, items, skipped, totalMinutes: total, breaksMinutes: Math.max(0, items.length - 1) * brk, budgetMinutes: budget,
      fits: unknownCount ? 'unknown' : (budget === null ? 'no-budget' : total <= budget),
      unknownRuntimeCount: unknownCount, notReadyCount: items.filter((i) => i.sourceReady !== 'ready').length,
      draftRevision: 'wi1-' + hash(items.map((i) => i.itemId).join('|')), effects: Object.freeze({ writesLikes: false, writesNotes: false, marksCompleted: false }),
    };
  }

  /** T04: taslak → mevcut koleksiyon önizlemesi. Üye/sıra/revizyon değiştiyse çakışma; otomatik ekleme yok. */
  function planItineraryApply({ draft, collection, expectedRevision, baseMembers }) {
    if (!draft || !collection) return { ok: false, code: 'missing-input' };
    if (collection.revision !== expectedRevision) return { ok: false, code: 'conflict', reason: 'revision-changed', current: collection.revision };
    if (Array.isArray(baseMembers) && (baseMembers.length !== collection.members.length || baseMembers.some((m, i) => m !== collection.members[i]))) {
      return { ok: false, code: 'conflict', reason: 'members-changed' };
    }
    const have = new Set(collection.members);
    const wanted = draft.items.map((i) => i.itemId);
    const add = wanted.filter((id) => !have.has(id));
    return { ok: true, preview: { add, keep: wanted.filter((id) => have.has(id)), orderAfter: collection.members.concat(add), writesNotes: false, writesLikes: false }, expectedRevision };
  }
  /** Uygulama yalnız önizlemedeki fark için; undo kaydı yalnız kendi eklediklerini içerir. */
  async function applyItineraryPlan({ plan, writeMembers }) {
    if (!plan || !plan.ok) return { ok: false, code: 'no-plan' };
    const result = await writeMembers({ expectedRevision: plan.expectedRevision, members: plan.preview.orderAfter });
    if (!result || result.ok !== true) return { ok: false, code: (result && result.code) || 'write-failed' };
    return { ok: true, revision: result.revision, undo: { remove: plan.preview.add.slice(), afterRevision: result.revision } };
  }
  /** Undo: aradaki kullanıcı değişikliklerini ezmez; yalnız kendi eklediklerini, hâlâ varsa çıkarır. */
  async function undoItineraryApply({ undo, collection, writeMembers }) {
    const members = collection.members.filter((id) => !undo.remove.includes(id));
    if (members.length === collection.members.length) return { ok: true, noop: true };
    const result = await writeMembers({ expectedRevision: collection.revision, members });
    return result && result.ok === true ? { ok: true, removed: collection.members.filter((id) => undo.remove.includes(id)) } : { ok: false, code: (result && result.code) || 'write-failed' };
  }

  return Object.freeze({ buildWatchItinerary, planItineraryApply, applyItineraryPlan, undoItineraryApply });
});
