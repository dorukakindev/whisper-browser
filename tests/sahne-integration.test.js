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
  return { window, document, player, source, secondary, commands, setParser(parser) { context.parseSubtitles=parser; }, open(mode = 'podcast') { window.CinemaSahne.open({ mode }); return window.CinemaSahne.current.a; } };
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

test('closing shelf playback removes the scene instead of remounting an ownerless overlay',async t=>{
 const f=fixture(t);f.document.getElementById('playerLayer').classList.add('hidden');let live=true;
 f.window.MediaShelfUI={readSnapshot:()=>live?{mediaKey:'shelf:one',generation:1,title:'Episode',time:0,duration:30,paused:true,rate:1,capabilities:{seek:{support:'yes'}}}:null,isPodcastMode:()=>true,openPodcastMode:async()=>{},getTranscriptTracks:()=>[],executeExisting:async()=>({ok:true})};
 await f.window.CinemaSahne.openShelf();const scene=f.window.CinemaSahne.current;assert(scene);live=false;scene.o.onSource('none',{});assert.equal(f.window.CinemaSahne.current,null);assert.equal(f.document.querySelector('.sh-shelf-host'),null);
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
