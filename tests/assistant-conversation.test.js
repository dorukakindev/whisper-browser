'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {JSDOM}=require('jsdom');
const root=path.join(__dirname,'../src/renderer');
function overlay(){
  const dom=new JSDOM(fs.readFileSync(path.join(root,'assistant-overlay.html'),'utf8'),{url:'https://assistant.test/',runScripts:'outside-only'}),w=dom.window,commands=[];let receive;
  w.assistant={action:(action,text,meta)=>commands.push({action,text,meta}),subscribe:fn=>{receive=fn;}};
  w.eval(fs.readFileSync(path.join(root,'assistant-overlay.js'),'utf8'));
  const snapshot=(values={})=>receive({locale:'en',theme:'dark',sourceToken:'A:1',conversation:'A',context:'Film A',messages:[],suggestions:[],...values});
  return {dom,w,commands,snapshot,$:id=>w.document.getElementById(id)};
}

test('native summary and undelivered-message routes preserve drafts, enforce source tokens and never submit',async()=>{
 const dom=new JSDOM('<div id="aiChatLog"></div><textarea id="aiChatText"></textarea>',{runScripts:'outside-only'}),w=dom.window;let snapshot,command,source='A',submissions=0;
 try{
  Object.assign(w,{player:{workspaceMode:'player'},UiLocale:{get:()=> 'en'},state:{running:false,queueRunning:false},aiChatPreparing:null,aiChatRetryPacket:null,
   assistantProviderSelection:()=>({model:'fixture'}),globalAssistantContext:()=>null,aiSourceScope:()=>source,buildOptsFromUI:()=>({}),subtitleSourceTime:v=>v,subtitleContextLanguage:()=>'',
   AssistantRunSteps:require('../src/assistant-run-steps'),AssistantAgentUI:{status:()=>null,busy:()=>false,canRetry:()=>false,proposalLive:()=>false},
   AssistantWorkspace:{key:()=>source,activeId:()=> 'thread',summaryDraft:()=> 'Partial historical summary',reviewAction:()=> 'Inspect CURRENT source',snapshot:()=>({current:{id:'thread',messages:[{id:'reply',role:'assistant',text:'Saved reply',steps:[{id:'old-read',name:'search_library',state:'running'}],runtimeMessages:[{id:1,mode:'followup',status:'not-delivered',text:'Try my question',intentRevision:2},{id:2,mode:'steer',status:'delivered',text:'Already sent',intentRevision:2}]}]},threads:[]})},
   api:{updateAssistant:value=>snapshot=value,onAssistantCommand:fn=>command=fn},aiChatSend:()=>submissions++,aiWebResearch:()=>submissions++});
  w.eval(fs.readFileSync(path.join(root,'../assistant-source-context.js'),'utf8'));w.eval(fs.readFileSync(path.join(root,'../assistant-source-preview.js'),'utf8'));w.eval(fs.readFileSync(path.join(root,'global-assistant.js'),'utf8'));
  const wait=()=>new Promise(resolve=>setTimeout(resolve,90));await wait();assert(snapshot);assert.equal(snapshot.messages[0].steps[0].state,'unknown');assert.equal(snapshot.messages[0].review.unverified,1);
  const input=w.document.getElementById('aiChatText'),token=snapshot.sourceToken,links=snapshot.messages[0].runtimeLinks;
  command({action:'runtime-draft',text:links[0].draftId,sourceToken:token});assert.equal(input.value,'Try my question');
  command({action:'summary-draft',sourceToken:token});assert.equal(input.value,'Try my question','existing draft is never replaced');
  input.value='';command({action:'runtime-draft',text:links[1].draftId,sourceToken:token});assert.equal(input.value,'','delivered messages are not retried');
  source='B';command({action:'summary-draft',sourceToken:token});assert.equal(input.value,'','stale source token is refused');
  await wait();command({action:'summary-draft',sourceToken:snapshot.sourceToken});assert.equal(input.value,'Partial historical summary');assert.equal(submissions,0);
 }finally{w.close();}
});

test('card history keeps the newest visible while historical proposals require fresh review and delivery retry is a draft',()=>{
 const ui=overlay();try{
  const actions=Array.from({length:9},(_,i)=>({id:'p'+i,proposalId:'proposal'+i,kind:'app_action',label:'Card '+i,resultStatus:i<8?'completed':'',facts:{historical:true,requiresReview:i===8}}));
  ui.snapshot({capacity:{messages:180,messageLimit:200,sourceThreads:2,sourceLimit:20,archiveThreads:3,archiveLimit:200},messages:[{id:'answer',role:'ai',text:'Saved answer',actions,review:{completed:8,proposed:1},runtimeLinks:[{draftId:'rt1',mode:'followup',status:'not-delivered',text:'Unsent question',intentRevision:2}]}]});
  const history=ui.w.document.querySelector('.action-card-history');assert.equal(history.open,false);assert.equal(history.querySelectorAll('.tool-card').length,8);
  const newest=[...ui.w.document.querySelectorAll('.tool-card')].at(-1);assert.equal(newest.closest('.action-card-history'),null);assert.match(newest.textContent,/Historical proposal/);assert.equal([...newest.querySelectorAll('button')].some(b=>b.textContent==='Apply'),false);
  newest.querySelector('button').click();assert.equal(ui.commands.at(-1).action,'review-tool');assert.equal(ui.commands.at(-1).meta.sourceToken,'A:1');
  ui.w.document.querySelector('.runtime-delivery button').click();assert.equal(ui.commands.at(-1).action,'runtime-draft');assert.equal(ui.commands.at(-1).text,'rt1');
  ui.$('summaryDraft').click();assert.equal(ui.commands.at(-1).action,'summary-draft');assert.equal(ui.commands.some(c=>c.action==='send'||c.action==='export'),false);
  assert.match(ui.$('conversationCapacity').textContent,/180/);assert.match(ui.w.document.querySelector('.flow-result-review').textContent,/Accepted is not completed/);
 }finally{ui.w.close();}
});

test('Closing an excerpt stays closed when a streaming snapshot arrives before its toggle event',()=>{
 const ui=overlay();try{
  const messages=text=>[{id:'answer',role:'ai',text,links:[{id:'F1',label:'Source one',excerpt:'Exact source excerpt'}]}];
  ui.snapshot({messages:messages('First')});ui.w.document.querySelector('.source-card').open=true;
  ui.snapshot({messages:messages('Second')});assert.equal(ui.w.document.querySelector('.source-card').open,true);
  ui.w.document.querySelector('.source-card').open=false;
  ui.snapshot({messages:messages('Third')});assert.equal(ui.w.document.querySelector('.source-card').open,false);
 }finally{ui.w.close();}
});

