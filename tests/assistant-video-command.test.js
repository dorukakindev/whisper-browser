'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const {JSDOM}=require('jsdom');
const intent=require('../src/assistant-video-intent');
const script=fs.readFileSync(require.resolve('../src/renderer/assistant-video-commands.js'),'utf8');

function harness(){
const dom=new JSDOM('<div id="messages"></div><select id="translateTo"><option value="tr">Turkish</option></select><button id="playerJobCancel"></button>',{runScripts:'outside-only'});
 const w=dom.window, calls=[],done=[],tab={id:'tab-A',generation:4,browserTranslationComplete:false};
 const source={id:'track-A',role:'source',path:'fixture.srt'};
 Object.assign(w,{AssistantVideoIntent:intent,UiLocale:{get:()=> 'tr'},player:{workspaceMode:'browser',browserActiveTabId:'tab-A',browserDuration:900,browserTracks:[source],browserTranslationTrackId:''},
  aiSourceScope:()=> 'scope-A',browserTabState:()=>tab,currentBrowserYoutubeUrl:()=> 'https://www.youtube.com/watch?v=12345678901',
  aiChatAdd:(role,text)=>{const node=w.document.createElement('div');node.textContent=text;w.document.getElementById('messages').append(node);return node;},
  AssistantWorkspace:{activeId:()=> 'thread-A',begin:()=>{},partial:()=>{},finish:(job,text,status)=>done.push({text,status})},
  currentBrowserWhisperRange:()=>null,validateBrowserWhisperRange:(_,start,end)=>({range:{start:Number(start.split(':')[0])*60+Number(start.split(':')[1]),end:Number(end.split(':')[0])*60+Number(end.split(':')[1])}}),
  effectiveBrowserProfile:()=>({values:{targetLanguage:'tr'}}),
  browserTrackSelection:()=>w.player.browserTracks[0]||null,useBrowserTrack:async(translate,id)=>{calls.push(['track',translate,id]);w.player.browserTranslationTrackId=id;return {ok:true};},
  startBrowserYoutubeWhisper:async(translate,config)=>{calls.push(['whisper',translate,config]);w.player.job={kind:'progressive',browserTabId:'tab-A',running:true,awaitingExit:false,percent:3,stage:'Transcription'};return {ok:true,job:w.player.job};},
  api:{stopBrowserTranslation:async()=>({ok:true})}});
 w.eval(script);
 return {w,dom,calls,done,tab,source};
}

test('Existing captions translate without Whisper and complete only on matching job result',async()=>{
 const h=harness();try{
  assert.equal(await h.w.AssistantVideoCommands.handle('Videonun altyazısını Türkçeye çevir'),true);
  assert.deepEqual(h.calls,[['track',true,'track-A']]);
  assert(h.w.AssistantVideoCommands.busy());assert.equal(h.done.length,0);
  h.w.document.dispatchEvent(new h.w.CustomEvent('assistant-video-translation-state',{detail:{tabId:'other',generation:4,trackId:'track-A',progress:{total:2,completed:2}}}));
  assert.equal(h.done.length,0);
  h.w.document.dispatchEvent(new h.w.CustomEvent('assistant-video-translation-state',{detail:{tabId:'tab-A',generation:4,trackId:'track-A',progress:{total:2,completed:2,pending:0,queued:0}}}));
  assert.equal(h.done[0].status,'complete');assert.equal(h.w.AssistantVideoCommands.busy(),false);
 }finally{h.dom.window.close();}
});

test('Late YouTube caption completion cannot finish a request for a replaced video or conversation', async () => {
 for (const change of ['tab', 'same-tab navigation', 'thread']) {
  const h = harness();
  try {
   await h.w.AssistantVideoCommands.handle('Videonun altyazısını Türkçeye çevir');
   assert.deepEqual(h.calls, [['track', true, 'track-A']]);
   if (change === 'tab') h.w.player.browserActiveTabId = 'tab-B';
   if (change === 'same-tab navigation') {
    h.tab.generation++;
    h.w.currentBrowserYoutubeUrl = () => 'https://www.youtube.com/watch?v=abcdefghijk';
   }
   if (change === 'thread') h.w.AssistantWorkspace.activeId = () => 'thread-B';
   h.w.document.dispatchEvent(new h.w.CustomEvent('assistant-video-translation-state', {
    detail: { tabId: 'tab-A', generation: 4, trackId: 'track-A', progress: { total: 1, completed: 1 } }
   }));
   assert.equal(h.done[0]?.status, 'failed', change);
   assert.equal(h.w.AssistantVideoCommands.busy(), false);
   assert.equal(h.calls.length, 1);
  } finally { h.dom.window.close(); }
 }
});

