const crypto = require('crypto');

const SEARCH_SCOPES = new Set(['all', 'tabs', 'subtitles', 'notes', 'bookmarks']);

function foldLibraryText(value) {
  return String(value || '').normalize('NFKC').toLocaleLowerCase('tr-TR');
}

function boundedText(value, limit) {
  return String(value || '').trim().slice(0, limit);
}

function stableId(prefix, parts) {
  const hash = crypto.createHash('sha256').update(parts.map((part) => String(part || '')).join('\u241f'), 'utf8')
    .digest('hex').slice(0, 20);
  return `${prefix}:${hash}`;
}

function normalizeSearchScope(value) {
  const scope = String(value || 'all').toLowerCase();
  return SEARCH_SCOPES.has(scope) ? scope : 'all';
}

function includesQuery(query, values) {
  const folded = foldLibraryText(query);
  return !!folded && values.some((value) => foldLibraryText(value).includes(folded));
}

function unifiedLibrarySearch(input = {}) {
  const query = boundedText(input.query, 500);
  const scope = normalizeSearchScope(input.scope);
  const limit = Math.max(1, Math.min(500, Number(input.limit) || 100));
  if (!query) return [];
  const rows = [];
  const allow = (kind) => scope === 'all' || scope === kind;
  const push = (row) => {
    if (!row || !row.id || rows.some((item) => item.id === row.id)) return;
    rows.push(row);
  };

  if (allow('tabs')) {
    for (const tab of Array.isArray(input.tabs) ? input.tabs : []) {
      if (!includesQuery(query, [tab.title, tab.url, tab.mediaId])) continue;
      push({
        id: `tab:${boundedText(tab.id, 180)}`, kind: 'tabs', title: boundedText(tab.title || tab.url || 'Açık sekme', 500),
        snippet: boundedText(tab.url, 500), tabId: boundedText(tab.id, 180), mediaId: boundedText(tab.mediaId, 240),
        url: boundedText(tab.url, 2000), action: 'activate-tab', updatedAt: Date.now(),
      });
    }
  }
  if (allow('bookmarks')) {
    for (const bookmark of Array.isArray(input.bookmarks) ? input.bookmarks : []) {
      if (!includesQuery(query, [bookmark.title, bookmark.url, bookmark.folder])) continue;
      push({
        id: stableId('bookmark', [bookmark.url]), kind: 'bookmarks', title: boundedText(bookmark.title || bookmark.url || 'Yer imi', 500),
        snippet: boundedText([bookmark.folder, bookmark.url].filter(Boolean).join(' · '), 500),
        url: boundedText(bookmark.url, 2000), action: 'open-url', updatedAt: Number(bookmark.visitedAt) || 0,
      });
    }
  }
  if (scope === 'all') {
    for (const item of Array.isArray(input.library) ? input.library : []) {
      if (!includesQuery(query, [item.title, item.sourceRef, ...(item.collections || [])])) continue;
      push({
        id: `media:${boundedText(item.key, 240)}`, kind: 'media', title: boundedText(item.title || 'Kayıtlı içerik', 500),
        snippet: boundedText((item.collections || []).join(' · '), 500), mediaId: boundedText(item.key, 240),
        mediaType: boundedText(item.type, 40), url: boundedText(item.sourceRef, 2000), seconds: Number(item.position) || 0,
        action: 'open-media', updatedAt: Number(item.lastWatched) || 0,
      });
    }
  }
  if (allow('subtitles')) {
    for (const hit of Array.isArray(input.cueHits) ? input.cueHits : []) {
      const cueId = boundedText(hit.cue_id ?? hit.cueId, 180);
      const trackId = boundedText(hit.track_id ?? hit.trackId, 300);
      push({
        id: stableId('cue', [trackId, cueId, hit.start, hit.source_text, hit.translation_text]), kind: 'subtitles',
        title: boundedText(hit.title || 'Altyazı eşleşmesi', 500), snippet: boundedText(hit.snippet || hit.translation_text || hit.source_text, 800),
        mediaId: boundedText(hit.media_id ?? hit.mediaId, 240), mediaType: boundedText(hit.service, 40),
        url: boundedText(hit.url, 2000), trackId, cueId, seconds: Math.max(0, Number(hit.start) || 0),
        role: hit.role === 'translation' ? 'translation' : 'source', language: boundedText(hit.language, 40),
        model: boundedText(hit.model, 160), provider: boundedText(hit.provider, 300), updatedAt: Number(hit.updated_at) || 0,
        action: 'open-cue',
      });
    }
  }
  if (allow('notes')) {
    for (const note of Array.isArray(input.notes) ? input.notes : []) {
      const id = boundedText(note.id, 180);
      push({
        id: `note:${id}`, kind: 'notes', title: boundedText(note.mediaTitle || note.title || 'Not', 500),
        snippet: boundedText([note.source, note.translation, note.note].filter(Boolean).join(' · '), 800),
        mediaId: boundedText(note.mediaId ?? note.media_id, 240), mediaType: boundedText(note.mediaType || note.service, 40),
        url: boundedText(note.mediaUrl || note.url, 2000), annotationId: id,
        seconds: Math.max(0, Number(note.start) || 0), updatedAt: Number(note.updatedAt || note.updated_at) || 0,
        anchor: note.anchor && typeof note.anchor === 'object' ? note.anchor : null,
        action: note.anchor ? 'open-anchor' : 'open-note',
      });
    }
  }
  return rows.sort((a, b) => Number(b.updatedAt) - Number(a.updatedAt)).slice(0, limit);
}

