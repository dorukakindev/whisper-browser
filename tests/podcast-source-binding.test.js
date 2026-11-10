'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),{createHash}=require('node:crypto'),{EventEmitter}=require('node:events'),{Readable}=require('node:stream');
const session=require('../src/podcast-session'),{createFeedStore}=require('../src/feed-store');
const digest=body=>createHash('sha256').update(body).digest('hex');
const row={kind:'podcast',contentScope:'summary',externalId:'same-guid',title:'Episode',text:'Summary',enclosures:[{url:'https://audio.example/episode.mp3',type:'audio/mpeg',length:8}]};
const evidence=(body,etag='"one"')=>({bytes:Buffer.byteLength(body),sha256:digest(body),etag});
test('episode identity and physical binding remain separate; URL credentials and unknown bytes are explicit',()=>{
 const e={...row,enclosures:[{...row.enclosures[0],url:'https://audio.example/episode.mp3?token=secret'}],id:'local1',feedId:'feed1'},b=session.sourceBinding(e);
 assert.equal(b.fingerprintStatus,'unknown');for(const k of ['etag','length','sha256','probe'])assert.equal(b[k],'unknown');
 assert.doesNotMatch(JSON.stringify(b),/secret|token/);
 assert.equal(session.sourceVersion(e),session.sourceVersion({...e,title:'Renamed',enclosures:[{...e.enclosures[0],url:'https://audio.example/episode.mp3?token=rotated#fragment'}]}));
 assert.equal(session.episodeIdentity(e),session.episodeIdentity({...e,id:'other-local',title:'Renamed'}));
 assert.notEqual(session.episodeIdentity(e),session.episodeIdentity({...e,feedId:'feed2'}));
 assert.notEqual(session.sourceVersion(e),session.sourceVersion({...e,enclosures:[{...e.enclosures[0],url:'https://audio.example/rebound.mp3'}]}));
});
test('verified download change retires old transcript/position and survives reload; source relink cannot revive stale evidence',t=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'podcast-binding-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));const file=path.join(dir,'feeds.json'),store=createFeedStore(file);
 const subscribed=store.subscribe({url:'https://feed.example/rss',format:'rss'},[row]);let e=store.entries().rows[0],v=session.sourceVersion(e);const initialVersion=v;
 store.podcastWorkspace(e.id,v,{position:45,rate:1.5,transcript:{state:'untimed',text:'Original',format:'plain',provenance:'user'}});
 let binding=store.podcastAudioEvidence(e.id,v,evidence('ID3audio'));
 assert.notEqual(binding.sourceVersion,v);assert.equal(binding.workspace.position,0);assert.equal(binding.workspace.previous.position,45);assert.equal(binding.workspace.transcript,undefined);
 v=binding.sourceVersion;store.podcastWorkspace(e.id,v,{position:12,transcript:{state:'untimed',text:'Verified original',format:'plain',provenance:'asr'}});
 binding=store.podcastAudioEvidence(e.id,v,evidence('ID3audio'));assert.equal(binding.sourceVersion,v);assert.equal(binding.workspace.position,12);
 binding=store.podcastAudioEvidence(e.id,v,evidence('ID3other'));assert.notEqual(binding.sourceVersion,v);assert.equal(binding.workspace.previous.transcript.text,'Verified original');assert.equal(binding.workspace.transcript,undefined);
 let restored=createFeedStore(file);e=restored.entry(e.id);assert.equal(session.sourceBinding(e).sha256,digest('ID3other'));assert.equal(e.podcastWorkspace.previous.position,12);
 store.commit(subscribed.feed.id,{entries:[{...row,enclosures:[{...row.enclosures[0],url:'https://audio.example/new.mp3'}]}]});
 store.commit(subscribed.feed.id,{entries:[row]});e=store.entry(e.id);assert.equal(session.sourceBinding(e).fingerprintStatus,'unknown');assert.equal(e.podcastAudioEvidence,undefined);assert.notEqual(session.sourceVersion(e),initialVersion);assert.equal(session.sourceBinding(e).revision,4);assert.equal(e.podcastWorkspace.previous.transcript.text,'Verified original');
 const pack=require('../src/workspace-package'),backup=path.join(dir,'binding.wbp'),target=path.join(dir,'restored');pack.exportPackage(dir,backup);fs.mkdirSync(target);pack.restorePackage(target,pack.readPackage(backup));const copy=createFeedStore(path.join(target,'feeds.json')).entry(e.id);assert.equal(session.sourceVersion(copy),session.sourceVersion(e));assert.equal(copy.podcastWorkspace.previous.transcript.text,'Verified original');
 assert.throws(()=>store.podcastAudioEvidence(e.id,session.sourceVersion(e),{bytes:8,sha256:'fake',etag:'bad'}),/evidence/);
});
test('bounded existing transport hashes actual bytes and validates HTTP length without network',async t=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'podcast-hash-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));const {acquireAudio}=require('../src/podcast-audio'),body='ID3audio';
 const transport=headers=>({request(_url,_opts,callback){const req=new EventEmitter();req.setTimeout=()=>{};req.end=()=>{const response=Readable.from([Buffer.from('ID3'),Buffer.from('audio')]);response.statusCode=200;response.headers={'content-type':'audio/mpeg',...headers};callback(response);};return req;}});
 const options=headers=>({publicPin:async()=>({address:'8.8.8.8',family:4}),transport:transport(headers),maxBytes:16}),file=path.join(dir,'managed.audio');
 const result=await acquireAudio('https://audio.example/episode?secret=hidden',file,options({'content-length':'8',etag:'"revision"'}));assert.equal(result.sha256,digest(body));assert.equal(result.bytes,8);assert.equal(result.etag,'"revision"');assert.equal(result.probe,'unknown');assert.doesNotMatch(JSON.stringify(result),/hidden|secret/);
 const failed=path.join(dir,'bad.audio');await assert.rejects(acquireAudio('https://audio.example/episode',failed,options({'content-length':'9'})),/length mismatch/);assert.equal(fs.existsSync(failed),false);
 await assert.rejects(acquireAudio('https://audio.example/episode',failed,options({'content-length':'nonsense'})),/Invalid.*length/);assert.equal(fs.existsSync(failed),false);
});