test('Repeated citations restore keyboard focus to the same message source control',()=>{
 for(const excerpt of [undefined,'Exact source excerpt']){
  const ui=overlay();try{
   const messages=[{id:'earlier',role:'ai',text:'Earlier answer',links:[{id:'F1',label:'Shared source',excerpt}]},{id:'later',role:'ai',text:'Later answer',links:[{id:'F1',label:'Shared source',excerpt}]}];
   ui.snapshot({messages});for(const card of ui.w.document.querySelectorAll('.source-card'))card.open=true;
   ui.w.document.querySelectorAll('[data-citation-id]')[1].focus();ui.snapshot({messages,busy:true});
   const focused=ui.w.document.activeElement;assert.equal(focused.dataset.citationId,'F1');assert.equal(focused.closest('.message').querySelector('.message-actions').dataset.messageKey,'later');
  }finally{ui.w.close();}
 }
});
test('Assistant drafts are source-specific and only matching accepted receipts clear the sent draft',()=>{
 const ui=overlay();try{
  ui.snapshot();ui.$('text').value='Question for A';ui.$('text').dispatchEvent(new ui.w.Event('input'));ui.$('form').dispatchEvent(new ui.w.Event('submit',{cancelable:true}));
  const first=ui.commands.at(-1);assert.equal(first.action,'send');assert.equal(first.meta.sourceToken,'A:1');assert(first.meta.requestId);
  ui.snapshot({messages:[{role:'user',text:'Question for A'}]});assert.equal(ui.$('text').value,'Question for A','An unrelated snapshot is not an acknowledgement');
  ui.snapshot({receipt:{id:first.meta.requestId,accepted:false,message:'Provider unavailable'}});assert.equal(ui.$('text').value,'Question for A');assert.match(ui.$('delivery').textContent,/unavailable/);
  ui.snapshot({sourceToken:'B:1',conversation:'B'});assert.equal(ui.$('text').value,'');ui.$('text').value='Question for B';ui.$('text').dispatchEvent(new ui.w.Event('input'));
  ui.snapshot();assert.equal(ui.$('text').value,'Question for A');ui.$('form').dispatchEvent(new ui.w.Event('submit',{cancelable:true}));const second=ui.commands.at(-1);
  ui.$('text').value='Next question, still typing';ui.$('text').dispatchEvent(new ui.w.Event('input'));ui.snapshot({receipt:{id:second.meta.requestId,accepted:true}});assert.equal(ui.$('text').value,'Next question, still typing','Accepted send cannot erase edits made while sending');
  ui.$('form').dispatchEvent(new ui.w.Event('submit',{cancelable:true}));const third=ui.commands.at(-1);ui.snapshot({receipt:{id:third.meta.requestId,accepted:true}});assert.equal(ui.$('text').value,'');
 }finally{ui.dom.window.close();}
});
test('Assistant source details, safe formatted answers and explicit clear confirmation stay functional',()=>{
 const ui=overlay();try{
  ui.snapshot({model:'fixture-model',sourceDescription:'Only selected chapter supplied.',transcriptScope:false,messages:[{role:'ai',text:'# Heading\n- A point\n```js\n<img src=x onerror=bad>\n```'}]});
  assert.equal(ui.$('modelName').textContent,'fixture-model');assert(ui.$('scope').hidden);assert.equal(ui.w.document.querySelector('.message h3').textContent,'Heading');assert.equal(ui.w.document.querySelectorAll('.message img').length,0);assert.match(ui.w.document.querySelector('.message code').textContent,/<img/);
  ui.$('clear').click();assert(!ui.$('review').hidden);assert(!ui.commands.some(c=>c.action==='clear'));ui.$('reviewCancel').click();assert(!ui.commands.some(c=>c.action==='clear'));ui.$('clear').click();ui.$('reviewConfirm').click();assert.equal(ui.commands.at(-1).action,'clear');assert.equal(ui.commands.at(-1).meta.sourceToken,'A:1');
  ui.w.document.querySelector('.message-actions button').click();assert.equal(ui.commands.at(-1).action,'copy');
 }finally{ui.dom.window.close();}
});

test('Source details name the model in both languages and settings use only the existing command boundary',()=>{
 const ui=overlay();try{
  for(const locale of ['en','tr'])for(const context of [{videoContext:true},{pageContext:true},{}]){
   ui.snapshot({locale,model:'selected-model',transcriptScope:false,...context});
   assert.match(ui.$('sourceLabel').textContent,/model/i);assert.equal(ui.$('modelName').textContent,'selected-model');
   assert.equal(ui.$('modelLabel').textContent,locale==='tr'?'Etkin model':'Active model');
   assert.equal(ui.$('sourceBox').open,false,'source and model details stay optional');
   ui.$('sourceBox').open=true;ui.$('assistantSettings').click();
   assert.equal(ui.commands.at(-1).action,'settings');assert.equal(ui.commands.at(-1).meta.sourceToken,'A:1');
   assert.match(ui.$('assistantSettings').textContent,locale==='tr'?/Asistan ve çeviri ayarları/:/Assistant & translation settings/);
   ui.$('sourceBox').open=false;
  }
  assert.equal(ui.commands.filter(row=>row.action!=='settings'&&row.action!=='ready').length,0,'the shortcut sends no question or settings write');
 }finally{ui.dom.window.close();}
});

test('An empty conversation never advertises a latest reply and keeps open source details across snapshots',()=>{
 const ui=overlay();try{
  ui.snapshot({messages:[{id:'old',role:'ai',text:'An earlier answer.'}]});ui.$('sourceBox').open=true;
  ui.snapshot({messages:[]});assert.equal(ui.$('sourceBox').open,true);assert.equal(ui.$('latest').hidden,true);
  Object.defineProperty(ui.$('log'),'scrollHeight',{value:500,configurable:true});Object.defineProperty(ui.$('log'),'clientHeight',{value:80,configurable:true});
  ui.$('log').dispatchEvent(new ui.w.Event('scroll'));assert.equal(ui.$('latest').hidden,true,'overflowing greeting text is not a reply');
 }finally{ui.dom.window.close();}
});
test('Parent bridge rejects stale source commands and receipts acknowledge only a newly accepted question',async()=>{
  const dom=new JSDOM('<div id="aiChat"><div id="aiChatLog"></div></div><div id="playerTitle">Film</div><select id="aiTranscriptScope"><option value="watched">Watched</option></select>',{runScripts:'outside-only',url:'https://parent.test/'}),w=dom.window;let listener,scope='A',sends=0,last;const openedSettings=[];
 try{
  Object.assign(w,{UiLocale:{get:()=> 'en'},player:{workspaceMode:'player',mediaKey:'file:fixture',job:null},state:{running:false,queueRunning:false},aiChatPreparing:null,aiChatRetryPacket:null,assistantProviderSelection:()=>({model:'fixture'}),globalAssistantContext:()=>null,aiSourceScope:()=>scope,buildOptsFromUI:()=>({translateModel:'fixture'}),api:{updateAssistant:value=>{last=value;},onAssistantCommand:fn=>{listener=fn;}},aiChatSend:async text=>{sends++;const node=w.document.createElement('div');node.className='ai-msg ai-msg-user';node._sourceScope=scope;node.textContent=text;w.document.getElementById('aiChatLog').append(node);}});
  w.AssistantRunSteps=require('../src/assistant-run-steps');w.eval(fs.readFileSync(path.join(root,'../assistant-source-context.js'),'utf8'));
  w.eval(fs.readFileSync(path.join(root,'../assistant-source-preview.js'),'utf8'));w.subtitleSourceTime=value=>value;w.subtitleContextLanguage=()=>'';
  w.AppSettingsUI={open:async(...args)=>openedSettings.push(args)};
  w.eval(fs.readFileSync(path.join(root,'global-assistant.js'),'utf8'));
  const wait=()=>new Promise(resolve=>setTimeout(resolve,90));await wait();
  listener({action:'settings',text:'arbitrary section',sourceToken:'old'});await wait();assert.equal(openedSettings.length,0,'stale overlays cannot open settings for another source');
  listener({action:'settings',text:'arbitrary section',sourceToken:'A'});await wait();assert.equal(openedSettings.length,1);assert.equal(openedSettings[0][0],'ai');assert.equal(openedSettings[0][1].preserveAssistantContext,true);assert.equal(sends,0,'opening settings never submits a model request');
  listener({action:'settings',sourceToken:'A'});scope='B';await wait();assert.equal(openedSettings.length,1,'source ownership is rechecked before the deferred settings action');scope='A';
  listener({action:'send',text:'Wrong target',sourceToken:'old',requestId:'old-request'});await wait();assert.equal(sends,0);assert.equal(last.receipt.accepted,false);
  listener({action:'send',text:'Right target',sourceToken:'A',requestId:'good-request'});await wait();assert.equal(sends,1);assert.equal(last.receipt.id,'good-request');assert(last.receipt.accepted);assert.equal(last.messages.length,1);
  scope='B';w.document.dispatchEvent(new w.Event('media-context-changed'));await wait();assert.equal(last.sourceToken,'B');assert.equal(last.messages.length,0,'Film A messages cannot appear under Film B title');
  listener({action:'send',text:'B question',sourceToken:'B',requestId:'B-request'});await wait();listener({action:'clear',sourceToken:'B'});await wait();assert.equal(last.messages.length,0);assert.equal(w.document.querySelectorAll('#aiChatLog .ai-msg').length,1,'Clearing B keeps A messages');
 }finally{w.close();}
});

