'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const {JSDOM}=require('jsdom');
const dom=new JSDOM('<div id="playerLayer" class="workspace-browser"><details id="appModeMenu"><div role="menu"></div></details><div id="playerSide"><div class="bp-title"><h2></h2></div><section class="browser-study"><h3 class="browser-study-title"></h3><p class="browser-study-status"></p><div class="browser-study-actions"></div><div class="browser-study-second"></div></section></div><section class="sh-browser-study"><section class="browser-study"></section></section><video id="web"></video></div>');
const {window}=dom,{document}=window;const commands=[];let speedChange,opened=false,modeOptions,menuCloses=0,studyOpens=0;
let commandResult = () => ({ok:true});
const player={workspaceMode:'browser',browserActiveTabId:'a',mediaKey:'browser:one',generation:1,browserTime:14,browserDuration:100,browserRate:1.25,browserPaused:true,browserMediaSeen:true,cues:[{id:'a',start:0,end:4,text:'Past'},{id:'b',start:10,end:14,text:'Future'}],cues2:[{id:'x',start:1,end:5,text:'Geçmiş'}],browserTracks:[{id:'en'},{id:'tr'}],browserLoadedTrackId:'en',browserLoadedTrackId2:'tr'};
window.UiLocale={get:()=> 'tr'};window.BrowserStudy={open:options=>{studyOpens++;opened=true;modeOptions=options;},isActive:()=>opened};
window.PlayerWorkspaceModel=require('../src/renderer/player-workspace-model');window.PlayerUiKit={select:config=>{speedChange=config.onChange;const wrap=document.createElement('span');wrap.trigger=document.createElement('button');wrap.append(wrap.trigger);return wrap;}};
let transformReads=0;
const transformFor=secondary=>{transformReads++;return {scale:2,offsetSeconds:secondary?7:5};};
const context=vm.createContext({window,document,player,queueMicrotask,MutationObserver:window.MutationObserver,subtitleVideoTransform:transformFor,browserTabState:()=>({mediaId:player.mediaKey}),
 closeBrowserToolbarMenus:()=>menuCloses++,browserSubtitleRoleCues:()=>({source:player.cues,translation:player.cues2}),subtitleVideoTime:(time,secondary,frozen)=>require('../src/browser-subtitle-sync').sourceToVideoTime(time,frozen||transformFor(secondary)),
 browserSubtitleSync:{hashText:text=>require('node:crypto').createHash('sha256').update(text).digest('hex')},currentBrowserYoutubeUrl:()=>'',
 browserCommand:async(type,value,tab)=>{commands.push({type,value,tab});return commandResult(type);}});
