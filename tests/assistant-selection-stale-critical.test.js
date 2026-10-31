'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),{JSDOM}=require('jsdom');
function translation(t){
 const dom=new JSDOM('<select id="translateEndpointPreset"><option value="custom">Custom</option></select><input id="translateBaseUrl" value="https://old.example/v1"><input id="translateModel" value="old"><input id="translateApiKey" value="private-old">',{runScripts:'outside-only'});t.after(()=>dom.window.close());const w=dom.window;let saves=0;
 w.AssistantAppActions={current:()=>true};w.api={loadSettings:async()=>({})};w.AssistantTranslationProfiles={list:()=>[{id:'assistant',model:'target',provider:'target.example'}],resolve:()=>({endpoint:'https://target.example/v1',model:'target',apiKey:'private-target'})};w.saveAppSettings=async()=>{saves++;return true;};w.eval(fs.readFileSync(require.resolve('../src/renderer/assistant-translation-actions'),'utf8'));
 return {w,saves:()=>saves,run:(name,options={})=>w.AssistantTranslationActions.execute(name,{profile_id:'assistant'},{},options)};
}
test('old provider approval cannot overwrite a newer manual provider selection',async t=>{
 const h=translation(t),before=await h.run('get_translation_profile');h.w.document.getElementById('translateModel').value='human-new';
 const result=await h.run('set_translation_profile',{expectedSettings:{kind:'translation-profile',identity:before.selectionIdentity}});
 assert.equal(result.stale,true);assert.equal(h.saves(),0);assert.equal(h.w.document.getElementById('translateModel').value,'human-new');
});
test('provider selection binding is opaque, remains stable and permits unchanged approval',async t=>{
 const h=translation(t),before=await h.run('get_translation_profile');assert.match(before.selectionIdentity,/^[\w-]{1,100}$/);assert(!JSON.stringify(before).includes('private-'));assert.equal((await h.run('get_translation_profile')).selectionIdentity,before.selectionIdentity);
 const result=await h.run('set_translation_profile',{expectedSettings:{kind:'translation-profile',identity:before.selectionIdentity}});assert.equal(result.status,'completed');assert.equal(h.saves(),1);
});
const {EventEmitter}=require('node:events'),{register}=require('../src/assistant-agent-service');
function serviceHarness(name,args){
 const handlers=new Map(),app=new EventEmitter(),sender=new EventEmitter(),cards=[],packets=[];let turn=0,mutations=0,state={status:'completed',selectionIdentity:'revision-old',profile:{id:'assistant',model:'target',provider:'target.example'},references:[{id:'ref-a',name:'Requested',selectionToken:'native-token'}]};sender.id=725;sender.isDestroyed=()=>false;const owner={kind:'video',owner:'source-A',thread:'thread-A',tabId:'A',generation:1,tracks:[]},event={sender};const call=(name,input)=>handlers.get('assistant:'+name)(event,input);
 sender.send=(_,p)=>{if(p.type==='proposal')cards.push(p.action);if(p.type==='action'){packets.push(p);queueMicrotask(()=>{if(p.name===name)mutations++;call('agentResult',{callId:p.callId,result:p.name===name?{status:'completed'}:state});});}};
 const reply=message=>new Response(JSON.stringify({choices:[{message,finish_reason:'stop'}]}),{headers:{'content-type':'application/json'}});
 register({app,ipcMain:{handle:(n,f)=>handlers.set(n,f)},authorized:()=>true,getConfig:()=>({endpoint:'https://fixture.example/v1',model:'fixture'}),fetchImpl:async()=>++turn===1?reply({role:'assistant',tool_calls:[{id:'selection',function:{name,arguments:JSON.stringify(args)}}]}):reply({role:'assistant',content:'Review'})});
 return {call,owner,cards,packets,set:changes=>state={...state,...changes},mutations:()=>mutations,close:()=>app.emit('will-quit')};
}
for(const [name,args,kind]of [['set_translation_profile',{profile_id:'assistant'},'translation-profile'],['set_voice_reference',{reference_id:'ref-a'},'voice-reference']])test(name+' binds before-selection and refresh requires separate approval',async()=>{
 const h=serviceHarness(name,args);try{
  assert((await h.call('agentRun',{requestId:'selection-test',question:'Select configured target',owner:h.owner})).ok);assert.equal(h.cards.length,1);
  h.set({selectionIdentity:'revision-human-new'});const old=await h.call('agentApply',{proposalId:h.cards[0].proposalId,owner:h.owner});assert.equal(old.stale,true);assert.equal(h.mutations(),0);
  const fresh=await h.call('agentApply',{mode:'refresh',proposalId:h.cards[0].proposalId,owner:h.owner});assert.equal(fresh.ok,true);assert.equal(h.mutations(),0);
  assert((await h.call('agentApply',{proposalId:fresh.action.proposalId,owner:h.owner})).ok);assert.equal(h.mutations(),1);assert.deepEqual(h.packets.find(p=>p.name===name).expectedSettings,{kind,identity:'revision-human-new'});
 }finally{h.close();}
});
test('removed exact voice reference is rejected before mutation, and refresh cannot restore a missing target',async()=>{
 const h=serviceHarness('set_voice_reference',{reference_id:'ref-a'});try{
  await h.call('agentRun',{requestId:'removed-reference',question:'Select reference',owner:h.owner});h.set({references:[]});const old=await h.call('agentApply',{proposalId:h.cards[0].proposalId,owner:h.owner});assert.equal(old.stale,true);assert.equal(h.mutations(),0);assert.equal((await h.call('agentApply',{mode:'refresh',proposalId:h.cards[0].proposalId,owner:h.owner})).ok,false);
 }finally{h.close();}
});

