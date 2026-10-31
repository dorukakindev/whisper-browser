'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {JSDOM}=require('jsdom');

test('Assistant can inspect every quality group past the first 30 without exposing paths',async()=>{
 const h=setup();try{await h.run('configure_voice_generation',{profile:'quality'});await h.run('start_voice_generation');h.finish(61);
 const measured=await h.run('get_voice_status');assert.match(measured.note,/has not listened/);assert(measured.voice.groups.every(row=>row.verification==='not_checked'),'Unchecked fixture groups must never become acoustic quality proof');const first=measured.voice;assert.equal(first.groups.length,30);assert.equal(first.nextOffset,30);assert.equal(first.counts.total,61);
 const second=(await h.run('get_voice_status',{offset:first.nextOffset})).voice;assert.equal(second.groups[0].id,'g31');assert.equal(second.nextOffset,60);
 const last=(await h.run('get_voice_status',{offset:60})).voice;assert.equal(last.groups[0].id,'g61');assert.equal(last.nextOffset,null);assert.equal(last.groupsTruncated,false);
 const exact=(await h.run('get_voice_status',{group_id:'g61'})).voice;assert.equal(exact.groups.length,1);assert.equal(exact.groups[0].number,61);assert(!JSON.stringify(exact).includes('private'));
 await assert.rejects(h.run('get_voice_status',{offset:1.5}),/offset/);
 h.context.mediaId='different-video';const changed=(await h.run('get_voice_status')).voice;assert(changed.sourceChanged);assert.equal(changed.groups.length,0);assert.equal(changed.output,null);assert.equal(changed.subtitleReady,false);
 }finally{await new Promise(setImmediate);h.dom.window.close();}
});
function setup({tracks=true}={}){
 const dom=new JSDOM(fs.readFileSync(path.join(__dirname,'../src/renderer/index.html'),'utf8'),{runScripts:'outside-only'}),w=dom.window,el=id=>w.document.getElementById(id);
 let event,request,proof=true,applied=0,picks=0,played=0,refUsed;
 const context={mode:'browser',tabId:'video-A',generation:2,mediaId:'media-A',mediaKey:'browser:A',source:'https://www.youtube.com/watch?v=abcdefghijk',visible:true,hasMedia:true};
 let output,attached=null;
 w.HTMLMediaElement.prototype.pause=function(){this._testPaused=true;};w.HTMLMediaElement.prototype.load=()=>{};w.HTMLMediaElement.prototype.play=async function(){played++;this._testPaused=false;};Object.defineProperty(w.HTMLMediaElement.prototype,'paused',{get(){return this._testPaused!==false;}});w.HTMLElement.prototype.scrollIntoView=()=>{};
 Object.defineProperty(w.HTMLMediaElement.prototype,'readyState',{get:()=>4});Object.defineProperty(w.HTMLMediaElement.prototype,'duration',{get:()=>10});
 el('dubGeneratorDialog').showModal=()=>{el('dubGeneratorDialog').open=true;};
 Object.assign(w,{player:{sub2Role:'translation',sub2Path:'C:\\private\\translated.srt',browserTracks:tracks?[{path:'C:\\private\\translated.srt',role:'translation'}]:[]},UiLocale:{get:()=> 'en',t:value=>value},syncBrowserOcclusion:()=>{},AssistantAppActions:{current:()=>true},BrowserDubAudioUI:{context:()=>context,originalPlayback:()=>attached?{muted:false}:null,snapshot:()=>attached,stop:async()=>{attached=null;},attachGenerated:async value=>{applied++;attached={kind:'generated',id:value.id};return true;}}});
 const reference={id:'voice-A',name:'Saved voice',path:'C:\\private\\reference.wav',text:'Private transcript',url:'file:///fixture.wav'};
 w.api={dubConfig:async()=>({ok:true,ready:true,engine:'C:\\private\\engine',reference:reference.path,transcript:'C:\\private\\reference.txt'}),latestDub:async args=>({ok:true,output:args?.id&&args.id===output?.id&&proof?output:null}),
  onDubEvent:fn=>{const prior=event;event=value=>{prior?.(value);fn(value);};},startDub:async args=>(request=args,{ok:true}),
  listVoiceReferences:async()=>({ok:true,folder:'C:\\private',activeId:'voice-A',references:[reference]}),useVoiceReference:async args=>(refUsed=args,{ok:true}),
  selectVoiceReferenceSource:async()=>{picks++;return {ok:true,path:'C:\\private\\local.wav'};},prepareVoiceReference:async args=>({ok:true,reference:{id:'voice-A'}}),
  planDub:async()=>({ok:true,sourceHash:'source',groups:[{key:'g1',text:'Hello.',start:0,end:2000,seconds:2}]}),openPath:async()=>{},saveDubPronunciations:async()=>({ok:true})};
 for(const file of ['dub-run-info.js','dub-experience-model.js','dub-generator-ui.js','voice-reference-ui.js','assistant-voice-actions.js'])w.eval(fs.readFileSync(path.join(__dirname,'../src/renderer',file),'utf8'));
 return {dom,w,el,context,read:()=>({request,applied,picks,played,refUsed}),proof:value=>proof=value,
  run:(name,args={})=>w.AssistantVoiceActions.execute(name,args,{}),
  finish:(count=1,verification={status:'not_checked'},overrides={})=>{output={id:request.id,type:'done',url:'file:///fixture.wav',name:'fixture.wav',sample:false,sync:{},quality:{groups:Array.from({length:count},(_,i)=>({key:'g'+(i+1),group:i+1,text:'Hello.',status:'review',audioStart:0,audioEnd:2,verification,...overrides}))}};event(output);return output;}};
}

