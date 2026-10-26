(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.BookTextPreparation = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";
  function preview(text) {
    if (typeof text !== "string" || text.length > 900000)
      throw Error("Invalid chapter text / Bölüm metni geçersiz.");
    // Only lowercase word fragments; names, acronyms, numeric ranges and
    // paragraph boundaries need human editing rather than a guessed repair.
    const pattern =
      /(?<![\p{L}\p{M}\p{N}])([\p{Ll}][\p{Ll}\p{M}]*)(\u00ad(?:[ \t]*\r?\n[ \t]*)?|-[ \t]*\r?\n[ \t]*)([\p{Ll}][\p{Ll}\p{M}]*)(?![\p{L}\p{M}\p{N}])/gu;
    const suggestions = [];
    let truncated = false;
    for (const match of text.matchAll(pattern)) {
      if (suggestions.length >= 200) {
        truncated = true;
        break;
      }
      const start = match.index;
      suggestions.push({
        id: String(start),
        start,
        end: start + match[0].length,
        before: match[0],
        joined: match[1] + match[3],
        hyphenated: match[1] + "-" + match[3],
        soft: match[2].startsWith("\u00ad"),
        context: text.slice(
          Math.max(0, start - 45),
          Math.min(text.length, start + match[0].length + 45),
        ),
      });
    }
    return { suggestions, truncated };
  }
  function apply(current, snapshot, choices) {
    if (current !== snapshot)
      throw Error(
        "Text changed; preview it again / Metin değişti; yeniden önizleyin.",
      );
    const { suggestions } = preview(snapshot),
      known = new Set(suggestions.map((s) => s.id));
    for (const [id, choice] of Object.entries(choices))
      if (!known.has(id) || !["keep", "join", "hyphen"].includes(choice))
        throw Error("Invalid text change / Metin değişikliği geçersiz.");
    let text = snapshot,
      count = 0;
    for (const suggestion of suggestions.toReversed()) {
      const choice = choices[suggestion.id] || "keep";
      if (choice === "keep") continue;
      if (suggestion.soft && choice === "hyphen")
        throw Error(
          "Invalid soft hyphen change / Yumuşak tire değişikliği geçersiz.",
        );
      text =
        text.slice(0, suggestion.start) +
        (choice === "join" ? suggestion.joined : suggestion.hyphenated) +
        text.slice(suggestion.end);
      count++;
    }
    return { text, count };
  }
  return Object.freeze({ preview, apply });
});
