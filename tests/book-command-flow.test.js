'use strict';const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),{JSDOM}=require('jsdom');
test('book narration command uses current reader only and opens settings without calling a model',async()=>{
 const dom=new JSDOM('<main></main>',{runScripts:'outside-only'}),w=dom.window;let source={id:'book:1',chapter:'Chapter 1',type:'book-chapter',text:'Actual source'},base=source,opened=0,answer;
 try{Object.assign(w,{globalAssistantContext:()=>base,aiChatAdd:()=>w.document.createElement('div'),AssistantWorkspace:{begin(){},finish:(_,text,status)=>answer={text,status}}});w.eval(fs.readFileSync(require.resolve('../src/renderer/book-assistant-ui'),'utf8'));
 const dispose=w.BookAssistantUI.mount(w.document.querySelector('main'),{t:en=>en,isCurrent:()=>true,getSource:()=>source,onNarrate:async()=>{opened++;return true;}});
 for(const q of ['Bu bölümü nasıl seslendiririm?','Bu bölümü seslendirme','"Bu bölümü seslendir" ne demek?'])assert.equal(await w.BookAssistantUI.handle(q),false);
 assert.equal(await w.BookAssistantUI.handle('Bu bölümü seslendir'),true);assert.equal(opened,1);assert.equal(answer.status,'complete');assert.match(answer.text,/No audio was generated/);
 base={...source,id:'another'};assert.equal(await w.BookAssistantUI.handle('Bu bölümü seslendir'),false);assert.equal(opened,1);base=source;dispose();assert.equal(await w.BookAssistantUI.handle('Read aloud this chapter'),false);
 }finally{w.close();}
});
test('only bounded structured generation activity crosses the main boundary',()=>{
 const {activity}=require('../src/dub-activity');const a={stage:'synthesis',group:61,attempt:2,elapsed:30,limit:180,secret:'never forward'};assert.deepEqual(activity(a),{stage:'synthesis',group:61,attempt:2,elapsed:30,limit:180});for(const change of [{group:0},{group:5001},{attempt:Infinity},{elapsed:NaN},{limit:10000},{stage:'invented'}])assert.equal(activity({...a,...change}),null);
});
