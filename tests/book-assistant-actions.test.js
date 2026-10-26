"use strict";
const test = require("node:test"),
  assert = require("node:assert/strict"),
  { createHash } = require("node:crypto"),
  actions = require("../src/book-assistant-actions"),
  scope = require("../src/assistant-source-context");
test("book actions preserve full chapter evidence, bound selected evidence and fingerprint text beyond the ordinary excerpt", async () => {
  const t = (en) => en,
    source = {
      id: "book:1",
      type: "book-chapter",
      title: "Book",
      chapter: "Two",
      text:
        "A careful account. ".repeat(600) + "Not 15; 1.5 remains uncertain.",
      selectedText: "A careful account.",
      excerpt: "A careful account.",
    };
  const summary = await actions.prepare("summary", source, t),
    explain = await actions.prepare("explain", source, t);
  assert.equal(summary.context.chapterText, source.text);
  assert.equal(summary.context.chapterTextComplete, true);
  assert.equal(summary.context.selectedText, "");
  assert.equal(
    summary.context.chapterRevision,
    createHash("sha256").update(source.text).digest("hex"),
  );
  assert.equal(explain.context.chapterText, "");
  assert.equal(explain.context.selectedText, source.selectedText);
  const changed = await actions.prepare(
    "summary",
    { ...source, text: source.text + " Changed ending." },
    t,
  );
  assert.notEqual(
    scope.scope({}, summary.context),
    scope.scope({}, changed.context),
  );
  assert.equal(actions.same(source, { ...source }), true);
  assert.equal(actions.same(source, { ...source, chapter: "Three" }), false);
  assert.equal(
    actions.same(source, { ...source, selectedText: "account" }),
    false,
  );
  await assert.rejects(
    actions.prepare(
      "explain",
      { ...source, selectedText: "From another chapter" },
      t,
    ),
    /Select a passage/,
  );
  await assert.rejects(
    actions.prepare("summary", { ...source, text: "a".repeat(100001) }, t),
    /100,000/,
  );
});

test("oversized selected passages are explicitly rejected, never silently shortened", async () => {
  const text="A".repeat(5200), source={id:"book",type:"book-chapter",text,selectedText:text};
  await assert.rejects(actions.prepare("explain",source,en=>en),/4,000.*nothing was sent/);
  await assert.rejects(actions.prepare("explain",source,(en,tr)=>tr),/4.000.*gönderilmedi/);
  const allowed=await actions.prepare("explain",{...source,selectedText:text.slice(0,4000)},en=>en);
  assert.equal(allowed.context.selectedText.length,4000);
});