test('shelf processing bridge reuses one feed registry without overwriting subscriptions, personal state or other entries',t=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'podcast-registry-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));const app=new EventEmitter();app.getPath=()=>dir;let requests=0;
 const service=require('../src/feed-service').registerFeeds({app,ipcMain:{handle(){}},authorized:()=>true,autoStart:false,fetchValidated:()=>{requests++;throw Error('Unexpected network');}});t.after(()=>service.dispose());
 const input={podcast:{id:'shelf-show',url:'https://feed.example/rss',title:'Shelf show',publisher:'Publisher',language:'tr'},episode:{guid:'same-guid',url:row.enclosures[0].url,title:'Shelf episode',description:'Shelf description',duration:123,enclosureType:'audio/mpeg',enclosureLength:8,transcriptDescriptors:[{url:'https://text.example/one.vtt',mime:'text/vtt',language:'tr'}]}};
 const first=service.bindShelfPodcast(input);assert.equal(first.entryId,service.store.entries().rows[0].id);assert.equal(first.episodeIdentity,first.sourceBinding.episodeIdentity);assert.equal(service.store.list().feeds[0].enabled,false);assert.equal(service.store.entry(first.entryId).transcriptDescriptors[0].mime,'text/vtt');
 service.store.updateFeed(service.store.list().feeds[0].id,{enabled:true,title:'Personal title',intervalMinutes:300});service.store.setState([first.entryId],{saved:true,read:true});service.store.podcastWorkspace(first.entryId,first.sourceVersion,{position:37,transcript:{state:'untimed',text:'Saved user transcript',format:'plain',provenance:'user'}});
 const before=service.store.snapshot(),again=service.bindShelfPodcast({...input,podcast:{...input.podcast,title:'Overwrite'},episode:{...input.episode,title:'Overwrite',description:'Overwrite'}});assert.equal(again.workspace.position,37);assert.equal(again.workspace.transcript.text,'Saved user transcript');assert.deepEqual(service.store.snapshot(),before);
 const next=service.bindShelfPodcast({...input,episode:{...input.episode,guid:'second',url:'https://audio.example/second.mp3'}});assert.notEqual(next.entryId,first.entryId);assert.deepEqual(service.store.list().feeds,before.feeds);assert.deepEqual(service.store.entry(first.entryId).podcastWorkspace,again.workspace);assert.equal(service.store.entry(first.entryId).title,'Shelf episode');assert.equal(service.store.entry(first.entryId).saved,true);
 const loaded=createFeedStore(path.join(dir,'feeds.json'));assert.equal(loaded.entry(first.entryId).podcastWorkspace.position,37);assert.equal(loaded.snapshot().entries.length,2);assert.equal(requests,0);
 assert.throws(()=>service.bindShelfPodcast({...input,podcast:{...input.podcast,url:'https://user:secret@feed.example/rss'}}),/source/);
 assert.throws(()=>service.bindShelfPodcast({...input,episode:{...input.episode,enclosureLength:-1}}),/length/);
});

