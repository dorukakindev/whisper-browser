const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '../src/main.js'), 'utf8');
const start = source.indexOf('function browserTrackProbeScript()');
const end = source.indexOf('function browserCaptureHookScript()', start);
assert(start >= 0 && end > start);
const factory = {};
vm.createContext(factory);
vm.runInContext(source.slice(start, end), factory);

const cue = { startTime: 1, endTime: 2, text: 'örnek' };
const makeTrack = (kind) => ({ kind, mode: 'showing', language: 'en', label: kind || 'etiketsiz', cues: [cue] });
const textTracks = ['subtitles', 'captions', '', 'metadata', 'chapters', 'descriptions'].map(makeTrack);
const video = { textTracks, querySelectorAll: () => [] };
const page = {
  window: { __whisperMediaController: { select: () => video } },
  document: { querySelectorAll: () => [] },
  WeakMap, Math, Number, String, Array, Promise, setTimeout,
};
page.window.window = page.window;
page.window.document = page.document;

(async () => {
  const script = factory.browserTrackProbeScript();
  const tracks = await vm.runInNewContext(script, page);
  assert.deepEqual(Array.from(tracks, (track) => track.kind), ['subtitles', 'captions', '']);
  assert(textTracks.slice(3).every((track) => track.mode === 'showing'),
    'desteklenmeyen izlerin görünürlük durumu değiştirilmemeli');
  console.log('browser-track-kind: 1 test');
})().catch((error) => { console.error(error); process.exitCode = 1; });
