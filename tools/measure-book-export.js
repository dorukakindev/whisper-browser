"use strict";
// Explicit, bounded performance probe. Not part of the normal test runner.
const fs = require("node:fs"),
  path = require("node:path"),
  os = require("node:os"),
  assert = require("node:assert/strict"),
  cp = require("node:child_process"),
  { EventEmitter } = require("node:events");
const { findMediaTool } = require("../tests/media-runtime"),
  ffmpeg = findMediaTool("ffmpeg"),
  ffprobe = findMediaTool("ffprobe");
if (!ffmpeg || !ffprobe) throw Error("FFmpeg and ffprobe are required.");
const root = fs.mkdtempSync(path.join(os.tmpdir(), "book-export-measure-")),
  target = path.join(root, "100-bölüm.m4b"),
  trace = [],
  monitors = [];
let active = 0,
  maxActive = 0;
const originalSpawn = cp.spawn;
function quotedLength(value) {
  const text = String(value);
  return !text || /[\s"]/.test(text)
    ? ('"' + text.replace(/(\\*)"/g, '$1$1\\"').replace(/(\\+)$/, "$1$1") + '"')
        .length
    : text.length;
}
function monitor(pid) {
  if (process.platform !== "win32") return Promise.resolve(null);
  const script = `$m=0L;$h=0;$t=0;$n=0;try{$p=Get-Process -Id ${pid} -ErrorAction Stop;while(-not $p.HasExited){$p.Refresh();$m=[Math]::Max($m,$p.PeakWorkingSet64);$h=[Math]::Max($h,$p.HandleCount);$t=[Math]::Max($t,$p.Threads.Count);$n++;Start-Sleep -Milliseconds 50}}catch{};@{peakWorkingSetBytes=$m;maxObservedHandles=$h;maxObservedThreads=$t;samples=$n}|ConvertTo-Json -Compress`;
  return new Promise((resolve) => {
    const p = originalSpawn(
      "powershell.exe",
      ["-NoProfile", "-NonInteractive", "-Command", script],
      { windowsHide: true, stdio: ["ignore", "pipe", "ignore"] },
    );
    let out = "";
    const timer = setTimeout(() => {
      p.kill();
      resolve(null);
    }, 120000);
    p.stdout.on("data", (b) => (out += b));
    p.once("error", () => {
      clearTimeout(timer);
      resolve(null);
    });
    p.once("close", () => {
      clearTimeout(timer);
      try {
        const value = JSON.parse(out);
        resolve(value.samples ? value : null);
      } catch {
        resolve(null);
      }
    });
  });
}
// Keep the production runner unchanged; instrument only its captured spawn in this process.
cp.spawn = (exe, args, options) => {
  const child = originalSpawn(exe, args, options),
    start = performance.now(),
    entry = {
      tool: path.basename(exe),
      pid: child.pid,
      argumentCount: args.length,
      windowsCommandChars: [exe, ...args]
        .map(quotedLength)
        .reduce((a, b) => a + b + 1, 0),
    };
  trace.push(entry);
  active++;
  maxActive = Math.max(maxActive, active);
  if (path.basename(exe).toLowerCase().startsWith("ffmpeg") && child.pid) {
    const m = monitor(child.pid).then(
      (value) => (entry.windowsProcess = value),
    );
    monitors.push(m);
  }
  child.once("close", (code) => {
    active--;
    entry.exitCode = code;
    entry.wallMs = performance.now() - start;
  });
  return child;
};
const { registerMediaWorkflows } = require("../src/media-workflows"),
  { run } = require("../src/browser-media-tools");
cp.spawn = originalSpawn;
const { voiceStorage } = require("../src/voice-storage");
function wav() {
  const rate = 24000,
    b = Buffer.alloc(44 + rate * 2);
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
  b.writeUInt32LE(rate * 2, 40);
  for (let i = 0; i < rate; i++)
    b.writeInt16LE(
      Math.round(Math.sin((i * 2 * Math.PI * 220) / rate) * 1000),
      44 + i * 2,
    );
  return b;
}
async function main() {
  const app = new EventEmitter();
  app.getPath = () => root;
  const sender = new EventEmitter();
  sender.id = 1;
  sender.isDestroyed = () => false;
  const progress = [];
  sender.send = (_name, event) => {
    if (event.type === "progress") progress.push(event.stage);
  };
  const handlers = {},
    source = path.join(root, "source.pdf"),
    audio = path.join(root, "fixture.wav");
  fs.writeFileSync(source, "controlled source");
  fs.writeFileSync(audio, wav());
  const service = registerMediaWorkflows({
    app,
    ipcMain: { handle: (name, fn) => (handlers[name] = fn) },
    authorized: (e) => e.sender === sender,
    owner: () => null,
    resolvePdf: () => ({ filePath: source, title: "100 chapters" }),
    grantSubtitle() {},
    grantMedia() {},
    ffmpeg: () => ffmpeg,
    ffprobe: () => ffprobe,
    dialog: {
      showSaveDialog: async () => ({ canceled: false, filePath: target }),
    },
  });
  const call = (action, r = {}) =>
    handlers["media-workflows:request"]({ sender }, { action, ...r });
  const imported = await call("book-from-reader", {
    pdfHash: "fixture",
    numPages: 100,
    pages: Array.from({ length: 100 }, (_, i) => ({
      pageNumber: i + 1,
      text: `Bölüm ${i + 1}. Kontrollü ölçüm metni.`,
    })),
  });
  assert(imported.ok, imported.error);
  const id = imported.project.id,
    setupStart = performance.now();
  for (let chapter = 0; chapter < 100; chapter++) {
    const p = await call("book-prepare", { id, chapter });
    assert(p.ok, p.error);
    service.capture({
      id: p.request.id,
      path: audio,
      quality: {
        groups: [
          {
            key: "1",
            status: "ready",
            displayText: imported.project.chapters[chapter].text,
            audioStart: 0,
            audioEnd: 1,
          },
        ],
      },
    });
  }
  const setupMs = performance.now() - setupStart,
    chosen = Array.from({ length: 100 }, (_, i) => 99 - i),
    before = process.memoryUsage();
  let peak = before.rss;
  const timer = setInterval(
      () => (peak = Math.max(peak, process.memoryUsage().rss)),
      40,
    ),
    start = performance.now();
  const result = await call("book-export", { id, chapters: chosen }),
    exportMs = performance.now() - start;
  clearInterval(timer);
  assert(result.ok, result.error);
  const exported = JSON.parse(
    await run(
      ffprobe,
      ["-v", "error", "-show_chapters", "-show_format", "-of", "json", target],
      "",
      undefined,
      15000,
    ),
  );
  assert.equal(exported.chapters.length, 100);
  assert(Math.abs(Number(exported.format.duration) - 100) < 0.1);
  for (let i = 0; i < 100; i++) {
    assert.equal(
      exported.chapters[i].tags.title,
      imported.project.chapters[i].title,
    );
    assert(Math.abs(Number(exported.chapters[i].start_time) - i) < 0.001);
  }
  await run(
    ffmpeg,
    ["-v", "error", "-i", target, "-f", "null", "-"],
    "",
    undefined,
    30000,
  );
  await Promise.all(monitors);
  await new Promise((r) => setTimeout(r, 100));
  assert.equal(active, 0);
  assert.equal(sender.listenerCount("destroyed"), 0);
  assert(
    !fs
      .readdirSync(path.dirname(target))
      .some((n) => n.startsWith(".audiobook-")),
  );
  const projectFolder = path.join(
    voiceStorage(app).input,
    "Kitap projeleri",
    id,
  );
  assert(
    !fs
      .readdirSync(projectFolder)
      .some((n) => /^export-.*\.(txt|ffconcat)$/.test(n)),
  );
  const report = {
    scenario:
      "100 controlled 1-second PCM chapters, actual AAC/M4B encode and full decode; no TTS",
    platform: process.platform,
    node: process.version,
    chapters: 100,
    audioSeconds: Number(exported.format.duration),
    setupMs,
    exportMs,
    nodeRssBefore: before.rss,
    nodeRssPeak: peak,
    nodeRssAfter: process.memoryUsage().rss,
    maxConcurrentMediaChildren: maxActive,
    liveMediaChildren: active,
    destroyedListenersAfter: sender.listenerCount("destroyed"),
    mediaCalls: trace.length,
    exportEncoding: trace.find((e) =>
      e.tool.toLowerCase().startsWith("ffmpeg"),
    ),
    maxWindowsCommandChars: Math.max(
      ...trace.map((e) => e.windowsCommandChars),
    ),
    exitCodes: [...new Set(trace.map((e) => e.exitCode))],
    progressStages: [...new Set(progress)],
    activeResourcesAfter: process.getActiveResourcesInfo(),
  };
  const dest = process.argv[2];
  if (dest) {
    fs.mkdirSync(path.dirname(path.resolve(dest)), { recursive: true });
    fs.writeFileSync(dest, JSON.stringify(report, null, 2));
  }
  process.stdout.write(JSON.stringify(report, null, 2) + "\n");
}
main()
  .finally(() => {
    if (
      path.dirname(path.resolve(root)) !== path.resolve(os.tmpdir()) ||
      !path.basename(root).startsWith("book-export-measure-")
    )
      throw Error("Unexpected measurement folder");
    fs.rmSync(root, { recursive: true, force: true });
  })
  .catch((error) => {
    process.stderr.write(error.stack + "\n");
    process.exitCode = 1;
  });