test('Ready speech with a measured pace boundary remains available but assistant and UI request listening',async()=>{
 const h=setup();try{
  await h.run('configure_voice_generation',{profile:'quality'});await h.run('start_voice_generation');
  h.finish(1,{status:'passed'},{status:'ready',continuity:{status:'measured',levelDb:-20,wordsPerSecond:3.5,gainDb:0,warnings:['pace-jump','unknown-secret'],private:'C:/private/ref.wav'}});
  const group=(await h.run('get_voice_status')).voice.groups[0];
  assert.equal(group.status,'ready');assert.equal(group.needsListening,true);
  assert.deepEqual(Array.from(group.reviewReasons),['Adjacent groups differ in pace']);
  assert.deepEqual(Array.from(group.continuity.warnings),['pace-jump']);
  assert(!JSON.stringify(group).includes('private'));assert(!JSON.stringify(group).includes('unknown-secret'));
  h.el('dubQualityGroup').value='g1';h.el('dubQualityGroup').dispatchEvent(new h.w.Event('change'));
  assert.match(h.el('dubQualityReasons').textContent,/differ in pace/);
 }finally{await new Promise(setImmediate);h.dom.window.close();}
});
test('Real dubbing UI accepts typed options and starts only after an explicit action',async()=>{
 const h=setup();try{
  const configured=await h.run('configure_voice_generation',{profile:'fast',concurrency:8,grouping:'cumle',verification:'balanced',timingMode:'video',expression:'warm',keepBackground:true,followDelivery:true,start:5,end:25});assert.equal(configured.status,'completed');assert.equal(h.read().request,undefined);
  const status=await h.run('get_voice_status');assert(status.voice.subtitleReady);assert.equal(status.voice.settings.profile,'fast');assert(!JSON.stringify(status).includes('private'));
  const refs=await h.run('list_voice_references');assert.equal(refs.references[0].name,'Saved voice');assert(!JSON.stringify(refs).includes('Private transcript'));assert(!JSON.stringify(refs).includes('private'));
  await h.run('set_voice_reference',{reference_id:'voice-A'});assert.equal(h.el('dubProfile').value,'fast','Reference refresh must preserve the selected profile');
  const started=await h.run('start_voice_generation',{sample:true});assert.equal(started.status,'accepted');const args=h.read().request;assert.equal(args.sample,true);assert.equal(args.profile,'fast');assert.equal(args.concurrency,8);assert.equal(args.range.start,5);assert.equal(args.range.end,25);assert(args.keepBackground&&args.followDelivery);
 }finally{await new Promise(setImmediate);h.dom.window.close();}
});
test('Only real output/group IDs work; source-proof mismatch never attaches another video voice',async()=>{
 const h=setup();try{
  await h.run('configure_voice_generation',{profile:'quality'});await h.run('start_voice_generation');const output=h.finish();
  await h.run('voice_group',{group_id:'g1',operation:'open'});assert.equal(h.el('dubPlanGroup').value,'0');
  await h.run('voice_group',{group_id:'g1',operation:'listen'});assert.equal(h.read().played,1);
  await assert.rejects(h.run('voice_group',{group_id:'invented',operation:'regenerate'}),/not confirmed/);
  h.proof(false);await assert.rejects(h.run('use_generated_voice',{output_id:output.id}),/not confirmed/);assert.equal(h.read().applied,0);
  h.proof(true);assert.equal((await h.run('use_generated_voice',{output_id:output.id})).status,'completed');assert.equal(h.read().applied,1);
  const regenerated=await h.run('voice_group',{group_id:'g1',operation:'regenerate'});assert.equal(regenerated.status,'accepted');assert.equal(h.read().request.forceGroups[0],'g1');
 }finally{await new Promise(setImmediate);h.dom.window.close();}
});
test('Local picker and reference preparation remain separate from applying the reference',async()=>{
 const h=setup();try{
  await h.run('pick_local_voice_reference');assert.equal(h.read().picks,1);assert.equal(h.read().refUsed,undefined);
  await h.run('prepare_voice_reference',{source:'selected_local',start:0,end:15,name:'Local voice'});assert.equal(h.read().refUsed,undefined);
 }finally{await new Promise(setImmediate);h.dom.window.close();}
});

