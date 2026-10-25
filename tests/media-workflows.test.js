"use strict";
const test = require("node:test"),
  assert = require("node:assert/strict"),
  fs = require("node:fs"),
  os = require("node:os"),
  path = require("node:path"),
  { EventEmitter } = require("node:events");
const {
  registerMediaWorkflows,
  chapterSrt,
} = require("../src/media-workflows");
const { findTestPython } = require("./python-runtime");
test("book projects keep edited text, use authorized narration jobs, and reject stale results", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "workflow546-")),
    handlers = {},
    app = new EventEmitter();
  app.getPath = () => root;
  const sender = Object.assign(new EventEmitter(), {
    id: 1,
    isDestroyed: () => false,
    send() {},
  });
  const grants = [];
  const source = path.join(root, "kitap.txt");
  fs.writeFileSync(
    source,
    "Birinci bölümün bütün sözcüklerini ve anlamını koruyalım. Henüz sonucu bilmiyoruz.",
  );
  const python = findTestPython();
  assert(python);
  const service = registerMediaWorkflows({
    app,
    ipcMain: { handle: (n, f) => (handlers[n] = f) },
    authorized: (e) => e.sender === sender,
    owner: () => null,
    dialog: {
      showOpenDialog: async () => ({ canceled: false, filePaths: [source] }),
    },
    python: () => python,
    grantSubtitle: (p) => grants.push(p),
    resources: () => ({ processes: [] }),
    resolvePdf: id => id === "approved-hash" ? {filePath:source,title:"Approved PDF"} : null,
  });
  const call = (action, r = {}) =>
    handlers["media-workflows:request"]({ sender }, { action, ...r });
  try {
    assert.equal((await call('book-from-reader',{pdfHash:'unknown',numPages:3,pages:[{pageNumber:2,text:'Text'}]})).ok,false);
    assert.equal((await call('book-from-reader',{pdfHash:'approved-hash',numPages:3,pages:[{pageNumber:4,text:'Text'}]})).ok,false);
    assert.equal((await call('book-from-reader',{pdfHash:'approved-hash',numPages:3,pages:[{pageNumber:2,text:'One'},{pageNumber:2,text:'Duplicate'}]})).ok,false);
    const selectedBook=await call('book-from-reader',{pdfHash:'approved-hash',numPages:3,pages:[{pageNumber:2,text:'Türkçe ikinci sayfa.'},{pageNumber:3,text:'Üçüncü sayfa.'}]});
    assert(selectedBook.ok);assert.deepEqual(selectedBook.project.selectedChapters,[0,1]);assert.deepEqual(selectedBook.project.chapters.map(c=>c.pageNumber),[2,3]);assert.equal(selectedBook.project.source,undefined);
    assert.equal(

      (
        await handlers["media-workflows:request"](
          { sender: {} },
          { action: "book-list" },
        )
      ).ok,
      false,
    );
    const imported = await call("book-import");
    assert(imported.ok, imported.error);
    const id = imported.project.id;
    const prepared = await call("book-prepare", { id, chapter: 0 });
    assert(prepared.ok);
    assert(prepared.request.narration);
    assert.equal(prepared.request.timingMode, "video");
    assert.equal(prepared.request.naturalSpeech, false);
    assert(grants.includes(prepared.request.srt));
    const wav = path.join(root, "out.wav");
    fs.writeFileSync(wav, "controlled output");
    await call("book-save", { id, chapter: 0, text: "Düzenlenen yeni metin." });
    service.capture({
      id: prepared.request.id,
      path: wav,
      quality: { groups: [{ status: "ready" }] },
    });
    assert.equal(
      (await call("book-open", { id })).project.chapters[0].status,
      "pending",
      "late old audio cannot approve edited text",
    );
    const second = await call("book-prepare", { id, chapter: 0 });
    service.capture({
      id: second.request.id,
      path: wav,
      quality: { groups: [{ status: "review" }] },
    });
    assert.equal(
      (await call("book-open", { id })).project.chapters[0].status,
      "review",
    );
    assert.equal(
      (await call("book-export", { id, chapters: [0] })).ok,
      false,
      "review audio cannot silently become a finished audiobook",
    );
    assert.equal((await call("book-open", { id: "../../escape" })).ok, false);
    assert.equal(
      (await call("book-prepare", { id, chapter: "__proto__" })).ok,
      false,
    );
    assert((await call("book-selection", { id, chapters: [0] })).ok);
    assert.deepEqual(
      (await call("book-open", { id })).project.selectedChapters,
      [0],
    );
    assert.equal(
      (await call("book-selection", { id, chapters: [999] })).ok,
      false,
    );
    assert.equal(
      (await call("book-progress", { id, chapter: 0, position: Infinity })).ok,
      false,
    );
    assert.equal(
      fs.readFileSync(source, "utf8"),
      "Birinci bölümün bütün sözcüklerini ve anlamını koruyalım. Henüz sonucu bilmiyoruz.",
    );
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
test("chapter planning retains every word and emits bounded source groups", () => {
  const text =
      "Bu bölümde anlatılan bütün sözcükleri dikkatle koruyacağız. ".repeat(30),
    srt = chapterSrt(text);
  const bodies = srt
    .replace(/^\ufeff/, "")
    .split("\n\n")
    .map((block) => block.split("\n").slice(2).join(" ").trim())
    .join(" ");
  assert.deepEqual(bodies.split(/\s+/), text.trim().split(/\s+/));
  assert.throws(() => chapterSrt(" "));
});
