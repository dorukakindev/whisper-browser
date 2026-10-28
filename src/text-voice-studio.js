'use strict';
const fs=require('node:fs'),path=require('node:path'),{randomUUID}=require('node:crypto');
const {performance}=require('node:perf_hooks');
const {pathToFileURL}=require('node:url');
const {atomicWriteFileSync}=require('./fsync-utils');
const {validVoiceOutput}=require('./voice-output');
const defaults={motor:'nano',mode:'auto',steps:15,batch:4,cfg:1.65,temperature:.8,pause:1,max_chars:300,seed:42,normalize:true,align:false,polish:true,preview:false,preview_count:2};
function readText(file){
 if(fs.statSync(file).size>2000000)throw Error('Text file is too large.');
 const bytes=fs.readFileSync(file);let text;
 if(bytes[0]===0xff&&bytes[1]===0xfe)text=new TextDecoder('utf-16le').decode(bytes);
 else if(bytes[0]===0xfe&&bytes[1]===0xff)text=new TextDecoder('utf-16be').decode(bytes);
 else{try{text=new TextDecoder('utf-8',{fatal:true}).decode(bytes);}catch{text=new TextDecoder('windows-1254').decode(bytes);}}
 return text.replace(/^\uFEFF/,'');
}
function settings(raw={}){
 const result={...defaults};
 for(const key of Object.keys(defaults))if(Object.hasOwn(raw,key))result[key]=raw[key];
 if(!['nano','torch'].includes(result.motor)||!['auto','hifi','clone'].includes(result.mode))throw Error('Invalid voice mode.');
 for(const [key,min,max,integer]of [['steps',1,50,true],['cfg',.1,5,false],['temperature',.1,2,false],['pause',0,5,false],['max_chars',200,1200,true],['seed',0,2147483647,true],['preview_count',1,20,true]]){
  const n=Number(result[key]);if(!Number.isFinite(n)||n<min||n>max||integer&&!Number.isInteger(n))throw Error('Invalid voice setting: '+key);result[key]=n;
 }
 result.batch=Number(result.batch);if(![1,2,4,8,16].includes(result.batch))throw Error('Invalid voice batch.');
 for(const key of ['normalize','align','polish','preview'])if(typeof result[key]!=='boolean')throw Error('Invalid voice option: '+key);
 return result;
}
function registerTextVoiceStudio({app,ipcMain,dialog,owner,guard,config,referenceEntry,busy,reserve,finish,emit,releaseWarm,environment,spawn,grantMedia,claimArtifacts}){
 const selections=new WeakMap();
 function remember(event,item){const values=selections.get(event.sender)||new Map();selections.set(event.sender,values);for(const [id,value]of values)if(value.reference===item.reference&&value.transcript===item.transcript){values.set(id,item);return id;}if(values.size>=64)values.delete(values.keys().next().value);const id='local:'+randomUUID();values.set(id,item);return id;}
 const savedFile=()=>path.join(app.getPath('userData'),'text-studio-settings.json');
 function saved(){try{const data=JSON.parse(fs.readFileSync(savedFile(),'utf8'));if(data.version!==2)data.pause=1;return settings(data);}catch{return {...defaults};}}
 function voice(event,id){
  if(id?.startsWith('local:')){const item=selections.get(event.sender)?.get(id);if(!item)throw Error('Select the local voice again.');return item;}
  if(id){const item=referenceEntry(id);return {reference:item.path,transcript:path.join(item.folder,'reference.txt'),text:item.text};}
  const c=config();return {reference:c.reference,transcript:c.transcript,text:fs.existsSync(c.transcript)?readText(c.transcript):''};
 }
 ipcMain.handle('dub:textUI',guard(async e=>{e.sender.send('dub:event',{type:'text_studio_open'});return {ok:true};}));
 ipcMain.handle('dub:textVoice',guard(async(e,request={})=>{
  const c=config();
  if(request.action==='config'){
   const v=voice(e),ready=validVoiceOutput(v.reference);if(ready)grantMedia(v.reference);return {ok:true,settings:saved(),referenceId:remember(e,v),referenceName:path.basename(v.reference),referenceReady:ready,url:ready?pathToFileURL(v.reference).href:'',transcript:v.text.slice(0,8000),engine:c.engine,engineReady:fs.existsSync(path.join(c.engine,'.venv','Scripts','python.exe'))};
  }
  if(request.action==='pick-text'||request.action==='pick-reference'||request.action==='pick-transcript'){
   if(busy())throw Error('Finish the active voice job first.');
   const ref=request.action==='pick-reference',selection=await dialog.showOpenDialog(owner(),{properties:['openFile'],filters:[{name:ref?'Voice reference':'Text',extensions:ref?['wav']:['txt']}]});
   if(selection.canceled||!selection.filePaths[0])return {ok:true,cancelled:true};
   if(busy())throw Error('Finish the active voice job first.');
   const file=fs.realpathSync(selection.filePaths[0]);
   if(!ref){const text=readText(file);if(text.length>(request.action==='pick-transcript'?8000:500000))throw Error('Text exceeds the supported length.');return {ok:true,text,name:path.basename(file)};}
   if(!validVoiceOutput(file))throw Error('Select a valid WAV reference.');
   const transcript=file.replace(/\.wav$/i,'.txt'),text=fs.existsSync(transcript)?readText(transcript):'';
   if(text.length>8000)throw Error('Reference transcript is too long.');
   const id=remember(e,{reference:file,transcript,text});grantMedia(file);
   return {ok:true,id,name:path.basename(file),text,url:pathToFileURL(file).href};
  }
  if(request.action!=='start')throw Error('Unsupported text voice operation.');
  if(busy())throw Error('Another production is active.');
  if(typeof request.text!=='string'||!request.text.trim()||request.text.length>500000||typeof request.transcript!=='string'||request.transcript.length>8000)throw Error('Check the manuscript and transcript lengths.');
  const options=settings(request.settings),v=voice(e,request.referenceId);
  if(!validVoiceOutput(v.reference))throw Error('Select a valid voice reference.');
  const python=path.join(c.engine,'.venv','Scripts','python.exe');if(!fs.existsSync(python))throw Error('Voice engine Python was not found.');
  const id='text-'+randomUUID(),dirs=require('./voice-storage').voiceStorage(app);
  const folder=path.join(dirs.input,'Metin',id),name=String(request.name||'metin').replace(/[<>:"/\\|?*\u0000-\u001f]/g,'_').trim().replace(/[. ]+$/g,'').slice(0,80)||'metin';
  const output=path.join(dirs.output,name+(options.preview?'-ornek':'')+'-'+id+'.wav');
  const s={id,sender:e.sender,proc:null,cancelled:false,started:performance.now(),startedAt:new Date().toISOString(),settings:{kind:'text',...options},sample:options.preview};
  let releaseStart;s.startPhase=new Promise(resolve=>{releaseStart=resolve;});reserve(s);
  try{
   await releaseWarm();if(s.cancelled){finish(s,'cancelled',{kind:'text'});return {ok:false,cancelled:true};}
   fs.mkdirSync(folder,{recursive:true});fs.mkdirSync(dirs.output,{recursive:true});
   claimArtifacts(s,[output,output.replace(/\.wav$/i,'.tmp.wav'),output.replace(/\.wav$/i,'.norm.tmp.wav')]);
   const source=path.join(folder,'metin.txt'),transcript=path.join(folder,'referans.txt'),file=path.join(folder,'request.json');
   atomicWriteFileSync(source,'\uFEFF'+request.text,{encoding:'utf8'});atomicWriteFileSync(transcript,request.transcript,{encoding:'utf8'});
   atomicWriteFileSync(file,JSON.stringify({engine:c.engine,reference:v.reference,transcript,source,output,settings:options}),{encoding:'utf8'});
   atomicWriteFileSync(savedFile(),JSON.stringify({version:2,...options}),{encoding:'utf8'});
   s.summaryPath=path.join(folder,'job.json');s.logPath=path.join(folder,'events.ndjson');
   const log=path.join(folder,'engine.log');let pending='',tail='';
   s.proc=spawn(python,[path.join(__dirname,'..','tools','voxcpm2','text_studio_job.py'),'--request',file],{cwd:c.engine,env:{...environment(c.engine),PYTHONUTF8:'1',PYTHONUNBUFFERED:'1'},windowsHide:true,stdio:['ignore','pipe','pipe']});
   emit(s,'status',{kind:'text',stage:'model_load'});
   const receive=text=>{try{fs.appendFileSync(log,text,'utf8');}catch{}tail=(tail+text).slice(-6000);pending=(pending+text).slice(-65536);const lines=pending.split(/\r?\n/);pending=lines.pop();for(const line of lines){const m=/\[(\d+)\/(\d+)\]/.exec(line);if(m)emit(s,'progress',{kind:'text',done:Number(m[1]),total:Number(m[2])});}emit(s,'text_log',{kind:'text',tail});};
   s.proc.stdout.setEncoding('utf8');s.proc.stderr.setEncoding('utf8');s.proc.stdout.on('data',receive);s.proc.stderr.on('data',receive);
   s.proc.on('error',error=>{s.spawnError=error.message;});
   s.proc.once('close',(code,signal)=>{
    s.exitCode=code;s.exitSignal=signal;
    if(s.cancelled){finish(s,'cancelled',{kind:'text'});return;}
    if(code!==0||!validVoiceOutput(output)){finish(s,'error',{kind:'text',error:s.spawnError||tail||'Voice output was not completed.'});return;}
    grantMedia(output);finish(s,'done',{kind:'text',path:output,url:pathToFileURL(output).href,name:path.basename(output),sample:options.preview});
   });
   return {ok:true,id};
  }catch(error){finish(s,s.cancelled?'cancelled':'error',{kind:'text',error:error.message});throw error;}
  finally{releaseStart();}
 }));
}
module.exports={registerTextVoiceStudio,settings,readText};
