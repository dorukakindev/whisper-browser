"use strict";
const test = require("node:test"),
  assert = require("node:assert/strict"),
  fs = require("node:fs"),
  vm = require("node:vm");
const source = fs.readFileSync(
  require.resolve("../src/renderer/media-workflows-ui.js"),
  "utf8",
);
const slice = (a, b) => {
  const i = source.indexOf(a),
    j = source.indexOf(b, i);
  assert(i >= 0 && j > i);
  return source.slice(i, j);
};
function saveContext() {
  let resolve;
  const initial = { id: "one", chapters: [{ text: "old" }] },
    input = { value: "old", isConnected: true },
    drafts = new Map([["one:0", "old"]]);
  const ctx = {
    project: initial,
    chapter: 0,
    saveRequest: 0,
    drafts,
    dialog: { querySelector: () => input },
    saveDraft() {},
    call: () => new Promise((r) => (resolve = r)),
  };
  vm.createContext(ctx);
  vm.runInContext(
    slice("  async function saveChapter()", "  async function books()"),
    ctx,
  );
  return {
    ctx,
    input,
    drafts,
    initial,
    done: () =>
      resolve({ project: { id: "one", chapters: [{ text: "saved" }] } }),
  };
}
test("late chapter save cannot replace a different project or delete a newer draft", async () => {
  const f = saveContext(),
    pending = f.ctx.saveChapter();
  f.input.value = "typed while saving";
  f.ctx.project = { id: "two" };
  f.ctx.chapter = 1;
  f.done();
  await pending;
  assert.equal(f.ctx.project.id, "two");
  assert.equal(f.drafts.get("one:0"), "typed while saving");
});
test("late save deletes only its original chapter draft and leaves a different selected chapter untouched", async () => {
  const f = saveContext();
  f.drafts.set("one:1", "second draft");
  const pending = f.ctx.saveChapter();
  f.ctx.chapter = 1;
  f.done();
  await pending;
  assert.equal(f.drafts.has("one:0"), false);
  assert.equal(f.drafts.get("one:1"), "second draft");
});
test("last reader navigation wins when listen IPC replies arrive out of order; close invalidates pending navigation", async () => {
  const pending = [],
    rendered = [];
  const ctx = {
    readerRequest: 0,
    status: () => {},
    project: { id: "one", chapters: Array.from({length:6},(_,id)=>({id})) },
    chapter: 0,
    dialog: { open: true },
    saveChapter: async () => {},
    call: (_action, value) =>
      new Promise((resolve) => pending.push({ value, resolve })),
    render: () => rendered.push(ctx.chapter),
  };
  vm.createContext(ctx);
  const prefix = slice(
    "  async function readChapter(",
    "    const body = clearBody(),",
  );
  vm.runInContext(prefix + "render(); }", ctx);
  const a = ctx.readChapter(1),
    b = ctx.readChapter(2);
  await new Promise(setImmediate);
  assert.equal(pending.length, 1, "superseded request is stopped before IPC");
  pending[0].resolve({});
  await Promise.all([a, b]);
  assert.deepEqual(rendered, [2]);
  const c = ctx.readChapter(3);
  await new Promise(setImmediate);
  const d = ctx.readChapter(4);
  await new Promise(setImmediate);
  assert.equal(pending.length, 3);
  pending[2].resolve({});
  await d;
  pending[1].resolve({});
  await c;
  assert.deepEqual(rendered, [2, 4]);
  const e = ctx.readChapter(5);
  await new Promise(setImmediate);
  ctx.readerRequest++;
  ctx.dialog.open = false;
  pending[3].resolve({});
  await e;
  assert.deepEqual(rendered, [2, 4]);
});

test("draft save follows the rendered textarea identity, not a just-changed chapter selector", () => {
  const drafts = new Map(),
    input = {
      dataset: { chapter: "0", projectId: "book" },
      value: "First chapter only",
    };
  const ctx = {
    drafts,
    project: { id: "book", chapters: [{}, {}] },
    chapter: 1,
    dialog: { querySelector: () => input },
  };
  vm.createContext(ctx);
  vm.runInContext(
    slice("  function saveDraft()", "  async function saveChapter()"),
    ctx,
  );
  ctx.saveDraft();
  assert.equal(drafts.get("book:0"), "First chapter only");
  assert.equal(drafts.has("book:1"), false);
  ctx.project = { id: "other", chapters: [{}] };
  ctx.saveDraft();
  assert.equal(drafts.has("other:0"), false);
});
