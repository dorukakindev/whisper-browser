'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
const manifest=require('../src/assistant-context-manifest'),caps=require('../src/assistant-capabilities');
const defer=()=>{let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve};};
const tick=()=>new Promise(setImmediate);
function app(){
 const tab={id:'A',generation:1},player={workspaceMode:'browser',browserPageUrl:'https://fixture.example/article',browserPageTitle:'Article',browserTime:0,browserTracks:[],cues:[]},stops=[];
 const c={window:{AssistantContextManifest:manifest,AssistantCapabilities:{get:caps.get,validate:(n,a,o)=>caps.validate(n,JSON.parse(JSON.stringify(a)),o)},UiLocale:{get:()=> 'en'},AssistantWorkspace:{activeId:()=> 'thread',toolContext:()=>({rows:[]})},AssistantSourceContext:{pageKey:url=>url},api:{cancelAssistantJob:async r=>{stops.push(r.id);return {ok:true};}}},document:{getElementById:()=>null},player,state:{},globalAssistantContext:()=>null,browserTabState:()=>tab,currentBrowserYoutubeUrl:()=>'',aiSourceScope:()=>player.browserPageUrl,currentBrowserWhisperRange:()=>null,logLine:()=>{}};
 vm.createContext(c);vm.runInContext(fs.readFileSync(require.resolve('../src/renderer/assistant-app-actions'),'utf8'),c);return {c,player,actions:c.window.AssistantAppActions,stops};
}
test('page translation preparation failure cannot yield an accepted assistant receipt',async()=>{
 const h=app();h.c.handleBrowserPageTranslationAction=async()=>({ok:false,error:'Settings could not be saved.'});
 await assert.rejects(h.actions.execute('translate_page',{},h.actions.snapshot()),/Settings could not be saved/);
});
test('page receipt waits for actual acceptance and carries the exact main job ID',async()=>{
 const h=app(),gate=defer();let input,settled=false;h.c.handleBrowserPageTranslationAction=r=>{input=r;return gate.promise;};
 const run=h.actions.execute('translate_page',{target_language:'tr'},h.actions.snapshot()).finally(()=>settled=true);await tick();assert.equal(settled,false);assert.equal(input.waitForAcceptance,true);
 gate.resolve({ok:true,accepted:true,jobId:'main-exact'});const result=await run;assert.equal(result.status,'accepted');assert.equal(result.jobId,'main-exact');
});
test('showing an existing translation is a completed display action rather than a newly started job',async()=>{
 const h=app();h.c.handleBrowserPageTranslationAction=async()=>({ok:true,shown:true});const result=await h.actions.execute('translate_page',{},h.actions.snapshot());assert.equal(result.status,'completed');assert.equal(result.jobId,undefined);
});
test('a newly accepted stale page action stops only its own job, not an existing reused job',async()=>{
 for(const running of [false,true]){
  const h=app(),gate=defer();h.c.handleBrowserPageTranslationAction=()=>gate.promise;
  const run=h.actions.execute('translate_page',{},h.actions.snapshot());h.player.browserPageUrl+='-next';gate.resolve({ok:true,accepted:true,running,jobId:'exact-old'});
  await assert.rejects(run,/changed/);assert.deepEqual(h.stops,running?[]:['exact-old']);
 }
});
function main(start){
 const source=fs.readFileSync(require.resolve('../src/main'),'utf8').replace(/\r\n/g,'\n');const a=source.indexOf("ipcMain.handle('browser:page:start'");const b=source.indexOf("ipcMain.handle('browser:page:preview'",a);
 const tab={id:'a',generation:1},events=[];const c={Promise,authorizedBrowserSender:e=>e.allowed,activeRequestedBrowserTab:()=>tab,startBrowserPageTranslation:start,sendBrowserEvent:(_t,e)=>events.push(e),ipcMain:{handle:(_n,fn)=>c.handler=fn}};vm.createContext(c);vm.runInContext(source.slice(a,b),c);return {c,tab,events};
}
test('main page API can acknowledge its registered job without waiting for the final translation',async()=>{
 const terminal=defer();const h=main((_tab,opts)=>{opts.onAccepted?.('ledger-exact');return terminal.promise;});let result;
 const call=h.c.handler({allowed:true},{waitForAcceptance:true}).then(r=>result=r);await tick();
 try{assert.equal(result?.accepted,true);assert.equal(result.jobId,'ledger-exact');}finally{terminal.resolve({ok:true,translated:7});await call;}
});
test('main acceptance returns early rejection and never reuses a different target language',async()=>{
 const h=main(async()=>({ok:false,error:'No credential configured.'}));const rejected=await h.c.handler({allowed:true},{waitForAcceptance:true});assert.equal(rejected.ok,false);
 h.tab.pageTranslateJob={assistantJobId:'existing',session:{config:{targetLanguage:'tr'}}};
 const same=await h.c.handler({allowed:true},{waitForAcceptance:true,targetLanguage:'tr'});assert.equal(same.ok,true);assert.equal(same.jobId,'existing');assert.equal(same.running,true);
 assert.equal((await h.c.handler({allowed:true},{waitForAcceptance:true,targetLanguage:'de'})).ok,false);
 assert.equal((await h.c.handler({allowed:false},{waitForAcceptance:true})).ok,false);
});
test('unchanged but incomplete page evidence cannot advance a completed assistant action',async()=>{
 const h=app();h.c.handleBrowserPageTranslationAction=async()=>({ok:true,unchanged:true,completion:{pending:2}});
 await assert.rejects(h.actions.execute('translate_page',{},h.actions.snapshot()),/acceptance.*verified/i);
});
test('the application resolver recognizes a real direct ledger ID, existing backend links and no invented IDs',()=>{
 const source=fs.readFileSync(require.resolve('../src/main'),'utf8');const a=source.indexOf('function resolveAssistantJobId('),b=source.indexOf('\n',a);
 const jobs=require('../src/assistant-jobs').createJobs(),id=jobs.start({kind:'page-translation',cancel:async()=>({ok:true})});
 const c={assistantJobLinks:new Map([['backend',id]]),assistantJobs:jobs};vm.createContext(c);vm.runInContext(source.slice(a,b),c);
 assert.equal(c.resolveAssistantJobId(id),id);assert.equal(c.resolveAssistantJobId('backend'),id);assert.equal(c.resolveAssistantJobId('invented'),null);
 const flows=require('../src/assistant-flows').createFlows({getJobs:jobs.snapshot}),flow=flows.start('sender',{owner:'owner',thread:'thread',kind:'page'},'Translate and continue');
 const receipt=flows.record(flow,'translate_page',{}, {status:'accepted',jobId:id},c.resolveAssistantJobId(id));assert.equal(receipt.continuationJobId,id);assert.equal(receipt.continuationState,'waiting');
 assert.equal(flows.resume(receipt.continuationId,'sender',flow.owner).waiting,true);jobs.update(id,{type:'done'});assert(flows.resume(receipt.continuationId,'sender',flow.owner).flow);
});
