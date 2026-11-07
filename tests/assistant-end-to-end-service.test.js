'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),{EventEmitter}=require('node:events'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {register}=require('../src/assistant-agent-service'),{registerFeeds}=require('../src/feed-service'),{getFeedDigest}=require('../src/assistant-feed-digest'),{createJobs}=require('../src/assistant-jobs');
const registry=require('../src/assistant-capabilities'),manifest=require('../src/assistant-context-manifest');
const reply=message=>new Response(JSON.stringify({choices:[{message,finish_reason:'stop'}]}),{headers:{'content-type':'application/json'}});
const tool=(name,args,id=name)=>reply({role:'assistant',tool_calls:[{id,type:'function',function:{name,arguments:JSON.stringify(args)}}]});

function fixture(provider,extra={}){
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'assistant-e2e-service-')),handlers=new Map(),app=new EventEmitter(),sender=new EventEmitter(),events=[],renderer=[],jobs=createJobs();
 const owner=manifest.clean({kind:'video',owner:'video-source-A',thread:'thread-A',tabId:'A',generation:1,tracks:[]});
 const event={sender,senderFrame:'main'};sender.id=73;sender.isDestroyed=()=>false;
 const ipcMain={handle:(name,handler)=>handlers.set(name,handler)},authorized=e=>e===event;
 const feeds=registerFeeds({app,ipcMain,authorized,userData:()=>dir,autoStart:false,fetchValidated:async()=>{throw Error('Unexpected network access.');}});
 const source={externalId:'entry',title:'Cinema report',text:'Only a saved source summary',kind:'article',contentScope:'summary',url:'https://news.example/cinema'};
 const subscription=feeds.store.subscribe({url:'https://news.example/rss',title:'Cinema'},[source],'all');
 const entry=feeds.store.entries().rows[0];feeds.store.preference({field:'title',value:'Cinema',score:1});
 const call=(name,data,e=event)=>handlers.get('assistant:'+name)(e,data);let nextRenderer=null,alwaysRenderer=null,digestReads=0,entryReads=0;
 sender.send=(channel,packet)=>{events.push({channel,packet});if(packet.type==='action'){
  renderer.push(packet);assert(manifest.same(packet.owner,owner),'Renderer only acknowledges this exact owner');assert(nextRenderer||alwaysRenderer,'Unexpected renderer mutation/read '+packet.name);
  const respond=nextRenderer||alwaysRenderer;nextRenderer=null;queueMicrotask(()=>call('agentResult',{callId:packet.callId,result:respond(packet)}));
 }};
 const noteStore=new (require('../src/browser-note-store').BrowserNoteStore)(path.join(dir,'notes.json'));
 const service=register({app,ipcMain,authorized,validateOwner:()=>true,...extra,
  researchNotes:require('../src/research-annotation-writer').createAnnotationWriter({store:()=>noteStore}),getConfig:()=>({endpoint:'https://fixture.example/v1',model:'fixture'}),
  fetchImpl:async(_url,options)=>provider(JSON.parse(options.body)),getJobs:jobs.snapshot,resolveJobId:id=>jobs.has(id)?id:null,
  podcastSearch:input=>require('../src/media-shelf-service').readPodcastSearch(dir,input,6),
  feedDigest:args=>{digestReads++;return getFeedDigest(feeds.store,args);},
  feedEntry:async args=>{entryReads++;const current=feeds.store.entry(args.entry_id);if(current.revision!==args.revision)throw Error('Feed source revision changed.');
   const context=await feeds.handle(event,{action:'context',entryIds:[current.id]});if(!context.sources?.some(row=>row.entryId===current.id&&row.revision===current.revision))throw Error('Source is unavailable.');return {entry_id:current.id,revision:current.revision,title:current.title};}});
 return {dir,notes:noteStore,owner,event,events,renderer,jobs,feeds,entry,source,subscription,service,call,
  counts:()=>({digestReads,entryReads}),expectRenderer:fn=>{nextRenderer=fn;},alwaysRenderer:fn=>{alwaysRenderer=fn;},close:()=>{app.emit('will-quit');feeds.dispose();fs.rmSync(dir,{recursive:true,force:true});}};
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
  const repeat=await h.call('agentApply',{proposalId:action.proposalId,owner:h.owner});assert.deepEqual([repeat.ok,repeat.replayed],[true,true]);assert.equal(h.renderer.length,1,'a repeated approval is replayed, never dispatched again');assert.equal(h.counts().entryReads,2);
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

function podcastFixture(h,rows){
 h.feeds.store.subscribe({url:'https://podcast.example/rss',title:'Coastal show',format:'rss'},rows.map((row,index)=>({kind:'podcast',contentScope:'summary',externalId:'ep'+index,title:row.title,enclosures:[{url:'https://podcast.example/'+index+'.wav',type:'audio/wav'}]})));
 const session=require('../src/podcast-session'),entries=h.feeds.store.entries({kind:'podcast'}).rows;
 for(const row of rows){const entry=entries.find(item=>item.title===row.title);h.feeds.store.podcastWorkspace(entry.id,session.sourceVersion(entry),{transcript:row.transcript});}
 return rows.map(row=>entries.find(item=>item.title===row.title));
}
const timedTranscript=text=>({state:'timed',format:'vtt',text:'WEBVTT\n\n00:00:01.000 --> 00:00:03.000\n'+text,provenance:'publisher'});

