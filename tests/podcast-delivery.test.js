'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),vm=require('node:vm'),{EventEmitter}=require('node:events'),{Readable}=require('node:stream');
const {registerFeeds}=require('../src/feed-service'),{sourceVersion,validateTimedText}=require('../src/podcast-session');
const xml='<rss xmlns:podcast="https://podcastindex.org/namespace/1.0"><channel><title>Show</title><item><guid>one</guid><title>Episode</title><enclosure url="https://audio.example/one.mp3" type="audio/mpeg"/><podcast:transcript url="https://text.example/one.vtt" type="text/vtt"/></item></channel></rss>';
const text='WEBVTT\n\n00:00:00.000 --> 00:00:02.000\nHello\n';
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
 const source=fs.readFileSync(path.join(__dirname,'../src/renderer/renderer.js'),'utf8'),start=source.indexOf('window.queuePodcastSource=async function(binding)'),end=source.indexOf('\nasync function persistPodcastJobOutputs',start);const state={queue:[],queueRunning:false,running:false},player={mediaKey:'rss:1',generation:2};let starts=0,adds=0;const context={window:{},state,player,Error,renderQueue(){},startQueue(){starts++;state.queueRunning=true;},addToQueue(type,input){adds++;state.queue.push({opts:{language:'tr'},type,input});return true;}};const owner=source.slice(source.indexOf('function podcastQueueOwnerCurrent(binding)'),source.indexOf('// Podcast uses the existing frozen-options queue'));vm.runInNewContext(owner+source.slice(start,end),context);
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
 const context={player:{job,mediaKey:'A',generation:2,workspaceMode:'player',cues2:[]},state:{running:true,outputFiles:[]},$:()=>node,persistPodcastJobOutputs:async(e,b)=>{saved.push([e,b]);},updateBrowserWhisperActions:noop,updateMakeTransState:noop,updatePlayerAutoSyncState:noop,setTimeout:noop,logLine:noop,refreshHistory:noop};const helper=source.slice(source.indexOf('function podcastJobMatchesCurrent(job)'),source.indexOf('// Podcast uses the existing frozen-options queue'));vm.runInNewContext(helper+source.slice(start,end)+';globalThis.handle=playerJobEvent;',context);
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
