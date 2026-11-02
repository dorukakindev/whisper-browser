'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{JSDOM}=require('jsdom');
const read=file=>fs.readFileSync(path.join(__dirname,'..',file),'utf8');
function setup(){
 const dom=new JSDOM('<body class="media-home-active"><section id="mediaHome" data-page="feeds"></section><textarea id="aiChatText"></textarea><div id="aiChatLog"></div><div id="aiChatEmpty"></div></body>',{runScripts:'outside-only'}),w=dom.window,calls=[],opened=[];let shown=0;const thread={draft:''};
 Object.assign(w,{structuredClone,UiLocale:{get:()=> 'en'},AssistantRetrieval:require('../src/assistant-retrieval'),AssistantWorkspace:{prepare:async()=>{},snapshot:()=>({current:thread})},AssistantAppActions:{current:()=>true}});
 w.api={feedsRequest:async packet=>{calls.push(packet);return {ok:true,sources:[{id:'F0123456789abcdef',entryId:'one',title:'Interview',url:'https://source.invalid/article',text:'MARA discusses a named key. Supporting source context.',scope:'summary',revision:'revision1',shortened:false}]};},showAssistant:async()=>{shown++;},openExternal:async url=>opened.push(url)};
 w.eval(read('src/renderer/assistant-feed-sources.js'));return {dom,w,calls,opened,thread,shown:()=>shown};
}
test('RSS user event attaches explicit revisions and summary coverage as draft, without a model call',async()=>{
 const h=setup(),{w}=h;try{const source=await w.AssistantFeedSources.attach({entryIds:['one'],prompt:'Compare the sources'});assert.equal(source.type,'feed-sources');assert.equal(source.feedSources.length,1);assert.equal(h.calls.length,1);assert.equal(h.calls[0].action,'context');assert.equal(h.thread.draft,'Compare the sources');assert.equal(h.shown(),1);assert.match(source.excerpt,/Summary/);
  const manifest=require('../src/assistant-context-manifest').sourceText(source);assert.equal(manifest.feedSources[0].id,'F0123456789abcdef');assert.equal(manifest.feedSources[0].scope,'summary');assert.equal(manifest.sourceCoverage.includedCharacters>0,true);
  const result=w.AssistantFeedSources.search('named key',{hasFeedSources:true});assert.equal(result.matches.length,1);assert.equal(result.matches[0].id,'F0123456789abcdef');assert.equal(result.parentContexts[0].text,source.feedSources[0].text);assert.equal(result.sources.length,1);
  assert.throws(()=>w.AssistantFeedSources.search('key',{hasFeedSources:false}),/changed/);
  w.document.getElementById('mediaHome').dataset.page='films';await new Promise(resolve=>setTimeout(resolve,0));assert.equal(w.AssistantFeedSources.context(),null);w.document.getElementById('mediaHome').dataset.page='feeds';assert.equal(w.AssistantFeedSources.context(),null);
 }finally{h.dom.window.close();}
});
test('search_sources is unavailable without explicit selected feed scope; web expansion is unavailable inside it',()=>{
 const registry=require('../src/assistant-capabilities');assert(!registry.list({kind:'library'}).some(r=>r.name==='search_sources'));const selected=registry.list({kind:'library',hasFeedSources:true});assert(selected.some(r=>r.name==='search_sources'));assert(!selected.some(r=>r.name==='research_web'));
});

