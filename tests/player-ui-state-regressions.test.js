'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { JSDOM } = require('jsdom');
const Catalog = require('../src/player-source-catalog');
const fs=require('node:fs'),vm=require('node:vm');
test('stream audio preparation keeps playback owner and rejects a stale completion',async()=>{
 const text=fs.readFileSync(require.resolve('../src/renderer/renderer.js'),'utf8'),start=text.indexOf('async function preparePlayerStreamWhisperAudio('),end=text.indexOf('async function startProgressivePlayerTranscription(',start);
 assert(start>=0,'stream audio preparation must be available to the Whisper action');
 const nodes=new Map(),calls=[];let finish,watch;
 const player={mediaKey:'stream:one',generation:4,localPath:'',subPath:'',sub2Path:''},state={running:false};
 const ctx={player,state,Date,Number,String,setInterval:fn=>(watch=fn,1),clearInterval(){},interfaceChoice:(_tr,en)=>en,
  window:{api:{stremio:async input=>{calls.push(input);if(input.action==='audio-prepare')return new Promise(r=>finish=r);return {ok:true};}}},
  $:id=>{if(!nodes.has(id))nodes.set(id,{classList:{add(){},remove(){}},style:{},removeAttribute(){}});return nodes.get(id);},syncSubtitlePrimaryAction(){},osd(){},updatePlayerTaskCenter(){}};
 vm.createContext(ctx);vm.runInContext(text.slice(start,end),ctx);
 const source={token:'issued-token',streamId:'issued-source',key:player.mediaKey};
 const first=ctx.preparePlayerStreamWhisperAudio(source);assert(state.running);assert.equal(player.job.kind,'stream-audio');
 finish({ok:true,path:'audio.wav',key:source.key});assert.equal(await first,'audio.wav');assert.equal(player.localPath,'');assert.equal(state.running,false);
 const stale=ctx.preparePlayerStreamWhisperAudio(source);player.generation++;await watch();finish({ok:true,path:'old.wav',key:source.key});assert.equal(await stale,null);assert(calls.some(r=>r.action==='audio-cancel'));assert.equal(state.running,false);
 const cancel=ctx.preparePlayerStreamWhisperAudio(source);await player.job.cancel();finish({ok:false,code:'AUDIO_CANCELLED'});assert.equal(await cancel,null);assert.equal(state.running,false);
 // The existing transcription owner receives the prepared audio without reopening playback.
 let transcription;
 Object.assign(ctx,{playerSubtitleCreationState:()=>({available:true,stream:source}),preparePlayerStreamWhisperAudio:async()=> 'prepared.wav',
  buildOptsFromUI:()=>({translate:false}),configureSpeechTranslation(){},optsProblem:()=>'',progressiveRanges:duration=>[{start:0,end:duration}],
  startProgressiveChunk:async job=>{transcription=job;},logLine(){},updateBrowserWhisperActions(){}});
 player.workspaceMode='player';nodes.get('playerVideo')||ctx.$('playerVideo');Object.assign(nodes.get('playerVideo'),{duration:120,currentTime:30});
 const transcribeEnd=text.indexOf('// "Altyazı oluştur"',end);vm.runInContext(text.slice(end,transcribeEnd),ctx);
 await ctx.startProgressivePlayerTranscription({translateOverride:false});assert.equal(transcription.baseOpts.input,'prepared.wav');assert.equal(transcription.mediaKey,'stream:one');assert.equal(transcription.baseOpts.translate,false);assert.equal(player.localPath,'');assert.equal(transcription.ranges[0].end,120);
});
function setup(t) {
  const dom = new JSDOM('<!doctype html><body><main></main>', { pretendToBeVisual: true });
  t.after(() => dom.window.close());
  global.window = dom.window; global.document = dom.window.document; global.Node = dom.window.Node;
  dom.window.matchMedia = () => ({ matches: true });
  return { w: dom.window, root: document.querySelector('main') };
}
function catalogVm(query = {}) {
  const sources = [{ sourceId: 'pod:one', kind: 'podcast', title: 'Program' }];
  const items = [{ itemId: 'ep:one', sourceId: 'pod:one', kind: 'podcast', title: 'Episode', durationSeconds: 90 }];
  const normalized = Catalog.normalizeQuery(query);
  return { locale: 'tr', kind: 'podcast', sources, pinned: [], query: normalized,
    result: Catalog.queryPlayerItems({ batch: { items, revision: 'one' }, query: normalized }), shown: 1 };
}