test('Thread creation acknowledgement, branch controls, source cards and safe streaming Markdown',()=>{
 const ui=overlay();try{
  ui.w.eval(fs.readFileSync(path.join(root,'vendor/assistant-remend.js'),'utf8'));
  ui.snapshot({pinScope:'A'});ui.$('text').value='First question';ui.$('form').dispatchEvent(new ui.w.Event('submit',{cancelable:true}));const sent=ui.commands.at(-1);
  ui.snapshot({pinScope:'A',conversation:'A|thread:one',sourceToken:'A:1|thread:one',activeThread:'one',threads:[{id:'one',title:'First question'}],receipt:{id:sent.meta.requestId,accepted:true},messages:[{id:'answer',role:'ai',text:'**Streaming',loading:true}]});
  assert.equal(ui.$('text').value,'','Creating the first thread must not lose the matching send acknowledgement');assert.equal(ui.w.document.querySelector('.message strong').textContent,'Streaming');
  ui.snapshot({pinScope:'A',conversation:'A|thread:one',sourceToken:'A:1|thread:one',activeThread:'one',threads:[{id:'one',title:'First question'}],messages:[{id:'answer',role:'ai',text:'Answer',links:[{id:'source-card',label:'1:30',excerpt:'Real source line',translation:'Gerçek kaynak'}],actions:[{id:'proposal',kind:'seek_to_time',excerpt:'Real source line'}]}]});
  assert.equal(ui.$('threads').value,'one');assert.match(ui.w.document.querySelector('.source-card').textContent,/Real source line/);
  ui.w.document.querySelector('.tool-card button').click();assert(!ui.commands.some(c=>c.action==='apply-tool'));ui.$('reviewConfirm').click();assert.equal(ui.commands.at(-1).action,'apply-tool');
  [...ui.w.document.querySelectorAll('.message-actions button')].find(b=>b.textContent.includes('Branch')).click();assert.equal(ui.commands.at(-1).action,'branch');
  ui.$('newThread').click();assert.equal(ui.commands.at(-1).action,'new-thread');
 }finally{ui.dom.window.close();}
});

test('Conversation tools stay discoverable by keyboard; Escape closes tools before the assistant',()=>{
 const ui=overlay();try{ui.snapshot({locale:'tr'});assert.equal(ui.$('threads').options[0].textContent,'İlk sohbet');ui.snapshot({pageContext:true,transcriptScope:false,suggestions:[{id:'page',label:'Translate page',direct:true}]});ui.$('bubble').click();ui.w.document.dispatchEvent(new ui.w.KeyboardEvent('keydown',{key:'f',ctrlKey:true,bubbles:true}));assert(ui.$('conversationMenu').open);assert.equal(ui.w.document.activeElement,ui.$('find'));ui.w.document.dispatchEvent(new ui.w.KeyboardEvent('keydown',{key:'Escape',bubbles:true}));assert(!ui.$('conversationMenu').open);assert(!ui.$('panel').hidden);ui.$('suggestions').querySelector('button').click();assert.equal(ui.commands.at(-1).action,'suggestion');assert(ui.$('review').hidden);assert.match(ui.$('log').textContent,/Read. Understand. Explore/);}finally{ui.w.close();}
});


test('an accepted new question clears the old tool notice without hiding rejected-send errors',async()=>{
 const dom=new JSDOM('<div id="aiChat"><div id="aiChatLog"></div></div><div id="playerTitle">Film</div><select id="aiTranscriptScope"><option value="watched">Watched</option></select>',{runScripts:'outside-only',url:'https://parent.test/'}),w=dom.window;let listener,last,accept=false;
 try{
 Object.assign(w,{UiLocale:{get:()=> 'en'},player:{workspaceMode:'player',mediaKey:'file:fixture'},state:{running:false,queueRunning:false},aiChatPreparing:null,aiChatRetryPacket:null,assistantProviderSelection:()=>({model:'fixture'}),globalAssistantContext:()=>null,aiSourceScope:()=> 'A',buildOptsFromUI:()=>({translateModel:'fixture'}),AssistantJobsUI:{snapshot:()=>({jobs:[]}),cancel:async()=>{throw Error('Previous tool failed')}},api:{updateAssistant:v=>last=v,onAssistantCommand:fn=>listener=fn},aiChatSend:async text=>{if(!accept)return;const node=w.document.createElement('div');node.className='ai-msg ai-msg-user';node._sourceScope='A';node.textContent=text;w.document.getElementById('aiChatLog').append(node);}});
 w.AssistantRunSteps=require('../src/assistant-run-steps');w.eval(fs.readFileSync(path.join(root,'../assistant-source-context.js'),'utf8'));
 w.eval(fs.readFileSync(path.join(root,'../assistant-source-preview.js'),'utf8'));w.subtitleSourceTime=value=>value;w.subtitleContextLanguage=()=>'';
  w.eval(fs.readFileSync(path.join(root,'global-assistant.js'),'utf8'));const wait=()=>new Promise(resolve=>setTimeout(resolve,90));await wait();
 listener({action:'cancel-job',text:'old-job',sourceToken:'A'});await wait();assert.equal(last.workspaceError,'Previous tool failed');
 listener({action:'send',text:'Rejected question',sourceToken:'A',requestId:'reject'});await wait();assert.equal(last.receipt.accepted,false);assert.equal(last.workspaceError,'Previous tool failed');
 accept=true;listener({action:'send',text:'Accepted question',sourceToken:'A',requestId:'accept'});await wait();assert.equal(last.receipt.accepted,true);assert.equal(last.workspaceError,'');
 }finally{w.close()}
});


