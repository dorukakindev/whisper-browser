'use strict';

require('node:test')('VTT dubbing derivation rejects malformed speech cues mixed with valid cues instead of silently dropping them',()=>{
 const {deriveDubSrt}=require('../src/podcast-dub-subtitle');
 const text='WEBVTT\n\n00:00.000 --> 00:01.000\nKeep this sentence.\n\n00:02.BAD --> 00:03.000\nDo not silently discard this sentence.\n';
 require('node:assert/strict').throws(()=>deriveDubSrt(text),error=>error.code==='timing-not-preserved');
});
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),vm=require('node:vm'),{EventEmitter}=require('node:events'),{Readable}=require('node:stream');
const {registerFeeds}=require('../src/feed-service'),{sourceVersion,validateTimedText}=require('../src/podcast-session');
const xml='<rss xmlns:podcast="https://podcastindex.org/namespace/1.0"><channel><title>Show</title><item><guid>one</guid><title>Episode</title><enclosure url="https://audio.example/one.mp3" type="audio/mpeg"/><podcast:transcript url="https://text.example/one.vtt" type="text/vtt"/></item></channel></rss>';
const text='WEBVTT\n\n00:00:00.000 --> 00:00:02.000\nHello\n';

test('Browser to RSS handoff accepts its own player generation change, while a newer media intent still cancels it',async()=>{
 const source=fs.readFileSync(require.resolve('../src/renderer/player-source-catalog-integration'),'utf8'),hub=fs.readFileSync(require.resolve('../src/renderer/media-hub-ui'),'utf8');
 for(const replaced of [false,true]){
  const player={mediaKey:'browser:A',generation:2,openIntent:0,workspaceMode:'browser'};
  const env={player,epoch:0,t:tr=>tr,flushPodcastPosition:async()=>{},close(){},currentGeneration:()=>player.generation,document:{getElementById:()=>({classList:{remove(){}}})},
   api:async input=>input.action==='entry'?{entry:{id:'B',title:'Episode B',enclosures:[{type:'audio/wav',url:'https://example.test/B.wav'}]}}:{sourceVersion:'version-B',workspace:null},
   flushWatchState:async()=>{if(replaced)player.openIntent++;},setWorkspaceMode:mode=>{player.workspaceMode=mode;player.generation++;},setPlayerSource:(_url,_title,key)=>{player.mediaKey=key;player.generation++;},window:{NativePlayerUI:{start:async()=>false},api:{mediaHub:async()=>({ok:true,key:'rss:B',url:'https://example.test/B.wav'})}}};
  const ctx=vm.createContext(env);vm.runInContext(hub.slice(hub.indexOf(' async function playStream('),hub.indexOf(' async function drawPlayer(')),ctx);env.window.MediaHubUI={playStream:ctx.playStream};
  vm.runInContext(source.slice(source.indexOf('  async function play('),source.indexOf('  function videoRate(')),ctx);
  await ctx.play({entry:{id:'B'}},'play');
  if(replaced){assert.equal(player.workspaceAudio,undefined);assert.equal(player.mediaKey,'browser:A');}
  else {assert.equal(player.workspaceAudio?.entryId,'B');assert.equal(player.workspaceAudio.mediaKey,'rss:B');assert.equal(player.workspaceAudio.generation,player.generation);}
 }
});
test('podcast source-scoped reopen, publisher cache, separate translation, confirmed Spotify and workspace roundtrip',async t=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'podcast-delivery-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));const app=new EventEmitter();app.getPath=()=>dir;let calls=0;const grants=[];
 const service=registerFeeds({app,ipcMain:{handle(){}},authorized:e=>e.allowed,autoStart:false,grantSubtitle:file=>grants.push(file),transcriptFetcher:async()=>{calls++;return {ok:true,timed:'yes',format:'vtt',text};},fetchValidated:async()=>({status:200,headers:new Headers({'content-type':'application/json'}),buffer:Buffer.from('{"title":"Episode"}'),effectiveUrl:'https://open.spotify.com/oembed'})});t.after(()=>service.dispose());
 const parsed=require('../src/feed-parser').parseFeed(xml,'https://feed.example/rss');service.store.subscribe({...parsed,url:'https://feed.example/rss'},parsed.entries);const e=service.store.entries().rows[0],version=sourceVersion(e),event={allowed:true,sender:{id:42}},api=(action,rest={})=>service.handle(event,{action,entryId:e.id,...rest});
 assert.equal((await api('podcast-transcript',{revision:e.revision})).timed,'yes');assert.equal((await api('podcast-transcript',{revision:e.revision})).cached,true);assert.equal(calls,1);
 assert.equal((await api('podcast-workspace',{sourceVersion:version,position:36,rate:1.5})).workspace.position,36);
 const materialized=await api('podcast-materialize',{sourceVersion:version});assert.equal(fs.readFileSync(materialized.path,'utf8'),text);assert.deepEqual(grants,[materialized.path]);
 assert.equal((await api('podcast-save-transcript',{sourceVersion:version,text:text.replace('Hello','Merhaba'),format:'vtt',timed:true,role:'translation',provenance:'asr'})).ok,true);
 const workspace=(await api('podcast-workspace')).workspace;assert.equal(workspace.transcript.text,text);assert.match(workspace.translation.text,/Merhaba/);
 const preview=await api('podcast-spotify-preview',{url:'https://open.spotify.com/episode/1234567890123456789012?si=private'});assert.equal(preview.candidates.length,1);assert.equal(preview.candidates[0].assessment.confidence,'low');assert.equal(preview.audioAccess,false);
 assert.equal((await service.handle({allowed:true,sender:{id:43}},{action:'podcast-spotify-confirm',token:preview.token,entryId:e.id})).ok,false);
 assert.equal((await api('podcast-spotify-confirm',{token:preview.token})).ok,true);
 const restored=require('../src/feed-store').createFeedStore(path.join(dir,'feeds.json'));assert.equal(restored.entry(e.id).podcastWorkspace.rate,1.5);assert.equal(restored.entry(e.id).podcastWorkspace.spotifyUrl,'https://open.spotify.com/episode/1234567890123456789012');
 const pkg=require('../src/workspace-package'),file=path.join(dir,'test.wbp');pkg.exportPackage(dir,file);const target=path.join(dir,'restore');fs.mkdirSync(target);pkg.restorePackage(target,pkg.readPackage(file));assert.equal(require('../src/feed-store').createFeedStore(path.join(target,'feeds.json')).entry(e.id).podcastWorkspace.translation.text,workspace.translation.text);
 assert.equal((await api('podcast-save-transcript',{sourceVersion:'0'.repeat(64),text,format:'vtt',timed:true})).ok,false);
 for(const bad of ['WEBVTT\n','00:00:02.000 --> 00:00:01.000\nBad','00:00:NaN --> 00:00:01.000\nBad'])assert.throws(()=>validateTimedText(bad));
});
test('podcast helper uses one frozen-options existing queue and rejects changed episode',async()=>{
 const source=fs.readFileSync(path.join(__dirname,'../src/renderer/renderer.js'),'utf8'),start=source.indexOf('window.queuePodcastSource=async function(binding,config={})'),end=source.indexOf('// Untimed prose',start);const state={queue:[],queueRunning:false,running:false},player={mediaKey:'rss:1',generation:2,workspaceAudio:{entryId:'one',sourceVersion:'a'.repeat(64)}};let starts=0,adds=0;const context={window:{},state,player,Error,renderQueue(){},startQueue(){starts++;state.queueRunning=true;},addToQueue(type,input){adds++;state.queue.push({opts:{language:'tr'},type,input});return true;}};const owner=source.slice(source.indexOf('function podcastQueueOwnerCurrent(binding)'),source.indexOf('// Podcast uses the existing frozen-options queue'));vm.runInNewContext(owner+source.slice(start,end),context);
 const b={path:'managed.audio',entryId:'one',sourceVersion:'a'.repeat(64),mediaKey:'rss:1',generation:2};await context.window.queuePodcastSource(b);assert.equal(adds,1);assert.equal(starts,1);assert.equal(state.queue[0].podcastBinding.entryId,'one');assert.equal(state.queue[0].opts.language,'tr');player.generation=3;await assert.rejects(context.window.queuePodcastSource(b),/changed/);assert.equal(adds,1);
});
test('bounded pinned audio download rejects HTML and excessive body, removes only managed target',async t=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'podcast-audio-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));const {acquireAudio}=require('../src/podcast-audio');let pins=0;
 const transport=body=>({request(_url,_opts,callback){const req=new EventEmitter();req.setTimeout=()=>{};req.end=()=>{const r=Readable.from([Buffer.from(body)]);r.statusCode=200;r.headers={'content-type':'audio/mpeg'};callback(r);};return req;}});
 const options=body=>({publicPin:async()=>{pins++;return {address:'8.8.8.8',family:4};},transport:transport(body),maxBytes:16});const file=path.join(dir,'managed.audio');
 await assert.rejects(acquireAudio('https://audio.example/one',file,options('<html>Error</html>')),/instead of audio|exceeds/);assert.equal(fs.existsSync(file),false);
 await assert.rejects(acquireAudio('https://audio.example/one',file,options('a'.repeat(32))),/exceeds/);assert.equal(fs.existsSync(file),false);
 await acquireAudio('https://audio.example/one',file,options('ID3audio'));assert.equal(fs.readFileSync(file,'utf8'),'ID3audio');await assert.rejects(acquireAudio('https://audio.example/one',file,options('ID3replace')),/EEXIST/);assert.equal(fs.readFileSync(file,'utf8'),'ID3audio');assert.equal(pins,4);
});

