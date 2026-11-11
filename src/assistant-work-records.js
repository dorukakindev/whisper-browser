(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.AssistantWorkRecords=api;})(typeof globalThis!=='undefined'?globalThis:this,()=>{
 'use strict';
 const text=(v,n)=>typeof v==='string'?v.replace(/\0/g,'').slice(0,n):'';
 function brief(raw){if(!raw||typeof raw!=='object')return null;return {goal:text(raw.goal,1000),humanDecisions:text(raw.humanDecisions,2000),verifiedResults:text(raw.verifiedResults,2000),openQuestions:text(raw.openQuestions,2000),responsePreferences:text(raw.responsePreferences,1000),domain:['film','series','documentary','anime','manga','podcast','book','general'].includes(raw.domain)?raw.domain:'general',sourceRevision:text(raw.sourceRevision,500),updatedAt:Number.isFinite(raw.updatedAt)?raw.updatedAt:0};}
 function scope(raw){return !Array.isArray(raw)?[]:raw.slice(-80).map(r=>({tool:text(r.tool,100),status:text(r.status,30),scope:text(r.scope,2000),count:Number.isSafeInteger(r.count)?r.count:null,total:Number.isSafeInteger(r.total)?r.total:null,offset:Number.isSafeInteger(r.offset)?r.offset:null,nextOffset:Number.isSafeInteger(r.nextOffset)?r.nextOffset:null,truncated:r.truncated===true||typeof r.scope==='string'&&r.scope.length>2000||Array.isArray(r.ids)&&r.ids.length>40,ids:Array.isArray(r.ids)?r.ids.slice(0,40).map(id=>text(id,200)):[]}));}
 function read(tool,result={}){const rows=result.matches||result.sources||result.items||result.rows||result.citations||result.recommendations||result.jobs||result.tools||[];return scope([{tool,status:result.status||(result.error?'failed':'completed'),scope:typeof result.scope==='string'?result.scope:result.note||'',count:Array.isArray(rows)?rows.length:null,total:result.total??result.count,offset:result.offset,nextOffset:result.nextOffset,truncated:result.sourceTruncated===true||result.truncated===true||result.more===true||result.hasMore===true,ids:Array.isArray(rows)?rows.map(r=>r.id||r.item_id||r.nodeId||'').filter(Boolean):[]}])[0];}
 // Change hint only, never a file hash or permission. Canonical evidence/jobs still revalidate in their owners.
 function contextStamp(owner){const value=JSON.stringify([owner.kind,owner.owner,owner.generation,owner.pageKey,owner.audioKey,owner.subtitleKey,owner.range]);let a=2166136261,b=5381;for(let i=0;i<value.length;i++){a=Math.imul(a^value.charCodeAt(i),16777619);b=Math.imul(b,33)^value.charCodeAt(i);}return 'context:'+(a>>>0).toString(16)+'-'+(b>>>0).toString(16)+'-'+value.length;}
 function plan(owner,goal,actions=[],reads=[],savedBrief=null){
  const fingerprint=contextStamp(owner),sourceChanged=!!savedBrief?.sourceRevision&&savedBrief.sourceRevision!==fingerprint;
  const goalChanged=!!savedBrief?.goal&&savedBrief.goal!==goal;
  const statuses=actions.map(a=>({proposalId:a.proposalId,tool:a.tool,status:a.resultStatus||'not-applied',jobId:a.jobId||null,verification:'historical-owner-check-required'}));
  const production=statuses.filter(r=>/whisper|translat|voice_generation|narration/.test(r.tool)),saves=statuses.filter(r=>/save|apply_library_collection/.test(r.tool));
  const scopeReads=scope(reads),inspected=scopeReads.filter(r=>/get_.*context|inspect_podcast|read_recent/.test(r.tool)),evidence=scopeReads.filter(r=>/search|research_notes|film_context|review/.test(r.tool));
  const needed=/çevir|cevir|translat|dublaj|dub|narrat|seslend|whisper|transcri/i.test(goal);
  const step=(id,dependsOn,state,purpose,purposeTr,receipts)=>({id,dependsOn,state,purpose,purposeTr,receipts});
  return {goal:text(goal,1000),source:{kind:owner.kind,title:owner.title,subtitleKey:owner.subtitleKey,range:owner.range},sourceChanged,goalChanged,steps:[
   step('inspect',[],sourceChanged||!inspected.length?'needs-current-read':'historical-recheck','Inspect exact source, available text and missing ranges.','Kesin kaynağı, mevcut metni ve eksik aralıkları incele.',inspected),
   step('evidence',['inspect'],sourceChanged||!evidence.length?'waiting':'historical-recheck','Select owner-verified passages; separate source, translation and notes.','Sahibinde doğrulanan pasajları seç; kaynak, çeviri ve notu ayır.',evidence),
   step('decision',['evidence'],'needs-human-decision','Review missing sources, partial output and scope.','Eksik kaynağı, kısmi çıktıyı ve kapsamı incele.',[]),
   step('produce',['decision'],sourceChanged||goalChanged?'invalidated':production.length?'historical-recheck':needed?'not-authorized':'optional','If needed, inspect exact recorded jobs before proposing production. No automatic retry.','Gerekirse üretim önermeden kesin kayıtlı işi incele. Otomatik yeniden deneme yok.',production),
   step('save',needed?['evidence','produce']:['evidence'],sourceChanged||goalChanged?'invalidated':saves.length?'historical-recheck':'not-authorized','Review the draft/output and confirm saving separately.','Taslağı/çıktıyı incele ve kaydetmeyi ayrıca onayla.',saves)
  ],recordedReceipts:statuses,limits:'Read-only dependency plan. Historical receipts need current owner verification. A plan, stopped job or summary grants no execution, retry or save authority.'};
 }

 return Object.freeze({brief,scope,read,plan,contextStamp});
});
