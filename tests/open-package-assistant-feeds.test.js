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
