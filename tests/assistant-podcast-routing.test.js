'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const {JSDOM}=require('jsdom');
const read=name=>fs.readFileSync(require.resolve('../src/renderer/'+name),'utf8');
const shelf=read('media-shelf-ui.js'),catalog=read('player-source-catalog-integration.js'),renderer=read('renderer.js');
function harness(owner='media-shelf'){
 const dom=new JSDOM('<div id="playerLayer"></div><div id="messages"></div><select id="translateTo"><option value="tr">tr</option></select>',{runScripts:'outside-only'}),w=dom.window;
 const snapshot={mediaKey:owner+':A',generation:8,sourceVersion:'stream-A',entryId:'feed-A',sourceKind:'rss',playbackOwner:owner};
 const requests=[],done=[],enqueues=[],ui={task:'translate',translate:true,translateOnly:true,translateTo:'tr',clipStart:'40',clipEnd:'50',model:'small',translateModel:'existing-provider'};
 Object.assign(w,{AssistantVideoIntent:require('../src/assistant-video-intent'),UiLocale:{get:()=> 'tr'},currentSnapshot:snapshot,current:{id:'show-A',url:'https://audio.example/A'},playGeneration:8,
  player:{workspaceMode:owner==='player'?'player':'browser',mediaKey:snapshot.mediaKey,generation:8,workspaceAudio:owner==='player'?snapshot:null,browserTracks:[]},state:{queue:[],queueRunning:true,running:true},
  aiSourceScope:()=> 'scope-A',browserTabState:()=>({id:'hidden-youtube',generation:99}),currentBrowserYoutubeUrl:()=> 'https://www.youtube.com/watch?v=abcdefghijk',globalAssistantContext:()=>({type:'podcast'}),
  aiChatAdd:(_,text)=>{const node=w.document.createElement('div');node.textContent=text;return node;},AssistantWorkspace:{activeId:()=> 'thread-A',begin(){},partial(){},finish:(_job,text,status)=>done.push({text,status})},
  startBrowserYoutubeWhisper:()=>{throw Error('YouTube source contamination');},readPodcastSnapshot:()=>w.currentSnapshot,
  addToQueue:(type,input,{optionsOverride})=>{enqueues.push({type,input,opts:{...ui,...optionsOverride}});w.state.queue.push({id:'queue-A',...enqueues.at(-1)});return true;},renderQueue(){},startQueue(){throw Error('Existing running queue must be retained');},
  serviceRequest:async input=>{const request=typeof input==='string'?{action:input}:input;requests.push(request);if(request.action==='podcast-processing-binding')return {entryId:'feed-A',sourceVersion:'stream-A'};if(request.action==='podcast-audio')return {ok:true,path:'managed-A',sourceVersion:'download-A',downloadToken:'grant-A'};return {ok:true};}
 });
 w.window.api={feedsRequest:input=>w.serviceRequest(input)};
 if(owner==='media-shelf')w.document.getElementById('playerLayer').className='hidden';
 w.eval(renderer.slice(renderer.indexOf('function podcastQueueOwnerCurrent('),renderer.indexOf('async function persistPodcastJobOutputs(')));
 if(owner==='media-shelf'){
  w.eval('const t=(en,tr)=>tr,api=(...args)=>window.serviceRequest(...args);let podcastAcquisition=null;'+shelf.slice(shelf.indexOf('  async function podcastProcessingBinding('),shelf.indexOf('  function renderPodcastMode('))+';window.MediaShelfUI={readSnapshot:readPodcastSnapshot,runPodcastTask};');
 }else{
  w.eval('const t=(tr,en)=>tr,api=request=>window.serviceRequest(request);'+catalog.slice(catalog.indexOf('  let podcastRequest=null;'),catalog.indexOf('  async function loadPublisherTranscript('))+';window.PlayerSourceCatalogIntegration={runPodcastTask};');
 }
 w.eval(read('assistant-video-commands.js'));
 return {w,dom,requests,done,enqueues,ui,snapshot};
}

