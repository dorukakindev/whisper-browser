/* V3-T08 — Asistan çıktıları için TİPLİ gövde üreticileri: karşılaştırma matrisi, zaman çizelgesi, araştırma dosyası, izleme rotası.
   Dört ayrı state motoru yok: hepsi aynı zarfı (claims → sourceId) tüketir. Her dolu hücre/pasaj kaynaklı olmalı;
   kaynak kimliği uydurulmaz; sessiz sahne altyazıdan "görülmüş" sayılmaz; kaynak metni talimat değildir. */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.AssistantArtifactBuilders = api;
})(globalThis, () => {
  'use strict';

  const MAX_TEXT = 2000;
  const INSTRUCTION_LIKE = /ignore (all |the )?(previous|above)|system prompt|you are now|<\s*script|javascript:|\bexecute\b.*\bcommand/i;
  // eslint-disable-next-line no-control-regex
  const CTRL = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;

  /** Kaynak metnini VERİ olarak temizler; talimat gibi görünüyorsa işaretler ama uygulamaz. */
  function neutralizeSourceText(text) {
    const clean = String(text == null ? '' : text).replace(CTRL, '').slice(0, MAX_TEXT);
    return { text: clean, flags: INSTRUCTION_LIKE.test(clean) ? ['instruction-like'] : [], kind: 'source-text' };
  }
  const claimOk = (claim, known) => claim && typeof claim.sourceId === 'string' && claim.sourceId && (!known || known.has(claim.sourceId));
  const cleanClaims = (claims, known, issues, where) => {
    const out = [];
    for (const c of Array.isArray(claims) ? claims : []) {
      if (!claimOk(c, known)) { issues.push({ code: 'unknown-source-id', where, sourceId: c && c.sourceId }); continue; }
      out.push({ sourceId: c.sourceId, passageId: c.passageId ? String(c.passageId) : null, sourceKind: c.sourceKind || null, quote: c.quote ? neutralizeSourceText(c.quote).text.slice(0, 280) : null });
    }
    return out;
  };

  function buildComparisonMatrix({ title, columns, rows, cells, knownSourceIds }) {
    const issues = []; const known = knownSourceIds instanceof Set ? knownSourceIds : null;
    const cols = (columns || []).map((c) => ({ id: String(c.id), label: neutralizeSourceText(c.label).text }));
    const rws = (rows || []).map((r) => ({ id: String(r.id), label: neutralizeSourceText(r.label).text }));
    const index = new Map();
    for (const cell of Array.isArray(cells) ? cells : []) {
      const where = `cell:${cell.rowId}:${cell.colId}`;
      if (!rws.some((r) => r.id === String(cell.rowId)) || !cols.some((c) => c.id === String(cell.colId))) { issues.push({ code: 'cell-outside-grid', where }); continue; }
      const value = neutralizeSourceText(cell.value);
      const claims = cleanClaims(cell.claims, known, issues, where);
      if (value.text && !claims.length) { issues.push({ code: 'unsourced-cell', where }); continue; }
      index.set(where, { rowId: String(cell.rowId), colId: String(cell.colId), value: value.text, claims, status: value.text ? (cell.status === 'partial' ? 'partial' : 'known') : 'unknown', spoiler: cell.spoiler === 'closed' ? 'closed' : 'open', flags: value.flags });
    }
    const all = [];
    for (const r of rws) for (const c of cols) {
      const k = `cell:${r.id}:${c.id}`;
      all.push(index.get(k) || { rowId: r.id, colId: c.id, value: '', claims: [], status: 'unknown', spoiler: 'open', flags: [] });
    }
    const missing = all.filter((c) => c.status === 'unknown').length;
    const blocking = issues.filter((i) => i.code !== 'unknown-source-id' || true);
    return { ok: blocking.length === 0, issues, body: { type: 'matrix', title: neutralizeSourceText(title).text, columns: cols, rows: rws, cells: all, coverage: { expected: all.length, missing, partial: missing > 0 || all.some((c) => c.status === 'partial') } } };
  }

  function buildTimeline({ title, nodes, knownSourceIds }) {
    const issues = []; const known = knownSourceIds instanceof Set ? knownSourceIds : null;
    const out = [];
    for (const n of Array.isArray(nodes) ? nodes : []) {
      const where = `node:${n.id}`;
      const claims = cleanClaims(n.claims, known, issues, where);
      if (!claims.length) { issues.push({ code: 'unsourced-node', where }); continue; }
      if (n.silent && claims.every((c) => c.sourceKind === 'subtitle')) { issues.push({ code: 'silent-scene-from-subtitle', where }); continue; }
      out.push({ id: String(n.id), time: n.time, label: neutralizeSourceText(n.label).text, claims, silent: !!n.silent });
    }
    out.sort((a, b) => (typeof a.time === 'number' && typeof b.time === 'number' ? a.time - b.time : String(a.time) < String(b.time) ? -1 : 1) || (a.id < b.id ? -1 : 1));
    return { ok: issues.length === 0, issues, body: { type: 'timeline', title: neutralizeSourceText(title).text, nodes: out, partial: issues.length > 0 } };
  }

  function buildResearchDossier({ title, sections, knownSourceIds }) {
    const issues = []; const known = knownSourceIds instanceof Set ? knownSourceIds : null;
    const out = (sections || []).map((s, si) => ({
      heading: neutralizeSourceText(s.heading).text,
      passages: (s.passages || []).flatMap((p, pi) => {
        const where = `passage:${si}.${pi}`; const claims = cleanClaims(p.claims, known, issues, where);
        if (!claims.length) { issues.push({ code: 'unsourced-passage', where }); return []; }
        const t = neutralizeSourceText(p.text);
        return [{ id: String(p.id || `${si}.${pi}`), text: t.text, claims, flags: t.flags }];
      }),
    }));
    return { ok: issues.length === 0, issues, body: { type: 'dossier', title: neutralizeSourceText(title).text, sections: out } };
  }

  /** T03 taslağını artifact gövdesine çevirir; yazma yetkisi taşımaz. */
  function buildRouteArtifact(itinerary) {
    const it = itinerary || {};
    return { ok: true, issues: [], body: { type: 'route', readOnly: true, draftRevision: it.draftRevision || null, totalMinutes: it.totalMinutes || 0, fits: it.fits, items: (it.items || []).map((i) => ({ itemId: i.itemId, title: neutralizeSourceText(i.title).text, order: i.order, runtimeMinutes: i.runtimeMinutes, sourceReady: i.sourceReady })) } };
  }
  return Object.freeze({ neutralizeSourceText, buildComparisonMatrix, buildTimeline, buildResearchDossier, buildRouteArtifact });
});