test('stale card refresh prepares a new unapplied card and still requires explicit confirmation',()=>{const ui=overlay();try{
 ui.snapshot({messages:[{role:'ai',text:'Review theme',actions:[{id:'old',kind:'app_action',label:'Theme',excerpt:'dark to light',resultStatus:'failed',refreshable:true,resultText:'Settings changed'}]}]});
 const refresh=ui.w.document.querySelector('[data-tool-control="refresh"]');assert(refresh);refresh.click();assert.equal(ui.commands.at(-1).action,'refresh-tool');assert.equal(ui.commands.at(-1).text,'old');assert.equal(ui.$('review').hidden,true);
 ui.snapshot({messages:[{role:'ai',text:'Review theme',actions:[{id:'fresh',kind:'app_action',label:'Theme',excerpt:'system to light'}]}]});
 assert.equal(ui.w.document.querySelector('[data-tool-control="refresh"]'),null);assert.equal(ui.commands.filter(row=>row.action==='apply-tool').length,0);
 const apply=ui.w.document.querySelector('.tool-card button');assert.equal(apply.disabled,false);apply.click();assert.equal(ui.$('review').hidden,false);ui.$('reviewConfirm').click();assert.equal(ui.commands.at(-1).action,'apply-tool');assert.equal(ui.commands.at(-1).text,'fresh');
}finally{ui.w.close();}});

test('source-free home and studio retain honest localized metadata and no content starters',async()=>{
 for(const locale of ['en','tr'])for(const workspace of ['media-library','subtitle-studio']){
  const dom=new JSDOM('<div id="aiChatLog"></div><div id="playerTitle"></div>',{runScripts:'outside-only',url:'https://parent.test/'}),w=dom.window;let last;
  try{Object.assign(w,{UiLocale:{get:()=>locale},player:{workspaceMode:'player'},state:{},aiChatPreparing:null,aiChatRetryPacket:null,assistantProviderSelection:()=>({model:'fixture'}),globalAssistantContext:()=>({workspace,page:'home',heading:'Home',note:'No active video is attached. Do not infer contents of a previously opened video.'}),aiSourceScope:()=>workspace,buildOptsFromUI:()=>({}),api:{updateAssistant:v=>{last=v},onAssistantCommand:()=>{}},subtitleSourceTime:v=>v,subtitleContextLanguage:()=>''});
   w.AssistantRunSteps=require('../src/assistant-run-steps');w.eval(fs.readFileSync(path.join(root,'../assistant-source-context.js'),'utf8'));w.eval(fs.readFileSync(path.join(root,'../assistant-source-preview.js'),'utf8'));w.eval(fs.readFileSync(path.join(root,'global-assistant.js'),'utf8'));await new Promise(r=>setTimeout(r,80));
   assert.equal(last.sourcePreview.attached,false);assert(!last.suggestions.some(r=>/:summary$|:explain$/.test(r.id)));assert(!last.sourceDescription.includes('Do not infer'));assert.match(last.sourceDescription,locale==='tr'?/Henüz video/:/No video/);assert(last.suggestions.some(r=>/:tasks$/.test(r.id)));
  }finally{dom.window.close()}
 }
});

test('inline action review requires confirmation and restores its trigger on cancel and Escape',()=>{
 const ui=overlay();try{
  const values={opened:true,messages:[{id:'a',role:'ai',text:'Review this proposal',actions:[{id:'one',kind:'app_action',label:'Open appearance',excerpt:'Open settings without changing values.'}]}]};
  ui.snapshot(values);const apply=()=>ui.w.document.querySelector('.tool-card button');apply().focus();apply().click();assert.equal(ui.w.document.activeElement,ui.$('reviewConfirm'));assert(!ui.commands.some(c=>c.action==='apply-tool'));
  ui.$('reviewCancel').click();assert.equal(ui.w.document.activeElement,apply());assert(ui.$('review').hidden);
  apply().click();ui.w.document.dispatchEvent(new ui.w.KeyboardEvent('keydown',{key:'Escape',bubbles:true}));assert.equal(ui.w.document.activeElement,apply());assert(!ui.$('panel').hidden);assert(!ui.commands.some(c=>c.action==='apply-tool'));
  apply().click();ui.$('reviewConfirm').click();assert.equal(ui.commands.filter(c=>c.action==='apply-tool').length,1);ui.$('reviewConfirm').click();assert.equal(ui.commands.filter(c=>c.action==='apply-tool').length,1);
  apply().click();ui.snapshot({...values,sourceToken:'B:1'});assert(ui.$('review').hidden);ui.$('reviewConfirm').click();assert.equal(ui.commands.filter(c=>c.action==='apply-tool').length,1,'source changes invalidate pending approval');
 }finally{ui.dom.window.close()}
});

test('empty greeting updates as an attached source becomes available without replacing the conversation',()=>{
 const ui=overlay();try{ui.snapshot({sourcePreview:{attached:false}});assert.match(ui.w.document.querySelector('.empty h2').textContent,/How can I help/);ui.snapshot({sourcePreview:{attached:true}});assert.match(ui.w.document.querySelector('.empty h2').textContent,/closer look/);
  ui.snapshot({opened:true});ui.$('conversationMenu').open=true;ui.$('threadSettings').click();ui.$('deleteThread').click();ui.w.document.dispatchEvent(new ui.w.KeyboardEvent('keydown',{key:'Escape',bubbles:true}));assert(ui.$('review').hidden,'Escape cancels the active decision before closing its underlying menu');assert.equal(ui.w.document.activeElement,ui.$('deleteThread'));
 }finally{ui.dom.window.close()}
});


test('Evidence disclosure keeps answers compact and survives streaming updates without losing the source action',()=>{const ui=overlay();try{const messages=[{id:'reply',role:'ai',text:'Answer',links:[{id:'F1',label:'Cinema journal',excerpt:'Actual source excerpt.',translation:'Kaynak çevirisi.'}]}];ui.snapshot({messages});const card=ui.w.document.querySelector('details.source-card');assert(card);assert.equal(card.open,false);assert.equal(card.querySelector('summary').textContent,'Cinema journalRead excerpt');card.open=true;card.querySelector('summary').focus();ui.snapshot({messages:[{...messages[0],text:'Answer continued'}]});const restored=ui.w.document.querySelector('details.source-card');assert.equal(restored.open,true);assert.equal(ui.w.document.activeElement,restored.querySelector('summary'));restored.querySelector('button').click();assert.equal(ui.commands.at(-1).action,'citation');assert.equal(ui.commands.at(-1).text,'F1');ui.snapshot({conversation:'B',messages});assert.equal(ui.w.document.querySelector('details.source-card').open,false);}finally{ui.w.close();}});