function normalizeCollectionName(value) {
  return boundedText(value, 80).replace(/\s+/g, ' ');
}

function collectionNames(items) {
  return [...new Set((Array.isArray(items) ? items : []).flatMap((item) =>
    (Array.isArray(item.collections) ? item.collections : []).map(normalizeCollectionName).filter(Boolean)))]
    .sort((a, b) => a.localeCompare(b, 'tr'));
}

function renameCollection(items, previousName, nextName) {
  const previous = normalizeCollectionName(previousName);
  const next = normalizeCollectionName(nextName);
  if (!previous || !next) throw new TypeError('Eski ve yeni koleksiyon adı gerekli.');
  return (Array.isArray(items) ? items : []).map((item) => ({
    ...item,
    collections: [...new Set((item.collections || []).map((name) => normalizeCollectionName(name) === previous ? next : normalizeCollectionName(name)).filter(Boolean))],
  }));
}

function removeCollection(items, name) {
  const target = normalizeCollectionName(name);
  return (Array.isArray(items) ? items : []).map((item) => ({
    ...item, collections: (item.collections || []).map(normalizeCollectionName).filter((value) => value && value !== target),
  }));
}

function setCollectionMembership(items, keys, name, member) {
  const targetKeys = new Set((Array.isArray(keys) ? keys : []).map(String));
  const collection = normalizeCollectionName(name);
  if (!collection) throw new TypeError('Koleksiyon adı gerekli.');
  return (Array.isArray(items) ? items : []).map((item) => {
    if (!targetKeys.has(String(item.key))) return { ...item };
    const values = new Set((item.collections || []).map(normalizeCollectionName).filter(Boolean));
    if (member !== false) values.add(collection); else values.delete(collection);
    return { ...item, collections: [...values] };
  });
}

function reorderCollection(items, name, orderedKeys) {
  const collection = normalizeCollectionName(name);
  const order = new Map((Array.isArray(orderedKeys) ? orderedKeys : []).map((key, index) => [String(key), index]));
  return (Array.isArray(items) ? items : []).map((item) => {
    const prefs = { ...(item.prefs || {}) };
    const positions = { ...(prefs.collectionOrder || {}) };
    if ((item.collections || []).includes(collection) && order.has(String(item.key))) positions[collection] = order.get(String(item.key));
    prefs.collectionOrder = positions;
    return { ...item, prefs };
  });
}

