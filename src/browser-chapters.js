(function exposeBrowserChapters(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.WhisperBrowserChapters = api;
}(typeof globalThis !== 'undefined' ? globalThis : this, () => {
  function normalizeChapter(raw, source = 'native') {
    const start = Number(raw?.start ?? raw?.startTime ?? raw?.start_time);
    const end = Number(raw?.end ?? raw?.endTime ?? raw?.end_time);
    const title = String(raw?.title || raw?.description || '').replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, 240);
    if (!Number.isFinite(start) || start < 0 || !title) return null;
    return {
      ...raw,
      start,
      ...(Number.isFinite(end) && end > start ? { end } : {}),
      title,
      source: raw?.source === 'sponsorblock' ? 'sponsorblock' : source,
    };
  }

  function mergeBrowserChapters(nativeChapters, sponsorChapters, toleranceSeconds = 1.5) {
    const tolerance = Math.max(0, Math.min(10, Number(toleranceSeconds) || 0));
    const native = (Array.isArray(nativeChapters) ? nativeChapters : [])
      .map((chapter) => normalizeChapter(chapter, 'native')).filter(Boolean)
      .sort((a, b) => a.start - b.start);
    const sponsor = (Array.isArray(sponsorChapters) ? sponsorChapters : [])
      .map((chapter) => normalizeChapter(chapter, 'sponsorblock')).filter(Boolean)
      .sort((a, b) => a.start - b.start);
    const merged = native.slice();
    for (const candidate of sponsor) {
      if (merged.some((chapter) => Math.abs(chapter.start - candidate.start) <= tolerance)) continue;
      merged.push(candidate);
    }
    return merged.sort((a, b) => a.start - b.start || (a.source === 'native' ? -1 : 1));
  }

  return { mergeBrowserChapters, normalizeChapter };
}));