test('queue removal/clear/cancel cleanup releases one owned token and marks retry for reacquisition',async()=>{
 const source=fs.readFileSync(path.join(__dirname,'../src/renderer/renderer.js'),'utf8'),start=source.indexOf('async function releasePodcastQueueItem(item)'),end=source.indexOf("\n$('cancelBtn')",start);const requests=[];const context={window:{api:{feedsRequest:async request=>{requests.push(request);return {ok:true};}}}};vm.runInNewContext(source.slice(start,end)+';globalThis.release=releasePodcastQueueItem;',context);
 const item={podcastBinding:{downloadToken:'owned',acquireRequestId:'retry-one'}};await context.release(item);assert.equal(item.podcastBinding.released,true);assert.equal(item.podcastBinding.downloadToken,undefined);assert.deepEqual(requests.map(r=>r.action),['cancel','podcast-audio-release']);delete item.podcastBinding.acquireRequestId;await context.release(item);assert.equal(requests.length,2);
 const helpers=fs.readFileSync(path.join(__dirname,'../src/renderer/renderer-helpers.js'),'utf8');assert.match(helpers,/function removeFromQueue[\s\S]*?releasePodcastQueueItem\(item\)/);assert.match(source,/function clearQueue[\s\S]*?releasePodcastQueueItem\(item\)/);
});

