"use strict";
const test = require("node:test"),
  assert = require("node:assert/strict"),
  fs = require("node:fs"),
  os = require("node:os"),
  path = require("node:path"),
  { EventEmitter } = require("node:events");
const { registerMediaWorkflows } = require("../src/media-workflows"),
  { voiceStorage } = require("../src/voice-storage"),
  marks = require("../src/book-bookmarks");
test("audio bookmarks persist, preserve revision identity and remap only to a verified group start", async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "book-marks-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const app = new EventEmitter();
  app.getPath = () => root;
  const source = path.join(root, "source.pdf"),
    wav = path.join(root, "audio.wav");
  fs.writeFileSync(source, "controlled source");
  fs.writeFileSync(wav, Buffer.alloc(1024, 1));
  const sender = {},
    handlers = {},
    config = {
      app,
      ipcMain: { handle: (name, fn) => (handlers[name] = fn) },
      authorized: (e) => e.sender === sender,
      owner: () => null,
      resolvePdf: () => ({ filePath: source, title: "Book" }),
      grantSubtitle() {},
      grantMedia() {},
    };
  let service = registerMediaWorkflows(config);
  const call = (action, r = {}) =>
    handlers["media-workflows:request"]({ sender }, { action, ...r });
  const imported = await call("book-from-reader", {
    pdfHash: "controlled",
    numPages: 1,
    pages: [{ pageNumber: 1, text: "Birinci bölümün özgün metni." }],
  });
  assert(imported.ok, imported.error);
  const id = imported.project.id,
    original = imported.project.chapters[0].text;
  async function capture(start) {
    const p = await call("book-prepare", { id, chapter: 0 });
    assert(p.ok, p.error);
    service.capture({
      id: p.request.id,
      path: wav,
      quality: {
        groups: [
          {
            key: "1",
            status: "ready",
            displayText: original,
            audioStart: start,
            audioEnd: 4,
          },
        ],
      },
    });
  }
  await capture(0);
  const current = await call("book-listen", { id, chapter: 0 }),
    request = {
      id,
      chapter: 0,
      outputId: current.outputId,
      textHash: current.textHash,
      position: 1.25,
      quote: "özgün metni",
    };
  assert.equal(
    (await call("book-mark-add", { ...request, outputId: "old.wav" })).ok,
    false,
  );
  const saved = await call("book-mark-add", request);
  assert(saved.ok, saved.error);
  const markId = saved.bookmark.id;
  assert.equal(saved.bookmark.state, "exact");
  service = registerMediaWorkflows(config);
  assert.equal(
    (await call("book-mark-list", { id })).bookmarks[0].id,
    markId,
    "bookmark survives service recreation",
  );
  assert.equal(
    (await call("book-mark-open", { id, markId })).bookmark.position,
    1.25,
  );
  const manifest = path.join(
      voiceStorage(app).input,
      "Kitap projeleri",
      id,
      "project.json",
    ),
    before = fs.readFileSync(manifest, "utf8");
  const full = JSON.parse(before);
  full.padding = "";
  full.padding = "x".repeat(
    6000000 - Buffer.byteLength(JSON.stringify(full), "utf8") - 20,
  );
  fs.writeFileSync(manifest, JSON.stringify(full));
  const beforeLarge = fs.readFileSync(manifest);
  assert.equal(
    (await call("book-mark-add", { ...request, quote: "x".repeat(1000) })).ok,
    false,
    "oversized mark must not brick the project",
  );
  assert(fs.readFileSync(manifest).equals(beforeLarge));
  fs.writeFileSync(manifest, before);
  assert(
    (
      await call("book-progress", {
        id,
        chapter: 0,
        position: 3,
        outputId: current.outputId,
        textHash: current.textHash,
      })
    ).ok,
  );
  fs.writeFileSync(wav, Buffer.alloc(1024, 2));
  await capture(2);
  assert.equal(
    (await call("book-open", { id })).project.chapters[0].position,
    0,
    "new audio does not inherit old seconds",
  );
  assert.equal(
    (
      await call("book-progress", {
        id,
        chapter: 0,
        position: 3,
        outputId: current.outputId,
        textHash: current.textHash,
      })
    ).ok,
    false,
    "an old reader cannot update a new output's resume time",
  );
  const remapped = (await call("book-mark-open", { id, markId })).bookmark;
  assert.equal(remapped.state, "audio-remapped");
  assert.equal(remapped.position, 2);
  assert.notEqual(remapped.outputId, current.outputId);
  assert(
    (
      await call("book-save", {
        id,
        chapter: 0,
        text: "Düzenlenmiş başka bir metin.",
      })
    ).ok,
  );
  assert.equal(
    (await call("book-mark-open", { id, markId })).bookmark.state,
    "text-changed",
  );
  assert((await call("book-mark-remove", { id, markId })).ok);
  assert.equal((await call("book-mark-list", { id })).bookmarks.length, 0);
});
test("bookmark cap never silently evicts old entries, and source changes are distinct from audio changes", () => {
  const hash = require("node:crypto")
    .createHash("sha256")
    .update("Original")
    .digest("hex");
  const p = {
    chapters: [
      {
        id: 0,
        pageNumber: 1,
        text: "Original",
        textHash: hash,
        output: "one.wav",
        groups: [],
      },
    ],
    bookmarks: Array(100).fill({ id: "kept" }),
  };
  assert.throws(() =>
    marks.add(p, {
      chapter: 0,
      position: 0,
      outputId: "one.wav",
      textHash: hash,
    }),
  );
  assert.equal(p.bookmarks.length, 100);
  const mark = {
    id: "one",
    chapter: 0,
    pageNumber: 2,
    textHash: hash,
    outputId: "old.wav",
    position: 1,
    quote: "Old passage",
  };
  p.bookmarks = [mark];
  assert.equal(marks.open(p, "one").state, "source-changed");
  mark.pageNumber = 1;
  assert.equal(marks.open(p, "one").state, "audio-changed");
});
