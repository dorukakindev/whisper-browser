'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {JSDOM}=require('jsdom');
function setup(){
 const dom=new JSDOM(fs.readFileSync(path.join(__dirname,'../src/renderer/index.html'),'utf8'),{runScripts:'outside-only'}),w=dom.window,el=id=>w.document.getElementById(id);
 let event,request,proof=true,applied=0,picks=0,played=0,refUsed;
 const context={mode:'browser',tabId:'video-A',generation:2,mediaId:'media-A',mediaKey:'browser:A',source:'https://www.youtube.com/watch?v=abcdefghijk',visible:true,hasMedia:true};
 let output;
 w.HTMLMediaElement.prototype.pause=w.HTMLMediaElement.prototype.load=()=>{};w.HTMLMediaElement.prototype.play=async()=>{played++;};w.HTMLElement.prototype.scrollIntoView=()=>{};
 Object.defineProperty(w.HTMLMediaElement.prototype,'readyState',{get:()=>4});Object.defineProperty(w.HTMLMediaElement.prototype,'duration',{get:()=>10});
 el('dubGeneratorDialog').showModal=()=>{el('dubGeneratorDialog').open=true;};
 Object.assign(w,{player:{sub2Role:'translation',sub2Path:'C:\\private\\translated.srt'},UiLocale:{get:()=> 'en',t:value=>value},syncBrowserOcclusion:()=>{},AssistantAppActions:{current:()=>true},BrowserDubAudioUI:{context:()=>context,originalPlayback:()=>null,stop:async()=>{},attachGenerated:async()=>{applied++;return true;}}});
 const reference={id:'voice-A',name:'Saved voice',path:'C:\\private\\reference.wav',text:'Private transcript',url:'file:///fixture.wav'};
 w.api={dubConfig:async()=>({ok:true,ready:true,engine:'C:\\private\\engine',reference:reference.path,transcript:'C:\\private\\reference.txt'}),latestDub:async args=>({ok:true,output:args?.id&&args.id===output?.id&&proof?output:null}),
  onDubEvent:fn=>{const prior=event;event=value=>{prior?.(value);fn(value);};},startDub:async args=>(request=args,{ok:true}),
  listVoiceReferences:async()=>({ok:true,folder:'C:\\private',activeId:'voice-A',references:[reference]}),useVoiceReference:async args=>(refUsed=args,{ok:true}),
  selectVoiceReferenceSource:async()=>{picks++;return {ok:true,path:'C:\\private\\local.wav'};},prepareVoiceReference:async args=>({ok:true,reference:{id:'voice-A'}}),
  planDub:async()=>({ok:true,sourceHash:'source',groups:[{key:'g1',text:'Hello.',start:0,end:2000,seconds:2}]}),openPath:async()=>{},saveDubPronunciations:async()=>({ok:true})};
 for(const file of ['dub-generator-ui.js','voice-reference-ui.js','assistant-voice-actions.js'])w.eval(fs.readFileSync(path.join(__dirname,'../src/renderer',file),'utf8'));
 return {dom,w,el,context,read:()=>({request,applied,picks,played,refUsed}),proof:value=>proof=value,
  run:(name,args={})=>w.AssistantVoiceActions.execute(name,args,{}),
  finish:()=>{output={id:request.id,type:'done',url:'file:///fixture.wav',name:'fixture.wav',sample:false,sync:{},quality:{groups:[{key:'g1',group:1,text:'Hello.',status:'review',audioStart:0,audioEnd:2,verification:{status:'not_checked'}}]}};event(output);return output;}};
}
test('Real dubbing UI accepts typed options and starts only after an explicit action',async()=>{
 const h=setup();try{
  const configured=await h.run('configure_voice_generation',{profile:'fast',concurrency:8,grouping:'cumle',verification:'balanced',timingMode:'video',expression:'warm',keepBackground:true,followDelivery:true,start:5,end:25});assert.equal(configured.status,'completed');assert.equal(h.read().request,undefined);
  const status=await h.run('get_voice_status');assert(status.voice.subtitleReady);assert.equal(status.voice.settings.profile,'fast');assert(!JSON.stringify(status).includes('private'));
  const refs=await h.run('list_voice_references');assert.equal(refs.references[0].name,'Saved voice');assert(!JSON.stringify(refs).includes('Private transcript'));assert(!JSON.stringify(refs).includes('private'));
  await h.run('set_voice_reference',{reference_id:'voice-A'});assert.equal(h.el('dubProfile').value,'fast','Reference refresh must preserve the selected profile');
  const started=await h.run('start_voice_generation',{sample:true});assert.equal(started.status,'accepted');const args=h.read().request;assert.equal(args.sample,true);assert.equal(args.profile,'fast');assert.equal(args.concurrency,8);assert.equal(args.range.start,5);assert.equal(args.range.end,25);assert(args.keepBackground&&args.followDelivery);
 }finally{await new Promise(resolve=>setTimeout(resolve,25));h.dom.window.close();}
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
 }finally{await new Promise(resolve=>setTimeout(resolve,25));h.dom.window.close();}
});
test('Local picker and reference preparation remain separate from applying the reference',async()=>{
 const h=setup();try{
  await h.run('pick_local_voice_reference');assert.equal(h.read().picks,1);assert.equal(h.read().refUsed,undefined);
  await h.run('prepare_voice_reference',{source:'selected_local',start:0,end:15,name:'Local voice'});assert.equal(h.read().refUsed,undefined);
 }finally{await new Promise(resolve=>setTimeout(resolve,25));h.dom.window.close();}
});
