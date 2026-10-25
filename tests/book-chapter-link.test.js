"use strict";
const test = require("node:test"),
  assert = require("node:assert/strict");
const { focusChapter } = require("../src/book-chapter-link");
test("source chapter links require the exact source identity and spine occurrence", () => {
  const p = {
    format: "epub",
    chapters: [
      { id: 0, text: "First", sourceId: "one", sourceSpineIndex: 0 },
      { id: 1, text: "Edited second", sourceId: "two", sourceSpineIndex: 2 },
    ],
  };
  assert.equal(
    focusChapter(p, {
      index: 1,
      text: "Original second",
      sourceId: "two",
      sourceSpineIndex: 2,
    }),
    1,
  );
  for (const r of [
    { index: 0, text: "First", sourceId: "two", sourceSpineIndex: 2 },
    { index: 1, text: "Original second", sourceId: "two", sourceSpineIndex: 1 },
    { index: 2, text: "First" },
  ])
    assert.throws(() => focusChapter(p, r));
  const old = { format: "txt", chapters: [{ id: 0, text: "Original" }] };
  assert.equal(focusChapter(old, { index: 0, text: "Original" }), 0);
  assert.throws(() => focusChapter(old, { index: 0, text: "Changed" }));
});
test("PDF source links use actual page numbers, including skipped blank pages", () => {
  const p = {
    format: "pdf",
    chapters: [
      { id: 0, pageNumber: 2 },
      { id: 1, pageNumber: 4 },
    ],
  };
  assert.equal(focusChapter(p, { pageNumber: 4 }), 1);
  assert.throws(() => focusChapter(p, { pageNumber: 3 }));
  assert.throws(() => focusChapter(p, { index: 1 }));
});
