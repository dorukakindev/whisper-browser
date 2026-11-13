'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync(require.resolve('../src/renderer/renderer.js'),'utf8');
const section=(from,to)=>source.slice(source.indexOf(from),source.indexOf(to,source.indexOf(from)));
function fixture(){
 const nodes=new Map(),started=[],loaded=[];
 const node=id=>{if(!nodes.has(id))nodes.set(id,{value:'',duration:600,currentTime:10,style:{},classList:{add(){},remove(){}},removeAttribute(){}});return nodes.get(id);};
 const player={workspaceMode:'player',mediaKey:'source:A',generation:1,localPath:'',subPath:'',sub2Path:'',subRole:'source',cues:[],cues2:[]};
 const ctx={console,queueMicrotask,player,state:{running:false,queueRunning:false},$:node,started,loaded,
  window:{api:{}},buildOptsFromUI:()=>({translate:false}),playerSubtitleCreationState:()=>({available:true,stream:{key:'source:A'}}),
  preparePlayerStreamWhisperAudio:async()=> 'A.wav',configureSpeechTranslation(){},optsProblem:()=>'',
  progressiveRanges:duration=>[{start:0,end:duration}],startProgressiveChunk:async job=>{started.push(job);},
  interfaceChoice:(_tr,en)=>en,logLine(){},updateBrowserWhisperActions(){},updatePlayerTaskCenter(){},
  currentGeneration:()=>player.generation,staleGeneration:gen=>gen!==player.generation,
  completedSubtitleOutputs:event=>({items:[event.output],source:event.output}),
  registerCompletedBrowserOutputs(){},addSubtitleOption(){},subtitleOutputContract:{outputLabel:()=> 'source'},
  loadSubtitle:async(file,secondary,options)=>{if(options?.isCancelled?.())return {ok:false,loaded:false};loaded.push({file,key:player.mediaKey,generation:player.generation,secondary});player.subPath=file;return {ok:true,loaded:true};},
  rememberPendingPlayerLoad(){},flushWatchState(){},friendlySystemError:message=>message};
 vm.createContext(ctx);
 vm.runInContext(section('async function startProgressivePlayerTranscription(', '// "Altyazı oluştur"'),ctx);
 vm.runInContext(section('async function attachCompletedJobSubtitlesCore(', 'async function retryPendingPlayerLoad('),ctx);
 return {ctx,player,started,loaded};
}

test('stream audio preparation cannot start an A transcription under B after an awaited handoff',async()=>{
 const f=fixture();f.ctx.preparePlayerStreamWhisperAudio=async()=>{queueMicrotask(()=>{f.player.mediaKey='source:B';f.player.generation=2;});return 'A.wav';};
 await f.ctx.startProgressivePlayerTranscription();
 assert.equal(f.started.length,0,'the caller must recheck source ownership after audio preparation');
 assert.equal(f.player.job,undefined);
});

test('unchanged stream owner still starts transcription from its prepared audio',async()=>{
 const f=fixture();await f.ctx.startProgressivePlayerTranscription();
 assert.equal(f.started.length,1);assert.equal(f.started[0].mediaKey,'source:A');assert.equal(f.started[0].baseOpts.input,'A.wav');
});

test('stream preparation honors cancellation and changed subtitle selection before starting Whisper',async()=>{
 for(const change of ['cancel','subtitle']){
  const f=fixture();let cancelled=false;
  f.ctx.preparePlayerStreamWhisperAudio=async()=>{queueMicrotask(()=>{if(change==='cancel')cancelled=true;else f.player.subPath='B-chosen.srt';});return 'A.wav';};
  await f.ctx.startProgressivePlayerTranscription({isCancelled:()=>cancelled});assert.equal(f.started.length,0,change);
 }
});

for(const kind of ['progressive','translate'])test(`${kind} output from an earlier generation cannot auto-attach after an A/B/A roundtrip`,async()=>{
 const f=fixture();f.player.generation=3;
 const result=await f.ctx.attachCompletedJobSubtitlesCore({output:{path:'A-old.srt',role:'source'}},{kind,mediaKey:'source:A',generation:1,selectedSubPath:'',secondSubPath:''});
 assert.equal(result.loaded,false,'the old generation must remain invalid even when the key matches again');
 assert.equal(f.loaded.length,0);
});