test('publisher Retry-After accepts HTTP dates and blocks explicit requests until cooldown without retrying',async()=>{
 const {createTranscriptRequester,retryAfterSeconds}=require('../src/podcast-transcript-service');let stamp=Date.UTC(2026,10,4,12),calls=0;const descriptor={url:'https://text.example/transcript.vtt?signature=one',mime:'text/vtt'};
 assert.equal(retryAfterSeconds('30',stamp),30);assert.equal(retryAfterSeconds(new Date(stamp+60000).toUTCString(),stamp),60);assert.equal(retryAfterSeconds('nonsense',stamp),null);
 const request=createTranscriptRequester(async()=>{calls++;return calls===1?{ok:false,code:'unavailable',retryAfterSeconds:60}:{ok:true,text:'Cached publisher'};},{now:()=>stamp});
 assert.equal((await request(descriptor)).code,'unavailable');assert.equal(calls,1);stamp+=10000;const waiting=await request({...descriptor,url:'https://text.example/transcript.vtt?signature=rotated'});assert.equal(waiting.ok,false);assert.equal(waiting.code,'unavailable');assert.equal(waiting.retryAfterSeconds,50);assert.equal(calls,1);stamp+=50000;assert.equal((await request(descriptor)).ok,true);assert.equal(calls,2);
});

test('publisher HTTP status metadata and invalid UTF8 stay failures through existing bounded transport',async()=>{
 const descriptor={url:'https://text.example/one.vtt',mime:'text/vtt'},now=()=>Date.UTC(2026,10,4,12),fetch=require('../src/podcast-transcript-service').fetchPodcastTranscript;
 const options=(status,buffer=Buffer.alloc(0))=>({now,publicPin:async()=>({address:'8.8.8.8',family:4}),pinnedRequest:async()=>({status,headers:new Headers({'content-type':'text/vtt','retry-after':new Date(now()+45000).toUTCString()}),buffer})});
 for(const [status,code]of [[403,'forbidden'],[404,'not-found'],[429,'rate-limited'],[503,'unavailable']]){const result=await fetch(descriptor,options(status));assert.equal(result.ok,false);assert.equal(result.code,code);if(status===429||status===503)assert.equal(result.retryAfterSeconds,45);}
 await assert.rejects(fetch(descriptor,options(200,Buffer.from([0xff,0xff]))),/encoded data|encoding/i);
});

test('a saved translation tied to another audio copy is read-only even beside a publisher transcript',async()=>{
 const fs=require('node:fs'),vm=require('node:vm'),code=fs.readFileSync(require.resolve('../src/renderer/player-source-catalog-integration'),'utf8');
 const load=code.slice(code.indexOf('  const savedPodcastResultLoads'),code.indexOf('  function podcastTools('));
 for(const [exact,hash,canLoad] of [[false,'different-audio',false],[true,'different-audio',false],[true,'current-audio',true]]){
  const calls=[],audio={entryId:'entry',mediaKey:'A',generation:1,sourceVersion:'v',exactAudio:exact,sourceBinding:{sha256:'current-audio'}};
  const context={player:{workspaceAudio:audio,mediaKey:'A',generation:1},window:{PlayerWorkspaceIntegration:{refresh(){}},PodcastTaskScope:{stamp:String}},
   t:tr=>tr,parseSubtitles:()=>[{text:'Saved translation'}],loadSubtitle:async(...args)=>{calls.push(args);context.player.sub2Path=args[0];},
   api:async req=>req.action==='podcast-workspace'?{sourceVersion:'v',workspace:{transcript:{provenance:'publisher',state:'timed'},translation:{provenance:'asr',state:'timed',text:'stored',timeline:{sha256:hash}}}}:{path:'C:/translation.srt'}};
  vm.createContext(context);vm.runInContext(load,context);await context.loadSavedPodcastResult('translation');
  assert.equal(calls.length,canLoad?1:0);assert.equal(audio.transcriptState,canLoad?'timed':'untimed');if(!canLoad)assert.equal(audio.translationText,'Saved translation');
 }
});

