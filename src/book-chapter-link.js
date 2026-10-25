"use strict";
function focusChapter(project, source) {
  if (!source || typeof source !== "object")
    throw Error("Invalid source chapter / Kaynak bölüm geçersiz.");
  let matches;
  if (project.format === "pdf") {
    if (!Number.isInteger(source.pageNumber) || source.pageNumber < 1)
      throw Error("Invalid source page / Kaynak sayfa geçersiz.");
    matches = project.chapters.filter(
      (c) => c.pageNumber === source.pageNumber,
    );
  } else {
    if (
      !Number.isInteger(source.index) ||
      source.index < 0 ||
      source.index >= project.chapters.length ||
      typeof source.text !== "string" ||
      source.text.length > 900000
    )
      throw Error("Invalid source chapter / Kaynak bölüm geçersiz.");
    const c = project.chapters[source.index];
    if (c.sourceId) {
      matches =
        c.sourceId === source.sourceId &&
        c.sourceSpineIndex === source.sourceSpineIndex
          ? [c]
          : [];
    } else matches = c.text === source.text ? [c] : [];
  }
  if (matches.length !== 1)
    throw Error(
      "The source chapter cannot be matched safely / Kaynak bölüm güvenle eşleştirilemiyor.",
    );
  return matches[0].id;
}
module.exports = { focusChapter };