test('saved podcast results become structured source cards with verified timing, real scope and honest usage',async()=>{
 let mode='search',turn=0,answer='';
 const h=fixture(body=>{
  if(mode==='watched')return ++turn===1?tool('search_saved_podcasts',{query:'lighthouse'}):reply({role:'assistant',content:'Nothing from the archive.'});
  if(mode==='search'){
   if(++turn===1)return tool('search_saved_podcasts',{query:'lighthouse',show:'Coastal'});
   const timed=JSON.parse(body.messages.at(-1).content).matches.find(row=>row.seconds!==null);
   return reply({role:'assistant',content:'The timed episode says ['+timed.id+'] the lighthouse blinks.'});
  }
  return reply({role:'assistant',content:answer});
 });
 try{
  podcastFixture(h,[{title:'Untimed episode',transcript:{state:'untimed',format:'plain',text:'The lighthouse is on the shore.',provenance:'publisher'}},{title:'Timed episode',transcript:timedTranscript('The lighthouse blinks twice.')}]);
  const run=await h.call('agentRun',{requestId:'cards',question:'Find lighthouse in saved podcasts',owner:h.owner});
  assert(run.ok,run.error);assert.equal(run.podcastCitations.length,2);
  const byEpisode=Object.fromEntries(run.podcastCitations.map(card=>[card.episode,card])),timed=byEpisode['Timed episode'],untimed=byEpisode['Untimed episode'];
  assert.equal(timed.kind,'podcast');assert.equal(timed.usage,'cited');assert.equal(untimed.usage,'found');
  assert.deepEqual([timed.timed,timed.seconds,timed.end],[true,1,3]);
  assert.deepEqual([untimed.timed,untimed.seconds,untimed.end],[false,null,null]);
  assert.equal(untimed.quote,'The lighthouse is on the shore.');assert.equal(timed.quote,'The lighthouse blinks twice.');
  assert.equal(timed.show,'Coastal show');assert.match(timed.locator.token,/^[a-f0-9]{64}$/);assert.deepEqual(timed.scope,{limit:6,more:false});
  assert(!/podcast\.example|assistant-e2e|[A-Za-z]:\\/.test(JSON.stringify(run.podcastCitations)),'no URL or path travels with a card');
  // The card resolves through the same exact reader the reviewed open action uses.
  assert.equal(require('../src/media-shelf-service').readPodcastSearch(h.dir,timed.locator,6).row.quote,timed.quote);
  // A follow-up that cites an earlier accessible passage shows only that passage, as carried; unused earlier results are not labelled as its basis.
  mode='text';answer='Comparing ['+timed.id+'] with the shore note.';
  const compare=await h.call('agentRun',{requestId:'compare',question:'Compare those passages',owner:h.owner});
  assert(compare.ok,compare.error);assert.deepEqual(compare.podcastCitations.map(card=>[card.id,card.usage]),[[timed.id,'carried']]);
  answer='No passage is cited here.';
  assert.deepEqual((await h.call('agentRun',{requestId:'plain',question:'Anything else?',owner:h.owner})).podcastCitations,[]);
  answer='Comparing ['+timed.id+'] elsewhere.';
  assert.deepEqual((await h.call('agentRun',{requestId:'foreign',question:'Compare those passages',owner:{...h.owner,thread:'foreign'}})).podcastCitations,[],'another conversation cannot reuse the passage');
  mode='watched';turn=0;
  const watched=await h.call('agentRun',{requestId:'watched',question:'Where did lighthouse occur so far?',owner:h.owner});
  assert.deepEqual(watched.podcastCitations,[]);
 }finally{h.close();}
});

test('podcast cards report the real six-result limit and that more matches exist',async()=>{
 let turn=0;const h=fixture(()=>++turn===1?tool('search_saved_podcasts',{query:'lighthouse'}):reply({role:'assistant',content:'Done.'}));
 try{
  podcastFixture(h,Array.from({length:7},(_,index)=>({title:'Episode '+index,transcript:{state:'untimed',format:'plain',text:'A lighthouse note '+index+'.',provenance:'publisher'}})));
  const run=await h.call('agentRun',{requestId:'more',question:'Find lighthouse',owner:h.owner});
  assert(run.ok,run.error);assert.equal(run.podcastCitations.length,6);
  assert(run.podcastCitations.every(card=>card.scope.limit===6&&card.scope.more===true&&card.usage==='found'));
 }finally{h.close();}
});

test('a podcast source card cannot resolve once its saved text changed, so nothing can be opened or sought',async()=>{
 let turn=0;const h=fixture(()=>++turn===1?tool('search_saved_podcasts',{query:'lighthouse'}):reply({role:'assistant',content:'Done.'}));
 try{
  const [entry]=podcastFixture(h,[{title:'Episode',transcript:timedTranscript('The lighthouse blinks twice.')}]),shelf=require('../src/media-shelf-service');
  const card=(await h.call('agentRun',{requestId:'stale',question:'Find lighthouse',owner:h.owner})).podcastCitations[0];
  assert.equal(shelf.readPodcastSearch(h.dir,card.locator,6).row.token,card.locator.token);
  assert.throws(()=>shelf.readPodcastSearch(h.dir,{...card.locator,episode:'another-episode'},6),error=>error.sourceChanged===true);
  h.feeds.store.podcastWorkspace(entry.id,require('../src/podcast-session').sourceVersion(entry),{transcript:timedTranscript('The lighthouse blinks thrice.')});
  assert.throws(()=>shelf.readPodcastSearch(h.dir,card.locator,6),error=>error.sourceChanged===true&&/changed or was removed/.test(error.message));
 }finally{h.close();}
});

