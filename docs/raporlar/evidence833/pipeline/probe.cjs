'use strict';
const fs=require('fs'),path=require('path'),vm=require('vm'),assert=require('assert');
const {JSDOM}=require('jsdom');
let root=path.resolve(process.env.AUDIT833_ROOT||__dirname);
while(!fs.existsSync(path.join(root,'src','main.js'))){const parent=path.dirname(root);if(parent===root)throw Error('Repository root not found; set AUDIT833_ROOT');root=parent;}
const out=path.resolve(process.env.AUDIT833_OUT||path.join(root,'.uiprev/audit833-pipeline-probe-'+Date.now()));fs.mkdirSync(out,{recursive:true});
const read=p=>fs.readFileSync(path.join(root,p),'utf8').replace(/\r\n/g,'\n');
const src=read('src/renderer/renderer.js'),helpers=read('src/renderer/renderer-helpers.js');
const registry=JSON.parse(read('docs/audits/deepseek-night1000-20261027/COVERAGE-REGISTRY.json'));
const families=['F16','F17','F18','F19','F49','F50'];
fs.writeFileSync(path.join(out,'registry-reviewed.json'),JSON.stringify({purpose:'Historical signatures reviewed, not new scenarios or current PASS claims',families,rows:registry.scenarios.filter(x=>families.includes(x.family))},null,2));
function fn(s,n){let a=s.indexOf('async function '+n+'(');if(a<0)a=s.indexOf('function '+n+'(');assert(a>=0,n);let end=s.indexOf('\n}\n',a);assert(end>=0,n+'end');return s.slice(a,end+3);}
function env(){
 const dom=new JSDOM(read('src/renderer/index.html'),{url:'https://fixture.invalid'}),doc=dom.window.document;
 dom.window.HTMLElement.prototype.scrollIntoView=function(){};
 const state={queue:[],queueRunning:false,running:false,currentQueueId:null,source:'youtube',inputFile:null,inputDir:null,outputDir:'D:\\output',nextYoutubeAudioLang:''};
 const calls={logs:[],saves:[],starts:[],validation:[],resetAudioTracks:0};let timers=[];
 const c={state,document:doc,window:{api:{saveQueueState:async payload=>{calls.saves.push(JSON.parse(JSON.stringify(payload)));return {ok:true}}},WhisperAssistantSettings:{MODEL:'synthetic-model'}},
 _queueIdCounter:0,_queueRejectReason:'',_queuePersistenceReady:true,_queuePersistTimer:null,_queueNextTimer:null,_validationTargetId:'',queuePersistLastError:'',QUEUE_UI_LIMIT:500,STATUS_TEXT:{pending:'Bekliyor',running:'İşleniyor',done:'Tamamlandı',error:'Hata'},
 $:id=>doc.getElementById(id),$$:s=>doc.querySelectorAll(s),escapeHtml:x=>String(x??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'),
 mediaKeyFor:(t,i)=>t+':'+i,queueOutputNameSuffix:require(path.join(root,'src/renderer/queue-lifecycle')).queueOutputNameSuffix,
 glossaryCombined:()=>[],setJobsTab:()=>{},syncJobsCenter:()=>{},logLine:(message,level)=>calls.logs.push({message,level}),
 setTimeout:(f,ms)=>{const t={f,ms};timers.push(t);return t},clearTimeout:t=>{timers=timers.filter(x=>x!==t)},
 resetAudioTracks:()=>calls.resetAudioTracks++,dropZone:doc.getElementById('dropZone'),
 console,URL,Math,Date,Number,String,Array,Object,JSON,Promise,parseInt,parseFloat,
 };
 c.globalThis=c; vm.createContext(c);
 for(const n of ['queueInputKey','computeQueueCollisionSuffix','addToQueue','renderQueue','queueSnapshotPayload','persistQueueNow','buildOptsFromUI','resolveNetBudgetPreset','optsProblemInfo','parseClipInput','translationEndpointReady','clearJobValidation','showJobValidation'])vm.runInContext(fn(src,n),c);
 for(const n of ['removeFromQueue','moveQueueItem','queueItemMeta','scheduleQueuePersist'])vm.runInContext(fn(helpers,n),c);
 const a=src.indexOf("$('queueAddBtn').addEventListener('click', () => {");const b=src.indexOf("\n$('clearQueue').addEventListener",a);assert(a>=0&&b>a);vm.runInContext(src.slice(a,b),c);
 c.startQueue=()=>calls.starts.push('startQueue');
 c.flush=async()=>{while(timers.length){const batch=timers;timers=[];for(const t of batch)await t.f();}};
 c.calls=calls;c.dom=dom;return c;
}
const result={head:process.env.AUDIT833_HEAD||'1b211e4ed37f622dcc3e2144517590ae7aff9cee',baselineHead:'08bccd48fb830046662397f764f06949886308d4',baselineProductRevision:'ba04414f9289e6e61a51070bcf15e8e693e64b6c',node:process.version,scenarios:[]};
async function reorder(){const c=env();for(const name of ['Bir','İki','Üç'])assert(c.addToQueue('file','D:\\fixtures\\'+name+'.mp4'));await c.flush();
 const before=c.state.queue.map(x=>x.id);c.document.querySelector('.queue-move[data-id="2"][data-move="-1"]').click();await c.flush();
 const after=c.state.queue.map(x=>x.id),persisted=c.calls.saves.at(-1).items.map(x=>x.id);
 assert.deepStrictEqual(before,[1,2,3]);assert.deepStrictEqual(after,[1,3]);assert.deepStrictEqual(persisted,[1,3]);
 const control=env();for(const name of ['Bir','İki','Üç'])control.addToQueue('file','D:\\fixtures\\'+name+'.mp4');control.moveQueueItem(2,-1);assert.deepStrictEqual(control.state.queue.map(x=>x.id),[2,1,3]);
 const remove=env();for(const name of ['Bir','İki'])remove.addToQueue('file','D:\\fixtures\\'+name+'.mp4');remove.document.querySelector('.queue-remove[data-id="2"]:not(.queue-move)').click();assert.deepStrictEqual(remove.state.queue.map(x=>x.id),[1]);
 result.scenarios.push({id:'PIPE-01',before,expectedAfter:[2,1,3],observedAfter:after,persisted,controls:{directMove:[2,1,3],explicitRemove:[1]},verdict:'BUG: move click removes item before move listener'});}
async function rejectedAdd(source){const c=env();c.state.source=source;c.document.getElementById('clipStart').value='10';c.document.getElementById('clipEnd').value='5';
 const original=source==='youtube'?'https://www.youtube.com/watch?v=synthetic01':'D:\\fixtures\\Seçili Türkçe.mp4';
 if(source==='youtube')c.document.getElementById('youtubeUrl').value=original;else{c.state.inputFile=original;c.document.getElementById('fileInfo').classList.remove('hidden');c.dropZone.classList.add('hidden');}
 c.document.getElementById('queueAddBtn').click();await c.flush();
 const remaining=source==='youtube'?c.document.getElementById('youtubeUrl').value:c.state.inputFile;
 assert.strictEqual(c.state.queue.length,0);assert(!remaining);assert(c.calls.logs.some(x=>x.message.startsWith('Kuyruğa eklenmedi')));assert(c.calls.logs.some(x=>x.message.startsWith('+ Kuyruğa eklendi')));
 assert.strictEqual(c.document.getElementById('clipEnd').getAttribute('aria-invalid'),'true');
 // Correcting the invalid field still cannot submit original source without reentry/reselection.
 c.document.getElementById('clipEnd').value='15';c.document.getElementById('queueAddBtn').click();assert.strictEqual(c.state.queue.length,0);
 result.scenarios.push({id:'PIPE-02-'+source,source,queueLength:0,originalSelectionCleared:!remaining,falseSuccess:c.calls.logs.find(x=>x.message.startsWith('+ Kuyruğa eklendi')).message,validationTarget:'clipEnd',correctedRetryQueueLength:0,resetAudioTracks:c.calls.resetAudioTracks,logs:c.calls.logs,verdict:'BUG: rejected add clears source and reports success'});}
async function acceptedAdd(){const c=env();c.document.getElementById('youtubeUrl').value='https://www.youtube.com/watch?v=synthetic02';c.document.getElementById('queueAddBtn').click();await c.flush();assert.strictEqual(c.state.queue.length,1);assert.strictEqual(c.document.getElementById('youtubeUrl').value,'');assert.strictEqual(c.calls.saves.at(-1).items.length,1);result.scenarios.push({id:'PIPE-CONTROL',acceptedQueueLength:1,persistedItems:1,selectionCleared:true});}
async function failedQueueCache(){
 const c=env(),api=require(path.join(root,'src/renderer/queue-lifecycle'));
 const main=read('src/main.js'),start=main.indexOf("ipcMain.handle('transcribe:start',"),end=main.indexOf('\n});',start)+4;
 let mainHandler,mainResult,cacheClears=0;
 const mc={ipcMain:{handle:(name,handler)=>mainHandler=handler},authorizedBrowserSender:()=>true,app:{getPath:()=> 'D:\\synthetic-downloads'},loadSettings:()=>({}),
 defaultMediaFolders:require(path.join(root,'src/media-folders')).defaultMediaFolders,sanitizeAbsolutePath:require(path.join(root,'src/settings-security')).sanitizeAbsolutePath,
 decideUrlPolicy:require(path.join(root,'src/browser-navigation-policy')).decideUrlPolicy,
 dubWorkspace:{running:()=>false},dubService:{running:()=>false,releaseIdle:async()=>{}},activeJob:null,jobStarting:false,burninJob:null,burninStartPending:false,browserLiveAsr:null,modelBenchmarkJob:null,modelProcesses:new Set(),jobStartSeq:0};
 vm.runInNewContext(main.slice(start,end),mc);
 Object.assign(c,{createJobId:api.createJobId,snapshotQueueOptions:api.snapshotOptions,estimateVramMib:()=>0,updateSignalDesk:()=>{},updatePlayerTaskCenter:()=>{},resetStages:()=>{},clearPreview:()=>{},setProgress:()=>{},setStatus:()=>{},updateStopAfterBtn:()=>{},offerOpenLastOutput:()=>{},notifyDone:()=>{},friendlySystemError:x=>String(x),currentGeneration:()=>1,player:{subPath:'',sub2Path:''},interfaceChoice:(tr,en)=>en,JobTimingHelpers:require(path.join(root,'src/job-timing-helpers'))});
 c.window.JobSummary=require(path.join(root,'src/renderer/job-summary'));
 c.window.api.startTranscribe=async opts=>{mainResult=await mainHandler({},opts);return mainResult;};
 c.window.api.cacheStats=async()=>({ok:true,stats:{models:{bytes:1},tmp:{bytes:1}}});
 c.window.api.cacheClear=async()=>{cacheClears++;return {ok:true,freedBytes:1};};
 for(const name of ['startTranscribeSafe','queueSecretsFromCurrentUi','processNextQueueItem','reportWatchQueueResult','finalizeQueue','renderCacheStats','runCacheClear','finishRun'])vm.runInContext(fn(src,name),c);
 vm.runInContext(fn(helpers,'startQueue'),c);
 // Real user source entry, add callback and queue start callback. Main rejects a non-http URL before any worker exists.
 c.document.getElementById('youtubeUrl').value='file:///D:/fixtures/Video.mp4';
 c.document.getElementById('queueAddBtn').click();await c.flush();assert.strictEqual(c.state.queue.length,1);
 vm.runInContext("$('startQueueBtn').addEventListener('click',startQueue);",c);c.document.getElementById('startQueueBtn').click();
 await new Promise(setImmediate);await c.flush();await new Promise(setImmediate);await c.flush();
 assert.strictEqual(mainResult.ok,false);assert.match(mainResult.error,/http\/https/);
 assert.strictEqual(c.state.queue[0].status,'error');assert.strictEqual(c.state.queueRunning,false);assert.strictEqual(c.state.running,false);assert.strictEqual(c.state.activeJobId,null);
 assert(c.state.activeOutputJob);await c.renderCacheStats();
 const disabledBefore=[...c.document.querySelectorAll('[data-cache-kind]')].filter(x=>x.disabled).map(x=>x.dataset.cacheKind);
 assert(disabledBefore.includes('models')&&disabledBefore.includes('tmp'));
 await c.runCacheClear('tmp');assert.strictEqual(cacheClears,0);
 // The normal single-job failure cleanup is an unchanged existing control that releases this stale owner.
 c.finishRun(false);await c.renderCacheStats();await c.runCacheClear('tmp');assert.strictEqual(cacheClears,1);
 result.scenarios.push({id:'PIPE-03',mainRejection:mainResult.error,queueStatus:'error',queueRunning:false,running:false,activeJobId:null,staleActiveOutputJob:true,disabledCacheKinds:disabledBefore,cacheCallsBeforeCleanup:0,cacheCallsAfterExistingFinishRunControl:1,verdict:'BUG: failed queue leaves stale output owner and blocks model/tmp cache controls'});
}
(async()=>{await reorder();await rejectedAdd('youtube');await rejectedAdd('file');await acceptedAdd();await failedQueueCache();fs.writeFileSync(path.join(out,'result.json'),JSON.stringify(result,null,2));console.log(JSON.stringify({ok:true,scenarios:result.scenarios.map(x=>({id:x.id,verdict:x.verdict||'control pass'})),out},null,2));})().catch(e=>{console.error(e);process.exitCode=1;});
