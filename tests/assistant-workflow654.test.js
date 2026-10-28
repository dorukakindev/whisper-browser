'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),{JSDOM}=require('jsdom');
const model=require('../src/assistant-workflow-settings');
function setup(t){const dom=new JSDOM(fs.readFileSync(require.resolve('../src/renderer/index.html'),'utf8'),{runScripts:'outside-only'});t.after(()=>dom.window.close());const w=dom.window;let current=true,save=async()=>true,calls=0;w.AssistantAppActions={current:()=>current};w.UiLocale={get:()=> 'en'};w.saveAppSettings=()=>{calls++;return save();};w.eval(fs.readFileSync(require.resolve('../src/assistant-workflow-settings'),'utf8'));w.eval(fs.readFileSync(require.resolve('../src/renderer/assistant-workflow-actions'),'utf8'));return {w,read:d=>w.AssistantWorkflowActions.read(d),run:(name,args)=>w.AssistantWorkflowActions.execute(name,args,{}),save:fn=>save=fn,stale:()=>current=false,calls:()=>calls};}
test('workflow schema rejects secrets, arbitrary controls, malformed objects and invalid values',()=>{
 for(const raw of ['{"apiKey":"secret"}','{"__proto__":{}}','{"model":3}','{}','[]','{"beamSize":99}'])assert.throws(()=>model.parse('transcription',raw));
 assert.throws(()=>model.parse('__proto__','{"model":"tiny"}'));assert.deepEqual(model.parse('assistant','{"flex":false}'),{flex:false});
});
test('actual workflow controls expose bounded options, apply atomically and undo only unchanged settings',async t=>{
 const h=setup(t),before=h.read('transcription').values;assert(h.read('transcription').options.model.choices.some(o=>o.value==='tiny'));assert(!JSON.stringify(h.read('assistant')).includes('ApiKey'));
 const result=await h.run('configure_workflow',{domain:'transcription',changes_json:'{"model":"tiny","beamSize":3}'});assert.equal(result.status,'completed');assert.equal(result.values.model,'tiny');assert.equal(result.values.beamSize,3);assert(result.canUndo);await h.run('undo_workflow_settings',{domain:'transcription'});assert.deepEqual({...h.read('transcription').values},{...before});
 await h.run('configure_workflow',{domain:'assistant',changes_json:'{"flex":false}'});h.w.document.getElementById('assistantFlex').checked=true;await assert.rejects(h.run('undo_workflow_settings',{domain:'assistant'}),/Undo refused/);
});
test('invalid actual choices and steps change nothing and a failed save rolls the owned edit back',async t=>{
 const h=setup(t);await assert.rejects(h.run('configure_workflow',{domain:'transcription',changes_json:'{"model":"invented"}'}),/Unsupported/);assert.equal(h.calls(),0);await assert.rejects(h.run('configure_workflow',{domain:'subtitles',changes_json:'{"backgroundOpacity":23}'}),/step/);assert.equal(h.calls(),0);
 const before=h.read('transcription').values;h.save(async()=>false);await assert.rejects(h.run('configure_workflow',{domain:'transcription',changes_json:'{"model":"tiny"}'}),/rollback could not be saved/);assert.deepEqual({...h.read('transcription').values},{...before});
});
test('concurrent saves are serialized and later manual edits are preserved',async t=>{
 const h=setup(t);let finish;h.save(()=>new Promise(r=>finish=r));const run=h.run('configure_workflow',{domain:'transcription',changes_json:'{"model":"tiny"}'});await assert.rejects(h.run('configure_workflow',{domain:'assistant',changes_json:'{"flex":false}'}),/pending/);h.w.document.getElementById('model').value='base';finish(true);await assert.rejects(run,/changed while saving/);assert.equal(h.read('transcription').values.model,'base');assert.equal(h.read('transcription').canUndo,false);
});
test('speech settings report effective quality overrides and stale sources cannot edit',async t=>{
 const h=setup(t);await h.run('configure_workflow',{domain:'translation',changes_json:'{"forSpeech":true,"refine":false,"lenient":true}'});assert.equal(h.read('translation').effective.refine,true);assert.equal(h.read('translation').effective.lenient,false);h.stale();await assert.rejects(h.run('configure_workflow',{domain:'assistant',changes_json:'{"flex":false}'}),/source changed/);
});


test('approval summary uses actual before/after values, choice labels and bounded honest fallbacks',()=>{
 const snapshot={values:{model:'large-v3',beamSize:5},options:{model:{choices:[{value:'large-v3',label:'Large model'},{value:'tiny',label:'Tiny model'}]}}};
 const result=model.summary('transcription','{"model":"tiny","beamSize":3}','en',snapshot);
 assert.equal(result,'Whisper model: Large model → Tiny model\nBeam size: 5 → 3');
 assert.equal(model.summary('assistant','{"flex":false}','tr',{values:{flex:true}}),'DeepInfra Flex: Açık → Kapalı');
 assert.match(model.summary('transcription','{"beamSize":5}','en',snapshot),/5 → 5 \(unchanged\)/);
 assert.throws(()=>model.summary('transcription','{"beamSize":3}','en',{values:{}}),/current value/);
 assert.throws(()=>model.summary('transcription','{"beamSize":3}','en',{values:{beamSize:NaN}}),/current value/);
 assert.deepEqual(snapshot.values,{model:'large-v3',beamSize:5});
});