test('Whisper only passes the selected range and never requests translation',async()=>{
 const h=harness();try{
  await h.w.AssistantVideoCommands.handle('Whisper 05:00–10:00 altyazı çıkar');
  assert.equal(h.calls[0][0],'whisper');assert.equal(h.calls[0][1],false);
  assert.equal(h.w.player.browserWhisperRange.range.start,300);
  assert.equal(h.w.player.browserWhisperRange.range.end,600);
  assert.equal(h.done.length,0);
  h.w.player.job.assistantOutcome={loaded:true,sourceCount:12,translationCount:0};
  const deadline=Date.now()+3000;while(h.done[0]?.status!=='complete'){if(Date.now()>deadline)throw Error('Caption command did not complete');await new Promise(setImmediate);}
  assert.equal(h.done[0].status,'complete');
 }finally{h.dom.window.close();}
});

test('Absent source captions never silently fall back to Whisper',async()=>{
 const h=harness();try{
  h.w.player.browserTracks=[];
  assert.equal(await h.w.AssistantVideoCommands.handle('Videonun altyazısını çevir'),false,'Delegate to the caption-probe tool loop, never to Whisper');
  assert.equal(h.calls.length,0);assert.equal(h.done.length,0);
 }finally{h.dom.window.close();}
});

test('Cancellation during caption preparation prevents a late start',async()=>{
 const h=harness();try{
  let release;
  h.w.useBrowserTrack=async(_,__,config)=>{await new Promise(resolve=>release=resolve);if(config.isCancelled())return {ok:false,cancelled:true};throw Error('Cancelled preparation reached launch');};
  const run=h.w.AssistantVideoCommands.handle('Videonun altyazısını çevir');
  await h.w.AssistantVideoCommands.cancel();release();await run;
  assert.equal(h.done[0].status,'stopped');assert.equal(h.calls.length,0);
 }finally{h.dom.window.close();}
});

test('Unresolved ranges and a different target cannot silently run the full video or wrong language',async()=>{
 for(const question of ['Whisper videonun 5 dakikasını çevir','Whisper 03:99–04:30 altyazı çıkar']){
  const h=harness();try{
   await h.w.AssistantVideoCommands.handle(question);
   assert.equal(h.calls.length,0,question);assert.equal(h.done[0].status,'failed',question);
  }finally{h.dom.window.close();}
 }
});

test('An existing artifact without a successful load receipt cannot be reported as completed',async()=>{
 const h=harness();try{
  h.w.player.browserTracks=[{path:'old.srt',generatedBy:'whisper',role:'source'}];
  h.w.startBrowserYoutubeWhisper=async()=>undefined;
  await h.w.AssistantVideoCommands.handle('Whisper ile altyazı çıkar');
  assert.equal(h.done[0].status,'failed');assert.equal(h.w.AssistantVideoCommands.busy(),false);
 }finally{h.dom.window.close();}
});

test('A confirmed translation stop clears its running identity and keeps finished captions',async()=>{
 const h=harness();try{
  h.w.player.cues2=[{start:1,end:2,text:'Hazır çeviri'}];
  await h.w.AssistantVideoCommands.handle('Videonun altyazısını çevir');
  await h.w.AssistantVideoCommands.cancel();
  assert.equal(h.done[0].status,'stopped');assert.equal(h.w.player.browserTranslationTrackId,'');
  assert.equal(h.w.player.cues2[0].text,'Hazır çeviri');assert.equal(h.w.AssistantVideoCommands.busy(),false);
 }finally{h.dom.window.close();}
});

 test('Per-job caption language/range/speech requests delegate without changing saved settings',async()=>{
  for(const q of ['Videonun altyazısını İngilizceye çevir','Videonun altyazısını 00:05–00:25 arasında çevir','Videonun altyazısını dublaj için çevir']){
   const h=harness();try{assert.equal(await h.w.AssistantVideoCommands.handle(q),false);assert.equal(h.calls.length,0);assert.equal(h.w.document.getElementById('translateTo').value,'tr');}finally{h.dom.window.close();}
  }
 });

