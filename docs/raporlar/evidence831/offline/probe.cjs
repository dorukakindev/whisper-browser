'use strict';
const fs=require('fs'),path=require('path'),vm=require('vm'),assert=require('assert/strict'),{randomUUID}=require('crypto');
const repo=path.resolve(__dirname,'../../../..'), out=process.env.AUDIT831_OUT||path.join(repo,'.uiprev/audit831-offline-'+Date.now());fs.mkdirSync(out,{recursive:true});
const {BrowserReadingList}=require(path.join(repo,'src/browser-reading-list'));
const main=fs.readFileSync(path.join(repo,'src/main.js'),'utf8');
function fn(name){const start=main.search(new RegExp('^(?:async )?function '+name+'\\(','m'));assert(start>=0);return main.slice(start,main.indexOf('\n}',start)+2);}
function handlers(store,wc){const tab={id:'fixture',url:'https://fixture.example/article',title:'Sentetik yazı',generation:1,view:{webContents:wc}};const hs={};const ctx=vm.createContext({fs,path,randomUUID,browserReadingList:()=>store,authorizedBrowserSender:()=>true,activeRequestedBrowserTab:id=>id==='fixture'?tab:null,ipcMain:{handle:(name,h)=>hs[name]=h},ensureBrowserView:t=>t.view,applyBrowserViewBounds:()=>{},setBrowserViewShown:()=>{},browserModalOccluded:false,pathToFileURL:require('url').pathToFileURL,isAbortedBrowserNavigation:()=>false,browserLoadError:()=>({message:'load failed'})});
vm.runInContext(fn('saveBrowserPageToReadingList')+'\n'+main.slice(main.indexOf("ipcMain.handle('browser:readingList:add'"),main.indexOf('\nasync function saveBrowserPagePdf')),ctx);return {hs,tab};}
const output={head:'34b5747b5181db819443cf708185b5eebce754f9',scope:'real main handler source cuts + BrowserReadingList + real filesystem; controlled savePage/loadURL transport and injected index rename/unlink errors',checks:[]};
(async()=>{
// First-use directory: savePage adapter deliberately uses ordinary file-open semantics.
const firstDir=path.join(out,'first-use','OkumaListesi'),first=new BrowserReadingList(firstDir);let attempts=[];
const wc={isDestroyed:()=>false,savePage:async(p,format)=>{attempts.push({parentExists:fs.existsSync(path.dirname(p)),format});fs.writeFileSync(p,'SYNTHETIC MHTML');},loadURL:async()=>{}};
let {hs}=handlers(first,wc);let fresh=await hs['browser:readingList:add']({},{tabId:'fixture'});assert(!fresh.ok);assert.equal(first.list().length,0);assert.equal(attempts[0].parentExists,false);assert.match(fresh.error,/ENOENT/);
// Control: only initialize owned directory, leave same producer/consumer intact.
first.ensure();let initialized=await hs['browser:readingList:add']({},{tabId:'fixture'});assert(initialized.ok);assert.equal(first.list().length,1);assert.equal(attempts[1].parentExists,true);let opened=await hs['browser:readingList:open']({},{tabId:'fixture',id:initialized.entry.id});assert(opened.ok);
output.checks.push({id:'FIRST_USE_PARENT',freshResult:fresh,attempts,afterEnsureOk:initialized.ok,afterEnsureOpenOk:opened.ok,qualification:'Native Electron savePage not invoked; directory creation failure is demonstrated at actual main/store-to-file-transport boundary.'});
// Existing archive removal, failure at atomic index publication only.
function seeded(name){const dir=path.join(out,name);const base=new BrowserReadingList(dir);base.ensure();const plan=base.prepare({url:'https://fixture.example/article',title:'Korunan yazı'});fs.writeFileSync(plan.filePath,'ONLY GOOD ARCHIVE');assert(base.commit(plan.entry).ok);return {dir,base,plan};}
const x=seeded('remove-index-failure');const before=fs.readFileSync(x.base.indexPath,'utf8');let renameAttempts=0,indexLocked=true;
const io=new Proxy(fs,{get:(target,key)=>key==='renameSync'?((from,to)=>{if(indexLocked&&to===x.base.indexPath){renameAttempts++;throw Object.assign(new Error('fixture locked index'),{code:'EPERM'});}return fs.renameSync(from,to);}):target[key]});
const broken=new BrowserReadingList(x.dir,io);({hs}=handlers(broken,wc));let rejected='';try{await hs['browser:readingList:remove']({},{id:x.plan.entry.id});}catch(e){rejected=e.code+': '+e.message;}
assert.match(rejected,/EPERM/);assert.equal(renameAttempts,10);assert.equal(fs.readFileSync(x.base.indexPath,'utf8'),before);assert.equal(x.base.list().length,1);assert.equal(fs.existsSync(x.plan.filePath),false);assert.equal(x.base.get(x.plan.entry.id),null);assert.equal(fs.existsSync(x.base.indexPath+'.tmp'),false);
let unavailable=await hs['browser:readingList:open']({},{tabId:'fixture',id:x.plan.entry.id});assert(!unavailable.ok);
indexLocked=false; const retry=await hs['browser:readingList:remove']({},{id:x.plan.entry.id}); assert(retry.ok); assert.equal(broken.list().length,0);
const good=seeded('remove-success');({hs}=handlers(good.base,wc));const removed=await hs['browser:readingList:remove']({},{id:good.plan.entry.id});assert(removed.ok);assert.equal(good.base.list().length,0);assert(!fs.existsSync(good.plan.filePath));
const locked=seeded('remove-archive-locked');const lockedIo=new Proxy(fs,{get:(t,k)=>k==='unlinkSync'?(()=>{throw Object.assign(new Error('archive locked'),{code:'EPERM'});}):t[k]});const lockedStore=new BrowserReadingList(locked.dir,lockedIo);({hs}=handlers(lockedStore,wc));const preserved=await hs['browser:readingList:remove']({},{id:locked.plan.entry.id});assert(!preserved.ok);assert(fs.existsSync(locked.plan.filePath));assert(lockedStore.get(locked.plan.entry.id));
output.checks.push({id:'REMOVE_INDEX_FAILURE',rejected,renameAttempts,indexBytesUnchanged:true,indexRows:1,archiveExists:false,openResult:unavailable,retryAfterUnlock:{ok:retry.ok,rows:broken.list().length},normalRemoveOk:removed.ok,archiveUnlinkFailurePreserved:true,qualification:'Index rename lock is injected; actual Windows locking/AV not reproduced. Real unlink, write, fsync and store/main consumers run.'});
fs.writeFileSync(path.join(out,'result.json'),JSON.stringify(output,null,2)+'\n');console.log(JSON.stringify({out,checks:output.checks},null,2));
})().catch(e=>{console.error(e);process.exitCode=1});