test('RSS state tools stay scoped to one attached entry and apply only the matching reviewed preview',async()=>{
 const h=setup();try{await h.w.AssistantFeedSources.attach({entryIds:['one']});const packets=[],owner={hasFeedEntries:true};
  h.w.api.feedsRequest=async packet=>{packets.push(packet);return {ok:true,token:'opaque-preview',entry:{entry_id:'one',revision:'revision1',title:'Interview',copyCount:1,saved:packet.action==='state-apply',read:false,later:false},changes:packet.changes};};
  const api=h.w.AssistantFeedSources,read=await api.execute('read_feed_entry_state',{},owner);assert.equal(read.entry.entry_id,'one');
  await assert.rejects(api.execute('set_feed_entry_state',{entry_id:'unattached',saved:true},owner),/outside/);assert.equal(packets.length,1);
  const args={saved:true},preview=await api.execute('set_feed_entry_state',args,owner);assert.equal(preview.operation,'preview');assert.equal(packets.at(-1).action,'state-preview');
  const expected={kind:'feed-state',token:preview.token,entryId:'one',revision:'revision1',sourceRevision:preview.sourceRevision,args:JSON.stringify(args)};
  const rejected=await api.execute('set_feed_entry_state',{later:true},owner,{expectedSettings:expected});assert.equal(rejected.stale,true);assert.equal(packets.length,2);
  const applied=await api.execute('set_feed_entry_state',args,owner,{expectedSettings:expected});assert.equal(applied.entry.saved,true);assert.equal(packets.at(-1).action,'state-apply');
  const registry=require('../src/assistant-capabilities');assert(!registry.list({kind:'library',hasFeedSources:true}).some(r=>r.name==='set_feed_entry_state'));assert(registry.list({kind:'library',hasFeedSources:true,hasFeedEntries:true}).some(r=>r.name==='set_feed_entry_state'));assert.throws(()=>registry.validate('set_feed_entry_state',{},{kind:'library',hasFeedEntries:true}),/explicit/);
  const current=api.context();await api.attachPrepared({sources:[current.feedSources[0],{...current.feedSources[0],entryId:'two',id:'Ffedcba9876543210'}]},{ids:['one','two']});await assert.rejects(api.execute('read_feed_entry_state',{},owner),/Choose one/);
 }finally{h.dom.window.close();}
});

test('Reattaching the same feed preserves conversation identity but invalidates changed source ownership',async()=>{
 const h=setup();try{const first=await h.w.AssistantFeedSources.attach({entryIds:['one']});
  const source=require('../src/assistant-source-context'),scope=value=>source.scope({},value);
  h.w.api.feedsRequest=async()=>({ok:true,sources:[{...first.feedSources[0],revision:'revision2',text:'Updated article evidence'}]});
  const second=await h.w.AssistantFeedSources.attach({entryIds:['one']});assert.equal(second.id,first.id);assert.notEqual(scope(second),scope(first));
  h.w.api.feedsRequest=async()=>({ok:true,sources:[{...second.feedSources[0],text:'Changed snapshot with the same provider revision'}]});
  const third=await h.w.AssistantFeedSources.attach({entryIds:['one']});assert.notEqual(scope(third),scope(second));
 }finally{h.dom.window.close();}
});

test('Failed feed preparation restores the prior attachment and leaves its draft intact',async()=>{
 const h=setup();try{const first=await h.w.AssistantFeedSources.attach({entryIds:['one'],prompt:'Original question'});
  h.w.AssistantWorkspace.prepare=async()=>{throw Error('Conversation could not be saved');};
  await assert.rejects(h.w.AssistantFeedSources.attachPrepared({sources:[{...first.feedSources[0],entryId:'two',id:'Ffedcba9876543210'}]},{ids:['two'],prompt:'Failed question'}),/could not be saved/);
  assert.equal(h.w.AssistantFeedSources.context().id,first.id);assert.equal(h.thread.draft,'Original question');assert.equal(h.shown(),1);
 }finally{h.dom.window.close();}
});

test('Obsolete feed preparation cannot restore over a newer selection or write its question',async()=>{
 const h=setup();try{const first=await h.w.AssistantFeedSources.attach({entryIds:['one']});let release;
  h.w.AssistantWorkspace.prepare=()=>new Promise(resolve=>release=resolve);
  const old=h.w.AssistantFeedSources.attachPrepared({sources:[first.feedSources[0]]},{ids:['one'],prompt:'Obsolete'});
  h.w.AssistantWorkspace.prepare=async()=>{};
  const next=await h.w.AssistantFeedSources.attachPrepared({sources:[{...first.feedSources[0],entryId:'two',id:'Ffedcba9876543210'}]},{ids:['two'],prompt:'Latest'});
  release();await assert.rejects(old,/changed/);assert.equal(h.w.AssistantFeedSources.context().id,next.id);assert.equal(h.thread.draft,'Latest');
 }finally{h.dom.window.close();}
});