function normalizeTextAnchor(raw = {}) {
  const exact = boundedText(raw.exact, 4000);
  if (!exact) return null;
  return {
    version: 1,
    kind: 'text',
    exact,
    prefix: boundedText(raw.prefix, 240),
    suffix: boundedText(raw.suffix, 240),
    blockId: boundedText(raw.blockId, 180),
    domPath: boundedText(raw.domPath, 800),
    documentId: boundedText(raw.documentId, 240),
  };
}

function resolveTextAnchor(anchor, rawBlocks) {
  const target = normalizeTextAnchor(anchor);
  if (!target) return { status: 'missing', matches: [] };
  const blocks = (Array.isArray(rawBlocks) ? rawBlocks : []).map((block, index) => ({
    index, id: boundedText(block?.id, 180), path: boundedText(block?.path, 800), text: String(block?.text || '').normalize('NFKC'),
  }));
  const exact = target.exact.normalize('NFKC');
  const score = (block) => {
    const at = block.text.indexOf(exact);
    if (at < 0) return null;
    let points = 10;
    if (target.blockId && block.id === target.blockId) points += 100;
    if (target.domPath && block.path === target.domPath) points += 20;
    if (target.prefix && block.text.slice(Math.max(0, at - target.prefix.length), at).endsWith(target.prefix.normalize('NFKC'))) points += 8;
    if (target.suffix && block.text.slice(at + exact.length).startsWith(target.suffix.normalize('NFKC'))) points += 8;
    return { ...block, offset: at, score: points };
  };
  const candidates = blocks.map(score).filter(Boolean).sort((a, b) => b.score - a.score || a.index - b.index);
  if (!candidates.length) return { status: 'missing', matches: [] };
  if (candidates.length > 1 && candidates[0].score === candidates[1].score) return { status: 'ambiguous', matches: candidates };
  return { status: 'found', match: candidates[0], matches: candidates };
}

function normalizeMangaPosition(raw = {}) {
  const ratio = Number(raw.ratio);
  return {
    version: 1, documentId: boundedText(raw.documentId, 240), imageId: boundedText(raw.imageId, 240),
    ratio: Number.isFinite(ratio) ? Math.max(0, Math.min(1, ratio)) : 0,
    ordinal: Math.max(0, Math.min(100000, Math.trunc(Number(raw.ordinal) || 0))), updatedAt: Number(raw.updatedAt) || Date.now(),
  };
}

function resolveMangaPosition(saved, candidates, documentId) {
  const position = normalizeMangaPosition(saved);
  if (!position.imageId || (position.documentId && documentId && position.documentId !== documentId)) return { status: 'wrong-document' };
  const list = Array.isArray(candidates) ? candidates : [];
  let match = list.find((item) => String(item.id || '') === position.imageId);
  if (!match && list[position.ordinal]) match = list[position.ordinal];
  if (!match) return { status: 'missing' };
  return { status: 'found', match, ratio: position.ratio };
}

class ReopenGuard {
  constructor() { this.sequence = 0; }
  begin(target = {}) { return { sequence: ++this.sequence, target: { ...target } }; }
  cancel() { this.sequence += 1; }
  current(ticket, context = {}) {
    if (!ticket || ticket.sequence !== this.sequence) return false;
    if (ticket.target.tabId && context.tabId && ticket.target.tabId !== context.tabId) return false;
    if (ticket.target.mediaId && context.mediaId && ticket.target.mediaId !== context.mediaId) return false;
    if (ticket.target.generation !== undefined && context.generation !== undefined
      && Number(ticket.target.generation) !== Number(context.generation)) return false;
    return true;
  }
}

module.exports = {
  SEARCH_SCOPES,
  ReopenGuard,
  collectionNames,
  foldLibraryText,
  normalizeCollectionName,
  normalizeMangaPosition,
  normalizeSearchScope,
  normalizeTextAnchor,
  removeCollection,
  renameCollection,
  reorderCollection,
  resolveMangaPosition,
  resolveTextAnchor,
  setCollectionMembership,
  unifiedLibrarySearch,
};
