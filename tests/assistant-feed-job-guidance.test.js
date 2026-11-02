'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {createFeedStore}=require('../src/feed-store');
const {parseFeed}=require('../src/feed-parser');
const {getFeedDigest}=require('../src/assistant-feed-digest');
const {inspectJobNextSteps}=require('../src/assistant-job-guidance');
const {createJobs}=require('../src/assistant-jobs');
const {EventEmitter}=require('node:events');
const {registerFeeds}=require('../src/feed-service');
const registry=require('../src/assistant-capabilities');

test('digest reads real subscribed RSS entries with explicit preference evidence and separate states',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'assistant-digest-'));
 try{
  const store=createFeedStore(path.join(dir,'feeds.json'));
  const parsed=parseFeed('<rss version="2.0"><channel><title>Cinema</title><item><guid>1</guid><title>Turkish cinema</title><link>https://news.example/1</link><description>Only a summary</description><category>Cinema</category></item><item><guid>2</guid><title>Other</title><link>https://news.example/2</link><description>Other summary</description></item></channel></rss>','https://news.example/rss');
  store.subscribe({...parsed,url:'https://news.example/rss'},parsed.entries,'all');
  const entry=store.entries({query:'Turkish'}).rows[0];store.setState([entry.id],{saved:true,later:true});
  store.preference({field:'tag',value:'Cinema',score:2});
  const before=JSON.stringify(store.snapshot()),digest=getFeedDigest(store,{query:'Turkish',unread:true,saved:true,later:true,limit:3});
  assert.equal(digest.status,'completed');assert.equal(digest.entries.length,1);assert.equal(digest.entries[0].entry_id,entry.id);
  assert.equal(digest.entries[0].scope,'summary');assert.equal(digest.entries[0].excerptScope,'summary');assert.equal(digest.entries[0].excerpt,'Only a summary');assert.equal(digest.entries[0].read,false);
  assert.equal(digest.entries[0].saved,true);assert.equal(digest.entries[0].later,true);assert.equal(digest.entries[0].preferenceEvidence[0].value,'Cinema');
  assert.equal(digest.entries[0].nextSteps[0].args.entry_id,entry.id);assert.deepEqual(digest.entries[0].nextSteps.map(step=>step.tool),['open_feed_entry']);assert.equal(digest.sourcesAttached,false);assert.equal(JSON.stringify(store.snapshot()),before);
  assert.equal(getFeedDigest(store,{query:'missing'}).entries.length,0);assert.equal(getFeedDigest(store,{unread:false}).entries.length,2);
  store.unsubscribe(store.list().feeds[0].id);assert.equal(getFeedDigest(store,{}).entries.length,0);
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});

test('digest respects spoiler permissions, source scopes, exact counts and strict bounded filters',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'assistant-digest-'));
 try{
  const store=createFeedStore(path.join(dir,'feeds.json'));
  const rows=[{externalId:'blocked',title:'Secret spoiler',text:'spoiler',url:'https://news.example/blocked',kind:'article',contentScope:'summary',spoiler:'marked'},
   {externalId:'full',title:'Full feed',text:'x'.repeat(6000),url:'https://news.example/full',kind:'article',contentScope:'feed-full'}];
  store.subscribe({url:'https://news.example/rss',title:'News'},rows,'all');
  const digest=getFeedDigest(store,{limit:1});assert.equal(digest.total,1);assert.equal(digest.entries[0].scope,'feed-full');assert.equal(digest.entries[0].shortened,true);assert(digest.entries[0].excerpt.length<=1000);assert(!JSON.stringify(digest).includes('Secret spoiler'));
  assert.throws(()=>getFeedDigest(store,{limit:30}),/limit/i);assert.throws(()=>getFeedDigest(store,{unread:'false'}),/boolean/i);assert.throws(()=>getFeedDigest(store,{sort:'personalized'}),/Unsupported/i);
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});

