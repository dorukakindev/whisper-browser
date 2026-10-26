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

test('Whisper only passes the selected range and never requests translation',async()=>{
 const h=harness();try{
  await h.w.AssistantVideoCommands.handle('Whisper 05:00–10:00 altyazı çıkar');
  assert.equal(h.calls[0][0],'whisper');assert.equal(h.calls[0][1],false);
  assert.equal(h.w.player.browserWhisperRange.range.start,300);
  assert.equal(h.w.player.browserWhisperRange.range.end,600);
  assert.equal(h.done.length,0);
  h.w.player.job.assistantOutcome={loaded:true,sourceCount:12,translationCount:0};
  await new Promise(resolve=>setTimeout(resolve,700));
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