test('actual player translation terminal persists original episode while stale generation cannot paint live cues',async()=>{
 const source=fs.readFileSync(path.join(__dirname,'../src/renderer/renderer.js'),'utf8'),start=source.indexOf('function playerJobEvent(event)'),end=source.indexOf('\nfunction completedSubtitleOutputs',start),saved=[];
 const job={kind:'translate',running:true,mediaKey:'A',generation:1,podcastBinding:{entryId:'A',sourceVersion:'a'.repeat(64),outputRole:'translation'}},node={classList:{add(){},remove(){}},style:{}},noop=()=>{};
 const context={window:{},browserJobsDock:{owners:new Map(),terminals:new Map()},updatePlayerTaskCenter:noop,player:{job,mediaKey:'A',generation:2,workspaceMode:'player',cues2:[]},state:{running:true,outputFiles:[]},$:()=>node,persistPodcastJobOutputs:async(e,b)=>{saved.push([e,b]);},updateBrowserWhisperActions:noop,updateMakeTransState:noop,updatePlayerAutoSyncState:noop,setTimeout:noop,logLine:noop,refreshHistory:noop};const helper=source.slice(source.indexOf('function podcastJobMatchesCurrent(job)'),source.indexOf('// Podcast uses the existing frozen-options queue'));const terminal=source.slice(source.indexOf('function recordBrowserJobTerminal('),source.indexOf('function browserJobsWithTerminals('));vm.runInNewContext(helper+terminal+source.slice(start,end)+';globalThis.handle=playerJobEvent;',context);
 assert.equal(context.handle({type:'translation_chunk',segments:[{start:0,end:1,text:'stale'}]}),true);assert.equal(context.player.cues2.length,0);
 assert.equal(context.handle({type:'done',files:['translated.srt']}),true);await Promise.resolve();assert.equal(saved.length,1);assert.equal(saved[0][1].entryId,'A');assert.equal(saved[0][1].outputRole,'translation');assert.equal(job.doneHandled,true);
});
test('podcast backup preview handles feeds and does not call present media missing',()=>{
 const pack=require('../src/workspace-package');const file=(name,data)=>({name,data:Buffer.from(JSON.stringify(data)).toString('base64')});
 const data={files:[file('feeds.json',{feeds:[],entries:[]}),file('watch-library.json',{items:[{localPath:'C:/Media/episode.mp3'}]})]};
 assert.deepEqual(pack.missingLocalMedia(data,()=>true),[]);
 assert.equal(pack.missingLocalMedia(data,()=>false)[0].count,1);
});

