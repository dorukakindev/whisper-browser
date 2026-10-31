// Behavioral regression derived from the corresponding report reproducer.
'use strict';
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'../..');
const outputBase=path.resolve(process.env.AUDIT823_OUT||path.join(root,'.uiprev/audit823-notes-'+Date.now()));fs.mkdirSync(outputBase,{recursive:true});
const {JSDOM}=require('jsdom');
const {BrowserNoteStore}=require(path.join(root,'src/browser-note-store'));
const {normalizeAnnotation}=require(path.join(root,'src/browser-learning'));
const renderer=fs.readFileSync(path.join(root,'src/renderer/renderer.js'),'utf8');
const main=fs.readFileSync(path.join(root,'src/main.js'),'utf8');
const results=[];
async function scenario(name,{pendingEdit=false,otherEdit=false,reject=false,listReject=false}={}){
 const folder=fs.mkdtempSync(path.join(outputBase,'run-')); const file=path.join(folder,'notes.json'); const store=new BrowserNoteStore(file);
 for(const id of ['A','B'])store.upsert({id,mediaId:'browser:https://fixture.test/'+id,type:'note',note:'saved-'+id,tags:['saved'],links:[],mediaTitle:id});
 let heldResolve;const held=new Promise(r=>heldResolve=r);const calls=[];
 const handlers={};const mainContext={ipcMain:{handle:(id,fn)=>handlers[id]=fn},authorizedBrowserSender:e=>e.authorized===true,normalizeAnnotation,ensureBrowserNotesReady:()=>store,watchIndex:()=>null,ensureIndexMediaForAnnotation:()=>{},Date};
 vm.createContext(mainContext);
 const hStart=main.indexOf("ipcMain.handle('browser:research:list'");const hEnd=main.indexOf("ipcMain.handle('browser:research:review'",hStart);
 vm.runInContext(main.slice(hStart,hEnd),mainContext);
 const dom=new JSDOM('<div id="playerLibraryList"></div><div id="playerLibraryStatus"></div>');
 let listCalls=0;
 const context={document:dom.window.document,$:id=>dom.window.document.getElementById(id),playerLibraryView:'research',researchAnnotations:[],researchLoadSeq:0,uiText:s=>s,pSecToTime:String,historyWhen:String,osd:()=>{},logLine:()=>{},window:{api:{
 listResearchAnnotations:async(filters,limit)=>{if(listReject&&listCalls++>0)throw Error('controlled list failure');return handlers['browser:research:list']({authorized:true},{filters,limit});},
 upsertResearchAnnotation:async raw=>{calls.push(raw); if(reject)return{ok:false,error:'controlled rejected save'};const out=await handlers['browser:research:upsert']({authorized:true},raw);if(pendingEdit)await held;return out;}
 }}};
 vm.createContext(context);
 const start=renderer.indexOf('function researchLibraryFilters()');const end=renderer.indexOf('// Kutuphane her yazim/arama',start);
 vm.runInContext(renderer.slice(start,end),context);await context.loadResearchLibrary();
 const card=id=>dom.window.document.querySelector('[data-research-id="'+id+'"]');
 const field=(id,key)=>card(id).querySelector('[data-research-field="'+key+'"]');
 field('A','note').value='new-A';
 if(otherEdit){field('B','note').value='unsaved-B';field('B','tags').value='draft-tag';field('B','links').value='https://draft.test/';}
 const saving=context.handleResearchLibraryAction({target:card('A').querySelector('[data-research-action="save"]')});
 if(pendingEdit){field('A','note').value='newer-A-during-save';heldResolve();}
 await saving;
 const reopened=new BrowserNoteStore(file);
 const out={name,domA:field('A','note').value,domB:field('B','note').value,domBTags:field('B','tags').value,domBLinks:field('B','links').value,diskA:reopened.get('A').note,diskB:reopened.get('B').note,upsertCalls:calls.length,unauthorized:await handlers['browser:research:upsert']({authorized:false},{id:'A',mediaId:'x',note:'forbidden'})};
 assert.equal(out.unauthorized.ok,false);
 if(reject){assert.equal(out.domA,'new-A');assert.equal(out.domB,'unsaved-B');assert.equal(out.diskA,'saved-A');}
 else {assert.equal(out.diskA,'new-A');assert.equal(out.domA,pendingEdit?'newer-A-during-save':'new-A');assert.equal(out.diskB,'saved-B');if(otherEdit){assert.equal(out.domB,'unsaved-B');assert.equal(out.domBTags,'draft-tag');assert.equal(out.domBLinks,'https://draft.test/');}}
 results.push(out);dom.window.close();
}
(async()=>{await scenario('same-card edit during acknowledged save',{pendingEdit:true});await scenario('other-card draft before save',{otherEdit:true});await scenario('positive no additional draft');await scenario('failed reload preserves both cards',{otherEdit:true,listReject:true});await scenario('negative rejected save preserves both drafts',{otherEdit:true,reject:true});fs.writeFileSync(path.join(outputBase,'result.json'),JSON.stringify({findings:1,results,limits:['Real renderer source slices run in VM with JSDOM; no native Electron UI.','Real list/upsert handler source slices; IPC authorization and watch-index boundary controlled.','Real BrowserNoteStore normalization, flush, fsync, reload in fresh synthetic directories.','No network, personal profile, credentials or product changes.']},null,2));console.log('regression passed');})().catch(e=>{console.error(e);process.exitCode=1});
