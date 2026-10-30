const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),vm=require('node:vm');
const {EventEmitter}=require('node:events');
const {JSDOM}=require('jsdom');
const root=path.join(__dirname,'..'),turn=()=>new Promise(setImmediate);
function generator(latest=null){
 const dom=new JSDOM(fs.readFileSync(path.join(root,'src/renderer/index.html'),'utf8'),{runScripts:'outside-only'});
 const w=dom.window,el=id=>w.document.getElementById(id),calls=[];
 w.HTMLMediaElement.prototype.pause=w.HTMLMediaElement.prototype.load=()=>{};
 w.syncBrowserOcclusion=()=>{};
 w.BrowserDubAudioUI={context:()=>({mode:'player',tabId:'player-video',mediaKey:'fixture',hasMedia:true,visible:true}),attachGenerated:async()=>{calls.push('attached');return true;}};
 let event,request;
 w.api={dubConfig:async()=>({ok:true,ready:true}),latestDub:async()=>({ok:true,output:latest}),
  selectFile:async()=>'fixture.srt',planDub:async()=>({ok:true,sourceHash:'fixture',groups:[{key:'1',text:'Original.',start:0,end:1000,seconds:1}]}),
  onDubEvent:fn=>{event=fn;},startDub:async value=>{request=value;return {ok:true};}};
 el('dubGeneratorDialog').showModal=()=>{};
 w.DubRunInfo=require('../src/renderer/dub-run-info');w.eval(fs.readFileSync(path.join(root,'src/renderer/dub-generator-ui.js'),'utf8'));
 return {w,el,calls,close:()=>w.close(),event:value=>event(value),request:()=>request};
}

test('493-02: recovered/project voices with invalid maps cannot attach to a video',async()=>{
 const g=generator({path:'voice.wav',url:'file:///voice.wav',syncInvalid:true});
 try{
  g.el('dubMainOpen').click();await turn();
  assert.equal(g.el('dubGeneratorUse').classList.contains('hidden'),true);
  g.el('dubGeneratorUse').click();await turn();assert.equal(g.calls.length,0);
  g.w.dispatchEvent(new g.w.CustomEvent('dub-workspace:loaded',{detail:{path:'other.wav',url:'file:///other.wav',syncInvalid:true}}));
  assert.equal(g.el('dubGeneratorUse').classList.contains('hidden'),true);
 }finally{g.close();}
});

test('493-03: saving and reopening preserves an invalid timing-map warning',async()=>{
 const {registerDubWorkspace}=require('../src/dub-workspace');
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'dub493-')),handlers={};
 try{
  const voice=path.join(dir,'voice.wav'),target=path.join(dir,'test.dubproject');fs.writeFileSync(voice,'fixture');
  const sender=new EventEmitter();sender.isDestroyed=()=>false;
  const svc=registerDubWorkspace({ipcMain:{handle:(n,f)=>handlers[n]=f},authorized:()=>true,owner:()=>null,
   dialog:{showSaveDialog:async()=>({filePath:target}),showOpenDialog:async()=>({filePaths:[path.join(target,'project.json')]})},
   authorizeMedia:async p=>p,grantMedia:()=>{},grantSubtitle:()=>{}});
  svc.register({path:voice,syncInvalid:true});
  assert.equal((await handlers['dub:projectSave']({sender},{path:voice})).ok,true);
  const result=await handlers['dub:projectOpen']({sender});
  assert.equal(result.ok,true);assert.equal(result.output.syncInvalid,true);
  assert.equal((await handlers['dub:workspaceExport']({sender},{path:result.output.path,kind:'video'})).ok,false);
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});

test('493-06: overlapping workspace stop attempts share termination; rejected stop does not discard export',async()=>{
 const {registerDubWorkspace}=require('../src/dub-workspace');
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'dub493-cancel-')),handlers={};
 let child,release,notify,calls=0;
 const spawned=new Promise(resolve=>{notify=resolve;});
 try{
  const voice=path.join(dir,'voice.wav');fs.writeFileSync(voice,'fixture');
  const sender=new EventEmitter();sender.isDestroyed=()=>false;
  const svc=registerDubWorkspace({ipcMain:{handle:(n,f)=>handlers[n]=f},authorized:()=>true,owner:()=>null,
   dialog:{showSaveDialog:async()=>({filePath:path.join(dir,'export.wav')})},authorizeMedia:async p=>p,grantMedia:()=>{},
   python:()=>process.execPath,ffmpeg:()=>'ffmpeg',
   spawn:(_,args)=>{fs.writeFileSync(args[args.indexOf('--output')+1],'finished');child=new EventEmitter();child.stdout=new EventEmitter();child.stderr=new EventEmitter();notify();return child;},
   terminate:()=>{calls++;return new Promise(resolve=>{release=resolve;});}});
  svc.register({path:voice});
  const exported=handlers['dub:workspaceExport']({sender},{path:voice,kind:'audio'});await spawned;
  const first=handlers['dub:workspaceCancel']({sender}),second=handlers['dub:workspaceCancel']({sender});
  await turn();assert.equal(calls,1);
  release(false);assert.equal((await first).ok,false);assert.equal((await second).ok,false);
  child.emit('close',0);
  assert.equal((await exported).ok,true);
 }finally{if(child && !release)child.emit('close',1);fs.rmSync(dir,{recursive:true,force:true});}
});

