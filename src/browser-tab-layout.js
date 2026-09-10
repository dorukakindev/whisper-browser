(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.BrowserTabLayout = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  const GROUP_COLORS = Object.freeze(['amber', 'cyan', 'green', 'gray']);
  function normalizeTabGroup(raw) {
    if (!raw) return null;
    const value = typeof raw === 'string' ? { name: raw } : raw;
    const name = String(value?.name || '').trim().replace(/\s+/g, ' ').slice(0, 48);
    if (!name) return null;
    return { name, color: GROUP_COLORS.includes(value.color) ? value.color : 'amber' };
  }
  function reorderIds(currentIds, requestedIds) {
    const current = Array.isArray(currentIds) ? currentIds.map(String) : [];
    const requested = Array.isArray(requestedIds) ? requestedIds.map(String) : [];
    if (current.length !== requested.length || new Set(requested).size !== current.length
        || current.some((id) => !requested.includes(id))) return null;
    return requested;
  }
  function splitBrowserBounds(rawBounds, rawRatio = 0.5, gap = 6) {
    if (!rawBounds) return null;
    const bounds = { x: Math.round(Number(rawBounds.x) || 0), y: Math.round(Number(rawBounds.y) || 0),
      width: Math.max(1, Math.round(Number(rawBounds.width) || 1)), height: Math.max(1, Math.round(Number(rawBounds.height) || 1)) };
    const ratio = Math.max(0.25, Math.min(0.75, Number(rawRatio) || 0.5));
    const safeGap = Math.max(0, Math.min(24, Math.round(Number(gap) || 0)));
    const available = Math.max(2, bounds.width - safeGap);
    const firstWidth = Math.max(1, Math.min(available - 1, Math.round(available * ratio)));
    return {
      ratio,
      primary: { x: bounds.x, y: bounds.y, width: firstWidth, height: bounds.height },
      secondary: { x: bounds.x + firstWidth + safeGap, y: bounds.y,
        width: Math.max(1, available - firstWidth), height: bounds.height },
    };
  }
  return { GROUP_COLORS, normalizeTabGroup, reorderIds, splitBrowserBounds };
});