test('A late translation cannot overwrite a changed saved source and materialized source files remain immutable',async t=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'podcast-source-cas-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
 const service=registerFeeds({app:new EventEmitter(),ipcMain:{handle(){}},authorized:()=>true,userData:()=>dir,autoStart:false,grantSubtitle:()=>true});t.after(()=>service.dispose());
 const parsed=require('../src/feed-parser').parseFeed(xml,'https://feed.example/rss');service.store.subscribe({...parsed,url:'https://feed.example/rss'},parsed.entries);const entry=service.store.entries().rows[0],version=sourceVersion(entry),event={sender:{id:7}};
 const api=(action,rest={})=>service.handle(event,{action,entryId:entry.id,sourceVersion:version,...rest});
 await api('podcast-save-transcript',{text,format:'vtt',timed:true});const first=await api('podcast-materialize');
 const replacement=text.replace('Hello','Changed');await api('podcast-save-transcript',{text:replacement,format:'vtt',timed:true});const second=await api('podcast-materialize');assert.notEqual(first.path,second.path);assert.equal(fs.readFileSync(first.path,'utf8'),text);
 const late=await api('podcast-save-transcript',{role:'translation',text:text.replace('Hello','Merhaba'),format:'vtt',timed:true,expectedTranscriptText:text});assert.equal(late.ok,false);assert.equal(service.store.entry(entry.id).podcastWorkspace.translation,undefined);
 const current=await api('podcast-save-transcript',{role:'translation',text:text.replace('Hello','Değişti'),format:'vtt',timed:true,expectedTranscriptText:replacement});assert.equal(current.ok,true);
});

test('completed ASR keeps only its owned audio bytes, survives release, and detects replacement',async t=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'podcast-exact-'));
 t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
 const app=new EventEmitter(),body=Buffer.from('ID3 proof audio'),sha256=require('node:crypto').createHash('sha256').update(body).digest('hex');
 app.getPath=()=>dir;
 const service=registerFeeds({app,ipcMain:{handle(){}},authorized:()=>true,autoStart:false,grantMedia:()=>true,
  audioFetcher:async(_url,file)=>{fs.writeFileSync(file,body);return {bytes:body.length,sha256,mime:'audio/mpeg'};}});
 t.after(()=>service.dispose());
 const parsed=require('../src/feed-parser').parseFeed(xml,'https://feed.example/rss');
 service.store.subscribe({...parsed,url:'https://feed.example/rss'},parsed.entries);
 const entry=service.store.entries().rows[0];
 const call=(action,rest={},id=1)=>service.handle({sender:{id}},{action,entryId:entry.id,...rest});
 const audio=await call('podcast-audio',{sourceVersion:sourceVersion(entry),requestId:'audio-test'});
 assert(audio.ok,audio.error);
 const params={sourceVersion:audio.sourceVersion,downloadToken:audio.downloadToken,text,format:'vtt',timed:true,provenance:'asr',coverage:{start:0,end:2}};
 assert.equal((await call('podcast-save-transcript',params,2)).workspace.transcript.timeline,undefined);
 assert.equal((await call('podcast-exact-audio')).available,false);
 const saved=await call('podcast-save-transcript',params);
 assert.equal(saved.workspace.transcript.timeline.sha256,sha256);
 const hits=require('../src/media-shelf-service').searchPodcastTranscripts({},service.store.snapshot(),'Hello');
 assert.equal(hits[0].sourceBinding.fingerprintStatus,'cached-playback');
 await call('podcast-audio-release',{downloadToken:audio.downloadToken});
 assert.equal(fs.existsSync(audio.path),false);
 const exact=await call('podcast-exact-audio');
 assert.equal(exact.available,true);
 assert.deepEqual(fs.readFileSync(exact.path),body);
 fs.writeFileSync(exact.path,Buffer.alloc(body.length,9));
 assert.equal((await call('podcast-exact-audio')).available,false);
});

