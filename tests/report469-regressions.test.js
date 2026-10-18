'use strict';
const assert = require('node:assert/strict');
const { test } = require('node:test');
const Dub = require('../src/renderer/browser-dub-audio');
const flush = () => new Promise(resolve => setImmediate(resolve));

function fixture() {
  const audio = { currentTime: 0, duration: 500, readyState: 4, paused: true,
    addEventListener() {}, load() {}, removeAttribute() {},
    pause() { this.paused = true; }, play() { this.paused = false; return Promise.resolve(); } };
  const c = { mode: 'browser', tabId: 'fixture', mediaKey: 'video', generation: 1, playbackRate: 1 };
  const errors = [], requests = [];
  let release;
  const dub = new Dub({ audio, context: () => c, mute: async () => ({ ok: true }), error: value => errors.push(value),
    setRate: request => {
      requests.push(request);
      if (request.release) return Promise.resolve({ ok: true });
      return new Promise(resolve => { release = () => resolve({ ok: true, media: { currentTime: .5, playbackRate: request.rate } }); });
    }, urls: { createObjectURL: () => 'blob:fixture', revokeObjectURL() {} } });
  return { dub, audio, c, errors, requests, release: () => release?.() };
}

test('adaptive dub survives a high temporary rate while video slowdown is pending', async () => {
  const f = fixture();
  try {
    await f.dub.attach({ name: 'short.wav', sync: { version: 1, videoDuration: 1, audioDuration: 20,
      segments: [{ v0: 0, v1: 1, a0: 0, a1: 20 }] } }, f.c);
    f.dub.update({ currentTime: .5, paused: false, playbackRate: 1 });
    await flush();
    assert.ok(f.dub.session, 'a feasible slowdown must not discard the dubbing session');
    assert.deepEqual(f.errors, []);
    assert.equal(f.audio.paused, true, 'wait for the new video speed before playing speech');
    assert.equal(f.requests[0].rate, .0625);
    f.release(); await flush(); await flush();
    assert.ok(f.dub.session);
    assert.equal(f.audio.playbackRate, 1.25);
    assert.equal(f.audio.paused, false);
  } finally { f.release(); await f.dub.remove(); }
});

test('adaptive dub still rejects speech beyond the minimum video speed limit', async () => {
  const f = fixture();
  try {
    await f.dub.attach({ name: 'impossible.wav', sync: { version: 1, videoDuration: 1, audioDuration: 300,
      segments: [{ v0: 0, v1: 1, a0: 0, a1: 300 }] } }, f.c);
    f.dub.update({ currentTime: .5, paused: false, playbackRate: 1 });
    f.release(); await flush(); await flush();
    assert.equal(f.dub.session, null);
    assert.ok(f.errors.some(value => value.includes('çok kısa')));
  } finally { f.release(); await f.dub.remove(); }
});

test('player at 4x keeps a feasible fivefold stretch until slowdown completes', async () => {
  const f = fixture();
  f.c.mode = 'player'; f.c.playbackRate = 4;
  try {
    await f.dub.attach({ name: 'player.wav', sync: { version: 1, videoDuration: 1, audioDuration: 5,
      segments: [{ v0: 0, v1: 1, a0: 0, a1: 5 }] } }, f.c);
    f.dub.update({ currentTime: .5, paused: false, playbackRate: 4 });
    await flush();
    assert.ok(f.dub.session);
    assert.deepEqual(f.errors, []);
    assert.equal(f.audio.paused, true);
    assert.equal(f.requests[0].rate, .8);
    f.release(); await flush(); await flush();
    assert.equal(f.audio.playbackRate, 4);
    assert.equal(f.audio.paused, false);
  } finally { f.release(); await f.dub.remove(); }
});
