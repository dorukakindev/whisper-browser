(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.AssistantFlowState=api;})(globalThis,()=>{
 'use strict';
 // A verified running job keeps its receipt alive; idle confirmations still expire.
 function expiry(row,jobs=[],now=Date.now()){
  if(!row)return 0;
  if(!Number.isFinite(row.maxExpires)||!row.jobId)return row.expires;
  const job=jobs.find(job=>job.id===row.jobId);
  if(!job)return row.expires;
  const until=['running','cancelling'].includes(job.state)?now+600000:
   Number.isFinite(job.finishedAt)?job.finishedAt+600000:row.expires;
  return Math.min(row.maxExpires,Math.max(row.expires,until));
 }
 function describe(row,jobs=[],now=Date.now()){
  if(!row||expiry(row,jobs,now)<=now)return {state:'expired',ready:false,waiting:false};
  if(!row.jobId)return {state:row.waiting?'unverified':'ready',ready:!row.waiting,waiting:false};
  const job=jobs.find(job=>job.id===row.jobId);
  if(!job)return {state:'unverified',ready:false,waiting:false};
  if(['running','cancelling'].includes(job.state))return {state:job.state,ready:false,waiting:true,percent:Number.isFinite(job.percent)?job.percent:null};
  // The ledger's streaming `partial` flag also marks intermediate segments of
  // successful jobs. Only terminal artifact descriptors establish a partial
  // translation; do not mistake process completion for complete translated text.
  const partial=job.state==='completed'&&job.result?.artifacts?.some(a=>a.partial===true||a.failed>0||Number.isSafeInteger(a.total)&&Number.isSafeInteger(a.completed)&&a.completed<a.total);
  return {state:job.state==='completed'?(partial?'partial':'ready'):job.state,ready:job.state==='completed',retryable:job.state==='failed',waiting:false,partial:!!partial};
 }
 return Object.freeze({describe,expiry});
});
