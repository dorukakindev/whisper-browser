'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),{EventEmitter}=require('node:events'),{webcrypto}=require('node:crypto'),{JSDOM}=require('jsdom');
const {createMediaCatalogStore}=require('../src/media-catalog-store');
const plain=value=>JSON.parse(JSON.stringify(value));

async function journey(t){
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'assistant-selection-journey-')),dom=new JSDOM('<main></main>',{runScripts:'outside-only',url:'https://controlled.fixture'}),w=dom.window;
 t.after(()=>{dom.window.close();fs.rmSync(dir,{recursive:true,force:true});});
 const store=createMediaCatalogStore({filePath:path.join(dir,'catalog.json')}),films=[];
 for(let i=0;i<5;i++)films.push(store.upsert({title:'Controlled film '+i,kind:'film',year:2020+i,imdbId:'tt123456'+i,runtime:85+i,genres:[i<4?'Thriller':'Drama'],watchStatus:i===3?'completed':'planned',synopsis:'Saved fixture catalog metadata '+i}));
 const handlers=new Map(),app=new EventEmitter(),sender=new EventEmitter(),event={sender,senderFrame:'main'},events=[],rendererCalls=[],rendererResults=[],providerBodies=[],collectionRequests=[];
 sender.id=618;sender.isDestroyed=()=>false;const ipcMain={handle:(name,fn)=>handlers.set(name,fn)},authorized=e=>e.sender===sender&&e.senderFrame==='main';
 require('../src/assistant-collections').register({ipcMain,authorized,store:()=>store});
 Object.defineProperty(w,'crypto',{value:webcrypto});w.TextEncoder=TextEncoder;w.UiLocale={get:()=> 'en'};
 w.player={workspaceMode:'player',cues:[],cues2:[]};w.AssistantWorkspace={activeId:()=> 'selection-journey-thread'};
 w.globalAssistantContext=()=>({workspace:'media-library',type:'library-title',title:'Controlled library'});w.aiSourceScope=()=> 'controlled-library-source';w.subtitleSourceTime=n=>n;w.currentBrowserYoutubeUrl=()=>'';w.BrowserDubAudioUI={context:()=>({visible:false,hasMedia:false})};
 w.MediaToolsModel=require('../src/renderer/media-tools-model');w.LetterboxdReviews=require('../src/letterboxd-reviews');
 w.api={mediaCatalog:async input=>{assert.equal(input.action,'list');return {ok:true,items:store.list()};},mediaShelf:async input=>{assert.equal(input.action,'list');return {ok:true,taste:{preferencesConfigured:true,preferences:{weights:{story:5},avoid:[],note:'Controlled explicit preference'},rated:2,reviewCount:0}};},mediaTools:async input=>{assert.equal(input.action,'decision-get');return {ok:true,value:{history:[]}};},personalMedia:async input=>{assert.equal(input.action,'get');return {ok:true,item:{reaction:null,aspectReactions:{},watchStatus:'planned'}};},assistantCollections:async input=>{collectionRequests.push(plain(input));return handlers.get('assistant:collections')(event,plain(input));}};
 for(const file of ['text-fold','assistant-context-manifest','assistant-library-query','assistant-media-selection','assistant-capabilities'])w.eval(fs.readFileSync(require.resolve('../src/'+file),'utf8'));
 for(const file of ['assistant-selection-actions','assistant-film-actions','assistant-library-actions','assistant-app-actions'])w.eval(fs.readFileSync(require.resolve('../src/renderer/'+file),'utf8'));
 const owner=plain(w.AssistantAppActions.snapshot()),invoke=(name,input,e=event)=>handlers.get('assistant:'+name)(e,input);
 sender.send=(_channel,packet)=>{events.push(packet);if(packet.type==='action')queueMicrotask(async()=>{rendererCalls.push(packet.name);let result;try{result=await w.AssistantAppActions.execute(packet.name,packet.args,packet.owner,{deadline:packet.deadline,expectedSettings:packet.expectedSettings});}catch(error){result={status:'failed',error:error.message};}rendererResults.push({name:packet.name,result:plain(result)});invoke('agentResult',{callId:packet.callId,result:plain(result)});});};
 let round=0;const providerTools=[];
 require('../src/assistant-agent-service').register({app,ipcMain,authorized,validateOwner:o=>w.AssistantAppActions.current(o),getConfig:()=>({endpoint:'https://controlled.invalid/v1',model:'controlled-provider-fixture'}),fetchImpl:async(_url,options)=>{
  const body=JSON.parse(options.body);providerBodies.push(body);assert(body.messages.every(m=>['system','user','assistant','tool'].includes(m.role)));
  const receipts=body.messages.filter(m=>m.role==='tool').map(m=>JSON.parse(m.content));let name,args;
  if(round===0){name='search_library';args={genre:'Thriller',status:'planned'};}
  else if(round===1){assert.equal(receipts[0].items.length,3);name='prepare_media_selection';args={item_ids:receipts[0].items.map(i=>i.id),limit:3};}
  else if(round===2){assert.equal(receipts[1].profile.preferences.weights.story,5);assert.equal(receipts[1].selectionScope.selectedRowCount,3);name='compare_film_titles';args={item_id:receipts[1].candidates[0].item_id,other_item_id:receipts[1].candidates[1].item_id};}
  else if(round===3){assert.equal(receipts[2].films.length,2);assert(receipts[2].films.every(f=>f.sourceCount===0&&f.analysis===null));name='plan_library_collection';args={name:'Controlled thriller selection',ids:receipts[1].continuation.collection.ids};}
  else if(round===4){assert.equal(receipts[3].plan.items.length,3);name='apply_library_collection';args={plan_id:receipts[3].plan.id};}
  else {assert.equal(receipts[4].status,'proposed');assert.equal(body.tools,undefined);}
  if(name){assert(body.tools.some(tool=>tool.function.name===name));providerTools.push(name);}
  round++;return new Response(JSON.stringify({choices:[{message:name?{role:'assistant',tool_calls:[{id:'journey-step-'+round,type:'function',function:{name,arguments:JSON.stringify(args)}}]}:{role:'assistant',content:'Three exact catalog titles were selected; review the collection card to save membership.'},finish_reason:'stop'}]}),{headers:{'content-type':'application/json'}});
 }});
 t.after(()=>app.emit('will-quit'));
 const before=store.list(),answer=await invoke('agentRun',{requestId:'selection-journey',question:'Find three planned thrillers, compare the first two and prepare a collection approval card for all three.',owner});
 assert.equal(answer.ok,true,answer.error);assert.equal(round,6);assert.deepEqual(providerTools,['search_library','prepare_media_selection','compare_film_titles','plan_library_collection','apply_library_collection']);
 const cards=events.filter(e=>e.type==='proposal');assert.equal(cards.length,1);assert.equal(cards[0].action.tool,'apply_library_collection');assert(!rendererCalls.includes('apply_library_collection'));assert.deepEqual(store.list(),before);assert(!collectionRequests.some(r=>r.action==='apply'));
 return {store,films,owner,invoke,event,sender,card:cards[0].action,collectionRequests,rendererCalls,rendererResults};
}