test('Assistant never adopts a leftover player subtitle without current browser track ownership',async()=>{
 const h=setup({tracks:false});try{
  const status=await h.run('get_voice_status');assert.equal(status.voice.subtitleReady,false);
  await assert.rejects(h.run('start_voice_generation'),/confirmed|subtitle|ready/i);
  assert.equal(h.read().request,undefined);
 }finally{await new Promise(setImmediate);h.dom.window.close();}
});

test('a voice setting that rejects its write cannot produce a successful assistant receipt',async()=>{
 const h=setup();try{Object.defineProperty(h.el('dubProfile'),'value',{configurable:true,get:()=> 'fast',set(){}});await assert.rejects(h.run('configure_voice_generation',{profile:'quality'}),/did not retain/);}finally{h.dom.window.close();}
});

test('Assistant receives bounded localized review reasons without raw ASR or private diagnostics',async()=>{
 const h=setup();try{await h.run('configure_voice_generation',{profile:'quality'});await h.run('start_voice_generation');h.finish(1,{status:'review',lost_negation:true,missing_numbers:['2065'],recognizedText:'private raw ASR',debug:'C:/private/key'});
 const group=(await h.run('get_voice_status')).voice.groups[0];assert.deepEqual(Array.from(group.reviewReasons),['Negation may sound different','Number not recognized: 2065']);assert.equal(group.needsListening,true);assert.equal(group.qualityEvidence,'automatic_checks_only');assert(!JSON.stringify(group).includes('private'));
 h.w.UiLocale.get=()=> 'tr';const localized=(await h.run('get_voice_status')).voice.groups[0];assert.deepEqual(Array.from(localized.reviewReasons),['Olumsuzluk farklı duyulmuş olabilir','Sayı tanınamadı: 2065']);assert(!JSON.stringify(localized).includes('private'));
 }finally{await new Promise(setImmediate);h.dom.window.close();}
});

test('An already configured local reference stays usable when it has no saved-library ID',async()=>{
 const h=setup();try{
  await h.run('configure_voice_generation',{profile:'quality'});
  h.w.api.listVoiceReferences=async()=>({ok:true,activeId:'',references:[]});
  const list=await h.run('list_voice_references');assert.equal(list.activeId,'');assert.equal(list.references.length,0);
  assert.equal(list.configuredReference.ready,true);assert.equal(list.configuredReference.name,'reference.wav');assert(!JSON.stringify(list).includes('private'));
  await h.run('start_voice_generation');assert(h.read().request);assert.equal(h.read().refUsed,undefined,'No reference change or extra local picker is required');
 }finally{await new Promise(setImmediate);h.dom.window.close();}
});


