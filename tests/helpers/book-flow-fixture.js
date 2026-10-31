'use strict';
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),assert=require('node:assert/strict');
const {EventEmitter}=require('node:events');
const {registerMediaWorkflows}=require('../../src/media-workflows'),{voiceStorage}=require('../../src/voice-storage');
function wav(seconds = 2, rate = 24000) {
  const b = Buffer.alloc(44 + rate * 2 * seconds);
  b.write("RIFF");
  b.writeUInt32LE(b.length - 8, 4);
  b.write("WAVEfmt ", 8);
  b.writeUInt32LE(16, 16);
  b.writeUInt16LE(1, 20);
  b.writeUInt16LE(1, 22);
  b.writeUInt32LE(rate, 24);
  b.writeUInt32LE(rate * 2, 28);
  b.writeUInt16LE(2, 32);
  b.writeUInt16LE(16, 34);
  b.write("data", 36);
  b.writeUInt32LE(b.length - 44, 40);
  for (let i = 0; i < rate * seconds; i++)
    b.writeInt16LE(
      Math.round(Math.sin((i / rate) * 440 * Math.PI * 2) * 4000),
      44 + i * 2,
    );
  return b;
}
async function fixture(t, options = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "book-export551-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const app = new EventEmitter();
  app.getPath = () => root;
  const source = path.join(root, "book.pdf");
  fs.writeFileSync(source, "controlled source");
  const target = path.join(root, "existing.m4b"),
    events = [];
  fs.writeFileSync(target, "keep original");
  const sender = Object.assign(new EventEmitter(), {
    id: 1,
    isDestroyed: () => false,
    send: (channel, event) => events.push(event),
  });
  let handler,
    encoded = 0,
    disk = "room";
  const service = registerMediaWorkflows({
    app,
    ipcMain: { handle: (_, fn) => (handler = fn) },
    authorized: (e) => e.sender === sender,
    owner: () => null,
    resolvePdf: () => ({ filePath: source, numPages: 2, title: "Kitap" }),
    grantSubtitle() {},
    grantMedia() {},
    dialog: { showSaveDialog: async () => ({ filePath: target }) },
    ffprobe: () => "probe",
    ffmpeg: () => "encode",
    statfs: () => {
      if (disk === "unknown") throw Error("unavailable");
      return { bavail: disk === "full" ? 0n : 1000000n, bsize: 4096n };
    },
    runTool: async (tool, args, _input, _signal, _timeout, onLine, flags) => {
      if (tool === "probe") return "2";
      encoded++;
      assert.equal(flags.waitForCloseOnCancel, true);
      for (let i = 0; i < 1000; i++) onLine("out_time_us=1000000");
      onLine("out_time_us=bad");
      fs.writeFileSync(args.at(-1), "complete AAC fixture");
      return "";
    },
    ...options,
  });
  const call = (action, data = {}) => handler({ sender }, { action, ...data });
  const imported = await call("book-from-reader", {
    pdfHash: "approved",
    numPages: 2,
    pages: [
      { pageNumber: 1, text: "First controlled chapter." },
      { pageNumber: 2, text: "Second controlled chapter." },
    ],
  });
  assert(imported.ok, imported.error);
  const id = imported.project.id;
  fs.mkdirSync(voiceStorage(app).output, { recursive: true });
  for (let chapter = 0; chapter < 2; chapter++) {
    const prepared = await call("book-prepare", { id, chapter });
    assert(prepared.ok, prepared.error);
    const output = path.join(
      voiceStorage(app).output,
      prepared.request.id + ".wav",
    );
    fs.writeFileSync(
      output,
      wav(
        options.fixtureSeconds || 2,
        options.fixtureRates?.[chapter] || 24000,
      ),
    );
    service.capture({
      id: prepared.request.id,
      path: output,
      quality: {
        groups: [
          {
            key: "group",
            status: "ready",
            displayText: imported.project.chapters[chapter].text,
            audioStart: 0,
            audioEnd: options.fixtureSeconds || 2,
          },
        ],
      },
    });
  }
  return {
    root,
    target,
    id,
    call,
    events,
    sender,
    setDisk: (value) => (disk = value),
    encoded: () => encoded,
    service,
  };
}
module.exports={fixture,wav};
