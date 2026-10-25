(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.BookProductionPlan = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";
  const normalize = (text) =>
    String(text || "")
      .replace(/\s+/g, " ")
      .trim();
  function compare(groups, previous) {
    const keys = new Set();
    if (!Array.isArray(groups) || !groups.length || groups.length > 1000)
      throw Error("Invalid chapter plan / Bölüm planı geçersiz.");
    for (const g of groups) {
      if (
        !g ||
        typeof g.key !== "string" ||
        g.key.length > 2000 ||
        !/^\d+(?:,\d+)*$/.test(g.key) ||
        keys.has(g.key) ||
        typeof g.text !== "string" ||
        !g.text.trim() ||
        g.text.length > 8000
      )
        throw Error("Invalid chapter plan / Bölüm planı geçersiz.");
      keys.add(g.key);
    }
    const pool = new Map();
    for (const g of Array.isArray(previous) ? previous.slice(0, 1000) : []) {
      const text = normalize(g?.text);
      if (!text) continue;
      if (!pool.has(text)) pool.set(text, []);
      pool.get(text).push(g);
    }
    let same = 0;
    const rows = groups.map((g) => {
      const matches = pool.get(normalize(g.text)),
        unchanged = !!matches?.length;
      if (unchanged) {
        matches.shift();
        same++;
      }
      return { key: g.key, text: g.text, unchanged };
    });
    return {
      rows,
      same,
      changed: rows.length - same,
      previousOnly: [...pool.values()].flat().map((g) => g.text),
    };
  }
  return Object.freeze({ compare });
});