test('Actual assistant selection → exact RSS acquisition → existing frozen queue works for both podcast owners',async()=>{
 for(const owner of ['media-shelf','player'])for(const [question,translate]of [['bu podcasti transcribe et',false],['bu podcasti transcribe et çevir',true]]){
  const h=harness(owner);try{
   assert.equal(await h.w.AssistantVideoCommands.handle(question),true);
   const acquisition=h.requests.find(row=>row.action==='podcast-audio');assert.equal(acquisition.entryId,'feed-A');assert.equal(acquisition.sourceVersion,'stream-A');
   assert.equal(h.enqueues.length,1);const item=h.w.state.queue[0];assert.equal(item.input,'managed-A');assert.equal(item.opts.translate,translate);assert.equal(item.opts.translateOnly,false);assert.equal(item.opts.task,'transcribe');assert.equal(item.opts.clipStart,'');assert.equal(item.opts.clipEnd,'');assert.equal(item.opts.model,'small');assert.equal(item.opts.translateModel,'existing-provider');assert.equal(item.podcastBinding.playbackOwner,owner);assert.equal(item.podcastBinding.sourceVersion,'download-A');
   h.ui.translateTo='de';assert.equal(item.opts.translateTo,'tr');assert.equal(h.done[0].status,'complete');assert.match(h.done[0].text,/kuyru/);assert.doesNotMatch(h.done[0].text,/hazır|tamamlandı|YouTube/);
  }finally{h.dom.window.close();}
 }
});

test('Cancelled or replaced RSS acquisition releases its exact grant and never queues next episode',async()=>{
 for(const owner of ['media-shelf','player'])for(const change of ['cancel','episode','sourceVersion','thread']){
  const h=harness(owner);try{
   let release;const original=h.w.serviceRequest;h.w.serviceRequest=input=>input.action==='podcast-audio'?new Promise(resolve=>release=resolve):original(input);
   const run=h.w.AssistantVideoCommands.handle('bu podcasti transcribe et çevir');
   while(!release)await new Promise(setImmediate);
   if(change==='cancel')await h.w.AssistantVideoCommands.cancel();
   else if(change==='thread')h.w.AssistantWorkspace.activeId=()=> 'thread-B';
   else {h.w.currentSnapshot={...h.snapshot,[change==='episode'?'generation':'sourceVersion']:change==='episode'?9:'changed-stream'};if(owner==='player'){h.w.player.workspaceAudio=h.w.currentSnapshot;h.w.player.generation=h.w.currentSnapshot.generation;}}
   release({ok:true,path:'managed-A',sourceVersion:'download-A',downloadToken:'grant-A'});await run;
   assert.equal(h.enqueues.length,0);assert.equal(h.requests.at(-1).action,'podcast-audio-release');assert.equal(h.requests.at(-1).downloadToken,'grant-A');assert.notEqual(h.done[0].status,'complete');
  }finally{h.dom.window.close();}
 }
});

test('Unsupported podcast ranges and acquisition failures never start the full episode or another source',async()=>{
 for(const owner of ['media-shelf','player']){
  const h=harness(owner);try{
   await h.w.AssistantVideoCommands.handle('Whisper 05:00–10:00 altyazı çıkar');assert.equal(h.requests.length,0);assert.equal(h.enqueues.length,0);assert.match(h.done[0].text,/aralık/);
   h.w.serviceRequest=async()=>{throw Error('Audio denied by existing owner');};
   await h.w.AssistantVideoCommands.handle('transcribe et');assert.equal(h.enqueues.length,0);assert.match(h.done.at(-1).text,/denied/);
  }finally{h.dom.window.close();}
 }
});

test('Existing queue validation or duplicate rejection releases acquired grant and reports no accepted task',async()=>{
 for(const owner of ['media-shelf','player']){
  const h=harness(owner);try{
   h.w.addToQueue=()=>false;
   await h.w.AssistantVideoCommands.handle('transcribe et çevir');
   assert.equal(h.enqueues.length,0);assert.equal(h.done[0].status,'failed');assert.match(h.done[0].text,/kuyru/);assert.equal(h.requests.at(-1).action,'podcast-audio-release');assert.equal(h.requests.at(-1).downloadToken,'grant-A');
  }finally{h.dom.window.close();}
 }
});
