'use strict';
const {randomUUID}=require('node:crypto');
const diagnostics=require('./assistant-job-diagnostics'),outputs=require('./subtitle-output-contract');
// Main-owned in-session job ledger. Never stores paths, source text or secrets.
function createJobs({changed=()=>{}}={}){
 const records=new Map();let revision=0;
 const active=row=>['running','cancelling'].includes(row.state);
 const view=row=>({id:row.id,kind:row.kind,state:row.state,stage:row.stage,percent:row.percent,startedAt:row.startedAt,updatedAt:row.updatedAt,finishedAt:row.finishedAt,cancellable:row.state==='running'&&!!row.cancel,partial:row.partial,stopFailed:row.stopFailed===true,failureCode:row.failureCode,counts:row.counts,activity:row.activity,result:row.result});
 const snapshot=()=>({revision,jobs:[...records.values()].reverse().map(view)});
 function publish(){revision++;try{changed(snapshot());}catch(_){/* A closed UI must not interrupt an audio/media process. */}}
 function start({kind='transcription',cancel}){
  const id=randomUUID(),now=Date.now();records.set(id,{id,kind,state:'running',stage:'starting',percent:null,startedAt:now,updatedAt:now,finishedAt:null,partial:false,failureCode:null,counts:null,activity:null,result:null,cancel});
  while(records.size>50){const old=[...records.values()].find(row=>!active(row));if(!old)break;records.delete(old.id);}
  publish();return id;
 }
 function update(id,event={}){
  const row=records.get(id);if(!row||!active(row)||!['status','reference_status','reference_ready','progress','download_progress','llm_progress','segment','translation_chunk','warning','activity','done','error','cancelled','exit'].includes(event.type))return;
  const before=JSON.stringify(view(row));
  if(['status','reference_status','progress','download_progress','llm_progress'].includes(event.type)){
   const stage=typeof event.stage==='string'?event.stage:({download_progress:'download',llm_progress:'translate'})[event.type];
   if(stage&&/^[a-z_\-]{1,60}$/i.test(stage)&&stage!==row.stage){row.stage=stage;row.percent=null;row.counts=null;row.activity=null;}
   const percent=Number.isFinite(event.percent)?event.percent:Number.isFinite(event.done)&&event.total>0?event.done/event.total*100:null;
   if(Number.isSafeInteger(event.done)&&Number.isSafeInteger(event.total)&&event.done>=0&&event.total>0)row.counts={done:Math.min(event.done,event.total),total:event.total,failed:Number.isSafeInteger(event.failed)&&event.failed>=0?Math.min(event.failed,event.total):0};
   if(percent!==null)row.percent=Math.max(0,Math.min(100,Math.floor(percent)));
  }
  if(event.type==='activity'){
   const pulse=require('./dub-activity').activity(event);
   if(pulse){
    if(row.stage!=='synthesis'){row.stage='synthesis';row.percent=null;row.counts=null;}
    row.activity={group:pulse.group,attempt:pulse.attempt,elapsed:Math.floor(pulse.elapsed),limit:pulse.limit};
   }
  }
  if(event.type==='segment'||event.type==='translation_chunk')row.partial=true;
  let terminal=['done','reference_ready'].includes(event.type)?'completed':event.type==='error'?'failed':event.type==='cancelled'?'stopped':event.type==='exit'?(event.cancelled?'stopped':'failed'):null;
  if(terminal==='failed')row.failureCode=diagnostics.classify(event);
  if(terminal==='completed'){const descriptors=outputs.outputDescriptors(event);if(descriptors.length)row.result={artifacts:descriptors.slice(0,12).map(item=>({role:item.role,language:/^[a-zA-Z0-9-]{1,24}$/.test(item.language)?item.language:'',format:item.path.split('.').pop().toLowerCase(),total:item.total,completed:item.completed,failed:item.failed,partial:item.status==='partial'})),limited:descriptors.length>12};}
  if(terminal){row.activity=null;row.state=terminal;row.finishedAt=Date.now();row.cancel=null;if(terminal==='completed')row.percent=100;}
  if(JSON.stringify(view(row))!==before){row.updatedAt=Date.now();publish();}
 }
 async function cancel(id){
  const row=records.get(id);if(!row||row.state!=='running'||!row.cancel)return {ok:false,error:'This job is no longer cancellable / Bu iş artık durdurulamıyor.'};
  const callback=row.cancel;row.state='cancelling';row.stopFailed=false;row.updatedAt=Date.now();publish();
  // A voice process may still be loading. Acknowledge the request without
  // blocking chat or pretending that the process has already exited.
  void Promise.resolve().then(callback).then(result=>{if(result?.ok===false)throw Error('Cancellation rejected');}).catch(()=>{
   if(row.state==='cancelling'){row.state='running';row.stopFailed=true;row.updatedAt=Date.now();publish();}
  });
  return {ok:true,status:'accepted',note:'Stop requested for this exact job / Bu iş için durdurma istendi.'};
 }
 return {start,update,cancel,snapshot,has:id=>records.has(id)};
}
function register({ipcMain,authorized,jobs}){
 ipcMain.handle('assistant:jobs',event=>authorized(event)?{ok:true,...jobs.snapshot()}:{ok:false});
 ipcMain.handle('assistant:cancelJob',(event,input={})=>authorized(event)&&typeof input?.id==='string'?jobs.cancel(input.id):{ok:false});
}
module.exports={createJobs,register};