function voiceSetup({tracks=true}={}){
 const dom=new JSDOM(fs.readFileSync(require.resolve('../src/renderer/index.html'),'utf8'),{runScripts:'outside-only'}),w=dom.window,el=id=>w.document.getElementById(id);
 let event,request,proof=true,applied=0,picks=0,played=0,refUsed;
 const context={mode:'browser',tabId:'video-A',generation:2,mediaId:'media-A',mediaKey:'browser:A',source:'https://www.youtube.com/watch?v=abcdefghijk',visible:true,hasMedia:true};
 let output,attached=null;
 w.HTMLMediaElement.prototype.pause=function(){this._testPaused=true;};w.HTMLMediaElement.prototype.load=()=>{};w.HTMLMediaElement.prototype.play=async function(){played++;this._testPaused=false;};Object.defineProperty(w.HTMLMediaElement.prototype,'paused',{get(){return this._testPaused!==false;}});w.HTMLElement.prototype.scrollIntoView=()=>{};
 Object.defineProperty(w.HTMLMediaElement.prototype,'readyState',{get:()=>4});Object.defineProperty(w.HTMLMediaElement.prototype,'duration',{get:()=>10});
 el('dubGeneratorDialog').showModal=()=>{el('dubGeneratorDialog').open=true;};
 Object.assign(w,{player:{sub2Role:'translation',sub2Path:'C:\\private\\translated.srt',browserTracks:tracks?[{path:'C:\\private\\translated.srt',role:'translation'}]:[]},UiLocale:{get:()=> 'en',t:value=>value},syncBrowserOcclusion:()=>{},AssistantAppActions:{current:()=>true},BrowserDubAudioUI:{context:()=>context,originalPlayback:()=>attached?{muted:false}:null,snapshot:()=>attached,stop:async()=>{attached=null;},attachGenerated:async value=>{applied++;attached={kind:'generated',id:value.id};return true;}}});
 const reference={selectionToken:'native-token',id:'voice-A',name:'Saved voice',path:'C:\\private\\reference.wav',text:'Private transcript',url:'file:///fixture.wav'};
 w.api={dubConfig:async()=>({ok:true,ready:true,engine:'C:\\private\\engine',reference:reference.path,transcript:'C:\\private\\reference.txt'}),latestDub:async args=>({ok:true,output:args?.id&&args.id===output?.id&&proof?output:null}),
  onDubEvent:fn=>{const prior=event;event=value=>{prior?.(value);fn(value);};},startDub:async args=>(request=args,{ok:true}),
  listVoiceReferences:async()=>({ok:true,folder:'C:\\private',activeId:'voice-A',references:[reference]}),useVoiceReference:async args=>(refUsed=args,{ok:true}),
  selectVoiceReferenceSource:async()=>{picks++;return {ok:true,path:'C:\\private\\local.wav'};},prepareVoiceReference:async args=>({ok:true,reference:{id:'voice-A'}}),
  planDub:async()=>({ok:true,sourceHash:'source',groups:[{key:'g1',text:'Hello.',start:0,end:2000,seconds:2}]}),openPath:async()=>{},saveDubPronunciations:async()=>({ok:true})};
 for(const file of ['dub-run-info.js','dub-experience-model.js','dub-generator-ui.js','voice-reference-ui.js','assistant-voice-actions.js'])w.eval(fs.readFileSync(require.resolve('../src/renderer/'+file),'utf8'));
 return {dom,w,el,context,read:()=>({request,applied,picks,played,refUsed}),proof:value=>proof=value,
  run:(name,args={})=>w.AssistantVoiceActions.execute(name,args,{}),
  finish:(count=1,verification={status:'not_checked'},overrides={})=>{output={id:request.id,type:'done',url:'file:///fixture.wav',name:'fixture.wav',sample:false,sync:{},quality:{groups:Array.from({length:count},(_,i)=>({key:'g'+(i+1),group:i+1,text:'Hello.',status:'review',audioStart:0,audioEnd:2,verification,...overrides}))}};event(output);return output;}};
}