test('Current shelf RSS commands select its source instead of the hidden YouTube tab',async()=>{
 for(const [question,operation] of [['bu podcasti transcribe et','transcribe'],['bu podcasti transcribe et çevir','transcribe-translate']]){
  const h=harness();try{
   const layer=h.w.document.createElement('div');layer.id='playerLayer';layer.className='hidden';h.w.document.body.append(layer);
   const snapshot={mediaKey:'shelf:episode-A',generation:8,sourceVersion:'stream-A',sourceKind:'rss',playbackOwner:'media-shelf'};
   h.w.MediaShelfUI={readSnapshot:()=>snapshot,runPodcastTask:async config=>{h.calls.push(['podcast',config]);assert.equal(config.expected.mediaKey,snapshot.mediaKey);assert.equal(config.isCancelled(),false);return {queued:true,id:'rss-job-A'};}};
   h.w.globalAssistantContext=()=>({type:'podcast',mediaKey:snapshot.mediaKey});
   h.w.podcastQueueTaskState=()=>({id:'rss-job-A',state:'complete'});
   assert.equal(await h.w.AssistantVideoCommands.handle(question),true);
   assert.equal(h.calls[0]?.[0],'podcast');assert.equal(h.calls[0][1].operation,operation);assert.equal(h.calls.length,1);
   assert.equal(h.done[0].status,'complete');assert.match(h.done[0].text,/Sonuç|Results/i);assert.doesNotMatch(h.done[0].text,/YouTube/);
  }finally{h.dom.window.close();}
 }
});

test('Canonical RSS routes to its exact player owner and rejects an unconfirmed queue receipt',async()=>{
 const h=harness();try{
  const layer=h.w.document.createElement('div');layer.id='playerLayer';h.w.document.body.append(layer);
  Object.assign(h.w.player,{workspaceMode:'player',mediaKey:'rss-A',generation:12,workspaceAudio:{entryId:'A',mediaKey:'rss-A',generation:12,sourceVersion:'stream-A'}});
  h.w.PlayerSourceCatalogIntegration={runPodcastTask:async config=>{h.calls.push(config);return {queued:false};}};
  await h.w.AssistantVideoCommands.handle('transcribe et çevir');assert.equal(h.calls[0]?.expected.sourceVersion,'stream-A');assert.equal(h.done[0].status,'failed');
 }finally{h.dom.window.close();}
});

test('Podcast pending request cancellation and episode switches are source-bound',async()=>{
 for(const change of ['cancel','source','thread']){
  const h=harness();try{
   const layer=h.w.document.createElement('div');layer.id='playerLayer';layer.className='hidden';h.w.document.body.append(layer);
   let snapshot={mediaKey:'shelf-A',generation:1,sourceVersion:'A'},release,config;
   h.w.MediaShelfUI={readSnapshot:()=>snapshot,runPodcastTask:async input=>{config=input;await new Promise(resolve=>release=resolve);return config.isCancelled()?{queued:false}:{queued:true,id:'A'};}};
   const run=h.w.AssistantVideoCommands.handle('bu podcasti transcribe et');
   if(change==='cancel')await h.w.AssistantVideoCommands.cancel();else if(change==='source')snapshot={...snapshot,generation:2};else h.w.AssistantWorkspace.activeId=()=> 'other-thread';
   assert.equal(config.isCancelled(),true);release();await run;
   assert.equal(h.done[0].status,change==='cancel'?'stopped':'failed');assert.equal(h.w.AssistantVideoCommands.busy(),false);
  }finally{h.dom.window.close();}
 }
});

test('Visible YouTube browser is not captured by a stale hidden shelf podcast',async()=>{
 const h=harness();try{
  const layer=h.w.document.createElement('div');layer.id='playerLayer';h.w.document.body.append(layer);
  h.w.MediaShelfUI={readSnapshot:()=>({mediaKey:'stale-shelf',generation:1}),runPodcastTask:()=>{throw Error('Hidden shelf selected');}};
  await h.w.AssistantVideoCommands.handle('transcribe et');assert.equal(h.calls[0][0],'whisper');
 }finally{h.dom.window.close();}
});

test('A selected book or library source cannot start a background shelf podcast',async()=>{
 const h=harness();try{
  const layer=h.w.document.createElement('div');layer.id='playerLayer';layer.className='hidden';h.w.document.body.append(layer);
  h.w.MediaShelfUI={readSnapshot:()=>({mediaKey:'shelf-A',generation:1,sourceVersion:'A'}),runPodcastTask:()=>{throw Error('Unrelated source acquisition');}};
  h.w.globalAssistantContext=()=>({workspace:'media-library',type:'library-title'});
  await h.w.AssistantVideoCommands.handle('transcribe et');assert.equal(h.calls.length,0);assert.equal(h.done[0].status,'failed');
 }finally{h.dom.window.close();}
});

