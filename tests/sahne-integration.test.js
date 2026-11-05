'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { JSDOM } = require('jsdom');
const WorkspaceModel = require('../src/renderer/player-workspace-model');
const TranscriptModel = require('../src/renderer/player-transcript-model');

function fixture(t) {
  const dom = new JSDOM('<div id="playerLayer"><header class="player-head"><div class="player-head-actions"></div></header><div class="pw-stage"><div id="playerStage"><video id="playerVideo"></video></div></div><h1 id="playerTitle">Episode</h1><div id="playerMeta"></div><button id="startBtn">Whisper</button><button id="playerPickSub">Subtitle</button><button id="abLoopBtn"></button></div>', { url: 'https://fixture.invalid/' });
  const { window } = dom, { document } = window;
  const player = { workspaceMode: 'player', mediaKey: 'local:episode', generation: 1, abA: null, abB: null, subLang: 'en', sub2Lang: 'tr', cues: [], cues2: [] };
  const source = { id: 'primary:episode', revision: 's1', role: 'source', offsetSeconds: 2, cues: [{ id: 's', start: 0, end: 8, text: 'Source sentence' }] };
  const secondary = { id: 'secondary:episode', revision: 't1', role: 'translation', offsetSeconds: 1, cues: [{ id: 't1', start: 1, end: 4, text: 'Birinci' }, { id: 't2', start: 4, end: 9, text: 'İkinci' }] };
  const workspace = document.createElement('div'); workspace.id = 'playerWorkspaceV3'; document.getElementById('playerLayer').append(workspace);
  let time = 3, paused = true, rate = 1, podcastMode = false;
  const commands = [];
  const snapshot = () => ({ mediaKey: player.mediaKey, generation: player.generation, time, paused, rate, duration: 60, sourceTrack: { id: source.id, revision: source.revision }, secondaryTrack: { id: secondary.id, revision: secondary.revision }, capabilities: { seek: { support: 'yes' } } });
  const role = () => ({ trackId: source.id, trackRevision: source.revision, cues: source.cues, offsetSeconds: source.offsetSeconds });
  const bridge = WorkspaceModel.createPlayerWorkspaceBridge({ readSnapshot: snapshot, resolveSourceRole: role, executeExisting: async command => {
    commands.push(command);
    if (command.type === 'setAB') { player.abA = command.a; player.abB = command.b; }
    if (command.type === 'togglePlay') paused = !paused;
    if (command.type === 'setRate') rate = command.rate;
    if (command.type === 'seek') time = command.time;
    return { ok: true };
  } });
  // Deliberately retain the canonical command bridge: native mpv uses this same
  // owner through its HTMLVideoElement property proxy in the real application.
  window.PlayerWorkspaceIntegration = { bridge, snapshot, getTranscriptTracks: () => [source, secondary], executeExisting: c => bridge.dispatch(c),
    isPodcastMode: () => podcastMode,
    setPodcastMode(on) { podcastMode = on; const layer = document.getElementById('playerLayer'); layer.classList.toggle('cp-local-podcast', on); layer.classList.toggle('cp-local-study', !on); } };
  window.PlayerWorkspaceModel = WorkspaceModel;
  window.PlayerTranscriptModel = TranscriptModel;
  window.UiLocale = { get: () => 'en' };
  window.api = { copyText() {}, showAssistant() {} };
  class SahneShell {
    constructor(host, adapter, opts) { this.a = adapter; this.o = opts; this.s = { loop: false }; this.root = document.createElement('section'); host.append(this.root); }
    prefs() { return {}; }
    destroy() { this.a.cmd('loop', { on: false }); this.a.releaseSlot?.(); this.root.remove(); }
  }
  window.Sahne = SahneShell;
  const context = vm.createContext({ window, document, player, Sahne: SahneShell, console, sessionStorage: window.sessionStorage,
    Event: window.Event, queueMicrotask, MutationObserver: window.MutationObserver, ResizeObserver: class { observe() {} disconnect() {} },
    requestAnimationFrame: () => 0, setInterval: () => 0, clearInterval() {},
    browserSubtitleRoleCues: () => ({ source: player.cues, translation: player.cues2 }), renderAbMarkers() {},
  });
  vm.runInContext(fs.readFileSync(require.resolve('../src/renderer/cinema-sahne'), 'utf8'), context);
  t.after(() => { window.CinemaSahne?.close(); bridge.dispose(); dom.window.close(); });
  return { window, document, player, source, secondary, commands, open(mode = 'podcast') { window.CinemaSahne.open({ mode }); return window.CinemaSahne.current.a; } };
}

test('Sahne forwards local/native transport to the existing identity-bound bridge', async t => {
  const f = fixture(t), a = f.open();
  assert.equal((await a.cmd('toggle')).ok, true);
  assert.equal((await a.cmd('seek', 23)).ok, true);
  assert.equal((await a.cmd('rate', 1.5)).ok, true);
  assert.deepEqual(f.commands.map(c => c.type), ['togglePlay', 'seek', 'setRate']);
  assert(f.commands.every(c => c.mediaKey === 'local:episode' && c.generation === 1));
  assert.equal(a.state().time, 23);
});

test('Sahne preserves independent offsets and one-to-many translation pairing', async t => {
  const f = fixture(t), a = f.open(), row = a.state().rows[0];
  assert.equal(row.start, 2); assert.equal(row.end, 10);
  assert.deepEqual(Array.from(row.trs), ['Birinci', 'İkinci']);
  assert.equal((await a.cmd('seekCue', 0)).ok, true);
  assert.equal(f.commands.at(-1).cueId, 's');
  assert.equal(f.commands.at(-1).trackRevision, 's1');
});

test('RSS text-only transcript is readable and cannot fabricate a timed cue seek', async t => {
  const f = fixture(t);
  f.player.workspaceAudio = { mediaKey: f.player.mediaKey, generation: 1, transcriptState: 'untimed', transcriptText: 'RSS transcript without timing', translatedTranscriptText: 'Zamansız çeviri' };
  f.source.cues = []; f.source.timed = false; f.secondary.cues = [];
  const a = f.open(), state = a.state();
  assert(state.rows.some(r => r.src.includes('RSS transcript without timing')));
  assert(state.rows.every(r => !r.timed));
  assert.equal((await a.cmd('seekCue', 0)).ok, false);
  assert.equal(f.commands.length, 0);
});

test('retained commands and Tasks callbacks cannot act on another source generation', async t => {
  const f = fixture(t), a = f.open();
  let clicks = 0;
  // This is a plain jsdom fixture button; it has no file-dialog API attached.
  f.document.getElementById('playerPickSub').onclick = () => clicks++;
  const action = a.panel().sections.flatMap(s => s.items).find(i => i.label === 'Choose a subtitle file');
  assert(action);
  f.player.generation++;
  assert.equal((await a.cmd('seek', 10)).ok, false);
  action.run();
  assert.equal(clicks, 0);
  assert.equal(f.commands.length, 0);
});

test('closing during loop activation clears only its own current-source A/B loop', async t => {
  const f = fixture(t), a = f.open();
  a.state();
  const pending = a.cmd('loop', { on: true, row: 0 });
  f.window.CinemaSahne.close();
  await pending; await Promise.resolve();
  assert.equal(f.player.abA, null); assert.equal(f.player.abB, null);
  const next = f.open(); next.state();
  await next.cmd('loop', { on: true, row: 0 });
  f.player.generation++; f.player.abA = 20; f.player.abB = 30;
  f.window.CinemaSahne.close();
  assert.equal(f.player.abA, 20); assert.equal(f.player.abB, 30);
});
