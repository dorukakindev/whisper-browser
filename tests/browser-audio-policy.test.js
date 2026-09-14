const assert = require('assert');
const vm = require('vm');
const { audioLevelDb, nextSilenceState } = require('../src/browser-audio-policy');
const { buildBrowserMediaPreferenceScript, normalizeBrowserMediaPreference } = require('../src/browser-media-controller');

assert.equal(audioLevelDb(Uint8Array.from([128, 128])), -Infinity);
assert(audioLevelDb(Uint8Array.from([192, 64])) > -10);
let silence = { quietMs: 0, active: false };
for (let count = 0; count < 4; count++) silence = nextSilenceState(silence, -55, 100, -45);
assert.equal(silence.active, false);
silence = nextSilenceState(silence, -55, 100, -45);
assert.equal(silence.active, true);
assert.equal(nextSilenceState(silence, -Infinity, 100, -45).active, true);
assert.equal(nextSilenceState(silence, -20, 100, -45).active, false);
assert.deepEqual(normalizeBrowserMediaPreference({ silenceSpeedEnabled: true,
  silenceSpeedRate: 99, silenceThresholdDb: -99, audioProfile: 'invalid' }), {
  rate: 1, enforceRate: false, preservesPitch: true, brightness: 1, contrast: 1,
  normalizeAudio: false, silenceSpeedEnabled: true, silenceSpeedRate: 8,
  silenceThresholdDb: -70, audioProfile: 'off',
});

const listeners = {};
const video = { isConnected: true, tagName: 'VIDEO', paused: false, ended: false,
  muted: false, volume: 1, playbackRate: 1.25, currentTime: 0, duration: 60,
  clientWidth: 640, clientHeight: 360, style: {},
  addEventListener(type, fn) { listeners[type] = fn; } };
let tick;
let analyser;
const node = () => ({ connect() {}, disconnect() {} });
class AudioContext {
  constructor() { this.destination = node(); this.state = 'running'; }
  createMediaElementSource() { return node(); }
  createDynamicsCompressor() {
    const compressor = node();
    for (const key of ['threshold', 'knee', 'ratio', 'attack', 'release']) compressor[key] = { value: 0 };
    return compressor;
  }
  createAnalyser() {
    analyser = node();
    analyser.fftSize = 0;
    analyser.getByteTimeDomainData = samples => samples.fill(128);
    return analyser;
  }
  resume() { return Promise.resolve(); }
}
const document = { nodeType: 9, children: [], querySelectorAll: () => [video], querySelector: () => null };
class MutationObserver { observe() {} }
const context = { window: {}, document, MutationObserver, AudioContext, Uint8Array,
  setInterval(fn) { tick = fn; return 1; }, clearInterval() { tick = undefined; } };
const configure = raw => vm.runInNewContext(buildBrowserMediaPreferenceScript(raw), context);

configure({ silenceSpeedEnabled: true, silenceSpeedRate: 3 });
assert.equal(typeof tick, 'function');
for (let count = 0; count < 5; count++) tick();
assert.equal(video.playbackRate, 3);
analyser.getByteTimeDomainData = samples => samples.fill(192);
tick();
assert.equal(video.playbackRate, 1.25);
analyser.getByteTimeDomainData = samples => samples.fill(128);
for (let count = 0; count < 5; count++) tick();
assert.equal(video.playbackRate, 3);
configure({ silenceSpeedEnabled: false, audioProfile: 'night' });
assert.equal(video.playbackRate, 1.25);
assert.equal(tick, undefined);
console.log('browser-audio-policy: ok');