test('job next steps follow exact ledger state, artifact roles and bound source, without retry invention',()=>{
 const jobs=createJobs(),id=jobs.start({kind:'transcription',cancel:async()=>({ok:true})});
 const inspect=(binding={tool:'start_whisper'},sourceMatches=true)=>inspectJobNextSteps({job:jobs.snapshot().jobs.find(j=>j.id===id),binding,sourceMatches});
 assert.equal(inspect().state,'running');assert.equal(inspect().nextSteps[0].tool,'get_job_result');
 jobs.update(id,{type:'segment'});jobs.update(id,{type:'done',outputs:[{path:'C:\\private\\source.srt',role:'source',language:'en',total:10,completed:10},{path:'C:\\private\\translated.srt',role:'translation',language:'tr',status:'partial',total:10,completed:8,failed:2}]});
 const result=inspect();assert.equal(result.partial,true);assert.equal(result.artifacts.length,2);assert.equal(result.nextSteps[0].args.job_id,id);assert.equal(result.nextSteps[0].args.role,'source');assert.equal(result.nextSteps[1].args.allow_partial,true);assert.equal(result.nextSteps[1].requiresPartialReview,true);assert(!JSON.stringify(result).includes('private'));
 assert.equal(inspect(null,null).nextSteps.length,0);assert.equal(inspect({tool:'start_whisper'},false).nextSteps.length,0);
 const failed=jobs.start({kind:'voice'});jobs.update(failed,{type:'error',message:'HTTP 401 invalid API key secret'});
 const failure=inspectJobNextSteps({job:jobs.snapshot().jobs.find(j=>j.id===failed)});assert.equal(failure.failure.code,'authorization');assert.equal(failure.nextSteps.length,0);assert(!JSON.stringify(failure).includes('secret'));
});

test('digest IDs continue through owner-service source attachment and reviewed RSS state writes',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'assistant-digest-service-')),app=new EventEmitter(),event={sender:{id:1}};let fetches=0;
 const service=registerFeeds({app,ipcMain:{handle(){}},authorized:e=>e===event,userData:()=>dir,autoStart:false,
  fetchValidated:async()=>{fetches++;return new Response('<rss version="2.0"><channel><title>Local RSS fixture</title><item><guid>one</guid><title>Article</title><link>https://news.example/one</link><description>Bounded article summary</description></item></channel></rss>');}});
 try{
  const preview=await service.handle(event,{action:'preview',url:'https://news.example/rss'});
  const subscription=await service.handle(event,{action:'subscribe',token:preview.token,initial:'all'});assert.equal(subscription.ok,true);
  const digest=getFeedDigest(service.store,{unread:true}),entry=digest.entries[0];
  assert.equal(fetches,1);assert.equal(service.store.entry(entry.entry_id).read,false);
  const attached=await service.handle(event,{action:'context',entryIds:[entry.entry_id]});assert.equal(attached.sources[0].id,entry.source_id);assert.equal(attached.sources[0].revision,entry.revision);assert.equal(attached.sources[0].scope,'summary');
  const state=await service.handle(event,{action:'state-preview',entryId:entry.entry_id,revision:entry.revision,changes:{later:true}});assert.equal(state.ok,true);assert.equal(service.store.entry(entry.entry_id).later,false);
  assert.equal((await service.handle(event,{action:'state-apply',token:state.token})).ok,true);assert.equal(getFeedDigest(service.store,{later:true}).total,1);assert.equal(getFeedDigest(service.store,{saved:true}).total,0);assert.equal(fetches,1);
 }finally{service.dispose();fs.rmSync(dir,{recursive:true,force:true});}
});