test('Sample overrides belong to one request and preserve the human range and sample controls',async()=>{
 const h=setup();try{
  await h.run('configure_voice_generation',{sample:false,start:5,end:25,grouping:'cumle'});
  await h.run('start_voice_generation',{sample:true});
  assert.equal(h.read().request.sample,true);assert.equal(h.el('dubSampleOnly').checked,false);
  assert.deepEqual(JSON.parse(JSON.stringify(h.read().request.range)),{start:5,end:25});
  assert.equal(h.el('dubRangeStart').value,'5');assert.equal(h.el('dubRangeEnd').value,'25');
  h.finish();await h.run('start_voice_generation');assert.equal(h.read().request.sample,false);
  h.finish();await h.run('configure_voice_generation',{sample:true});
  await h.run('start_voice_generation',{sample:false});assert.equal(h.read().request.sample,false);assert.equal(h.el('dubSampleOnly').checked,true);
  h.finish();await h.run('start_voice_generation');assert.equal(h.read().request.sample,true);
 }finally{await new Promise(setImmediate);h.dom.window.close();}
});

test('A failed sample request does not change retained settings or a later full request',async()=>{
 const h=setup();try{
  await h.run('configure_voice_generation',{sample:false});
  const send=h.w.api.startDub;h.w.api.startDub=async()=>({ok:false,error:'Fixture rejection'});
  await assert.rejects(h.run('start_voice_generation',{sample:true}),/not confirmed/);
  assert.equal(h.el('dubSampleOnly').checked,false);
  h.w.api.startDub=send;await h.run('start_voice_generation');assert.equal(h.read().request.sample,false);
 }finally{await new Promise(setImmediate);h.dom.window.close();}
});

for(const mutation of ['sample','range','grouping','cancel','source'])test('Pending voice planning rejects stale '+mutation+' before sending audio work',async()=>{
 const h=setup();try{
  await h.run('configure_voice_generation',{sample:false,start:5,end:25});
  const makePlan=h.w.api.planDub;let release,entered;
  const waiting=new Promise(resolve=>entered=resolve);
  h.w.api.planDub=async args=>{entered();await new Promise(resolve=>release=resolve);return makePlan(args);};
  let cancelled=false;
  const running=h.w.DubGeneratorUI.assistant.start({sample:true},()=>cancelled);
  await waiting;
  if(mutation==='sample')h.el('dubSampleOnly').checked=true;
  if(mutation==='range'){h.el('dubRangeEnd').value='30';h.el('dubRangeEnd').dispatchEvent(new h.w.Event('input'));}
  if(mutation==='grouping'){h.el('dubGrouping').value='satir';h.el('dubGrouping').dispatchEvent(new h.w.Event('change'));}
  if(mutation==='cancel')cancelled=true;
  if(mutation==='source')h.context.generation++;
  release();assert.equal((await running).ok,false);assert.equal(h.read().request,undefined);
  if(mutation==='range'||mutation==='grouping')assert.equal(h.el('dubPlanGroup').options.length,0,'Obsolete range/grouping plan must not populate the editor');
 }finally{await new Promise(setImmediate);h.dom.window.close();}
});


test('A voice configure request cannot overwrite a manual edit made while readiness is pending',async()=>{
 const h=setup();try{
  await h.run('configure_voice_generation',{profile:'quality'});
  const pending=h.w.DubGeneratorUI.assistant.configure({profile:'quality'},()=>false);
  h.el('dubProfile').value='fast';
  assert.equal((await pending).ok,false);assert.equal(h.el('dubProfile').value,'fast');
 }finally{await new Promise(setImmediate);h.dom.window.close();}
});

