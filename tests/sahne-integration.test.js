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
    constructor(host, adapter, opts) { this.a = adapter; this.o = opts; this.s = { loop: false }; this.root = document.createElement('section');
      for (const mode of ['cinema', 'podcast', 'study']) { const tab = document.createElement('button'); tab.setAttribute('role', 'tab'); tab.dataset.mode = mode; tab.setAttribute('aria-selected', String(opts.mode === mode)); this.root.append(tab); }
      host.append(this.root); }
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
  return { window, document, player, source, secondary, commands, context, setParser(parser) { context.parseSubtitles=parser; }, open(mode = 'podcast') { window.CinemaSahne.open({ mode }); return window.CinemaSahne.current.a; } };
}

test('browser transcript projection resolves timing per channel and refreshes edited transforms', t => {
  const f = fixture(t), sync = require('../src/browser-subtitle-sync');
  f.player.workspaceMode = 'browser'; f.player.browserActiveTabId = 'tab-one'; f.player.browserTracks = [];
  f.player.browserDuration = 1000; f.player.browserMediaSeen = true;
  f.player.cues = Array.from({ length: 80 }, (_, i) => ({ id: String(i), start: i * 4, end: i * 4 + 2, text: 'Source ' + i, wordRanges: [{start:0,end:6,timeStart:i*4,timeEnd:i*4+1}] }));
  f.player.cues2 = f.player.cues.map(c => ({ ...c, text: 'Translation ' + c.id }));
  const layer = f.document.getElementById('playerLayer'); layer.classList.add('workspace-browser');
  f.window.BrowserStudy = { open() { layer.classList.add('browser-study-mode'); } };
  f.window.BrowserPodcastUI = { setMode() {} };
  let reads = 0, offset = 5;
  f.context.browserTransformForChannel = secondary => { reads++; return { scale: secondary ? .5 : 2, offsetSeconds: secondary ? 7 : offset }; };
  f.context.subtitleVideoTransform = secondary => { try { return f.context.browserTransformForChannel(secondary); } catch (_) { return { scale: 1, offsetSeconds: 0 }; } };
  f.context.subtitleVideoTime = (time, secondary, frozen) => sync.sourceToVideoTime(time, frozen || f.context.browserTransformForChannel(secondary));
  const a = f.open('study'); reads = 0;
  const first = a.state();
  assert(reads <= 4, 'source identity work must scale with channels, not cue endpoints or words: ' + reads);
  assert.equal(first.rows[0].start, 5); assert.equal(first.rows[0].words[0].t0, 5);
  offset = 9; reads = 0;
  const next = a.state();
  assert.equal(next.rows[0].start, 9); assert.equal(next.rows[0].words[0].t0, 9);
  assert.notEqual(next.rev, first.rev); assert(reads <= 4);
  f.player.cues[0].id = 'replacement';
  assert.notEqual(a.state().rev, next.rev);
  assert.equal(f.player.cues[0].start, 0); assert.equal(f.player.cues2[0].start, 0);
  f.context.browserTransformForChannel = () => { reads++; throw new Error('unavailable timing lookup'); }; reads = 0;
  const fallback = a.state(); assert.equal(fallback.rows[0].start, 0); assert.equal(fallback.rows[0].words[0].t0, 0); assert(reads <= 4);
});

test('changing scene mode retains keyboard focus on its replacement tab without stealing external focus', t => {
  const f = fixture(t); f.open('podcast');
  const original = f.window.CinemaSahne.current, button = original.root.querySelector('[data-mode="study"]');
  const owner = { mediaKey: f.player.mediaKey, generation: f.player.generation };
  button.focus(); original.o.onMode('study', {});
  const scene = f.window.CinemaSahne.current, selected = scene.root.querySelector('[role="tab"][aria-selected="true"]');
  assert.equal(selected.dataset.mode, 'study'); assert.equal(f.document.activeElement, selected);
  assert.equal(button.isConnected, false); assert.deepEqual({ mediaKey: f.player.mediaKey, generation: f.player.generation }, owner);
  const input = f.document.createElement('input'); f.document.body.append(input); input.focus();
  scene.o.onMode('podcast', {}); assert.equal(f.document.activeElement, input);
  assert.equal(f.commands.length, 0);
});

