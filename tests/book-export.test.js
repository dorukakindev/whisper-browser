"use strict";
const test = require("node:test"),
  assert = require("node:assert/strict"),
  fs = require("node:fs"),
  os = require("node:os"),
  path = require("node:path"),
  vm = require("node:vm");
const { EventEmitter } = require("node:events"),
  { createRequire } = require("node:module");
const { registerMediaWorkflows } = require("../src/media-workflows"),
  { voiceStorage } = require("../src/voice-storage");
const { findMediaTool } = require("./media-runtime");
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
    resolvePdf: () => ({ filePath: source, title: "Kitap" }),
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
  };
}
test("M4B preview preserves order, uses probed durations and reports unknown/low disk without overwriting", async (t) => {
  const f = await fixture(t),
    preview = await f.call("book-export-preview", {
      id: f.id,
      chapters: [1, 0, 1],
    });
  assert(preview.ok, preview.error);
  assert.deepEqual(
    preview.chapters.map((r) => r.chapter),
    [0, 1],
  );
  assert.equal(preview.seconds, 4);
  assert(preview.estimatedBytes > 80000);
  assert(preview.freeBytes > 0);
  assert.equal(f.encoded(), 0);
  assert.equal(fs.readFileSync(f.target, "utf8"), "keep original");
  f.setDisk("full");
  const refused = await f.call("book-export", { id: f.id, chapters: [0] });
  assert.equal(refused.ok, false);
  assert.match(refused.error, /free space/);
  assert.equal(f.encoded(), 0);
  assert.equal(fs.readFileSync(f.target, "utf8"), "keep original");
  f.setDisk("unknown");
  assert.equal(
    (await f.call("book-export-preview", { id: f.id, chapters: [0] }))
      .freeBytes,
    null,
  );
  const exported = await f.call("book-export", { id: f.id, chapters: [0] });
  assert(exported.ok, exported.error);
  assert.equal(f.encoded(), 1);
  assert.equal(fs.readFileSync(f.target, "utf8"), "complete AAC fixture");
  const progress = f.events.filter((e) => Number.isFinite(e.percent));
  assert(progress.length < 10, "throttled progress, no event flood");
  assert.deepEqual(
    progress.map((e) => e.percent),
    [0, 50, 100],
  );
  assert(progress.every((e) => e.projectId === f.id));
  assert.equal(f.sender.listenerCount("destroyed"), 0);
  assert(!fs.readdirSync(f.root).some((n) => n.startsWith(".audiobook-")));
});