test('Go to source: only podcast and library contexts offer it, the panel button sends the action, and the main window opens exactly that source behind a stale-source guard',async()=>{
 const dom=new JSDOM('<div id="aiChat"><div id="aiChatLog"></div></div><div id="playerTitle">Episode</div><select id="aiTranscriptScope"><option value="watched">Watched</option></select>',{runScripts:'outside-only',url:'https://parent.test/'}),w=dom.window;let listener,last,context=null;const opened=[];
 try{
  Object.assign(w,{UiLocale:{get:()=> 'en'},player:{workspaceMode:'player',mediaKey:'file:fixture'},state:{running:false,queueRunning:false},aiChatPreparing:null,aiChatRetryPacket:null,assistantProviderSelection:()=>({model:'fixture'}),globalAssistantContext:()=>context,aiSourceScope:()=> 'A',buildOptsFromUI:()=>({translateModel:'fixture'}),AssistantJobsUI:{snapshot:()=>({jobs:[]}),cancel:async()=>{}},
   MediaShelfUI:{isPodcastMode:()=>true},CinemaSahne:{openShelf:async options=>{opened.push(['sahne',options.mode]);return {ok:true};}},MediaTitleUI:{open:async id=>{opened.push(['title',id]);}},api:{updateAssistant:v=>last=v,onAssistantCommand:fn=>listener=fn},aiChatSend:async()=>{}});
  w.AssistantRunSteps=require('../src/assistant-run-steps');w.eval(fs.readFileSync(path.join(root,'../assistant-source-context.js'),'utf8'));w.eval(fs.readFileSync(path.join(root,'../assistant-source-preview.js'),'utf8'));w.subtitleSourceTime=value=>value;w.subtitleContextLanguage=()=>'';
  w.eval(fs.readFileSync(path.join(root,'global-assistant.js'),'utf8'));const wait=()=>new Promise(resolve=>setTimeout(resolve,90));await wait();
  assert.equal(last.sourceTarget,null,'a plain video has no source card to return to');
  listener({action:'open-source',sourceToken:'A'});await wait();assert.match(last.workspaceError,/no source to open/);assert.deepEqual(opened,[]);
  context={workspace:'podcast',page:'podcast',title:'Episode'};w.document.dispatchEvent(new w.Event('media-context-changed'));listener({action:'send',text:'x',sourceToken:'A',requestId:'r'});await wait();assert.equal(last.sourceTarget.kind,'podcast');
  listener({action:'open-source',sourceToken:'OLD'});await wait();assert.deepEqual(opened,[],'a stale conversation token opens nothing');
  listener({action:'open-source',sourceToken:'A'});await wait();assert.deepEqual(opened,[['sahne','podcast']]);assert.equal(last.workspaceError,'');
  context={...context,transcript_evidence:{scope:'watched',limitations:[],evidence:[]}};w.document.dispatchEvent(new w.Event('media-context-changed'));await wait();assert.equal(last.transcriptScope,true,'timed Podcast exposes the real scope control');
  context.transcript_evidence.limitations=['untimed-transcript-excluded'];w.document.dispatchEvent(new w.Event('media-context-changed'));await wait();assert.equal(last.transcriptScope,false,'untimed prose offers no heard-time scope');
  context={type:'library-title',catalogId:'film-1',title:'Film'};listener({action:'send',text:'y',sourceToken:'A',requestId:'r2'});await wait();assert.equal(last.sourceTarget.kind,'library');
  listener({action:'open-source',sourceToken:'A'});await wait();assert.deepEqual(opened.at(-1),['title','film-1']);
  w.MediaTitleUI.open=async()=>({ok:false});
  listener({action:'open-source',sourceToken:'A'});await wait();assert.match(last.workspaceError,/source could not be opened/i);
 }finally{w.close();}
 const ui=overlay();try{ui.snapshot({locale:'tr',sourceTarget:null});assert.equal(ui.$('openSource').hidden,true);ui.snapshot({locale:'tr',sourceTarget:{kind:'podcast'}});assert.equal(ui.$('openSource').hidden,false);assert.equal(ui.$('openSource').textContent,'Kaynağa git');ui.$('openSource').click();assert.equal(ui.commands.at(-1).action,'open-source');}finally{ui.w.close();}
});

test('Saved podcast source cards show usage, timing, scope and the last open result as plain text',()=>{
 const ui=overlay();try{
  const link=(extra={})=>({id:'b:one:answer:0',label:'Coastal · Episode',title:'Coastal show · A much longer episode title',excerpt:'<img src=x onerror=bad> The lighthouse blinks.',meta:'Original · 0:12–0:15',scope:'Search “lighthouse”: complete result',action:'seek',usage:'cited',state:'',note:'',...extra});
  const show=(extra,locale='en')=>{ui.snapshot({locale,messages:[{id:'answer',role:'ai',text:'Answer '+Math.random(),links:[link(extra)]}]});return ui.w.document.querySelector('.source-card');};
  let card=show();
  assert.equal(card.dataset.usage,'cited');assert.match(card.querySelector('.source-usage').textContent,/^Cited$/);
  assert.equal(card.querySelector('.source-title').title,'Coastal show · A much longer episode title');
  assert.equal(card.querySelector('.source-location').textContent,'Original · 0:12–0:15');
  assert.equal(card.querySelector('.source-meta').textContent,'Search “lighthouse”: complete result');
  assert.equal(card.querySelector('img'),null,'the excerpt is text, never markup');assert.match(card.querySelector('p').textContent,/<img src=x onerror=bad>/);
  const button=card.querySelector('button');assert.match(button.textContent,/^Go to moment$/);assert.equal(button.getAttribute('aria-label'),'Go to moment: Coastal show · A much longer episode title');button.click();
  assert.deepEqual([ui.commands.at(-1).action,ui.commands.at(-1).text],['citation','b:one:answer:0']);
  card.querySelector('[data-note-control="open"]').click();assert.deepEqual([ui.commands.at(-1).action,ui.commands.at(-1).text],['note','b:one:answer:0']);
  card=show({usage:'found',action:'text',meta:'Original · Read-only text · no verified time'});
  assert.match(card.querySelector('.source-usage').textContent,/^Not cited$/);assert.match(card.querySelector('button').textContent,/^Open text$/);
  card=show({state:'opening'});assert.equal(card.querySelector('button').disabled,true);assert.match(card.querySelector('button').textContent,/Opening/);
  assert.equal(card.getAttribute('aria-busy'),'true');assert.equal(card.querySelector('.source-note').disabled,true);
  assert.equal(card.querySelector('.source-location').textContent,link({}).meta);
  card=show({state:'stale',canSearchAgain:true,note:'Saved quote retained; search again.'});assert.equal(card.querySelector('.source-search').textContent,'Search saved text again');card.querySelector('.source-search').click();assert.deepEqual(ui.commands.at(-1).action,'search-podcast-source');assert.equal(ui.commands.at(-1).text,link().id);assert(card.textContent.includes(link().excerpt));
  card=show({state:'stale',note:'This saved source was changed or removed. Nothing was opened; search again.'});
  const note=card.querySelector('.source-state');assert.equal(note.getAttribute('role'),'status');assert.equal(note.dataset.state,'stale');assert.match(note.textContent,/Nothing was opened/);
  assert.match(card.querySelector('button').textContent,/Check again/);assert.equal(card.querySelector('button').disabled,false);
  card=show({usage:'carried'},'tr');assert.match(card.querySelector('.source-usage').textContent,/nceki arama/);assert.match(card.querySelector('button').textContent,/^Ana git$/);
 }finally{ui.dom.window.close();}
});

