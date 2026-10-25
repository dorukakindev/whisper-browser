"use strict";
const test = require("node:test"),
  assert = require("node:assert/strict"),
  fs = require("node:fs"),
  os = require("node:os"),
  path = require("node:path"),
  { EventEmitter } = require("node:events");
const { registerMediaWorkflows } = require("../src/media-workflows");
test("EPUB production retains safe cover, format, author and stable source chapter identity", async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "book-metadata-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const source = path.join(root, "Öykü.epub");
  fs.writeFileSync(source, "controlled parser input");
  const app = new EventEmitter();
  app.getPath = () => root;
  const sender = {},
    cover = "data:image/png;base64,aGVsbG8=";
  let handler,
    data = {
      title: "İstanbul & Öykü",
      author: "Yazar",
      format: "epub",
      cover,
      chapters: [
        {
          title: "İkinci",
          text: "İlk okunan bölüm.",
          sourceId: "a".repeat(64),
          sourceSpineIndex: 0,
        },
        {
          title: "Birinci",
          text: "Sonraki bölüm.",
          sourceId: "b".repeat(64),
          sourceSpineIndex: 2,
        },
      ],
    };
  registerMediaWorkflows({
    app,
    ipcMain: {
      handle: (_name, fn) => {
        handler = fn;
      },
    },
    authorized: (e) => e.sender === sender,
    owner: () => null,
    dialog: { showOpenDialog: async () => ({ filePaths: [source] }) },
    python: () => "controlled",
    runTool: async (_tool, _args, input) => {
      assert.equal(JSON.parse(input).path, source);
      return JSON.stringify(data);
    },
  });
  const call = (action, value = {}) =>
    handler({ sender }, { action, ...value });
  const imported = await call("book-import");
  assert(imported.ok, imported.error);
  const p = (await call("book-open", { id: imported.project.id })).project;
  assert.equal(p.title, data.title);
  assert.equal(p.author, data.author);
  assert.equal(p.format, "epub");
  assert.equal(p.cover, cover);
  assert.deepEqual(
    p.chapters.map((c) => [c.id, c.title, c.sourceId, c.sourceSpineIndex]),
    [
      [0, "İkinci", "a".repeat(64), 0],
      [1, "Birinci", "b".repeat(64), 2],
    ],
  );
  data = {
    ...data,
    cover: "data:image/svg+xml;base64,PHN2Zz4=",
    chapters: [
      {
        title: "Invalid metadata",
        text: "Text remains readable",
        sourceId: "../../private",
        sourceSpineIndex: -1,
      },
    ],
  };
  const rejected = await call("book-import");
  assert(rejected.ok, rejected.error);
  assert.equal(rejected.project.cover, "");
  assert.equal(rejected.project.chapters[0].sourceId, null);
  assert.equal(rejected.project.chapters[0].sourceSpineIndex, null);
});