test('a completed current-generation subtitle remains attachable',async()=>{
 const f=fixture();const result=await f.ctx.attachCompletedJobSubtitlesCore({output:{path:'A-current.srt',role:'source'}},{kind:'progressive',mediaKey:'source:A',generation:1,selectedSubPath:'',secondSubPath:''});
 assert.equal(result.loaded,true);assert.equal(f.loaded.length,1);
});

test('explicit manual retry can attach the original media output after returning to that media',async()=>{
 const f=fixture();f.player.generation=3;
 const result=await f.ctx.attachCompletedJobSubtitlesCore({output:{path:'A-chosen.srt',role:'source'}},{kind:'progressive',mediaKey:'source:A',generation:1,selectedSubPath:'',secondSubPath:''},{force:true});
 assert.equal(result.loaded,true);assert.equal(f.loaded.length,1);
});

test('even a manual retry cannot attach if its media changes while the subtitle read waits',async()=>{
 const f=fixture();let release;
 f.ctx.loadSubtitle=(file,_secondary,options)=>new Promise(resolve=>release=()=>{if(options.isCancelled())resolve({ok:false,loaded:false});else{f.loaded.push(file);f.player.subPath=file;resolve({ok:true,loaded:true});}});
 const pending=f.ctx.attachCompletedJobSubtitlesCore({output:{path:'A-chosen.srt',role:'source'}},{kind:'progressive',mediaKey:'source:A',generation:1,selectedSubPath:'',secondSubPath:''},{force:true});
 assert(release);f.player.mediaKey='source:B';f.player.generation=2;release();
 assert.equal((await pending).loaded,false);assert.equal(f.loaded.length,0);
});

test('a failed old translation start cannot clear the newer source job or options',async()=>{
 const f=fixture();f.player.subPath='A.srt';f.player.cues=[{start:0,end:1,text:'Fixture'}];f.player.browserTracks=[];
 f.ctx.state.outputFiles=['A.srt'];f.ctx.browserTrackSourceLanguage=()=>'';f.ctx.clearPendingRetranslateIntent=()=>{};f.ctx.updateMakeTransState=()=>{};
 let release;f.ctx.startTranscribeSafe=()=>new Promise(resolve=>release=resolve);
 vm.runInContext(section('async function startPlayerSubtitleTranslation(', "if ($('makeTransBtn'))"),f.ctx);
 const pending=f.ctx.startPlayerSubtitleTranslation();assert(release);
 const next={mediaKey:'source:B',generation:2,kind:'progressive',running:true};f.player.mediaKey='source:B';f.player.generation=2;f.player.job=next;
 f.ctx.state.outputFiles=['B.srt'];f.ctx.state.forceRetranslate=true;
 release({ok:false,error:'Old source cancelled'});await pending;
 assert.equal(f.player.job,next);assert.equal(f.ctx.state.running,true);assert.deepEqual(f.ctx.state.outputFiles,['B.srt']);assert.equal(f.ctx.state.forceRetranslate,true);
});

test('late live subtitle events cannot repopulate a returned media generation',()=>{
 for(const type of ['segment','preview_refresh','translation_chunk','translation_refresh']){
  const f=fixture();f.player.generation=3;
  f.player.job={kind:'progressive',running:true,mediaKey:'source:A',generation:1,liveSource:[],liveTranslation:new Map(),ranges:[{start:0,end:600}],rangeIndex:0};
  Object.assign(f.ctx,{liveSegments:event=>event.segments,mergeLiveCues:(before,after)=>[...before,...after],replaceLiveCuesForRefresh:(_before,after)=>after, cueKey:cue=>cue.start,
   scheduleLiveCueRender(){},scheduleBrowserOverlaySync(){}});
  vm.runInContext(section('function playerJobEvent(', 'function settlePlayerJobBar('),f.ctx);
  f.ctx.playerJobEvent({type,segments:[{start:1,end:2,text:'Old source speech'}]});
  assert.equal(f.player.cues.length,0,type);assert.equal(f.player.cues2.length,0,type);
 }
});

