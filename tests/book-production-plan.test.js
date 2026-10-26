"use strict";
const test = require("node:test"),
  assert = require("node:assert/strict"),
  fs = require("node:fs"),
  os = require("node:os"),
  path = require("node:path"),
  { EventEmitter } = require("node:events"),
  { execFileSync } = require("node:child_process");
const { compare } = require("../src/book-production-plan"),
  { registerMediaWorkflows } = require("../src/media-workflows"),
  { voiceStorage } = require("../src/voice-storage"),
  { findTestPython } = require("./python-runtime");
test("plan comparison follows text and occurrence counts, never obsolete ordinal keys or number-stripped text", () => {
  const result = compare(
    [
      { key: "1", text: "15 degrees" },
      { key: "2", text: "Same words" },
      { key: "3", text: "Same words" },
    ],
    [
      { key: "1", text: "1.5 degrees" },
      { key: "7,8", text: "Same  words" },
    ],
  );
  assert.equal(result.same, 1);
  assert.equal(result.changed, 2);
  assert.deepEqual(
    result.rows.map((g) => g.unchanged),
    [false, true, false],
  );
  assert.deepEqual(result.previousOnly, ["1.5 degrees"]);
  assert.throws(
    () =>
      compare(
        [
          { key: "1", text: "A" },
          { key: "1", text: "B" },
        ],
        [],
      ),
    /Invalid chapter plan/,
  );
});
test("model-free planning does not create jobs or save drafts, and prepare rejects an obsolete source snapshot", async (t) => {
  const python = findTestPython();
  if (!python)
    return t.skip("Python unavailable for actual model-free planner");
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "book-plan-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const app = new EventEmitter();
  app.getPath = () => root;
  const source = path.join(root, "source.pdf");
  fs.writeFileSync(source, "controlled source");
  const handlers = {},
    sender = {},
    granted = [];
  registerMediaWorkflows({
    app,
    ipcMain: { handle: (name, fn) => (handlers[name] = fn) },
    authorized: (e) => e.sender === sender,
    owner: () => null,
    resolvePdf: () => ({ filePath: source, numPages: 1, title: "Book" }),
    grantSubtitle: (p) => granted.push(p),
    grantMedia() {},
  });
  const call = (action, r = {}) =>
    handlers["media-workflows:request"]({ sender }, { action, ...r });
  const imported = await call("book-from-reader", {
    pdfHash: "fixture",
    numPages: 1,
    pages: [{ pageNumber: 1, text: "This is the stored chapter text." }],
  });
  assert(imported.ok, imported.error);
  const id = imported.project.id,
    file = path.join(
      voiceStorage(app).input,
      "Kitap projeleri",
      id,
      "project.json",
    ),
    before = fs.readFileSync(file);
  const text = "Bu önizleme metni. Henüz bölüme kaydedilmedi. ".repeat(14);
  const preview = await call("book-plan-source", { id, chapter: 0, text });
  assert(preview.ok, preview.error);
  assert.deepEqual(
    fs.readFileSync(file),
    before,
    "preview must not create activeJob or save a draft",
  );
  assert(granted.includes(preview.srt));
  const planned = JSON.parse(
    execFileSync(
      python,
      [
        path.resolve(__dirname, "../tools/voxcpm2/dub_plan.py"),
        preview.srt,
        "--grouping",
        preview.grouping,
      ],
      { encoding: "utf8", timeout: 15000, windowsHide: true },
    ),
  );
  assert.equal(planned.sourceHash, preview.sourceHash);
  assert(planned.groups.length > 1);
  assert.equal(compare(planned.groups, []).changed, planned.groups.length);
  const snapshot = {
    textHash: preview.textHash,
    sourceHash: preview.sourceHash,
    grouping: preview.grouping,
  };
  assert.equal(
    (await call("book-prepare", { id, chapter: 0, preview: snapshot })).ok,
    false,
    "unsaved draft plan cannot name the stored text",
  );
  assert.deepEqual(
    fs.readFileSync(file),
    before,
    "rejected preview must not create a job",
  );
  await call("book-save", { id, chapter: 0, text });
  const accepted = await call("book-prepare", {
    id,
    chapter: 0,
    preview: snapshot,
  });
  assert(accepted.ok, accepted.error);
  assert.equal(
    fs.readFileSync(accepted.request.srt, "utf8"),
    fs.readFileSync(preview.srt, "utf8"),
  );
  const stale = await call("book-prepare", {
    id,
    chapter: 0,
    preview: { ...snapshot, sourceHash: "0".repeat(64) },
  });
  assert.equal(stale.ok, false);
  await call("book-save", {
    id,
    chapter: 0,
    text: "A different chapter version.",
  });
  assert.equal(
    (await call("book-prepare", { id, chapter: 0, preview: snapshot })).ok,
    false,
  );
});
