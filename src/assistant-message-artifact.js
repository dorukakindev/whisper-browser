'use strict';

const { buildResearchDossier, buildTimeline, neutralizeSourceText } = require('./assistant-artifact-builders');
const { createHash } = require('node:crypto');

// Only explicit citations in a completed, persisted reply are promoted.
// Uncited prose stays in the original conversation.
function fromMessage(thread, message, kind) {
  if (!['dossier', 'timeline'].includes(kind) || message.role !== 'assistant' || message.status !== 'complete') {
    return { ok: false, code: 'reply-unavailable' };
  }
  const sources = new Map();
  const add = (row, sourceKind, sourceKey, time) => {
    if (!row.id || !row.text) return;
    const digest = createHash('sha256').update(JSON.stringify([sourceKey, row.id])).digest('hex').slice(0, 32);
    sources.set(row.id, { id: row.id, sourceId: 'evidence:' + digest, sourceKind, sourceKey,
      text: neutralizeSourceText(row.text).text, ...(time == null ? {} : { time }) });
  };
  for (const row of message.evidence || []) {
    if (/^[TU]\d+$/.test(row.id)) add(row, 'subtitle', thread.sourceKey, row.start);
  }
  for (const row of message.pageEvidence || []) add(row, 'page', JSON.stringify(row.source));
  for (const row of message.feedEvidence || []) add(row, row.nodeId ? 'recall' : 'feed', JSON.stringify([row.url, row.nodeId, row.revision]));
  for (const row of message.citations || []) {
    // Saved podcast text is its own source kind (never a book) and never enters the subtitle timeline.
    if (row.kind === 'podcast') add({ id: row.id, text: row.quote }, 'podcast', JSON.stringify([row.locator?.token, row.locator?.episode, row.role]));
    else add(row, row.kind === 'film-review' ? 'film-review' : 'book', JSON.stringify([row.sourceId, row.itemId, row.reviewId, row.revision, row.page]));
  }

  let omitted = 0;
  const passages = message.text.split(/\n\s*\n/).flatMap((text, index) => {
    const cited = [...new Set([...text.matchAll(/\[([^\]\n]{1,80})\]/g)].map(match => match[1]))]
      .map(key => sources.get(key)).filter(Boolean);
    if (!text.trim()) return [];
    if (!cited.length || text.length > 2000) { omitted++; return []; }
    return [{ id: 'p' + index, text, cited, claims: cited.map(row => ({
      sourceId: row.sourceId, passageId: row.id, sourceKind: row.sourceKind, quote: row.text.slice(0, 280),
    })) }];
  });
  const knownSourceIds = new Set([...sources.values()].map(row => row.sourceId));
  const title = thread.title.slice(0, 200);
  const result = kind === 'dossier'
    ? buildResearchDossier({ title, knownSourceIds, sections: [{ heading: title, passages }] })
    : buildTimeline({ title, knownSourceIds, nodes: passages.flatMap(p => {
      const timed = p.cited.filter(row => Number.isFinite(row.time));
      if (!timed.length) omitted++;
      return timed.map(row => ({ id: p.id + '-' + row.id, time: row.time, label: p.text,
        claims: p.claims.filter(claim => claim.sourceId === row.sourceId) }));
    }) });
  const count = kind === 'dossier' ? result.body.sections[0].passages.length : result.body.nodes.length;
  if (!count) return { ok: false, code: 'no-cited-content' };
  const used = new Set((kind === 'dossier' ? result.body.sections.flatMap(s => s.passages) : result.body.nodes)
    .flatMap(row => row.claims.map(claim => claim.sourceId)));
  result.body.origin = { threadId: thread.id, messageId: message.id, sourceKey: thread.sourceKey };
  result.body.evidence = [...sources.values()].filter(row => used.has(row.sourceId));
  result.body.omittedParagraphs = omitted;
  return result;
}

function editKeys(body) {
  if (body.type === 'matrix') return body.cells.map(c => 'cell:' + c.rowId + ':' + c.colId);
  if (body.type === 'timeline') return body.nodes.map(n => 'node:' + n.id);
  return body.sections.flatMap(s => s.passages.map(p => 'passage:' + p.id));
}

function validateSourcedBody(body) {
  if (!['dossier', 'timeline'].includes(body?.type) || typeof body.title !== 'string' || body.title.length > 2000 ||
      !body.origin || !['threadId', 'messageId', 'sourceKey'].every(key => typeof body.origin[key] === 'string' && body.origin[key].length > 0 && body.origin[key].length <= 6000) ||
      !Array.isArray(body.evidence) || body.evidence.length > 200 ||
      !Number.isSafeInteger(body.omittedParagraphs) || body.omittedParagraphs < 0) throw Error('Invalid sourced artifact.');
  const evidence = new Map();
  for (const row of body.evidence) {
    if (!row || !/^evidence:[a-f0-9]{32}$/.test(row.sourceId) || evidence.has(row.sourceId) ||
        typeof row.text !== 'string' || row.text.length > 2000 || typeof row.sourceKey !== 'string' ||
        row.sourceKey.length > 7000 || typeof row.id !== 'string' || row.id.length > 80 ||
        !['subtitle', 'page', 'feed', 'recall', 'book', 'film-review'].includes(row.sourceKind) ||
        row.time !== undefined && (!Number.isFinite(row.time) || row.time < 0)) throw Error('Invalid artifact evidence.');
    const expected = 'evidence:' + createHash('sha256').update(JSON.stringify([row.sourceKey, row.id])).digest('hex').slice(0, 32);
    if (row.sourceId !== expected || row.sourceKind === 'subtitle' && row.sourceKey !== body.origin.sourceKey) {
      throw Error('Artifact source identity changed.');
    }
    evidence.set(row.sourceId, row);
  }
  let entries;
  if (body.type === 'dossier') {
    if (!Array.isArray(body.sections) || body.sections.length !== 1 ||
        typeof body.sections[0]?.heading !== 'string' || body.sections[0].heading.length > 2000 ||
        !Array.isArray(body.sections[0].passages)) throw Error('Invalid dossier.');
    entries = body.sections[0].passages;
  } else {
    if (!Array.isArray(body.nodes)) throw Error('Invalid timeline.');
    entries = body.nodes;
  }
  if (!entries.length || entries.length > 200) throw Error('Invalid artifact entries.');
  const ids = new Set();
  for (const row of entries) {
    const text = body.type === 'dossier' ? row?.text : row?.label;
    if (typeof row?.id !== 'string' || !/^[\w-]{1,100}$/.test(row.id) || ids.has(row.id) ||
        typeof text !== 'string' || text.length > 2000 || row.spoiler !== undefined && !['open','closed'].includes(row.spoiler) || !Array.isArray(row.claims) ||
        !row.claims.length || row.claims.length > 200 ||
        body.type === 'timeline' && (!Number.isFinite(row.time) || row.time < 0)) throw Error('Invalid artifact entry.');
    ids.add(row.id);
    for (const claim of row.claims) {
      const source = evidence.get(claim?.sourceId);
      if (!source || claim.passageId !== source.id || claim.sourceKind !== source.sourceKind ||
          claim.quote !== source.text.slice(0, 280) ||
          body.type === 'timeline' && row.time !== source.time) throw Error('Invalid artifact claim.');
    }
  }
}

module.exports = { fromMessage, editKeys, validateSourcedBody };
