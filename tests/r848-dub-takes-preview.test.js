'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{JSDOM}=require('jsdom');
const Dub=require('../src/renderer/browser-dub-audio'),root=path.join(__dirname,'..'),tick=()=>new Promise(setImmediate);
test('changing the selected take cancels an A switch waiting for metadata', async t => {
 const w = new JSDOM(fs.readFileSync(path.join(root,'src/renderer/index.html'),'utf8'),{runScripts:'outside-only'}).window;
 t.after(()=>w.close());
 const el=id=>w.document.getElementById(id);
 w.HTMLElement.prototype.scrollIntoView=()=>{};
 let plays=0,sourcePauses=0;
 w.HTMLMediaElement.prototype.load=function(){};
 w.HTMLMediaElement.prototype.pause=function(){};
 w.HTMLMediaElement.prototype.play=function(){plays++;this.dispatchEvent(new w.Event('play'));return Promise.resolve();};
 w.DubGeneratorUI={takeContext:()=>({id:'output',key:'1',owner:'fixture',busy:false})};
 w.BrowserDubAudioUI={context:()=>({}),pauseSource:()=>{sourcePauses++;},stop(){}};
 w.api={dubGroupTakes:async()=>({ok:true,choices:[
  {token:'A',current:true,url:'file:///current.wav'},
  {token:'B',url:'file:///first.wav'},
  {token:'C',url:'file:///second.wav'}
 ]})};
 w.eval(fs.readFileSync(path.join(root,'src/renderer/dub-group-takes-ui.js'),'utf8'));
 el('dubGeneratorDialog').open=true;
 w.dispatchEvent(new w.Event('dub-takes:open'));
 await tick();
 assert.equal(el('dubTakeChoice').value,'B');
 el('dubTakePlayA').click();
 el('dubTakeChoice').value='C';
 el('dubTakeChoice').dispatchEvent(new w.Event('change'));
 el('dubTakeCurrent').dispatchEvent(new w.Event('loadedmetadata'));
 await tick();
 assert.equal(el('dubTakePreview').getAttribute('src'),'file:///second.wav');
 assert.equal(plays,0);
 assert.equal(sourcePauses,0);
 Object.defineProperty(el('dubTakeCurrent'),'readyState',{value:4});
 el('dubTakePlayA').click();
 await tick();
 assert.equal(plays,1);
});
test('R848-04 raw A/B previews pause source and full dub while preserving preview mutual exclusion',async t=>{const w=new JSDOM(fs.readFileSync(path.join(root,'src/renderer/index.html'),'utf8'),{runScripts:'outside-only'}).window,el=id=>w.document.getElementById(id),states=new WeakMap(),state=a=>{if(!states.has(a))states.set(a,{paused:true,time:0});return states.get(a);};w.HTMLElement.prototype.scrollIntoView=()=>{};Object.defineProperties(w.HTMLMediaElement.prototype,{paused:{configurable:true,get(){return state(this).paused;}},readyState:{configurable:true,get(){return 4;}},duration:{configurable:true,get(){return 30;}},currentTime:{configurable:true,get(){return state(this).time;},set(v){state(this).time=v;}}});w.HTMLMediaElement.prototype.load=function(){};w.HTMLMediaElement.prototype.pause=function(){if(!state(this).paused){state(this).paused=true;this.dispatchEvent(new w.Event('pause'));}};w.HTMLMediaElement.prototype.play=function(){if(state(this).paused){state(this).paused=false;this.dispatchEvent(new w.Event('play'));}return Promise.resolve();};w.UiLocale={get:()=> 'en',t:s=>s};w.DubWorkspaceModel=require('../src/renderer/dub-workspace-model');w.DubSyncMap=require('../src/renderer/dub-sync-map');const context={mode:'player',tabId:'player',mediaKey:'fixture',mediaId:'fixture',generation:1,visible:true,hasMedia:true,priorMuted:false,playbackRate:1,volume:1},source=el('playerVideo'),full=el('browserDubAudio');let pauses=0,stops=0;const dub=new Dub({audio:full,context:()=>context,mute:async()=>({ok:true}),now:()=>1000});t.after(async()=>{await dub.remove();w.close();});w.BrowserDubAudioUI={context:()=>({...context}),seekSource:async()=>true,pauseSource:async expected=>{assert.deepEqual(expected,context);pauses++;source.pause();return true;},stop:()=>{stops++;return dub.remove();},setMix(){}};w.DubGeneratorUI={takeContext:()=>({id:'output',key:'1',owner:'fixture',busy:false,recipeReady:true}),useTake(){}};w.api={dubGroupTakes:async()=>({ok:true,choices:[{token:'A',levelDb:-12,current:true,text:'Current',url:'file:///current.wav',recordedAt:'2026-11-02T00:00:00Z',status:'ready'},{token:'B',levelDb:-18,current:false,text:'Previous',url:'file:///previous.wav',recordedAt:'2026-11-01T00:00:00Z',status:'ready'}]})};for(const name of ['dub-workspace-ui.js','dub-group-takes-ui.js'])w.eval(fs.readFileSync(path.join(root,'src/renderer',name),'utf8'));el('dubGeneratorDialog').open=true;w.DubWorkspaceUI.setOutput({id:'output',url:'file:///full.wav',quality:{groups:[{key:'1',text:'Current',group:1,status:'ready',sourceStart:0,sourceEnd:5,audioStart:0,audioEnd:5}]}},context);w.dispatchEvent(new w.Event('dub-takes:open'));await tick();await tick();assert(Math.abs(el('dubTakeCurrent').volume-Math.pow(10,-6/20))<1e-8);assert.equal(el('dubTakePreview').volume,1);assert.match(el('dubTakeLevel').textContent,/levels matched/);for(const target of ['dubTakePreview','dubTakeCurrent']){await dub.attach({name:'Full dub',url:'file:///full.wav'},context);await source.play();dub.update({currentTime:1,paused:false,readyState:4,playbackRate:1});await tick();assert.equal(full.paused,false);pauses=stops=0;if(target==='dubTakePreview')el('dubTakePlayB').click();else await el(target).play();await tick();assert.equal(source.paused,true);assert.equal(full.paused,true);assert.equal(el(target).paused,false);assert.equal(el(target==='dubTakePreview'?'dubTakeCurrent':'dubTakePreview').paused,true);assert(pauses>0);assert(stops>0);}await el('dubGeneratedPreview').play();assert.equal(el('dubTakeCurrent').paused,true);await el('dubTakePreview').play();assert.equal(el('dubGeneratedPreview').paused,true);w.api.dubGroupTakes=async()=>({ok:true,choices:[{token:'A',current:true,text:'No measurement',url:'file:///current.wav'}]});el('dubTakeRefresh').click();await tick();await tick();assert.equal(el('dubTakeCurrent').volume,1);assert.equal(el('dubTakePreview').volume,1);assert.match(el('dubTakeLevel').textContent,/unavailable/);el('dubGeneratorDialog').dispatchEvent(new w.Event('close'));assert.equal(el('dubTakePreview').paused,true);});