test('493-07: an applied text edit reaches selected-group regeneration',async()=>{
 const g=generator();
 try{
  g.el('dubMainOpen').click();await turn();g.el('dubChooseSrt').click();await turn();
  g.el('dubPlanPrepare').click();await turn();g.el('dubGeneratorStart').click();await turn();
  g.event({id:g.request().id,type:'done',url:'file:///voice.wav',quality:{groups:[{group:1,key:'1',status:'review'}]}});
  g.el('dubPlanText').value='New reviewed wording.';g.el('dubPlanApply').click();
  g.el('dubRegenerateGroup').click();await turn();
  assert.equal(g.request().dubText.edits['1'],'New reviewed wording.');
 }finally{g.close();}
});

test('493-08: browser task rows retain real progress when rendered by the player task center',()=>{
 const source=fs.readFileSync(path.join(root,'src/renderer/renderer.js'),'utf8');
 const from=source.indexOf('function browserTaskRow(job)'),to=source.indexOf('function updatePlayerTaskCenter(',from);
 const Model=require('../src/player-task-center'),scope={PlayerTaskCenterModel:Model};
 vm.createContext(scope);vm.runInContext(source.slice(from,to),scope);
 const row=scope.browserTaskRow({id:'t',kind:'subtitle-translation',status:'running',completed:39,total:224});
 assert.equal(Model.progressOf(row).percent,39/224*100);
});

test('493-12: real SQLite permits nested library transactions and rolls back only failed inner work',()=>{
 const {WatchIndex}=require('../src/watch-index');
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'watch493-'));let index;
 try{
  index=new WatchIndex(path.join(dir,'index.sqlite'));
  index.upsertMedia({id:'old',title:'Original'});
  index.transaction(()=>index.renameMediaId('old','new'));
  assert.equal(index.db.prepare('SELECT title FROM media WHERE id=?').get('new').title,'Original');
  index.transaction(()=>{
   assert.throws(()=>index.transaction(()=>{index.upsertMedia({id:'bad'});throw Error('inner');}),/inner/);
   index.upsertMedia({id:'good'});
  });
  assert.equal(index.db.prepare('SELECT COUNT(*) AS n FROM media WHERE id=?').get('bad').n,0);
  assert.equal(index.db.prepare('SELECT COUNT(*) AS n FROM media WHERE id=?').get('good').n,1);
 }finally{index?.db?.close();fs.rmSync(dir,{recursive:true,force:true});}
});

test('493-13: failed SQLite relink restores the already-written JSON library',async()=>{
 const source=fs.readFileSync(path.join(root,'src/main.js'),'utf8');
 const from=source.indexOf('async function relinkLibraryItem('),to=source.indexOf("ipcMain.handle('library:relink'",from);
 const original=[{key:'file:old',title:'Original'}];let library=original.slice(),restored=false;
 const scope={loadWatchLibraryAll:()=>library,mediaFileAccess:{inspect:p=>p,grant:()=>true},
  ensureBrowserNotesReady:()=>({list:()=>[]}),
  watchIndex:()=>({transaction:fn=>fn(),renameMediaId:()=>{throw Error('controlled SQL failure');}}),
  watchLibraryStore:()=>({upsert:item=>{library.push(item);return item;},remove:key=>{library=library.filter(v=>v.key!==key);return true;}}),
  saveWatchLibrary:items=>{library=items;restored=true;return true;}};
 vm.createContext(scope);vm.runInContext(source.slice(from,to),scope);
 await assert.rejects(scope.relinkLibraryItem('file:old','C:/new.mp4'),/SQL failure/);
 assert.equal(restored,true);assert.deepEqual(library,original);
});

