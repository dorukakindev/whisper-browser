"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const source = fs.readFileSync(
  require.resolve("../src/renderer/media-workflows-ui.js"),
  "utf8",
);
const start = source.indexOf("  async function generate(");
const end = source.indexOf("  async function seasons(", start);
assert(start >= 0 && end > start);

test("switching books resets unspecified voice settings instead of inheriting the previous book", async () => {
  const a = source.indexOf("  async function books()"),
    b = source.indexOf("    saveDraft();", a);
  assert(a >= 0 && b > a);
  for (const preferences of [
    undefined,
    { profile: "fast" },
    { referenceId: "chosen" },
  ]) {
    const ctx = {
      voicePrefs: {
        profile: "fast",
        concurrency: 8,
        verification: "fast",
        referenceId: "old",
      },
      prefsProject: "old",
      project: { id: "new", voicePreferences: preferences },
    };
    vm.createContext(ctx);
    vm.runInContext(source.slice(a, b) + "}", ctx);
    await ctx.books();
    assert.equal(ctx.voicePrefs.referenceId, preferences?.referenceId || "");
    assert.equal(ctx.voicePrefs.concurrency, 4);
    assert.equal(ctx.voicePrefs.verification, "detailed");
  }
});

test("chapter regeneration forces its complete fresh plan; group regeneration forces only that group", async () => {
  for (const kind of ["chapter", "group", "edited-group", "missing-report", "missing-report-group"]) {
    const force = kind === "chapter",
      edited = kind === "edited-group", missing = kind.startsWith("missing-report"), hasRetry = !force && kind !== "missing-report";
    const retry = { key: "3", output: "done.wav" };
    let subscriber,
      request,
      removed = 0,
      plans = 0;
    const project = {
      id: "book",
      chapters: [{ title: "Chapter", output: "done.wav", status: "ready" }],
    };
    const preview = {
      textHash: "current-text",
      sourceHash: "current-source",
      grouping: "akici",
    };
    const ctx = {
      busy: false,
      selected: new Set([0]),
      project,
      voicePrefs: { referenceId: "book-reference" },
      stopRequested: false,
      job: null,
      dialog: { open: true },
      t: (en) => en,
      status() {},
      saveChapter: async () => {},
      books: async () => {},
      call: async (name, value) => {
        if (name !== "book-prepare") return { project };
        assert.deepEqual(value.preview, preview);
        assert.deepEqual(value.retryGroup, hasRetry ? retry : undefined);
        return {
          replanned: edited,
          retryWholeChapter: missing,
          request: {
            id: "chapter-job",
            srt: "chapter.srt",
            narration: true,
            forceGroups: edited || force || missing ? [] : ["3"],
          },
        };
      },
      window: {
        BookWorkflowStatus: require("../src/book-workflow-status"),
        BookProductionPlanUI: { getPreview: () => preview },
        api: {
          planDub: async () => {
            plans++;
            return { ok: true, groups: [{ key: "1,2" }, { key: "3" }] };
          },
          onDubEvent: (fn) => {
            subscriber = fn;
            return () => {
              removed++;
            };
          },
          startDub: async (value) => {
            request = value;
            queueMicrotask(() => subscriber({ id: value.id, type: "done" }));
            return { ok: true };
          },
        },
      },
    };
    vm.createContext(ctx);
    vm.runInContext(source.slice(start, end), ctx);
    await ctx.generate(force, hasRetry ? retry : null);
    assert.deepEqual(
      Array.from(request.forceGroups),
      force || missing || edited ? [] : ["3"],
    );
    assert.equal(request.forceAll === true, force || missing);
    assert.equal(request.narration, true);
    assert.equal(
      request.referenceId,
      "book-reference",
      "book reference is sent with this job, without changing the app default",
    );
    assert.equal(plans, force || missing ? 1 : 0);
    assert.equal(removed, 1);
    assert.equal(ctx.busy, false);
    assert.equal(ctx.job, null);
  }
});
