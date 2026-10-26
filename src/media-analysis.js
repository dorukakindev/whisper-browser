'use strict';
const fs=require('node:fs'),{spawn}=require('node:child_process');
function range(request){const start=Number(request?.start),end=Number(request?.end),track=Number(request?.track??0);if(!Number.isFinite(start)||!Number.isFinite(end)||start<0||end<=start||end-start>1800||!Number.isInteger(track)||track<0||track>31)throw Error('Choose a valid interval of up to 30 minutes / En fazla 30 dakikalık geçerli aralık seç.');return{start,end,track};}
async function analyze(file,request,{ffmpeg,signal,spawnImpl=spawn}={}){
 const r=range(request),stat=fs.statSync(file),stamp=`${file}:${stat.size}:${stat.mtimeMs}`;
 async function task(kind){
  const {processOutput}=require('./browser-reference-media');
  let carry=Buffer.alloc(0),peak=0,count=0,total=0,pending='';const points=[],shots=[];
  function log(text){pending+=text;const lines=pending.split(/\r?\n/);pending=lines.pop().slice(-16384);for(const line of lines.filter(line=>line.includes('showinfo')))for(const match of line.matchAll(/pts_time:([0-9.]+)/g)){const t=r.start+Number(match[1]);if(t>=r.start&&t<=r.end&&(!shots.length||t-shots.at(-1)>.15))shots.push(t);}}
  const args=['-nostdin','-hide_banner','-ss',String(r.start),'-i',file,'-t',String(r.end-r.start)];
  if(kind==='wave')args.push('-v','error','-map',`0:a:${r.track}`,'-vn','-ac','1','-ar','8000','-f','s16le','pipe:1');
  else args.push('-an','-sn','-vf',"scale=320:-2,select='gt(scene,0.3)',showinfo",'-f','null','-');
  await processOutput(ffmpeg,args,{signal,spawnImpl,limit:32*1024*1024,timeout:120000,
   consumeStderr:kind==='shots'?log:undefined,
   consume:chunk=>{if(kind!=='wave')return;const data=Buffer.concat([carry,chunk]);let i=0;for(;i+1<data.length;i+=2){peak=Math.max(peak,Math.abs(data.readInt16LE(i))/32768);count++;total++;if(count===400){points.push(peak);peak=count=0;}}carry=data.subarray(i);if(total>8000*1801)throw Error('Analysis output limit / İnceleme çıktı sınırı.');}
  });
  if(kind==='wave'){if(count)points.push(peak);if(!total)throw Error('No audio samples / Ses örneği yok.');return{points,duration:total/8000,start:r.start};}
  log('\n');return shots;
 }
 // Both outcomes are retained; a missing audio track must not hide shot analysis.
 const [wave,shots]=await Promise.allSettled([task('wave'),task('shots')]);
 if(signal?.aborted)throw Error('Cancelled / İptal edildi.');
 const after=fs.statSync(file);if(`${file}:${after.size}:${after.mtimeMs}`!==stamp)throw Error('Media changed / Medya değişti.');
 if(wave.status==='rejected'&&shots.status==='rejected')throw wave.reason;
 return{start:r.start,end:r.end,track:r.track,waveform:wave.status==='fulfilled'?wave.value:null,shots:shots.status==='fulfilled'?shots.value:[],warnings:[wave,shots].filter(v=>v.status==='rejected').map(v=>v.reason.message)};
}
function registerMediaAnalysis({app,ipcMain,authorized,authorize,ffmpeg}){
 const jobs=new Map(),cache=new Map();
 ipcMain.handle('media:analyze',async(event,request)=>{if(!authorized(event))return{ok:false,error:'Unauthorized'};let controller;try{const r=range(request),file=authorize(request?.file),st=fs.statSync(file),key=JSON.stringify([file,st.size,st.mtimeMs,r]);if(jobs.has(event.sender.id))throw Error('Analysis already running / İnceleme zaten çalışıyor.');if(cache.has(key))return{ok:true,...cache.get(key)};
 controller=new AbortController();jobs.set(event.sender.id,controller);const value=await analyze(file,r,{ffmpeg:ffmpeg(),signal:controller.signal});if(controller.signal.aborted)throw Error('Cancelled / İptal edildi.');cache.set(key,value);while(cache.size>4)cache.delete(cache.keys().next().value);return{ok:true,...value};}catch(error){return{ok:false,code:controller?.signal.aborted?'cancelled':/timed out|zaman aşımı/i.test(error.message)?'timeout':'analysis_failed',error:error.message};}finally{if(controller&&jobs.get(event.sender.id)===controller)jobs.delete(event.sender.id);}});
 ipcMain.handle('media:analyzeCancel',event=>{if(!authorized(event))return{ok:false};jobs.get(event.sender.id)?.abort();return{ok:true};});
 app.on('before-quit',()=>{for(const job of jobs.values())job.abort();});
}
module.exports={range,analyze,registerMediaAnalysis};
