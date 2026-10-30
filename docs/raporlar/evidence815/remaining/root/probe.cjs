'use strict';
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const root=process.cwd(),base=path.resolve(process.env.R815_REMAIN_ROOT_OUT||'.tmp/rem815-root/runs');fs.mkdirSync(base,{recursive:true});const out=fs.mkdtempSync(path.join(base,'run-'));
const {BrowserNoteStore}=require(path.join(root,'src/browser-note-store'));
const {researchAnnotationsToMarkdown}=require(path.join(root,'src/browser-research-notebook'));
const {atomicWriteFileSync}=require(path.join(root,'src/fsync-utils'));
const main=fs.readFileSync(path.join(root,'src/main.js'),'utf8');
const start=main.indexOf("ipcMain.handle('browser:research:export',"),end=main.indexOf('function runAnkiExport(',start);assert(start>=0&&end>start);
function fixture(label,count){const dir=path.join(out,label);fs.mkdirSync(dir,{recursive:true});const file=path.join(dir,'notes.json');
 const annotations=Array.from({length:count},(_,i)=>({id:'fixture-note-'+i,mediaId:'fixture:video',type:'note',source:'UNIQUE_RESEARCH_'+String(i).padStart(5,'0'),note:'Synthetic note',mediaTitle:'Fixture video',start:i,createdAt:i+1,updatedAt:i+1}));
 fs.writeFileSync(file,JSON.stringify({version:1,annotations}));const store=new BrowserNoteStore(file);assert.equal(store.list().length,count);assert.equal(store.loadError,'');return {store,dir,annotations};}
async function exportFixture(f){let handler;const target=path.join(f.dir,'notebook.md');
 vm.runInNewContext(main.slice(start,end),{ipcMain:{handle:(_n,fn)=>handler=fn},authorizedBrowserSender:()=>true,ensureBrowserNotesReady:()=>f.store,dialog:{showSaveDialog:async()=>({canceled:false,filePath:target})},mainWindow:null,dt:(_tr,en)=>en,path,app:{getPath:()=>f.dir},writeTextAtomic:atomicWriteFileSync,researchAnnotationsToMarkdown});
 const response=await handler({}, {filters:{query:'UNIQUE_RESEARCH_'}});assert.equal(response.ok,true);const markdown=fs.readFileSync(target,'utf8'),plainMarkers=markdown.replace(/\\_/g,'_');return {response,exportedRows:(markdown.match(/^## /gm)||[]).length,oldestPresent:plainMarkers.includes('UNIQUE_RESEARCH_00000'),newestPresent:plainMarkers.includes('UNIQUE_RESEARCH_'+String(f.annotations.length-1).padStart(5,'0')),partialField:Object.keys(response).filter(k=>/partial|trunc|total|limit|warning/i.test(k)),markdownBytes:Buffer.byteLength(markdown)};}
(async()=>{
 const over=fixture('over-limit',5001),control=fixture('control',3);const observed=await exportFixture(over),small=await exportFixture(control);
 assert.equal(observed.exportedRows,5000);assert.equal(observed.oldestPresent,false);assert.equal(observed.newestPresent,true);assert.deepEqual(observed.partialField,[]);assert.equal(small.exportedRows,3);assert(small.oldestPresent&&small.newestPresent);
 const direct=researchAnnotationsToMarkdown(over.store.list());assert.equal((direct.match(/^## /gm)||[]).length,5001);
 const searchFixture=fixture('search-case',1);searchFixture.store.upsert({id:'fixture-note-0',mediaId:'fixture:video',source:'Important context'});
 let listHandler;const listStart=main.indexOf("ipcMain.handle('browser:research:list',"),listEnd=main.indexOf("ipcMain.handle('browser:research:upsert',",listStart);
 vm.runInNewContext(main.slice(listStart,listEnd),{ipcMain:{handle:(_n,f)=>listHandler=f},authorizedBrowserSender:()=>true,ensureBrowserNotesReady:()=>searchFixture.store});
 const renderer=fs.readFileSync(path.join(root,'src/renderer/renderer.js'),'utf8'),filterStart=renderer.indexOf('function researchLibraryFilters()'),filterEnd=renderer.indexOf('function researchTypeLabel(',filterStart);
 const controls={researchQuery:{value:'important'},researchTag:{value:''},researchType:{value:'all'},researchStatus:{value:'all'}};
 const filterContext=vm.createContext({$:id=>controls[id],playerLibraryView:'research'});vm.runInContext(renderer.slice(filterStart,filterEnd),filterContext);
 const requestFilters=vm.runInContext('researchLibraryFilters()',filterContext),lower=await listHandler({}, {filters:requestFilters});assert.equal(lower.ok,true);assert.equal(lower.annotations.length,0);
 controls.researchQuery.value='Important';const exactCase=await listHandler({}, {filters:vm.runInContext('researchLibraryFilters()',filterContext)});assert.equal(exactCase.annotations.length,1);
 controls.researchQuery.value='context';const noI=await listHandler({}, {filters:vm.runInContext('researchLibraryFilters()',filterContext)});assert.equal(noI.annotations.length,1);
 const commonSearch=searchFixture.store.search('important');assert.equal(commonSearch.length,1);
 const files=['src/main.js','src/browser-note-store.js','src/browser-research-notebook.js','src/browser-learning.js','src/renderer/renderer.js','src/renderer/index.html','src/preload.js'];
 const result={head:process.env.R815_REMAIN_HEAD||'df94b3d60b7123a682cd0062371bbb2850a5fb60',sourceSha256:Object.fromEntries(files.map(f=>[f,crypto.createHash('sha256').update(fs.readFileSync(path.join(root,f))).digest('hex')])),acceptedStoreCount:over.store.list().length,overLimit:observed,smallControl:small,directFormatterControlRows:5001,searchCase:{source:'Important context',uiQuery:requestFilters.query,lowercaseResults:lower.annotations.length,sameCaseControl:exactCase.annotations.length,noIControl:noI.annotations.length,commonStoreSearchControl:commonSearch.length},limits:'Actual BrowserNoteStore load/filter/search, unchanged IPC, renderer filter builder and Markdown formatter, real atomic file write; native SaveDialog/auth/DOM input boundary controlled. Only synthetic notes inside mkdtemp fixture, no personal notebook or profile.'};
 // Publish summary without machine-specific fixture output paths.
 for(const row of [result.overLimit,result.smallControl])delete row.response.path;
 fs.writeFileSync(path.join(out,'results.json'),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify({out,accepted:5001,exported:observed.exportedRows,oldestPresent:observed.oldestPresent,smallControl:small.exportedRows}));
})().catch(e=>{console.error(e);process.exitCode=1;});
