const assert = require('node:assert/strict');
const Dub = require('../src/renderer/browser-dub-audio');
const flush = () => new Promise(resolve => setImmediate(resolve));
// Exercise the actual main IPC handler: explicit mute is idempotent and
// existing callers retain toggle behavior; untrusted senders cannot mute.
const vm = require('node:vm'), fs = require('node:fs'), path = require('node:path');
const main = fs.readFileSync(path.join(__dirname, '../src/main.js'), 'utf8');
let handler, actualMute = false, authorized = true;
const tab = { view: { webContents: { isDestroyed: () => false,
  isAudioMuted: () => actualMute, setAudioMuted: v => { actualMute = v; }, isCurrentlyAudible: () => false } } };
vm.runInNewContext(main.slice(main.indexOf("ipcMain.handle('browser:tab:mute'"),
  main.indexOf("ipcMain.handle('browser:places:folder'")), {
  ipcMain: { handle: (_name, fn) => { handler = fn; } },
  authorizedBrowserSender: () => authorized, browserTabById: () => tab, sendBrowserEvent() {},
});
assert.equal(handler({}, 'a', true).ok, true); assert.equal(actualMute, true);
handler({}, 'a', true); assert.equal(actualMute, true);
handler({}, 'a'); assert.equal(actualMute, false);
authorized = false; assert.equal(handler({}, 'a', true).ok, false); assert.equal(actualMute, false);
function fixture({ priorMuted = false, mute, setRate, backgroundAudio } = {}) {
  const calls = [], errors = [], revoked = [];
  const c = { mode: 'browser', tabId: 'a', mediaKey: 'video', generation: 1, priorMuted };
  const audio = { currentTime: 0, duration: 100, readyState: 4, paused: true,
    addEventListener() {}, pause() { this.paused = true; },
    play() { this.paused = false; return Promise.resolve(); },
    load() {}, removeAttribute() {} };
  let clock = 10000;
  const dub = new Dub({ audio, context: () => c, now: () => clock,
    setRate,
    backgroundAudio,
    urls: { createObjectURL: () => 'blob:test', revokeObjectURL: u => revoked.push(u) },
    mute: mute || (async (...args) => { calls.push(args); return { ok: true }; }),
    error: e => errors.push(e) });
  return { dub, audio, calls, errors, revoked, c, advance: n => { clock += n; } };
}
(async () => {
  const f = fixture();
  try {
    assert.equal(await f.dub.attach({ name: 'test.wav' }, f.c), true);
    assert.deepEqual(f.calls, [['a', true]]);
    f.dub.update({ currentTime: 10, paused: false, playbackRate: 1 }); await flush();
    assert.equal(f.audio.currentTime, 10); assert.equal(f.audio.paused, false);
    f.dub.update({ currentTime: 42, paused: true });
    assert.equal(f.audio.currentTime, 42); assert.equal(f.audio.paused, true);
    f.dub.update({ currentTime: 20, paused: false, playbackRate: 2 }); await flush();
    assert.equal(f.audio.playbackRate, 2);
    f.advance(300); f.dub.tick(); assert.ok(Math.abs(f.audio.currentTime - 20.6) < .01);
    f.dub.offset = 3; f.dub.update({ currentTime: 30, paused: true });
    assert.equal(f.audio.currentTime, 27);
    f.dub.update({ currentTime: 10, paused: false, adPlaying: true });
    assert.equal(f.audio.paused, true);
    f.dub.update({ currentTime: 10, paused: false, readyState: 1 });
    assert.equal(f.audio.paused, true);
    f.dub.update({ currentTime: 100, paused: false }); assert.equal(f.audio.paused, false);
    await flush();
    f.advance(2300); f.dub.tick(); assert.equal(f.audio.paused, true);
    f.c.mediaKey = 'other'; f.dub.tick(); await flush();
    assert.equal(f.dub.session, null); assert.equal(f.audio.paused, true);
    assert.deepEqual(f.calls, [['a', true], ['a', false]]);
    assert.deepEqual(f.revoked, ['blob:test']);
  } finally { await f.dub.remove(); }
  const muted = fixture({ priorMuted: true });
  const rates = [];
  const adaptive = fixture({setRate:async r=>{rates.push(r);return {ok:true};}});
  await adaptive.dub.attach({name:'full.wav',sync:{version:1,videoDuration:10,audioDuration:12,
    segments:[{v0:0,v1:4,a0:0,a1:6}]}},adaptive.c);
  adaptive.dub.update({currentTime:2,paused:false,playbackRate:2/3}); await flush();
  assert.equal(adaptive.audio.currentTime,3);
  assert.ok(Math.abs(adaptive.audio.playbackRate-1)<.001);
  assert.ok(Math.abs(rates.at(-1).rate-2/3)<.001);
  adaptive.advance(800); adaptive.dub.update({currentTime:7,paused:false,playbackRate:1}); await flush();
  assert.equal(adaptive.audio.currentTime,9); assert.equal(rates.at(-1).rate,1);
  await adaptive.dub.remove(); assert.equal(rates.at(-1).release,true);
  const bg={...adaptive.audio,currentTime:0,duration:10,paused:true};
  const music=fixture({backgroundAudio:bg,setRate:async()=>({ok:true})});
  await music.dub.attach({name:'mix.wav',range:{start:20,end:30},background:{url:'file:///background.wav'},
    sync:{version:1,videoDuration:10,audioDuration:12,segments:[{v0:0,v1:4,a0:0,a1:6}]}},music.c);
  music.dub.update({currentTime:22,paused:false,playbackRate:2/3});await flush();await flush();
  assert.equal(music.audio.currentTime,3);assert.equal(bg.currentTime,2);
  assert.equal(bg.playbackRate,2/3);assert.equal(bg.paused,false);
  music.dub.update({currentTime:22,paused:true,playbackRate:2/3});await flush();
  assert.equal(bg.paused,true);assert.equal(music.audio.paused,true);
  music.dub.update({currentTime:31,paused:false,playbackRate:1});await flush();
  assert.equal(bg.paused,true);assert.deepEqual(music.calls.at(-1),['a',false]);
  await music.dub.remove();
  const ranged = fixture();
  await ranged.dub.attach({name:'range.wav',range:{start:20,end:30}}, ranged.c);
  ranged.audio.duration = 10;
  ranged.dub.update({currentTime:15,paused:false}); await flush();
  assert.equal(ranged.audio.paused,true); assert.deepEqual(ranged.calls.at(-1),['a',false]);
  ranged.dub.update({currentTime:22,paused:false}); await flush(); await flush();
  assert.equal(ranged.audio.currentTime,2); assert.equal(ranged.audio.paused,false);
  assert.deepEqual(ranged.calls.at(-1),['a',true]);
  ranged.dub.update({currentTime:31,paused:false}); await flush();
  assert.equal(ranged.audio.paused,true); assert.deepEqual(ranged.calls.at(-1),['a',false]);
  ranged.dub.update({currentTime:25,paused:false}); await flush(); await flush();
  assert.equal(ranged.audio.currentTime,5); assert.equal(ranged.audio.paused,false);
  ranged.dub.update({currentTime:25,paused:false,adPlaying:true}); await flush();
  assert.equal(ranged.audio.paused,true); assert.deepEqual(ranged.calls.at(-1),['a',false]);
  await ranged.dub.remove();
  await muted.dub.attach({ name: 'test.mp3' }, muted.c); await muted.dub.remove();
  assert.deepEqual(muted.calls, [['a', true], ['a', true]], 'pre-existing mute was not restored');
  const replaced = fixture();
  await replaced.dub.attach({ name: 'first.wav' }, replaced.c);
  replaced.c.priorMuted = true; // current tab is muted by the first dub
  await replaced.dub.attach({ name: 'second.wav' }, replaced.c);
  await replaced.dub.remove();
  assert.deepEqual(replaced.calls.at(-1), ['a', false], 'replacement forgot original tab mute');
  const failed = fixture({ mute: async () => ({ ok: false }) });
  assert.equal(await failed.dub.attach({ name: 'test.wav' }, failed.c), false);
  assert.equal(failed.dub.session, null); assert.equal(failed.errors.length, 1);
  let resolveMute;
  const late = fixture({ mute: (_id, muted) => muted
    ? new Promise(resolve => { resolveMute = resolve; }) : Promise.resolve({ ok: true }) });
  const attach = late.dub.attach({ name: 'late.wav' }, late.c); await flush();
  const remove = late.dub.remove(); resolveMute({ ok: true });
  await Promise.all([attach, remove]);
  assert.equal(late.audio.paused, true); assert.equal(late.dub.session, null);
  const blocked = fixture();
  blocked.audio.play = () => Promise.reject(new Error('autoplay rejected'));
  await blocked.dub.attach({ name: 'blocked.wav' }, blocked.c);
  blocked.dub.update({ currentTime: 5, paused: false }); await flush(); await flush();
  assert.equal(blocked.dub.session, null); assert.deepEqual(blocked.calls.at(-1), ['a', false]);
  // Both channels must allow the new session to play while old promises
  // are pending, and old finally callbacks must leave its pending state alone.
  for (const channel of ['voice', 'background']) {
    const background = { currentTime:0, duration:100, readyState:4, paused:true,
      addEventListener() {}, pause() { this.paused=true; }, load() {}, removeAttribute() {},
      play() { this.paused=false; return Promise.resolve(); } };
    const f = fixture({ backgroundAudio: background });
    const audio = channel === 'voice' ? f.audio : background;
    const pending = [];
    audio.play = () => { audio.paused=false; return new Promise((resolve,reject)=>pending.push({resolve,reject})); };
    const file = name => ({name, ...(channel==='background' ? {background:{url:'file:///fixture.wav'}} : {})});
    try {
      await f.dub.attach(file('old.wav'),f.c);
      f.dub.update({currentTime:4,paused:false});
      assert.equal(pending.length,1);
      await f.dub.attach(file('new.wav'),f.c);
      audio.paused=true;
      f.dub.update({currentTime:4,paused:false});
      assert.equal(pending.length,2,channel+': old pending play blocked the new session');
      pending[0].resolve(); await flush();
      assert.equal(audio.paused,false,channel+': old resolution paused the new session');
      const flag=channel==='voice'?'playPending':'backgroundPlayPending';
      assert.equal(f.dub.session[flag],true,channel+': old finally cleared new pending state');
      pending[1].resolve(); await flush();
      assert.equal(f.dub.session[flag],false);
    } finally { await f.dub.remove(); }
  }
  console.log('browser-dub-audio: sync, pause, seek, rate, offset, ads, stale clock, cleanup and failures passed');
})().catch(e => { console.error(e); process.exitCode = 1; });
