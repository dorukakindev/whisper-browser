"use strict";
const test = require("node:test"),
  assert = require("node:assert/strict"),
  preparation = require("../src/book-text-preparation");
test("preparation is opt-in, preserves punctuation and only applies the chosen split words", () => {
  const text =
    "Bu cüm-\nlenin sesi ola-\r\nğan olsun. soft\u00adhyphen stays optional.";
  const plan = preparation.preview(text);
  assert.equal(plan.suggestions.length, 3);
  assert.equal(preparation.apply(text, text, {}).text, text);
  const result = preparation.apply(text, text, {
    [plan.suggestions[0].id]: "join",
    [plan.suggestions[1].id]: "hyphen",
  });
  assert.equal(
    result.text,
    "Bu cümlenin sesi ola-ğan olsun. soft\u00adhyphen stays optional.",
  );
  assert.equal(result.count, 2);
  const last = preparation.preview(result.text).suggestions[0];
  assert.equal(
    preparation.apply(result.text, result.text, { [last.id]: "join" }).text,
    "Bu cümlenin sesi ola-ğan olsun. softhyphen stays optional.",
  );
});
test("names, acronyms, numbers, paragraph boundaries, inline compounds and stale previews are protected", () => {
  const text =
    "Anka-\nra NATO-\nUSA 2020-\n2021 10–20 e-posta bilgi-\n\nsayar İstan-\nbul ÜNİ-\nVERSİTE";
  assert.equal(preparation.preview(text).suggestions.length, 0);
  assert.throws(() => preparation.apply("edited", text, {}), /Text changed/);
  assert.throws(
    () => preparation.apply(text, text, { 123: "join" }),
    /Invalid text change/,
  );
  const soft = "bilgi\u00adsayar",
    id = preparation.preview(soft).suggestions[0].id;
  assert.throws(
    () => preparation.apply(soft, soft, { [id]: "hyphen" }),
    /soft hyphen/,
  );
});
test("preview is bounded and change offsets preserve repeated words and Unicode combining marks", () => {
  const text =
    "ağaç-\nların ve ağaç-\nların çözüm-\nleri. e\u0301cole-\nscolaire";
  const plan = preparation.preview(text);
  assert.equal(plan.suggestions.length, 4);
  const result = preparation.apply(text, text, {
    [plan.suggestions[1].id]: "join",
  });
  assert.equal(
    result.text,
    "ağaç-\nların ve ağaçların çözüm-\nleri. e\u0301cole-\nscolaire",
  );
  const large = preparation.preview("sözcük-\nlerin ".repeat(201));
  assert.equal(large.suggestions.length, 200);
  assert.equal(large.truncated, true);
});