test('late saved result lookup cannot replace a newer choice for the same episode',async()=>{
 const fs=require('node:fs'),vm=require('node:vm'),code=fs.readFileSync(require.resolve('../src/renderer/player-source-catalog-integration'),'utf8');
 const start=code.indexOf('  const savedPodcastResultLoads');const load=code.slice(start>=0?start:code.indexOf('  async function loadSavedPodcastResult('),code.indexOf('  function podcastTools('));
 const audio={entryId:'entry',mediaKey:'A',generation:1,sourceVersion:'v'};let release,calls=0;
 const result=text=>({sourceVersion:'v',workspace:{transcript:{state:'untimed',text}}});
 const context={player:{workspaceAudio:audio,mediaKey:'A',generation:1},window:{PlayerWorkspaceIntegration:{refresh(){}}},t:tr=>tr,parseSubtitles:()=>[],api:()=>++calls===1?new Promise(r=>release=r):Promise.resolve(result('New saved text'))};
 vm.createContext(context);vm.runInContext(load,context);const old=context.loadSavedPodcastResult();await context.loadSavedPodcastResult();release(result('Old saved text'));await old;assert.equal(audio.transcriptText,'New saved text');
});

test('a failed saved subtitle read is not reported as loaded just because its old path is still selected',async()=>{
 const fs=require('node:fs'),vm=require('node:vm'),code=fs.readFileSync(require.resolve('../src/renderer/player-source-catalog-integration'),'utf8');const load=code.slice(code.indexOf('  const savedPodcastResultLoads'),code.indexOf('  function podcastTools('));
 const audio={entryId:'entry',mediaKey:'A',generation:1,sourceVersion:'v'};
 const context={player:{workspaceAudio:audio,mediaKey:'A',generation:1,subPath:'C:/saved.srt'},window:{PlayerWorkspaceIntegration:{refresh(){throw Error('Must not refresh as success');}}},t:tr=>tr,loadSubtitle:async()=>({ok:false,error:'Saved file disappeared'}),api:async req=>req.action==='podcast-workspace'?{sourceVersion:'v',workspace:{transcript:{state:'timed',text:'Stored',provenance:'publisher'}}}:{path:'C:/saved.srt'}};
 vm.createContext(context);vm.runInContext(load,context);await assert.rejects(()=>context.loadSavedPodcastResult(),/Saved file disappeared/);
});

test('managed podcast storage inventory distinguishes preparation, ASR cache and text copies without exposing paths or deleting files',t=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'podcast-inventory-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));const path1=path.join(dir,'podcast-audio'),path2=path.join(path1,'transcript-cache'),path3=path.join(dir,'podcast-transcripts');for(const p of [path1,path2,path3])fs.mkdirSync(p,{recursive:true});fs.writeFileSync(path.join(path1,'pending.partial'),'ID3');fs.writeFileSync(path.join(path2,'a'.repeat(64)+'.mp3'),'cache');fs.writeFileSync(path.join(path3,'a.srt'),'source copy');const r=require('../src/podcast-storage').inventory({root:dir,entries:[],managed:[]});assert.equal(r.totalFiles,3);assert.equal(r.groups.preparation.files,1);assert.equal(r.groups.exactAudio.files,1);assert.equal(r.groups.textCopies.files,1);assert.equal(r.partial,false);assert(!JSON.stringify(r).includes(dir));assert.equal(fs.readFileSync(path.join(path3,'a.srt'),'utf8'),'source copy');
});

