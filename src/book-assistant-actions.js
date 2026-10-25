(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.BookAssistantActions = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";
  const normalized = (text) =>
    String(text || "")
      .replace(/\s+/g, " ")
      .trim();
  async function prepare(kind, source, t, cryptoApi = globalThis.crypto) {
    if (
      !["explain", "summary"].includes(kind) ||
      !source ||
      !["book-chapter", "book-page"].includes(source.type) ||
      !source.id ||
      typeof source.text !== "string" ||
      !source.text.trim() ||
      source.text.length > 1000000
    )
      throw Error(
        t("Readable book text is required.", "Okunabilir kitap metni gerekli."),
      );
    const selected = String(source.selectedText || "")
      .trim()
      .slice(0, 4000);
    if (
      kind === "explain" &&
      (!selected || !normalized(source.text).includes(normalized(selected)))
    )
      throw Error(
        t(
          "Select a passage in the current chapter first.",
          "Önce açık bölümden bir pasaj seç.",
        ),
      );
    if (kind === "summary" && source.text.length > 100000)
      throw Error(
        t(
          "This chapter exceeds 100,000 characters. Select a passage to discuss instead.",
          "Bu bölüm 100.000 karakteri aşıyor. Soracağın pasajı seç.",
        ),
      );
    const digest = await cryptoApi.subtle.digest(
        "SHA-256",
        new TextEncoder().encode(source.text),
      ),
      revision = [...new Uint8Array(digest)]
        .map((n) => n.toString(16).padStart(2, "0"))
        .join("");
    return {
      question:
        kind === "summary"
          ? t(
              "Summarize this chapter or page: explain its main point and how the ideas connect. Preserve names, numbers and uncertainty. Use only the supplied text.",
              "Bu bölümü veya sayfayı özetle: ana fikri ve düşünceler arasındaki bağlantıları açıkla. Özel adları, sayıları ve belirsizliği koru. Yalnız sağlanan metni kullan.",
            )
          : t(
              "Explain my selected passage using its nearby context. Do not invent events or claims from other chapters.",
              "Seçtiğim pasajı yakın bağlamıyla açıkla. Başka bölümlerden olay veya iddia uydurma.",
            ),
      context: {
        id: String(source.id).slice(0, 120),
        type: source.type,
        title: String(source.title || "").slice(0, 500),
        chapter: String(source.chapter || "").slice(0, 500),
        excerpt: String(source.excerpt || source.text).slice(0, 8000),
        selectedText: kind === "explain" ? selected : "",
        chapterRevision: revision,
        chapterText: kind === "summary" ? source.text : "",
        chapterTextComplete: kind === "summary",
        contentTrust: "untrusted-document-content",
        bookAction: kind,
      },
    };
  }
  function same(a, b) {
    return (
      !!a &&
      !!b &&
      a.id === b.id &&
      a.type === b.type &&
      a.chapter === b.chapter &&
      a.text === b.text &&
      String(a.selectedText || "") === String(b.selectedText || "")
    );
  }
  return Object.freeze({ prepare, same });
});
