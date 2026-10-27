(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.AssistantFlowState=api;})(globalThis,()=>{
 'use strict';
 function describe(row,jobs=[],now=Date.now()){
  if(!row||row.expires<=now)return {state:'expired',ready:false,waiting:false};
  if(!row.jobId)return {state:row.waiting?'unverified':'ready',ready:!row.waiting,waiting:false};
  const job=jobs.find(job=>job.id===row.jobId);
  if(!job)return {state:'unverified',ready:false,waiting:false};
  if(['running','cancelling'].includes(job.state))return {state:job.state,ready:false,waiting:true,percent:Number.isFinite(job.percent)?job.percent:null};
  return {state:job.state==='completed'?'ready':job.state,ready:job.state==='completed',waiting:false};
 }
 return Object.freeze({describe});
});