test('493-14: page search keeps separate query and SPA documents while redacting credentials',()=>{
 const {WatchIndex,safePageIndexUrl}=require('../src/watch-index');
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'pages493-'));let index;
 try{
  index=new WatchIndex(path.join(dir,'index.sqlite'));
  for(const route of ['?id=1','?id=2','#/watch/1','#/watch/2'])index.upsertPage({url:'https://example.test/article'+route,content:'This document contains searchable material.'});
  assert.equal(index.db.prepare('SELECT COUNT(*) AS n FROM pages').get().n,4);
  assert.equal(safePageIndexUrl('https://u:p@example.test/article?id=1&token=hidden#plain'),'https://example.test/article?id=1');
 }finally{index?.db?.close();fs.rmSync(dir,{recursive:true,force:true});}
});

test('493-16: real canonical notes follow relink/merge and restore on a later transaction failure',async()=>{
 const {BrowserNoteStore}=require('../src/browser-note-store');
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'notes493-'));
 try{
  const file=path.join(dir,'notes.json'),notes=new BrowserNoteStore(file);
  notes.upsert({id:'n',mediaId:'file:old',note:'Personal note',source:'Text'});
  const source=fs.readFileSync(path.join(root,'src/main.js'),'utf8');
  const from=source.indexOf('async function relinkLibraryItem('),to=source.indexOf("ipcMain.handle('library:relink'",from);
  let library=[{key:'file:old'}],fail=false;
  const scope={loadWatchLibraryAll:()=>library,mediaFileAccess:{inspect:p=>p,grant:()=>true},ensureBrowserNotesReady:()=>notes,
   watchIndex:()=>({transaction:fn=>{fn();if(fail)throw Error('commit failed');},renameMediaId:()=>{}}),
   watchLibraryStore:()=>({upsert:item=>{library.push(item);return item;},remove:key=>{library=library.filter(v=>v.key!==key);return true;}}),
   saveWatchLibrary:items=>{library=items;return true;}};
  vm.createContext(scope);vm.runInContext(source.slice(from,to),scope);
  await scope.relinkLibraryItem('file:old','C:/new.mp4');
  assert.equal(new BrowserNoteStore(file).list('file:c:/new.mp4')[0]?.note,'Personal note');
  fail=true;await assert.rejects(scope.relinkLibraryItem('file:c:/new.mp4','C:/later.mp4'),/commit failed/);
  assert.equal(new BrowserNoteStore(file).list('file:c:/new.mp4').length,1);
  // Merging must move only source notes, preserving existing target notes.
  notes.upsert({id:'t',mediaId:'target',note:'Target note'});
  const begin=source.indexOf("ipcMain.handle('library:dupes-merge'"),end=source.indexOf('// Madde 31',begin);
  library=[{key:'file:c:/new.mp4'},{key:'target'}];fail=false;let merge;
  Object.assign(scope,{ipcMain:{handle:(_n,fn)=>{merge=fn;}},authorizedBrowserSender:()=>true,
   mergeWatchItems:(_s,t)=>t,watchIndex:()=>({transaction:fn=>fn(),mergeMediaIds:()=>{},upsertMedia:()=>{}})});
  vm.runInContext(source.slice(begin,end),scope);
  assert.equal(merge({}, {sourceKey:'file:c:/new.mp4',targetKey:'target'}).ok,true);
  assert.equal(new BrowserNoteStore(file).list('target').length,2);
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});

test('493-19: queued local dubbing cleanup cannot mute or change speed of a newly opened video',()=>{
 const source=fs.readFileSync(path.join(root,'src/renderer/browser-dub-ui.js'),'utf8');
 const start=source.indexOf('mute: (id,'),end=source.indexOf('changed: (s,',start);
 const video={muted:true,playbackRate:1.5,currentTime:0};
 const scope={player:{mediaKey:'new'},video,window:{api:{}},notify:()=>{}};vm.createContext(scope);
 const callbacks=vm.runInContext('({'+source.slice(start,end)+'})',scope);
 callbacks.mute('player-video',false,{mediaKey:'old'});
 callbacks.setRate({tabId:'player-video',mediaKey:'old',rate:1,release:true});
 assert.equal(video.muted,true);assert.equal(video.playbackRate,1.5);
 callbacks.mute('player-video',false,{mediaKey:'new'});
 callbacks.setRate({tabId:'player-video',mediaKey:'new',rate:1});
 assert.equal(video.muted,false);assert.equal(video.playbackRate,1);
});

test('493-20: a new stage with unknown percentage remains indeterminate',()=>{
 const Model=require('../src/player-task-center');
 assert.equal(Model.progressOf({percent:null}).indeterminate,true);
 assert.equal(Model.progressOf({percent:null,completed:5,total:10}).percent,50);
 assert.equal(Model.progressOf({percent:0,completed:5,total:10}).percent,0);
});