test('Two failed overlapping preparations restore only the last completed source',async()=>{
 const h=setup();try{const first=await h.w.AssistantFeedSources.attach({entryIds:['one'],prompt:'Original'});let rejectOld;
  h.w.AssistantWorkspace.prepare=()=>new Promise((resolve,reject)=>rejectOld=reject);
  const old=h.w.AssistantFeedSources.attachPrepared({sources:[{...first.feedSources[0],entryId:'two',id:'Ffedcba9876543210'}]},{ids:['two'],prompt:'Old pending'});
  h.w.AssistantWorkspace.prepare=async()=>{throw Error('New preparation failed');};
  await assert.rejects(h.w.AssistantFeedSources.attachPrepared({sources:[first.feedSources[0]]},{ids:['one'],prompt:'New pending'}),/failed/);
  rejectOld(Error('Old preparation failed'));await assert.rejects(old,/failed/);
  assert.equal(h.w.AssistantFeedSources.context().id,first.id);assert.equal(h.thread.draft,'Original');
 }finally{h.dom.window.close();}
});
test('Feed evidence is bounded, persists through thread cleaner and rejects unsafe or fabricated citation rows',()=>{
 const clean=require('../src/assistant-thread-store').cleanThread({id:'thread',sourceKey:'feeds',headId:'reply',messages:[{id:'reply',parentId:null,role:'assistant',text:'Supported [F0123456789abcdef]',feedEvidence:[{id:'F0123456789abcdef',entryId:'one',title:'Interview',url:'https://source.invalid/article',scope:'summary',revision:'one',text:'evidence'}, {id:'Ffedcba9876543210',url:'file:///private.txt',revision:'two'}, {id:'madeup',url:'https://x.invalid',revision:'three'}]}]});assert.equal(clean.messages[0].feedEvidence.length,1);assert.equal(clean.messages[0].feedEvidence[0].url,'https://source.invalid/article');
});
test('Actual renderer only links verified F IDs and opens the supplied safe source URL',async()=>{
 const h=setup(),{w}=h;try{w.aiSourceScope=()=> 'scope';const body=read('src/renderer/renderer.js'),a=body.indexOf('function renderAiText('),b=body.indexOf('\nfunction aiChatAdd(',a);w.eval(body.slice(a,b));const bubble=w.document.createElement('div');bubble._sourceScope='scope';bubble._feedEvidence=[{id:'F0123456789abcdef',url:'https://source.invalid/article'}];w.renderAiText(bubble,'Real [F0123456789abcdef], invented [Ffedcba9876543210]');assert.equal(bubble.querySelectorAll('button').length,1);bubble.querySelector('button').click();await new Promise(resolve=>setTimeout(resolve,0));assert.deepEqual(h.opened,['https://source.invalid/article']);assert.match(bubble.textContent,/Ffedcba9876543210/);}finally{h.dom.window.close();}
});

test('Actual agent service invokes selected-source tool and keeps supplied F evidence in its provider context',async()=>{
 const h=setup(),{w}=h;const {EventEmitter}=require('node:events'),handlers=new Map(),app=new EventEmitter(),sender=new EventEmitter();sender.id=842;sender.isDestroyed=()=>false;let turn=0,sawContext=false;
 try{const source=await w.AssistantFeedSources.attach({entryIds:['one']});const owner={kind:'library',owner:source.id,thread:'thread',hasFeedSources:true};
  sender.send=(_channel,packet)=>{if(packet.type==='action'){const result=w.AssistantFeedSources.search(packet.args.query,owner);void handlers.get('assistant:agentResult')({sender},{callId:packet.callId,result});}};
  require('../src/assistant-agent-service').register({app,ipcMain:{handle:(key,value)=>handlers.set(key,value)},authorized:()=>true,validateOwner:()=>true,getConfig:()=>({endpoint:'https://fixture.invalid/v1',model:'fixture'}),fetchImpl:async(_url,options)=>{const body=JSON.parse(options.body);sawContext ||= JSON.stringify(body.messages).includes('F0123456789abcdef');const message=++turn===1?{role:'assistant',tool_calls:[{id:'sources',type:'function',function:{name:'search_sources',arguments:JSON.stringify({query:'MARA key'})}}]}:{role:'assistant',content:'Supported by [F0123456789abcdef].'};return new Response(JSON.stringify({choices:[{message,finish_reason:'stop'}]}),{headers:{'content-type':'application/json'}});}});
  const result=await handlers.get('assistant:agentRun')({sender},{requestId:'selected-sources',question:'Compare only the selected sources.',owner,context:source,history:[],locale:'en'});assert.equal(result.ok,true,result.error);assert.equal(turn,2);assert(sawContext);assert.match(result.text,/F0123456789abcdef/);
 }finally{app.emit('will-quit');h.dom.window.close();}
});

