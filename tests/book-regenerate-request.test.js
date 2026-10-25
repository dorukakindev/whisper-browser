"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const source = fs.readFileSync(require.resolve("../src/renderer/media-workflows-ui.js"), "utf8");
const start = source.indexOf("  async function generate(");
const end = source.indexOf("  async function seasons(", start);
assert(start >= 0 && end > start);

test("chapter regeneration forces its complete fresh plan; group regeneration forces only that group", async () => {
  for (const force of [true, false]) {
    let subscriber, request, removed = 0, plans = 0;
    const project = { id: "book", chapters: [{ title: "Chapter", output: "done.wav", status: "ready" }] };
    const ctx = {
      busy: false, selected: new Set([0]), project, voicePrefs: {},
      stopRequested: false, job: null, dialog: { open: false },
      t: en => en, status() {}, saveChapter: async () => {},
      call: async name => name === "book-prepare"
        ? { request: { id: "chapter-job", srt: "chapter.srt", narration: true } }
        : { project },
      window: { api: {
        planDub: async () => { plans++; return { ok: true, groups: [{ key: "1,2" }, { key: "3" }] }; },
        onDubEvent: fn => { subscriber = fn; return () => { removed++; }; },
        startDub: async value => {
          request = value;
          queueMicrotask(() => subscriber({ id: value.id, type: "done" }));
          return { ok: true };
        },
      } },
    };
    vm.createContext(ctx);
    vm.runInContext(source.slice(start, end), ctx);
    await ctx.generate(force, force ? null : ["3"]);
    assert.deepEqual(Array.from(request.forceGroups), force ? ["1,2", "3"] : ["3"]);
    assert.equal(request.narration, true);
    assert.equal(plans, force ? 1 : 0);
    assert.equal(removed, 1);
    assert.equal(ctx.busy, false);
    assert.equal(ctx.job, null);
  }
});