test('podcast chain: search → source cards → comparison → return → note draft → edit → preview → approve → lost reply → repeat → one note',async()=>{
 let mode='search',turn=0,answer='';
 const h=fixture(body=>{
  if(mode==='search'){
   if(++turn===1)return tool('search_saved_podcasts',{query:'lighthouse',show:'Coastal'});
   const timed=JSON.parse(body.messages.at(-1).content).matches.find(row=>row.seconds!==null);
   return reply({role:'assistant',content:'The timed episode says ['+timed.id+'] the lighthouse blinks.'});
  }
  return reply({role:'assistant',content:answer});
 });
 try{
  const entries=podcastFixture(h,[{title:'Untimed episode',transcript:{state:'untimed',format:'plain',text:'The lighthouse is on the shore.',provenance:'publisher'}},{title:'Timed episode',transcript:timedTranscript('The lighthouse blinks twice.')}]);
  const note=input=>h.call('podcastNote',{owner:h.owner,...input}),shelf=require('../src/media-shelf-service'),notes=()=>h.notes.list();
  // 1. search → real source cards
  const found=await h.call('agentRun',{requestId:'chain-search',question:'Find lighthouse in saved podcasts',owner:h.owner});assert(found.ok,found.error);
  const timed=found.podcastCitations.find(card=>card.timed),untimed=found.podcastCitations.find(card=>!card.timed);assert(timed&&untimed);
  // 2. comparison from the earlier results; a fabricated reference is counted but never becomes a card
  mode='text';answer='Compared: ['+timed.id+'] blinks while ['+untimed.id+'] only mentions the shore. Also [P00000000-0000-0000-0000-000000000000].';
  const compared=await h.call('agentRun',{requestId:'chain-compare',question:'Compare those passages',owner:h.owner});assert(compared.ok,compared.error);
  assert.deepEqual(compared.podcastCitations.map(card=>card.usage),['carried','carried']);assert.equal(compared.podcastUnverified,1);
  assert(!compared.podcastCitations.some(card=>card.id.startsWith('P00000000')));
  // 3. return to the same sources through the exact resolver
  for(const card of compared.podcastCitations)assert.equal(shelf.readPodcastSearch(h.dir,card.locator,6).row.token,card.locator.token);
  // 4. a draft and a preview never write
  const draft=await note({action:'draft',locator:timed.locator});assert(draft.ok,draft.error);
  assert.deepEqual([draft.source.timed,draft.source.seconds,draft.source.quote,draft.source.existing],[true,1,'The lighthouse blinks twice.',null]);
  // 5. manual edits: only the last preview can be approved
  const first=await note({action:'preview',draftId:draft.draftId,text:'First draft'});assert(first.ok);
  const second=await note({action:'preview',draftId:draft.draftId,text:'  Edited by hand  '});assert.equal(second.note,'Edited by hand');
  assert.equal(notes().length,0,'draft and previews write nothing');
  const outdated=await note({action:'save',draftId:draft.draftId,previewToken:first.previewToken});assert.deepEqual([outdated.ok,outdated.code],[false,'preview-outdated']);assert.equal(notes().length,0);
  // 6. approval writes one note bound to the verified source version, track and time
  const saved=await note({action:'save',draftId:draft.draftId,previewToken:second.previewToken});assert(saved.ok,saved.error);assert.equal(saved.created,true);
  const row=notes()[0];assert.equal(notes().length,1);
  assert.deepEqual([row.note,row.source,row.start,row.mediaType,row.type],['Edited by hand','The lighthouse blinks twice.',1,'podcast','quote']);
  assert.match(row.trackId,/^publisher:/);assert(row.sourceVersion&&row.episodeIdentity&&row.sourceBinding);
  // 7. the reply was lost: the user repeats (and a concurrent duplicate arrives) → same note, no second record
  const [again,concurrent]=await Promise.all([note({action:'save',draftId:draft.draftId,previewToken:second.previewToken}),note({action:'save',draftId:draft.draftId,previewToken:second.previewToken})]);
  for(const result of [again,concurrent])assert.deepEqual([result.ok,result.replayed,result.annotationId],[true,true,saved.annotationId]);
  assert.equal(notes().length,1,'a repeated approval creates no second note');
  // 7b. the note is opened again (a new draft of the same passage): the saved text and its revision are loaded; saving the same text updates the one record
  const reopened=await note({action:'draft',locator:timed.locator});assert.equal(reopened.source.existing.note,'Edited by hand','reopening shows the saved note');assert.notEqual(reopened.targetRevision,'new');
  const reopenPreview=await note({action:'preview',draftId:reopened.draftId,text:'Edited by hand'});const resaved=await note({action:'save',draftId:reopened.draftId,previewToken:reopenPreview.previewToken});
  assert.deepEqual([resaved.ok,resaved.created,resaved.annotationId],[true,false,saved.annotationId],'the reopened note is updated, not duplicated');assert.equal(notes().length,1);
  // two concurrent first saves of a fresh preview: one writes, the other sees it pending; still one record
  const racing=await note({action:'draft',locator:untimed.locator}),racePreview=await note({action:'preview',draftId:racing.draftId,text:'Race'});
  const [one,two]=await Promise.all([note({action:'save',draftId:racing.draftId,previewToken:racePreview.previewToken}),note({action:'save',draftId:racing.draftId,previewToken:racePreview.previewToken})]);
  assert.deepEqual([one.ok,two.pending],[true,true]);assert.equal(notes().length,2);
  // variant: the conversation switches before approval → refused, nothing written
  const switching=await note({action:'draft',locator:untimed.locator}),switchPreview=await note({action:'preview',draftId:switching.draftId,text:'Other chat'});
  const switched=await note({action:'save',draftId:switching.draftId,previewToken:switchPreview.previewToken,owner:{...h.owner,thread:'other-thread'}});
  assert.deepEqual([switched.ok,switched.code],[false,'owner-changed']);assert.equal(notes().length,2);
  // variant: the saved source changes between preview and approval → nothing written, quote not rebound
  h.feeds.store.podcastWorkspace(entries[0].id,require('../src/podcast-session').sourceVersion(entries[0]),{transcript:{state:'untimed',format:'plain',text:'The lighthouse is on the shore, repainted.',provenance:'publisher'}});
  const gone=await note({action:'save',draftId:switching.draftId,previewToken:switchPreview.previewToken});
  assert.deepEqual([gone.ok,gone.code,gone.sourceChanged],[false,'source-changed',true]);assert.equal(notes().length,2);
  assert.equal((await note({action:'draft',locator:untimed.locator})).code,'source-changed','the old card cannot start a new draft either');
  // variant: the note it would replace changes after the preview → target revision check refuses
  const editing=await note({action:'draft',locator:timed.locator});assert.equal(editing.source.existing.note,'Edited by hand');
  const replacement=await note({action:'preview',draftId:editing.draftId,text:'Replacement'});
  h.notes.upsert({...notes().find(item=>item.id===saved.annotationId),note:'Changed elsewhere',updatedAt:Date.now()+5});
  const target=await note({action:'save',draftId:editing.draftId,previewToken:replacement.previewToken});assert.deepEqual([target.ok,target.code],[false,'target-changed']);
  assert.equal(h.notes.get(saved.annotationId).note,'Changed elsewhere');
  // variant: cancel discards the draft
  assert.equal((await note({action:'cancel',draftId:editing.draftId})).cancelled,true);
  assert.equal((await note({action:'preview',draftId:editing.draftId,text:'x'})).code,'expired');
 }finally{h.close();}
});

