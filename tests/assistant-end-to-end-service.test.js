'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),{EventEmitter}=require('node:events'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {register}=require('../src/assistant-agent-service'),{registerFeeds}=require('../src/feed-service'),{getFeedDigest}=require('../src/assistant-feed-digest'),{createJobs}=require('../src/assistant-jobs');
const registry=require('../src/assistant-capabilities'),manifest=require('../src/assistant-context-manifest');
const reply=message=>new Response(JSON.stringify({choices:[{message,finish_reason:'stop'}]}),{headers:{'content-type':'application/json'}});
const tool=(name,args,id=name)=>reply({role:'assistant',tool_calls:[{id,type:'function',function:{name,arguments:JSON.stringify(args)}}]});

function fixture(provider){
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'assistant-e2e-service-')),handlers=new Map(),app=new EventEmitter(),sender=new EventEmitter(),events=[],renderer=[],jobs=createJobs();
 const owner=manifest.clean({kind:'video',owner:'video-source-A',thread:'thread-A',tabId:'A',generation:1,tracks:[]});
 const event={sender,senderFrame:'main'};sender.id=73;sender.isDestroyed=()=>false;
 const ipcMain={handle:(name,handler)=>handlers.set(name,handler)},authorized=e=>e===event;
 const feeds=registerFeeds({app,ipcMain,authorized,userData:()=>dir,autoStart:false,fetchValidated:async()=>{throw Error('Unexpected network access.');}});
 const source={externalId:'entry',title:'Cinema report',text:'Only a saved source summary',kind:'article',contentScope:'summary',url:'https://news.example/cinema'};
 const subscription=feeds.store.subscribe({url:'https://news.example/rss',title:'Cinema'},[source],'all');
 const entry=feeds.store.entries().rows[0];feeds.store.preference({field:'title',value:'Cinema',score:1});
 const call=(name,data,e=event)=>handlers.get('assistant:'+name)(e,data);let nextRenderer=null,digestReads=0,entryReads=0;
 sender.send=(channel,packet)=>{events.push({channel,packet});if(packet.type==='action'){
  renderer.push(packet);assert(manifest.same(packet.owner,owner),'Renderer only acknowledges this exact owner');assert(nextRenderer,'Unexpected renderer mutation/read '+packet.name);
  const respond=nextRenderer;nextRenderer=null;queueMicrotask(()=>call('agentResult',{callId:packet.callId,result:respond(packet)}));
 }};
 const service=register({app,ipcMain,authorized,validateOwner:()=>true,getConfig:()=>({endpoint:'https://fixture.example/v1',model:'fixture'}),
  fetchImpl:async(_url,options)=>provider(JSON.parse(options.body)),getJobs:jobs.snapshot,resolveJobId:id=>jobs.has(id)?id:null,
  podcastSearch:input=>require('../src/media-shelf-service').readPodcastSearch(dir,input,6),
  feedDigest:args=>{digestReads++;return getFeedDigest(feeds.store,args);},
  feedEntry:async args=>{entryReads++;const current=feeds.store.entry(args.entry_id);if(current.revision!==args.revision)throw Error('Feed source revision changed.');
   const context=await feeds.handle(event,{action:'context',entryIds:[current.id]});if(!context.sources?.some(row=>row.entryId===current.id&&row.revision===current.revision))throw Error('Source is unavailable.');return {entry_id:current.id,revision:current.revision,title:current.title};}});
 return {owner,event,events,renderer,jobs,feeds,entry,source,subscription,service,call,
  counts:()=>({digestReads,entryReads}),expectRenderer:fn=>{nextRenderer=fn;},close:()=>{app.emit('will-quit');feeds.dispose();fs.rmSync(dir,{recursive:true,force:true});}};
}

test('watched-only video questions freeze evidence before the playback cutoff even in full transcript mode',async()=>{
 let turn=0;const h=fixture(body=>{
  assert.doesNotMatch(JSON.stringify(body.messages),/FUTURE_MARKER|UNFINISHED_MARKER/);
  if(++turn===1)return tool('search_subtitles',{query:'lighthouse'});
  const result=JSON.parse(body.messages.at(-1).content);
  assert.equal(result.transcriptScope,'watched');
  assert.equal(result.position,10);
  assert.deepEqual(result.matches.map(row=>row.id),['U1']);
  return reply({role:'assistant',content:'The watched excerpt mentions a lighthouse.'});
 });
 try{
  const result=await h.call('agentRun',{requestId:'watched-cutoff',question:'Where was the lighthouse mentioned so far?',owner:{...h.owner,time:10},
   context:{cumle:'UNFINISHED_MARKER',sonraki:[{text:'FUTURE_MARKER'}]},history:[{role:'assistant',content:'FUTURE_MARKER'}],pool:[
    {id:'U1',start:1,end:4,text:'A lighthouse on the shore.'},
    {id:'U2',start:9,end:11,text:'A lighthouse UNFINISHED_MARKER.'},
    {id:'U3',start:11,end:12,text:'A lighthouse FUTURE_MARKER.'}
   ]});
  assert.equal(result.ok,true,result.error);
  assert.equal(turn,2);
  assert.equal(h.renderer.length,0);
 }finally{h.close();}
});

