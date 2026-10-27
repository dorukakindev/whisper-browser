'use strict';
const {randomUUID}=require('node:crypto'),manifest=require('./assistant-context-manifest');
const signature=(name,args)=>name+':'+JSON.stringify(Object.fromEntries(Object.keys(args).sort().map(k=>[k,args[k]])));
function createFlows({now=Date.now,getJobs=()=>({jobs:[]})}={}){
 const tokens=new Map();
 const clean=()=>{for(const [id,row] of tokens)if(row.expires<=now())tokens.delete(id);};
 function start(sender,owner,question){return {sender,owner:manifest.clean(owner),question,steps:[],count:0};}
 function resume(id,sender,owner,{deferCommit=false}={}){clean();const row=tokens.get(id);if(!row||row.flow.sender!==sender)throw Error('This continuation expired / Devam isteği eskidi.');const flow=row.flow;if(!manifest.same(flow.owner,owner))throw Error('The source or conversation changed / Kaynak veya sohbet değişti.');if(row.active)throw Error('This continuation is already running / Bu devam isteği zaten çalışıyor.');const last=flow.steps.at(-1);
  if(last.status==='accepted'){
   const job=getJobs().jobs.find(j=>j.id===last.jobId);if(!job)throw Error('The exact job cannot be verified. Open Jobs / İlgili iş doğrulanamadı. İşler bölümünü aç.');
   if(['running','cancelling'].includes(job.state))return {waiting:true,flow,text:'This exact job is still running; no next step started / İlgili iş sürüyor; sonraki adım başlamadı.'};
   if(job.state!=='completed'){tokens.delete(id);throw Error('The previous job failed or stopped. Review its partial result / Önceki iş başarısız veya durduruldu. Kısmi sonucu kontrol et.');}
   last.status='completed';last.result={...last.result,status:'completed',job:{id:job.id,state:job.state,partial:job.partial,result:job.result||null,counts:job.counts||null},note:'Main job ledger confirms process completion, not complete translation or audio quality. Inspect artifact partial/failed counts before using the result.'};
  }
  if(!deferCommit){tokens.delete(id);flow.count++;return {flow};}
  row.active=true;let settled=false;
  return {flow,settle(success){if(settled)return;settled=true;if(tokens.get(id)!==row)return;if(success){tokens.delete(id);flow.count++;}else row.active=false;}};
 }
 function record(flow,name,args,result,exactJobId=null){
  if(!flow||!['completed','accepted'].includes(result?.status)||flow.steps.length>=8)return {};
  const jobId=result.status==='accepted'&&exactJobId&&getJobs().jobs.some(row=>row.id===exactJobId)?exactJobId:null;
  const data={...result};delete data.ownerAfter;delete data.continuationId;delete data.continuationState;
  flow.steps.push({tool:name,args:{...args},status:result.status,jobId,result:data});
  if(result.status==='accepted'&&!jobId)return {continuationState:'unverified'};
  if(flow.steps.length>=8)return {continuationState:'limit'};
  clean();if(tokens.size>=50)tokens.delete(tokens.keys().next().value);const id=randomUUID();tokens.set(id,{flow,expires:now()+600000});return {continuationId:id,continuationState:result.status==='accepted'?'waiting':'ready',continuationJobId:jobId};
 }
 function repeated(flow,name,args){return flow.steps.some(step=>signature(step.tool,step.args)===signature(name,args));}
 function evidence(flow){return flow.steps.map(step=>{
  let truncated=false;
  const trim=(value,depth=0)=>{
   if(typeof value==='string'){if(value.length>500)truncated=true;return value.slice(0,500);}
   if(depth>3){truncated=true;return undefined;}
   if(Array.isArray(value)){if(value.length>5)truncated=true;return value.slice(0,5).map(v=>trim(v,depth+1));}
   if(value&&typeof value==='object'){
    const entries=Object.entries(value).filter(([key])=>!/path|folder|secret|api.?key|endpoint|token|^owner/i.test(key));
    if(entries.length>20)truncated=true;
    return Object.fromEntries(entries.slice(0,20).map(([key,v])=>[key,trim(v,depth+1)]));
   }
   return value;
  };
  let result=trim(step.result);const args=trim(step.args);
  if(JSON.stringify(result).length>4000){truncated=true;result={status:step.status,note:'Large result omitted; read current tool state.'};}
  return {tool:step.tool,args,status:step.status,jobId:step.jobId,result,truncated};
 });}

 return {start,resume,record,repeated,evidence,tokens};
}
module.exports={createFlows};
