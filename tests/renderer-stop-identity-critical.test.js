'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),vm=require('node:vm'),{EventEmitter}=require('node:events'),{randomUUID}=require('node:crypto');
const {registerDubService}=require('../src/dub-service');
const tick=()=>new Promise(setImmediate);
for(const [file,button,active]of [['dub-generator-ui.js','dubGeneratorCancel','current'],['voice-reference-ui.js','voiceReferenceCancel','active'],['media-workflows-ui.js','bookStop','job'],['media-workflows-ui.js','bookClose','job']])for(const stale of [true,false])test(file+' '+button+(stale?' stale Stop preserves replacement':' current Stop cancels exact job')+' through preload and native handler',async t=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'stale-renderer-stop-'));t.after(()=>{assert(path.resolve(root).startsWith(path.resolve(os.tmpdir())+path.sep));fs.rmSync(root,{recursive:true,force:true});});
 const app=new EventEmitter();app.getPath=()=>root;const handlers=new Map(),held=new Map(),terminated=[];const sender=new EventEmitter();sender.id=7;sender.isDestroyed=()=>false;sender.send=()=>{};
 registerDubService({app,ipcMain:{handle:(name,fn)=>handlers.set(name,fn)},dialog:{},owner:()=>null,authorized:()=>true,busy:()=>false,grantMedia:()=>{},environment:()=>({}),terminate:async proc=>{terminated.push(proc.id);return true;},prepareReference:async options=>{
  const proc=new EventEmitter();proc.id=options.request.id;proc.exitCode=null;options.onProcess(proc);await new Promise(resolve=>held.set(proc.id,resolve));fs.writeFileSync(options.reference,require('./helpers/wav-fixture')());fs.writeFileSync(options.transcript,'Synthetic reference transcript.');options.onProcess(null);
 }});
 const call=(name,request)=>handlers.get(name)({sender},request),idA=randomUUID(),idB=randomUUID();await call('dub:references');const a=call('dub:referencePrepare',{id:idA,range:{start:5,end:15}});await tick();assert(held.has(idA));held.get(idA)();assert((await a).ok);
 const b=call('dub:referencePrepare',{id:idB,range:{start:5,end:15}});await tick();assert(held.has(idB));
 const preload=fs.readFileSync(require.resolve('../src/preload'),'utf8').split('\n').find(line=>line.trim().startsWith('cancelDub:'));
 const forwarded=vm.runInNewContext('({'+preload.trim()+'})',{ipcRenderer:{invoke:call}});let cancellation;
 const api={cancelDub:request=>(cancellation=forwarded.cancelDub(request))};
 const source=fs.readFileSync(path.join(__dirname,'../src/renderer',file),'utf8');
 let click,removed=false,saved=0;const control={addEventListener:(_,fn)=>click=fn},context={el:()=>control,status:()=>{},controls:()=>{},window:{api},api,stopping:false};const requested=stale?idA:idB;context[active]=active==='current'?{id:requested}:requested;
 if(button==='bookStop'){
  const start=source.indexOf('const stopButton = button(uiLabel("Stop", "Durdur")'),end=source.indexOf('    stopButton.dataset.bookStop',start);assert(start>=0&&end>start);
  Object.assign(context,{busy:true,stopRequested:false,syncBookStop:()=>{},uiLabel:en=>en,button:(_,fn)=>(click=fn,{}),call:()=>{throw Error('A voice job must use native exact cancellation');}});
  vm.runInNewContext(source.slice(start,end),context);
 }else if(button==='bookClose'){
  const start=source.indexOf('d.disposeWorkflow=d.onclose = () => {'),end=source.indexOf('\n    };',start)+7;assert(start>=0&&end>start);
  const d={querySelectorAll:()=>[],remove:()=>removed=true};Object.assign(context,{d,dialog:d,retired:false,bodyVersion:0,stopBookAssistant:null,stopTakePreview:null,stopReviewPreview:null,busy:true,stopRequested:false,syncBookStop:()=>{},closeReader:async()=>{},saveDraft:()=>saved++,syncBrowserOcclusion:()=>{},call:()=>{throw Error('A voice job must use native exact cancellation');}});
  vm.runInNewContext(source.slice(start,end),context);click=d.onclose;
 }else{
  const start=source.indexOf("el('"+button+"').addEventListener('click', async () => {"),end=source.indexOf('\n  });',start)+7;assert(start>=0&&end>start);
  vm.runInNewContext(source.slice(start,end),context);
 }
 let resultB;try{await click();await cancellation;if(button==='bookClose'){assert(removed);assert.equal(context.dialog,null);assert.equal(saved,1);click();assert.equal(saved,1);}
 assert.deepEqual(terminated,stale?[]:[idB],'Stop must reach only the exact renderer job');}
 finally{held.get(idB)();resultB=await b;}
 assert.equal(resultB.ok,stale);if(!stale)assert.equal(resultB.cancelled,true);
});