test('registered main service routes RSS digest into an exact revision-bound reader proposal and applies only the reviewed owner',async()=>{
 let turn=0,observed;const h=fixture(body=>{
  if(++turn===1)return tool('get_feed_digest',{query:'Cinema',unread:true,limit:2});
  if(turn===2){observed=JSON.parse(body.messages.at(-1).content);assert.equal(observed.status,'completed');assert.equal(observed.sourcesAttached,false);const step=observed.entries[0].nextSteps[0];registry.validate(step.tool,step.args,h.owner);return tool(step.tool,step.args);}
  return reply({role:'assistant',content:'Review this exact RSS reader action.'});
 });
 try{
  const before=JSON.stringify(h.feeds.store.snapshot());const result=await h.call('agentRun',{requestId:'digest-open',question:'Find unread cinema reports and open one in RSS.',owner:h.owner});assert.equal(result.ok,true,result.error);
  assert.equal(h.counts().digestReads,1);assert.equal(h.counts().entryReads,1);assert.equal(h.renderer.length,0);assert.equal(JSON.stringify(h.feeds.store.snapshot()),before);
  const action=h.events.find(row=>row.packet.type==='proposal').packet.action;assert.equal(action.tool,'open_feed_entry');
  assert.equal((await h.call('agentApply',{proposalId:action.proposalId,owner:{...h.owner,thread:'other-thread'}})).ok,false);assert.equal(h.renderer.length,0);
  h.expectRenderer(packet=>{assert.equal(packet.name,'open_feed_entry');assert.deepEqual(packet.args,{entry_id:h.entry.id,revision:h.entry.revision});return {status:'completed',entry:{entry_id:h.entry.id,revision:h.entry.revision}};});
  const applied=await h.call('agentApply',{proposalId:action.proposalId,owner:h.owner});assert.equal(applied.ok,true,applied.error);assert.equal(h.renderer.length,1);assert.equal(h.counts().entryReads,2);assert.equal(h.feeds.store.entry(h.entry.id).read,false);assert.equal(h.feeds.store.entry(h.entry.id).saved,false);
  assert.equal((await h.call('agentApply',{proposalId:action.proposalId,owner:h.owner})).ok,false);
 }finally{h.close();}
});

test('registered main service blocks reader Apply after its RSS source revision changes',async()=>{
 let turn=0;const h=fixture(()=>++turn===1?tool('open_feed_entry',{entry_id:h.entry.id,revision:h.entry.revision}):reply({role:'assistant',content:'Review reader action.'}));
 try{
  assert.equal((await h.call('agentRun',{requestId:'stale-rss',question:'Open this exact RSS report.',owner:h.owner})).ok,true);
  const action=h.events.find(row=>row.packet.type==='proposal').packet.action;
  h.feeds.store.commit(h.subscription.feed.id,{entries:[{...h.source,text:'The report changed after review.'}]});assert.notEqual(h.feeds.store.entry(h.entry.id).revision,h.entry.revision);
  const applied=await h.call('agentApply',{proposalId:action.proposalId,owner:h.owner});assert.equal(applied.ok,false);assert.match(applied.error,/revision|changed/i);assert.equal(h.renderer.length,0);assert.equal(h.feeds.store.entry(h.entry.id).read,false);
 }finally{h.close();}
});