test('P02 real HTTP range handshake never mixes changed bytes; 200/206/416, bad validators and tampering are distinct',async t=>{
 const http=require('node:http'),{acquireAudio}=require('../src/podcast-audio'),root=fs.mkdtempSync(path.join(os.tmpdir(),'podcast-range-')),file=path.join(root,'managed.partial'),body=Buffer.from('ID3abcdefghi'),fresh=Buffer.from('ID3NEWuvwxyz');let mode='interrupt',lastHeaders,calls=0;
 const server=http.createServer((req,res)=>{calls++;lastHeaders=req.headers;const headers={'Content-Type':'audio/mpeg',ETag:'"v1"','Accept-Ranges':'bytes'};
 if(mode==='interrupt'||mode==='weak'){res.writeHead(200,{...headers,ETag:mode==='weak'?'W/"v1"':'"v1"','Content-Length':body.length});res.write(body.subarray(0,6));const deadline=Date.now()+5000,timer=setInterval(()=>{let written=false;try{written=fs.statSync(file).size===6;}catch{}if(written||Date.now()>deadline){clearInterval(timer);res.destroy();}},10);res.on('close',()=>clearInterval(timer));return;}
 if(mode==='restart'){res.writeHead(200,{...headers,ETag:'"v2"','Content-Length':fresh.length});res.end(fresh);return;}
 if(mode==='busy'){res.writeHead(429,{'Retry-After':'1'});res.end();return;}
 if(mode==='complete'){res.writeHead(416,{...headers,'Content-Range':'bytes */12'});res.end();return;}
 res.writeHead(206,{...headers,ETag:mode==='changed'?'"v2"':'"v1"','Content-Length':6,'Content-Range':mode==='bad-range'?'bytes 7-11/12':'bytes 6-11/12'});res.end(body.subarray(6));});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));t.after(async()=>{await new Promise(r=>server.close(r));fs.rmSync(root,{recursive:true,force:true});});
 const url='http://audio.example:'+server.address().port+'/episode?fixture=private',options={publicPin:async()=>({address:'127.0.0.1',family:4}),maxBytes:32,retainPartial:true},partial=async()=>{mode='interrupt';await assert.rejects(acquireAudio(url,file,options));assert.equal(fs.statSync(file).size,6);assert(!fs.readFileSync(file+'.resume.json','utf8').includes('private'));};
 await partial();mode='resume';let result=await acquireAudio(url,file,{...options,resume:true});assert.equal(lastHeaders.range,'bytes=6-');assert.equal(lastHeaders['if-range'],'"v1"');assert.equal(result.resumeState,'resumed');assert.equal(result.sha256,digest(body));assert.deepEqual(fs.readFileSync(file),body);
 await partial();mode='restart';result=await acquireAudio(url,file,{...options,resume:true});assert.equal(result.resumeState,'restarted-200');assert.deepEqual(fs.readFileSync(file),fresh);
 for(const invalid of ['changed','bad-range']){await partial();mode=invalid;await assert.rejects(acquireAudio(url,file,{...options,resume:true}),/Range|validator/);assert.equal(fs.existsSync(file),false);assert.equal(fs.existsSync(file+'.resume.json'),false);}
 await partial();fs.writeFileSync(file,'BADBAD');mode='restart';result=await acquireAudio(url,file,{...options,resume:true});assert.equal(lastHeaders.range,undefined);assert.equal(result.resumeState,'restart-unverified');assert.deepEqual(fs.readFileSync(file),fresh);
 fs.writeFileSync(file,body);const hash=digest(url);fs.writeFileSync(file+'.resume.json',JSON.stringify({requestHash:hash,effectiveHash:hash,validator:{key:'etag',value:'"v1"'},total:12,mime:'audio/mpeg',bytes:12,sha256:digest(body)}));mode='complete';result=await acquireAudio(url,file,{...options,resume:true});assert.equal(result.resumeState,'complete-416');assert.equal(result.sha256,digest(body));
 await partial();mode='busy';const before=calls;await assert.rejects(acquireAudio(url,file,{...options,resume:true}),e=>e.status===429&&e.retryAfter==='1');assert.equal(calls,before+1,'no automatic retries');assert.equal(fs.existsSync(file+'.resume.json'),true);
 mode='weak';await assert.rejects(acquireAudio(url,file,options));assert.equal(fs.existsSync(file),false);assert.equal(fs.existsSync(file+'.resume.json'),false);
});
