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

test('locale rebuild restores owned search focus and selection but never steals external focus',t=>{
 const f=fixture(t),Base=f.context.Sahne;f.context.Sahne=class extends Base{constructor(...args){super(...args);const input=f.document.createElement('input');input.dataset.r='q';input.value='needle text';this.root.append(input);}};
 f.open('study');const input=f.window.CinemaSahne.current.root.querySelector('[data-r=q]');input.focus();input.setSelectionRange(2,5);
 f.document.dispatchEvent(new f.window.Event('ui-locale-change'));const next=f.window.CinemaSahne.current.root.querySelector('[data-r=q]');assert.equal(f.document.activeElement,next);assert.equal(next.selectionStart,2);assert.equal(next.selectionEnd,5);
 const outside=f.document.createElement('button');f.document.body.append(outside);outside.focus();f.document.dispatchEvent(new f.window.Event('ui-locale-change'));assert.equal(f.document.activeElement,outside);
});

test('locale rebuild retains the current fullscreen host without replacing user media identity',t=>{
 const f=fixture(t);f.open('study');const host=f.document.querySelector('.sh-host'),before=f.window.CinemaSahne.current;Object.defineProperty(f.document,'fullscreenElement',{configurable:true,value:host});
 f.window.UiLocale={get:()=> 'tr'};f.document.dispatchEvent(new f.window.Event('ui-locale-change'));
 assert.equal(f.document.querySelector('.sh-host'),host);assert.notEqual(f.window.CinemaSahne.current,before);assert.equal(f.player.mediaKey,'local:episode');
});

test('same-source fullscreen mode changes retain the connected host but another media owner replaces it',t=>{
 const f=fixture(t);f.open('podcast');const host=f.document.querySelector('.sh-host');Object.defineProperty(f.document,'fullscreenElement',{configurable:true,value:host});
 f.open('study');assert.equal(f.document.querySelector('.sh-host'),host);assert.equal(host.isConnected,true);
 f.player.generation++;f.open('podcast');assert.notEqual(f.document.querySelector('.sh-host'),host);assert.equal(host.isConnected,false);
});

test('task fullscreen action returns the same awaited result as the transport command',async t=>{
 const f=fixture(t),adapter=f.open();let finish,calls=0;f.document.querySelector('.sh-host').requestFullscreen=()=>{calls++;return new Promise(resolve=>finish=resolve);};
 const action=adapter.panel().sections.flatMap(section=>section.items).find(item=>item.label==='Open stage fullscreen');const pending=action.run();assert.equal(typeof pending?.then,'function');const second=adapter.cmd('fullscreen');assert.equal(calls,1);finish();assert.equal((await pending).ok,true);assert.equal((await second).ok,true);assert.equal(calls,1);
 f.document.querySelector('.sh-host').requestFullscreen=()=>Promise.reject(new Error('Controlled fullscreen rejection'));await assert.rejects(action.run(),/Controlled fullscreen rejection/);
 f.document.querySelector('.sh-host').requestFullscreen=()=>Promise.resolve();assert.equal((await action.run()).ok,true);
});

test('local Stage status keeps its existing job owner distinct across replacements',t=>{
 const f=fixture(t),adapter=f.open();f.player.job={id:'first'};const first=adapter.panel().job.ownerToken;assert.equal(first,f.player.job);
 f.player.job={id:'second'};assert.equal(adapter.panel().job.ownerToken,f.player.job);assert.notEqual(adapter.panel().job.ownerToken,first);
});