test('Settled approval cards show their real result instead of a dead Apply button; a running one is marked and Activity is offered when it helps',()=>{
 const ui=overlay();try{
  let n=0;const show=(action,locale='en')=>{ui.snapshot({locale,messages:[{id:'answer'+(++n)+locale,role:'ai',text:'Review',actions:[{id:'p1',kind:'app_action',label:'Open settings',...action}]}]});return ui.w.document.querySelector('.tool-card');};
  let card=show({});assert.equal(card.dataset.status,'pending');assert.equal(card.querySelector('[data-tool-control="apply"]').disabled,false);
  card=show({live:'running'});assert.equal(card.dataset.status,'running');assert.match(card.querySelector('.tool-status').textContent,/Applying now/);assert.equal(card.querySelector('[data-tool-control="apply"]').disabled,true);assert.match(card.querySelector('[data-tool-control="apply"]').textContent,/Applying…/);
  card=show({resultStatus:'completed',resultText:'Opened.'});assert.equal(card.dataset.status,'completed');assert.equal(card.querySelector('[data-tool-control="apply"]'),null,'a completed action is never offered for applying again');assert.match(card.querySelector('.action-receipt').textContent,/Opened\./);
  card=show({resultStatus:'unknown',resultText:'Check the current state before asking again.',activity:true});
  assert.equal(card.dataset.status,'unknown');assert.match(card.querySelector('.tool-status').textContent,/Result unknown — not re-applied/);assert.equal(card.querySelector('[data-tool-control="apply"]'),null);
  assert.match(card.querySelector('[role="status"].action-receipt').textContent,/Check the current state/);
  card.querySelector('[data-tool-control="activity"]').click();assert.equal(ui.commands.at(-1).action,'open-activity');
  card=show({resultStatus:'failed',resultText:'Refused.'});assert.equal(card.querySelector('[data-tool-control="apply"]'),null);assert.equal(card.querySelector('[data-tool-control="activity"]'),null,'no Activity link when it cannot show this action');
  card=show({resultStatus:'unknown',resultText:'x',activity:true},'tr');assert.match(card.querySelector('.tool-status').textContent,/Sonuç bilinmiyor/);assert.match(card.querySelector('[data-tool-control="activity"]').textContent,/İşlemleri aç/);
 }finally{ui.dom.window.close();}
});
test('The basis separates cited, earlier and uncited sources, and states what is incomplete, failed or unverified',()=>{
 const ui=overlay();try{
  const link=(i,usage,extra={})=>({id:'b:one:answer:'+i,label:'Show · Episode '+i,title:'Show · Episode '+i,excerpt:'Quote '+i,meta:'Original · 0:01–0:03',scope:'Search “x”',action:'seek',usage,state:'',note:'',more:false,...extra});
  const show=(row,key)=>{ui.snapshot({messages:[{id:'answer'+key,role:'ai',text:'Answer',...row}]});return ui.w.document.querySelector('.sources');};
  let sources=show({links:[link(0,'cited'),link(1,'carried'),link(2,'found'),link(3,'found',{more:true})],steps:[{id:'s1',name:'search_saved_podcasts',state:'failed'},{id:'s2',name:'x',state:'completed'}],basis:{unverified:1}},1);
  const text=sources.querySelector('.source-basis').textContent;
  assert.match(text,/1 cited in the answer · 1 cited from an earlier search · 2 found, not cited/);assert.match(text,/more exist that were not read/);assert.match(text,/1 tool check failed, was blocked or has an unknown result/);assert.match(text,/1 reference in the answer could not be verified and is not shown as a source/);
  const group=sources.querySelector('.source-group');assert.match(group.querySelector('summary').textContent,/Found, not cited · 2/);assert.equal(group.querySelectorAll('.source-card').length,2);
  assert.equal([...sources.children].filter(n=>n.classList.contains('source-card')).length,2,'cited and earlier sources stay in the main list');
  group.open=true;group.dispatchEvent(new ui.w.Event('toggle'));
  sources=show({text:'Answer, still streaming',links:[link(0,'cited'),link(1,'carried'),link(2,'found'),link(3,'found',{more:true})],steps:[],basis:{unverified:1}},1);
  assert.equal(sources.querySelector('.source-group').open,true,'the disclosure survives a streaming update');
  // nothing cited: the uncited results are the content, shown flat
  sources=show({links:[link(0,'found'),link(1,'found')]},3);assert.equal(sources.querySelector('.source-group'),null);assert.match(sources.querySelector('.source-basis').textContent,/2 found, not cited/);
  // legacy sources without usage keep the plain list
  sources=show({links:[{id:'e:1',label:'1:23',excerpt:'Line'}]},4);assert.equal(sources.querySelector('.source-basis'),null);assert.equal(sources.querySelector('.source-note'),null);
  sources=show({links:[link(0,'cited')],locale:'tr'},5);
  ui.snapshot({locale:'tr',messages:[{id:'tr',role:'ai',text:'a',links:[link(0,'cited'),link(1,'found')]}]});assert.match(ui.w.document.querySelector('.source-basis').textContent,/1 yanıtta atıf yapıldı · 1 bulundu, atıf yok/);
 }finally{ui.dom.window.close();}
});