// ---------------------------------------------------------------------------------------------------------------
// Podcast note save races (pkg4). The real note service and the real note store run with a controllable source
// answer: a gate holds the saved-source verification so a competing action can happen exactly while a save waits.
// ---------------------------------------------------------------------------------------------------------------
function noteLab(options={}){
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'assistant-note-race-')),store=new (require('../src/browser-note-store').BrowserNoteStore)(path.join(dir,'notes.json'));
 const {createReceipts}=require('../src/assistant-receipts');
 const clock={time:1_000_000},now=()=>clock.time,receipts=createReceipts({now});
 const row={token:'a'.repeat(64),episodeIdentity:'episode-1',sourceVersion:'version-1',role:'source',timed:true,seconds:1,end:3,quote:'The lighthouse blinks twice.',showTitle:'Show',episodeTitle:'Episode',
  sourceBinding:{episodeIdentity:'episode-1',revision:'r1'},playbackOwner:'owner-1',sourceEntryId:'entry-1'};
 const state={valid:true,answer:()=>({ok:true,row})},gates=[],writes=[];
 const hold=()=>{const gate={called:false,release:null};gate.reached=new Promise(resolve=>{gate.reach=resolve;});gates.push(gate);return gate;};
 const podcastSearch=async locator=>{
  const gate=gates.find(item=>!item.called);
  if(gate){gate.called=true;return new Promise(resolve=>{gate.release=()=>resolve(state.answer(locator));gate.reach();});}
  return state.answer(locator);
 };
 const canonical=require('../src/research-annotation-writer').createAnnotationWriter({store:()=>store});
 const counted={save:(raw,extra)=>{const result=canonical.save(raw,extra);if(result.ok||result.committed)writes.push(raw.note);return options.afterWrite?options.afterWrite(result):result;},get:id=>canonical.get(id)};
 const service=require('../src/assistant-podcast-note').createNotes({podcastSearch,notes:options.writer?options.writer({store,writes,canonical}):counted,manifest,validateOwner:()=>state.valid,receipts,now});
 const owner=manifest.clean({kind:'studio',owner:'studio-A',thread:'thread-A'}),locator={action:'podcast-search-resolve',query:'lighthouse',episode:'entry-1',token:row.token};
 const call=(input,sender=1)=>service.handle(sender,{owner,...input});
 async function drafted(text){
  const draft=await call({action:'draft',locator});assert(draft.ok,draft.error);
  const preview=text===undefined?null:await call({action:'preview',draftId:draft.draftId,text});if(preview)assert(preview.ok,preview.error);
  return {draft,preview};
 }
 return {dir,store,row,state,gates,writes,hold,call,drafted,service,receipts,clock,locator,owner,
  texts:()=>store.list().map(item=>item.note),close:()=>fs.rmSync(dir,{recursive:true,force:true})};
}

test('REGRESSION: a newer preview made while a save waits for source verification never lets the old approval write the new text',async()=>{
 const lab=noteLab();try{
  const {draft,preview}=await lab.drafted('APPROVED TEXT');
  const gate=lab.hold(),first=lab.call({action:'save',draftId:draft.draftId,previewToken:preview.previewToken});await gate.reached;
  const second=await lab.call({action:'preview',draftId:draft.draftId,text:'NEW TEXT WITHOUT SAVE APPROVAL'});assert(second.ok,second.error);
  gate.release();const result=await first;
  assert.deepEqual([result.ok,result.code],[false,'preview-outdated'],'the old approval is refused, explicitly');
  assert.deepEqual(lab.texts(),[],'nothing was written: the new text was never approved');
  const saved=await lab.call({action:'save',draftId:draft.draftId,previewToken:second.previewToken});assert(saved.ok,saved.error);
  assert.deepEqual(lab.texts(),['NEW TEXT WITHOUT SAVE APPROVAL'],'only the new approval writes the new text');assert.equal(lab.writes.length,1);
 }finally{lab.close();}
});

test('REGRESSION: two approvals of one draft completing in either order write only the approved text of the winning preview',async()=>{
 for(const order of ['old-first','new-first']){
  const lab=noteLab();try{
   const {draft,preview}=await lab.drafted('TEXT A');
   const gateA=lab.hold(),saveA=lab.call({action:'save',draftId:draft.draftId,previewToken:preview.previewToken});await gateA.reached;
   const second=await lab.call({action:'preview',draftId:draft.draftId,text:'TEXT B'});
   const gateB=lab.hold(),saveB=lab.call({action:'save',draftId:draft.draftId,previewToken:second.previewToken});await gateB.reached;
   const releases=order==='old-first'?[gateA,gateB]:[gateB,gateA];releases[0].release();await Promise.resolve();await new Promise(resolve=>setImmediate(resolve));releases[1].release();
   const [a,b]=await Promise.all([saveA,saveB]);
   assert.deepEqual([a.ok,a.code],[false,'preview-outdated'],order+': the superseded approval is refused, never reported as saved');assert.equal(b.ok,true,order);
   assert.deepEqual(lab.texts(),['TEXT B'],order);assert.equal(lab.writes.length,1,order+': one write');
  }finally{lab.close();}
 }
});

