'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync(require.resolve('../src/renderer/player-source-catalog-integration.js'),'utf8');

test('saved Whisper timing reopens its verified audio copy instead of leaving the same episode read-only',async()=>{
 const old={entryId:'A',episodeIdentity:'episode-A',mediaKey:'rss:A',generation:2,sourceVersion:'stream'},player={workspaceAudio:old,mediaKey:'rss:A',generation:2};
 const saved={sourceVersion:'verified',workspace:{transcript:{state:'timed',provenance:'asr',text:'saved srt',timeline:{sha256:'audio-sha'}}}},opens=[];
 const context={player,t:(_tr,en)=>en,document:{getElementById:()=>({paused:true,classList:{contains:()=>true}})},parseSubtitles:()=>[{text:'Saved words'}],window:{PlayerWorkspaceIntegration:{refresh(){}}},
  api:async q=>q.action==='podcast-exact-audio'?{available:true,sourceVersion:'verified',sourceBinding:{episodeIdentity:'episode-A',sha256:'audio-sha'}}:saved,
  openPodcastEntry:async(id,options)=>{opens.push({id,options});player.mediaKey='copy:A';player.generation=3;player.workspaceAudio={...old,mediaKey:player.mediaKey,generation:3,sourceVersion:'verified',exactAudio:true,transcriptState:'timed',sourceBinding:{sha256:'audio-sha'}};}};
 vm.runInNewContext(source.slice(source.indexOf('  const savedPodcastResultLoads='),source.indexOf('  function podcastTools('))+';globalThis.load=loadSavedPodcastResult;',context);
 const result=await context.load();assert.equal(opens.length,1);assert.equal(opens[0].options.exactVersion,'verified');assert.equal(opens[0].options.preserveView,true);assert.equal(opens[0].options.autoplay,false);assert.equal(player.workspaceAudio.transcriptState,'timed');assert.equal(result.playbackHandoff.previous.mediaKey,'rss:A');assert.equal(result.playbackHandoff.current.generation,3);
});

