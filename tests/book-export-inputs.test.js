"use strict";
const test = require("node:test"),
  assert = require("node:assert/strict"),
  fs = require("node:fs"),
  os = require("node:os"),
  path = require("node:path"),
  { execFileSync } = require("node:child_process");
const { streamList } = require("../src/book-export-inputs"),
  { inspectVoiceOutput, validVoiceOutput } = require("../src/voice-output"),
  wav = require("./helpers/wav-fixture"),
  { findMediaTool } = require("./media-runtime");
test("stream concatenation requires fully validated identical formats and quotes Unicode/apostrophe paths for actual ffmpeg", (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "book-concat-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const folder = path.join(root, "O'Neil Türkçe");
  fs.mkdirSync(folder);
  const a = path.join(folder, "bir.wav"),
    b = path.join(folder, "iki.wav");
  fs.writeFileSync(a, wav(2400));
  fs.writeFileSync(b, wav(2400));
  assert.equal(validVoiceOutput(a), true);
  assert(inspectVoiceOutput(a).formatKey);
  const playlist = streamList([a, b]);
  assert(playlist);
  const file = path.join(root, "input.ffconcat");
  fs.writeFileSync(file, playlist);
  const ffmpeg = findMediaTool("ffmpeg");
  assert(ffmpeg);
  execFileSync(
    ffmpeg,
    [
      "-v",
      "error",
      "-f",
      "concat",
      "-safe",
      "0",
      "-i",
      file,
      "-f",
      "null",
      "-",
    ],
    { windowsHide: true, timeout: 15000 },
  );
  const other = wav(2400);
  other.writeUInt32LE(48000, 24);
  other.writeUInt32LE(96000, 28);
  fs.writeFileSync(b, other);
  assert.equal(
    streamList([a, b]),
    null,
    "different sample rates must retain the resampling filter path",
  );
  fs.writeFileSync(b, other.subarray(0, 50));
  assert.equal(validVoiceOutput(b), false);
  assert.equal(streamList([a, b]), null);
  assert.equal(streamList([a]), null);
  assert.equal(streamList([a, "bad\npath"]), null);
});