test('REGRESSION: cancelling or switching the conversation while a save waits for verification writes nothing and says so truthfully',async()=>{
 const lab=noteLab();try{
  const {draft,preview}=await lab.drafted('Cancelled text');
  const gate=lab.hold(),pending=lab.call({action:'save',draftId:draft.draftId,previewToken:preview.previewToken});await gate.reached;
  const cancelled=await lab.call({action:'cancel',draftId:draft.draftId});assert.deepEqual([cancelled.ok,cancelled.cancelled,cancelled.saved],[true,true,false]);
  gate.release();const result=await pending;assert.deepEqual([result.ok,result.code],[false,'cancelled']);assert.deepEqual(lab.texts(),[],'a cancelled draft cannot be written afterwards');
 }finally{lab.close();}
 const other=noteLab();try{
  const {draft,preview}=await other.drafted('Moved chat');
  const gate=other.hold(),pending=other.call({action:'save',draftId:draft.draftId,previewToken:preview.previewToken});await gate.reached;
  other.state.valid=false;gate.release();const result=await pending;
  assert.deepEqual([result.ok,result.code],[false,'owner-changed']);assert.deepEqual(other.texts(),[],'the conversation changed while waiting: nothing was written');
 }finally{other.close();}
});

test('REGRESSION: a note changed elsewhere while a save waits is never overwritten, and a competing draft for the same passage cannot write in parallel',async()=>{
 const lab=noteLab();try{
  const {draft,preview}=await lab.drafted('First');assert(preview.ok);
  const savedFirst=await lab.call({action:'save',draftId:draft.draftId,previewToken:preview.previewToken});assert(savedFirst.ok,savedFirst.error);
  const edit=await lab.drafted('Replacement');
  const gate=lab.hold(),pending=lab.call({action:'save',draftId:edit.draft.draftId,previewToken:edit.preview.previewToken});await gate.reached;
  const current=lab.store.get(savedFirst.annotationId);lab.store.upsert({...current,note:'Changed elsewhere',updatedAt:current.updatedAt+5});
  gate.release();const result=await pending;assert.deepEqual([result.ok,result.code],[false,'target-changed']);assert.deepEqual(lab.texts(),['Changed elsewhere']);
 }finally{lab.close();}
 const racing=noteLab();try{
  const one=await racing.drafted('From draft one'),two=await racing.drafted('From draft two');
  const gate=racing.hold(),first=racing.call({action:'save',draftId:one.draft.draftId,previewToken:one.preview.previewToken});await gate.reached;
  const blocked=await racing.call({action:'save',draftId:two.draft.draftId,previewToken:two.preview.previewToken});
  assert.deepEqual([blocked.ok,blocked.code,blocked.pending],[false,'target-busy',true],'a second draft for the same passage waits instead of writing in parallel');assert.deepEqual(racing.texts(),[]);
  gate.release();assert((await first).ok);assert.deepEqual(racing.texts(),['From draft one']);
  const retry=await racing.call({action:'save',draftId:two.draft.draftId,previewToken:two.preview.previewToken});assert.deepEqual([retry.ok,retry.code],[false,'target-changed'],'the second draft must be previewed again against the new note');
  assert.deepEqual(racing.texts(),['From draft one']);assert.equal(racing.writes.length,1);
 }finally{racing.close();}
});

test('REGRESSION: a cancel after a completed save never claims that nothing was saved; a lost receipt or an expired draft still replays instead of saving again',async()=>{
 const lab=noteLab();try{
  const {draft,preview}=await lab.drafted('Saved text');const saved=await lab.call({action:'save',draftId:draft.draftId,previewToken:preview.previewToken});assert(saved.ok,saved.error);
  const late=await lab.call({action:'cancel',draftId:draft.draftId});assert.deepEqual([late.ok,late.cancelled,late.saved,late.annotationId],[true,false,true,saved.annotationId],'the write happened; a later cancel does not erase or deny it');
  // The draft is gone (cancelled) but the reply may have been lost: the same approval replays the stored result.
  const replay=await lab.call({action:'save',draftId:draft.draftId,previewToken:preview.previewToken});assert.deepEqual([replay.ok,replay.replayed,replay.annotationId],[true,true,saved.annotationId]);assert.equal(lab.writes.length,1);
  // Draft lifetime (10 min) is shorter than the receipt lifetime (30 min): an expired draft still replays its settled approval.
  const another=await lab.drafted('Second text');const second=await lab.call({action:'save',draftId:another.draft.draftId,previewToken:another.preview.previewToken});assert(second.ok);
  lab.clock.time+=11*60*1000;const expired=await lab.call({action:'save',draftId:another.draft.draftId,previewToken:another.preview.previewToken});assert.deepEqual([expired.ok,expired.replayed],[true,true]);assert.equal(lab.writes.length,2);
  // The receipt itself is lost (restart, pruning): a fresh draft of the same passage updates the one record, it never makes a second one.
  lab.receipts.clear();const again=await lab.drafted('Second text');assert.equal(again.draft.source.existing.note,'Second text');
  const rewrite=await lab.call({action:'save',draftId:again.draft.draftId,previewToken:again.preview.previewToken});assert.deepEqual([rewrite.ok,rewrite.created],[true,false]);assert.equal(lab.store.list().length,1);
 }finally{lab.close();}
});

test('REGRESSION: a write that committed but reported a late durability error is not presented as "nothing saved"',async()=>{
 const lab=noteLab({afterWrite:()=>{const error=new Error('directory sync failed');error.committed=true;throw error;}});try{
  const {draft,preview}=await lab.drafted('Committed text');const result=await lab.call({action:'save',draftId:draft.draftId,previewToken:preview.previewToken});
  assert.deepEqual([result.ok,result.durable],[true,false],'the note is in the store, so the result must say it was saved (durability unconfirmed)');assert.deepEqual(lab.texts(),['Committed text']);
  const again=await lab.call({action:'save',draftId:draft.draftId,previewToken:preview.previewToken});assert.deepEqual([again.ok,again.replayed],[true,true]);assert.equal(lab.writes.length,1);
 }finally{lab.close();}
});