// --- Slice 1 / gereksinim 5: zamanlı VTT dublaj için zamanları korunarak türetilmiş SRT olur ---
const vttSource=['WEBVTT','','NOTE editor comment','','intro','00:01.250 --> 00:03.500 align:start position:10%','<v Ann>Hello &amp; welcome','to the show.</v>','','2','00:00:04.000 --> 00:00:06.500','Second <b>line</b>','','1:02:03.040 --> 1:02:05.000','Late cue',''].join('\n');
function materializeFixture(t){
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'podcast-dub-srt-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
 const app=new EventEmitter();app.getPath=()=>dir;const grants=[];
 const service=registerFeeds({app,ipcMain:{handle(){}},authorized:()=>true,autoStart:false,grantSubtitle:file=>grants.push(file)});t.after(()=>service.dispose?.());
 const parsed=require('../src/feed-parser').parseFeed(xml,'https://feed.example/rss');service.store.subscribe({...parsed,url:'https://feed.example/rss'},parsed.entries);
 const entry=service.store.entries().rows[0],version=sourceVersion(entry),event={sender:{id:9}};
 return {dir,grants,entry,version,api:(action,rest={})=>service.handle(event,{action,entryId:entry.id,sourceVersion:version,...rest})};
}
test('timed VTT becomes a dubbing SRT with the same times, text and order; the stored VTT is never touched',async t=>{
 const f=materializeFixture(t);
 assert.equal((await f.api('podcast-save-transcript',{text:vttSource,format:'vtt',timed:true})).ok,true);
 const plain=await f.api('podcast-materialize');assert.equal(path.extname(plain.path),'.vtt');
 const derived=await f.api('podcast-materialize',{as:'srt'});assert.equal(derived.ok,true,derived.error);
 assert.equal(path.extname(derived.path),'.srt');assert.notEqual(derived.path,plain.path);assert.equal(derived.derived,true);assert.equal(derived.format,'srt');
 assert.equal(fs.readFileSync(plain.path,'utf8'),vttSource,'özgün VTT dosyası değişmedi');
 const {parseSubtitlePayload}=require('../src/browser-subtitles'),cues=parseSubtitlePayload(fs.readFileSync(derived.path,'utf8')).cues;
 assert.deepEqual(cues.map(c=>[Math.round(c.start*1000),Math.round(c.end*1000),c.text.replace(/\s+/g,' ')]),[[1250,3500,'Hello & welcome to the show.'],[4000,6500,'Second line'],[3723040,3725000,'Late cue']],'zamanlar, metin ve sıra korunmalı');
 assert(f.grants.includes(derived.path),'türetilmiş dosya mevcut izin sahibinden yetkilendirilmeli');
 assert.equal((await f.api('podcast-materialize',{as:'srt'})).path,derived.path,'aynı sürüm aynı dosyayı verir');
 const srtOnly=await f.api('podcast-materialize',{as:'srt',role:'translation'});assert.equal(srtOnly.ok,false,'çeviri yokken boş dosya üretilmez');
});
test('an SRT transcript is used as stored and an unsupported target format is rejected',async t=>{
 const f=materializeFixture(t),srt='1\n00:00:01,000 --> 00:00:02,000\nMerhaba\n';
 assert.equal((await f.api('podcast-save-transcript',{text:srt,format:'srt',timed:true})).ok,true);
 const out=await f.api('podcast-materialize',{as:'srt'});assert.equal(out.ok,true,out.error);assert.equal(out.derived,false);assert.equal(fs.readFileSync(out.path,'utf8'),srt);
 assert.equal((await f.api('podcast-materialize',{as:'ass'})).ok,false);
});
test('dubbing derivation refuses input it cannot prove: no cues, reordered, repaired end time, merged duplicates',()=>{
 const {deriveDubSrt}=require('../src/podcast-dub-subtitle'),code=text=>{try{deriveDubSrt(text);return 'ok';}catch(error){return error.code;}};
 assert.equal(code('WEBVTT\n\nno cues here\n'),'no-timed-cues');
 assert.equal(code('WEBVTT\n\nNOTE 00:00:01.000 --> 00:00:02.000\n'),'no-timed-cues');
 assert.equal(code('WEBVTT\n\n00:05.000 --> 00:06.000\nB\n\n00:01.000 --> 00:02.000\nA\n'),'timing-not-preserved','sıra değiştiren girdi');
 assert.equal(code('WEBVTT\n\n00:01.000 --> 00:01.000\nZero\n'),'timing-not-preserved','uydurulmuş bitiş zamanı');
 assert.equal(code('WEBVTT\n\n00:01.000 --> 00:03.000\nSame\n\n00:01.400 --> 00:03.400\nSame\n'),'timing-not-preserved','birleştirilen yinelenen satır');
 assert.equal(code('WEBVTT\n\n00:01.000 --> 00:02.000\nOnly one\n'),'ok');
});

test('dubbing derivation cannot silently lose a malformed first cue or untimed speech block',()=>{
 const {deriveDubSrt}=require('../src/podcast-dub-subtitle');
 const valid='2\n00:00:03,000 --> 00:00:04,000\nKeep this line.\n';
 for(const first of ['1\ngarbage --> nonsense\nLost speech.','1\n00:00:bad --> 00:00:02,000\nLost speech.','1\n00:00:01,000 -> 00:00:02,000\nLost speech.','1\nLost untimed speech.']){
  assert.throws(()=>deriveDubSrt(first+'\n\n'+valid),e=>e.code==='timing-not-preserved');
 }
 assert.equal(deriveDubSrt('WEBVTT\n\nNOTE timing example: bad --> bad\n\n'+valid).cues,1,'real VTT metadata remains ignorable');
});