test('shared adapter carries explicit rate availability without inventing an unavailable legacy capability', t => {
 const f=fixture(t),snapshot=f.window.PlayerWorkspaceIntegration.snapshot;let support='unknown';
 f.window.PlayerWorkspaceIntegration.snapshot=()=>{const s=snapshot();return {...s,capabilities:{...s.capabilities,rate:{support}}};};
 const adapter=f.open();assert.equal(adapter.state().canRate,false);support='no';assert.equal(adapter.state().canRate,false);support='yes';assert.equal(adapter.state().canRate,true);
 f.window.PlayerWorkspaceIntegration.snapshot=snapshot;assert.equal(adapter.state().canRate,true);
});

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
  f.player.browserTime = 6;
  const during = a.state();
  assert.equal(during.time, 6);
  assert.equal(during.captionTracks[0], first.captionTracks[0]);
  assert.equal(during.rows, first.rows);
  f.player.browserPaused = false;
  f.player.browserRate = 1.5;
  const sample = {mediaKey:f.player.mediaKey,generation:f.player.generation,time:6,at:f.window.performance.now()-1500,advancing:true};
  f.context.browserTabState = () => ({browserClockSample:sample});
  assert.equal(a.state().displayTime,7.5);
  assert.equal(a.state().time,6,'presentation interpolation cannot change the command clock');
  sample.waiting = true;
  assert.equal(a.state().waiting,true);
  assert.equal(a.state().displayTime,6);
  sample.waiting = false;
  sample.seeking = true;
  assert.equal(a.state().seeking,true);
  assert.equal(a.state().displayTime,6);
  sample.seeking = false;
  sample.advancing = false;
  assert.equal(a.state().displayTime,6);
  sample.advancing = true;
  sample.generation++;
  assert.equal(a.state().displayTime,6);
  sample.generation--;
  f.player.browserTime = 22;
  assert.equal(a.state().displayTime,22,'a seek must not inherit the old sample');
  f.player.browserTime = 6;
  f.player.browserAdPlaying = true;
  assert.equal(a.state().canSeek, false);
  assert.equal(a.state().adPlaying, true);
  assert.equal(a.state().displayTime,6);
  f.player.browserAdPlaying = false;
  offset = 9; reads = 0;
  const next = a.state();
  const nextOriginal = next.rows.find(row => !row.standaloneTranslation);
  assert.equal(nextOriginal.start, 9); assert.equal(nextOriginal.words[0].t0, 9);
  assert.notEqual(next.rev, first.rev); assert(reads <= 4);
  f.player.cues[0].id = 'replacement';
  assert.notEqual(a.state().rev, next.rev);
  assert.equal(f.player.cues[0].start, 0); assert.equal(f.player.cues2[0].start, 0);
  f.context.browserTransformForChannel = () => { reads++; throw new Error('unavailable timing lookup'); }; reads = 0;
  const fallback = a.state(); assert.equal(fallback.rows[0].start, 0); assert.equal(fallback.rows[0].words[0].t0, 0); assert(reads <= 4);
});
test('browser stage modes retain the browser tab, clock and tracks and release the slot on close', t => {
  const f = fixture(t), layer = f.document.getElementById('playerLayer');
  const slot = f.document.createElement('div');slot.id='browserViewSlot';layer.append(slot);
  Object.assign(f.player,{workspaceMode:'browser',browserActiveTabId:'same-tab',browserTime:4,browserDuration:40,
    browserMediaSeen:true,browserPaused:false,browserTracks:[],cues:[{id:'s',start:4,end:6,text:'Speech'}],cues2:[]});
  f.context.subtitleVideoTransform=()=>({scale:1,offsetSeconds:0});
  f.context.subtitleVideoTime=time=>time;
  layer.classList.add('workspace-browser');
  let podcast=false;
  f.window.BrowserStudy={open(){layer.classList.add('browser-study-mode');},close(){layer.classList.remove('browser-study-mode');}};
  f.window.BrowserPodcastUI={setMode(on){podcast=on;},isActive(){return podcast;}};
  const study=f.open('study');
  f.window.CinemaSahne.current.root.append(study.slot('study'));
  assert.notEqual(slot.parentElement,layer);
  assert.equal(study.state().rows[0].src,'Speech');
  f.window.CinemaSahne.current.o.onMode('podcast',{});
  const next=f.window.CinemaSahne.current;
  assert.equal(next.o.mode,'podcast');
  assert.equal(next.a.state().time,4);
  assert.equal(next.a.state().paused,false);
  assert.equal(slot.parentElement,layer);
  next.o.onMode('study',{});
  assert.equal(f.window.CinemaSahne.current.o.mode,'study');
  f.window.CinemaSahne.current.root.append(f.window.CinemaSahne.current.a.slot('study'));
  assert.equal(f.player.browserActiveTabId,'same-tab');
  f.window.CinemaSahne.current.o.onClose();
  assert.equal(f.window.CinemaSahne.current,null);
  assert.equal(slot.parentElement,layer);
  assert.equal(f.commands.length,0);
});

