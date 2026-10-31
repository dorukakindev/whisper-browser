'use strict';
const fs=require('fs'),path=require('path'),vm=require('vm'),assert=require('assert/strict');
const root=path.resolve(__dirname,'..'),main=fs.readFileSync(path.join(root,'src/main.js'),'utf8'),renderer=fs.readFileSync(path.join(root,'src/renderer/renderer.js'),'utf8'),preload=fs.readFileSync(path.join(root,'src/preload.js'),'utf8');
const slice=(s,start,end)=>{const a=s.indexOf(start),b=s.indexOf(end,a);assert(a>=0&&b>a);return s.slice(a,b)};
const handlers=new Map(),effects=[],logs=[],calls=[];
const tabA={id:'tab-A',generation:1},tabB={id:'tab-B',generation:1};
const tabs=new Map([[tabA.id,tabA],[tabB.id,tabB]]);
const m={browserTabs:tabs,browserActiveTabId:tabA.id,browserNetworkOnline:true,browserHlsCeaFullCaptureJob:null,browserRecoveryJobsForTab:()=>[],browserTabSnapshot:t=>({title:t.id}),browserDownloads:{snapshot:()=>({items:[]})},browserTabById:id=>tabs.get(id),authorizedBrowserSender:e=>e.allowed,assistantJobs:{update:()=>{}},stopBrowserManga:async t=>{effects.push('manga:'+t.id);t.mangaJob=null},stopBrowserPageTranslation:async t=>{effects.push('page:'+t.id);t.pageTranslateJob=null},sendBrowserEvent:()=>{},ipcMain:{handle:(n,f)=>handlers.set(n,f)}};
vm.createContext(m);
vm.runInContext(slice(main,'function browserUnifiedJobsSnapshot()','function browserTabSnapshot(')+slice(main,'function activeRequestedBrowserTab(','ipcMain.handle(\'browser:tab:create\''),m);
for(const [a,b] of [["ipcMain.handle('browser:translation:stop'","ipcMain.handle('browser:translation:completeAll'"],["ipcMain.handle('browser:manga:clear'","ipcMain.handle('browser:manga:retrySelected'"],["ipcMain.handle('browser:page:clear'","ipcMain.handle('browser:page:retryFailed'"]])vm.runInContext(slice(main,a,b),m);
const api={};const ipcRenderer={invoke:async(n,p)=>{calls.push({channel:n,tabId:p.tabId});return handlers.get(n)({allowed:true},p)}};
for(const method of ['stopBrowserTranslation','clearBrowserManga','clearBrowserPageTranslation']){const line=preload.split('\n').find(l=>l.trim().startsWith(method+':'));assert(line);Object.assign(api,vm.runInNewContext('({'+line.trim()+'})',{ipcRenderer}));}
const r={window:{api},PlayerTaskCenterModel:require(path.join(root,'src/player-task-center')),playerTaskActionBusy:new Set(),updatePlayerTaskCenter:()=>{},refreshBrowserUnifiedJobs:async()=>{},renderBrowserRecoveryList:()=>{},logLine:(message,level)=>logs.push({message,level})};vm.createContext(r);vm.runInContext(slice(renderer,'async function runBrowserTaskAction(','function updatePlayerTaskCenter('),r);
function seed(){tabB.translationScheduler={recoverySummary:()=>({completed:2,total:10,pending:1}),cancelAll:()=>effects.push('subtitle:'+tabB.id)};tabB.mangaJob={controller:{signal:{aborted:false}}};tabB.pageTranslateJob={};}
(async()=>{const results=[];for(const active of [tabA.id,tabB.id]){m.browserActiveTabId=active;seed();for(const kind of ['subtitle-translation','page-translation','manga']){const job=m.browserUnifiedJobsSnapshot().find(j=>j.kind===kind&&j.tabId===tabB.id);assert(job);const row=r.browserTaskRow(job);const stop=row.actions.find(a=>a.kind==='stop');assert(stop);const before=effects.length,logBefore=logs.length;await stop.run();const outcome={activeTab:active,targetTab:job.tabId,kind,button:stop.label,consumerCalled:effects.length>before,warning:logs.slice(logBefore)};results.push(outcome);assert.equal(outcome.consumerCalled,true);assert.equal(m.browserActiveTabId,active);}}
for(const channel of ['browser:translation:stop','browser:manga:clear','browser:page:clear']) {
 const before=effects.length;
 assert.equal((await handlers.get(channel)({allowed:false},{tabId:tabB.id})).ok,false);
 assert.equal((await handlers.get(channel)({allowed:true},{tabId:'closed-tab'})).ok,false);
 assert.equal(effects.length,before);
}
console.log('Background job cancellation: six real producer/preload/IPC flows plus authorization/closed-tab controls passed');
})().catch(e=>{console.error(e);process.exitCode=1});
