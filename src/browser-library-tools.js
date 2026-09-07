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
  return (Array.isArray(items) ? items : []).map((item) => {
    const prefs = { ...(item.prefs || {}) };
    const collectionOrder = { ...(prefs.collectionOrder || {}) };
    if (Object.prototype.hasOwnProperty.call(collectionOrder, previous)) {
      collectionOrder[next] = collectionOrder[previous];
      delete collectionOrder[previous];
    }
    if (prefs.collectionOrder || Object.keys(collectionOrder).length) prefs.collectionOrder = collectionOrder;
    return {
      ...item,
      prefs,
      collections: [...new Set((item.collections || []).map((name) => {
        const normalized = normalizeCollectionName(name);
        return normalized === previous ? next : normalized;
      }).filter(Boolean))],
    };
  });
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
    const collections = (item.collections || []).map(normalizeCollectionName).filter(Boolean);
    if (collections.includes(collection) && order.has(String(item.key))) positions[collection] = order.get(String(item.key));
    prefs.collectionOrder = positions;
    return { ...item, prefs };
  });
}

function normalizeTextAnchor(raw = {}) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
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

function selectionAnchorCaptureScript(documentId = '') {
  return `(() => {
    const selection = window.getSelection?.();
    if (!selection || selection.rangeCount !== 1 || selection.isCollapsed) return { ok: false, error: 'Seçili metin bulunamadı.' };
    const range = selection.getRangeAt(0);
    const node = range.commonAncestorContainer?.nodeType === 1 ? range.commonAncestorContainer : range.commonAncestorContainer?.parentElement;
    if (!node || node.closest?.('input, textarea, select, [contenteditable="true"], [contenteditable=""]')) {
      return { ok: false, error: 'Form ve düzenlenebilir alanlardaki metin notlara eklenemez.' };
    }
    const exact = String(selection.toString() || '').trim().slice(0, 4000);
    if (!exact) return { ok: false, error: 'Seçili metin bulunamadı.' };
    const block = node.closest?.('p, li, blockquote, figcaption, td, th, article, section, h1, h2, h3, h4, h5, h6, div') || node;
    const blockText = String(block.textContent || '').replace(/\\s+/g, ' ').trim().slice(0, 16000);
    const normalizedExact = exact.replace(/\\s+/g, ' ').trim();
    const at = blockText.indexOf(normalizedExact);
    const domPath = (element) => {
      const parts = [];
      let current = element;
      while (current && current.nodeType === 1 && current !== document.documentElement && parts.length < 10) {
        if (current.id) { parts.unshift('#' + CSS.escape(current.id)); break; }
        const name = current.localName;
        const peers = current.parentElement ? [...current.parentElement.children].filter((item) => item.localName === name) : [];
        parts.unshift(name + (peers.length > 1 ? ':nth-of-type(' + (peers.indexOf(current) + 1) + ')' : ''));
        current = current.parentElement;
      }
      return parts.join(' > ').slice(0, 800);
    };
    return { ok: true, anchor: {
      version: 1, kind: 'text', exact,
      prefix: at >= 0 ? blockText.slice(Math.max(0, at - 240), at) : '',
      suffix: at >= 0 ? blockText.slice(at + normalizedExact.length, at + normalizedExact.length + 240) : '',
      blockId: String(block.id || '').slice(0, 180), domPath: domPath(block),
      documentId: ${JSON.stringify(String(documentId || '').slice(0, 240))}
    }};
  })()`;
}

function textAnchorRestoreScript(rawAnchor) {
  const anchor = normalizeTextAnchor(rawAnchor);
  return `(() => {
    const anchor = ${JSON.stringify(anchor)};
    if (!anchor) return { status: 'missing' };
    const exact = String(anchor.exact || '').replace(/\\s+/g, ' ').trim();
    const blocks = [...document.querySelectorAll('p, li, blockquote, figcaption, td, th, article, section, h1, h2, h3, h4, h5, h6, div')]
      .filter((element) => !element.closest('[data-whisper-page-overlay], [data-whisper-manga-overlay], input, textarea, select, [contenteditable]'))
      .slice(0, 12000);
    const candidates = [];
    for (const element of blocks) {
      const text = String(element.textContent || '').replace(/\\s+/g, ' ').trim().slice(0, 16000);
      const at = text.indexOf(exact);
      if (at < 0) continue;
      let score = 10;
      if (anchor.blockId && element.id === anchor.blockId) score += 100;
      if (anchor.prefix && text.slice(Math.max(0, at - anchor.prefix.length), at).endsWith(anchor.prefix.replace(/\\s+/g, ' ').trim())) score += 8;
      if (anchor.suffix && text.slice(at + exact.length).startsWith(anchor.suffix.replace(/\\s+/g, ' ').trim())) score += 8;
      if (anchor.domPath) {
        try {
          const matched = document.querySelector(anchor.domPath);
          if (matched === element) score += 20;
        } catch (_) {}
      }
      candidates.push({ element, at, score });
    }
    const specific = candidates.filter((candidate) => !candidates.some((other) =>
      other !== candidate && candidate.score <= other.score && candidate.element.contains?.(other.element)));
    specific.sort((a, b) => b.score - a.score);
    if (!candidates.length) return { status: 'missing' };
    if (specific.length > 1 && specific[0].score === specific[1].score) return { status: 'ambiguous', count: specific.length };
    document.querySelectorAll('[data-whisper-note-highlight]').forEach((item) => {
      item.removeAttribute('data-whisper-note-highlight'); item.style.removeProperty('outline'); item.style.removeProperty('outline-offset');
    });
    const target = specific[0].element;
    target.setAttribute('data-whisper-note-highlight', '');
    target.style.setProperty('outline', '2px solid #e0a95b', 'important');
    target.style.setProperty('outline-offset', '4px', 'important');
    target.scrollIntoView({ behavior: 'smooth', block: 'center' });
    setTimeout(() => {
      if (!target.isConnected) return;
      target.removeAttribute('data-whisper-note-highlight'); target.style.removeProperty('outline'); target.style.removeProperty('outline-offset');
    }, 8000);
    return { status: 'found', count: candidates.length };
  })()`;
}

