"use strict";
const test = require("node:test"),
  assert = require("node:assert/strict");
const { search } = require("../src/book-text-search");
const context = require("../src/assistant-source-context");
test("Turkish and combining Unicode matches retain exact original UTF-16 selection offsets", async () => {
  const text = "Başlangıç. Işık, İZMİR, I\u0307zmir ve ﬃ örnek. Son.";
  for (const query of ["ışık", "izmir", "ffi"]) {
    const r = await search([{ text }], query);
    assert(r.matches.length > 0);
    for (const hit of r.matches) {
      const original = text.slice(hit.start, hit.end);
      assert.equal(original.normalize("NFKC").toLocaleLowerCase("tr"), query);
    }
  }
  const spaced = await search(
    [{ text: "İlk satır\n   ikinci satır." }],
    "satır ikinci",
  );
  assert.equal(spaced.matches.length, 1);
  assert.equal(
    "İlk satır\n   ikinci satır.".slice(
      spaced.matches[0].start,
      spaced.matches[0].end,
    ),
    "satır\n   ikinci",
  );
});
test("large repeated chapters yield between scans and bounded results stop without scanning the entire book", async () => {
  const chapters = Array.from({ length: 30 }, (_, i) => ({
    text: "Metin ".repeat(2000) + (i === 15 ? "bulunacak kelime" : ""),
  }));
  let yields = 0;
  const r = await search(chapters, "bulunacak", {
    yieldTask: async () => {
      yields++;
    },
  });
  assert.equal(r.matches[0].chapter, 15);
  assert.equal(yields, 30);
  const limited = await search([{ text: "ara ".repeat(1000) }], "ara");
  assert.equal(limited.matches.length, 80);
  assert.equal(limited.truncated, true);
  let current = true;
  const cancelled = await search(chapters, "yok", {
    isCurrent: () => current,
    yieldTask: async () => {
      current = false;
    },
  });
  assert.equal(cancelled.cancelled, true);
  assert.deepEqual(cancelled.matches, []);
});
test("chapter identity and changed excerpt invalidate assistant answers without resetting same-chapter conversation", () => {
  const p = {},
    a = {
      workspace: "media-selection",
      id: "book:0",
      chapter: "Same title",
      excerpt: "Old text",
    };
  assert.notEqual(
    context.scope(p, a),
    context.scope(p, { ...a, excerpt: "Edited text" }),
  );
  assert.equal(
    context.conversation(p, a),
    context.conversation(p, { ...a, excerpt: "Edited text" }),
  );
  assert.notEqual(
    context.conversation(p, a),
    context.conversation(p, { ...a, id: "book:1" }),
  );
  assert(
    !context.scope(p, a).includes("Old text"),
    "excerpt text is fingerprinted, not placed in scope key",
  );
});