test('the canonical research writer is one code path: compare-and-set, committed-but-unsynced writes, the unchanged legacy contract and no divergence from the note store',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'assistant-writer-')),store=new (require('../src/browser-note-store').BrowserNoteStore)(path.join(dir,'notes.json'));
 const {createAnnotationWriter,annotationRevision}=require('../src/research-annotation-writer'),indexed=[];
 const writer=createAnnotationWriter({store:()=>store,index:()=>({upsertAnnotation:row=>indexed.push(row.id)}),indexMedia:(index,row)=>{assert(index);indexed.push('media:'+row.mediaId);}});
 try{
  assert.deepEqual(writer.save({}),{ok:false,error:'Not ve medya kimliği gerekli.'},'the legacy validation message is unchanged');
  const first=writer.save({id:'n1',mediaId:'m1',type:'note',note:'one',source:'q'});assert.equal(first.ok,true);assert.deepEqual(indexed,['media:m1','n1'],'index registration happens in the same writer');
  // legacy callers (no options) still overwrite, exactly as the notebook IPC always did
  assert.equal(writer.save({id:'n1',mediaId:'m1',type:'note',note:'two',source:'q'}).ok,true);assert.equal(store.get('n1').note,'two');
  const revision=writer.revisionOf(store.get('n1'));assert.equal(revision,annotationRevision(store.get('n1')));assert.equal(writer.revisionOf(null),'new');
  // compare-and-set: a stale expectation writes nothing
  const stale=writer.save({id:'n1',mediaId:'m1',type:'note',note:'three',source:'q'},{expectRevision:'0'.repeat(24)});assert.deepEqual([stale.ok,stale.code],[false,'target-changed']);assert.equal(store.get('n1').note,'two');
  assert.equal(writer.save({id:'n1',mediaId:'m1',type:'note',note:'three',source:'q'},{expectRevision:revision}).ok,true);assert.equal(store.get('n1').note,'three');
  // "does not exist yet" is itself a revision: a second creator expecting 'new' loses
  assert.equal(writer.save({id:'n2',mediaId:'m1',type:'note',note:'a',source:'q2'},{expectRevision:'new'}).ok,true);
  assert.equal(writer.save({id:'n2',mediaId:'m1',type:'note',note:'b',source:'q2'},{expectRevision:'new'}).code,'target-changed');assert.equal(store.get('n2').note,'a');
  // directory sync failed after the rename committed: the note is stored, so the writer says so
  const original=store.flush.bind(store);store.flush=()=>{original();const error=new Error('fsync dir');error.committed=true;throw error;};
  const unsynced=writer.save({id:'n3',mediaId:'m1',type:'note',note:'kept',source:'q3'});store.flush=original;
  assert.deepEqual([unsynced.ok,unsynced.committed,unsynced.annotation?.note],[false,true,'kept']);assert.equal(store.get('n3').note,'kept');
  // an unreadable store refuses writes with the store's own reason
  store.loadError='broken';assert.deepEqual(writer.save({id:'n4',mediaId:'m1',note:'x'}),{ok:false,error:'broken'});assert.equal(writer.get('n1'),null);store.loadError='';
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});

test('a saved note keeps its quote, source version and binding after the saved source changes; later drafts are refused with the reason and the approval still replays',async()=>{
 let turn=0;const h=fixture(()=>++turn===1?tool('search_saved_podcasts',{query:'lighthouse'}):reply({role:'assistant',content:'Done.'}));
 try{
  const [entry]=podcastFixture(h,[{title:'Episode',transcript:timedTranscript('The lighthouse blinks twice.')}]);
  const card=(await h.call('agentRun',{requestId:'keep-note',question:'Find lighthouse',owner:h.owner})).podcastCitations[0],note=input=>h.call('podcastNote',{owner:h.owner,...input});
  const draft=await note({action:'draft',locator:card.locator}),preview=await note({action:'preview',draftId:draft.draftId,text:'Keep this'});
  const saved=await note({action:'save',draftId:draft.draftId,previewToken:preview.previewToken});assert(saved.ok,saved.error);
  const before=h.notes.get(saved.annotationId);
  h.feeds.store.podcastWorkspace(entry.id,require('../src/podcast-session').sourceVersion(entry),{transcript:timedTranscript('The saved text was replaced.')});
  assert.deepEqual(h.notes.get(saved.annotationId),before,'the stored record is untouched by a source change');
  assert.deepEqual([before.source,before.note,before.start],['The lighthouse blinks twice.','Keep this',1]);assert(before.sourceVersion&&before.sourceBinding&&before.episodeIdentity,'the exact source version and binding remain readable');
  const refused=await note({action:'draft',locator:card.locator});assert.deepEqual([refused.ok,refused.code,refused.sourceChanged],[false,'source-changed',true]);
  const replay=await note({action:'save',draftId:draft.draftId,previewToken:preview.previewToken});assert.deepEqual([replay.ok,replay.replayed,replay.annotationId],[true,true,saved.annotationId]);
  assert.equal(h.notes.list().length,1,'one record, never rebound to the changed text');
 }finally{h.close();}
});

