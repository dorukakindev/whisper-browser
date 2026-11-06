'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),{EventEmitter}=require('node:events');
const {registerFeeds,fetchPublic}=require('../src/feed-service');
const rss=(id='1')=>'<rss version="2.0"><channel><title>Cinema</title><item><guid>'+id+'</guid><title>Review '+id+'</title><link>https://news.example/'+id+'</link><description>A short source summary.</description></item></channel></rss>';
function fixture(fetchValidated,options={}){const dir=fs.mkdtempSync(path.join(os.tmpdir(),'feeds-service-')),app=new EventEmitter();app.getPath=()=>dir;const event={sender:{id:1}},catalog={id:'film',kind:'film',title:'Witness',year:2026,imdbId:'tt1234567'};const service=registerFeeds({app,ipcMain:{handle(){}},authorized:e=>e===event,userData:()=>dir,catalogStore:()=>({get:id=>id==='film'?catalog:null}),fetchValidated,autoStart:false,...options});return {...service,catalog,event,request:input=>service.handle(event,input),close:()=>{service.dispose();fs.rmSync(dir,{recursive:true,force:true});}};}

test('RSS state previews are read-only, revision-bound and apply only reviewed flags across matching article copies',async()=>{
 const f=fixture(async()=>new Response(rss()));try{
  for(const url of ['https://one.example/rss','https://two.example/rss']){const p=await f.request({action:'preview',url});await f.request({action:'subscribe',token:p.token});}
  const row=f.store.entries().rows[0],before=f.store.snapshot().entries;
  assert.equal(row.entryIds.length,2);
  const preview=await f.request({action:'state-preview',entryId:row.id,revision:row.revision,changes:{saved:true,later:true}});assert.equal(preview.ok,true,preview.error);assert.equal(preview.entry.copyCount,2);assert.equal(f.store.entry(row.id).saved,false);
  const applied=await f.request({action:'state-apply',token:preview.token});assert.equal(applied.ok,true,applied.error);assert.equal(applied.updated,2);assert.equal(applied.entry.saved,true);assert.equal(applied.entry.later,true);assert.equal(applied.entry.read,before.every(e=>e.read));assert.equal((await f.request({action:'state-apply',token:preview.token})).ok,false);
  const stale=await f.request({action:'state-preview',entryId:row.id,revision:row.revision,changes:{saved:false}});f.store.setState(row.entryIds,{read:true});assert.equal((await f.request({action:'state-apply',token:stale.token})).ok,false);assert.equal(f.store.entry(row.id).saved,true);
  assert.equal((await f.request({action:'state-preview',entryId:row.id,revision:'old-revision',changes:{saved:false}})).ok,false);
  assert.equal((await f.request({action:'state-preview',entryId:row.id,revision:row.revision,changes:{spoilerAllowed:true}})).ok,false);
 }finally{f.close();}
});