test('Each grouping retains authored plan text, verification and natural source editing with sample overrides',async()=>{
 for(const grouping of ['akici','anlatim','cumle','satir']){
  const h=setup();try{
   await h.run('configure_voice_generation',{grouping,verification:'detailed'});
   h.el('dubNaturalSpeech').checked=true;h.el('dubPlanPrepare').click();await new Promise(setImmediate);
   h.el('dubPlanText').value='Authored words stay here.';h.el('dubPlanApply').click();
   await h.run('start_voice_generation',{sample:true});
   const request=h.read().request;
   assert.equal(request.grouping,grouping);assert.equal(request.verification,'detailed');assert.equal(request.naturalSpeech,true);
   assert.equal(request.dubText.edits.g1,'Authored words stay here.');assert.equal(h.el('dubSampleOnly').checked,false);
   h.finish();await h.run('voice_group',{group_id:'g1',operation:'regenerate'});
   assert.equal(h.read().request.sample,true,'Group regeneration reuses its accepted recipe');
   assert.equal(h.read().request.dubText.edits.g1,'Authored words stay here.');
  }finally{await new Promise(setImmediate);h.dom.window.close();}
 }
});


for(const timing of ['before-call','during-readiness'])test('Approved voice settings reject manual changes '+timing+' before mutation',async()=>{
 const h=setup();try{
  await h.run('configure_voice_generation',{profile:'quality',start:5,end:25});
  const expected={kind:'voice',values:{profile:'quality'}};
  if(timing==='before-call')h.el('dubProfile').value='fast';
  const pending=h.w.DubGeneratorUI.assistant.configure({profile:'quality'},()=>false,expected);
  if(timing==='during-readiness')h.el('dubProfile').value='fast';
  const result=await pending;assert.equal(result.ok,false);assert.equal(result.stale,true);assert.equal(h.el('dubProfile').value,'fast');
  assert.equal(h.el('dubRangeStart').value,'5');assert.equal(h.el('dubRangeEnd').value,'25');
 }finally{await new Promise(setImmediate);h.dom.window.close();}
});

test('Approved voice range rejects a manual clip change without altering controls',async()=>{
 const h=setup();try{
  await h.run('configure_voice_generation',{start:5,end:25});
  h.el('dubRangeEnd').value='30';
  const result=await h.w.DubGeneratorUI.assistant.configure({start:10,end:40},()=>false,{kind:'voice',values:{start:5,end:25}});
  assert.equal(result.stale,true);assert.equal(h.el('dubRangeStart').value,'5');assert.equal(h.el('dubRangeEnd').value,'30');
 }finally{await new Promise(setImmediate);h.dom.window.close();}
});


for(const [label,expected] of [
 ['wrong-kind',{kind:'preferences',values:{profile:'quality',sample:false}}],
 ['empty-values',{kind:'voice',values:{}}],
 ['missing-field',{kind:'voice',values:{profile:'quality'}}],
 ['unknown-setting',{kind:'voice',values:{profile:'quality',sample:false,unknown:'value'}}],
 ['array-values',{kind:'voice',values:[]}],
 ['null-packet',null]
])test('Voice approval fails closed for '+label,async()=>{
 const h=setup();try{
  await h.run('configure_voice_generation',{profile:'quality',sample:false});
  const result=await h.w.DubGeneratorUI.assistant.configure({profile:'fast',sample:true},()=>false,expected);
  assert.equal(result.ok,false);assert.equal(result.stale,true);
  assert.equal(h.el('dubProfile').value,'quality');assert.equal(h.el('dubSampleOnly').checked,false);
 }finally{await new Promise(setImmediate);h.dom.window.close();}
});

test('Exact voice approval accepts current settings including a previously disabled range',async()=>{
 const h=setup();try{
  await h.run('configure_voice_generation',{profile:'quality'});
  h.el('dubRangeEnabled').checked=false;
  const result=await h.w.DubGeneratorUI.assistant.configure({profile:'fast',start:5,end:25},()=>false,{kind:'voice',values:{profile:'quality',start:null,end:null}});
  assert.equal(result.ok,true);assert.equal(h.el('dubProfile').value,'fast');
  assert.equal(h.el('dubRangeEnabled').checked,true);assert.equal(h.el('dubRangeStart').value,'5');assert.equal(h.el('dubRangeEnd').value,'25');
 }finally{await new Promise(setImmediate);h.dom.window.close();}
});
