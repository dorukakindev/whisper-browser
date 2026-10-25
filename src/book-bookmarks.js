"use strict";
const { randomUUID, createHash } = require("node:crypto"),
  path = require("node:path");
const hash = (text) => createHash("sha256").update(text).digest("hex");
const normalize = (text) =>
  String(text || "")
    .normalize("NFKC")
    .replace(/\s+/g, " ")
    .trim();
function resolve(project, mark) {
  const c = project.chapters[mark.chapter],
    base = {
      id: mark.id,
      chapter: mark.chapter,
      quote: String(mark.quote || "").slice(0, 1000),
      position: mark.position,
    };
  if (!c) return { ...base, state: "missing-chapter" };
  if (
    (mark.sourceId && c.sourceId !== mark.sourceId) ||
    (mark.pageNumber && c.pageNumber !== mark.pageNumber) ||
    (mark.sourceId && c.sourceSpineIndex !== mark.sourceSpineIndex)
  )
    return { ...base, state: "source-changed" };
  if (hash(c.text) !== mark.textHash || c.textHash !== mark.textHash)
    return { ...base, state: "text-changed" };
  const current = {
    ...base,
    outputId: path.basename(c.output || ""),
    textHash: c.textHash,
  };
  if (c.output && current.outputId === mark.outputId)
    return { ...current, state: "exact" };
  const groups = (c.groups || []).filter(
    (g) =>
      Number.isFinite(g.start) &&
      g.start >= 0 &&
      Number.isFinite(g.end) &&
      g.end > g.start,
  );
  let matches = groups.filter(
    (g) =>
      g.key === mark.groupKey &&
      normalize(g.text) === normalize(mark.groupText),
  );
  if (matches.length !== 1 && normalize(mark.quote).length >= 6)
    matches = groups.filter((g) =>
      normalize(g.text).includes(normalize(mark.quote)),
    );
  if (c.output && matches.length === 1)
    return { ...current, state: "audio-remapped", position: matches[0].start };
  return { ...current, state: "audio-changed" };
}
function list(project) {
  return (Array.isArray(project.bookmarks) ? project.bookmarks : [])
    .slice(0, 100)
    .filter(
      (m) =>
        m &&
        typeof m.id === "string" &&
        Number.isInteger(m.chapter) &&
        Number.isFinite(m.position) &&
        m.position >= 0 &&
        m.position <= 172800,
    )
    .map((m) => resolve(project, m));
}
function add(project, request) {
  const c = project.chapters[request.chapter];
  if (
    !c ||
    !c.output ||
    c.textHash !== hash(c.text) ||
    request.textHash !== c.textHash ||
    request.outputId !== path.basename(c.output)
  )
    throw Error(
      "Audio changed; reopen this chapter / Ses değişti; bölümü yeniden açın.",
    );
  if (
    !Number.isFinite(request.position) ||
    request.position < 0 ||
    request.position > 172800
  )
    throw Error("Invalid audio position / Ses konumu geçersiz.");
  const marks = Array.isArray(project.bookmarks) ? project.bookmarks : [];
  if (marks.length >= 100)
    throw Error(
      "Remove a bookmark before adding more / Yeni yer imi için mevcut yer imlerinden birini kaldırın.",
    );
  const group = (c.groups || []).find(
    (g) => request.position >= g.start && request.position < g.end,
  );
  const mark = {
    id: randomUUID(),
    chapter: c.id,
    sourceId: c.sourceId || null,
    sourceSpineIndex: c.sourceSpineIndex ?? null,
    pageNumber: c.pageNumber || null,
    quote: String(request.quote || group?.text || c.text)
      .trim()
      .slice(0, 1000),
    position: request.position,
    textHash: c.textHash,
    outputId: path.basename(c.output),
    groupKey: group?.key || null,
    groupText: String(group?.text || "").slice(0, 2000),
    createdAt: new Date().toISOString(),
  };
  project.bookmarks = [...marks, mark];
  return resolve(project, mark);
}
function open(project, id) {
  const mark = (project.bookmarks || []).find((m) => m.id === id);
  if (!mark) throw Error("Bookmark not found / Yer imi bulunamadı.");
  return resolve(project, mark);
}
function remove(project, id) {
  open(project, id);
  project.bookmarks = project.bookmarks.filter((m) => m.id !== id);
}
module.exports = { add, list, open, remove };