test('browser stage reading preferences stay with their own tab session across same-mode changes', t => {
  const f = fixture(t);
  const sessions = {a:{},b:{}};
  Object.assign(f.player,{workspaceMode:'browser',browserActiveTabId:'a',browserTracks:[]});
  f.document.getElementById('playerLayer').classList.add('workspace-browser');
  f.context.subtitleVideoTransform=()=>({scale:1,offsetSeconds:0});
  f.window.BrowserStudy={open(){},isActive:()=>true,stageSession:()=>sessions[f.player.browserActiveTabId]};
  f.window.BrowserPodcastUI={setMode(){},isActive:()=>false};
  const a=f.open('study'), original=f.window.CinemaSahne.current;
  const aIdentity=a.identity();
  const draft={identity:aIdentity,text:'Keep this draft',pending:true};
  original.prefs=()=>({reading:{identity:aIdentity,query:'First video',noteDraft:draft}});
  f.player.browserActiveTabId='b';
  f.player.mediaKey='browser:b';
  const b=f.open('study');
  assert.notEqual(b,a);
  assert.equal(f.window.CinemaSahne.current.o.prefs,undefined);
  assert.equal(sessions.a.readingPrefs.reading.query,'First video');
  const bIdentity=b.identity();
  f.window.CinemaSahne.current.prefs=()=>({reading:{identity:bIdentity,query:'Second video'}});
  f.player.browserActiveTabId='a';
  f.player.mediaKey='local:episode';
  f.player.generation++;
  const restored=f.open('study');
  assert.equal(f.window.CinemaSahne.current.o.prefs.reading.query,'First video');
  assert.equal(f.window.CinemaSahne.current.o.prefs.reading.identity,restored.identity());
  assert.equal(f.window.CinemaSahne.current.o.prefs.reading.noteDraft,draft,'pending save receipt stays shared');
  assert.equal(draft.identity,restored.identity());
  assert.equal(sessions.b.readingPrefs.reading.query,'Second video');
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
  assert.equal(f.commands.at(-1).time, 2.01, 'a translation jump uses the shared landing margin (its own clock + 10 ms)');
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

test('translation seek uses the paired track offset and rejects the previous revision after an edit', async t => {
  const f=fixture(t), adapter=f.open('study');
  const before=adapter.state();
  assert.equal(before.rows[0].translationStart,2);
  assert.equal((await adapter.cmd('seekTranslation',{row:0,part:1},before.rev)).ok,true);
  assert.equal(f.commands.pop().time,5.01,'paired offset applied, plus the shared landing margin');
  f.secondary.offsetSeconds=2;
  const after=adapter.state();
  assert.equal(after.rows[0].translationStart,3);
  assert.equal((await adapter.cmd('seekTranslation',0,before.rev)).code,'stale-track');
  assert.equal(f.commands.length,0);
  assert.equal((await adapter.cmd('seekTranslation',0,after.rev)).ok,true);
  assert.equal(f.commands.at(-1).time,3.01,'edited paired track: new offset plus the shared landing margin');
});
test('translation without a source match stays searchable and seekable without changing original navigation', async t => {
  const f = fixture(t);
  f.secondary.cues.push({ id: 'gap', start: 19, end: 21, text: 'Ayrı çeviri' });
  const a = f.open('podcast'), state = a.state();
  const index = state.rows.findIndex(row => row.standaloneTranslation);
  const row = state.rows[index];
  assert.equal(row.src, '');
  assert.equal(row.trs[0], 'Ayrı çeviri');
  assert.equal(row.translationCueIds[0], 'gap');
  assert.equal(row.translationStart, 20);
  assert.equal((await a.cmd('nextCue')).ok, false);
  assert.equal((await a.cmd('seekTranslation', index, state.rev)).ok, true);
  assert.equal(f.commands.at(-1).time, 20.01, 'translation-only row: own clock plus the shared landing margin');
  assert.equal(a.state().translationTargets.replay, 20);
  assert.equal((await a.cmd('replay')).ok, false);
});
test('translation transport navigates its own cues across views and leaves the original loop intact', async t => {
  const f = fixture(t), study = f.open('study');
  const initial = study.state();
  assert.equal(initial.translationTargets.nextCue, 5);
  assert.equal(initial.translationTargets.replay, 2);
  assert.equal((await study.cmd('nextCue', 'translation', initial.rev)).ok, true);
  assert.equal(f.commands.at(-1).time, 5);
  f.window.CinemaSahne.current.o.onMode('podcast', { reading: { identity: study.identity() } });
  const podcast = f.window.CinemaSahne.current.a;
  assert.equal(podcast.state().translationTargets.nextCue, undefined);
  assert.equal((await podcast.cmd('prevCue', 'translation')).ok, true);
  assert.equal(f.commands.at(-1).time, 2);
  assert.equal((await podcast.cmd('replay', 'translation')).ok, true);
  assert.equal(f.commands.at(-2).time, 2);
  assert.equal(f.commands.at(-1).type, 'togglePlay');
  const before = podcast.state();
  f.secondary.offsetSeconds += 3;
  assert.equal((await podcast.cmd('nextCue', 'translation', before.rev)).code, 'stale-track');
  assert.equal(podcast.state().translationTargets.replay, undefined);
  assert.equal((await podcast.cmd('replay', 'translation')).ok, false);
  assert.equal((await podcast.cmd('loop', { on: true, row: 0 })).ok, true);
  assert.deepEqual([f.player.abA, f.player.abB], [2, 10]);
});
test('a confirmed same-source loop survives a mode change without reinstalling the range', async t => {
  const f=fixture(t), first=f.open('podcast');
  assert.equal((await first.cmd('loop',{on:true,row:0})).ok,true);
  const calls=f.commands.length;
  f.window.CinemaSahne.current.o.onMode('study',{reading:{identity:first.identity()}});
  const next=f.window.CinemaSahne.current.a;
  assert.equal(next.state().loopRow,0);
  assert.equal(f.commands.length,calls);
  assert.deepEqual([f.player.abA,f.player.abB],[2,10]);
  f.window.CinemaSahne.close();
  assert.deepEqual([f.player.abA,f.player.abB],[null,null]);
});
test('an explicit seek outside the owned sentence releases its loop but an in-range seek preserves it',async t=>{
 const f=fixture(t),a=f.open('study');await a.cmd('loop',{on:true,row:0});
 await a.cmd('seek',5);assert.deepEqual([f.player.abA,f.player.abB],[2,10]);
 await a.cmd('seek',25);assert.deepEqual([f.player.abA,f.player.abB],[null,null]);assert.equal(a.state().loopRow,-1);
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

test('removing all subtitle cues clears only the Stage owned loop and leaves no seekable rows',async t=>{
 const f=fixture(t),a=f.open('study');await a.cmd('loop',{on:true,row:0});f.source.cues=[];f.source.revision='removed';f.secondary.cues=[];f.secondary.revision='removed';
 const state=a.state();assert.equal(state.rows.length,0);assert.equal(state.loopRow,-1);assert.deepEqual([f.player.abA,f.player.abB],[null,null]);assert.equal((await a.cmd('seekCue',0)).ok,false);
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
 assert.equal(actions.find(row=>row.primary).id,'translate');await actions.find(row=>row.id==='transcribe-translate').run();assert.equal(calls[0].operation,'transcribe-translate');assert.equal(calls[0].expected.sourceVersion,'v1');assert.equal(a.panel().job.state,'running');assert.equal(a.panel().job.text,'Waiting');
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
  const signals=[];
  const context={
    player:{browserSignalState:{action:'playback-recovery'},browserTracks:[]},
    activePlaybackRecovery:()=>recovery,
    clearPlayerPlaybackRecovery:()=>{cleared++;},
    interfaceChoice:(_tr,en)=>en,
    setBrowserSignal:(message)=>signals.push(message)
  };
  vm.runInNewContext(renderer.slice(start,end),context);
  const healthy={paused:false,adPlaying:false,readyState:4,errorCode:0,currentTime:10.5};
  for(const patch of [{paused:true},{adPlaying:true},{readyState:1},{errorCode:2},{currentTime:10},{currentTime:100},{spinnerVisible:true}]) {
    context.settleBrowserPlaybackRecovery({...healthy,...patch},10);assert.equal(cleared,0);
  }
  recovery=null;context.settleBrowserPlaybackRecovery(healthy,10);assert.equal(cleared,0);
  recovery={owner:'local'};context.settleBrowserPlaybackRecovery(healthy,10);assert.equal(cleared,0);
  recovery={owner:'browser'};context.settleBrowserPlaybackRecovery(healthy,10);assert.equal(cleared,1);
  assert.deepEqual(signals,['Playback resumed.']);
  context.player.browserSignalState.action='translate';
  context.settleBrowserPlaybackRecovery(healthy,10);
  assert.deepEqual(signals,['Playback resumed.']);
});
test('caption retry keeps the saved source and refuses a delayed retry after switching media', async () => {
  const renderer=fs.readFileSync(require.resolve('../src/renderer/renderer'),'utf8');
  const start=renderer.indexOf('let browserCaptionRetryPending = null;');
  const end=renderer.indexOf('async function runBrowserChromeCommand(',start);
  const player={workspaceMode:'browser',browserActiveTabId:'one',mediaKey:'browser:one',browserTime:12,
    cues:[{text:'Saved words'}],cues2:[{text:'Saved translation'}]};
  let generation=1,release,reloads=0;
  const context=vm.createContext({
    player,currentGeneration:()=>generation,playbackCheckpoint:()=>11.5,
    saveActiveBrowserTabWorkspace(){},
    flushWatchState:()=>new Promise(resolve=>{release=resolve;}),
    runBrowserChromeCommand:async()=>{reloads++;return {ok:true};}
  });
  vm.runInContext(renderer.slice(start,end),context);
  const expected={tabId:'one',mediaKey:'browser:one',generation:1};
  const pending=context.retryBrowserCaptionCapture(expected);
  assert.equal((await context.retryBrowserCaptionCapture(expected)).code,'busy');
  player.mediaKey='browser:two';generation++;
  release();assert.equal((await pending).code,'stale-source');
  assert.equal(reloads,0);
  const next=context.retryBrowserCaptionCapture({...expected,mediaKey:player.mediaKey,generation});
  release();assert.equal((await next).ok,true);
  assert.equal(reloads,1);
  assert.equal(player.pendingLibrarySeek.seconds,11.5);
  assert.equal(player.cues[0].text,'Saved words');
  assert.equal(player.cues2[0].text,'Saved translation');
});
test('initial Browser progress cannot overwrite the saved scene before a scene choice', () => {
  const renderer=fs.readFileSync(require.resolve('../src/renderer/renderer'),'utf8');
  const start=renderer.indexOf('function captureWatchPrefs(');
  const end=renderer.indexOf('function beginWatchSession(',start);
  let chosen=false,active=false;
  const context=vm.createContext({
    player:{workspaceMode:'browser',mediaKey:'browser:saved'},
    $:()=>null,watchItemByKey:()=>({prefs:{browserStageMode:'podcast'}}),subLangFromPath:()=>'',
    window:{BrowserStudy:{hasPreference:()=>chosen,isActive:()=>active},BrowserPodcastUI:{isActive:()=>true}}
  });
  vm.runInContext(renderer.slice(start,end),context);
  assert.equal(Object.hasOwn(context.captureWatchPrefs(),'browserStageMode'),false);
  chosen=true;active=true;
  assert.equal(context.captureWatchPrefs().browserStageMode,'podcast');
  active=false;
  assert.equal(context.captureWatchPrefs().browserStageMode,null);
});
test('a delayed saved scene cannot reopen after the user closes the scene', async () => {
  const renderer=fs.readFileSync(require.resolve('../src/renderer/renderer'),'utf8');
  const start=renderer.indexOf('async function restoreWatchProfile(');
  const end=renderer.indexOf('function makeWatchAction(',start);
  let revision=0,release,opened=0;
  const player={workspaceMode:'browser',mediaKey:'browser:one',browserSceneReopen:{key:'browser:one'}};
  const context=vm.createContext({
    player,state:{seriesPrefs:{}},currentGeneration:()=>1,staleGeneration:()=>false,
    browserTabState:()=>({}),watchItemByKey:()=>({prefs:{speed:1,browserStageMode:'podcast'}}),
    seriesKeyForPlayer:()=>'',browserCommand:()=>new Promise(resolve=>{release=resolve;}),
    $:()=>null,syncPlayerSpeedControl(){},applySubtitlePos(){},applySavedLanguagePrefs(){},updateSeriesChip(){},
    window:{api:{browserCommand:true},BrowserStudy:{revision:()=>revision},CinemaSahne:{open(){opened++;}}}
  });
  vm.runInContext(renderer.slice(start,end),context);
  const pending=context.restoreWatchProfile(player.mediaKey);
  revision++;
  release();await pending;
  assert.equal(opened,0);
  player.browserSceneReopen={key:player.mediaKey};
  const next=context.restoreWatchProfile(player.mediaKey);
  release();await next;
  assert.equal(opened,1);
});
test('an ended event cannot advance the new media while its old progress save is pending', async () => {
  const renderer=fs.readFileSync(require.resolve('../src/renderer/renderer'),'utf8');
  const start=renderer.indexOf("video.addEventListener('ended', async () => {");
  const end=renderer.indexOf("video.addEventListener('error'",start);
  for (const change of ['key','generation','none','podcast','sleep','auto-off']) {
    let ended,release,generation=1,next=0,queue=0,paused=0;
    const player={mediaKey:'local:one',generation:1,autoNext:true,sleepTimerMode:'',playlistIndex:0};
    const context=vm.createContext({
      player,video:{addEventListener:(_type,callback)=>{ended=callback;},pause:()=>{paused++;}},
      window:{MediaShelfUI:{ownsPodcastQueue:()=>['podcast','sleep','auto-off'].includes(change),advancePodcastQueue:async()=>{queue++;}}},
      currentGeneration:()=>generation,staleGeneration:expected=>expected!==generation,
      stopPlayerVideoFrameLoop(){},renderCue(){},flushWatchState:()=>new Promise(resolve=>{release=resolve;}),
      stQueueAutoNext:()=>false,playPlaylistDelta:async()=>{next++;},stAutoRelatedNext(){},$:()=>null,osd(){},syncPlayerMediaSession(){}
    });
    vm.runInContext(renderer.slice(start,end),context);
    const pending=ended();
    if(change==='key')player.mediaKey='local:two';
    if(change==='generation')generation++;
    if(change==='sleep')player.sleepTimerMode='end';
    if(change==='auto-off')player.autoNext=false;
    release();await pending;
    assert.equal(next,change==='none'?1:0);
    assert.equal(queue,change==='podcast'?1:0);
    assert.equal(paused,change==='sleep'?1:0);
    assert.equal(player.sleepTimerMode,'');
  }
});
test('a late Browser show response hides the native view after leaving Browser', async () => {
  const renderer=fs.readFileSync(require.resolve('../src/renderer/renderer'),'utf8');
  const start=renderer.indexOf('async function showBrowserWorkspaceAttempt(');
  const end=renderer.indexOf('let browserWorkspaceShowPromise',start);
  let release,hidden=0,updated=0;
  const player={workspaceMode:'browser',browserWorkspaceSeq:0,browserActiveTabId:'one'};
  const context=vm.createContext({
    player,browserSlotBounds:()=>({width:640,height:360}),
    $:()=>({classList:{contains:()=>false}}),
    window:{api:{showBrowser:()=>new Promise(resolve=>{release=resolve;}),hideBrowser:async()=>{hidden++;}}},
    updateBrowserNavigation:()=>{updated++;}
  });
  vm.runInContext(renderer.slice(start,end),context);
  const pending=context.showBrowserWorkspaceAttempt();
  player.workspaceMode='player';player.browserWorkspaceSeq++;
  release({ok:true});await pending;
  assert.equal(hidden,1);
  assert.equal(updated,0);
});


test('verbatim translation warnings keep real texts and do not alter pairing or clocks',t=>{
 const f=fixture(t);f.secondary.cues=[{id:'same',start:0,end:8,text:'Source sentence'}];
 const a=f.open('study'),row=a.state().rows[0];
 assert.equal(row.translationReview,true);assert.equal(row.src,'Source sentence');assert.deepEqual(Array.from(row.trs),['Source sentence']);assert.equal(row.start,2);
});

test('Stage clipboard reports the actual result of the single IPC write', async t => {
  const f = fixture(t);
  const writes = [];
  f.window.api.copyText = async text => { writes.push(text); return text === 'Accepted'; };
  const adapter = f.open();
  assert.equal((await adapter.cmd('copy', 'Accepted')).ok, true);
  assert.equal((await adapter.cmd('copy', 'Rejected')).ok, false);
  assert.deepEqual(writes, ['Accepted', 'Rejected']);
});
test('Browser playback retry seeks before playing and retires a late seek after a tab change', async () => {
  const renderer = fs.readFileSync(require.resolve('../src/renderer/renderer.js'), 'utf8');
  const start = renderer.indexOf('      const pendingSeek = player.pendingLibrarySeek;');
  const end = renderer.indexOf('      if (now - player.browserPositionTick', start);
  const handle = renderer.slice(start, end);
  for (const switched of [false, true]) {
    const commands = [];
    let finish;
    const player = { mediaKey:'video-a', workspaceMode:'browser', browserDuration:60,
      browserActiveTabId:'a', pendingLibrarySeek:{key:'video-a',tabId:'a',generation:1,seconds:9,resumePlayback:true} };
    const context = {
      player, event:{media:{readyState:2}}, currentGeneration:()=>1, staleGeneration:()=>false,
      browserCommand:(command,value)=>{
        commands.push([command,value]);
        return command === 'seek' ? new Promise(resolve=>{finish=resolve;}) : Promise.resolve({ok:true});
      },
    };
    vm.runInNewContext(handle,context);
    assert.deepEqual(commands,[['seek',9]]);
    if (switched) player.browserActiveTabId='b';
    finish({ok:true});
    await Promise.resolve();
    assert.deepEqual(commands,switched ? [['seek',9]] : [['seek',9],['play',undefined]]);
  }
});

test('A late shelf Stage open cannot remount a Stage the user closed meanwhile, nor one whose podcast view was closed',async t=>{
 for(const interruption of ['stage-closed','podcast-view-closed']){
  const f=fixture(t);f.document.getElementById('playerLayer').classList.add('hidden');let release,podcast=false;
  f.window.MediaShelfUI={readSnapshot:()=>({mediaKey:'shelf:one',generation:1,title:'Episode',time:0,duration:30,paused:true,rate:1,capabilities:{seek:{support:'yes'}}}),isPodcastMode:()=>podcast,
   openPodcastMode:()=>new Promise(resolve=>{release=()=>{podcast=interruption!=='podcast-view-closed';resolve();};}),getTranscriptTracks:()=>[],executeExisting:async()=>({ok:true}),closePodcastMode(){podcast=false;}};
  const opening=f.window.CinemaSahne.openShelf();await new Promise(setImmediate);
  if(interruption==='stage-closed')f.window.CinemaSahne.close();
  release();const result=await opening;
  assert.equal(result.ok,false,interruption);assert.equal(f.window.CinemaSahne.current,null,interruption+': the Stage stays closed');assert.equal(f.document.querySelector('.sh-shelf-host'),null,interruption);
 }
 // A normal open still mounts.
 const g=fixture(t);g.document.getElementById('playerLayer').classList.add('hidden');let on=false;
 g.window.MediaShelfUI={readSnapshot:()=>({mediaKey:'shelf:one',generation:1,title:'Episode',time:0,duration:30,paused:true,rate:1,capabilities:{seek:{support:'yes'}}}),isPodcastMode:()=>on,openPodcastMode:async()=>{on=true;},getTranscriptTracks:()=>[],executeExisting:async()=>({ok:true})};
 assert.equal((await g.window.CinemaSahne.openShelf()).ok,true);assert(g.window.CinemaSahne.current);
});

test('Podcast Stage names the next episode of the real listening queue and opens exactly that one',async t=>{
 const f=fixture(t);f.document.getElementById('playerLayer').classList.add('hidden');const played=[];let next={index:1,title:'Dizgi Odası',queueKey:'k1'};
 f.window.MediaShelfUI={readSnapshot:()=>({mediaKey:'shelf:one',generation:1,title:'Episode',time:0,duration:30,paused:true,rate:1,capabilities:{seek:{support:'yes'}}}),isPodcastMode:()=>true,openPodcastMode:async()=>{},getTranscriptTracks:()=>[],executeExisting:async()=>({ok:true}),upNext:()=>next,playUpNext:async expected=>{if(expected.queueKey!==next?.queueKey)return {ok:false,code:'stale-queue'};played.push(expected);return {ok:true};}};
 await f.window.CinemaSahne.openShelf();const a=f.window.CinemaSahne.current.a;
 const shown=a.info().queue[0];
 assert.deepEqual(JSON.parse(JSON.stringify(shown)),{index:1,title:'Dizgi Odası',queueKey:'k1'});
 assert.equal((await a.cmd('openQueued',shown)).ok,true);assert.equal(played.length,1);
 next={index:1,title:'Dizgi Odası',queueKey:'k2'};
 assert.equal((await a.cmd('openQueued',shown)).code,'stale-queue','the replacement at the same index cannot be opened by an old button');assert.equal(played.length,1);
 next=null;assert.deepEqual(JSON.parse(JSON.stringify(a.info().queue)),[],'no next episode, no indicator');
});

test('Two overlapping Podcast Stage opens: the newest user choice stays even when the older one finishes last',async t=>{
 const f=fixture(t);f.document.getElementById('playerLayer').classList.add('hidden');const releases=[];let podcast=false;
 f.window.MediaShelfUI={readSnapshot:()=>({mediaKey:'shelf:one',generation:1,title:'Episode',time:0,duration:30,paused:true,rate:1,capabilities:{seek:{support:'yes'}}}),isPodcastMode:()=>podcast,
  openPodcastMode:()=>new Promise(resolve=>releases.push(()=>{podcast=true;resolve();})),getTranscriptTracks:()=>[],executeExisting:async()=>({ok:true})};
 const older=f.window.CinemaSahne.openShelf({mode:'podcast'}),newer=f.window.CinemaSahne.openShelf({mode:'study'});await new Promise(setImmediate);assert.equal(releases.length,2);
 releases[1]();assert.equal((await newer).ok,true);assert.equal(f.window.CinemaSahne.current.o.mode,'study');
 releases[0]();const late=await older;assert.equal(late.ok,false);assert.equal(late.code,'superseded');assert.equal(f.window.CinemaSahne.current.o.mode,'study','the older open does not replace the newer view');
});


test('a saved partial Podcast translation prioritizes missing-only retry and remains visible after stopping',t=>{
 const f=fixture(t),original=f.window.PlayerWorkspaceIntegration.snapshot,calls=[];f.window.PlayerWorkspaceIntegration.snapshot=()=>({...original(),sourceKind:'rss',sourceVersion:'v1'});
 let job={state:'done'},status={hasSourceTranscript:true,translationRetry:{partial:true,failed:2,completed:3,total:5,canRetry:true},job};
 f.window.PlayerSourceCatalogIntegration={podcastTaskState:()=>status,runPodcastTask:async request=>{calls.push(request);return {queued:true};}};
 const adapter=f.open(),actions=adapter.actions();assert.equal(actions.find(row=>row.primary).id,'retry-translation');assert.equal(adapter.panel().job.state,'partial');assert.match(adapter.panel().job.text,/3.*5/);
 adapter.panel().job.retry();assert.equal(calls[0].operation,'retry-translation');assert.equal(calls.length,1);
 status={...status,job:{state:'stopped'}};assert.equal(adapter.panel().job.state,'stopped');
 f.player.generation++;adapter.panel().job.retry?.();assert.equal(calls.length,1,'an old retry never applies to another media owner');
});

test('Stage saved-notes entry reuses the existing notebook and rejects an old media owner',async t=>{
 const f=fixture(t),calls=[];const entry=f.document.createElement('button');entry.id='libraryViewResearch';entry.onclick=()=>calls.push('research');f.document.body.append(entry);
 f.context.setSideTab=tab=>calls.push(tab);f.window.PlayerWorkspaceIntegration.openAdvanced=()=>calls.push('advanced');
 const adapter=f.open(),item=adapter.panel().sections.flatMap(section=>section.items).find(item=>item.id==='saved-notes');assert(item);assert.equal(item.run().ok,true);assert.deepEqual(calls,['library','research','advanced']);assert.equal(f.commands.length,0,'opening notes does not play or write anything');
 f.player.generation++;assert.equal((await adapter.cmd('notebook')).ok,false);assert.equal(item.run().ok,false);assert.equal(calls.length,3);
});

test('a retained Browser recovery callback cannot reload or open a different source',async()=>{
 const renderer=fs.readFileSync(require.resolve('../src/renderer/renderer.js'),'utf8');const start=renderer.indexOf('function browserPlaybackRecovery(event)'),end=renderer.indexOf('function settleBrowserPlaybackRecovery',start);
 for(const code of ['service-unavailable','http-access-denied'])for(const ok of [true,false]){
  const calls=[],player={workspaceMode:'browser',browserActiveTabId:'a',browserPageUrl:'https://fixture.invalid/a',mediaKey:'video:a',generation:1,browserTime:12,positions:{}};
  const context={player,interfaceChoice:(_tr,en)=>en,browserTabState:()=>({mediaId:'a'}),currentGeneration:()=>player.generation,staleGeneration:g=>g!==player.generation,playbackCheckpoint:()=>12,playerPositionKey:()=>'',browserChromeCommandBlocked:()=>false,runBrowserChromeCommand:async action=>{calls.push(action);return {ok};},window:{api:{openExternal:async url=>{calls.push(url);return {ok};}}}};
  vm.runInNewContext(renderer.slice(start,end),context);context.browserPlaybackRecovery({diagnostic:{code,resourceKind:'media'},mediaId:'a'});const old=player.playbackRecovery;
  assert.equal((await old.run()).ok,ok,'the real recovery result is preserved');assert.equal(calls.length,1,'the current source retains its existing recovery');calls.length=0;player.pendingLibrarySeek=null;
  player.browserActiveTabId='b';player.browserPageUrl='https://fixture.invalid/b';player.mediaKey='video:b';player.generation++;
  await old.run();assert.equal(calls.length,0,code+': old callback never affects the new source');assert.equal(player.pendingLibrarySeek,null);
 }
});

test('playback recovery bridge preserves results and binds the expected failure record',async()=>{
 const source=fs.readFileSync(require.resolve('../src/renderer/renderer.js'),'utf8'),start=source.indexOf('async function runPlaybackRecovery('),end=source.indexOf('async function showLocalPlaybackRecovery',start);
 let calls=0,current;const notices=[],context={activePlaybackRecovery:()=>current,interfaceChoice:(_tr,en)=>en,osd:message=>notices.push(message)};
 vm.runInNewContext(source.slice(start,end),context);
 current={run:async()=>{calls++;return {ok:false,message:'Actual failure'};}};
 const expected=current;assert.equal((await context.runPlaybackRecovery({expected,report:false})).message,'Actual failure');
 current={run:async()=>{calls++;throw Error('Controlled rejection');}};
 assert.equal((await context.runPlaybackRecovery({expected,report:false})).code,'stale-source');assert.equal(calls,1);
 assert.equal((await context.runPlaybackRecovery({report:false})).ok,false);assert.deepEqual(notices,[]);assert.equal(calls,2);
 assert.equal((await context.runPlaybackRecovery()).ok,false);assert.equal(notices.length,1);assert.equal(calls,3);
});

test('retained local recovery actions never load, relink or open a picker for the next source',async()=>{
 const renderer=fs.readFileSync(require.resolve('../src/renderer/renderer.js'),'utf8');const start=renderer.indexOf('async function showLocalPlaybackRecovery'),end=renderer.indexOf('function updatePlayerMeta',start);
 for(const availability of ['unknown','missing','denied','available','native','native-failed']){
  const calls=[],video={src:'file:///fixture-a.mp4',error:{code:3},currentTime:12,load:()=>calls.push('load'),play:async()=>calls.push('play')};
  const player={workspaceMode:'player',mediaKey:'file:a',generation:1,openIntent:1,localPath:'fixture-a.mp4',positions:{}};
  const context={player,interfaceChoice:(_tr,en)=>en,currentGeneration:()=>player.generation,staleGeneration:g=>g!==player.generation,playbackCheckpoint:()=>12,playerPositionKey:()=>'',MediaError:{MEDIA_ERR_DECODE:3,MEDIA_ERR_SRC_NOT_SUPPORTED:4},$:id=>id==='playerPickVideo'?{click:()=>calls.push('picker')}:null,offerMediaRelink:()=>calls.push('relink'),offerCompatibleMedia:()=>calls.push('compatible'),window:{api:{mediaPlaybackAvailability:async()=>availability},NativePlayerUI:{start:async()=>{calls.push('native');return availability!=='native-failed';}}}};
  vm.runInNewContext(renderer.slice(start,end),context);await context.showLocalPlaybackRecovery(video,{code:availability==='available'?3:2,nativeFailure:availability.startsWith('native')});const old=player.playbackRecovery;
  const result=await old.run();if(availability==='native-failed'){assert.equal(result.code,'native-start-failed');assert.deepEqual(calls,['native']);}assert(calls.length>0,availability+': the current action still works');calls.length=0;player.pendingLibrarySeek=null;
  player.mediaKey='file:b';player.generation++;player.openIntent++;video.src='file:///fixture-b.mp4';await old.run();
  assert.equal(calls.length,0,availability+': the next source is untouched');assert.equal(player.pendingLibrarySeek,null);
 }
});

test('Browser sentence loops survive an in-range seek near B but respect escape, pause and another owner',()=>{
 const renderer=fs.readFileSync(require.resolve('../src/renderer/renderer.js'),'utf8');const start=renderer.indexOf('function renderBrowserCueAt('),end=renderer.indexOf('async function showBrowserWorkspaceAttempt',start);
 for(const scenario of [{name:'inside',target:19.88,time:20.25,previous:19.88,loop:true},{name:'inside with delayed sample',target:19.88,time:20.25,previous:5,loop:true},{name:'escape',target:25,time:25,previous:19.8,loop:false},{name:'paused',target:19.88,time:20.25,previous:19.88,paused:true,loop:false},{name:'other tab',target:25,time:20.25,previous:19.88,other:true,loop:true}]){
  const calls=[],player={abA:10,abB:20,browserActiveTabId:'a',mediaKey:'video:a',generation:2,browserRate:1.25,browserPaused:!!scenario.paused,browserAdPlaying:false,cues:[],cues2:[],_ownSeekAt:Date.now()};
  player._ownSeek={target:scenario.target,tabId:scenario.other?'b':'a',key:scenario.other?'video:b':'video:a',generation:2};
  const context={player,browserQuickEditor:null,subtitleSourceTime:t=>t,applyBrowserSponsorSkip:()=>false,browserCommand:(command,time)=>{calls.push([command,time]);return Promise.resolve({ok:true});},applyPlaybackLearningPolicy(){},updateCueMeta(){},$:()=>({classList:{contains:()=>true}})};
  vm.runInNewContext(renderer.slice(start,end),context);context.renderBrowserCueAt(scenario.time,scenario.previous,!!scenario.paused);
  assert.deepEqual(calls,scenario.loop?[['seek',10]]:[],scenario.name);
 }
});

test('Browser seek intent follows only its tab and stale or failed replies cannot replace a newer intent',async()=>{
 const renderer=fs.readFileSync(require.resolve('../src/renderer/renderer.js'),'utf8'),start=renderer.indexOf('function browserCommand(command'),end=renderer.indexOf('async function maybeAutoSkipBrowserAd',start);
 const player={browserActiveTabId:'a',mediaKey:'video:a',generation:2};let release;
 const context={player,clearTimeout(){},window:{api:{browserCommand:async(_tab,command)=>command==='seek-relative'?new Promise(resolve=>release=resolve):{ok:true,media:{currentTime:5}}}}};vm.runInNewContext(renderer.slice(start,end),context);
 const pending=context.browserCommand('seek-relative',1);await Promise.resolve();await context.browserCommand('seek',19.88);const current=player._ownSeek;assert.equal(current.target,19.88);
 release({ok:true,media:{currentTime:12}});await pending;assert.equal(player._ownSeek,current);assert.equal(current.target,19.88,'old reply cannot replace current target');
 await context.browserCommand('seek',99,'b');assert.equal(player._ownSeek,current,'another tab never stamps the active loop');
 context.window.api.browserCommand=async()=>({ok:false});await context.browserCommand('seek',50);assert.equal(player._ownSeek,null);assert.equal(player._ownSeekAt,0);
  context.window.api.browserCommand=async()=>({ok:true,media:{currentTime:17.5}});await context.browserCommand('seek-relative',1);assert.equal(player._ownSeek.target,17.5,'relative/frame targets use the playback owner response');
  context.window.api.browserCommand=async()=>{throw Error('Bridge failed');};await assert.rejects(context.browserCommand('frame-step',1),/Bridge failed/);assert.equal(player._ownSeek,null);
});