test('A podcast source card travels from the overlay command through global-assistant and the real opener, and shows its true result',async()=>{
 const rendererSource=fs.readFileSync(path.join(root,'renderer.js'),'utf8'),vm=require('node:vm');
 const opener=rendererSource.slice(rendererSource.indexOf('async function openPodcastResearchResult('),rendererSource.indexOf('async function openUnifiedLibraryResult('));
 const token='d'.repeat(64),id='P'+'2'.repeat(8)+'-2222-2222-2222-'+'2'.repeat(12);
 const card={id,kind:'podcast',usage:'cited',show:'Show',episode:'Episode',role:'source',timed:true,seconds:12,end:15,quote:'The lighthouse blinks.',locator:{action:'podcast-search-resolve',query:'lighthouse',episode:'entry-A',token},scope:{limit:6,more:true}};
 const binding={episodeIdentity:'episode-A',resource:'https://example.test/audio.mp3',revision:1,mime:'audio/mpeg',sha256:'unknown'};
 async function harness(options={}){
  const dom=new JSDOM('<div id="aiChat"><div id="aiChatLog"></div></div><div id="playerTitle">Film</div><select id="aiTranscriptScope"><option value="watched">Watched</option></select>',{runScripts:'outside-only',url:'https://parent.test/'}),w=dom.window;
  const state={thread:'t1',calls:[],shelf:[],noted:[],activity:0,last:null,listener:null,snapshot:{mediaKey:'stream-A',generation:2,sourceVersion:'version-A',sourceBinding:binding,episodeIdentity:'episode-A',entryId:'entry-A'}};
  const row=()=>({mediaType:'podcast',mediaId:'stream-A',sourceEntryId:'entry-A',sourceVersion:'version-A',sourceBinding:binding,episodeIdentity:'episode-A',playbackOwner:'player',timed:true,seconds:12,end:15,role:'source',quote:card.quote,token});
  Object.assign(w,{UiLocale:{get:()=> 'en'},player:{workspaceMode:'player',mediaKey:'stream-A',generation:2,get workspaceAudio(){return state.snapshot;}},state:{running:false,queueRunning:false},aiChatPreparing:null,aiChatRetryPacket:null,assistantProviderSelection:()=>({model:'fixture'}),globalAssistantContext:()=>null,aiSourceScope:()=> 'A',buildOptsFromUI:()=>({translateModel:'fixture'}),AssistantJobsUI:{snapshot:()=>({jobs:[]})},
   osd(){},logLine(){},syncBrowserOcclusion(){},subtitleSourceTime:value=>value,subtitleContextLanguage:()=> '',MediaExperience:{openTasks:()=>{state.activity++;}},AssistantPodcastNoteUI:{open:async value=>{state.noted.push(value);}},
   AssistantWorkspace:{snapshot:()=>({current:{id:state.thread,messages:[{id:'answer',role:'assistant',status:'complete',text:'See ['+id+'].',citations:[card]}]},threads:[]}),key:()=> 'conversation',activeId:()=>state.thread},
   PlayerSourceCatalogIntegration:{openPodcastEntry:async entry=>{state.calls.push(['open',entry]);options.afterOpen?.(state);}},PlayerWorkspaceIntegration:{executeExisting:async packet=>{state.calls.push(['seek',packet.time]);return {ok:true};}},CinemaSahne:{open(){},openShelf(){}},
   api:{updateAssistant:value=>state.last=value,onAssistantCommand:fn=>state.listener=fn,mediaShelf:async input=>{state.shelf.push(input);return options.shelf?options.shelf(state.shelf.length,row):{ok:true,row:row()};}}});
  w.AssistantRunSteps=require('../src/assistant-run-steps');w.eval(fs.readFileSync(path.join(root,'../assistant-source-context.js'),'utf8'));w.eval(fs.readFileSync(path.join(root,'../assistant-source-preview.js'),'utf8'));
  w.eval(fs.readFileSync(path.join(root,'assistant-podcast-sources.js'),'utf8'));
  const originalSnapshot=w.AssistantWorkspace.snapshot;
  w.AssistantWorkspace.snapshot=()=>{const value=originalSnapshot();value.current.messages[0].text+='\n\nSaved podcast sources\n['+id+'] Show · Episode · Original · 12.0–15.0 s · The lighthouse blinks.';return value;};
  w.eval(opener);   // the real helper, exactly as renderer.js defines it
  w.eval(fs.readFileSync(path.join(root,'global-assistant.js'),'utf8'));
  const wait=()=>new Promise(resolve=>setTimeout(resolve,90));await wait();
  const link=()=>state.last.messages[0].links[0];
  const click=async action=>{state.listener({action,text:link().id,sourceToken:state.last.sourceToken});await wait();};
  return {w,state,link,click,wait,close:()=>dom.window.close()};
 }
 // verified time: resolver gets the exact locator twice (open + re-check before the seek), the episode opens, then the seek happens
 let h=await harness();try{
  assert.deepEqual([h.link().usage,h.link().state,h.link().more],['cited','',true]);
  assert.equal(h.link().label,'P1');assert.equal(h.link().reference,id);
  assert(!h.state.last.messages[0].displayText.includes('Saved podcast sources'));assert(h.state.last.messages[0].text.includes('Saved podcast sources'));
  await h.click('citation');
  assert.deepEqual(h.state.shelf.map(input=>input.token),[token,token]);assert.deepEqual(h.state.shelf[0].query,'lighthouse');
  assert.deepEqual(h.state.calls,[['open','entry-A'],['seek',12]]);assert.equal(h.link().state,'opened');assert.match(h.link().note,/0:12/);
  await h.click('note');assert.equal(h.state.noted.length,1);assert.equal(h.state.noted[0].locator.token,token);
  await h.click('open-activity');assert.equal(h.state.activity,1);
 }finally{h.close();}
 // removed or changed source: nothing opens and the card says so
 h=await harness({shelf:()=>({ok:false,sourceChanged:true,error:'changed'})});try{
  const searches=[];h.w.MediaShelfUI={openTranscriptSearch:async input=>searches.push({...input})};
  await h.click('citation');assert.deepEqual(h.state.calls,[]);assert.equal(h.link().state,'stale');assert.match(h.link().note,/Nothing was opened/);
  await h.click('search-podcast-source');assert.equal(searches.length,1);assert.equal(searches[0].query,'lighthouse');assert.equal(h.state.calls.length,0);
 }finally{h.close();}
 // the conversation changes while the episode opens: no seek, and the card reports it was cancelled
 h=await harness({afterOpen:state=>{state.thread='t2';}});try{
  await h.click('citation');assert.deepEqual(h.state.calls,[['open','entry-A']],'no seek after the switch');
  assert.equal(h.link().state,'','the late answer never changes the new conversation\'s card (the cancelled state stays on the card it belongs to)');
 }finally{h.close();}
 // a different playback version opens read-only and is never sought
 h=await harness();try{
  h.state.snapshot={...h.state.snapshot,sourceVersion:'replacement'};h.w.document.body.append(h.w.document.createElement('div'));
  h.w.HTMLDialogElement.prototype.showModal=function(){this.open=true;};
  await h.click('citation');assert.deepEqual(h.state.calls,[['open','entry-A']]);assert.equal(h.link().state,'read-only');
 }finally{h.close();}
});

test('COMPOSITION: answer markers become source buttons of the same message (never inside code, never for unknown labels); the evidence strip states coverage as chips and keeps the explanation one tap away',()=>{
 const ui=overlay();try{
  const messages=[{id:'a',role:'ai',status:'complete',basis:{unverified:1},text:'Claim [F1] and an unknown [Z9] and a found one [F2] and `code [F1]`.',steps:[{id:'s1',name:'search_saved_podcasts',state:'failed'}],
   links:[{id:'F1',label:'F1',title:'Show · Episode 12',excerpt:'Exact excerpt one.',usage:'cited',more:true},{id:'F2',label:'F2',title:'Show · Episode 9',excerpt:'Exact excerpt two.',usage:'found'},{id:'F3',label:'F3',title:'Cited too',excerpt:'Third.',usage:'cited'}]}];
  ui.snapshot({messages});const doc=ui.w.document;
  const refs=[...doc.querySelectorAll('.cite-ref')];assert.deepEqual(refs.map(b=>b.textContent),['F1','F2'],'known labels only; the one inside code and the unknown label stay text');
  assert.match(doc.querySelector('.message.ai').textContent,/\[Z9\]/);assert.match(doc.querySelector('code').textContent,/\[F1\]/);
  const chips=[...doc.querySelectorAll('.evidence-chip')].map(c=>[c.dataset.tone,c.textContent]);
  assert.deepEqual(chips.map(c=>c[0]),['ok','muted','warn','bad','bad']);assert.match(chips[0][1],/2 cited/);assert.match(chips[3][1],/1 check failed/);assert.match(chips[4][1],/1 reference unverified/);
  const coverage=doc.querySelector('details.evidence-more');assert.equal(coverage.open,false,'the long explanation is collapsed');assert.match(coverage.textContent,/limited number of matches; more exist that were not read/);assert.match(coverage.textContent,/not verified/);
  refs[1].click();const group=doc.querySelector('details.source-group'),card=[...doc.querySelectorAll('.source-card')].find(c=>c.dataset.citeLabel==='F2');
  assert.equal(group.open,true,'the found-not-cited group opens for its marker');assert.equal(card.open,true);assert.equal(doc.activeElement,card.querySelector('summary'),'focus moves to the matching source');
  refs[0].click();assert.equal([...doc.querySelectorAll('.source-card')].find(c=>c.dataset.citeLabel==='F1').open,true);
  ui.snapshot({messages:[{...messages[0],text:messages[0].text+' more'}]});assert.equal(doc.querySelectorAll('.source-card[open]').length,2,'open sources survive the next streaming update');
 }finally{ui.w.close();}
});