test('RSS state preview tokens reject another sender and expired or changed source revisions',async()=>{
 let now=1000000;const f=fixture(async()=>new Response(rss()),{now:()=>now});try{
  const p=await f.request({action:'preview',url:'https://one.example/rss'});await f.request({action:'subscribe',token:p.token});const row=f.store.entries().rows[0];
  const preview=()=>f.request({action:'state-preview',entryId:row.id,revision:row.revision,changes:{saved:true}});
  let card=await preview();f.event.sender.id=2;assert.equal((await f.request({action:'state-apply',token:card.token})).ok,false);f.event.sender.id=1;assert.equal((await f.request({action:'state-apply',token:card.token})).ok,true);
  card=await preview();now+=600001;assert.equal((await f.request({action:'state-apply',token:card.token})).ok,false);
  card=await preview();const snapshot=f.store.snapshot(),feed=snapshot.feeds[0];f.store.commit(feed.id,{...feed,entries:[{...snapshot.entries[0],text:'New source evidence'}]});assert.equal((await f.request({action:'state-apply',token:card.token})).ok,false);
 }finally{f.close();}
});
test('preview never subscribes; explicit subscribe,304,parse failure and offline retain content and validators',async()=>{
 let mode='ok',headers;const f=fixture(async(url,options)=>{headers=options.headers;if(mode==='offline')throw Error('offline');return mode==='304'?new Response(null,{status:304}):new Response(mode==='bad'?'<rss><broken>':rss(),{headers:{etag:mode==='bad'?'bad-tag':'v1','content-type':'application/rss+xml'}});});
 try{assert.equal((await f.handle({}, {action:'list'})).ok,false);const preview=await f.request({action:'preview',url:'https://feed.example/rss'});assert(preview.ok,JSON.stringify(preview));assert.equal(f.store.list().feeds.length,0);const sub=await f.request({action:'subscribe',token:preview.token,initial:'all'});assert(sub.ok);const id=sub.feed.id,row=f.store.entries({}).rows[0];await f.request({action:'state',entryIds:[row.id],saved:true,read:true});mode='304';assert((await f.request({action:'refresh',feedId:id})).ok);assert.equal(headers['If-None-Match'],'v1');assert.equal(f.store.entry(row.id).saved,true);mode='bad';const bad=await f.request({action:'refresh',feedId:id});assert.equal(bad.results[0].state,'failed');assert.equal(f.store.list().feeds[0].etag,'v1');mode='offline';await f.request({action:'refresh',feedId:id});assert.equal(f.store.entry(row.id).read,true);assert.equal(f.store.list().feeds[0].state,'failed');}finally{f.close();}
});
test('catalog relationship requires preview and matching identity confirmation; context is bounded summary evidence',async()=>{
 const f=fixture(async()=>new Response(rss()));try{const p=await f.request({action:'preview',url:'https://feed.example/rss'});await f.request({action:'subscribe',token:p.token,initial:'all'});const entry=f.store.entries({}).rows[0];const link=await f.request({action:'link-preview',entryId:entry.id,catalogId:'film'});assert(link.ok);assert.equal(f.store.entry(entry.id).links.length,0);f.catalog.imdbId='tt7654321';assert.equal((await f.request({action:'link-confirm',token:link.token})).ok,false);const fresh=await f.request({action:'link-preview',entryId:entry.id,catalogId:'film'});assert((await f.request({action:'link-confirm',token:fresh.token})).ok);const context=await f.request({action:'context',entryIds:[entry.id]});assert(context.ok);assert.equal(context.sources[0].scope,'summary');assert.match(context.sources[0].id,/^F/);assert(context.text.length<=18000);assert.equal(f.catalog.watchStatus,undefined);assert.equal((await f.request({action:'related',catalogId:'film'})).total,1);f.catalog.imdbId='tt1234567';assert.equal((await f.request({action:'related',catalogId:'film'})).total,0);assert.equal((await f.request({action:'entry',entryId:entry.id})).entry.links[0].state,'stale');}finally{f.close();}
});
test('public transport refuses literal and DNS private addresses before making requests',async()=>{
 await assert.rejects(()=>fetchPublic('http://127.0.0.1/rss'),/Unsafe|public/i);
 await assert.rejects(()=>fetchPublic('https://feed.example/rss',{lookup:async()=>[{address:'127.0.0.1',family:4}]}),/public/i);
});
function fakeTransport(responder,calls=[]){return {request(url,options,receive){const req=new EventEmitter();req.setTimeout=()=>{};req.end=()=>{calls.push({url:String(url),options});queueMicrotask(()=>{const {Readable}=require('node:stream'),packet=responder(url,calls.length),stream=Readable.from([packet.body||Buffer.alloc(0)]);stream.statusCode=packet.status||200;stream.headers=packet.headers||{};receive(stream);});};req.destroy=error=>{queueMicrotask(()=>req.emit('error',error||Error('destroyed')));};return req;}};}
test('redirects revalidate and pin DNS, drop cross-origin validators and decode within byte limits',async()=>{
 const calls=[],lookups=[],transport=fakeTransport((_url,n)=>n===1?{status:302,headers:{location:'https://two.example/rss'}}:{body:require('node:zlib').gzipSync(Buffer.from(rss())),headers:{'content-encoding':'gzip'}},calls);
 const response=await fetchPublic('https://one.example/rss',{headers:{'If-None-Match':'v1',Cookie:'secret'},lookup:async host=>{lookups.push(host);return [{address:'93.184.216.34',family:4}];},transport});assert.equal(response.effectiveUrl,'https://two.example/rss');assert.match(response.buffer.toString(),/<rss/);assert.deepEqual(lookups,['one.example','two.example']);assert.equal(calls[1].options.headers['If-None-Match'],undefined);assert.equal(calls[0].options.headers.Cookie,undefined);let pin;calls[0].options.lookup('one.example',{},(_err,address)=>pin=address);assert.equal(pin,'93.184.216.34');
});
test('private redirect and compression bombs fail without consuming an unbounded body',async()=>{
 await assert.rejects(()=>fetchPublic('https://one.example/rss',{lookup:async()=>[{address:'93.184.216.34',family:4}],transport:fakeTransport(()=>({status:302,headers:{location:'http://127.0.0.1/private'}}))}),/Unsafe/);
 await assert.rejects(()=>fetchPublic('https://one.example/rss',{lookup:async()=>[{address:'93.184.216.34',family:4}],transport:fakeTransport(()=>({body:require('node:zlib').gzipSync(Buffer.from('x'.repeat(2000001))),headers:{'content-encoding':'gzip'}}))}),/Decoded feed exceeds/);
});
test('cancel aborts preview promptly; paused scheduler makes no requests and disposal cleans jobs',async()=>{
 let started,signal;const ready=new Promise(r=>started=r);const f=fixture(async(_url,options)=>{signal=options.signal;started();return new Promise((resolve,reject)=>signal.addEventListener('abort',()=>reject(signal.reason),{once:true}));});
 try{const pending=f.request({action:'preview',url:'https://feed.example/rss',requestId:'wait'});await ready;assert((await f.request({action:'cancel',requestId:'wait'})).ok);assert.equal((await pending).ok,false);assert(signal.aborted);await f.request({action:'settings',paused:true});assert.deepEqual(await f.refreshDue(),[]);}finally{f.close();}
});
test('manual refresh exposes continuation for every enabled source beyond a bounded batch',async()=>{
 const calls=[];const f=fixture(async url=>{calls.push(url);return new Response(rss());});try{for(let i=0;i<11;i++)f.store.subscribe({url:'https://feed'+i+'.example/rss'});const first=await f.request({action:'refresh'});assert(first.ok);assert.equal(first.results.length,8);assert.equal(first.remainingFeedIds.length,3);const rest=await f.request({action:'refresh',feedIds:first.remainingFeedIds});assert(rest.ok);assert.equal(rest.results.length,3);assert.deepEqual(rest.remainingFeedIds,[]);assert.equal(new Set(calls).size,11);assert.equal((await f.request({action:'refresh',feedIds:['missing']})).ok,false);}finally{f.close();}
});
test('linked article receives current viewing status for its spoiler decision',async()=>{const f=fixture(async()=>new Response(rss()));try{const p=await f.request({action:'preview',url:'https://feed.example/rss'});await f.request({action:'subscribe',token:p.token});const entry=f.store.entries().rows[0];const link=await f.request({action:'link-preview',entryId:entry.id,catalogId:'film'});await f.request({action:'link-confirm',token:link.token});f.catalog.watchStatus='completed';assert.equal((await f.request({action:'entry',entryId:entry.id})).entry.links[0].watchStatus,'completed');f.catalog.watchStatus='planned';assert.equal((await f.request({action:'entries'})).rows[0].links[0].watchStatus,'planned');}finally{f.close();}});


