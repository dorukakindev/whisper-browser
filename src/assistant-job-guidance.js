'use strict';
const diagnostics=require('./assistant-job-diagnostics');

// Consumes the current exact main-owned ledger row and source-binding verdict.
// Does not infer output roles from filenames, replay settings or restart jobs.
function inspectJobNextSteps({job,binding=null,sourceMatches=null}={},locale='en'){
 if(!job||typeof job.id!=='string'||!['running','cancelling','completed','failed','stopped'].includes(job.state))throw Error('Unknown exact job.');
 const evidence=diagnostics.publicEvidence(job),artifacts=(evidence.result?.artifacts||[]).map(item=>({...item,partial:item.partial||item.failed>0||item.total>0&&item.completed<item.total})),nextSteps=[];
 const partial=artifacts.some(item=>item.partial);
 const running=['running','cancelling'].includes(job.state);
 if(running)nextSteps.push({tool:'get_job_result',args:{job_id:job.id},purpose:'Check this exact job again; progress does not prove completion.'});
 const canAttach=job.state==='completed'&&sourceMatches===true&&['start_whisper','translate_captions','translate_video_captions'].includes(binding?.tool);
 // Dual remains result evidence, but the actual attach capability accepts
 // source/translation only. Never advertise an unexecutable role.
 if(canAttach)for(const role of ['source','translation']){
  const choices=artifacts.filter(item=>item.role===role);if(!choices.length)continue;
  const needsReview=choices.some(item=>item.partial||item.failed>0||item.total>0&&item.completed<item.total);
  nextSteps.push({tool:'use_job_subtitles',args:{job_id:job.id,role,...(needsReview?{allow_partial:true}:{})},requiresConfirmation:true,requiresPartialReview:needsReview});
 }
 const failure=job.state==='failed'?{code:evidence.failureCode||'unknown',guidance:diagnostics.describe(evidence.failureCode,locale)}:null;
 return {status:'completed',job_id:job.id,kind:String(job.kind||'').slice(0,60),state:job.state,stage:String(job.stage||'').slice(0,60),
  percent:Number.isFinite(job.percent)?Math.max(0,Math.min(100,job.percent)):null,counts:evidence.counts,
  streamingPartial:job.partial===true,partial,artifacts,artifactsLimited:evidence.result?.limited===true,sourceMatches:typeof sourceMatches==='boolean'?sourceMatches:null,
  failure,nextSteps,retrySupported:false,
  note:running?'Wait for a terminal ledger state. Streaming output is not a finished artifact.':job.state==='failed'||job.state==='stopped'?
   'No retry or resume command is evidenced for this exact job. Inspect its job log and retained outputs in the owning workspace; no production was started.':
   !artifacts.length?'The job completed, but no subtitle output descriptors were recorded. No attachable subtitle role or audio quality is inferred.':
   !canAttach?'Artifacts are completion metadata only. Exact current-source binding was not verified; attachment is unavailable.':
   'Only the listed output roles are evidenced. Review partial counts before explicit use. Completion does not verify translation quality or listened audio.'};
}
module.exports={inspectJobNextSteps};
