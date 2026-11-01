'use strict';
// Independent bounded runtime contracts informed by Pi agent-loop/agent queues,
// MIT, Mario Zechner, b556cfe5b0300a91f39c7bc5369a65a25fb7fcd5.
// No upstream framework, local model, or provider dependency is installed.
const PURE_READS=new Set(['app_help','search_app_guide']);
function parallelSafe(name,args){return PURE_READS.has(name)||name==='get_title_details'&&/^catalog:[\w-]{1,120}$/.test(args?.item_id||'');}
async function orderedBatch(items,run,{signal,parallel=false,limit=2}={}){
 const output=new Array(items.length);let next=0;
 async function worker(){for(;;){signal?.throwIfAborted();const index=next++;if(index>=items.length)return;output[index]=await run(items[index],index);}}
 await Promise.all(Array.from({length:parallel?Math.min(2,Math.max(1,limit),items.length):1},()=>worker()));return output;
}
function createRuntime(runId=''){
 let sequence=0,intentRevision=0,bytes=0,closed=false;const queues={steer:[],followup:[]};
 function enqueue(mode,text){
  if(closed||!Object.hasOwn(queues,mode)||typeof text!=='string'||!text.trim()||text.length>4000)throw Error('Invalid running-task message / Geçersiz çalışan görev mesajı.');
  if(sequence>=8||bytes+text.length>16000)throw Error('The running-task message queue is full / Çalışan görev mesaj kuyruğu dolu.');
  const row={id:++sequence,runId:String(runId).slice(0,100),mode,text:text.trim()};queues[mode].push(row);bytes+=row.text.length;return {...row,status:'queued',intentRevision};
 }
 function take(mode){if(closed)return [];const rows=queues[mode].splice(0,mode==='followup'?1:queues[mode].length);if(rows.length)intentRevision++;return rows.map(row=>({...row,intentRevision,status:'delivered'}));}
 function snapshot(){return {intentRevision,pending:[...queues.steer,...queues.followup].sort((a,b)=>a.id-b.id).map(row=>({...row,status:closed?'not-delivered':'queued'}))};}
 return {enqueue,take,snapshot,close:()=>{closed=true;return snapshot();},get revision(){return intentRevision;}};
}
function partial(value){
 const count=n=>Number.isSafeInteger(n)&&n>=0?Math.min(n,10000):0;
 const total=count(value?.total),checked=Math.min(total,count(value?.checked)),read=Math.min(checked,count(value?.read));
 return {total,checked,read,blocked:Math.min(checked,count(value?.blocked)),previews:(Array.isArray(value?.previews)?value.previews:[]).slice(-3).map(row=>({title:String(row?.title||'').replace(/\0/g,'').slice(0,120),text:String(row?.text||'').replace(/\0/g,'').slice(0,300)}))};
}
const sourceKey=owner=>require('node:crypto').createHash('sha256').update(JSON.stringify(owner)).digest('hex').slice(0,24);
module.exports={createRuntime,orderedBatch,parallelSafe,partial,sourceKey};