test('podcast library pages carry current compact transcript state without copying transcript bodies',async()=>{
 const xml='<rss version="2.0"><channel><title>Publisher</title><item><guid>episode</guid><title>Episode</title><link>https://news.example/episode</link><description>Publisher summary</description><enclosure url="https://audio.example/episode.mp3" type="audio/mpeg" length="1000"/></item></channel></rss>';
 const f=fixture(async()=>new Response(xml));try{
  const preview=await f.request({action:'preview',url:'https://feed.example/rss'});await f.request({action:'subscribe',token:preview.token,initial:'all'});
  const entry=f.store.entries({kind:'podcast'}).rows[0],session=require('../src/podcast-session'),version=session.sourceVersion(entry);
  const text='1\n00:00:00,000 --> 00:00:02,000\n'+'Original words '.repeat(2000);
  assert((await f.request({action:'podcast-save-transcript',entryId:entry.id,sourceVersion:version,text,format:'srt',timed:true})).ok);
  await f.request({action:'podcast-workspace',entryId:entry.id,position:37,rate:1.5});
  const normal=await f.request({action:'entries',kind:'podcast'}),compact=await f.request({action:'entries',kind:'podcast',podcastLibrary:true});
  const row=compact.rows[0];assert.equal(row.sourceVersion,version);assert.equal(row.podcastWorkspace.position,37);assert.equal(row.podcastWorkspace.transcript.hasText,true);assert.equal(row.podcastWorkspace.transcript.text,undefined);
  assert(JSON.stringify(compact).length<JSON.stringify(normal).length/3);assert.equal((await f.request({action:'entry',entryId:entry.id})).entry.podcastWorkspace.transcript.text,text);
  f.store.podcastAudioEvidence(entry.id,version,{etag:'changed',bytes:1000,sha256:'a'.repeat(64)});
  const changed=(await f.request({action:'entries',kind:'podcast',podcastLibrary:true})).rows[0];assert.notEqual(changed.sourceVersion,version);assert.equal(changed.positionState,'needs-review');assert.equal(changed.podcastWorkspace.position,0);assert.equal(changed.podcastWorkspace.transcript,undefined);
 }finally{f.close();}
});

