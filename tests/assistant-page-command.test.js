 'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const {JSDOM}=require('jsdom');const {match}=require('../src/assistant-page-command');
test('Explicit page translation requests route to the page tool, not feature questions or subtitle requests',()=>{
 for(const text of ['selam bu sayfası çevirebilir misin','Bu sayfayı Türkçeye çevir.','Bu sayfayı çevirebilir misin?','Can you translate this page to Turkish?','çevirebilir misin?','Lütfen bunu Türkçeye çevir','Could you translate this into Turkish?'])assert.equal(match(text)?.kind,'translate-page',text);
 assert.equal(match('Translate the page to English').targetLanguage,'en');
 for(const text of ['Sayfayı çevirme','Sayfayı nasıl çevirebilirim?','Sayfanın çevirisi iyi mi?','Bu cümleyi çevir','Sayfadaki altyazıyı çevir','Do not translate the page','Sayfayı çevir kelimesi ne demek?','Sayfayı çevirmeden özetle'])assert.equal(match(text),null,text);
});
function helper(overrides={}){
 const source=fs.readFileSync(require.resolve('../src/renderer/renderer.js'),'utf8');
 const code=source.slice(source.indexOf('async function handleBrowserPageTranslationAction('),source.indexOf("$('browserPageTranslate')?.addEventListener"));
 const calls=[],tab={generation:7},player={browserActiveTabId:'A',browserPageUrl:'https://article.test/a',browserPageTranslated:0,browserPageVisible:false};
 const context={player,browserTabState:()=>tab,effectiveBrowserProfile:()=>({values:{pageTargetLanguage:'tr'}}),loadBrowserPagePrefs:()=>({}),saveAppSettings:async()=>true,setBrowserSignal:()=>{},applyBrowserPageTranslationState:()=>{},window:{api:{startBrowserPageTranslation:async(id,opts)=>{calls.push(['start',id,opts]);return {ok:true,translated:2}},toggleBrowserPageTranslation:async(id,visible)=>{calls.push(['toggle',id,visible]);return {ok:true}},clearBrowserPageTranslation:async()=>{calls.push(['clear']);return {ok:true}},getBrowserPageContext:async()=>({ok:true,translationLanguage:'tr'})}},...overrides};vm.createContext(context);vm.runInContext(code,context);return {context,calls,player,tab,run:opts=>context.handleBrowserPageTranslationAction(opts)};
}
test('Repeated assistant translation requests keep a running job or show a cached translation; toolbar retains stop/toggle',async()=>{
 const h=helper();h.player.browserPageTranslateBusy=true;assert((await h.run({ensureVisible:true})).running);assert.equal(h.calls.length,0);await h.run();assert.equal(h.calls[0][0],'clear');
 h.calls.length=0;h.player.browserPageTranslateBusy=false;h.player.browserPageTranslated=2;h.player.browserPageVisible=true;await h.run({ensureVisible:true,targetLanguage:'tr'});assert.deepEqual(h.calls[0],['toggle','A',true]);
 h.calls.length=0;await h.run();assert.deepEqual(h.calls[0],['toggle','A',false]);
 h.calls.length=0;h.context.window.api.getBrowserPageContext=async()=>({ok:true,translationLanguage:'en'});await h.run({ensureVisible:true,targetLanguage:'tr'});assert.equal(h.calls[0][0],'start');assert.equal(h.calls[0][2].targetLanguage,'tr');
});
test('Cancel or navigation during settings save cannot start a page job on a new source',async()=>{
 let release;const h=helper({saveAppSettings:()=>new Promise(r=>release=r)});const task=h.run({ensureVisible:true});h.tab.generation++;release(true);assert((await task).stale);assert.equal(h.calls.length,0);
 const c=helper();await c.run({ensureVisible:true,isCancelled:()=>true});assert.equal(c.calls.length,0);
});
test('Page tool adapter persists real completion, partial and cancelled outcomes with its own source record',async()=>{
 const dom=new JSDOM('<div id="log"></div>',{runScripts:'outside-only'}),w=dom.window;let release,scope='A',finished=[];
 try{
 Object.assign(w,{UiLocale:{get:()=> 'en'},AssistantPageIntent:{match},globalAssistantContext:()=>null,aiSourceScope:()=>scope,player:{workspaceMode:'browser',browserActiveTabId:'A',browserPageUrl:'https://article.test/a',browserPageTranslated:1},aiChatAdd:(role,text)=>{const n=w.document.createElement('div');n.textContent=text;w.document.getElementById('log').append(n);return n;},handleBrowserPageTranslationAction:()=>new Promise(r=>release=r),api:{clearBrowserPageTranslation:async()=>({ok:true})},AssistantWorkspace:{activeId:()=> 'thread',begin:()=>{},partial:()=>{},finish:(job,text,status)=>finished.push({job,text,status})}});
 w.eval(fs.readFileSync(require.resolve('../src/renderer/assistant-page-commands.js'),'utf8'));
 let task=w.AssistantPageCommands.handle('Translate this page');assert(w.AssistantPageCommands.busy());w.document.dispatchEvent(new w.Event('browser-page-translation-changed'));assert.match(w.document.getElementById('log').textContent,/1 blocks ready/);release({partial:true,translated:1,failed:1});await task;assert.match(finished.at(-1).text,/partial/);assert.equal(finished.at(-1).status,'complete');assert(!w.AssistantPageCommands.busy());
 task=w.AssistantPageCommands.handle('Translate this page');await w.AssistantPageCommands.cancel();release({ok:true});await task;assert.equal(finished.at(-1).status,'stopped');assert.doesNotMatch(finished.at(-1).text,/ready/);
 task=w.AssistantPageCommands.handle('Translate this page');w.api.clearBrowserPageTranslation=async()=>({ok:false,error:'Controlled stop failure'});await w.AssistantPageCommands.cancel();release({ok:true});await task;assert.equal(finished.at(-1).status,'failed');assert.match(finished.at(-1).text,/Controlled stop failure/);
 task=w.AssistantPageCommands.handle('Translate this page');scope='B';assert.equal(w.AssistantPageCommands.status(),null);release({ok:true});await task;assert.equal(finished.at(-1).status,'stopped');assert.match(finished.at(-1).text,/source changed/);
 }finally{w.close();}
});