async function preparedVoice(t){const h=voiceSetup();const list=h.w.api.listVoiceReferences;h.w.api.listVoiceReferences=async()=>{const refs=await list();refs.references.push({id:'human-new',name:'Human choice',path:'C:/private/human.wav',text:'Human transcript'});return refs;};t.after(async()=>{await new Promise(setImmediate);h.dom.window.close();});await h.w.DubGeneratorUI.prepareCurrent();await new Promise((resolve,reject)=>{const select=h.el('voiceReferenceSelect');let timer;const observer=new h.w.MutationObserver(()=>{if(select.querySelector('option[value="voice-A"]')){observer.disconnect();clearTimeout(timer);resolve();}});observer.observe(select,{childList:true,subtree:true});timer=setTimeout(()=>{observer.disconnect();reject(Error('Saved reference did not render'));},2000);h.el('voiceReferenceRecorder').open=true;});return h;}
test('voice unchanged approval reaches the actual use API and preserves advanced voice options',async t=>{
 const h=await preparedVoice(t);h.el('dubProfile').value='fast';const before=await h.run('list_voice_references');assert(!JSON.stringify(before).includes('private'));assert.match(before.selectionIdentity,/^[\w-]{1,100}$/);
 const result=await h.w.AssistantVoiceActions.execute('set_voice_reference',{reference_id:'voice-A'},{},{expectedSettings:{kind:'voice-reference',identity:before.selectionIdentity,selectionToken:'native-token'}});assert.equal(result.status,'completed');assert.equal(h.read().refUsed.id,'voice-A');assert.equal(h.read().refUsed.expectedSelection,'native-token');assert.equal(h.el('dubProfile').value,'fast');
});
for(const change of ['pending selection','advanced default','removed target','during refresh'])test('old voice approval preserves a newer '+change,async t=>{
 const h=await preparedVoice(t),before=await h.run('list_voice_references'),original=h.w.api.listVoiceReferences;
 const manual=()=>{const option=h.w.document.createElement('option');option.value='human-new';option.textContent='New manual choice';h.el('voiceReferenceSelect').append(option);h.el('voiceReferenceSelect').value='human-new';h.el('voiceReferenceSelect').dispatchEvent(new h.w.Event('change',{bubbles:true}));h.el('voiceReferenceText').value='Human unsaved draft';h.el('voiceReferenceText').dispatchEvent(new h.w.Event('input',{bubbles:true}));};
 if(change==='pending selection')manual();
 if(change==='advanced default')h.w.api.dubConfig=async()=>({ok:true,ready:true,reference:'C:/private/new-default.wav',transcript:'C:/private/new-default.txt'});
 if(change==='removed target')h.w.api.listVoiceReferences=async()=>({ok:true,activeId:'',references:[]});
 if(change==='during refresh'){let calls=0;h.w.api.listVoiceReferences=async()=>{if(++calls===2)manual();return original();};}
 const result=await h.w.AssistantVoiceActions.execute('set_voice_reference',{reference_id:'voice-A'},{},{expectedSettings:{kind:'voice-reference',identity:before.selectionIdentity,selectionToken:'native-token'}});assert.equal(result.stale,true);assert.equal(h.read().refUsed,undefined);
 if(change==='pending selection'||change==='during refresh'){assert.equal(h.el('voiceReferenceSelect').value,'human-new');assert.equal(h.el('voiceReferenceText').value,'Human unsaved draft');}
});
function nativeReference(t){
 const os=require('node:os'),path=require('node:path'),{randomUUID}=require('node:crypto'),{registerDubService}=require('../src/dub-service');
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'critical-selection-'));t.after(()=>{assert(path.resolve(root).startsWith(path.resolve(os.tmpdir())+path.sep));fs.rmSync(root,{recursive:true,force:true});});const app=new EventEmitter();app.getPath=()=>root;
 const handlers=new Map(),sender={isDestroyed:()=>false,send:()=>{}},settingsFile=path.join(root,'dub-settings.json');
 registerDubService({app,ipcMain:{handle:(n,f)=>handlers.set(n,f)},authorized:()=>true,busy:()=>false,grantMedia:()=>{},owner:()=>null,dialog:{},environment:()=>({})});
 const id=randomUUID(),folder=path.join(root,'Sesler','Ses referansları',id);fs.mkdirSync(folder,{recursive:true});fs.writeFileSync(path.join(folder,'reference.wav'),require('./helpers/wav-fixture')());fs.writeFileSync(path.join(folder,'reference.txt'),'Original saved text');fs.writeFileSync(path.join(folder,'reference.json'),JSON.stringify({name:'Requested voice',createdAt:'2026-10-31'}));
 fs.writeFileSync(settingsFile,JSON.stringify({reference:path.join(root,'human-default.wav'),transcript:path.join(root,'human-default.txt')}));
 return {id,folder,settingsFile,call:(name,args)=>handlers.get('dub:'+name)({sender},args)};
}
for(const change of ['default','target text','target audio'])test('native saved-reference write atomically rejects changed '+change,async t=>{
 const h=nativeReference(t),before=(await h.call('references')).references[0];assert.match(before.selectionToken,/^[a-f0-9]{64}$/);assert.equal((await h.call('references')).references[0].selectionToken,before.selectionToken);
 if(change==='default')fs.writeFileSync(h.settingsFile,JSON.stringify({reference:'new-human-default.wav',transcript:'new-human-default.txt'}));
 if(change==='target text')fs.writeFileSync(require('node:path').join(h.folder,'reference.txt'),'New human transcript');
 if(change==='target audio'){const file=require('node:path').join(h.folder,'reference.wav');fs.utimesSync(file,new Date('2030-01-01'),new Date('2030-01-01'));}
 const settings=fs.readFileSync(h.settingsFile,'utf8'),text=fs.readFileSync(require('node:path').join(h.folder,'reference.txt'),'utf8');const result=await h.call('referenceUse',{id:h.id,text:'Old assistant text',expectedSelection:before.selectionToken});assert.equal(result.stale,true);assert.equal(fs.readFileSync(h.settingsFile,'utf8'),settings);assert.equal(fs.readFileSync(require('node:path').join(h.folder,'reference.txt'),'utf8'),text);
});
test('native unchanged reference approval applies; ordinary manual selection needs no assistant token',async t=>{
 const h=nativeReference(t),before=(await h.call('references')).references[0];assert((await h.call('referenceUse',{id:h.id,text:'Approved text',expectedSelection:before.selectionToken})).ok);assert.equal(fs.readFileSync(require('node:path').join(h.folder,'reference.txt'),'utf8'),'Approved text');assert((await h.call('referenceUse',{id:h.id,text:'Manual correction'})).ok);
});

test('provider revision never reads the credential value and still detects a credential edit event',async t=>{
 const h=translation(t),key=h.w.document.getElementById('translateApiKey');Object.defineProperty(key,'value',{get(){throw Error('credential value must not be read for revision');}});const before=await h.run('get_translation_profile');key.dispatchEvent(new h.w.Event('input',{bubbles:true}));const after=await h.run('get_translation_profile');assert.notEqual(after.selectionIdentity,before.selectionIdentity);
});
test('native stale refusal travels through real voice UI without claiming success',async t=>{
 const h=await preparedVoice(t),before=await h.run('list_voice_references');h.w.api.useVoiceReference=async()=>({ok:false,stale:true,error:'Native selection changed'});
 const result=await h.w.AssistantVoiceActions.execute('set_voice_reference',{reference_id:'voice-A'},{},{expectedSettings:{kind:'voice-reference',identity:before.selectionIdentity,selectionToken:'native-token'}});assert.equal(result.status,'failed');assert.equal(result.stale,true);
});
