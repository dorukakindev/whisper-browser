'use strict';

(function exposeWatchLibraryView(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.watchLibraryView = api;
}(typeof window !== 'undefined' ? window : null, () => {
  const NORMAL_ROW_HEIGHT = 112;
  const SEARCH_ROW_HEIGHT = 246;
  const ROW_GAP = 8;
  const DEFAULT_OVERSCAN = 5;
  const metadataTextCache = new WeakMap();

  function watchProgress(item) {
    const duration = Number(item && item.duration) || 0;
    const position = Number(item && item.position) || 0;
    return duration > 0 ? Math.max(0, Math.min(100, (position / duration) * 100)) : 0;
  }

  function itemMatchesFilter(item, filter) {
    if (filter === 'continue') return !item.completed && watchProgress(item) > 0;
    if (filter === 'completed') return !!item.completed;
    if (String(filter || '').startsWith('collection:')) {
      return (item.collections || []).includes(String(filter).slice(11));
    }
    return true;
  }

  function selectWatchItems(items, filter) {
    const source = Array.isArray(items) ? items : [];
    return !filter || filter === 'all' ? source : source.filter((item) => itemMatchesFilter(item, filter));
  }

  function collectionNames(items) {
    return [...new Set((Array.isArray(items) ? items : [])
      .flatMap((item) => item && Array.isArray(item.collections) ? item.collections : []))]
      .sort((a, b) => String(a).localeCompare(String(b), 'tr'));
  }

  function continuingCount(items) {
    let count = 0;
    for (const item of Array.isArray(items) ? items : []) {
      if (item && !item.completed && watchProgress(item) > 0) count += 1;
    }
    return count;
  }

  function normalizeSearch(value) {
    return String(value || '').trim().toLocaleLowerCase('tr');
  }

  function searchMetadata(items, query) {
    const normalized = normalizeSearch(query);
    const source = Array.isArray(items) ? items : [];
    if (!normalized) return source;
    return source.filter((item) => {
      if (!item || typeof item !== 'object') return false;
      const signature = `${item.title || ''}\u0000${item.sourceRef || ''}\u0000${(item.collections || []).join('\u0001')}`;
      const cached = metadataTextCache.get(item);
      if (cached && cached.signature === signature) return cached.text.includes(normalized);
      const text = signature.toLocaleLowerCase('tr');
      metadataTextCache.set(item, { signature, text });
      return text.includes(normalized);
    });
  }

  function sortByLastWatched(items, limit = 10000) {
    return (Array.isArray(items) ? items : []).slice()
      .sort((a, b) => (Number(b && b.lastWatched) || 0) - (Number(a && a.lastWatched) || 0))
      .slice(0, Math.max(0, Math.trunc(Number(limit) || 0)));
  }

  function virtualRange({ total, scrollTop, viewportHeight, rowHeight, overscan = DEFAULT_OVERSCAN, pinnedIndex = -1 }) {
    const safeTotal = Math.max(0, Math.trunc(Number(total) || 0));
    const safeRowHeight = Math.max(1, Number(rowHeight) || NORMAL_ROW_HEIGHT);
    const extent = safeRowHeight + ROW_GAP;
    const safeTop = Math.max(0, Number(scrollTop) || 0);
    const safeViewport = Math.max(safeRowHeight, Number(viewportHeight) || 600);
    let start = Math.max(0, Math.floor(safeTop / extent) - overscan);
    let end = Math.min(safeTotal, Math.ceil((safeTop + safeViewport) / extent) + overscan);
    if (pinnedIndex >= 0 && pinnedIndex < safeTotal
        && pinnedIndex >= start - overscan && pinnedIndex < end + overscan) {
      start = Math.min(start, pinnedIndex);
      end = Math.max(end, pinnedIndex + 1);
    }
    return {
      start,
      end,
      rowHeight: safeRowHeight,
      extent,
      topSpace: start * extent,
      bottomSpace: Math.max(0, (safeTotal - end) * extent),
    };
  }

  function anchorSnapshot(items, scrollTop, rowHeight) {
    const source = Array.isArray(items) ? items : [];
    const extent = Math.max(1, Number(rowHeight) || NORMAL_ROW_HEIGHT) + ROW_GAP;
    const index = Math.min(Math.max(0, Math.floor(Math.max(0, Number(scrollTop) || 0) / extent)), Math.max(0, source.length - 1));
    return {
      key: source[index] && source[index].key,
      offset: Math.max(0, Number(scrollTop) || 0) - index * extent,
    };
  }

  function anchoredScrollTop(items, anchor, rowHeight) {
    if (!anchor || !anchor.key) return 0;
    const source = Array.isArray(items) ? items : [];
    const index = source.findIndex((item) => item && item.key === anchor.key);
    if (index < 0) return Math.max(0, Number(anchor.fallbackTop) || 0);
    const extent = Math.max(1, Number(rowHeight) || NORMAL_ROW_HEIGHT) + ROW_GAP;
    return Math.max(0, index * extent + Math.max(0, Number(anchor.offset) || 0));
  }

  function rowHeightForSearch(searching) {
    return searching ? SEARCH_ROW_HEIGHT : NORMAL_ROW_HEIGHT;
  }

  return {
    DEFAULT_OVERSCAN,
    NORMAL_ROW_HEIGHT,
    ROW_GAP,
    SEARCH_ROW_HEIGHT,
    anchorSnapshot,
    anchoredScrollTop,
    collectionNames,
    continuingCount,
    itemMatchesFilter,
    normalizeSearch,
    rowHeightForSearch,
    selectWatchItems,
    searchMetadata,
    sortByLastWatched,
    virtualRange,
    watchProgress,
  };
}));