test('Main page start honours cancellation during safety checks; page context rejects a late navigation result',async()=>{
 const source=fs.readFileSync(require.resolve('../src/main.js'),'utf8');let release;
 const tab={generation:1,pageStartEpoch:2,view:{webContents:{isDestroyed:()=>false,getURL:()=> 'https://article.test/a'}}};
 const context={prepareBrowserPageInstrumentation:()=>new Promise(r=>release=r),browserPageTranslationConfig:()=>{throw Error('Cancelled request reached provider configuration');}};vm.createContext(context);
 const begin=source.indexOf('async function startBrowserPageTranslation(tab,');vm.runInContext(source.slice(begin,source.indexOf('function pruneReplacedBrowserPageBlocks(',begin)),context);
 const task=context.startBrowserPageTranslation(tab,{startEpoch:2});tab.pageStartEpoch++;release({});assert((await task).stale);
 let handler;context.ipcMain={handle:(name,fn)=>handler=fn};context.authorizedBrowserSender=()=>true;context.activeRequestedBrowserTab=()=>tab;context.pageContextScript=()=>'';context.executeBrowserTrustedMain=()=>new Promise(r=>release=r);
 const marker="ipcMain.handle('browser:page:context',";const start=source.indexOf(marker);vm.runInContext(source.slice(start,source.indexOf("ipcMain.handle('browser:page:reveal'",start)),context);
 const read=handler({},{});tab.generation++;release([{ok:true,blocks:[{id:'S1',text:'Old page text'}]}]);assert((await read).stale);
});


test('page target language is explicit and separate from the named source language',()=>{
 for(const [text,target] of [
  ['Türkçe sayfayı İngilizceye çevir','en'],
  ['İngilizce sayfayı Almancaya çevir','de'],
  ['İspanyolca sayfayı Fransızcaya çevir','fr'],
  ['Translate this Turkish page into English','en'],
  ['Translate the English webpage to German','de'],
  ['Translate the current French page to Spanish','es'],
  ['Bu sayfayı İngilizce çevir','en'],
  ['Translate this page in French','fr'],
 ])assert.equal(match(text)?.targetLanguage,target,text);
 for(const text of ['Türkçe sayfayı çevir','Translate this Turkish page'])assert.equal(match(text)?.targetLanguage,'',text);
 for(const text of ['Türkçe sayfayı İngilizceye çevirme','Do not translate this Turkish page into English','Türkçe sayfadaki altyazıyı İngilizceye çevir'])assert.equal(match(text),null,text);
});