test('YouTube study entry and Podcast tab keep the browser owner, tracks and command target', async t => {
  const f = fixture(t);
  const layer = f.document.getElementById('playerLayer');
  layer.classList.add('workspace-browser');
  layer.insertAdjacentHTML('beforeend', '<button id="browserStudyOpen"></button><div id="playerSide"><div class="bp-subtitles"></div></div><div id="browserViewSlot"></div>');
  const slot = f.document.getElementById('browserViewSlot');
  const url = 'https://www.youtube.com/watch?v=abcdefghijk';
  Object.assign(f.player, {
    workspaceMode: 'browser', browserActiveTabId: 'youtube-A', mediaKey: 'browser:youtube-A',
    browserPageUrl: url, browserPageTitle: 'Episode 329 - YouTube', browserMediaSeen: true, browserDuration: 90, browserTime: 12,
    browserPaused: true, browserRate: 1.25, viewMode: 'theater',
    browserLoadedTrackId: 'en', browserLoadedTrackId2: 'tr',
    browserTracks: [{ id: 'en', language: 'en' }, { id: 'tr', language: 'tr' }],
    cues: [{ id: 'line', start: 10, end: 16, text: 'Original line' }],
    cues2: [{ id: 'translation', start: 9, end: 13, text: 'Çeviri satırı' }]
  });
  const calls = [];
  let settleReplaySeek;
  let delaySeek = false;
  Object.assign(f.context, {
    browserTabState: () => ({ mediaId: f.player.mediaKey, mediaPublisher: 'Real channel' }),
    currentBrowserYoutubeUrl: () => url,
    closeBrowserToolbarMenus() {}, setBrowserSideRailPref() {}, setPlayerSidebarCollapsed() {}, setSideTab() {}, setSubtitleMode() {},
    setViewMode: mode => { f.player.viewMode = mode; },
    subtitleVideoTransform: secondary => ({ offsetSeconds: secondary ? 4 : 1 }),
    subtitleVideoTime: (time, _secondary, transform) => time + transform.offsetSeconds,
    browserSubtitleSync: require('../src/browser-subtitle-sync'),
    browserCommand: async (type, value, tab) => {
      calls.push({ type, value, tab });
      if (type === 'seek' && delaySeek) return new Promise(resolve => { settleReplaySeek = resolve; });
      return { ok: true };
    }
  });
  f.window.PlayerUiKit = { select() {
    const wrapper = f.document.createElement('span');
    wrapper.trigger = f.document.createElement('button');
    wrapper.append(wrapper.trigger);
    return wrapper;
  } };
  for (const name of ['browser-study', 'browser-podcast']) {
    vm.runInContext(fs.readFileSync(require.resolve('../src/renderer/' + name), 'utf8'), f.context);
  }
  const entry = f.document.getElementById('browserStudyOpen');
  entry.click();
  await Promise.resolve();
  const stage = f.window.CinemaSahne;
  assert.equal(stage.current.o.mode, 'study');
  assert.equal(stage.current.a.info().title, 'Episode 329');
  assert.equal(stage.current.a.info().sub, 'Real channel');
  assert.equal(stage.current.a.info().webVideo, true);
  assert.equal(stage.current.a.state().rows[0].start, 11);
  assert.deepEqual(Array.from(stage.current.a.state().rows[0].trs), ['Çeviri satırı']);
  stage.current.o.onMode('podcast', {});
  assert.equal(stage.current.o.mode, 'podcast');
  assert.equal(stage.current.a.info().audio, true);
  assert.equal(stage.current.a.info().webVideo, false);
  assert.equal(f.window.BrowserPodcastUI.snapshot().capabilities.ASR.reason, 'existing-youtube-queue');
  assert.equal(f.window.BrowserPodcastUI.getTranscriptTracks()[1].cues[0].start, 13);
  assert.equal(stage.current.a.state().time, 12);
  assert.equal(stage.current.a.state().rate, 1.25);
  assert.deepEqual(calls, [], 'opening and changing view do not restart or control playback');
  const podcast = stage.current.a;
  assert.equal((await podcast.cmd('seekCue', 0)).ok, true);
  assert.equal((await podcast.cmd('rate', 1.5)).ok, true);
  assert.equal((await podcast.cmd('volume', 0.4)).ok, true);
  assert.deepEqual(calls, [
    { type: 'seek', value: 11.01, tab: 'youtube-A' },
    { type: 'speed', value: 1.5, tab: 'youtube-A' },
    { type: 'volume-set', value: 0.4, tab: 'youtube-A' }
  ]);
  stage.current.o.onMode('study', {});
  assert.equal(stage.current.o.mode, 'study');
  assert.equal(f.document.getElementById('browserViewSlot'), slot);
  const stale = stage.current.a;
  stale.state();
  delaySeek = true;
  f.player.browserPaused = false;
  const pausedDuringReplay = stale.cmd('replay');
  assert.equal(typeof settleReplaySeek, 'function');
  f.player.browserPaused = true;
  settleReplaySeek({ ok: true });
  assert.equal((await pausedDuringReplay).ok, true);
  assert.deepEqual(calls.slice(3), [{ type: 'seek', value: 11.01, tab: 'youtube-A' }]);
  settleReplaySeek = null;
  const pendingReplay = stale.cmd('replay');
  assert.equal(typeof settleReplaySeek, 'function');
  Object.assign(f.player, { browserActiveTabId: 'youtube-B', mediaKey: 'browser:youtube-B', generation: 2 });
  settleReplaySeek({ ok: true });
  assert.equal((await pendingReplay).ok, false);
  assert.equal((await stale.cmd('toggle')).ok, false);
  f.window.dispatchEvent(new f.window.Event('browser-panel-layout'));
  await Promise.resolve();
  assert.equal(stage.current, null);
  assert.deepEqual(calls.slice(4), [{ type: 'seek', value: 11.01, tab: 'youtube-A' }]);
  Object.assign(f.player, { browserActiveTabId: 'youtube-A', mediaKey: 'browser:youtube-A', generation: 1 });
  f.window.dispatchEvent(new f.window.Event('browser-panel-layout'));
  await Promise.resolve();
  assert.equal(stage.current.o.mode, 'study');
  stage.current.o.onClose();
  assert.equal(f.player.viewMode, 'theater');
  assert.equal(f.document.activeElement, entry);
  f.window.dispatchEvent(new f.window.Event('browser-panel-layout'));
  await Promise.resolve();
  assert.equal(stage.current, null, 'delayed browser layout must not reopen the closed Stage');
  entry.click();
  await Promise.resolve();
  assert(stage.current);
  stage.close();
  stage.evaluate();
  assert.equal(stage.current, null, 'programmatic close must clear the browser session too');
});