test('digest keeps an exact subscribed copy when a saved duplicate outlives unsubscription',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'assistant-digest-copy-'));
 try{
  const store=createFeedStore(path.join(dir,'feeds.json'));
  const row={externalId:'one',title:'Shared article',text:'Shared summary',url:'https://news.example/shared',kind:'article',contentScope:'summary'};
  const a=store.subscribe({url:'https://one.example/rss',title:'Former'},[{...row,publishedAt:200}], 'all').feed;
  const old=store.entries().rows[0];store.setState([old.id],{saved:true});
  const b=store.subscribe({url:'https://two.example/rss',title:'Current'},[{...row,publishedAt:100}], 'all').feed;
  store.unsubscribe(a.id);
  const digest=getFeedDigest(store,{}),entry=digest.entries[0];assert.equal(digest.total,1);assert.notEqual(entry.entry_id,old.id);assert.equal(entry.saved,true);assert.equal(entry.provenance[0].feed_id,b.id);
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});

test('digest rechecks kind and matching counts after replacing an unsubscribed duplicate',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'assistant-digest-cross-kind-'));
 try{
  const store=createFeedStore(path.join(dir,'feeds.json'));
  const shared={externalId:'one',title:'Shared story',text:'Shared summary',url:'https://news.example/cross-kind',contentScope:'summary'};
  const former=store.subscribe({url:'https://former.example/rss',title:'Former'},[{...shared,kind:'article',publishedAt:200}],'all').feed;
  const old=store.entries().rows[0];store.setState([old.id],{saved:true});
  store.subscribe({url:'https://current.example/rss',title:'Current'},[{...shared,kind:'video',publishedAt:100}],'all');
  store.unsubscribe(former.id);
  const before=JSON.stringify(store.snapshot()),unfiltered=getFeedDigest(store,{}),articles=getFeedDigest(store,{kind:'article',saved:true});
  assert.equal(unfiltered.total,1);assert.equal(unfiltered.entries[0].kind,'video');assert.notEqual(unfiltered.entries[0].entry_id,old.id);
  assert.equal(articles.filters.kind,'article');assert.deepEqual(articles.entries,[]);assert.equal(articles.total,0);
  assert.deepEqual(articles.counts,{matching:0,unread:0,saved:0,later:0});assert.equal(articles.limited,false);
  assert.equal(JSON.stringify(store.snapshot()),before);
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});

test('job suggestions use actual registry roles while retaining dual output and exact partial counts as evidence',()=>{
 const jobs=createJobs(),id=jobs.start({kind:'transcription'});
 jobs.update(id,{type:'done',outputs:[{path:'C:\\out\\dual.srt',role:'dual',total:8,completed:8},
  {path:'C:\\out\\source.srt',role:'source',total:8,completed:8},
  {path:'C:\\out\\translation.srt',role:'translation',total:8,completed:7,failed:3}]});
 const job=jobs.snapshot().jobs[0],result=inspectJobNextSteps({job,binding:{tool:'start_whisper'},sourceMatches:true});
 assert.equal(result.artifacts.find(item=>item.role==='dual').partial,false);
 const translated=result.artifacts.find(item=>item.role==='translation');assert.deepEqual([translated.total,translated.completed,translated.failed,translated.partial],[8,5,3,true]);
 assert.deepEqual(result.nextSteps.map(step=>step.args.role),['source','translation']);
 for(const step of result.nextSteps)assert.doesNotThrow(()=>registry.validate(step.tool,step.args,{kind:'video'}));
 const dualOnly=inspectJobNextSteps({job:{...job,result:{artifacts:job.result.artifacts.filter(item=>item.role==='dual')}},binding:{tool:'start_whisper'},sourceMatches:true});assert.equal(dualOnly.nextSteps.length,0);
 const countOnly=inspectJobNextSteps({job:{...job,result:{artifacts:[{role:'translation',format:'srt',total:10,completed:9,failed:1,partial:false}]}},binding:{tool:'start_whisper'},sourceMatches:true});
 assert.equal(countOnly.artifacts[0].partial,true);assert.equal(countOnly.nextSteps[0].requiresPartialReview,true);assert.equal(countOnly.nextSteps[0].args.allow_partial,true);
});
