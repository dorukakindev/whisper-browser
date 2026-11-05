'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync(require.resolve('../src/renderer/player-source-catalog-integration.js'),'utf8');
test('Saved RSS output uses timed loading only for exact complete source and otherwise becomes read-only',async()=>{
 const audio={entryId:'A',mediaKey:'rss:A',generation:2,sourceVersion:'remote-unknown'},requests=[],loads=[],modes=[];const player={workspaceAudio:audio,mediaKey:'rss:A',generation:2};
 let saved={sourceVersion:'download-sha',workspace:{transcript:{state:'timed',text:'srt',status:'complete'}}};
 const context={player,t:(_tr,en)=>en,api:async input=>{requests.push(input);return input.action==='podcast-materialize'?{path:'managed.srt'}:saved;},parseSubtitles:()=>[{start:1,end:2,text:'Stored result'}],loadSubtitle:async(...args)=>loads.push(args),window:{PlayerWorkspaceIntegration:{setPodcastMode:value=>modes.push(value),refresh(){}}}};
 const start=source.indexOf('  async function loadSavedPodcastResult('),end=source.indexOf('  function podcastTools(',start);vm.runInNewContext(source.slice(start,end)+';globalThis.load=loadSavedPodcastResult;',context);
 await context.load();assert.equal(audio.transcriptState,'untimed');assert.equal(audio.transcriptText,'Stored result');assert.match(audio.transcriptTimingNotice,/Read-only/);assert.equal(loads.length,0);assert.equal(audio.sourceVersion,'remote-unknown');assert.equal(modes.length,0,'loading saved text preserves the explicitly selected player view');
 audio.sourceVersion='download-sha';await context.load();assert.equal(audio.transcriptState,'timed');assert.equal(loads.length,1);assert.equal(requests.at(-1).action,'podcast-materialize');assert.equal(audio.transcriptTimingNotice,undefined);
 saved.workspace.translation={state:'untimed',text:'translated',status:'complete'};await context.load('translation');assert.equal(modes.length,0,'loading a translation also preserves the selected view');
 saved.workspace.transcript.status='partial';await context.load();assert.equal(audio.transcriptState,'untimed');assert.equal(loads.length,1);
 saved.workspace.transcript.status='complete';saved.workspace.transcript.provenance='asr';await context.load();assert.equal(audio.transcriptState,'untimed','a cached download hash does not verify a newly opened RSS stream');assert.equal(loads.length,1);
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
 const start=source.indexOf('  async function loadSavedPodcastResult('),end=source.indexOf('  function podcastTools(',start);vm.runInNewContext(source.slice(start,end)+';globalThis.load=loadSavedPodcastResult;',context);const pending=context.load();player.workspaceAudio={entryId:'B',mediaKey:'B',generation:2,sourceVersion:'b'};player.mediaKey='B';player.generation=2;complete({sourceVersion:'a',workspace:{transcript:{state:'untimed',text:'stale result'}}});await pending;assert.equal(first.transcriptText,undefined);assert.equal(player.workspaceAudio.transcriptText,undefined);
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
