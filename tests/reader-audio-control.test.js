"use strict";
const test = require("node:test"),
  assert = require("node:assert/strict"),
  { create } = require("../src/reader-audio-control");
class Audio extends EventTarget {
  constructor() {
    super();
    this.readyState = 0;
    this.duration = NaN;
    this.currentTime = 0;
    this.played = [];
    this.listeners = new Map();
  }
  addEventListener(name, fn) {
    super.addEventListener(name, fn);
    if (!this.listeners.has(name)) this.listeners.set(name, new Set());
    this.listeners.get(name).add(fn);
  }
  removeEventListener(name, fn) {
    super.removeEventListener(name, fn);
    this.listeners.get(name)?.delete(fn);
  }
  pause() {}
  async play() {
    this.played.push(this.currentTime);
  }
  metadata() {
    this.readyState = 1;
    this.duration = 20;
    this.dispatchEvent(new Event("loadedmetadata"));
  }
  count() {
    return [...this.listeners.values()].reduce((n, s) => n + s.size, 0);
  }
}

test('A disposed reader play promise never pauses a newer session on the same audio element',async()=>{
 const audio=new Audio();audio.metadata();let resolve,pauses=0;audio.pause=()=>pauses++;audio.play=()=>new Promise(done=>resolve=done);
 const old=create(audio),pending=old.playFrom(2);await Promise.resolve();old.dispose();
 const next=create(audio);audio.play=async()=>{};await next.playFrom(5);const before=pauses;resolve();assert.equal(await pending,false);assert.equal(pauses,before);assert.equal(audio.currentTime,5);next.dispose();
});
test("explicit seek before metadata wins over saved reading position and rapid clicks play only the latest passage", async () => {
  const audio = new Audio(),
    control = create(audio, { position: 8 });
  const first = control.playFrom(1),
    second = control.playFrom(4);
  assert.equal(audio.played.length, 0);
  audio.metadata();
  assert.equal(await first, false);
  assert.equal(await second, true);
  assert.deepEqual(audio.played, [4]);
  assert.equal(audio.currentTime, 4);
  control.dispose();
  assert.equal(audio.count(), 0);
});
test("resume still works without an explicit seek, and unavailable/out-of-range audio is reported without playback", async () => {
  const audio = new Audio(),
    errors = [],
    control = create(audio, {
      position: 8,
      onError: (e) => errors.push(e.message),
    });
  audio.metadata();
  assert.equal(audio.currentTime, 8);
  assert.equal(await control.playFrom(25), false);
  assert.equal(await control.playFrom(NaN), false);
  assert.equal(audio.played.length, 0);
  assert.equal(errors.length, 2);
  control.dispose();
  const pendingAudio = new Audio(),
    pendingControl = create(pendingAudio, {
      onError: (e) => errors.push(e.message),
    });
  const pending = pendingControl.playFrom(1);
  pendingAudio.dispatchEvent(new Event("error"));
  assert.equal(await pending, false);
  pendingControl.dispose();
  assert.equal(pendingAudio.count(), 0);
});
test("closing a reader cancels pending metadata promptly, and timeout releases waiters without late playback", async () => {
  const audio = new Audio(),
    errors = [],
    control = create(audio, { onError: (e) => errors.push(e.message) });
  const pending = control.playFrom(2);
  control.dispose();
  assert.equal(await pending, false);
  assert.equal(audio.count(), 0);
  audio.metadata();
  assert.deepEqual(audio.played, []);
  assert.deepEqual(errors, []);
  const timed = new Audio(),
    timeout = create(timed, {
      timeoutMs: 5,
      onError: (e) => errors.push(e.message),
    });
  assert.equal(await timeout.playFrom(1), false);
  assert.equal(errors.length, 1);
  assert.equal(
    timed.count(),
    1,
    "only the owned resume listener remains until disposal",
  );
  timeout.dispose();
  assert.equal(timed.count(), 0);
});

test("user pause during pending play is quiet, while genuine playback refusal is reported", async () => {
  const audio = new Audio(),
    errors = [];
  audio.metadata();
  let reject;
  audio.play = () =>
    new Promise((_resolve, fail) => {
      reject = fail;
    });
  const control = create(audio, {
    onError: (error) => errors.push(error.name),
  });
  const pending = control.playFrom(1);
  await Promise.resolve();
  audio.paused = true;
  reject(
    Object.assign(Error("play interrupted by pause"), { name: "AbortError" }),
  );
  assert.equal(await pending, false);
  assert.deepEqual(errors, []);
  const refused = control.playFrom(2);
  await Promise.resolve();
  reject(Object.assign(Error("playback denied"), { name: "NotAllowedError" }));
  await refused;
  assert.deepEqual(errors, ["NotAllowedError"]);
  control.dispose();
});

test("reader close saves the actual position before unloading, never the reset zero", async () => {
  const fs = require("node:fs"),
    vm = require("node:vm");
  const source = fs.readFileSync(
    require.resolve("../src/renderer/media-workflows-ui.js"),
    "utf8",
  );
  const saved = [],
    listeners = new Map();
  const audio = {
    currentTime: 7,
    readyState: 1,
    duration: 20,
    pause() {
      this.onpause?.();
    },
    removeAttribute() {},
    load() {
      this.currentTime = 0;
      this.readyState = 0;
      listeners.get("timeupdate")?.();
    },
    addEventListener: (n, f) => listeners.set(n, f),
    removeEventListener: (n) => listeners.delete(n),
  };
  const ctx = {
    audio,
    projectId: "book",
    result: { outputId: "audio.wav", textHash: "source" },
    current: 0,
    lastSaved: 0,
    playback: { dispose() {} },
    status() {},
    call: async (_name, value) => saved.push(value.position),
    readerRequest: 0,
    readerGeneration: 0,
    readerAudioCleanup: null,
    readerPdfMap: null,
    readerResize: null,
    readerRender: null,
    readerTask: null,
    dialog: { querySelector: () => audio },
  };
  vm.createContext(ctx);
  vm.runInContext(
    source.slice(
      source.indexOf("    const persist = () =>"),
      source.indexOf("    audio.onended = async"),
    ),
    ctx,
  );
  vm.runInContext(
    source.slice(
      source.indexOf("  async function closeReader()"),
      source.indexOf("  let stopRequested"),
    ),
    ctx,
  );
  await ctx.closeReader();
  assert.deepEqual(saved, [7]);
  assert.equal(listeners.size, 0);
});
