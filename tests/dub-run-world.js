'use strict';
// Shared fixture: the real registerDubService with a fake worker process over one userData folder (boot() twice = a restart).
const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),{EventEmitter}=require('node:events'),{createHash}=require('node:crypto');
const {registerDubService}=require('../src/dub-service'),{voiceStorage}=require('../src/voice-storage'),{createRunLedger}=require('../src/dub-run-ledger');
const sha=value=>createHash('sha256').update(value).digest('hex');
function wav(seconds=1){const data=Buffer.alloc(24000*2*seconds),head=Buffer.alloc(44);head.write('RIFF');head.writeUInt32LE(36+data.length,4);head.write('WAVEfmt ',8);head.writeUInt32LE(16,16);head.writeUInt16LE(1,20);head.writeUInt16LE(1,22);head.writeUInt32LE(24000,24);head.writeUInt32LE(48000,28);head.writeUInt16LE(2,32);head.writeUInt16LE(16,34);head.write('data',36);head.writeUInt32LE(data.length,40);return Buffer.concat([head,data]);}
function world(){
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'dub-recovery-')),desktop=path.join(root,'desktop'),engine=path.join(desktop,'Ses','VoxCPM2');
 fs.mkdirSync(path.join(engine,'.venv','Scripts'),{recursive:true});
 for(const name of ['altyazi_oku.py','kitap_ortak.py','arayuz.py','anlatici_ham.wav','anlatici_ham.txt','.venv/Scripts/python.exe','.venv/Scripts/pythonw.exe'])fs.writeFileSync(path.join(engine,name),'fixture');
 fs.writeFileSync(path.join(root,'dub-settings.json'),JSON.stringify({timingMode:'clip',keepEngine:false}));
 const srt=path.join(root,'Türkçe.srt');fs.writeFileSync(srt,'fixture');
 const app=new EventEmitter();app.getPath=name=>name==='desktop'?desktop:root;
 const spawns=[];
 function boot(){
  const handlers={},events=[],listeners=new Set(),sender={id:7,isDestroyed:()=>false,send:(_c,e)=>{events.push(e);for(const listener of [...listeners])listener(e);}};let child=null;
  const service=registerDubService({app,ipcMain:{handle:(name,fn)=>handlers[name]=fn},dialog:{},owner:()=>null,authorized:()=>true,authorizeSubtitle:async p=>{assert.equal(p,srt,'only the user\'s own SRT is ever authorized through the picker');return p;},
   busy:()=>false,grantMedia:()=>{},environment:()=>({PATH:'x'}),translateGroup:async()=>'',shorten:async()=>'',resolveSourceContext:async()=>({groups:[]}),setRate:async()=>({ok:true}),prepareProsody:async()=>{},prepareBackground:async()=>{},
   spawn:(exe,args,opts)=>{const proc=new EventEmitter();proc.exitCode=null;proc.stdout=new EventEmitter();proc.stderr=new EventEmitter();proc.stdout.setEncoding=proc.stderr.setEncoding=proc.stderr.resume=()=>{};
    spawns.push({args,proc});child=proc;queueMicrotask(()=>proc.emit('spawn'));return proc;},terminate:()=>true});
  const call=(name,request)=>handlers[name]({sender},request);
  return {service,call,handlers,events,child:()=>child,on:listener=>{listeners.add(listener);return ()=>listeners.delete(listener);}};
 }
 const logs=path.join(root,'dub-logs'),out=voiceStorage(app).output;
 const records=()=>fs.existsSync(logs)?fs.readdirSync(logs).filter(n=>n.endsWith('.json')).map(n=>({name:n,...JSON.parse(fs.readFileSync(path.join(logs,n),'utf8'))})):[];
 const request=id=>({id,srt,autoFit:false,naturalSpeech:false,timingMode:'clip',verification:'fast',keepEngine:false});
 const ledger=(instanceId,pid=1)=>createRunLedger({logsDir:logs,outputDir:out,inputDir:voiceStorage(app).input,instanceId,pid});
 return {root,srt,app,spawns,boot,logs,out,records,request,ledger,engine,close:()=>fs.rmSync(root,{recursive:true,force:true})};
}
const outputOf=entry=>entry.args[entry.args.indexOf('--output')+1];


module.exports={world,wav,outputOf,sha};