vm.runInContext(fs.readFileSync(require.resolve('../src/renderer/browser-podcast'),'utf8'),context);
const ui=window.BrowserPodcastUI,video=document.getElementById('web');
ui.setMode(true);assert.equal(document.querySelector('.sh-browser-study .browser-podcast-controls'),null,'legacy controls never attach to the common surface');assert.equal(modeOptions?.preservePodcast,true,'podcast entry preserves its explicit view intent');assert.equal(ui.isActive(),true);assert.equal(commands.length,0,'view switch starts no video/audio/processing');assert.equal(player.browserTime,14);assert.equal(player.browserRate,1.25);assert.equal(document.getElementById('web'),video);assert.equal(document.querySelectorAll('video').length,1);
ui.setMode(false);ui.setMode(true);assert.equal(studyOpens,1,'view switching keeps the existing browser study session');
transformReads=0;const tracks=ui.getTranscriptTracks();assert.equal(transformReads,2,'source proof resolves once per channel, not per cue endpoint');const snap=ui.snapshot();assert.equal(tracks[0].cues[1].start,25);assert.equal(tracks[1].cues[0].start,9,'independent secondary drift/offset is retained');
const evidence=require('../src/assistant-source-context').freezePodcast(snap,tracks,'watched');assert.equal(evidence.transcript_evidence.evidence.length,1);assert.equal(evidence.transcript_evidence.evidence[0].metin,'Past');assert.equal(evidence.podcastAnchor.time,14);
(async()=>{
 const command={type:'seekCue',mediaKey:snap.mediaKey,generation:snap.generation,trackId:snap.sourceTrack.id,trackRevision:snap.sourceTrack.revision,cueId:'b'};
 assert.equal((await ui.execute(command)).ok,true);assert.equal(commands.at(-1).value,25.01);
 const replay = { ...command, type: 'replay' };
 player.browserTime = 6;
 let replayStart = commands.length;
 commandResult = () => ({ok:false,code:'seek-denied'});
 assert.equal((await ui.execute(replay)).code, 'seek-denied');
 assert.deepEqual(commands.slice(replayStart).map(row => row.type), ['seek'], 'failed seek never starts playback');
 replayStart = commands.length;
 let finishSeek;
 commandResult = () => new Promise(resolve => { finishSeek = resolve; });
 const pendingReplay = ui.execute(replay);
 assert.equal(typeof finishSeek, 'function');
 player.browserActiveTabId = 'b';
 finishSeek({ok:true});
 await pendingReplay;
 assert.deepEqual(commands.slice(replayStart).map(row => row.type), ['seek'], 'late seek never plays the replacement tab');
 player.browserActiveTabId = 'a';
 commandResult = () => ({ok:true});
 // All positions below are video-clock positions after per-track drift/offset.
 for(const [time,type,target] of [[15,'nextCue',25.01],[15,'previousCue',5.01],[40,'previousCue',25.01],[2,'nextCue',5.01],[2,'previousCue',5.01]]){
  player.browserTime=time;const current=ui.snapshot();
  const result=await ui.execute({type,mediaKey:current.mediaKey,generation:current.generation,trackId:current.sourceTrack.id,trackRevision:current.sourceTrack.revision});
  assert.equal(result.ok,true,type+' at '+time);assert.equal(commands.at(-1).value,target,type+' must use its chronological neighbour at '+time);
 }
 for(const [time,type] of [[40,'nextCue'],[15,'replay']]){
  player.browserTime=time;const current=ui.snapshot(),before=commands.length;
  assert.equal((await ui.execute({type,mediaKey:current.mediaKey,generation:current.generation,trackId:current.sourceTrack.id,trackRevision:current.sourceTrack.revision})).ok,false);
  assert.equal(commands.length,before,'no unrelated fallback cue may be sought');
 }
 // Overlapping captions choose the latest speaking cue, not the first match.
 const originalEnd=player.cues[0].end;player.cues[0].end=20;player.browserTime=27;
 {const current=ui.snapshot();await ui.execute({type:'replay',mediaKey:current.mediaKey,generation:current.generation,trackId:current.sourceTrack.id,trackRevision:current.sourceTrack.revision});assert.equal(commands.at(-1).type,'play');assert.equal(commands.at(-2).value,25.01);}
 player.cues[0].end=originalEnd;
 player.browserTime=6;
 // Very short cues land inside their true interval; malformed/out-of-media cues do not seek.
 player.cues.push({id:'tiny',start:30,end:30.002,text:'Brief'},{id:'tiny-next',start:30.002,end:30.004,text:'Next brief'},{id:'invalid',start:35,end:34,text:'Invalid'},{id:'outside',start:51,end:52,text:'Outside'});
 for(const cueId of ['tiny','invalid','outside']){
  const current=ui.snapshot(),before=commands.length,result=await ui.execute({type:'seekCue',cueId,mediaKey:current.mediaKey,generation:current.generation,trackId:current.sourceTrack.id,trackRevision:current.sourceTrack.revision});
  if(cueId==='tiny'){assert.equal(result.ok,true);assert(commands.at(-1).value>65&&commands.at(-1).value<65.004,'landing stays inside a short mapped cue');}
  else{assert.equal(result.ok,false);assert.equal(commands.length,before,'invalid timing never reaches the browser owner');}
 }
 player.browserTime=65.001;
 {const current=ui.snapshot();await ui.execute({type:'nextCue',mediaKey:current.mediaKey,generation:current.generation,trackId:current.sourceTrack.id,trackRevision:current.sourceTrack.revision});assert(commands.at(-1).value>65.004&&commands.at(-1).value<65.008,'closely spaced cues are not skipped by a fixed tolerance');}
 player.cues.splice(-4);player.browserTime=6;
 const oldRevision=snap.sourceTrack.revision;player.cues[0].text='Edited';assert.notEqual(ui.snapshot().sourceTrack.revision,oldRevision);assert.equal((await ui.execute(command)).code,'stale-track');
 const speed=document.querySelector('.browser-podcast-speed');speed.trigger.click();player.generation++;const before=commands.length;speedChange('1.5');assert.equal(commands.length,before,'old speed menu cannot change another generation');
 player.mediaKey='browser:replacement';assert.equal(ui.isActive(),false);player.mediaKey='browser:one';assert.equal(ui.isActive(),true);
 player.browserActiveTabId='b';assert.equal(ui.isActive(),false);assert.equal((await ui.execute(command)).code,'stale-source');
 { // A replay whose seek is still pending must not resume playback after the user moved to another tab.
  ui.setMode(true);player.browserActiveTabId='a';player.mediaKey='browser:one';player.browserPaused=true;player.browserTime=6;
  let release;commandResult=type=>type==='seek'?new Promise(resolve=>{release=()=>resolve({ok:true});}):{ok:true};
  const now=ui.snapshot(),before=commands.length,pending=ui.execute({type:'replay',mediaKey:now.mediaKey,generation:now.generation,trackId:now.sourceTrack.id,trackRevision:now.sourceTrack.revision});await new Promise(resolve=>setImmediate(resolve));
  assert.equal(commands.length,before+1,'the replay issued its seek');assert.equal(commands.at(-1).type,'seek');assert.equal(commands.at(-1).tab,'a','the pending seek is addressed to its own tab');
  player.browserActiveTabId='b';release();await pending;
  assert(!commands.slice(before).some(row=>row.type==='play'),'no playback is started after the tab changed');
  commandResult=()=>({ok:true});
 }
 ui.setMode(true);player.browserPageUrl='https://open.spotify.com/episode/test';assert.equal(ui.snapshot().capabilities.ASR.support,'no');
 const previousCloses=menuCloses;ui.setMode(false);assert(menuCloses>previousCloses,'menu exit closes the originating menu too');assert.equal(ui.isActive(),false);assert.equal(document.getElementById('web'),video);dom.window.close();console.log('browser-podcast: existing owner/position/rate, mapped bilingual clocks, bounded assistant evidence, stale actions and Spotify boundary OK');
})().catch(error=>{console.error(error);dom.window.close();process.exitCode=1;});
