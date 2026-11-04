'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),{EventEmitter}=require('node:events');
const {parseFeed}=require('../src/feed-parser');
const {createFeedStore}=require('../src/feed-store');
const {registerFeeds}=require('../src/feed-service');
const {fetchPodcastTranscript}=require('../src/podcast-transcript-service');
const xml='<rss xmlns:podcast="https://podcastindex.org/namespace/1.0"><channel><title>Show</title><language>tr</language><item><guid>ep1</guid><title>Episode</title><enclosure url="https://audio.example/ep.mp3" type="audio/mpeg"/><podcast:transcript url="https://text.example/ep.vtt" type="text/vtt" language="tr"/><podcast:transcript url="https://localhost/secret" type="text/plain"/></item></channel></rss>';
test('RSS descriptors survive actual feed-store reload and feed IPC selects only a stored revision-bound descriptor',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'podcast-integration-'));const app=new EventEmitter();app.getPath=()=>dir;
 let calls=0;const event={sender:{id:1}},service=registerFeeds({app,ipcMain:{handle(){}},authorized:e=>e===event,autoStart:false,transcriptFetcher:async descriptor=>{calls++;assert.equal(descriptor.url,'https://text.example/ep.vtt');return {ok:true,timed:'yes',format:'vtt',text:'WEBVTT\n\n00:00:00.000 --> 00:00:01.000\nHello'};}});
 try{
  const parsed=parseFeed(xml,'https://feed.example/rss');assert.equal(parsed.entries[0].transcriptDescriptors.length,1);
  service.store.subscribe({...parsed,url:'https://feed.example/rss'},parsed.entries);
  const entry=service.store.entries().rows[0];assert.equal(entry.kind,'podcast');
  const file=fs.readdirSync(dir).find(f=>f.endsWith('.json'));const loaded=createFeedStore(path.join(dir,file));assert.equal(loaded.entry(entry.id).transcriptDescriptors[0].mime,'text/vtt');
  assert.equal((await service.handle({}, {action:'podcast-transcript',entryId:entry.id})).ok,false);assert.equal(calls,0);
  assert.equal((await service.handle(event,{action:'podcast-transcript',entryId:entry.id,revision:'stale'})).ok,false);assert.equal(calls,0);
  assert.equal((await service.handle(event,{action:'podcast-transcript',entryId:entry.id,revision:entry.revision,url:'https://attacker.example/ignored'})).timed,'yes');assert.equal(calls,1);
 }finally{service.dispose();fs.rmSync(dir,{recursive:true,force:true});}
});
test('Transcript transport pins every redirect, rejects private targets and enforces body limit and HTTP error distinctions',async()=>{
 const descriptor={url:'https://one.example/t.vtt',mime:'text/vtt'};const pinned=[];
 const options={publicPin:async url=>{pinned.push(url);return {address:'93.184.216.34',family:4};},pinnedRequest:async(url,pin,opts)=>{assert.equal(opts.maxBytes,5*1024*1024);return url.includes('one.')?{status:302,headers:new Headers({location:'https://two.example/t.vtt'}),buffer:Buffer.alloc(0)}:{status:200,headers:new Headers({'content-type':'text/vtt'}),buffer:Buffer.from('WEBVTT\n\n00:00:00.000 --> 00:00:01.000\nHello')};}};
 const result=await fetchPodcastTranscript(descriptor,options);assert.equal(result.timed,'yes');assert.equal(pinned.length,2);
 await assert.rejects(fetchPodcastTranscript(descriptor,{...options,pinnedRequest:async()=>({status:302,headers:new Headers({location:'https://127.0.0.1/x'}),buffer:Buffer.alloc(0)})}),/Unsafe/);
 for(const [status,code]of [[403,'forbidden'],[429,'rate-limited'],[503,'unavailable']])assert.equal((await fetchPodcastTranscript(descriptor,{...options,pinnedRequest:async()=>({status,headers:new Headers(),buffer:Buffer.alloc(0)})})).code,code);
 assert.equal((await fetchPodcastTranscript(descriptor,{...options,pinnedRequest:async()=>({status:200,headers:new Headers({'content-type':'text/vtt'}),buffer:Buffer.alloc(5*1024*1024+1)})})).code,'too-large');
 await assert.rejects(fetchPodcastTranscript({...descriptor,url:'https://private.example/x'},{...options,publicPin:async()=>{throw Error('Private DNS rejected');}}),/Private DNS/);
});

test('Workspace export, review and restore retain feed descriptors and source pins',t=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'podcast-workspace-'));
 t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
 const source=path.join(dir,'source'),target=path.join(dir,'target');
 fs.mkdirSync(source);fs.mkdirSync(target);
 const store=createFeedStore(path.join(source,'feeds.json'));
 const parsed=parseFeed(xml,'https://feed.example/rss');
 store.subscribe({...parsed,url:'https://feed.example/rss'},parsed.entries);
 store.sourcePins(['yt:channel']);
 const workspace=require('../src/workspace-package');
 const file=path.join(dir,'backup.wbp');
 workspace.exportPackage(source,file);
 const packet=workspace.readPackage(file);
 assert.equal(workspace.describePackage(packet).playerSourcePins,1);
 workspace.restorePackage(target,packet);
 const restored=createFeedStore(path.join(target,'feeds.json'));
 assert.deepEqual(restored.sourcePins(),['yt:channel']);
 assert.equal(restored.entries().rows[0].transcriptDescriptors[0].mime,'text/vtt');
});

test('Generic MIME is accepted for a declared timed transcript only when bytes match its format',async()=>{
 const descriptor={url:'https://example.org/episode.srt',mime:'application/srt'};
 const get=body=>fetchPodcastTranscript(descriptor,{
  publicPin:async()=>({address:'8.8.8.8',family:4}),
  pinnedRequest:async()=>({status:200,headers:new Headers({'content-type':'application/octet-stream'}),buffer:Buffer.from(body)})
 });
 const srt=await get('1\n00:00:00,000 --> 00:00:02,000\nExample\n');
 assert.equal(srt.format,'srt');assert.equal(srt.timed,'yes');
 assert.equal((await get('<html>Not a transcript</html>')).code,'mime-mismatch');
 assert.equal((await get('WEBVTT\n\n00:00.000 --> 00:02.000\nExample')).code,'mime-mismatch');
});