test('a missing or different verified copy cannot enable Whisper seeking or replace a newer playback owner',async()=>{
 for(const reason of ['missing','different-episode','late']){
  const audio={entryId:'A',episodeIdentity:'episode-A',mediaKey:'rss:A',generation:2,sourceVersion:'stream'},player={workspaceAudio:audio,mediaKey:'rss:A',generation:2};let opens=0;
  const saved={sourceVersion:'verified',workspace:{transcript:{state:'timed',provenance:'asr',text:'stored',timeline:{sha256:'audio-sha'}}}};
  const context={player,t:(_tr,en)=>en,parseSubtitles:()=>[{text:'Saved words'}],window:{PlayerWorkspaceIntegration:{refresh(){}}},openPodcastEntry:async()=>{opens++;},api:async q=>{if(q.action!=='podcast-exact-audio')return saved;if(reason==='late')player.generation++;return {available:reason!=='missing',sourceVersion:'verified',sourceBinding:{episodeIdentity:reason==='different-episode'?'other':'episode-A',sha256:'audio-sha'}};}};
  vm.runInNewContext(source.slice(source.indexOf('  const savedPodcastResultLoads='),source.indexOf('  function podcastTools('))+';globalThis.load=loadSavedPodcastResult;',context);await context.load();assert.equal(opens,0);assert.notEqual(audio.transcriptState,'timed');assert.equal(audio.sourceVersion,'stream');
 }
});
function publisherFixture({timed=false,translation=null}={}){
 const audio={entryId:'A',revision:'one',mediaKey:'rss:A',generation:2,sourceVersion:'v1',transcriptState:'untimed',transcriptText:'Old source',translationText:'Old translation',transcriptTimingNotice:'Old range notice',transcriptCoverage:{start:30,end:42},translationRetry:{canRetry:true}};
 const player={workspaceAudio:audio,mediaKey:audio.mediaKey,generation:2,subPath:'old.srt',cues2:[{text:'Old timed translation'}]},loads=[];
 const transcript={state:timed?'timed':'untimed',text:'New publisher source',format:timed?'srt':'plain',provenance:'publisher'},saved={sourceVersion:'v1',workspace:{transcript,...(translation?{translation}:{})},translationRetry:null};
 const context={player,t:(_tr,en)=>en,api:async request=>request.action==='podcast-transcript'?{timed:timed?'yes':'no',text:transcript.text}:request.action==='podcast-materialize'?{path:request.role==='translation'?'current-translation.srt':'current-source.srt'}:saved,loadSubtitle:async(path,secondary)=>{loads.push({path,secondary});if(secondary)player.cues2=path?[{text:'Current timed translation'}]:[];else player.subPath=path;},window:{PlayerWorkspaceIntegration:{refresh(){}}}};
 const start=source.indexOf('  async function loadPublisherTranscript('),end=source.indexOf('  async function translatePodcastTranscript(',start);vm.runInNewContext(source.slice(start,end)+';globalThis.load=loadPublisherTranscript;',context);
 return {audio,player,loads,context,saved,transcript};
}
for(const timed of [false,true])test(`new ${timed?'timed':'untimed'} publisher transcript retires old translation and range evidence`,async()=>{
 const f=publisherFixture({timed});await f.context.load(1);
 assert.equal(f.audio.translationText,undefined);assert.equal(f.audio.transcriptCoverage,undefined);assert.equal(f.audio.transcriptTimingNotice,undefined);assert.equal(f.audio.translationRetry,null);assert.equal(f.player.cues2.length,0);
 assert.equal(f.audio.transcriptState,timed?'timed':'untimed');if(!timed)assert.equal(f.audio.transcriptText,'New publisher source');
});
test('reloading the same publisher source restores its current registry translation',async()=>{
 const f=publisherFixture({translation:{state:'untimed',text:'Matching translation',status:'complete'}});f.audio.transcriptText=f.transcript.text;f.audio.translationText='Matching translation';await f.context.load(0);assert.equal(f.audio.translationText,'Matching translation');
 const timed=publisherFixture({timed:true,translation:{state:'timed',text:'Current timed translation',status:'complete'}});await timed.context.load(0);assert(timed.loads.some(load=>load.path==='current-translation.srt'&&load.secondary));assert.equal(timed.player.cues2[0].text,'Current timed translation');
});
test('failed or stale publisher loading leaves the accepted transcript and translation intact',async()=>{
 for(const failure of ['request','workspace','source-load','stale']){
  const f=publisherFixture({timed:failure==='source-load'}),before=JSON.stringify(f.audio),api=f.context.api;
  f.context.api=async request=>{if(failure==='request')throw Error('Publisher failed');if(failure==='workspace'&&request.action==='podcast-workspace')throw Error('Registry failed');const result=await api(request);if(failure==='stale')f.player.generation++;return result;};
  if(failure==='source-load')f.context.loadSubtitle=async()=>{};
  if(failure==='stale')await f.context.load(1);else await assert.rejects(f.context.load(1));assert.equal(JSON.stringify(f.audio),before,failure);assert.equal(f.player.cues2[0].text,'Old timed translation');
 }
});
test('Saved RSS output uses timed loading for a matching source and otherwise becomes read-only',async()=>{
 const audio={entryId:'A',mediaKey:'rss:A',generation:2,sourceVersion:'remote-unknown'},requests=[],loads=[],modes=[];const player={workspaceAudio:audio,mediaKey:'rss:A',generation:2};
 let saved={sourceVersion:'download-sha',workspace:{transcript:{state:'timed',text:'srt',status:'complete'}}};
 const context={player,t:(_tr,en)=>en,api:async input=>{requests.push(input);return input.action==='podcast-materialize'?{path:'managed.srt'}:saved;},parseSubtitles:()=>[{start:1,end:2,text:'Stored result'}],loadSubtitle:async(...args)=>{loads.push(args);player.subPath=args[0];},window:{PlayerWorkspaceIntegration:{setPodcastMode:value=>modes.push(value),refresh(){}}}};
 const start=source.indexOf('  const savedPodcastResultLoads='),end=source.indexOf('  function podcastTools(',start);vm.runInNewContext(source.slice(start,end)+';globalThis.load=loadSavedPodcastResult;',context);
 await context.load();assert.equal(audio.transcriptState,'untimed');assert.equal(audio.transcriptText,'Stored result');assert.match(audio.transcriptTimingNotice,/Read-only/);assert.equal(loads.length,0);assert.equal(audio.sourceVersion,'remote-unknown');assert.equal(modes.length,0,'loading saved text preserves the explicitly selected player view');
 audio.sourceVersion='download-sha';const load=context.loadSubtitle;
 context.loadSubtitle=async()=>{};await assert.rejects(context.load(),/selection changed/);assert.equal(audio.transcriptState,'untimed');
 context.loadSubtitle=load;await context.load();assert.equal(audio.transcriptState,'timed');assert.equal(loads.length,1);assert.equal(requests.at(-1).action,'podcast-materialize');assert.equal(audio.transcriptTimingNotice,undefined);assert.equal(audio.transcriptText,undefined);
 saved.workspace.translation={state:'untimed',text:'translated',status:'complete'};await context.load('translation');assert.equal(modes.length,0,'loading a translation also preserves the selected view');
 saved.workspace.transcript.status='partial';await context.load();assert.equal(audio.transcriptState,'timed');assert.equal(loads.length,2);
 saved.workspace.transcript.status='complete';saved.workspace.transcript.provenance='asr';await context.load();assert.equal(audio.transcriptState,'untimed','a cached download hash does not verify a newly opened RSS stream');assert.equal(loads.length,2);
});
test('Spotify confirmation exposes explicit RSS open without playback until the open action',async()=>{
 class Element{constructor(tag){this.tag=tag;this.children=[];this.dataset={};this.listeners={};this.isConnected=true;this.textContent='';}append(...nodes){this.children.push(...nodes);}replaceChildren(...nodes){this.children=nodes;}setAttribute(){}addEventListener(event,fn){this.listeners[event]=fn;}showModal(){this.open=true;}close(){this.open=false;this.listeners.close?.();}remove(){this.isConnected=false;}}
 const body=new Element('body'),document={body,createElement:tag=>new Element(tag),createTextNode:text=>({textContent:text})};
 const player={mediaKey:'spotify:one',generation:1,workspaceMode:'browser',workspaceAudio:null};const requests=[],plays=[];
 const context={player,document,t:(_tr,en)=>en,window:{PlayerUiKit:{bindDialog(){}},MediaHomeUI:{}},api:async request=>{requests.push(request);if(request.action==='podcast-spotify-preview')return {title:'Episode',token:'preview',candidates:[{entryId:'rss:A',title:'Candidate',publisher:'Publisher',assessment:{confidence:'high'}}]};return {entry:{transcriptDescriptors:[]}};},play:async(item,mode)=>{plays.push([item,mode]);player.workspaceAudio={entryId:item.entry.id,mediaKey:player.mediaKey,generation:player.generation};},generatePodcast(){},loadPublisherTranscript(){},loadSavedPodcastResult(){},startPlayerSubtitleTranslation(){},podcastRequest:null};
 const start=source.indexOf('  function podcastTools('),end=source.indexOf('  const podcastButton=',start);vm.runInNewContext(source.slice(start,end)+';globalThis.open=podcastTools;',context);
 const find=(root,label)=>{if(root.textContent===label)return root;for(const node of root.children||[]){const match=find(node,label);if(match)return match;}return null;};
 context.open();const dialog=body.children[0];await find(dialog,'Match Spotify episode to RSS').onclick();const candidate=find(dialog,'Candidate · Publisher · High similarity');assert(candidate);await candidate.onclick();assert.equal(plays.length,0);assert(requests.some(request=>request.action==='podcast-spotify-confirm'));const open=find(dialog,'Open matched RSS episode');assert(open);await open.onclick();assert.equal(plays.length,1);assert.equal(plays[0][0].entry.id,'rss:A');assert.equal(plays[0][1],'play');assert.equal(body.children.length,2);const generate=find(body.children[1],'Generate with Whisper');assert.equal(generate.disabled,false);
});