test('real UUID podcast references become compact buttons only for an exact source in the same answer',()=>{
 const ui=overlay(),id='P208cc9a0-96e9-4e01-98f8-ec10bec018a1',unknown='P00000000-0000-0000-0000-000000000000';try{
  ui.snapshot({messages:[{id:'real-podcast',role:'ai',text:'A real quote ['+id+'] and an unavailable ['+unknown+']. Also bare '+id+'. Keep `'+id+'` as code.',links:[{id:'card-one',label:'P1',reference:id,title:'Real episode',excerpt:'Exact saved quote.',usage:'cited'}]}]});
  const refs=ui.w.document.querySelectorAll('.cite-ref');assert.equal(refs.length,2);assert.equal(refs[0].textContent,'P1');assert.equal(ui.w.document.querySelector('code').textContent,id);
  assert.match(ui.w.document.querySelector('.message.ai').textContent,new RegExp(unknown));
  refs[0].click();const card=ui.w.document.querySelector('.source-card');assert.equal(card.open,true);assert.equal(ui.w.document.activeElement,card.querySelector('summary'));
 }finally{ui.w.close();}
});

test('visual answer compaction leaves copy, search and saved message text complete',()=>{
 const ui=overlay();try{
  const raw='Readable answer\n\nSaved podcast sources\nExact saved quote.';
  ui.snapshot({messages:[{id:'compact',role:'ai',text:raw,displayText:'Readable answer'}]});
  const node=ui.w.document.querySelector('.message.ai');assert.equal(node._searchText,raw);assert(!node.textContent.includes('Exact saved quote.'));
  node.querySelector('.message-actions button').click();assert.equal(ui.commands.at(-1).action,'copy');assert.equal(ui.commands.at(-1).text,raw);
 }finally{ui.w.close();}
});

test('COMPOSITION: a status update never takes focus or the draft from the user who is typing',()=>{
 const ui=overlay();try{
  ui.snapshot({messages:[{id:'a',role:'ai',text:'First',links:[]}]});const field=ui.$('text');field.focus();field.value='half a question';
  ui.snapshot({busy:true,phase:'tool',activity:'Reading sources',messages:[{id:'a',role:'ai',text:'First',links:[]},{id:'b',role:'ai',text:'Streaming…',loading:true,links:[]}]});
  assert.equal(ui.w.document.activeElement,field);assert.equal(field.value,'half a question');
  ui.snapshot({busy:false,messages:[{id:'a',role:'ai',text:'First',links:[]},{id:'b',role:'ai',status:'complete',text:'Done',links:[{id:'F1',label:'F1',excerpt:'E',usage:'cited'}]}]});
  assert.equal(ui.w.document.activeElement,field,'the finished answer and its sources did not steal focus');assert.equal(field.value,'half a question');
 }finally{ui.w.close();}
});

test('COMPOSITION: action cards are flat rows: one primary action while waiting, a settled row shows only its real result, expired cards offer a refresh, unknown stays unknown',()=>{
 const ui=overlay();try{
  const card=(id,extra)=>({id,live:'',activity:false,kind:'app_action',label:'Open production run',canContinue:false,waiting:false,retryable:false,partial:false,flowNote:'',resultStatus:'',refreshable:false,resultText:'',excerpt:'',translation:'',...extra});
  ui.snapshot({messages:[{id:'m',role:'ai',text:'Prepared.',links:[],steps:[],actions:[card('p1',{flowNote:'Opens the panel; nothing starts.'}),card('p2',{live:'running'}),card('p3',{resultStatus:'completed',resultText:'Selected; nothing plays.'}),card('p4',{resultStatus:'unknown',resultText:'Result unknown; not re-applied.'}),card('p5',{refreshable:true,resultStatus:'failed',resultText:'Expired; nothing ran.'})]}]});
  const doc=ui.w.document,by=id=>doc.querySelector(`.tool-card[data-proposal-id="${id}"]`);
  assert(by('p1').querySelector('.tool-head > .tool-status'));assert.equal(by('p1').dataset.settled,undefined);assert.match(by('p1').querySelector('[data-tool-control=apply]').textContent,/Apply/);
  assert.equal(by('p2').querySelector('[data-tool-control=apply]').disabled,true,'a running card cannot be applied again');
  for(const id of ['p3','p4','p5'])assert.equal(by(id).dataset.settled,'1',id);
  for(const id of ['p3','p4','p5'])assert.equal(by(id).querySelector('[data-tool-control=apply]'),null,id+' has no dead Apply button');
  assert.match(by('p4').querySelector('.tool-status').textContent,/Result unknown/);assert.equal(by('p4').dataset.status,'unknown');
  assert(by('p5').querySelector('[data-tool-control=refresh]'),'an expired card offers a refresh from current settings');
  by('p1').querySelector('[data-tool-control=apply]').click();assert.equal(ui.commands.filter(c=>c.action==='apply-tool').length,0,'Apply opens a review first; it never applies directly');
 }finally{ui.w.close();}
});

test('COMPOSITION: the saved run RECORD and the open MEDIA are two separate lines in the activity card, visible while it is collapsed, EN and TR',()=>{
 for(const [locale,record,media,not] of [['en','Run record','Open media',/NOT the record/],['tr','Çalışma kaydı','Açık medya',/DEĞİL/]]){
  const ui=overlay();try{
   for(const f of ['../assistant-run-steps.js','assistant-run-card.js'])ui.w.eval(fs.readFileSync(path.join(root,f),'utf8'));
   ui.snapshot({locale,messages:[{id:'m',role:'ai',text:'Answer',links:[],actions:[],steps:[{id:'r1',name:'inspect_voice_run',state:'completed',voiceRun:{kind:'record',runId:'run-cut',title:'Chapter 5',state:'interrupted',audio:'valid',selected:true,matches:false,mediaTitle:'Film now playing',unknown:true}}]}]});
   const strip=ui.w.document.querySelector('.assistant-run-card summary .run-context');assert(strip&&!strip.hidden,'inside the summary, so it shows while collapsed');
   const rows=[...strip.querySelectorAll('.run-fact')];assert.deepEqual(rows.map(r=>r.dataset.kind),['record','audio','unknown','media']);
   assert.equal(rows[0].querySelector('b').textContent,record);assert.equal(rows[3].querySelector('b').textContent,media);assert.match(rows[3].textContent,not);assert.match(rows[0].textContent,/Chapter 5/);
   assert.match(rows[1].textContent,/not listened|dinlenmedi/);
  }finally{ui.w.close();}
 }
});

test('switching back to a conversation restores its reading position, open citations and unsent question',()=>{
 const ui=overlay();try{
  const messages=[{id:'m',role:'ai',text:'Long answer',links:[{id:'P1',label:'P1',excerpt:'Real excerpt'}]}];
  const log=ui.$('log');Object.defineProperties(log,{scrollHeight:{get:()=>1800},clientHeight:{get:()=>400}});
  ui.snapshot({conversation:'A',messages});log.scrollTop=317;ui.w.document.querySelector('.source-card').open=true;
  ui.$('text').value='Unsent A';ui.$('text').dispatchEvent(new ui.w.Event('input'));
  ui.snapshot({conversation:'B',sourceToken:'B:1',messages:[]});
  ui.snapshot({conversation:'A',messages});
  assert.equal(ui.$('text').value,'Unsent A');assert.equal(ui.w.document.querySelector('.source-card').open,true);assert.equal(log.scrollTop,317);
 }finally{ui.w.close();}
});
