(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.BookTextSearch = factory();
})(typeof window === "object" ? window : globalThis, () => {
  "use strict";
  function folded(value) {
    const source = String(value || ""),
      starts = [],
      ends = [];
    let text = "";
    const normalized = source.normalize("NFKC"),
      lowered = normalized.toLocaleLowerCase("tr").replace(/ı/g,"i");
    if (normalized === source && lowered.length === source.length) {
      for (let i = 0; i < lowered.length; i++) {
        const c = /\s/u.test(lowered[i]) ? " " : lowered[i];
        if (c === " " && text.endsWith(" ")) {
          ends[ends.length - 1] = i + 1;
          continue;
        }
        text += c;
        starts.push(i);
        ends.push(i + 1);
      }
    } else {
      for (const match of source.matchAll(/\P{M}\p{M}*|\p{M}+/gu)) {
        const part = match[0].normalize("NFKC").toLocaleLowerCase("tr").replace(/ı/g,"i");
        for (let i = 0; i < part.length; i++) {
          const c = /\s/u.test(part[i]) ? " " : part[i];
          if (c === " " && text.endsWith(" ")) {
            ends[ends.length - 1] = match.index + match[0].length;
            continue;
          }
          text += c;
          starts.push(match.index);
          ends.push(match.index + match[0].length);
        }
      }
    }
    return { text, starts, ends };
  }
  async function search(
    chapters,
    query,
    {
      limit = 80,
      isCurrent = () => true,
      yieldTask = () => new Promise((resolve) => setTimeout(resolve, 0)),
    } = {},
  ) {
    const needle = folded(String(query || "").slice(0, 160)).text.trim(),
      matches = [];
    if (needle.length < 2)
      return { matches, truncated: false, cancelled: false };
    for (
      let chapter = 0;
      chapter < Math.min(chapters.length, 1000);
      chapter++
    ) {
      if (!isCurrent())
        return { matches: [], truncated: false, cancelled: true };
      const source = String(chapters[chapter]?.text || ""),
        body = folded(source);
      let at = 0;
      while ((at = body.text.indexOf(needle, at)) !== -1) {
        if (matches.length === limit)
          return { matches, truncated: true, cancelled: false };
        const start = body.starts[at],
          end = body.ends[at + needle.length - 1];
        matches.push({
          chapter,
          start,
          end,
          excerpt: source
            .slice(Math.max(0, start - 50), Math.min(source.length, end + 90))
            .replace(/\s+/g, " "),
        });
        at += needle.length;
      }
      await yieldTask();
    }
    return { matches, truncated: chapters.length > 1000, cancelled: !isCurrent() };
  }
  // Speech groups are ordered. Matching from the previous group's end prevents
  // repeated dialogue from selecting the first occurrence again.
  function locateSpeechGroup(text, groups, groupIndex) {
    if (!Array.isArray(groups) || !Number.isInteger(groupIndex) || groupIndex < 0 || groupIndex >= groups.length) return null;
    const body = folded(text);
    let cursor = 0;
    for (let i = 0; i <= groupIndex; i++) {
      const needle = folded(groups[i]?.text).text.trim();
      if (!needle) return null;
      const at = body.text.indexOf(needle, cursor);
      if (at < 0) return null;
      cursor = at + needle.length;
      if (i === groupIndex) return { start: body.starts[at], end: body.ends[cursor - 1] };
    }
    return null;
  }
  return Object.freeze({ search, locateSpeechGroup });
});