test('Translation-only tracks remain translation rows and seek by their own clock', async t => {
  const f = fixture(t);
  f.source.cues = [];
  const a = f.open('study');
  const row = a.state().rows[0];
  assert.equal(row.src, '');
  assert.deepEqual(Array.from(row.trs), ['Birinci']);
  assert.equal(row.start, 2);
  assert.equal((await a.cmd('seekCue', 0)).ok, true);
  assert.equal(f.commands.at(-1).time, 2);
});

test('Sahne forwards local/native transport to the existing identity-bound bridge', async t => {
  const f = fixture(t), a = f.open();
  assert.equal((await a.cmd('toggle')).ok, true);
  assert.equal((await a.cmd('seek', 23)).ok, true);
  assert.equal((await a.cmd('rate', 1.5)).ok, true);
  assert.deepEqual(f.commands.map(c => c.type), ['togglePlay', 'seek', 'setRate']);
  assert(f.commands.every(c => c.mediaKey === 'local:episode' && c.generation === 1));
  assert.equal(a.state().time, 23);
});

test('Both Stage views open the existing dubbing dialog and a stale adapter cannot reopen it', async t => {
  const f = fixture(t);
  let opened = 0;
  f.window.DubGeneratorUI = { prepareCurrent: async () => { opened++; } };
  const podcast = f.open('podcast');
  assert.equal(podcast.caps.dub, true);
  assert.equal((await podcast.cmd('dub')).ok, true);
  const study = f.open('study');
  assert.equal((await study.cmd('dub')).ok, true);
  f.player.generation++;
  assert.equal((await study.cmd('dub')).code, 'stale-source');
  assert.equal(opened, 2);
  assert.deepEqual(f.commands, []);
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

test('Sahne does not carry a failed job or its retry into the replacement source', t => {
  const f = fixture(t);
  f.document.getElementById('playerLayer').insertAdjacentHTML('beforeend',
    '<button id="makeSubsBtn"></button><button id="playerJobCancel"></button><div id="playerJobBar"></div>');
  let starts = 0, stops = 0;
  f.document.getElementById('makeSubsBtn').onclick = () => {
    starts++;
    f.player.job = { mediaKey: f.player.mediaKey, generation: f.player.generation, failed: true };
  };
  f.document.getElementById('playerJobCancel').onclick = () => { stops++; };
  const first = f.open();
  first.actions().find(action => action.id === 'whisper').run();
  const failed = first.panel().job;
  assert.equal(failed.state, 'failed');
  assert.equal(typeof failed.retry, 'function');
  f.player.mediaKey = 'local:replacement';
  f.player.generation++;
  f.window.CinemaSahne.close();
  const next = f.open('study');
  assert.equal(next.panel().job.state, 'idle');
  assert.equal(next.panel().job.retry, undefined);
  failed.retry();
  failed.cancel();
  assert.equal(starts, 1);
  assert.equal(stops, 0);
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

test('Changing source timing clears the sentence loop while a translation-only shift keeps it', async t => {
  const f = fixture(t), a = f.open('study');
  assert.equal((await a.cmd('loop', { on: true, row: 0 })).ok, true);
  assert.equal(a.state().loopRow, 0);
  f.secondary.offsetSeconds++;
  assert.equal(a.state().loopRow, 0);
  assert.equal(f.player.abA, 2);
  f.source.offsetSeconds++;
  assert.equal(a.state().loopRow, -1);
  assert.equal(f.player.abA, null);
  assert.equal(f.player.abB, null);
});

test('closing shelf playback removes the scene instead of remounting an ownerless overlay',async t=>{
 const f=fixture(t);f.document.getElementById('playerLayer').classList.add('hidden');let live=true;
 f.window.MediaShelfUI={readSnapshot:()=>live?{mediaKey:'shelf:one',generation:1,title:'Episode',time:0,duration:30,paused:true,rate:1,capabilities:{seek:{support:'yes'}}}:null,isPodcastMode:()=>true,openPodcastMode:async()=>{},getTranscriptTracks:()=>[],executeExisting:async()=>({ok:true})};
 await f.window.CinemaSahne.openShelf();const scene=f.window.CinemaSahne.current;assert(scene);live=false;scene.o.onSource('none',{});assert.equal(f.window.CinemaSahne.current,null);assert.equal(f.document.querySelector('.sh-shelf-host'),null);
});

test('A timestamped shelf transcript explains its audio mismatch and offers the existing verified audio route', async t => {
 const f=fixture(t);
 f.document.getElementById('playerLayer').classList.add('hidden');
 const exact={entryId:'entry-A',sourceVersion:'copy-v1'};
 let available=false, opened=0;
 f.window.api.feedsRequest=async()=>({available,sourceVersion:'copy-v1'});
 f.window.PlayerSourceCatalogIntegration={openPodcastEntry:async(id,options)=>{
  assert.equal(id,'entry-A');assert.equal(options.exactVersion,'copy-v1');
  assert.equal(options.isCancelled(),false);
  f.player.mediaKey='podcast-copy:entry-A:copy-v1';
  assert.equal(options.isCancelled(),false,'opening the intended copy must not cancel itself');
  opened++;
 }};
 f.window.MediaShelfUI={
  readSnapshot:()=>({mediaKey:'shelf:A',generation:1,title:'Episode',duration:30}),
  isPodcastMode:()=>true,openPodcastMode:async()=>{},
  getTranscriptTracks:()=>[{id:'source',role:'source',revision:'r',timed:false,timestamped:true,timingState:'needs-review',exactSource:exact,text:'Saved transcript',cues:[]}],
  executeExisting:async()=>({ok:true})
 };
 await f.window.CinemaSahne.openShelf();
 const a=f.window.CinemaSahne.current.a;
 assert.match(a.state().timingNotice,/saved timestamps/);
 const action=a.panel().sections.find(section=>section.title==='Timed transcript').items[0];
 await assert.rejects(action.run(),/no longer available/);
 assert.equal(opened,0);
 available=true;
 await action.run();
 assert.equal(opened,1);
});


for(const [format,text] of [['srt','1\n00:00:30,000 --> 00:00:32,000\nActual source words\n'],['vtt','WEBVTT\n\n00:30.000 --> 00:32.000\nActual source words\n'],['plain','Plain source prose with 30 seconds mentioned.']])test(`read-only shelf ${format} displays prose without granting timestamp seeking`,async t=>{
 const f=fixture(t);f.document.getElementById('playerLayer').classList.add('hidden');let commands=0,parses=0;
 const track={id:'readonly-source',revision:'v1',role:'source',timed:false,cues:[],text},translation={id:'readonly-translation',revision:'t1',role:'translation',timed:false,cues:[],text:format==='plain'?'Plain translation.':text.replace('Actual source words','Actual translation')};
 f.setParser(value=>{parses++;return [{start:30,end:32,text:value.includes('Actual translation')?'Actual translation':'Actual source words'}];});
 f.window.MediaShelfUI={readSnapshot:()=>({mediaKey:'shelf:one',generation:1,sourceVersion:'v1',title:'Episode',duration:60,capabilities:{seek:{support:'yes'}}}),isPodcastMode:()=>true,openPodcastMode:async()=>{},getTranscriptTracks:()=>[track,translation],executeExisting:async()=>{commands++;return {ok:true};}};
 await f.window.CinemaSahne.openShelf();const adapter=f.window.CinemaSahne.current.a,state=adapter.state();
 assert.equal(state.rows[0].src,format==='plain'?text:'Actual source words');assert.deepEqual(Array.from(state.rows[0].trs),[format==='plain'?'Plain translation.':'Actual translation']);assert.equal(state.rows[0].timed,false);assert.equal((await adapter.cmd('seekCue',0)).ok,false);assert.equal(commands,0);assert.equal(track.text,text);assert.equal(track.timed,false);assert.equal(track.id,'readonly-source');assert.equal(track.revision,'v1');assert.equal(parses,format==='plain'?0:2);
});

test('Sahne podcast actions bind the exact episode and task status to the existing shelf service',async t=>{
 const f=fixture(t);f.document.getElementById('playerLayer').classList.add('hidden');let generation=1;const calls=[];
 const snapshot=()=>({mediaKey:'shelf:one',generation,sourceVersion:'v1',title:'Episode',duration:30,capabilities:{seek:{support:'yes'}}});
 f.window.MediaShelfUI={readSnapshot:snapshot,isPodcastMode:()=>true,openPodcastMode:async()=>{},getTranscriptTracks:()=>[],executeExisting:async()=>({ok:true}),podcastTaskState:()=>({hasSourceTranscript:true,job:{id:'same-job',state:'queued',text:'Waiting'}}),runPodcastTask:async args=>{calls.push(args);return {queued:true,id:'same-job'};}};
 await f.window.CinemaSahne.openShelf();const a=f.window.CinemaSahne.current.a,actions=a.actions();assert.equal(actions.length,3);
 await actions[1].run();assert.equal(calls[0].operation,'transcribe-translate');assert.equal(calls[0].expected.sourceVersion,'v1');assert.equal(a.panel().job.state,'running');assert.equal(a.panel().job.text,'Waiting');
 generation++;assert.throws(()=>actions[0].run(),/Source changed/);assert.equal(calls.length,1);assert.equal(calls[0].isCancelled(),true);
});


test('shared surface rejects retained commands after source version changes within a generation',async t=>{
 const f=fixture(t);f.document.getElementById('playerLayer').classList.add('hidden');let version='one';let commands=0;
 f.window.MediaShelfUI={readSnapshot:()=>({mediaKey:'shelf:one',generation:1,sourceVersion:version,title:'Episode',duration:30,capabilities:{seek:{support:'yes'}}}),isPodcastMode:()=>true,openPodcastMode:async()=>{},getTranscriptTracks:()=>[],executeExisting:async()=>{commands++;return{ok:true};}};
 await f.window.CinemaSahne.openShelf();const a=f.window.CinemaSahne.current.a,identity=a.identity();version='two';assert.notEqual(a.identity(),identity);assert.equal((await a.cmd('seek',5)).ok,false);assert.equal(commands,0);
});


test('RSS cover and publisher belong only to the current audio source, never a later local video',t=>{
 const f=fixture(t);f.player.workspaceAudio={mediaKey:f.player.mediaKey,generation:1,title:'Publisher episode',transcriptTimingNotice:'Source timing needs review',publisher:'Actual publisher',image:'https://images.example/cover.jpg'};
 const info=f.open().info();assert.equal(info.title,'Publisher episode');assert.equal(info.cover,'https://images.example/cover.jpg');assert.match(info.sub,/Actual publisher/);assert.match(info.eyebrow,/Podcast/);assert.equal(f.window.CinemaSahne.current.a.state().timingNotice,'Source timing needs review');
 f.player.generation=2;const changed=f.window.CinemaSahne.current.a.info();assert.equal(changed.cover,'');assert.doesNotMatch(changed.sub,/Actual publisher/);
});


test('shared sentence save preserves bound source, real offsets, translation and user note',async t=>{
 const f=fixture(t),saved=[];f.window.api.upsertResearchAnnotation=async payload=>{saved.push(payload);return {ok:true,annotation:payload};};
 const a=f.open(),state=a.state();assert.equal(a.caps.save,true);
 const result=await a.cmd('save',{row:0,note:'My note'},state.rev);assert.equal(result.ok,true);
 assert.equal(saved[0].mediaId,'local:episode');assert.equal(saved[0].start,2);assert.equal(saved[0].end,10);assert.equal(saved[0].timed,true);assert.equal(saved[0].source,'Source sentence');assert.equal(saved[0].translation,'Birinci\n\nİkinci');assert.equal(saved[0].note,'My note');
 f.source.revision='s2';assert.equal((await a.cmd('save',{row:0},state.rev)).code,'stale-track');assert.equal(saved.length,1);
 f.player.generation++;assert.equal((await a.cmd('save',{row:0})).code,'stale-source');assert.equal(saved.length,1);
});

test('plain translation renders and saves untimed without invented alignment or seek',async t=>{
 const f=fixture(t),saved=[];f.window.api.upsertResearchAnnotation=async payload=>{saved.push(payload);return {ok:true,annotation:payload};};
 f.player.workspaceAudio={mediaKey:f.player.mediaKey,generation:1,entryId:'feed-entry',transcriptState:'untimed',transcriptText:'First paragraph\n\nSecond paragraph',translationText:'Complete translation'};
 const a=f.open(),state=a.state();assert.equal(state.rows.length,1);assert.equal(state.rows[0].trs[0],'Complete translation');
 assert.equal((await a.cmd('save',{row:0,note:'Untimed note'},state.rev)).ok,true);assert.equal(saved[0].timed,false);assert.equal(saved[0].start,null);assert.equal(saved[0].end,null);assert.equal(saved[0].sourceEntryId,'feed-entry');assert.equal(f.commands.length,0);
 f.player.workspaceAudio.translationText='Updated translation';assert.notEqual(a.state().rev,state.rev);assert.equal((await a.cmd('save',{row:0},state.rev)).code,'stale-track');
});


test('long plain transcript requires a real selected passage without truncation or unaligned translation',async t=>{
 const f=fixture(t),saved=[];f.window.api.upsertResearchAnnotation=async payload=>{saved.push(payload);return {ok:true,annotation:payload};};
 f.player.workspaceAudio={mediaKey:f.player.mediaKey,generation:1,transcriptState:'untimed',transcriptText:'Source passage. '+ 'Long text '.repeat(500),translationText:'Whole translation'};
 const a=f.open(),rev=a.state().rev;const rejected=await a.cmd('save',{row:0},rev);assert.equal(rejected.code,'passage-too-long');assert.match(rejected.message,/4000/);assert.equal(saved.length,0);
 assert.equal((await a.cmd('save',{row:0,excerpt:'invented passage'},rev)).code,'invalid-excerpt');assert.equal((await a.cmd('save',{row:0,excerpt:''},rev)).code,'invalid-excerpt');
 assert.equal((await a.cmd('save',{row:0,excerpt:'Source passage.'},rev)).ok,true);assert.equal(saved.length,1);assert.equal(saved[0].source,'Source passage.');assert.equal(saved[0].translation,'');assert.equal(saved[0].start,null);assert.equal(f.commands.length,0);
 f.player.workspaceAudio.transcriptText='Changed';assert.equal((await a.cmd('save',{row:0,excerpt:'Source passage.'},rev)).code,'stale-track');
});


test('single selected podcast word uses the existing word research record and source binding',async t=>{
 const f=fixture(t),saved=[];f.window.api.upsertResearchAnnotation=async payload=>{saved.push(payload);return {ok:true,annotation:payload};};f.player.workspaceAudio={mediaKey:f.player.mediaKey,generation:1,entryId:'podcast',transcriptState:'untimed',transcriptText:'Original source sentence'};
 const a=f.open(),state=a.state();assert.equal((await a.cmd('save',{row:0,excerpt:'source'},state.rev)).ok,true);assert.equal(saved[0].type,'word');assert.equal(saved[0].source,'source');assert.equal(saved[0].sourceEntryId,'podcast');assert.equal(saved[0].timed,false);assert.equal(saved[0].start,null);
});


test('only healthy progressing content clears its current browser recovery', () => {
  const renderer=fs.readFileSync(require.resolve('../src/renderer/renderer'),'utf8');
  const start=renderer.indexOf('function settleBrowserPlaybackRecovery(');
  const end=renderer.indexOf('async function runPlaybackRecovery(',start);
  let recovery={owner:'browser'},cleared=0;
  const context={activePlaybackRecovery:()=>recovery,clearPlayerPlaybackRecovery:()=>{cleared++;}};
  vm.runInNewContext(renderer.slice(start,end),context);
  const healthy={paused:false,adPlaying:false,readyState:4,errorCode:0,currentTime:10.5};
  for(const patch of [{paused:true},{adPlaying:true},{readyState:1},{errorCode:2},{currentTime:10},{currentTime:100},{spinnerVisible:true}]) {
    context.settleBrowserPlaybackRecovery({...healthy,...patch},10);assert.equal(cleared,0);
  }
  recovery=null;context.settleBrowserPlaybackRecovery(healthy,10);assert.equal(cleared,0);
  recovery={owner:'local'};context.settleBrowserPlaybackRecovery(healthy,10);assert.equal(cleared,0);
  recovery={owner:'browser'};context.settleBrowserPlaybackRecovery(healthy,10);assert.equal(cleared,1);
});


test('verbatim translation warnings keep real texts and do not alter pairing or clocks',t=>{
 const f=fixture(t);f.secondary.cues=[{id:'same',start:0,end:8,text:'Source sentence'}];
 const a=f.open('study'),row=a.state().rows[0];
 assert.equal(row.translationReview,true);assert.equal(row.src,'Source sentence');assert.deepEqual(Array.from(row.trs),['Source sentence']);assert.equal(row.start,2);
});
