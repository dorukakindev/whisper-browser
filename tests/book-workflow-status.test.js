"use strict";
const test = require("node:test"),
  assert = require("node:assert/strict"),
  fs = require("node:fs"),
  vm = require("node:vm"),
  status = require("../src/book-workflow-status");
test("quality and terminal summaries distinguish review, failed, stopped and timeout while preserving error evidence", () => {
  for (const lang of ["en", "tr"]) {
    const t = (en, tr) => (lang === "tr" ? tr : en);
    assert.equal(
      status.label("review", t),
      t("Needs review", "Kontrol edilmeli"),
    );
    assert.notEqual(status.label("failed", t), status.label("pending", t));
    assert.match(
      status.terminal({ type: "error" }, t),
      lang === "tr" ? /başarısız/ : /failed/,
    );
    assert.doesNotMatch(
      status.terminal({ type: "error" }, t),
      lang === "tr" ? /Durduruldu/ : /Stopped/,
    );
    assert.match(
      status.terminal({ type: "cancelled" }, t),
      lang === "tr" ? /Durduruldu/ : /Stopped/,
    );
    const reason = "Timeout: group 60/61 (90 seconds)";
    assert(
      status.terminal({ type: "error", error: reason }, t).endsWith(reason),
    );
    assert.match(
      status.terminal(
        { type: "error", error: "İşlem zaman aşımına uğradı." },
        t,
      ),
      lang === "tr" ? /zaman aşımına/ : /timed out/,
    );
    assert.equal(
      status.stage("normalization", t),
      t("Balancing loudness…", "Ses yüksekliği dengeleniyor…"),
    );
    assert.equal(
      status.label("constructor", t),
      t("Unknown status", "Durum bilinmiyor"),
    );
    assert.equal(status.stage("toString", t), t("Working…", "İşleniyor…"));
    assert.match(
      status.terminal(
        { type: "error", error: "TimeoutError: model wait expired" },
        t,
      ),
      lang === "tr" ? /zaman aşımına/ : /timed out/,
    );
  }
});
test("book generation handles actual terminal events without misreporting an empty error as user cancellation", async () => {
  const source = fs.readFileSync(
      require.resolve("../src/renderer/media-workflows-ui.js"),
      "utf8",
    ),
    start = source.indexOf("  async function generate("),
    end = source.indexOf("  async function seasons(", start);
  for (const event of [
    { type: "error" },
    { type: "error", error: "engine timed out" },
    { type: "cancelled" },
  ]) {
    let listener,
      removed = 0;
    const phases = [];
    const project = {
      id: "book",
      chapters: [
        {
          title: "Chapter",
          text: "Current text",
          output: "audio.wav",
          status: "ready",
        },
      ],
    };
    const ctx = {
      busy: false,
      selected: new Set([0]),
      project,
      voicePrefs: {},
      stopRequested: false,
      job: null,
      dialog: { open: true },
      books: async () => {},
      t: (en) => en,
      status() {},
      // This test extracts generate(); native smoke covers actual DOM state.
      syncBookStop() {},
      workflowStage: (stage, prefix) => phases.push({ stage, prefix }),
      saveChapter: async () => {},
      call: async (action) =>
        action === "book-prepare"
          ? { request: { id: "job", srt: "chapter.srt", forceGroups: [] } }
          : { project },
      window: {
        BookWorkflowStatus: status,
        api: {
          onDubEvent: (fn) => {
            listener = fn;
            return () => removed++;
          },
          startDub: async (request) => {
            queueMicrotask(() => {
              listener({
                id: request.id,
                type: "status",
                stage: "verification",
              });
              listener({
                id: request.id,
                type: "progress",
                done: 0,
                current: 7,
                total: 10,
              });
              listener({ id: request.id, ...event });
            });
            return { ok: true };
          },
        },
      },
    };
    vm.createContext(ctx);
    vm.runInContext(source.slice(start, end), ctx);
    await assert.rejects(
      ctx.generate(),
      event.type === "cancelled"
        ? /Stopped/
        : event.error
          ? /timed out/
          : /generation failed/,
    );
    assert.equal(removed, 1);
    assert.equal(ctx.busy, false);
    assert.equal(ctx.job, null);
    assert.equal(phases[0].stage, "verification");
    assert.match(phases[1].prefix, /0\/10/);
  }
});