test("completed M4B is linked to its shelf book with selection, revision and file identity", async (t) => {
  let linked;
  const granted = [];
  const f = await fixture(t, {
    resolveShelfBook: (id) =>
      id === "shelf-book" ? { productionProjectId: linked } : null,
    grantMedia: (p) => granted.push(p),
  });
  linked = f.id;
  const manifest = path.join(
    voiceStorage({ getPath: () => f.root }).input,
    "Kitap projeleri",
    f.id,
    "project.json",
  );
  const project = JSON.parse(fs.readFileSync(manifest, "utf8"));
  project.shelfBookId = "shelf-book";
  fs.writeFileSync(manifest, JSON.stringify(project));
  assert.equal((await f.call("book-audiobook", { id: f.id })).ok, false);
  assert((await f.call("book-export", { id: f.id, chapters: [1] })).ok);
  const opened = await f.call("book-open", { id: f.id });
  assert.equal(
    opened.project.audiobook.path,
    undefined,
    "project metadata does not expose the output path",
  );
  assert.deepEqual(
    opened.project.audiobook.chapters.map((c) => c.chapter),
    [1],
  );
  const exportId = opened.project.audiobook.id;
  const listing = await f.call("book-audiobooks", {
    shelfIds: ["shelf-book", "unknown"],
  });
  assert.equal(listing.audiobooks.length, 1);
  assert.equal(
    listing.audiobooks[0].chapters,
    1,
    "a partial export is not presented as the whole book",
  );
  assert.equal(listing.audiobooks[0].current, true);
  assert.equal(listing.audiobooks[0].available, true);
  assert.equal(listing.audiobooks[0].path, undefined);
  assert.equal(
    (await f.call("book-audiobook", { id: f.id, exportId: "old" })).ok,
    false,
  );
  const play = await f.call("book-audiobook", { id: f.id, exportId });
  assert(play.ok, play.error);
  assert.equal(play.path, f.target);
  assert.equal(granted.at(-1), f.target);
  assert(
    (
      await f.call("book-save", {
        id: f.id,
        chapter: 1,
        text: "Edited after export.",
      })
    ).ok,
  );
  assert.equal(
    (await f.call("book-audiobooks", { shelfIds: ["shelf-book"] }))
      .audiobooks[0].current,
    false,
  );
  assert.equal(
    (await f.call("book-audiobook", { id: f.id, exportId })).ok,
    true,
    "an explicitly labelled earlier export stays playable",
  );
  fs.writeFileSync(f.target, "replacement file");
  assert.equal(
    (await f.call("book-audiobook", { id: f.id, exportId })).ok,
    false,
  );
  assert.equal(
    (await f.call("book-audiobooks", { shelfIds: ["shelf-book"] }))
      .audiobooks[0].available,
    false,
  );
  fs.unlinkSync(f.target);
  assert.equal(
    (await f.call("book-audiobook", { id: f.id, exportId })).ok,
    false,
  );
  assert.equal(
    (
      await f.call("book-audiobooks", {
        shelfIds: Array(301).fill("shelf-book"),
      })
    ).ok,
    false,
  );
});

test(
  "real Windows/POSIX ffmpeg cancellation confirms process close before export cleanup",
  { timeout: 25000 },
  async (t) => {
    const ffmpeg = findMediaTool("ffmpeg"),
      ffprobe = findMediaTool("ffprobe");
    assert(ffmpeg && ffprobe, "ffmpeg/ffprobe required for real cancellation");
    const source = require.resolve("../src/browser-media-tools"),
      nativeRequire = createRequire(source),
      cp = require("node:child_process"),
      children = [];
    const mod = { exports: {} };
    vm.runInNewContext(fs.readFileSync(source, "utf8"), {
      module: mod,
      exports: mod.exports,
      __dirname: path.dirname(source),
      require: (name) =>
        name === "node:child_process"
          ? {
              ...cp,
              spawn: (...args) => {
                const c = cp.spawn(...args);
                children.push(c);
                c.once("close", () => (c.confirmedClosed = true));
                return c;
              },
            }
          : nativeRequire(name),
      Buffer,
      process,
      setTimeout,
      clearTimeout,
    });
    let started;
    const ready = new Promise((resolve) => (started = resolve));
    const f = await fixture(t, {
      fixtureSeconds: 30,
      ffmpeg: () => ffmpeg,
      ffprobe: () => ffprobe,
      runTool: (tool, args, input, signal, timeout, onLine, flags) => {
        const real = args.includes("-progress")
          ? (() => {
              const a = args.slice();
              a.splice(a.indexOf("-i"), 0, "-re");
              return a;
            })()
          : args;
        return mod.exports.run(
          tool,
          real,
          input,
          signal,
          timeout,
          (line) => {
            onLine?.(line);
            if (/^out_time_us=[1-9]/.test(line)) started();
          },
          flags,
        );
      },
    });
    const pending = f.call("book-export", { id: f.id, chapters: [0, 1] });
    await ready;
    assert.equal(
      (
        await f.call("book-save", {
          id: f.id,
          chapter: 0,
          text: "cannot change during export",
        })
      ).ok,
      false,
    );
    assert((await f.call("cancel")).ok);
    const result = await pending;
    assert.equal(result.ok, false);
    assert.equal(fs.readFileSync(f.target, "utf8"), "keep original");
    const encoder = children.find((c) => c.spawnargs.includes("-progress"));
    assert(encoder);
    assert.equal(
      encoder.confirmedClosed,
      true,
      "no cleanup/lock release before ffmpeg close",
    );
    assert(encoder.exitCode !== null || encoder.signalCode !== null);
    assert(!fs.readdirSync(f.root).some((n) => n.startsWith(".audiobook-")));
    assert.equal(f.sender.listenerCount("destroyed"), 0);
    const dir = path.join(
      voiceStorage({ getPath: () => f.root }).input,
      "Kitap projeleri",
      f.id,
    );
    assert(
      !fs.readdirSync(dir).some((n) => /^export-.*\.(txt|ffconcat)$/.test(n)),
    );
    assert(
      !fs
        .readdirSync(
          path.join(f.root, "Sesler", "Girdi", "Kitap projeleri", f.id),
        )
        .some((n) => n.startsWith("export-")),
    );
    assert(
      (await f.call("book-rename", { id: f.id, title: "Lock released" })).ok,
    );
  },
);