test('identical 200 refresh, new items and failure have distinct receipts and keep read state',async()=>{
 let payload=rss(),status=200;
 const f=fixture(async()=>new Response(payload,{status}));
 try{
  const p=await f.request({action:'preview',url:'https://news.example/rss'});
  const subscribed=await f.request({action:'subscribe',token:p.token}),id=subscribed.feed.id;
  const row=f.store.entries().rows[0];
  f.store.setState([row.id],{read:true});
  const refresh=()=>f.request({action:'refresh',feedId:id});
  assert.equal((await refresh()).results[0].state,'unchanged');
  payload=rss('2');assert.equal((await refresh()).results[0].inserted,1);
  const lastSuccess=f.store.list().feeds[0].lastSuccess;
  status=503;assert.equal((await refresh()).results[0].state,'failed');
  assert.equal(f.store.list().feeds[0].lastSuccess,lastSuccess);
  assert.equal(f.store.list().feeds[0].enabled,true);
  assert.equal(f.store.entry(row.id).read,true);
 }finally{f.close();}
});

test('publisher chapter URL is scoped to the saved episode and invalid times remain readable',async()=>{
 const rssBody='<rss xmlns:podcast="https://podcastindex.org/namespace/1.0"><channel><title>Show</title><item><guid>ep</guid><title>Episode</title><enclosure url="https://audio.example/one.mp3" type="audio/mpeg"/><podcast:chapters url="https://audio.example/one.json" type="application/json+chapters"/></item></channel></rss>';
 const f=fixture(async url=>new Response(url.endsWith('.json')?JSON.stringify({version:'1.2',chapters:[{title:'Intro',startTime:0},{title:'Bad clock',startTime:-2},{title:'Hidden',startTime:2,toc:false}]}):rssBody));
 try{
  const p=await f.request({action:'preview',url:'https://audio.example/rss'});
  await f.request({action:'subscribe',token:p.token});
  const e=f.store.entries({kind:'podcast'}).rows[0];
  assert.equal(e.chapterUrl,'https://audio.example/one.json');
  const get=sourceVersion=>f.request({action:'podcast-chapters',entryId:e.id,sourceVersion});
  assert.deepEqual((await get('stale')).chapters,[]);
  assert.deepEqual((await get(require('../src/podcast-session').sourceVersion(e))).chapters,[{label:'Intro',t:0},{label:'Bad clock',t:null}]);
 }finally{f.close();}
});