// --- Slice 1 / gereksinim 1 ve 8: zamanlı Podcast çevirisi gerçek handler'dan ortak kuyruğa, dondurulmuş seçeneklerle ---
function realQueueHarness(){
 const {JSDOM}=require('jsdom'),dom=new JSDOM(fs.readFileSync(path.join(__dirname,'../src/renderer/index.html'),'utf8'),{runScripts:'outside-only'}),w=dom.window,document=w.document;
 const source=fs.readFileSync(path.join(__dirname,'../src/renderer/renderer.js'),'utf8');
 const fn=name=>{const a=source.indexOf('\nfunction '+name+'(')+1,b=source.indexOf('\nfunction ',a+10),c=source.indexOf('\nasync function ',a+10);const end=[b,c].filter(i=>i>0).sort((x,y)=>x-y)[0];if(a<1)throw Error('bulunamadı: '+name);return source.slice(a,end);};
 const state={queue:[],queueRunning:false,running:false,podcastTextTasks:[]},player={mediaKey:'rss:A',generation:2,workspaceAudio:{entryId:'A',sourceVersion:'a'.repeat(64)},workspaceMode:'player'};
 const logs=[],context={window:{PodcastTaskScope:{}},document,state,player,Error,Promise,Number,String,Math,JSON,Object,Array,Date,
  $:id=>document.getElementById(id),$$:selector=>[...document.querySelectorAll(selector)],logLine:(...a)=>logs.push(a),renderQueue(){},startQueue(){state.queueRunning=true;},showJobValidation(){},clearJobValidation(){},
  QUEUE_UI_LIMIT:100,_queueIdCounter:0,_queueRejectReason:'',interfaceChoice:(tr)=>tr,
  queueInputKey:(type,input)=>type+':'+input,mediaKeyFor:(kind,input)=>kind+':'+input,glossaryCombined:()=>['Alpha=Beta'],optsProblemInfo:()=>null,
  resolveNetBudgetPreset:()=>({translateWorkers:4,concurrency:1}),updateQueueUi(){}};
 return {w,document,state,player,logs,context,source,fn};
}
test('timed Podcast translation enters the shared queue through the real handler with language, context and profile frozen at queue time',async()=>{
 const vm=require('node:vm'),h=realQueueHarness(),{document,state,player,source}=h;
 const set=(id,value)=>{const el=document.getElementById(id);if(el.type==='checkbox')el.checked=!!value;else el.value=value;};
 set('translateTo','de');set('translateContext','6');set('translateRegister',document.getElementById('translateRegister').options[1].value);set('translateProfanity',document.getElementById('translateProfanity').options[1].value);
 set('translateKeepSource',true);set('translateWorkers','2');
 const owner=source.slice(source.indexOf('function podcastQueueOwnerCurrent(binding)'),source.indexOf('// Podcast uses the existing frozen-options queue'));
 const handler=source.slice(source.indexOf('window.translatePodcastSource=async function'),source.indexOf('async function persistPodcastJobOutputs'));
 let code=owner+h.fn('addToQueue')+h.fn('buildOptsFromUI')+handler;
 const ctx=vm.createContext(h.context);vm.runInContext(code,ctx);
 // Real renderer helpers the handler needs are loaded from renderer.js itself (never replaced by stand-ins).
 const call=async binding=>{for(let attempt=0;attempt<25;attempt++){try{return await vm.runInContext('window.translatePodcastSource',ctx)(binding);}catch(error){const m=/^(\w+) is not defined$/.exec(error.message);if(!m||!source.includes('function '+m[1]+'('))throw error;state.queue.length=0;vm.runInContext(h.fn(m[1]),ctx);}}throw Error('çözülemeyen bağımlılık');};
 const chosen={register:document.getElementById('translateRegister').value,profanity:document.getElementById('translateProfanity').value};
 const binding={materializedPath:'C:/managed/a-source.srt',entryId:'A',sourceVersion:'a'.repeat(64),mediaKey:'rss:A',generation:2,playbackOwner:'player',sourceTranscriptText:'WEBVTT',track:{id:'src-A',revision:'r1',timed:true,language:'en'}};
 // translatePodcastSource reads the saved workspace through the feeds API before queueing.
 ctx.window.api={feedsRequest:async request=>request.action==='podcast-workspace'?{ok:true,sourceVersion:binding.sourceVersion,workspace:{transcript:{state:'timed',status:'complete',text:'WEBVTT'}}}:{ok:false}};
 ctx.window.MediaShelfUI=undefined;
 const result=await call(binding);
 assert.equal(result.queued,true);assert.equal(state.queue.length,1);
 const item=state.queue[0],opts=item.opts;
 assert.equal(item.type,'file');assert.equal(item.input,'C:/managed/a-source.srt');
 assert.equal(opts.translateOnly,true);assert.equal(opts.translate,true,'çeviri bu iş için açılır');assert.equal(opts.language,'en','kaynak dil izden gelir');
 assert.equal(opts.translateTo,'de');assert.equal(String(opts.translateContext),'6','bağlam ayarı kuyruk öğesine taşınır');
 assert.equal(opts.translateRegister,chosen.register);assert.equal(opts.translateProfanity,chosen.profanity);assert.equal(opts.translateKeepSource,true);
 assert.equal(opts.glossary,'Alpha=Beta','sözlük kuyruk anında dondurulur');assert.match(opts.outputNameSuffix,/^-whisper-podcast-a{12}$/);
 assert.deepEqual([item.podcastBinding.entryId,item.podcastBinding.outputRole,item.podcastBinding.targetLanguage,item.podcastBinding.expectedTranslation],['A','translation','de',true]);
 // Settings change and the user moves to episode B: the queued job keeps its own frozen options and its episode.
 set('translateTo','fr');set('translateContext','0');set('translateRegister',document.getElementById('translateRegister').options[0].value);
 Object.assign(player,{mediaKey:'rss:B',generation:3,workspaceAudio:{entryId:'B',sourceVersion:'b'.repeat(64)}});
 assert.equal(item.opts.translateTo,'de');assert.equal(String(item.opts.translateContext),'6');assert.equal(item.opts.translateRegister,chosen.register);assert.equal(item.podcastBinding.entryId,'A');
 await assert.rejects(call(binding),/changed|değişti/,'B açıkken A’nın bağıyla yeni iş eklenmez');assert.equal(state.queue.length,1);
});