test('A late saved-result response cannot replace the next episode',async()=>{
 let complete;const first={entryId:'A',mediaKey:'A',generation:1,sourceVersion:'a'},player={workspaceAudio:first,mediaKey:'A',generation:1};const context={player,t:(_tr,en)=>en,api:()=>new Promise(resolve=>{complete=resolve;}),window:{PlayerWorkspaceIntegration:{refresh(){throw Error('stale refresh');}}}};
 const start=source.indexOf('  const savedPodcastResultLoads='),end=source.indexOf('  function podcastTools(',start);vm.runInNewContext(source.slice(start,end)+';globalThis.load=loadSavedPodcastResult;',context);const pending=context.load();player.workspaceAudio={entryId:'B',mediaKey:'B',generation:2,sourceVersion:'b'};player.mediaKey='B';player.generation=2;complete({sourceVersion:'a',workspace:{transcript:{state:'untimed',text:'stale result'}}});await pending;assert.equal(first.transcriptText,undefined);assert.equal(player.workspaceAudio.transcriptText,undefined);
 const integration=fs.readFileSync(require.resolve('../src/renderer/player-workspace-integration.js'),'utf8');assert.match(integration,/rows = player\.workspaceAudio\?\.transcriptState==='untimed'\?\[\]/);assert.match(integration,/timed:!\['untimed','needs-review'\]\.includes/);
});