test('current-generation live subtitle events still populate source and translation tracks',()=>{
 const f=fixture();f.player.job={kind:'progressive',running:true,mediaKey:'source:A',generation:1,liveSource:[],liveTranslation:new Map(),ranges:[{start:0,end:600}],rangeIndex:0};
 Object.assign(f.ctx,{liveSegments:event=>event.segments,mergeLiveCues:(before,after)=>[...before,...after],cueKey:cue=>cue.start,scheduleLiveCueRender(){},scheduleBrowserOverlaySync(){}});
 vm.runInContext(section('function playerJobEvent(', 'function settlePlayerJobBar('),f.ctx);
 for(const type of ['segment','translation_chunk'])f.ctx.playerJobEvent({type,segments:[{start:1,end:2,text:'Current speech'}]});
 assert.equal(f.player.cues.length,1);assert.equal(f.player.cues2.length,1);
});

test('old-generation progressive completion cannot rewrite files or replace quality cues',async()=>{
 const f=fixture(),writes=[];f.player.generation=3;f.player.cueQualitySource=[{text:'Current quality cues'}];
 const job=f.player.job={kind:'progressive',running:true,mediaKey:'source:A',generation:1,liveSource:[{start:1,end:2,text:'Old speech'}],liveTranslation:new Map(),sourceFile:'A-old.srt'};
 f.ctx.state.previewSegs=[];
 Object.assign(f.ctx,{mergeLiveCues:(_a,b)=>b,previewTimeKey:()=>'',cuesToSrt:()=> 'Fixture SRT',subtitleStatFor:()=>null,noteSubtitleStat(){},
  attachCompletedJobSubtitles:async()=>({loaded:false,reason:'Old source'}),updateMakeTransState(){},updatePlayerAutoSyncState(){},settlePlayerJobBar(){},refreshHistory(){}});
 f.ctx.window.api.writeSubtitle=async file=>{writes.push(file);return {ok:true};};
 vm.runInContext(section('async function finishProgressiveJob(', 'async function handleProgressiveTerminal('),f.ctx);
 await f.ctx.finishProgressiveJob(job);
 assert.deepEqual(writes,[]);assert.equal(f.player.cueQualitySource[0].text,'Current quality cues');
});

test('a delayed dual-only output cannot inherit the same selected path on a new source',async()=>{
 const f=fixture();let release;const dual={path:'shared-dual.srt',role:'dual'};
 f.ctx.completedSubtitleOutputs=()=>({items:[dual],dual});
 f.ctx.loadSubtitle=()=>new Promise(resolve=>release=()=>resolve({ok:false,loaded:false}));
 f.ctx.rememberPendingPlayerLoad=(_event,job)=>{f.ctx.state.pendingPlayerLoad={job};};
 const pending=f.ctx.attachCompletedJobSubtitlesCore({output:dual},{kind:'progressive',mediaKey:'source:A',generation:1,selectedSubPath:'',secondSubPath:''});
 assert(release);f.player.mediaKey='source:B';f.player.generation=2;f.player.subPath=dual.path;
 const nextPending={owner:'B'};f.ctx.state.pendingPlayerLoad=nextPending;release();
 const result=await pending;assert.equal(result.loaded,false);assert.equal(f.ctx.state.pendingPlayerLoad,nextPending,'an old rejected load must not clear or replace B pending state');
});

test('completed old-generation work settles without leaving the new source busy or attaching its output',async()=>{
 const f=fixture();f.player.generation=3;f.ctx.state.running=true;
 f.player.job={kind:'progressive',running:true,awaitingExit:true,mediaKey:'source:A',generation:1,ranges:[{}],rangeIndex:0,outputFiles:['A-saved.srt']};
 let finished=0,preserved=0,attached=0;
 Object.assign(f.ctx,{setTimeout:fn=>{fn();return 1;},finishRun:()=>finished++,rememberPendingPlayerLoad:()=>preserved++,finishProgressiveJob:async()=>attached++});
 vm.runInContext(section('async function handleProgressiveTerminal(', 'function playerJobEvent('),f.ctx);
 await f.ctx.handleProgressiveTerminal({type:'done',files:['A-saved.srt']},f.player.job);
 await f.ctx.handleProgressiveTerminal({type:'exit',code:0},f.player.job);
 assert.equal(finished,1);assert.equal(preserved,1);assert.equal(attached,0);assert.equal(f.ctx.state.running,false);assert.equal(f.player.job.running,false);
});