test('controlled provider search → exact selection → comparison → collection card writes only after human Apply',async t=>{
 const h=await journey(t),expected=h.films.slice(0,3).map(f=>f.id).sort();
 assert.equal((await h.invoke('agentApply',{proposalId:h.card.proposalId,owner:{...h.owner,thread:'foreign-thread'}})).ok,false);assert(h.store.list().every(f=>!f.collections.length));
 const result=await h.invoke('agentApply',{proposalId:h.card.proposalId,owner:h.owner});assert.equal(result.ok,true,result.error);assert.equal(result.result.status,'completed');assert.equal(result.result.count,3);
 assert.deepEqual(h.store.list().filter(f=>f.collections.includes('Controlled thriller selection')).map(f=>f.id).sort(),expected);assert.equal(h.collectionRequests.filter(r=>r.action==='apply').length,1);
 assert(h.films.slice(3).every(f=>h.store.get(f.id).collections.length===0));assert.equal((await h.invoke('agentApply',{proposalId:h.card.proposalId,owner:h.owner})).ok,false);
});

test('changed reviewed catalog identity blocks collection Apply without partial membership changes',async t=>{
 const h=await journey(t);h.store.upsert({id:h.films[1].id,title:'Changed after collection review'});
 const result=await h.invoke('agentApply',{proposalId:h.card.proposalId,owner:h.owner});assert.equal(result.result?.status,'failed');assert.match(result.result.error,/changed|Plan again/i);assert(h.store.list().every(f=>f.collections.length===0));
});
