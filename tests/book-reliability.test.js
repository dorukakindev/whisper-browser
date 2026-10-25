"use strict";
const test = require("node:test"),
  assert = require("node:assert/strict"),
  fs = require("node:fs"),
  os = require("node:os"),
  path = require("node:path"),
  { EventEmitter } = require("node:events");
const { registerMediaWorkflows } = require("../src/media-workflows"),
  { voiceStorage } = require("../src/voice-storage"),
  backup = require("../src/book-project-backup");
function wav() {
  const b = Buffer.alloc(44 + 48000);
  b.write("RIFF");
  b.writeUInt32LE(b.length - 8, 4);
  b.write("WAVEfmt ", 8);
  b.writeUInt32LE(16, 16);
  b.writeUInt16LE(1, 20);
  b.writeUInt16LE(1, 22);
  b.writeUInt32LE(24000, 24);
  b.writeUInt32LE(48000, 28);
  b.writeUInt16LE(2, 32);
  b.writeUInt16LE(16, 34);
  b.write("data", 36);
  b.writeUInt32LE(48000, 40);
  return b;
}
test("persisted book job recovers after service restart, manual review stays auditable, backup restores new copies, export cancels safely", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "book549-")),
    app = new EventEmitter();
  app.getPath = () => root;
  const sender = { id: 2, isDestroyed: () => false, send() {} },
    handlers = {},
    source = path.join(root, "book.pdf"),
    target = path.join(root, "prior.m4b");
  fs.writeFileSync(source, "controlled source");
  fs.writeFileSync(target, "keep prior");
  let encoding;
  const started = new Promise((r) => (encoding = r));
  const config = {
    app,
    ipcMain: { handle: (key, fn) => (handlers[key] = fn) },
    authorized: (e) => e.sender === sender,
    owner: () => null,
    resolvePdf: (id) =>
      id === "approved" ? { filePath: source, title: "Kitap" } : null,
    grantSubtitle() {},
    grantMedia() {},
    ffprobe: () => "probe",
    ffmpeg: () => "encode",
    dialog: { showSaveDialog: async () => ({ filePath: target }) },
    runTool: async (tool, args, input, signal) => {
      if (tool === "probe") return "1";
      fs.writeFileSync(args.at(-1), "partial");
      encoding();
      return await new Promise((resolve, reject) => {
        signal.addEventListener("abort", () => reject(Error("Cancelled")), {
          once: true,
        });
      });
    },
  };
  let service = registerMediaWorkflows(config);
  const call = (action, data = {}) =>
    handlers["media-workflows:request"]({ sender }, { action, ...data });
  try {
    const imported = await call("book-from-reader", {
      pdfHash: "approved",
      numPages: 2,
      pages: [
        {
          pageNumber: 2,
          text: "Bu kitabın ikinci sayfasında anlam bütünü korunur.",
        },
      ],
    });
    assert(imported.ok, imported.error);
    const id = imported.project.id;
    const prep = await call("book-prepare", { id, chapter: 0 });
    assert(prep.ok);
    const dirs = voiceStorage(app);
    fs.mkdirSync(dirs.output, { recursive: true });
    const output = path.join(dirs.output, prep.request.id + ".wav");
    fs.writeFileSync(output, wav());
    const logs = path.join(root, "dub-logs");
    fs.mkdirSync(logs);
    fs.writeFileSync(
      path.join(logs, prep.request.id + "-1.json"),
      JSON.stringify({
        id: prep.request.id,
        result: "done",
        path: output,
        quality: {
          groups: [
            {
              key: "one",
              displayText: imported.project.chapters[0].text,
              audioStart: 0,
              audioEnd: 1,
              status: "review",
            },
          ],
        },
      }),
    );
    service = registerMediaWorkflows(config);
    const recovered = await call("book-recover", { id });
    assert.equal(recovered.recovered, 1);
    assert.equal(recovered.project.chapters[0].status, "review");
    assert.equal(recovered.project.chapters[0].activeJob, null);
    assert.equal((await call("book-export", { id, chapters: [0] })).ok, false);
    const approved = await call("book-approve", { id, chapter: 0, key: "one" });
    assert(approved.ok, approved.error);
    assert(approved.project.chapters[0].groups[0].manualApproval.audioHash);
    assert.equal(approved.project.chapters[0].status, "ready");
    const archive = path.join(root, "books.wbb"),
      projects = path.join(dirs.input, "Kitap projeleri");
    assert.equal(backup.exportBooks(projects, archive, true).count, 1);
    const { gunzipSync, gzipSync } = require("node:zlib");
    const bundle = JSON.parse(gunzipSync(fs.readFileSync(archive)));
    bundle.books[0].project.apiKey = "MUST_NOT_IMPORT";
    bundle.books[0].project.chapters[0].voiceSettings = {
      token: "MUST_NOT_IMPORT",
    };
    fs.writeFileSync(archive, gzipSync(Buffer.from(JSON.stringify(bundle))));
    const restored = path.join(root, "restored");
    assert.equal(backup.importBooks(restored, archive).count, 1);
    const newId = fs.readdirSync(restored)[0];
    assert.notEqual(newId, id);
    const doc = JSON.parse(
      fs.readFileSync(path.join(restored, newId, "project.json")),
    );
    assert.equal(doc.source, null);
    assert.equal(doc.apiKey, undefined);
    assert.deepEqual(doc.chapters[0].voiceSettings, {});
    assert(fs.existsSync(doc.chapters[0].output));
    const exportJob = call("book-export", { id, chapters: [0] });
    await started;
    assert.equal(
      (
        await call("book-save", {
          id,
          chapter: 0,
          text: "Changed during export",
        })
      ).ok,
      false,
    );
    assert((await call("cancel")).ok);
    const cancelled = await exportJob;
    assert.equal(cancelled.ok, false);
    assert.equal(fs.readFileSync(target, "utf8"), "keep prior");
    assert(!fs.readdirSync(root).some((n) => n.startsWith(".audiobook-")));
    assert((await call("book-rename", { id, title: "Yeni kitap adı" })).ok);
    assert((await call("book-archive", { id })).ok);
    assert.equal((await call("book-list")).projects.length, 0);
    assert.equal(
      (await call("book-list", { archived: true })).projects[0].id,
      id,
    );
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
test("PDF speech matches only exact source text and maintains repeated-text order", () => {
  const { match } = require("../src/renderer/pdf-spoken-map");
  assert.deepEqual(
    match(
      [{ str: "Birinci cümle." }, { str: "İkinci cümle." }],
      [{ text: "Birinci cümle." }, { text: "İkinci cümle." }],
    ),
    [[0], [1]],
  );
  assert.deepEqual(
    match(
      [{ str: "Untranslated original sentence." }],
      [{ text: "Türkçeye çevrilmiş farklı cümle." }],
    ),
    [[]],
  );
});
test("Letterboxd pagination accepts bounded public paths and rejects arbitrary queries/hosts", () => {
  const { publicFilmUrl } = require("../src/letterboxd-reviews");
  assert(
    publicFilmUrl("https://letterboxd.com/film/the-matrix/reviews/page/2/"),
  );
  assert(
    publicFilmUrl(
      "https://letterboxd.com/film/the-matrix/reviews/by/activity/",
    ),
  );
  for (const u of [
    "https://evil.com/film/x/reviews/",
    "https://letterboxd.com/film/x/reviews/?token=secret",
    "https://letterboxd.com/film/x/reviews/page/0/",
  ])
    assert.equal(publicFilmUrl(u), null);
});
