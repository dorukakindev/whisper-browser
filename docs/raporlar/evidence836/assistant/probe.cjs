'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),{JSDOM}=require('jsdom');
const root=path.resolve(__dirname,'../../../..'),read=p=>fs.readFileSync(path.join(root,p),'utf8');
const out={head:process.env.AUDIT835_HEAD,cases:[]};
async function pageCase(){
 const dom=new JSDOM('<div id="aiChatLog"></div><div id="aiChatEmpty"></div><div id="aiChatText"></div><div id="playerTitle">Synthetic article</div><select id="aiTranscriptScope"><option>full</option></select>',{runScripts:'outside-only'}),w=dom.window;
 const saved=new Map(),published=[];
 Object.assign(w,{structuredClone,player:{workspaceMode:'browser',browserPageUrl:'https://fixture.invalid/article',browserPageTitle:'Article',browserTime:0},globalAssistantContext:()=>null,aiSourceScope:()=> 'scope',aiChatPreparing:null,aiChatRetryPacket:null,browserTabState:()=>({generation:1}),currentBrowserYoutubeUrl:()=>'',aiVideoRows:()=>[],buildOptsFromUI:()=>({}),assistantProviderSelection:()=>({model:'fixture'}),subtitleContextLanguage:()=>'',effectiveBrowserProfile:()=>({values:{targetLanguage:'tr'}}),BrowserAiContext:{citation:()=>null}});
 w.AssistantSourceContext=require(path.join(root,'src/assistant-source-context'));w.AssistantSourcePreview=require(path.join(root,'src/assistant-source-preview'));w.AssistantRunSteps=require(path.join(root,'src/assistant-run-steps'));
 w.api={assistantThreads:async r=>{if(r.action==='list')return {ok:true,threads:[...saved.values()]};if(r.action==='save'){const thread=structuredClone({...r.thread,revision:r.thread.revision+1});saved.set(thread.id,thread);return {ok:true,thread};}},updateAssistant:v=>published.push(v),onAssistantCommand:()=>{}};
 const renderer=read('src/renderer/renderer.js');w.eval(renderer.slice(renderer.indexOf('function renderAiText('),renderer.indexOf('\nfunction aiChatAdd(',renderer.indexOf('function renderAiText('))));
 w.eval(read('src/renderer/assistant-workspace.js'));await w.AssistantWorkspace.prepare();
 const b=w.document.createElement('div');b.className='ai-msg ai-msg-ai';b._sourceScope='scope';b._chatContext={page:{blocks:[{id:'S1',text:'Synthetic article evidence.'}]}};b._transcriptEvidence=[];w.document.getElementById('aiChatLog').append(b);
 const job={chatQuestion:'Explain article',sourceScope:'scope',bubble:b,chatContext:b._chatContext};w.AssistantWorkspace.begin(job);w.renderAiText(b,'Supported by [S1].');w.AssistantWorkspace.finish(job,'Supported by [S1].','complete');
 await new Promise(r=>setTimeout(r,10));w.eval(read('src/renderer/global-assistant.js'));await new Promise(r=>setTimeout(r,85));
 const snapshot=published.at(-1),reply=snapshot.messages.find(r=>r.role==='ai');
 assert.equal(b.querySelectorAll('.ai-source-link').length,1);assert.equal(reply.links.length,0);assert.equal(saved.values().next().value.messages.at(-1).evidence.length,0);
 out.cases.push({id:'S-CITATION',legacyLiveLinks:1,nativeLiveLinks:reply.links.length,persistedPageEvidence:0,expected:'Native assistant and saved answer retain a verifiable link to supplied S1 paragraph.',observed:'Only hidden legacy bubble has a source link; managed message bypasses node-link fallback and native reply has no paragraph link.'});
 // Positive native control: real U evidence produces a link.
 const m=w.AssistantWorkspace.snapshot().current.messages.at(-1);m.evidence=[{id:'U1',start:2,end:3,text:'Synthetic subtitle'}];w.document.dispatchEvent(new w.Event('assistant-workspace-changed'));await new Promise(r=>setTimeout(r,85));assert.equal(published.at(-1).messages.find(r=>r.role==='ai').links.length,1);out.cases.at(-1).positiveControl='U1 persisted subtitle evidence produced exactly one native source link';w.close();
}
async function bookCase(){
 const scan=require(path.join(root,'src/renderer/assistant-book-search')).scan;
 const body='x'.repeat(200)+' RED_TOKEN '+'x'.repeat(1200)+' BLUE_TOKEN '+'x'.repeat(500);
 const red=await scan({total:1,getText:async()=>body,query:'RED_TOKEN'}),blue=await scan({total:1,getText:async()=>body,query:'BLUE_TOKEN'});
 const a=red.matches[0],b=blue.matches[0];assert.equal(a.id,b.id);assert(a.text.includes('RED_TOKEN'));assert(!b.text.includes('RED_TOKEN'));assert(b.text.includes('BLUE_TOKEN'));
 const dom=new JSDOM('<textarea id="aiChatText"></textarea>',{runScripts:'outside-only'}),w=dom.window;let citations;
 Object.assign(w,{structuredClone,player:{},globalAssistantContext:()=>null,aiSourceScope:()=> 'scope',updateAiChatActions:()=>{},autoGrowChatBox:()=>{},saveAppSettings:async()=>true,aiChatAdd:()=>w.document.createElement('div'),renderAiText:(n,t)=>n.textContent=t});
 const owner={kind:'book',owner:'scope',thread:'thread'};w.AssistantAppActions={snapshot:()=>owner,current:()=>true};w.AssistantContextManifest={sourceText:v=>v,pool:()=>[]};w.AssistantWorkspace={begin:()=>{},steps:()=>{},citations:(_j,v)=>citations=v,finish:()=>{}};
  const {EventEmitter}=require('node:events'),handlers=new Map(),sender=new EventEmitter();sender.id=835;sender.isDestroyed=()=>false;
 const event={sender};let round=0;
 sender.send=(_channel,packet)=>{if(packet.type==='action')void scan({total:1,getText:async()=>body,query:packet.args.query}).then(result=>handlers.get('assistant:agentResult')(event,{callId:packet.callId,result:{...result,matches:result.matches.map(hit=>({...hit,sourceId:'synthetic-book',kind:'page',navigable:true}))}}));};
 const service=require(path.join(root,'src/assistant-agent-service')).register({app:new EventEmitter(),ipcMain:{handle:(name,fn)=>handlers.set(name,fn)},authorized:()=>true,validateOwner:()=>true,getConfig:()=>({endpoint:'https://fixture.invalid/v1',model:'fixture'}),fetchImpl:async()=>{
  round++;const message=round<3?{role:'assistant',content:null,tool_calls:[{id:'q'+round,type:'function',function:{name:'search_book',arguments:JSON.stringify({query:round===1?'RED_TOKEN':'BLUE_TOKEN'})}}]}:{role:'assistant',content:'First RED_TOKEN evidence [B1-0]; then BLUE_TOKEN evidence [B1-0].'};
  return new Response(JSON.stringify({choices:[{message,finish_reason:round<3?'tool_calls':'stop'}]}),{headers:{'content-type':'application/json'}});
 }});
 const backend=await handlers.get('assistant:agentRun')(event,{requestId:'audit835',question:'Find both tokens',owner,context:{},pool:[],history:[],locale:'en'});assert.equal(backend.ok,true,backend.error);assert.equal(backend.bookCitations.length,2);assert.equal(round,3);
 const supplied=backend.bookCitations;
 w.api={onAssistantAgentEvent:()=>()=>{},assistantAgentRun:async()=>({ok:true,text:'First RED_TOKEN evidence [B1-0]; then BLUE_TOKEN evidence [B1-0].',bookCitations:supplied})};
 w.eval(read('src/renderer/assistant-agent-ui.js'));await w.AssistantAgentUI.send('Find both tokens',{},[],'scope');
 assert.equal(citations.length,1);assert(!citations[0].text.includes('RED_TOKEN'));assert(citations[0].text.includes('BLUE_TOKEN'));
 out.cases.push({id:'BOOK-CITATION-COLLISION',first:{id:a.id,offset:a.offset,containsRed:true},second:{id:b.id,offset:b.offset,containsBlue:true},serviceProviderRounds:round,serviceProducedCitationCount:supplied.length,finalCitationCount:citations.length,firstEvidenceLost:true,expected:'Distinct source excerpt identities, or preserve both excerpts for shared page/chunk identity.',observed:'Real keyword scan returns same citation ID for two different offsets; real agent finalization Map keeps only the second excerpt, so earlier reference opens the later evidence.'});w.close();
}
(async()=>{await pageCase();await bookCase();fs.writeFileSync(path.join(__dirname,'result.json'),JSON.stringify(out,null,2));console.log(JSON.stringify(out,null,2));})().catch(e=>{console.error(e);process.exitCode=1});