test('Real feed store and assistant service preview RSS save without writes, apply the exact card and refuse later state drift',async()=>{
 const h=setup(),{w}=h,{EventEmitter}=require('node:events'),os=require('node:os'),dir=fs.mkdtempSync(path.join(os.tmpdir(),'assistant-feed-save-')),app=new EventEmitter(),handlers=new Map(),sender=new EventEmitter(),events=[];
 sender.id=843;sender.isDestroyed=()=>false;const event={sender};let turn=0,save=true;
 const feeds=require('../src/feed-service').registerFeeds({app,ipcMain:{handle(){}},authorized:e=>e===event,userData:()=>dir,autoStart:false});
 const subscription=feeds.store.subscribe({url:'https://source.invalid/rss',title:'Source'},[{externalId:'one',url:'https://source.invalid/article',title:'Interview',text:'Bounded evidence',contentScope:'summary',kind:'article'}],'latest20');
 w.api.feedsRequest=packet=>feeds.handle(event,packet);
 const service=require('../src/assistant-agent-service').register({app,ipcMain:{handle:(key,value)=>handlers.set(key,value)},authorized:e=>e===event,validateOwner:()=>true,getConfig:()=>({endpoint:'https://fixture.invalid/v1',model:'fixture'}),fetchImpl:async()=>new Response(JSON.stringify({choices:[{message:++turn%2?{role:'assistant',tool_calls:[{id:'save',function:{name:'set_feed_entry_state',arguments:JSON.stringify({saved:save})}}]}:{role:'assistant',content:'Review the exact RSS state card.'},finish_reason:'stop'}]}),{headers:{'content-type':'application/json'}})});
 try{
  const entry=feeds.store.entries().rows[0],source=await w.AssistantFeedSources.attach({entryIds:[entry.id]}),owner={kind:'library',owner:source.chapterRevision,thread:'thread',hasFeedSources:true,hasFeedEntries:true};
  sender.send=(_channel,packet)=>{events.push(packet);if(packet.type==='action')queueMicrotask(async()=>{let result;try{result=await w.AssistantFeedSources.execute(packet.name,packet.args,owner,{expectedSettings:packet.expectedSettings});}catch(error){result={status:'failed',error:error.message};}await handlers.get('assistant:agentResult')(event,{callId:packet.callId,result});});};
  const run=()=>handlers.get('assistant:agentRun')(event,{requestId:'rss-save-'+turn,question:save?'Bunu kaydet':'Kaydını kaldır',owner,context:source});
  assert.equal((await run()).ok,true);let card=events.filter(p=>p.type==='proposal').at(-1)?.action;assert(card);assert.match(card.summary,/Interview.*Saved: Yes/);assert.equal(feeds.store.entry(entry.id).saved,false);assert.equal(service.proposals.get(card.proposalId).expectedSettings.kind,'feed-state');
  let result=await handlers.get('assistant:agentApply')(event,{proposalId:card.proposalId,owner});assert.equal(result.ok,true,result.error);assert.equal(result.result.entry.entry_id,entry.id);assert.equal(result.result.entry.saved,true);assert.equal(feeds.store.entry(entry.id).read,false);
  save=false;assert.equal((await run()).ok,true);card=events.filter(p=>p.type==='proposal').at(-1).action;feeds.store.setState([entry.id],{read:true});result=await handlers.get('assistant:agentApply')(event,{proposalId:card.proposalId,owner});assert.equal(result.ok,false);assert.equal(result.stale,true);assert.equal(feeds.store.entry(entry.id).saved,true);
 }finally{app.emit('will-quit');feeds.dispose();h.dom.window.close();fs.rmSync(dir,{recursive:true,force:true});}
});
