const fs=require('fs'),path=require('path'),assert=require('assert/strict'),crypto=require('crypto'),{EventEmitter}=require('events');
const root=path.resolve('tmp/r779'),dir=path.join(root,'season'),handlers={},app=new EventEmitter();app.getPath=()=>root;
const sender=Object.assign(new EventEmitter(),{id:779,isDestroyed:()=>false,send(_channel,event){events.push(event);}}),events=[];
const digest=file=>crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const initialAligned=fs.readdirSync(dir).filter(n=>n.includes('.aligned-')).sort();
const sources=fs.readdirSync(dir).filter(n=>/\.(mp4|srt)$/.test(n)&&!n.includes('aligned')).map(n=>({name:n,hash:digest(path.join(dir,n))}));
require(path.resolve('src/media-workflows')).registerMediaWorkflows({app,ipcMain:{handle:(k,fn)=>handlers[k]=fn},authorized:e=>e.sender===sender,owner:()=>null,dialog:{showOpenDialog:async()=>({canceled:false,filePaths:[dir]})},python:()=>String.raw`D:\Whisper Local\backend\venv\Scripts\python.exe`,ffmpeg:()=>String.raw`C:\ffmpeg\bin\ffmpeg.exe`,ffprobe:()=>String.raw`C:\ffmpeg\bin\ffprobe.exe`});
const call=r=>handlers['media-workflows:request']({sender},r);
(async()=>{
 const started=Date.now(),preview=await call({action:'batch-sync',id:'synthetic-real-align',locale:'en'});
 fs.writeFileSync(path.join(root,'preview.json'),JSON.stringify(preview,null,2));assert(preview.ok,preview.error);assert.equal(preview.rows.length,2);
 assert(preview.rows.every(row=>row.status==='preview'),JSON.stringify(preview.rows));
 assert.deepEqual(fs.readdirSync(dir).filter(n=>n.includes('.aligned-')).sort(),initialAligned,'Preview cannot write outputs');
 const selected=preview.rows[0].name,result=await call({action:'sync-apply',token:preview.token,names:[selected],locale:'en'});assert(result.ok,result.error);assert.equal(result.written.length,1);
 const data=fs.readFileSync(result.written[0]);assert.equal(data.subarray(0,3).toString('hex'),'efbbbf');
 const cues=require(path.resolve('src/browser-subtitles')).parseSubtitlePayload(data.toString('utf8'),'',result.written[0]).cues;assert.equal(cues.length,3);assert(cues.every(c=>c.end>c.start));
 assert(sources.every(s=>digest(path.join(dir,s.name))===s.hash),'Original files unchanged');
 const repeat=await call({action:'sync-apply',token:preview.token,names:[selected]});assert.equal(repeat.ok,false,'Used plan must be retired');
 const before=fs.readdirSync(dir).filter(n=>n.includes('.aligned-')).sort();
 const changedPreview=await call({action:'batch-sync',id:'synthetic-source-change',locale:'en'});assert(changedPreview.ok);assert(changedPreview.rows.every(r=>r.status==='preview'));
 const original=path.join(dir,'Bolum 01.srt'),saved=fs.readFileSync(original);let changed;
 try{fs.appendFileSync(original,'\nChanged after preview.');changed=await call({action:'sync-apply',token:changedPreview.token,names:changedPreview.rows.map(r=>r.name),locale:'en'});assert.equal(changed.ok,false);assert.deepEqual(fs.readdirSync(dir).filter(n=>n.includes('.aligned-')).sort(),before,'Changed source cannot write any copy');}finally{fs.writeFileSync(original,saved);}
 assert(sources.every(s=>digest(path.join(dir,s.name))===s.hash));
 const evidence={ok:true,sourceChangeRejected:changed.ok===false,sourceChangeWroteNothing:true,seconds:(Date.now()-started)/1000,sourceCount:sources.length,rows:preview.rows.map(({name,status,diagnostics})=>({name,status,diagnostics})),selected,written:result.written.map(f=>path.basename(f)),cues:cues.length,bom:true,originalHashesPreserved:true,repeatedApplyRejected:!repeat.ok,events:events.map(({id,stage,done,total})=>({id,stage,done,total}))};
 fs.writeFileSync(path.join(root,'result.json'),JSON.stringify(evidence,null,2));console.log(JSON.stringify(evidence));
})().catch(e=>{console.error(e.stack);process.exitCode=1});
