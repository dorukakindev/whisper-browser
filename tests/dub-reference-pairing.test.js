"use strict";
const test = require("node:test"),
  assert = require("node:assert/strict"),
  fs = require("node:fs"),
  os = require("node:os"),
  path = require("node:path"),
  { EventEmitter } = require("node:events");
const { registerDubService } = require("../src/dub-service");
test("choosing a new local reference cannot silently retain a different voice transcript", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "reference-pair546-")),
    app = new EventEmitter(),
    handlers = {};
  app.getPath = () => root;
  const voice = path.join(root, "Yeni ses.wav"),
    old = path.join(root, "old-transcript.txt");
  fs.writeFileSync(voice, "fixture");
  fs.writeFileSync(old, "Old voice transcript.");
  fs.writeFileSync(
    path.join(root, "dub-settings.json"),
    JSON.stringify({ transcript: old }),
  );
  registerDubService({
    app,
    ipcMain: { handle: (n, f) => (handlers[n] = f) },
    dialog: {
      showOpenDialog: async () => ({ canceled: false, filePaths: [voice] }),
    },
    owner: () => null,
    authorized: () => true,
    busy: () => false,
    environment: () => ({}),
    grantMedia() {},
    spawn() {
      throw Error("No model should start.");
    },
    terminate: async () => true,
  });
  try {
    const result = await handlers["dub:config"](
      { sender: { id: 1 } },
      "reference",
    );
    assert(result.ok, result.error);
    assert.equal(result.reference, voice);
    assert.equal(result.transcript, voice.replace(/\.wav$/, ".txt"));
    assert.notEqual(result.transcript, old);
    assert.equal(fs.readFileSync(old, "utf8"), "Old voice transcript.");
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