test('registered main service inspects the exact accepted job binding, real partial roles and a changed source without inventing retries',async()=>{
 let phase='start',turn=0,jobId,observed;const h=fixture(body=>{
  if(++turn===1)return phase==='start'?tool('start_whisper',{translate:true,target_language:'tr'}):tool('inspect_job_next_steps',{job_id:jobId});
  if(phase!=='start')observed=JSON.parse(body.messages.at(-1).content);
  return reply({role:'assistant',content:'Inspect the recorded job evidence.'});
 });
 try{
  assert.equal((await h.call('agentRun',{requestId:'accept-text',question:'Create source subtitles and translate to Turkish.',owner:h.owner})).ok,true);
  const action=h.events.find(row=>row.packet.type==='proposal').packet.action;h.expectRenderer(packet=>{assert.equal(packet.name,'start_whisper');jobId=h.jobs.start({kind:'transcription'});return {status:'accepted',jobId};});
  const accepted=await h.call('agentApply',{proposalId:action.proposalId,owner:h.owner});assert.equal(accepted.ok,true,accepted.error);
  h.jobs.update(jobId,{type:'done',outputs:[{path:'C:\\private\\source.srt',role:'source',total:5,completed:5},{path:'C:\\private\\tr.srt',role:'translation',total:5,completed:4,failed:1},{path:'C:\\private\\dual.srt',role:'dual',total:5,completed:5}]});
  phase='inspect';turn=0;assert.equal((await h.call('agentRun',{requestId:'inspect-bound',question:'Inspect this job result and its next steps.',owner:h.owner})).ok,true);
  assert.equal(observed.job_id,jobId);assert.equal(observed.state,'completed');assert.equal(observed.sourceMatches,true);assert.equal(observed.partial,true);assert.deepEqual(observed.nextSteps.map(step=>step.args.role),['source','translation']);assert.equal(observed.nextSteps[1].args.allow_partial,true);assert(!JSON.stringify(observed).includes('private'));assert.equal(h.renderer.length,1);
  turn=0;assert.equal((await h.call('agentRun',{requestId:'inspect-foreign-source',question:'Inspect the earlier exact job.',owner:{...h.owner,tabId:'B',owner:'video-source-B'}})).ok,true);
  assert.equal(observed.sourceMatches,false);assert.equal(observed.nextSteps.length,0);assert.equal(h.renderer.length,1);
  const failed=h.jobs.start({kind:'voice'});h.jobs.update(failed,{type:'error',message:'HTTP 401 invalid API key private-secret'});jobId=failed;turn=0;
  assert.equal((await h.call('agentRun',{requestId:'inspect-failed',question:'Inspect the failed job.',owner:h.owner})).ok,true);assert.equal(observed.failure.code,'authorization');assert.equal(observed.retrySupported,false);assert.equal(observed.nextSteps.length,0);assert(!JSON.stringify(observed).includes('private-secret'));
 }finally{h.close();}
});

test('saved podcast results cite real text, retain ownership and use the reviewed action',async()=>{
 let turn=0,passage,phase='search';
 const h=fixture(body=>{
  if(++turn===1)return phase==='search'?tool('search_saved_podcasts',{query:'lighthouse',show:'Coastal'}):tool('open_saved_podcast_passage',{passage_id:passage.id});
  const result=JSON.parse(body.messages.at(-1).content);
  if(phase==='search'){assert.equal(result.matches.length,1);passage=result.matches[0];}
  return reply({role:'assistant',content:'Podcast evidence.'});
 });
 try{
  h.feeds.store.subscribe({url:'https://podcast.example/rss',title:'Coastal show',format:'rss'},[{kind:'podcast',contentScope:'summary',externalId:'one',title:'Episode A',enclosures:[{url:'https://podcast.example/a.wav',type:'audio/wav'}]}]);
  const entry=h.feeds.store.entries({kind:'podcast'}).rows[0],version=require('../src/podcast-session').sourceVersion(entry);
  h.feeds.store.podcastWorkspace(entry.id,version,{transcript:{state:'untimed',format:'plain',text:'The lighthouse is on the shore.',provenance:'publisher'}});
  const searched=await h.call('agentRun',{requestId:'podcast-search',question:'Find lighthouse in saved podcasts',owner:h.owner});
  assert(searched.ok,searched.error);assert.match(searched.text,/\[P[\da-f-]+\].*Coastal show.*Episode A.*The lighthouse/);assert.equal(passage.seconds,null);
  assert(!JSON.stringify(passage).includes('podcast.example'));
  turn=0;phase='open';
  await h.call('agentRun',{requestId:'foreign-passage',question:'Open this quote',owner:{...h.owner,thread:'foreign'}});
  assert(!h.events.some(row=>row.packet.type==='proposal'));
  turn=0;
  const proposed=await h.call('agentRun',{requestId:'open-passage',question:'Open this quote',owner:h.owner});
  assert(proposed.ok,proposed.error);
  const action=h.events.find(row=>row.packet.type==='proposal').packet.action;
  assert.equal(action.tool,'open_saved_podcast_passage');assert.equal(h.renderer.length,0);
  h.expectRenderer(packet=>{assert.equal(packet.expectedSettings.locator.episode,entry.id);return {status:'completed',mode:'read-only'};});
  assert.equal((await h.call('agentApply',{proposalId:action.proposalId,owner:h.owner})).result.mode,'read-only');
  assert.equal(h.feeds.store.entry(entry.id).read,false);
  turn=0;
  await h.call('agentRun',{requestId:'stale-card',question:'Open this quote again',owner:h.owner});
  const stale=h.events.filter(row=>row.packet.type==='proposal').at(-1).packet.action;
  h.feeds.store.podcastWorkspace(entry.id,version,{transcript:{state:'untimed',format:'plain',text:'This saved text changed.',provenance:'publisher'}});
  assert.equal((await h.call('agentApply',{proposalId:stale.proposalId,owner:h.owner})).ok,false);
  assert.equal(h.renderer.length,1);
  turn=0;phase='search';
  const watched=await h.call('agentRun',{requestId:'watched-podcast',question:'Where did lighthouse occur so far?',owner:h.owner});
  assert(!watched.text?.includes('The lighthouse is on the shore.'));
 }finally{h.close();}
});
