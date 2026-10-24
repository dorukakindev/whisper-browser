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
test('Parent bridge rejects stale source commands and receipts acknowledge only a newly accepted question',async()=>{
 const dom=new JSDOM('<div id="aiChat"><div id="aiChatLog"></div></div><div id="playerTitle">Film</div><select id="aiTranscriptScope"><option value="watched">Watched</option></select>',{runScripts:'outside-only',url:'https://parent.test/'}),w=dom.window;let listener,scope='A',sends=0,last;
 try{
  Object.assign(w,{UiLocale:{get:()=> 'en'},player:{workspaceMode:'player',mediaKey:'file:fixture',job:null},state:{running:false,queueRunning:false},aiChatPreparing:null,aiChatRetryPacket:null,globalAssistantContext:()=>null,aiSourceScope:()=>scope,buildOptsFromUI:()=>({translateModel:'fixture'}),api:{updateAssistant:value=>{last=value;},onAssistantCommand:fn=>{listener=fn;}},aiChatSend:async text=>{sends++;const node=w.document.createElement('div');node.className='ai-msg ai-msg-user';node._sourceScope=scope;node.textContent=text;w.document.getElementById('aiChatLog').append(node);}});
  w.eval(fs.readFileSync(path.join(root,'global-assistant.js'),'utf8'));
  const wait=()=>new Promise(resolve=>setTimeout(resolve,90));await wait();
  listener({action:'send',text:'Wrong target',sourceToken:'old',requestId:'old-request'});await wait();assert.equal(sends,0);assert.equal(last.receipt.accepted,false);
  listener({action:'send',text:'Right target',sourceToken:'A',requestId:'good-request'});await wait();assert.equal(sends,1);assert.equal(last.receipt.id,'good-request');assert(last.receipt.accepted);assert.equal(last.messages.length,1);
  scope='B';w.document.dispatchEvent(new w.Event('media-context-changed'));await wait();assert.equal(last.sourceToken,'B');assert.equal(last.messages.length,0,'Film A messages cannot appear under Film B title');
  listener({action:'send',text:'B question',sourceToken:'B',requestId:'B-request'});await wait();listener({action:'clear',sourceToken:'B'});await wait();assert.equal(last.messages.length,0);assert.equal(w.document.querySelectorAll('#aiChatLog .ai-msg').length,1,'Clearing B keeps A messages');
 }finally{w.close();}
});