test('A read-only RSS stream can translate its complete saved download transcript without loading or seeking the stream',async()=>{
 const audio={entryId:'A',mediaKey:'rss:A',generation:2,sourceVersion:'stream-unknown',transcriptState:'untimed'},player={workspaceAudio:audio,mediaKey:'rss:A',generation:2},calls=[];
 const saved={sourceVersion:'download-sha',workspace:{transcript:{state:'timed',status:'complete',text:'saved source'}}};
 const context={player,t:(_tr,en)=>en,api:async input=>input.action==='podcast-materialize'?{path:'owned-hash.srt'}:saved,window:{translatePodcastSource:async binding=>{calls.push(binding);return {queued:true};}}};
 const start=source.indexOf('  async function translatePodcastTranscript('),end=source.indexOf('  async function loadSavedPodcastResult(',start);vm.runInNewContext(source.slice(start,end)+';globalThis.translate=translatePodcastTranscript;',context);
 await context.translate();assert.equal(calls.length,1);assert.equal(calls[0].sourceVersion,'download-sha');assert.equal(calls[0].playbackSourceVersion,'stream-unknown');assert.equal(calls[0].sourceTranscriptText,'saved source');assert.equal(calls[0].materializedPath,'owned-hash.srt');assert.equal(audio.sourceVersion,'stream-unknown');assert.equal(audio.transcriptState,'untimed');
 saved.workspace.transcript.status='partial';await assert.rejects(context.translate(),/complete/);assert.equal(calls.length,1);
});

test('publisher prose translation and reopening keep source and translation separate without materialization',async()=>{
 const audio={entryId:'A',mediaKey:'rss:A',generation:2,sourceVersion:'stream',transcriptState:'untimed',transcriptText:'Publisher prose'},player={workspaceAudio:audio,mediaKey:'rss:A',generation:2},calls=[];
 const saved={sourceVersion:'stream',workspace:{transcript:{state:'untimed',status:'complete',text:'Publisher prose'},translation:{state:'untimed',text:'Yayıncı metni'}}};
 const context={player,t:(_tr,en)=>en,api:async input=>{assert.notEqual(input.action,'podcast-materialize');return saved;},window:{translatePodcastTextSource:async binding=>{calls.push(binding);return {queued:true,id:'prose'};},PlayerWorkspaceIntegration:{refresh(){}}}};
 const start=source.indexOf('  async function translatePodcastTranscript('),end=source.indexOf('  function podcastTools(',start);vm.runInNewContext(source.slice(start,end)+';globalThis.translate=translatePodcastTranscript;globalThis.load=loadSavedPodcastResult;',context);
 await context.translate();assert.equal(calls.length,1);assert.equal(calls[0].sourceTranscriptText,'Publisher prose');assert.equal(calls[0].track.timed,false);
 await context.load('translation');assert.equal(audio.transcriptText,'Publisher prose');assert.equal(audio.translationText,'Yayıncı metni');await context.load('source');assert.equal(audio.transcriptText,'Publisher prose');assert.equal(audio.translationText,'Yayıncı metni');assert.equal(audio.transcriptState,'untimed');
});
