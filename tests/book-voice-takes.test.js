"use strict";
const test = require("node:test"),
  assert = require("node:assert/strict"),
  fs = require("node:fs"),
  os = require("node:os"),
  path = require("node:path"),
  { EventEmitter } = require("node:events");
const { registerMediaWorkflows } = require("../src/media-workflows");
test("voice takes persist, preserve review state and refuse stale text, changed files and active production", async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "voice-takes-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const app = new EventEmitter();
  app.getPath = () => root;
  const source = path.join(root, "source.pdf"),
    wav = path.join(root, "source.wav"),
    handlers = {},
    sender = {};
  fs.writeFileSync(source, "controlled source");
  let running = false;
  const config = {
    app,
    ipcMain: { handle: (name, fn) => (handlers[name] = fn) },
    authorized: (e) => e.sender === sender,
    owner: () => null,
    resolvePdf: () => ({ filePath: source, title: "Book" }),
    grantSubtitle() {},
    grantMedia() {},
    voiceRunning: () => running,
  };
  let service = registerMediaWorkflows(config);
  const call = (action, r = {}) =>
    handlers["media-workflows:request"]({ sender }, { action, ...r });
  const imported = await call("book-from-reader", {
    pdfHash: "fixture",
    numPages: 1,
    pages: [{ pageNumber: 1, text: "A current chapter." }],
  });
  assert(imported.ok, imported.error);
  const id = imported.project.id;
  async function capture(byte, status) {
    const prep = await call("book-prepare", { id, chapter: 0 });
    assert(prep.ok, prep.error);
    fs.writeFileSync(wav, Buffer.alloc(1024, byte)); // Storage fixture, not an audio-quality claim.
    service.capture({
      id: prep.request.id,
      path: wav,
      quality: {
        groups: [
          {
            key: "1",
            displayText: "A current chapter.",
            audioStart: 0,
            audioEnd: 3,
            status,
          },
        ],
      },
    });
    const p = await call("book-open", { id });
    assert(p.project.chapters[0].output);
    return p.project.chapters[0].output;
  }
  const first = await capture(1, "review"),
    second = await capture(2, "ready");
  assert.notEqual(first, second);
  service = registerMediaWorkflows(config);
  const listing = await call("book-takes", { id, chapter: 0 });
  assert.equal(listing.takes.length, 2);
  assert(
    listing.takes.find(
      (take) =>
        take.id === first &&
        !take.current &&
        take.textMatches &&
        take.status === "review",
    ),
  );
  const opened = await call("book-take-listen", {
    id,
    chapter: 0,
    takeId: first,
  });
  assert(opened.ok, opened.error);
  const firstPath = opened.path,
    secondPath = path.join(path.dirname(firstPath), second);
  const selected = await call("book-take-select", {
    id,
    chapter: 0,
    takeId: first,
    textHash: listing.textHash,
  });
  assert(selected.ok, selected.error);
  assert.equal(selected.project.chapters[0].output, first);
  assert.equal(selected.project.chapters[0].status, "review");
  assert.equal(selected.project.chapters[0].position, 0);
  assert(fs.existsSync(firstPath));
  assert(fs.existsSync(secondPath));
  fs.renameSync(secondPath, secondPath + ".removed");
  assert.equal(
    (await call("book-takes", { id, chapter: 0 })).takes.find(
      (t) => t.id === second,
    ).available,
    false,
  );
  assert.match(
    (await call("book-take-listen", { id, chapter: 0, takeId: second })).error,
    /unavailable/,
  );
  fs.renameSync(secondPath + ".removed", secondPath);
  running = true;
  assert.equal(
    (
      await call("book-take-select", {
        id,
        chapter: 0,
        takeId: second,
        textHash: listing.textHash,
      })
    ).ok,
    false,
  );
  running = false;
  assert.equal(
    (
      await call("book-take-listen", {
        id,
        chapter: 0,
        takeId: "../source.wav",
      })
    ).ok,
    false,
  );
  fs.writeFileSync(secondPath, "tampered");
  assert.match(
    (await call("book-take-listen", { id, chapter: 0, takeId: second })).error,
    /changed on disk/,
  );
  assert.equal(
    (
      await call("book-take-select", {
        id,
        chapter: 0,
        takeId: second,
        textHash: listing.textHash,
      })
    ).ok,
    false,
  );
  assert.equal(
    (await call("book-open", { id })).project.chapters[0].output,
    first,
  );
  fs.writeFileSync(secondPath, Buffer.alloc(1024, 2));
  await call("book-save", { id, chapter: 0, text: "New chapter text." });
  assert.match(
    (
      await call("book-take-select", {
        id,
        chapter: 0,
        takeId: second,
        textHash: listing.textHash,
      })
    ).error,
    /Text changed/,
  );
  const after = await call("book-takes", { id, chapter: 0 });
  assert(after.takes.every((take) => !take.textMatches));
  assert.match(
    (
      await call("book-take-select", {
        id,
        chapter: 0,
        takeId: second,
        textHash: after.textHash,
      })
    ).error,
    /older text/,
  );
  assert.equal(
    (await call("book-take-listen", { id, chapter: 0, takeId: second }))
      .textMatches,
    false,
  );
  const restored = await call("book-save", {
    id,
    chapter: 0,
    text: "A current chapter.",
  });
  assert.equal(
    restored.project.chapters[0].status,
    "review",
    "undoing text edits restores the matching audio's actual review state, not a false pending/ready status",
  );
  fs.writeFileSync(firstPath, "changed current audio");
  assert.match(
    (await call("book-take-listen", { id, chapter: 0, takeId: first })).error,
    /changed on disk/,
  );
  const fresh = await capture(3, "ready");
  assert.notEqual(
    fresh,
    first,
    "a damaged previous comparison must not block fresh audio capture",
  );
  assert.equal(
    (await call("book-takes", { id, chapter: 0 })).historyIncomplete,
    true,
  );
  assert.equal(
    fs.readFileSync(firstPath, "utf8"),
    "changed current audio",
    "old files are never deleted or rewritten",
  );
});