test("mixed-rate chapter export retains real resampling, ordered metadata and complete decoded duration", async (t) => {
  const ffmpeg = findMediaTool("ffmpeg"),
    ffprobe = findMediaTool("ffprobe"),
    { run } = require("../src/browser-media-tools"),
    commands = [];
  assert(ffmpeg && ffprobe);
  const f = await fixture(t, {
    fixtureSeconds: 1,
    fixtureRates: [24000, 48000],
    ffmpeg: () => ffmpeg,
    ffprobe: () => ffprobe,
    runTool: (...args) => {
      commands.push(args[1]);
      return run(...args);
    },
  });
  const result = await f.call("book-export", { id: f.id, chapters: [1, 0] });
  assert(result.ok, result.error);
  assert(
    commands.some((a) => a.includes("-filter_complex")),
    "unlike formats must not use the stream playlist",
  );
  const metadata = JSON.parse(
    await run(
      ffprobe,
      [
        "-v",
        "error",
        "-show_chapters",
        "-show_format",
        "-of",
        "json",
        f.target,
      ],
      "",
      undefined,
      15000,
    ),
  );
  assert.equal(metadata.chapters.length, 2);
  assert.equal(metadata.chapters[0].tags.title, "Page / Sayfa 1");
  assert(Math.abs(Number(metadata.format.duration) - 2) < 0.1);
  await run(
    ffmpeg,
    ["-v", "error", "-i", f.target, "-f", "null", "-"],
    "",
    undefined,
    15000,
  );
});

test("real M4B metadata preserves reserved characters and chapter-marker text",{timeout:20000},async(t)=>{
 const ffmpeg=findMediaTool("ffmpeg"),ffprobe=findMediaTool("ffprobe");assert(ffmpeg&&ffprobe);
 const f=await fixture(t,{ffmpeg:()=>ffmpeg,ffprobe:()=>ffprobe,runTool:require("../src/browser-media-tools").run});
 const file=path.join(voiceStorage({getPath:()=>f.root}).input,"Kitap projeleri",f.id,"project.json");
 const d=JSON.parse(fs.readFileSync(file,"utf8"));
 d.title='AC=DC; #1\\Kitap\nİkinci satır 😀';d.author='Yazar\\Soyadı; #=Ali';
 d.chapters[0].title='Giriş = Başlangıç; x';d.chapters[1].title='Bölüm #2\n[CHAPTER]\nSTART=0';
 fs.writeFileSync(file,JSON.stringify(d));
 const result=await f.call("book-export",{id:f.id,chapters:[0,1]});assert(result.ok,result.error);
 const raw=require("node:child_process").execFileSync(ffprobe,["-v","error","-show_format","-show_chapters","-of","json",f.target],{encoding:"utf8",windowsHide:true});
 const actual=JSON.parse(raw);assert.equal(actual.format.tags.title,d.title);assert.equal(actual.format.tags.artist,d.author);
 assert.equal(actual.chapters.length,2);assert.deepEqual(actual.chapters.map(c=>c.tags.title),d.chapters.map(c=>c.title));
});