// --- Slice 1 / gereksinim 8 (5B): A'da hazırlanan iş, B'ye geçildikten sonra tamamlanır ---
const abXml='<rss><channel><title>Show</title><item><guid>A</guid><title>Episode A</title><enclosure url="https://audio.example/a.mp3" type="audio/mpeg"/></item><item><guid>B</guid><title>Episode B</title><enclosure url="https://audio.example/b.mp3" type="audio/mpeg"/></item></channel></rss>';
async function abHarness(t,{playerOn}){
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'podcast-ab-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
 const app=new EventEmitter();app.getPath=()=>dir;
 const service=registerFeeds({app,ipcMain:{handle(){}},authorized:()=>true,autoStart:false,grantSubtitle(){}});t.after(()=>service.dispose?.());
 const parsed=require('../src/feed-parser').parseFeed(abXml,'https://feed.example/rss');service.store.subscribe({...parsed,url:'https://feed.example/rss'},parsed.entries);
 const rows=service.store.entries({kind:'podcast'}).rows,event={sender:{id:5}};
 const entry=title=>rows.find(row=>row.title===title),A=entry('Episode A'),B=entry('Episode B'),vA=sourceVersion(A),vB=sourceVersion(B);
 const api=(action,rest={})=>service.handle(event,{action,...rest});
 const srcA='WEBVTT\n\n00:00:01.000 --> 00:00:03.000\nHello A\n',srcB='WEBVTT\n\n00:00:01.000 --> 00:00:03.000\nHello B\n',trA='WEBVTT\n\n00:00:01.000 --> 00:00:03.000\nMerhaba A\n';
 assert.equal((await api('podcast-save-transcript',{entryId:A.id,sourceVersion:vA,text:srcA,format:'vtt',timed:true})).ok,true);
 assert.equal((await api('podcast-save-transcript',{entryId:B.id,sourceVersion:vB,text:srcB,format:'vtt',timed:true})).ok,true);
 const vm=require('node:vm'),source=fs.readFileSync(path.join(__dirname,'../src/renderer/renderer.js'),'utf8');
 const cut=(from,to)=>source.slice(source.indexOf(from),source.indexOf(to,source.indexOf(from)));
 const code=cut('function podcastQueueOwnerCurrent(binding)','// Podcast uses the existing frozen-options queue')+cut('function completedSubtitleOutputs','\nfunction rememberPendingPlayerLoad')+cut('async function persistPodcastJobOutputs','\nasync function releasePodcastQueueItem');
 const player=playerOn==='A'?{mediaKey:'rss:A',generation:2,workspaceAudio:{entryId:A.id,sourceVersion:vA,mediaKey:'rss:A',generation:2},subPath:'C:/t/A.vtt',sub2Path:'',workspaceMode:'player'}:{mediaKey:'rss:B',generation:3,workspaceAudio:{entryId:B.id,sourceVersion:vB,mediaKey:'rss:B',generation:3},subPath:'C:/t/B.vtt',sub2Path:'',workspaceMode:'player'};
 const spies={loaded:[],applied:[],logs:[]},files={'C:/out/A.tr.srt':'1\n00:00:01,000 --> 00:00:03,000\nMerhaba A\n'};
 const ctx=vm.createContext({window:{SubtitleOutputContract:require('../src/subtitle-output-contract'),api:{feedsRequest:input=>service.handle(event,input),readSubtitle:async file=>({ok:true,text:files[file]})},
  PlayerSourceCatalogIntegration:{loadSavedPodcastResult:async role=>{spies.loaded.push(role);}},MediaShelfUI:{applyPodcastOutput:async value=>{spies.applied.push(value);},setPodcastRecovery(){},readSnapshot:()=>null}},
  player,state:{queue:[]},Error,Promise,JSON,Object,Array,Number,String,logLine:(...a)=>spies.logs.push(a),setTimeout});
 vm.runInContext('const subtitleOutputContract=window.SubtitleOutputContract;\n'+code+';globalThis.persist=persistPodcastJobOutputs;',ctx);
 const binding={entryId:A.id,sourceVersion:vA,outputRole:'translation',sourceTranscriptText:srcA,targetLanguage:'tr',playbackOwner:'player',mediaKey:'rss:A',generation:2,expectedTranslation:true};
 const event2={outputs:[{role:'translation',path:'C:/out/A.tr.srt',status:'complete'}]};
 return {api,A,B,vA,vB,srcA,srcB,trA,player,spies,binding,context:ctx,event:event2,persist:()=>ctx.persist(event2,binding)};
}
test('A job queued for A that finishes after the user moved to B is saved to A only; B is untouched and A reopens with the result',async t=>{
 const h=await abHarness(t,{playerOn:'B'});
 await h.persist();
 assert.equal(h.binding.persistence,'saved');
 const a=await h.api('podcast-workspace',{entryId:h.A.id,sourceVersion:h.vA}),b=await h.api('podcast-workspace',{entryId:h.B.id,sourceVersion:h.vB});
 assert.match(a.workspace.translation.text,/Merhaba A/);assert.equal(a.workspace.translation.state,'timed');assert.equal(a.workspace.transcript.text,h.srcA,'A’nın kaynağı değişmedi');
 assert.equal(b.workspace.translation,undefined,'B’ye çeviri yazılmadı');assert.equal(b.workspace.transcript.text,h.srcB);
 assert.deepEqual(h.spies.loaded,[],'B açıkken yeni bölümde iz otomatik seçilmedi');assert.deepEqual(h.spies.applied,[]);
 assert.deepEqual([h.player.mediaKey,h.player.generation,h.player.subPath,h.player.sub2Path],['rss:B',3,'C:/t/B.vtt',''],'B’nin oynatıcı durumu değişmedi');
 assert.deepEqual(h.spies.logs,[],'B’de hata/ilerleme üretilmedi');
 const reopened=await h.api('podcast-materialize',{entryId:h.A.id,sourceVersion:h.vA,role:'translation'});
 assert.equal(reopened.ok,true,reopened.error);assert.match(fs.readFileSync(reopened.path,'utf8'),/Merhaba A/,'A yeniden açılınca kayıtlı sonuç mevcut yoldan bulunur');
 assert.equal((await h.api('podcast-materialize',{entryId:h.B.id,sourceVersion:h.vB,role:'translation'})).ok,false,'B’nin çevirisi yok');
});
test('the same job finishing while A is still the open episode loads its translation into the player (positive control)',async t=>{
 const h=await abHarness(t,{playerOn:'A'});
 await h.persist();
 assert.deepEqual(h.spies.loaded,['translation']);
});

