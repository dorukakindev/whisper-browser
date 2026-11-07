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
  w.eval(fs.readFileSync(path.join(root,'../assistant-source-context.js'),'utf8'));
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
 w.eval(fs.readFileSync(path.join(root,'../assistant-source-context.js'),'utf8'));
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
   w.eval(fs.readFileSync(path.join(root,'../assistant-source-context.js'),'utf8'));w.eval(fs.readFileSync(path.join(root,'../assistant-source-preview.js'),'utf8'));w.eval(fs.readFileSync(path.join(root,'global-assistant.js'),'utf8'));await new Promise(r=>setTimeout(r,80));
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
  w.eval(fs.readFileSync(path.join(root,'../assistant-source-context.js'),'utf8'));w.eval(fs.readFileSync(path.join(root,'../assistant-source-preview.js'),'utf8'));w.subtitleSourceTime=value=>value;w.subtitleContextLanguage=()=>'';
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
