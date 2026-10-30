'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {EventEmitter}=require('node:events');
const {JSDOM}=require('jsdom');
const root=path.join(__dirname,'..'),tick=()=>new Promise(setImmediate);
const deferred=()=>{let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve};};
function workspace(t){
 const dom=new JSDOM(fs.readFileSync(path.join(root,'src/renderer/index.html'),'utf8'),{runScripts:'outside-only'});t.after(()=>dom.window.close());
 const w=dom.window,el=id=>w.document.getElementById(id);
 w.DubWorkspaceModel=require('../src/renderer/dub-workspace-model');w.DubSyncMap=require('../src/renderer/dub-sync-map');
 w.HTMLMediaElement.prototype.pause=function(){this.paused=true;};w.HTMLMediaElement.prototype.load=()=>{};
 for(const id of ['dubGeneratedPreview','dubMixBackgroundAudio','dubMixMusicAudio','dubMixAmbienceAudio'])for(const [k,v]of Object.entries({paused:true,readyState:4,duration:20}))Object.defineProperty(el(id),k,{value:v,writable:true});
 w.BrowserDubAudioUI={context:()=>({mediaKey:'video'}),setMix(){},stop(){},pauseSource:async()=>true};
 w.api={selectVideo:async()=>['music.wav'],dubWorkspaceAsset:async()=>({ok:true,asset:{path:'music.wav',url:'file:///music.wav'}})};
 w.eval(fs.readFileSync(path.join(root,'src/renderer/dub-workspace-ui.js'),'utf8'));
 return {w,el,set:o=>w.DubWorkspaceUI.setOutput(o)};
}
test('491-05 preview background has one pending play and cannot start after stop',async t=>{
 const {w,el,set}=workspace(t);set({path:'v.wav',url:'file:///v.wav',background:{url:'file:///b.wav'}});
 const voice=el('dubGeneratedPreview'),bg=el('dubMixBackgroundAudio'),play=deferred();let calls=0;
 voice.play=()=>{voice.paused=false;voice.dispatchEvent(new w.Event('play'));return Promise.resolve();};bg.play=()=>{calls++;return play.promise;};
 el('dubMixPreview').click();await tick();
 for(let i=0;i<4;i++)el('dubMixVoice').dispatchEvent(new w.Event('input'));await tick();
 assert.equal(calls,1);el('dubMixStop').click();play.resolve();await tick();assert.equal(bg.paused,true);
});
test('491-06 layer picker cannot attach its result to a replacement output',async t=>{
 const {w,el,set}=workspace(t),pick=deferred();w.api.selectVideo=()=>pick.promise;
 set({path:'old.wav',url:'file:///old.wav'});el('dubMusicChoose').click();
 const next={path:'new.wav',url:'file:///new.wav'};set(next);pick.resolve(['music.wav']);await tick();
 assert.equal(w.DubWorkspaceUI.attachment(next).layers.music,undefined);
});
test('491-07 late cancellation reply cannot overwrite successful export status',async t=>{
 const {w,el,set}=workspace(t),save=deferred(),cancel=deferred();w.api.saveDubProject=()=>save.promise;w.api.cancelDubWorkspace=()=>cancel.promise;
 set({path:'voice.wav',url:'file:///voice.wav'});el('dubProjectSave').click();el('dubWorkspaceCancel').click();
 save.resolve({ok:true,path:'project.dubproject'});await tick();assert.equal(el('dubWorkspaceStatus').textContent,'Kaydedildi.');
 cancel.resolve({ok:true});await tick();assert.equal(el('dubWorkspaceStatus').textContent,'Kaydedildi.');
});
function service(t){
 const folder=fs.mkdtempSync(path.join(os.tmpdir(),'report491-'));t.after(()=>fs.rmSync(folder,{recursive:true,force:true}));
 const engine=path.join(folder,'desktop','Ses','VoxCPM2');fs.mkdirSync(path.join(engine,'.venv','Scripts'),{recursive:true});
 for(const name of ['kitap_ortak.py','anlatici_ham.wav','anlatici_ham.txt','.venv/Scripts/python.exe'])fs.writeFileSync(path.join(engine,name),'fixture');
 const srt=path.join(folder,'source.srt');fs.writeFileSync(srt,'fixture');
 const app=new EventEmitter();app.getPath=n=>n==='desktop'?path.join(folder,'desktop'):folder;
 const sender=new EventEmitter();sender.id=1;sender.isDestroyed=()=>false;const events=[];sender.send=(_n,e)=>events.push(e);
 const handlers={},grants=[];let child,kills=0,output;
 const svc=require('../src/dub-service').registerDubService({app,ipcMain:{handle:(n,f)=>handlers[n]=f},authorized:()=>true,authorizeSubtitle:async p=>p,
  busy:()=>false,environment:()=>({PATH:''}),grantMedia:p=>grants.push(p),
  spawn:(_p,args)=>{output=args[args.indexOf('--output')+1];child=new EventEmitter();child.exitCode=null;child.stdout=new EventEmitter();child.stderr=new EventEmitter();child.stdout.setEncoding=child.stderr.setEncoding=()=>{};return child;},
  terminate:async p=>{kills++;p.exitCode=1;p.emit('close',1);return true;}});
 return {svc,sender,events,grants,start:()=>handlers['dub:start']({sender},{id:'fixture',srt,keepEngine:false}),child:()=>child,output:()=>output,kills:()=>kills};
}
test('491-08 renderer destruction terminates its owned GPU job',async t=>{
 const f=service(t);assert.equal((await f.start()).ok,true);f.sender.emit('destroyed');await tick();
 assert.equal(f.kills(),1);assert.equal(f.svc.running(),false);assert.equal(f.sender.listenerCount('destroyed'),0);
});
test('491-09 sync failure preserves an authorized playable recovery output',async t=>{
 const f=service(t);await f.start();fs.writeFileSync(f.output(),require('./helpers/wav-fixture')());f.child().emit('close',0);
 const error=f.events.at(-1);assert.equal(error.type,'error');assert.equal(fs.existsSync(error.recoverablePath),true);
 assert.ok(f.grants.includes(error.recoverablePath));assert.match(error.recoverableUrl,/^file:/);
 const dom=new JSDOM(fs.readFileSync(path.join(root,'src/renderer/index.html'),'utf8'),{runScripts:'outside-only'});t.after(()=>dom.window.close());
 const w=dom.window,el=id=>w.document.getElementById(id);let emit,request,opened;
 w.HTMLMediaElement.prototype.pause=w.HTMLMediaElement.prototype.load=()=>{};
 w.BrowserDubAudioUI={context:()=>({mode:'player',tabId:'p',mediaKey:'m',visible:true,hasMedia:true})};w.syncBrowserOcclusion=()=>{};
 w.api={dubConfig:async()=>({ok:true,ready:true}),planDub:async()=>({ok:true,sourceHash:'fixture',groups:[{key:'1',text:'Fixture speech.',start:0,end:2000,seconds:2}]}),latestDub:async()=>({ok:true}),selectFile:async()=>'/source.srt',onDubEvent:f=>emit=f,startDub:async r=>{request=r;return {ok:true};},openPath:async p=>{opened=p;return '';}};
 el('dubGeneratorDialog').showModal=()=>{};w.DubRunInfo=require('../src/renderer/dub-run-info');w.eval(fs.readFileSync(path.join(root,'src/renderer/dub-generator-ui.js'),'utf8'));
 el('playerDubGenerate').click();await tick();el('dubChooseSrt').click();await tick();el('dubGeneratorStart').click();await tick();
 emit({...error,id:request.id});el('dubGeneratorOutput').click();await tick();
 assert.equal(opened,error.recoverablePath);assert.equal(el('dubGeneratedPreview').getAttribute('src'),error.recoverableUrl);
 assert.equal(el('dubGeneratorUse').classList.contains('hidden'),true);
});
test('491-10 AI speech edits cannot replace a person with a prefix-matching name',()=>{
 const safe=require('../src/dub-text-guard').safeShortening;
 assert.equal(safe('Bugün Ali evine geldi.','Bugün Alim geldi.'),false);
 assert.equal(safe('Bugün Ali evine geldi.','Ali geldi.'),true);
});
test('491-11 AI speech edits cannot flip a negative measurement positive',()=>{
 const safe=require('../src/dub-text-guard').safeShortening;
 assert.equal(safe('Sıcaklık -5 derece oldu.','Sıcaklık 5 derece.'),false);
 assert.equal(safe('Sıcaklık -5 derece oldu.','-5 derece.'),true);
});
