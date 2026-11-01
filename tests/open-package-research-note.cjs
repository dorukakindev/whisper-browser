'use strict';
const fs=require('fs'),path=require('path'),vm=require('vm'),assert=require('assert/strict');
const {JSDOM}=require('jsdom');const root=path.resolve(__dirname,'..'),out=process.env.AUDIT833_OUT||path.join(root,'.uiprev/audit833-browser-research-probe-'+Date.now());fs.mkdirSync(out,{recursive:true});
const {BrowserNoteStore}=require(path.join(root,'src/browser-note-store'));
const {normalizeAnnotation}=require(path.join(root,'src/browser-learning'));
const main=fs.readFileSync(path.join(root,'src/main.js'),'utf8'),renderer=fs.readFileSync(path.join(root,'src/renderer/renderer.js'),'utf8');
const results=[];
async function scenario(name,{url,label='',tags=['normal']}={}){
 const dir=fs.mkdtempSync(path.join(out,'research-run-')),file=path.join(dir,'notes.json'),store=new BrowserNoteStore(file),handlers={};
 const mc=vm.createContext({ipcMain:{handle:(k,fn)=>handlers[k]=fn},authorizedBrowserSender:e=>e.authorized,normalizeAnnotation,ensureBrowserNotesReady:()=>store,watchIndex:()=>null,ensureIndexMediaForAnnotation:()=>{},Date});
 const a=main.indexOf("ipcMain.handle('browser:research:list'"),b=main.indexOf("ipcMain.handle('browser:research:review'",a);assert(a>=0&&b>a);vm.runInContext(main.slice(a,b),mc);
 const creation=await handlers['browser:research:upsert']({authorized:true},{id:'a',mediaId:'https://media.invalid/video',type:'note',source:'Synthetic source',note:'Before',links:[{label,url}],tags});assert.equal(creation.ok,true);assert.equal(creation.annotation.links.length,1);
 const dom=new JSDOM('<div id="playerLibraryList"></div><div id="playerLibraryStatus"></div>'),document=dom.window.document,notices=[];
 const ctx=vm.createContext({document,URL,$:id=>document.getElementById(id),playerLibraryView:'research',researchAnnotations:[],researchLoadSeq:0,uiText:s=>s,pSecToTime:String,historyWhen:String,osd:s=>notices.push(s),logLine:s=>notices.push(s),window:{UiLocale:{get:()=> 'tr'},api:{listResearchAnnotations:async(filters,limit)=>handlers['browser:research:list']({authorized:true},{filters,limit}),upsertResearchAnnotation:async raw=>handlers['browser:research:upsert']({authorized:true},raw)}}});
 const c=renderer.indexOf('function researchLibraryFilters()'),d=renderer.indexOf('// Kutuphane her yazim/arama',c);assert(c>=0&&d>c);vm.runInContext(renderer.slice(c,d),ctx);await ctx.loadResearchLibrary();
 const beforeText=document.querySelector('[data-research-field="links"]').value,beforeTags=document.querySelector('[data-research-field="tags"]').value;
 document.querySelector('[data-research-field="note"]').value='Edited note only';
 await ctx.handleResearchLibraryAction({target:document.querySelector('[data-research-action="save"]')});
 const after=new BrowserNoteStore(file).get('a');assert.equal(after.note,'Edited note only');
 assert.equal(after.links.length,1);assert.equal(after.links[0].url,url);assert.equal(after.links[0].label,label);
 assert.deepEqual(after.tags,tags);
 const parsed=ctx.researchLinksFromText('Changed | '+url);assert.equal(parsed[0].url,url);assert.equal(parsed[0].label,'Changed');
 document.querySelector('[data-research-field="links"]').value='bad link';document.querySelector('[data-research-field="note"]').value='Must not save';await ctx.handleResearchLibraryAction({target:document.querySelector('[data-research-action="save"]')});assert.equal(new BrowserNoteStore(file).get('a').note,'Edited note only');assert(notices.some(value=>value.includes('geçersiz')));
 results.push({name,created:creation.annotation,beforeText,beforeTags,after,notices,unauthorized:(await handlers['browser:research:upsert']({authorized:false},{id:'a',mediaId:'x'})).ok});dom.window.close();
}
(async()=>{await scenario('literal pipe in URL',{url:'https://evidence.invalid/chapter?select=a|b',label:'Source'});await scenario('encoded pipe in URL',{url:'https://evidence.invalid/chapter?select=a%7Cb',label:'Source'});await scenario('pipe in label safe control',{url:'https://evidence.invalid/chapter',label:'Source | Section'});await scenario('ordinary URL',{url:'https://evidence.invalid/chapter'});await scenario('comma inside accepted tag',{url:'https://evidence.invalid/chapter',tags:['one,two']});fs.writeFileSync(path.join(out,'fixed-research-result.json'),JSON.stringify({results,limits:'Real upsert/list handlers, real disk store and reload, current full research renderer functions with JSDOM. Authorized sender/index boundary adapters. No native UI, user profile or network.'},null,2));console.log(JSON.stringify({ok:true,scenarios:results.length}));})().catch(e=>{console.error(e);process.exitCode=1;});