test('global cancel including Escape routes stream audio to its acquisition owner',async()=>{
 const text=fs.readFileSync(require.resolve('../src/renderer/renderer.js'),'utf8'),from=text.indexOf("$('cancelBtn').addEventListener('click', async () => {"),to=text.indexOf('\nfunction finishRun(',from);
 let cancelHandler,audioCancels=0,pythonCancels=0;
 const ctx={state:{running:true},player:{job:{kind:'stream-audio',running:true}},
  $:id=>id==='cancelBtn'?{addEventListener:(_type,fn)=>{cancelHandler=fn;},classList:{add(){}}}:id==='playerJobCancel'?{click:()=>audioCancels++}:{classList:{add(){},remove(){}}},
  window:{api:{cancelTranscribe:async()=>{pythonCancels++;return {ok:false,error:'Çalışan iş yok.'};}}},playerJobEvent(){},finishRun(){},logLine(){}};
 vm.runInNewContext(text.slice(from,to),ctx);await cancelHandler();assert.equal(audioCancels,1);assert.equal(pythonCancels,0,'audio preparation is not a Python transcription process yet');
});
test('podcast filters display actual matching episodes and their empty result', t => {
  const { root } = setup(t), UI = require('../src/renderer/player-source-catalog-ui');
  UI.renderCatalog(root, catalogVm({ durations: ['under10'] }), {});
  assert.equal(root.querySelector('.pw-programs'), null);
  assert.equal(root.querySelector('.pw-episode .pw-row__title').textContent, 'Episode');
  UI.renderCatalog(root, catalogVm({ durations: ['60plus'] }), {});
  assert.equal(root.querySelector('.pw-programs'), null);
  assert.ok(root.querySelector('.pw-empty'));
  UI.renderCatalog(root, catalogVm(), {});
  assert.ok(root.querySelector('.pw-programs'), 'unfiltered overview retains program grid');
});
test('retained catalog search uses the latest render owner', t => {
  const { w, root } = setup(t), UI = require('../src/renderer/player-source-catalog-ui'), calls = [];
  UI.renderCatalog(root, catalogVm(), { onQuery: patch => calls.push(['old', patch.text]) });
  const input = root.querySelector('.pw-search__input');
  UI.renderCatalog(root, catalogVm(), { onQuery: patch => calls.push(['current', patch.text]) });
  assert.equal(root.querySelector('.pw-search__input'), input, 'keep IME and cursor owner');
  input.value = 'latest'; input.dispatchEvent(new w.KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
  assert.deepEqual(calls, [['current', 'latest']]);
});
test('copy and focus keys preserve transcript follow; manual scrolling pauses it', t => {
  const { w, root } = setup(t), UI = require('../src/renderer/player-workspace-ui'), calls = [];
  const vm = { locale: 'tr', media: { title: 'Video' }, snapshot: { time: 0, duration: 60, paused: true, rate: 1 }, rows: [], tab: 'transcript', stageMode: 'slot', subtitleMode: 'both' };
  UI.renderPlayerWorkspace(root, vm, { onFollow: value => calls.push(value) });
  const list = root.querySelector('.pw-transcript');
  for (const key of ['c', 'Tab', 'Escape', 'Enter']) list.dispatchEvent(new w.KeyboardEvent('keydown', { key, ctrlKey: key === 'c', bubbles: true }));
  assert.deepEqual(calls, [], 'copy and focus changes must not pause following');
  list.dispatchEvent(new w.KeyboardEvent('keydown', { key: 'PageDown', bubbles: true }));
  list.dispatchEvent(new w.Event('wheel', { bubbles: true }));
  assert.deepEqual(calls, [false, false]);
});