function mangaPositionCaptureScript(documentId = '') {
  return `(() => {
    const images = [...document.images].filter((image) => image.getAttribute('data-whisper-manga-id') && image.getBoundingClientRect().height > 1);
    if (!images.length) return null;
    const focusY = Math.max(0, Math.min(innerHeight, innerHeight * 0.38));
    let best = null;
    for (let ordinal = 0; ordinal < images.length; ordinal++) {
      const image = images[ordinal]; const rect = image.getBoundingClientRect();
      const distance = focusY < rect.top ? rect.top - focusY : focusY > rect.bottom ? focusY - rect.bottom : 0;
      if (!best || distance < best.distance) best = { image, rect, ordinal, distance };
    }
    if (!best) return null;
    return { version: 1, documentId: ${JSON.stringify(String(documentId || '').slice(0, 240))},
      imageId: best.image.getAttribute('data-whisper-manga-id'), ordinal: best.ordinal,
      ratio: Math.max(0, Math.min(1, (focusY - best.rect.top) / best.rect.height)), updatedAt: Date.now() };
  })()`;
}

function mangaPositionRestoreScript(rawPosition) {
  const position = normalizeMangaPosition(rawPosition);
  return `(() => {
    const saved = ${JSON.stringify(position)};
    if (!saved || !saved.imageId) return { status: 'missing' };
    const images = [...document.images].filter((image) => image.getAttribute('data-whisper-manga-id'));
    const image = images.find((item) => item.getAttribute('data-whisper-manga-id') === saved.imageId) || images[saved.ordinal];
    if (!image) return { status: 'pending' };
    const rect = image.getBoundingClientRect();
    if (rect.height < 2 || !image.complete) return { status: 'pending' };
    const target = window.scrollY + rect.top + rect.height * saved.ratio - innerHeight * .38;
    window.scrollTo({ top: Math.max(0, target), behavior: 'auto' });
    return { status: 'found' };
  })()`;
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
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const ratio = Number(raw.ratio);
  const position = {
    version: 1, documentId: boundedText(raw.documentId, 240), imageId: boundedText(raw.imageId, 240),
    ratio: Number.isFinite(ratio) ? Math.max(0, Math.min(1, ratio)) : 0,
    ordinal: Math.max(0, Math.min(100000, Math.trunc(Number(raw.ordinal) || 0))), updatedAt: Number(raw.updatedAt) || Date.now(),
  };
  return position.imageId ? position : null;
}

function resolveMangaPosition(saved, candidates, documentId) {
  const position = normalizeMangaPosition(saved);
  if (!position) return { status: 'missing' };
  if (position.documentId && documentId && position.documentId !== documentId) return { status: 'wrong-document' };
  const list = Array.isArray(candidates) ? candidates : [];
  let match = list.find((item) => String(item.id || '') === position.imageId);
  if (!match && list[position.ordinal]) match = list[position.ordinal];
  if (!match) return { status: 'missing' };
  return { status: 'found', match, ratio: position.ratio };
}

async function waitForMangaPosition(options = {}) {
  const scan = typeof options.scan === 'function' ? options.scan : async () => ({ status: 'missing' });
  const sleep = typeof options.sleep === 'function' ? options.sleep : (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const isCanceled = typeof options.isCanceled === 'function' ? options.isCanceled : () => false;
  const attempts = Math.max(1, Math.min(20, Number(options.attempts) || 10));
  for (let attempt = 0; attempt < attempts; attempt++) {
    if (isCanceled()) return { status: 'canceled', attempts: attempt };
    const result = await scan(attempt);
    if (result?.status === 'found' || result?.status === 'wrong-document') return { ...result, attempts: attempt + 1 };
    if (attempt + 1 < attempts) await sleep(Math.max(0, Number(options.delayMs) || 250));
  }
  return { status: isCanceled() ? 'canceled' : 'missing', attempts };
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
  mangaPositionCaptureScript,
  mangaPositionRestoreScript,
  removeCollection,
  renameCollection,
  reorderCollection,
  resolveMangaPosition,
  resolveTextAnchor,
  selectionAnchorCaptureScript,
  setCollectionMembership,
  unifiedLibrarySearch,
  textAnchorRestoreScript,
  waitForMangaPosition,
};