test('Podcast queue acceptance stays pending and exact receipt progress finishes only on its terminal state',async()=>{
 const h=harness();try{
  const layer=h.w.document.createElement('div');layer.id='playerLayer';layer.className='hidden';h.w.document.body.append(layer);
  const snapshot={mediaKey:'shelf-A',generation:1,sourceVersion:'A'};let inspect,job={id:'own-job',state:'queued',text:'',cancellable:false};
  h.w.setInterval=fn=>{inspect=fn;return 1;};h.w.clearInterval=()=>{};
  h.w.MediaShelfUI={readSnapshot:()=>snapshot,runPodcastTask:async()=>({queued:true,id:'own-job'})};
  h.w.podcastQueueTaskState=(expected,id)=>{assert.equal(expected.mediaKey,snapshot.mediaKey);assert.equal(id,'own-job');return job;};
  await h.w.AssistantVideoCommands.handle('transcribe this podcast and translate');
  assert.equal(h.done.length,0);assert.equal(h.w.AssistantVideoCommands.busy(),true);
  job={...job,state:'running',text:'Recognizing episode',progress:.42,cancellable:true};inspect();
  assert.match(h.w.AssistantVideoCommands.status().job.bubble.textContent,/42/);
  job={...job,state:'complete',text:''};inspect();assert.equal(h.done[0].status,'complete');assert.equal(h.w.AssistantVideoCommands.busy(),false);
 }finally{h.dom.window.close();}
});

test('Podcast assistant cancellation uses exact existing queue controls and waits for stop confirmation',async()=>{
 const h=harness();try{
  const layer=h.w.document.createElement('div');layer.id='playerLayer';layer.className='hidden';h.w.document.body.append(layer);
  const snapshot={mediaKey:'shelf-A',generation:1,sourceVersion:'A'};let inspect,job={id:'own-job',state:'running',text:'',cancellable:true},stops=0;
  h.w.setInterval=fn=>{inspect=fn;return 1;};h.w.clearInterval=()=>{};
  h.w.MediaShelfUI={readSnapshot:()=>snapshot,runPodcastTask:async()=>({queued:true,id:'own-job'})};
  h.w.podcastQueueTaskState=()=>job;
  h.w.cancelPodcastQueueTask=(expected,id)=>{assert.equal(expected.mediaKey,snapshot.mediaKey);assert.equal(id,'own-job');stops++;return true;};
  await h.w.AssistantVideoCommands.handle('transcribe this podcast');await h.w.AssistantVideoCommands.cancel();
  assert.equal(stops,1);assert.equal(h.done.length,0);
  job={...job,state:'stopped',cancellable:false};inspect();assert.equal(h.done[0].status,'stopped');
 }finally{h.dom.window.close();}
});

test('Cancellation racing accepted podcast receipt stops its accepted job instead of claiming no enqueue',async()=>{
 const h=harness();try{
  const layer=h.w.document.createElement('div');layer.id='playerLayer';layer.className='hidden';h.w.document.body.append(layer);
  const snapshot={mediaKey:'shelf-A',generation:1,sourceVersion:'A'};let release,stops=0;
  h.w.setInterval=()=>1;h.w.clearInterval=()=>{};
  h.w.MediaShelfUI={readSnapshot:()=>snapshot,runPodcastTask:()=>new Promise(resolve=>release=resolve)};
  h.w.podcastQueueTaskState=()=>({id:'own-job',state:'running',cancellable:true});
  h.w.cancelPodcastQueueTask=()=>{stops++;return true;};
  const run=h.w.AssistantVideoCommands.handle('transcribe this podcast');await h.w.AssistantVideoCommands.cancel();release({queued:true,id:'own-job'});await run;
  assert.equal(stops,1);assert.equal(h.done.length,0);assert.equal(h.w.AssistantVideoCommands.status().queueId,'own-job');
 }finally{h.dom.window.close();}
});

test('Accepted podcast tracking rejects a changed source and never reports a different receipt as its result',async()=>{
 for(const change of ['source','receipt','failed']){
  const h=harness();try{
   const layer=h.w.document.createElement('div');layer.id='playerLayer';layer.className='hidden';h.w.document.body.append(layer);
   let snapshot={mediaKey:'shelf-A',generation:1,sourceVersion:'A'},inspect,job={id:'own-job',state:'running',cancellable:true};
   h.w.setInterval=fn=>{inspect=fn;return 1;};h.w.clearInterval=()=>{};
   h.w.MediaShelfUI={readSnapshot:()=>snapshot,runPodcastTask:async()=>({queued:true,id:'own-job'})};h.w.podcastQueueTaskState=()=>job;
   await h.w.AssistantVideoCommands.handle('transcribe this podcast');
   if(change==='source')snapshot={...snapshot,generation:2};else if(change==='receipt')job={id:'other-job',state:'complete'};else job={...job,state:'failed',text:'Saving failed'};
   inspect();assert.equal(h.done[0].status,'failed',change);assert.equal(h.w.AssistantVideoCommands.busy(),false);
  }finally{h.dom.window.close();}
 }
});