// A verified copy is an intentional playback handoff, never permission to bind another episode.
test('verified same-episode audio handoff keeps the completed job attached to its new playback generation',async t=>{
 const h=await abHarness(t,{playerOn:'A'});
 h.context.window.PlayerSourceCatalogIntegration.loadSavedPodcastResult=async()=>{
  const previous={entryId:h.A.id,mediaKey:h.player.mediaKey,generation:h.player.generation,sourceVersion:h.vA};
  h.player.mediaKey='copy:A';h.player.generation=4;h.player.workspaceAudio={entryId:h.A.id,mediaKey:'copy:A',generation:4,sourceVersion:h.vA,exactAudio:true};
  return {ok:true,playbackHandoff:{previous,current:{entryId:h.A.id,mediaKey:'copy:A',generation:4,sourceVersion:h.vA}}};
 };
 await h.persist();assert.equal(h.binding.persistence,'saved');assert.equal(h.binding.mediaKey,'copy:A');assert.equal(h.binding.generation,4);assert.equal(h.binding.outputReceipts.translation.applied,true);
});

test('a mismatched playback handoff cannot retarget the job to a later unrelated owner',async t=>{
 const h=await abHarness(t,{playerOn:'A'});
 h.context.window.PlayerSourceCatalogIntegration.loadSavedPodcastResult=async()=>{
  h.player.mediaKey='rss:B';h.player.generation=9;h.player.workspaceAudio={entryId:h.B.id,mediaKey:'rss:B',generation:9,sourceVersion:h.vB,exactAudio:true};
  return {ok:true,playbackHandoff:{previous:{entryId:h.A.id,mediaKey:'unrelated',generation:2,sourceVersion:h.vA},current:{entryId:h.B.id,mediaKey:'rss:B',generation:9,sourceVersion:h.vB}}};
 };
 await h.persist();assert.equal(h.binding.mediaKey,'rss:A');assert.equal(h.binding.generation,2);assert.equal(h.binding.outputReceipts.translation.applied,null);assert.equal(h.player.workspaceAudio.entryId,h.B.id);
});
