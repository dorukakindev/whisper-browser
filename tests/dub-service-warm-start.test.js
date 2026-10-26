'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),{EventEmitter}=require('node:events'),{PassThrough}=require('node:stream');
const tick=()=>new Promise(r=>setImmediate(r));
test('default warm service cancellation waits for asynchronous host release and never sends cancelled argv',{timeout:5000},async(t)=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'warm-service602-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 const desktop=path.join(root,'Desktop'),engine=path.join(desktop,'Ses','VoxCPM2');fs.mkdirSync(path.join(engine,'.venv','Scripts'),{recursive:true});
 for(const file of ['kitap_ortak.py','.venv/Scripts/python.exe','.venv/Scripts/pythonw.exe'])fs.writeFileSync(path.join(engine,file),'fixture');
 fs.writeFileSync(path.join(engine,'anlatici_ham.wav'),require('./helpers/wav-fixture')(480));fs.writeFileSync(path.join(engine,'anlatici_ham.txt'),'Synthetic reference.');
 const srt=path.join(root,'fixture.srt');fs.writeFileSync(srt,'1\n00:00:00,000 --> 00:00:02,000\nMerhaba dünya.\n');
 const app=new EventEmitter();app.getPath=k=>k==='desktop'?desktop:root;const events=[],hosts=[],handlers={};let environment='A',stopped;
 const sender={id:7,isDestroyed:()=>false,send:(_,e)=>events.push(e)};
 const service=require('../src/dub-service').registerDubService({app,ipcMain:{handle:(n,f)=>handlers[n]=f},dialog:{},owner:()=>null,authorized:()=>true,authorizeSubtitle:async p=>p,busy:()=>false,grantMedia:()=>true,
 environment:()=>({PATH:'fixture',CUDA_VISIBLE_DEVICES:environment}),spawn:()=>{
 const h=Object.assign(new EventEmitter(),{pid:100+hosts.length,exitCode:null,signalCode:null,stdin:new PassThrough(),stdout:new PassThrough(),stderr:new PassThrough(),requests:[]});
 h.stdin.on('data',data=>h.requests.push(JSON.parse(String(data))));h.kill=()=>true;hosts.push(h);return h;},
 terminate:proc=>new Promise(resolve=>{stopped=()=>{proc.exitCode=1;proc.emit('close',1,null);resolve(true);};})});
 const call=(name,...args)=>handlers[name]({sender},...args);
 assert((await call('dub:start',{id:'first',srt,timingMode:'clip',verification:'fast'})).ok);await tick();
 const out=path.join(require('../src/voice-storage').voiceStorage(app).output,'first.wav');fs.writeFileSync(out,require('./helpers/wav-fixture')(480));
 hosts[0].stdout.write('DUB_WORKER_DONE '+JSON.stringify({id:hosts[0].requests[0].id,code:0})+'\n');const deadline=Date.now()+1000;while(!events.some(e=>e.id==='first'&&['done','error'].includes(e.type))&&Date.now()<deadline)await tick();assert(events.some(e=>e.id==='first'&&e.type==='done'),JSON.stringify(events));
 environment='B';const pending=call('dub:start',{id:'second',srt,timingMode:'clip',verification:'fast'});await tick();await tick();assert(stopped);
 let acknowledged=false;const cancelled=call('dub:cancel').then(r=>{acknowledged=true;return r;});await tick();assert.equal(acknowledged,false);
 stopped();const result=await pending;assert.equal(result.cancelled,true);assert((await cancelled).ok);assert.equal(hosts.length,1);
 assert.equal(events.filter(e=>e.id==='second'&&e.type==='cancelled').length,1);assert.equal(service.running(),false);
});