// ---------------------------------------------------------------------------------------------------------------
// Acceptance D (pkg6). REAL: assistant-agent-service handlers (agentRun/agentApply), tool registry and validation, the proposal/receipt
// machinery, registerDubService().runs, the persistent run records, the run ledger and the WAV check.
// CONTROLLED: the model (a scripted provider issuing the tool calls a real question needs), the renderer's answers
// (panel selection / open media / "open run" acknowledgement) and the low-level worker process.
// ---------------------------------------------------------------------------------------------------------------
const {world:dubWorld,wav:dubWav,outputOf:dubOutputOf}=require('./dub-run-world');
async function voiceRunsWorld(){
 const w=dubWorld(),first=w.boot(),start=async(id,source)=>{const index=w.spawns.length;assert.equal((await first.call('dub:start',{...w.request(id),source})).ok,true);return index;};
 let index=await start('run-ok','media-A');fs.writeFileSync(dubOutputOf(w.spawns[index]),dubWav(2));w.spawns[index].proc.exitCode=0;w.spawns[index].proc.emit('close',0);await new Promise(r=>setTimeout(r,15));
 index=await start('run-fail','media-B');w.spawns[index].proc.stderr.emit('data','worker exploded');w.spawns[index].proc.exitCode=1;w.spawns[index].proc.emit('close',1);await new Promise(r=>setTimeout(r,15));
 index=await start('run-cut','media-A');const output=dubOutputOf(w.spawns[index]);fs.writeFileSync(output,dubWav(3));w.spawns[index].proc.stdout.emit('data','Tamamlandi: '+output+'\n');
 for(const name of fs.readdirSync(path.join(w.logs,'instances'))){const f=path.join(w.logs,'instances',name),lease=JSON.parse(fs.readFileSync(f,'utf8'));fs.writeFileSync(f,JSON.stringify({...lease,pid:2147483000}));}
 const svc=w.boot();return {w,svc,runs:svc.service.runs,spawns:()=>w.spawns.length};
}
const scripted=(steps,seen)=>{let turn=0;return body=>{if(turn>0){const last=body.messages.filter(m=>m.role==='tool').at(-1)?.content||'';let parsed;try{parsed=JSON.parse(last);}catch(_){parsed={raw:last};}seen.push(parsed);}const step=steps[turn++];return step?step(seen):reply({role:'assistant',content:'Done.'});};};
const panelAnswer=(selected,extra={})=>packet=>packet.name==='get_voice_panel'?{status:'completed',panelOpen:true,selectedRunId:selected,openSource:'media-A',media:{title:'Film now playing'},...extra}:{status:'completed',selected:true,audioReady:true,note:'ok'};

test('D: "why is this run partial", "is there a usable result": the answer rests on the exact record, keeps the selected run and the playing media apart, claims no listening and leaks no paths, pids or instances',async()=>{
 const v=await voiceRunsWorld(),seen=[];
 const h=fixture(scripted([()=>tool('get_voice_runs',{},'t1'),rows=>tool('inspect_voice_run',{run_id:rows[0].runs.find(r=>r.state==='interrupted').run_id},'t2'),rows=>tool('inspect_voice_run',{run_id:'run-ok'},'t3')],seen),{voiceRuns:v.runs});
 try{
  h.alwaysRenderer(panelAnswer('run-ok'));const spawns=v.spawns();
  const result=await h.call('agentRun',{requestId:'d1',question:'Why was this run left half done, and do I have a usable result?',owner:h.owner});assert(result.ok,result.error);
  const [list,cut,ok]=seen;
  assert.deepEqual(list.runs.map(r=>r.run_id).sort(),['run-cut','run-fail','run-ok']);
  assert.equal(list.selected_in_panel,'run-ok');assert.equal(list.current_media.title,'Film now playing');assert.match(list.panel_note,/not the media that is currently playing/);assert.match(list.note,/not listened to/,'the list also says the audio check is not listening');
  const row=id=>list.runs.find(r=>r.run_id===id);
  assert.deepEqual([row('run-cut').state,row('run-cut').recoverable,row('run-cut').source_matches_current_media],['interrupted',true,true]);
  assert.deepEqual([row('run-fail').state,row('run-fail').source_matches_current_media],['failed',false],'a run of another source is not the open media');
  assert.equal(row('run-fail').error.code,'recorded-error','a recorded failure is reported without guessing its cause');assert.match(row('run-fail').error.message,/local production panel/);assert(!JSON.stringify(seen).includes('worker exploded'),'raw worker stderr remains local rather than entering provider context');
  assert.match(cut.what_the_record_establishes,/instance that started this run is gone/);assert(cut.why.some(text=>/worker reported that it finished/.test(text)));
  assert(cut.unknown.includes('what the audio sounds like'),'the file check is not presented as listened');assert.match(cut.note,/not listened to/);
  assert.equal(ok.run.run_id,'run-ok');assert.equal(ok.selected_in_panel,'run-ok');
  assert.doesNotMatch(JSON.stringify(seen),/pid|instance_?id|dub-logs|Sesler|\\\\|\/tmp\/|\.venv|desktop|lease|heartbeat/i,'no path, pid, instance or raw log reaches the model');
  assert.equal(v.spawns(),spawns,'reading history starts nothing');
 }finally{h.close();v.w.close();}
});

test('D: "show the differences before retrying" is read-only: it creates no approval and does not invalidate the one open in the panel; an unknown or forged run id is refused',async()=>{
 const v=await voiceRunsWorld(),seen=[];
 const h=fixture(scripted([()=>tool('preview_voice_retry',{run_id:'run-fail',settings:'pinned'},'t1'),()=>tool('inspect_voice_run',{run_id:'../../etc/passwd'},'t2'),()=>tool('inspect_voice_run',{run_id:'run-unknown'},'t3')],seen),{voiceRuns:v.runs});
 try{
  h.alwaysRenderer(panelAnswer(null));
  fs.writeFileSync(path.join(v.w.root,'dub-settings.json'),JSON.stringify({timingMode:'clip',keepEngine:false,profile:'fast',autoFit:false,naturalSpeech:false}));
  const uiPlan=await v.svc.call('dub:runs',{action:'retry-preview',runId:'run-fail',settings:'pinned'});assert.equal(uiPlan.ok,true,JSON.stringify(uiPlan));
  const result=await h.call('agentRun',{requestId:'d2',question:'Show the differences before retrying with the pinned settings.',owner:h.owner});assert(result.ok,result.error);
  assert.deepEqual([seen[0].ok,seen[0].starts_nothing],[true,true]);assert(Array.isArray(seen[0].differences));assert.doesNotMatch(JSON.stringify(seen[0]),/token|approval_token/i);assert.match(seen[0].note,/read-only preview; no approval exists/);
  assert.match(JSON.stringify(seen[1]),/Unknown voice run id/);assert.match(JSON.stringify(seen[2]),/Unknown voice run id/);
  const before=v.spawns(),approved=await v.svc.call('dub:runs',{action:'retry-approve',token:uiPlan.token});
  assert.equal(approved.ok,true,'the approval the user had open is still valid after the assistant read the preview');assert.equal(v.spawns(),before+1,'only the user\'s approval started a production');
 }finally{h.close();v.w.close();}
});

