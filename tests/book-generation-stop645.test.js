'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync(require.resolve('../src/renderer/media-workflows-ui.js'),'utf8'),start=source.indexOf('  async function generate('),end=source.indexOf('  async function seasons(',start);
const tick=()=>new Promise(setImmediate);
function gate(){let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve};}
function fixture({saveGate,prepGate,planGate}={}){
 const starts=[],released=[];let subscriber;
 const project={id:'book',chapters:[0,1].map(id=>({id,title:'Chapter '+id,text:'Actual '+id,output:'done.wav',status:'ready'}))};
 const ctx={busy:false,selected:new Set([0]),project,voicePrefs:{referenceId:'original'},stopRequested:false,job:null,dialog:{open:true},t:en=>en,status(){},workflowStage(){},saveChapter:()=>saveGate?.promise||Promise.resolve(),books:async()=>{},call:async(name,r)=>name==='book-prepare'?(await prepGate?.promise,{request:{id:'job-'+r.chapter,srt:'chapter.srt',narration:true,forceGroups:[]}}):name==='book-unprepare'?(released.push(r),{ok:true,released:true}):{project:ctx.project},window:{BookWorkflowStatus:require('../src/book-workflow-status'),api:{planDub:async()=>(await planGate?.promise,{ok:true,groups:[{key:'1'}]}),onDubEvent:fn=>(subscriber=fn,()=>{}),startDub:async request=>{starts.push(request);queueMicrotask(()=>subscriber({id:request.id,type:'done'}));return {ok:true};}}}};
 vm.createContext(ctx);vm.runInContext(source.slice(start,end),ctx);return {ctx,starts,released};
}

test('Closing or stopping while the chapter save is pending cannot start invisible audio production',async()=>{
 for(const close of [false,true]){
  const save=gate(),h=fixture({saveGate:save}),pending=h.ctx.generate();await tick();
  h.ctx.stopRequested=true;if(close)h.ctx.dialog.open=false;save.resolve();await pending;
  assert.equal(h.starts.length,0,'A stop during save must not be reset before synthesis');assert.equal(h.ctx.busy,false);
 }
});
test('The clicked chapter selection and voice settings are frozen before asynchronous saving',async()=>{
 let accepted;const save=gate(),h=fixture({saveGate:save}),pending=h.ctx.generate(false,null,{onAccepted:(_id,scope)=>accepted=scope});await tick();
 h.ctx.selected.add(1);h.ctx.voicePrefs.referenceId='later';save.resolve();await pending;
 assert.equal(h.starts.length,1);assert.equal(h.starts[0].referenceId,'original');assert.equal(accepted.selectedCount,1);
});
test('Switching the source during save cannot redirect the production to another book',async()=>{
 const save=gate(),h=fixture({saveGate:save}),pending=h.ctx.generate();await tick();
 h.ctx.project={id:'other',chapters:[{title:'Other',text:'Other',output:'done.wav',status:'ready'}]};save.resolve();await pending;
 assert.equal(h.starts.length,0);
});
test('Stopping after preparation releases only the exact unstarted book request',async()=>{
 const prep=gate(),h=fixture({prepGate:prep}),pending=h.ctx.generate();await tick();h.ctx.stopRequested=true;prep.resolve();await pending;
 assert.equal(h.starts.length,0);assert.equal(h.released.length,1);assert.equal(h.released[0].jobId,'job-0');assert.equal(h.released[0].id,'book');assert.equal(h.released[0].chapter,0);
});
test('A failed save preserves its original error and never starts or reloads a production',async()=>{
 const h=fixture({saveGate:{promise:Promise.reject(Error('Controlled save failure'))}});
 h.ctx.call=async()=>{throw Error('Unexpected later read');};
 await assert.rejects(h.ctx.generate(),/Controlled save failure/);assert.equal(h.starts.length,0);assert.equal(h.ctx.busy,false);
});
test('Assistant cancellation during save or fresh regeneration planning cannot create an accepted job',async()=>{
 for(const phase of ['save','plan']){
  const deferred=gate(),h=fixture(phase==='save'?{saveGate:deferred}:{planGate:deferred});let cancelled=false,accepted=0;
  const pending=h.ctx.generate(phase==='plan',null,{isCancelled:()=>cancelled,onAccepted:()=>accepted++});await tick();cancelled=true;deferred.resolve();await pending;
  assert.equal(h.starts.length,0);assert.equal(accepted,0);assert.equal(h.ctx.busy,false);
  if(phase==='plan')assert.equal(h.released[0]?.jobId,'job-0');
 }
});
