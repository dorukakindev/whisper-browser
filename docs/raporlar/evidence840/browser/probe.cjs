'use strict';
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict'),{JSDOM}=require('jsdom');
const root=path.resolve(__dirname,'../../../..'),R=require(path.join(root,'src/browser-reader'));
const reg=require(path.join(root,'docs/audits/deepseek-night1000-20261027/COVERAGE-REGISTRY.json'));
fs.writeFileSync(path.join(__dirname,'registry-reviewed.json'),JSON.stringify(reg.scenarios.filter(row=>['F15','F46','F47'].includes(row.family)),null,2));
const page=new JSDOM('<h1>Controlled article</h1><article><p>'+('A quiet article about a synthetic riverside walk. '.repeat(12))+'</p></article>',{url:'https://reader840.test/article',runScripts:'outside-only'}),w=page.window;
Object.defineProperty(w.HTMLElement.prototype,'innerText',{get(){return this.textContent;}});
let shadow;const attach=w.Element.prototype.attachShadow;w.Element.prototype.attachShadow=function(options){shadow=attach.call(this,options);return shadow;};
const events=[],tab={id:'controlled',generation:1,view:{webContents:{isDestroyed:()=>false}},readerActive:false,readerPreferences:R.normalizeReaderPreferences({fontSize:20,width:760})};
let handler;
const source=fs.readFileSync(path.join(root,'src/main.js'),'utf8'),start=source.indexOf("ipcMain.handle('browser:reader',"),end=source.indexOf("ipcMain.handle('browser:permissions:get'",start);
const sandbox={ipcMain:{handle:(_key,fn)=>handler=fn},authorizedBrowserSender:()=>true,activeRequestedBrowserTab:()=>tab,prepareBrowserPageInstrumentation:async()=>({}),normalizeReaderPreferences:R.normalizeReaderPreferences,buildDefuddleBootstrapScript:R.buildDefuddleBootstrapScript,buildBrowserReaderScript:R.buildBrowserReaderScript,executeBrowserTrustedMain:async(_view,script)=>script===R.buildDefuddleBootstrapScript()?[true]:[w.eval(script)],sendBrowserEvent:(_tab,event)=>events.push(event)};
vm.runInNewContext(source.slice(start,end),sandbox,{filename:'main.js:browser:reader'});
(async()=>{try{
 const opened=await handler({}, {tabId:tab.id,action:'open'});assert.equal(opened.active,true);
 shadow.querySelectorAll('button')[1].click();const afterFont={controller:w.__whisperReaderController.snapshot().preferences,fontInMain:tab.readerPreferences.fontSize,events:events.length};
 assert.equal(afterFont.controller.fontSize,21);assert.equal(afterFont.fontInMain,20);
 [...shadow.querySelectorAll('button')].find(button=>button.textContent==='Kapat').click();
 const afterClose={hostExists:!!w.document.getElementById('whisper-reader-host'),controllerExists:!!w.__whisperReaderController,activeInMain:tab.readerActive,fontInMain:tab.readerPreferences.fontSize,events:events.length};
 assert.equal(afterClose.hostExists,false);assert.equal(afterClose.activeInMain,true);
 const reopened=await handler({}, {tabId:tab.id,action:'toggle',preferences:tab.readerPreferences});assert.equal(reopened.active,true);assert.equal(reopened.preferences.fontSize,20);
 // Counterexample: closing through the actual IPC harvests the updated snapshot.
 shadow.querySelectorAll('button')[1].click();const ipcClosed=await handler({}, {tabId:tab.id,action:'close'});assert.equal(ipcClosed.active,false);assert.equal(ipcClosed.preferences.fontSize,21);
 const result={head:'f3713c9fe7855f9e9a92bab5fcf65e2d5a69a74d',realMainHandler:true,realReaderScriptAndButtons:true,controlledWebContents:true,nativeWindow:false,afterFont,afterClose,reopened,ipcClosed,eventCount:events.length};fs.writeFileSync(path.join(__dirname,'results.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result,null,2));
}finally{page.window.close();}})().catch(error=>{console.error(error);process.exitCode=1;});
