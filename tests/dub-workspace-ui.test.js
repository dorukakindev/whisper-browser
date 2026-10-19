const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {JSDOM}=require('jsdom');
const dom=new JSDOM(fs.readFileSync(path.join(__dirname,'../src/renderer/index.html'),'utf8'),{runScripts:'outside-only'});
const w=dom.window,el=id=>w.document.getElementById(id);
w.DubWorkspaceModel=require('../src/renderer/dub-workspace-model');w.DubSyncMap=require('../src/renderer/dub-sync-map');
w.HTMLMediaElement.prototype.pause=w.HTMLMediaElement.prototype.load=()=>{};w.HTMLMediaElement.prototype.play=()=>Promise.resolve();
const row={key:'1',text:'<img src=x onerror=alert(1)> Gerçek cümle.',sourceStart:300,sourceEnd:302,audioStart:0,audioEnd:3,status:'review',stretch:1.5};
const output={path:'voice.wav',url:'file:///voice.wav',name:'Voice',quality:{groups:[row]},mix:{voice:.6},background:{path:'background.wav',url:'file:///background.wav'}};
let seek,save,exported,loaded;
w.BrowserDubAudioUI={context:()=>({tabId:'fixture',mediaKey:'fixture'}),seekSource:async time=>{seek=time;return true;},setMix(){},stop(){}};
w.api={openDubProject:async()=>({ok:true,output}),saveDubProject:async request=>{save=request;return {ok:true,path:'project.dubproject'};},
 exportDubWorkspace:async request=>{exported=request;return {ok:true,path:'out.wav'};},selectVideo:async()=>['music.wav'],dubWorkspaceAsset:async p=>({ok:true,asset:{path:p,url:'file:///'+p,name:p}})};
w.addEventListener('dub-workspace:loaded',e=>{loaded=e.detail;});
w.eval(fs.readFileSync(path.join(__dirname,'../src/renderer/dub-workspace-ui.js'),'utf8'));
const tick=()=>new Promise(setImmediate);
(async()=>{
 el('dubProjectOpen').click();await tick();assert.equal(loaded.path,'voice.wav');
 assert.equal(el('dubTimeline').children.length,1);assert.equal(el('dubTimeline').querySelector('img'),null,'sentence text is never HTML');
 el('dubTimeline').firstElementChild.click();await tick();assert.equal(seek,300);
 assert.equal(el('dubMixVoice').value,'0.6');
 el('dubMusicChoose').click();await tick();assert.match(el('dubLayerNames').textContent,/music.wav/);
 el('dubProjectSave').click();await tick();assert.equal(save.layers.music.path,'music.wav');assert.equal(save.mix.voice,.6);
 el('dubExportKind').value='dual';el('dubWorkspaceExport').click();await tick();assert.equal(exported.kind,'dual');
 w.dispatchEvent(new w.CustomEvent('dub-generator:busy',{detail:true}));assert.equal(el('dubProjectOpen').disabled,true);
 w.dispatchEvent(new w.CustomEvent('dub-generator:busy',{detail:false}));assert.equal(el('dubProjectOpen').disabled,false);
 w.DubWorkspaceUI.setOutput({path:'old.wav'});assert.equal(el('dubTimeline').children.length,0);assert.equal(el('dubTimelineListen').disabled,true);
 dom.window.close();console.log('dub-workspace-ui: timeline, safe text, layers, projects, exports and job locks passed');
})().catch(e=>{dom.window.close();console.error(e);process.exitCode=1;});
