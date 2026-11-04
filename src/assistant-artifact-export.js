/* V3-T09 — Güvenli dışa aktarma: CSV / JSON / Markdown / HTML, ekranda görünen revizyonla AYNI revizyon.
   CSV formül enjeksiyonu (=,+,-,@,TAB,CR) etkisizleştirilir; HTML/Markdown kaçışlıdır; kapalı spoiler hücresi
   hiçbir biçime sızmaz; dosya seçimi iptali veri değiştirmez (bu modül yalnız içerik üretir). */
(function (root, factory) {
  const api = factory(typeof require === 'function' && typeof module === 'object' ? require('./assistant-artifact-store.js') : root.AssistantArtifactStore);
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.AssistantArtifactExport = api;
})(globalThis, (Store) => {
  'use strict';

  const HIDDEN = { tr: '[gizli — spoiler kapalı]', en: '[hidden — spoiler closed]' };
  const esc = {
    html: (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;'),
    md: (s) => String(s).replace(/\\/g, '\\\\').replace(/[|`*_{}\[\]<>#]/g, (c) => '\\' + c).replace(/\r?\n/g, ' '),
  };
  /** OWASP: hücre =,+,-,@,TAB,CR veya tam genişlik karşılıklarıyla başlıyorsa tek tırnak öneki. */
  function csvCell(v) {
    let s = String(v == null ? '' : v);
    if (/^[=+\-@\t\r\uFF1D\uFF0B\uFF0D\uFF20]/.test(s)) s = "'" + s;
    return '"' + s.replace(/"/g, '""') + '"';
  }
  const csv = (rows) => rows.map((r) => r.map(csvCell).join(',')).join('\r\n') + '\r\n';
  const slug = (t) => String(t || 'artifact').normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60) || 'artifact';

  function toRows(body, { includeClosed, locale }) {
    const hidden = HIDDEN[locale] || HIDDEN.tr;
    const show = (v, spoiler) => (spoiler === 'closed' && !includeClosed ? hidden : v);
    if (body.type === 'matrix') {
      const cell = new Map(body.cells.map((c) => [c.rowId + '\u0000' + c.colId, c]));
      return [[''].concat(body.columns.map((c) => c.label))].concat(body.rows.map((r) => [r.label].concat(body.columns.map((c) => {
        const x = cell.get(r.id + '\u0000' + c.id); return x ? show(x.value, x.spoiler) : '';
      }))));
    }
    if (body.type === 'timeline') return [['time', 'label', 'sources']].concat(body.nodes.map((n) => [n.time, show(n.label, n.spoiler), n.claims.map((c) => c.sourceId).join('; ')]));
    if (body.type === 'route') return [['order', 'title', 'minutes', 'source']].concat(body.items.map((i) => [i.order, i.title, i.runtimeMinutes == null ? '' : i.runtimeMinutes, i.sourceReady]));
    return [['section', 'passage', 'sources']].concat(body.sections.flatMap((s) => s.passages.map((p) => [s.heading, show(p.text, p.spoiler), p.claims.map((c) => c.sourceId).join('; ')])));
  }
  function exportBody(body, { includeClosed }) {
    if (includeClosed) return JSON.parse(JSON.stringify(body));
    const entries = body.type === 'matrix' ? body.cells : body.type === 'timeline' ? body.nodes
      : body.type === 'dossier' ? body.sections.flatMap(section => section.passages) : [];
    const hidden = entries.some(entry => entry.spoiler === 'closed');
    if (!hidden) return JSON.parse(JSON.stringify(body));
    // Construct an export projection. Private source snapshots and extension
    // fields cannot bypass redaction through JSON metadata or shared evidence.
    const entry = (row, field) => {
      const closed = row.spoiler === 'closed';
      const result = { [field]: closed ? '' : row[field], spoiler: row.spoiler || 'open',
        claims: closed ? [] : (row.claims || []).map(claim => ({ sourceId: claim.sourceId, passageId: claim.passageId, sourceKind: claim.sourceKind })) };
      if (closed) result.hidden = true;
      return result;
    };
    const copy = { type: body.type, title: body.title };
    if (body.type === 'matrix') {
      copy.columns = body.columns.map(column => ({ id: column.id, label: column.label }));
      copy.rows = body.rows.map(row => ({ id: row.id, label: row.label }));
      copy.cells = body.cells.map(cell => ({ rowId: cell.rowId, colId: cell.colId, ...entry(cell, 'value') }));
    } else if (body.type === 'timeline') {
      copy.nodes = body.nodes.map(node => ({ id: node.id, time: node.time, ...entry(node, 'label') }));
    } else if (body.type === 'dossier') {
      copy.sections = body.sections.map(section => ({ heading: section.heading,
        passages: section.passages.map(passage => ({ id: passage.id, ...entry(passage, 'text') })) }));
    }
    return copy;
  }
  function markdown(body, opts) {
    const rows = toRows(body, opts);
    const head = `# ${esc.md(body.title || 'Artifact')}\n\n`;
    if (body.type === 'dossier') return head + body.sections.map((s) => `## ${esc.md(s.heading)}\n\n` + s.passages.map((p) => `- ${esc.md(p.spoiler === 'closed' && !opts.includeClosed ? (HIDDEN[opts.locale] || HIDDEN.tr) : p.text)} _(${p.claims.map((c) => esc.md(c.sourceId)).join(', ')})_`).join('\n')).join('\n\n') + '\n';
    const line = (r) => '| ' + r.map((c) => esc.md(c)).join(' | ') + ' |';
    return head + [line(rows[0]), '|' + rows[0].map(() => ' --- |').join(''), ...rows.slice(1).map(line)].join('\n') + '\n';
  }
  function html(body, opts) {
    const rows = toRows(body, opts);
    const table = '<table><thead><tr>' + rows[0].map((c) => `<th>${esc.html(c)}</th>`).join('') + '</tr></thead><tbody>' + rows.slice(1).map((r) => '<tr>' + r.map((c) => `<td>${esc.html(c)}</td>`).join('') + '</tr>').join('') + '</tbody></table>';
    return `<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'"><title>${esc.html(body.title || 'Artifact')}</title></head><body><h1>${esc.html(body.title || '')}</h1>${table}</body></html>`;
  }

  /** → { ok, filename, mime, content, bom } | { ok:false, code }. expectedRevision = ekranda görünen revizyon. */
  function exportArtifact({ doc, format, expectedRevision, includeClosedSpoilers = false, locale = 'tr' }) {
    if (!doc || !doc.modelBody) return { ok: false, code: 'not-found' };
    if (doc.revision !== expectedRevision) return { ok: false, code: 'revision-mismatch', currentRevision: doc.revision };
    const opts = { includeClosed: includeClosedSpoilers, locale };
    const body = exportBody(Store.effectiveBody(doc), opts);
    const base = `${slug(doc.title)}-r${doc.revision}`;
    if (format === 'csv') return { ok: true, filename: base + '.csv', mime: 'text/csv;charset=utf-8', content: csv(toRows(body, opts)), bom: true };
    if (format === 'json') return { ok: true, filename: base + '.json', mime: 'application/json', content: JSON.stringify({ schema: 'assistant-artifact-export-v1', revision: doc.revision, kind: doc.kind, title: doc.title, body }, null, 2) + '\n', bom: false };
    if (format === 'markdown') return { ok: true, filename: base + '.md', mime: 'text/markdown;charset=utf-8', content: markdown(body, opts), bom: false };
    if (format === 'html') return { ok: true, filename: base + '.html', mime: 'text/html;charset=utf-8', content: html(body, opts), bom: false };
    return { ok: false, code: 'unsupported-format' };
  }
  return Object.freeze({ exportArtifact, csvCell, esc });
});
