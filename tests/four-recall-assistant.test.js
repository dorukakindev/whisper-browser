'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),{JSDOM}=require('jsdom');
const contract=require('../src/assistant-recall-contract');
test('selected Recall draft and explicit analysis save only verified proposals; stale reactions refuse commit',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'assistant-recall-')),dom=new JSDOM('<body class="media-home-active"><main id="mediaHome" data-page="recall"></main><textarea id="aiChatText"></textarea></body>',{runScripts:'outside-only'}),w=dom.window;
 try{
  const row={id:'film',title:'Silent atmosphere',kind:'film',genres:['Drama'],synopsis:'Quiet scenes and patient camera movement.',favorite:false};
  const {handle,store}=require('../src/recall-service').registerRecall({app:{getPath:()=>dir},ipcMain:{handle(){}},authorized:()=>true,catalogStore:()=>({get:()=>row,list:()=>[row]})}),event={sender:{id:7}};
  await handle(event,{action:'add',refs:[{kind:'catalog',id:'film'}]});
  let prepared,calls=0,stale=false,commits=0,updates=0;const draft={};
  w.structuredClone=structuredClone;w.AssistantRecallContract=contract;w.UiLocale={get:()=> 'en'};w.aiSourceScope=()=>w.AssistantFeedSources.context()?.id;
  w.AssistantWorkspace={prepare:async()=>{},snapshot:()=>({current:draft})};w.AssistantAppActions={snapshot:()=>({id:w.aiSourceScope(),hasFeedSources:true}),current:owner=>owner.id===w.aiSourceScope()};
  w.api={showAssistant:async()=>{},recallRequest:async input=>{if(input.action==='analysis-commit')commits++;const result=await handle(event,input);if(input.action==='analysis-prepare')prepared=result;return result;}};
  w.AssistantAgentUI={busy:()=>false,send:async(question,context,history,scope,resume,options)=>{calls++;assert.equal(options.responseContract,'recall-analysis');assert.equal(context.recallAnalysis.sources[0].scope,'metadata');assert.equal(context.recallAnalysis.sources[0].tasteEligible,false);assert.equal(history.length,0);assert(!JSON.stringify(context.recallAnalysis).includes('token'));const s=prepared.sources[0];if(stale)await handle(event,{action:'reaction',id:'catalog:film',valence:'like'});return {ok:true,text:JSON.stringify({entities:[{key:'theme',label:'Atmosphere',kind:'theme'}],assertions:[{from:s.nodeId,to:'theme',predicate:'mentions',sourceId:s.id,quote:s.text.slice(0,20),start:0,end:20,unit:'utf16'}],hypotheses:[]})};}};
  w.document.addEventListener('media-recall-updated',()=>updates++);
  for(const file of ['assistant-feed-sources.js','assistant-recall-sources.js'])w.eval(fs.readFileSync(path.join(__dirname,'../src/renderer',file),'utf8'));
  const first=await w.AssistantRecallSources.ask({ids:['catalog:film']});assert.equal(first.type,'recall-sources');assert.equal(calls,0);assert.match(draft.draft,/selected Content Network/);assert.equal(first.feedSources[0].url,'');
  await w.AssistantRecallSources.analyze({ids:['catalog:film'],mode:'knowledge'});assert.equal(calls,1);assert.equal(updates,1);assert.equal(commits,1);const edges=store.snapshot().edges.filter(e=>e.origin==='model');assert.equal(edges.length,1);assert.equal(edges[0].status,'proposed');assert.equal(store.source('catalog:film').tasteEligible,false);
  stale=true;await assert.rejects(w.AssistantRecallSources.analyze({ids:['catalog:film'],mode:'knowledge'}),/changed/);assert.equal(commits,2);assert.equal(updates,1);assert.equal(store.snapshot().runs.length,1);assert.equal(w.AssistantRecallSources.busy(),false);
  const source=prepared.sources[0],positive={...source,tasteEligible:true,role:'positive-support'},negative={...source,id:'R0000000000000001',nodeId:'catalog:other',tasteEligible:false,role:'counter-evidence'};
  const evidence={mode:'taste',sources:[positive,negative]},answer={entities:[],assertions:[],hypotheses:[{text:'A tentative same-domain hypothesis',domain:positive.domain,support:[{sourceId:positive.id,quote:positive.text.slice(0,12)}],counter:[{sourceId:negative.id,quote:negative.text.slice(0,12)}]}]};assert.equal(contract.parseAnswer(answer,evidence),answer);assert.throws(()=>contract.parseAnswer({...answer,hypotheses:[{...answer.hypotheses[0],domain:'anime'}]},evidence),/within-domain/);assert.throws(()=>contract.parseAnswer({...answer,hypotheses:[{...answer.hypotheses[0],support:answer.hypotheses[0].counter}]},evidence),/explicit like/);
 }finally{dom.window.close();fs.rmSync(dir,{recursive:true,force:true});}
});