test('D: "go back to the source" and "open the result" are different targets; a source that is not the open media is blocked with the reason; opening starts, recovers and retries nothing',async()=>{
 const v=await voiceRunsWorld(),seen=[];
 const h=fixture(scripted([()=>tool('open_voice_run',{run_id:'run-fail',target:'source'},'t1'),()=>tool('open_voice_run',{run_id:'run-ok',target:'source'},'t2'),()=>tool('open_voice_run',{run_id:'run-ok',target:'result'},'t3'),()=>tool('open_voice_run',{run_id:'run-fail',target:'result'},'t4')],seen),{voiceRuns:v.runs});
 try{
  const opened=[];h.alwaysRenderer(packet=>{if(packet.name==='open_voice_run'){opened.push(packet.args);return {status:'completed',run_id:packet.args.run_id,target:packet.args.target,selected:true,audio_ready_paused:true};}return panelAnswer('run-ok')(packet);});
  const result=await h.call('agentRun',{requestId:'d3',question:'Go back to the source, then open the result',owner:h.owner});assert(result.ok,result.error);
  assert.equal(seen[0].status,'blocked');assert.match(seen[0].note,/not known to be the currently open media/);assert.match(seen[0].note,/only a source identity/);
  const proposals=h.events.filter(row=>row.packet.type==='proposal').map(row=>row.packet.action);
  assert.deepEqual(proposals.map(a=>a.tool),['open_voice_run','open_voice_run'],'the blocked ones made no card');assert.equal(seen[3].status,'blocked','no valid finished audio for the failed run');
  assert.notEqual(proposals[0].summary,proposals[1].summary,'source and result cards say different things');assert.match(proposals[0].summary,/kaynağı açık medyayla eşleşiyor|source matches the open media/);assert.match(proposals[1].summary,/listening-only|yalnız dinleyerek/);
  const spawns=v.spawns();
  const applied=await h.call('agentApply',{proposalId:proposals[1].proposalId,owner:h.owner});assert.equal(applied.ok,true,applied.error);
  assert.deepEqual(opened,[{run_id:'run-ok',target:'result'}],'the result card opened the result target of that exact run');
  const again=await h.call('agentApply',{proposalId:proposals[1].proposalId,owner:h.owner});assert.deepEqual([again.ok,again.replayed],[true,true]);assert.equal(opened.length,1,'a repeated approval is replayed, never dispatched again');
  assert.equal(v.spawns(),spawns,'opening starts no production');assert.equal(JSON.parse(fs.readFileSync(path.join(v.w.logs,fs.readdirSync(v.w.logs).find(n=>n.startsWith('run-cut'))),'utf8')).result,'running','nothing was recovered');
 }finally{h.close();v.w.close();}
});

test('D races: an old suggestion never opens a record that changed (state, audio file) or another conversation; the selection moving between reads keeps each answer tied to its own record',async()=>{
 const v=await voiceRunsWorld(),seen=[];
 const h=fixture(scripted([()=>tool('open_voice_run',{run_id:'run-cut',target:'result'},'t1')],seen),{voiceRuns:v.runs});
 try{
  const calls=[];h.alwaysRenderer(packet=>{calls.push(packet.name);return packet.name==='open_voice_run'?{status:'completed',selected:true,audio_ready_paused:true}:panelAnswer('run-cut')(packet);});
  await h.call('agentRun',{requestId:'d4',question:'open the recovered result',owner:h.owner});
  const card=h.events.filter(row=>row.packet.type==='proposal').at(-1).packet.action;
  // the record changes after the suggestion: the user recovers it elsewhere (uncertain/interrupted → completed)
  assert.equal((await v.svc.call('dub:runs',{action:'recover',runId:'run-cut'})).ok,true);
  const stale=await h.call('agentApply',{proposalId:card.proposalId,owner:h.owner});
  assert.equal(stale.ok,false);assert.match(stale.error,/changed since this suggestion; nothing was opened/);assert(!calls.includes('open_voice_run'),'the old approval never reached the open action');
 }finally{h.close();}
 const h2=fixture(scripted([()=>tool('open_voice_run',{run_id:'run-ok',target:'result'},'t1')],[]),{voiceRuns:v.runs});
 try{
  const calls=[];h2.alwaysRenderer(packet=>{calls.push(packet.name);return packet.name==='open_voice_run'?{status:'completed',selected:true}:panelAnswer(null)(packet);});
  await h2.call('agentRun',{requestId:'d5',question:'open it',owner:h2.owner});const card=h2.events.filter(row=>row.packet.type==='proposal').at(-1).packet.action;
  fs.writeFileSync(path.join(v.w.out,'run-ok.wav'),dubWav(2).subarray(0,3000));          // the audio changed while the suggestion was open
  const changed=await h2.call('agentApply',{proposalId:card.proposalId,owner:h2.owner});assert.equal(changed.ok,false);assert(!calls.includes('open_voice_run'));
  const other=await h2.call('agentApply',{proposalId:card.proposalId,owner:{...h2.owner,thread:'other-thread'}});assert.equal(other.ok,false,'another conversation cannot apply it');
 }finally{h2.close();}
 // the panel selection moves from A to B between two reads: each answer is tied to its own run and says which one the panel selected at that time
 const moving=[],h3=fixture(scripted([()=>tool('inspect_voice_run',{run_id:'run-ok'},'t1'),()=>tool('inspect_voice_run',{run_id:'run-fail'},'t2')],moving),{voiceRuns:v.runs});
 try{
  let reads=0;h3.alwaysRenderer(packet=>panelAnswer(++reads===1?'run-ok':'run-fail')(packet));
  await h3.call('agentRun',{requestId:'d6',question:'compare these two runs',owner:h3.owner});
  assert.deepEqual([moving[0].run.run_id,moving[0].selected_in_panel,moving[1].run.run_id,moving[1].selected_in_panel],['run-ok','run-ok','run-fail','run-fail']);
 }finally{h3.close();v.w.close();}
});
