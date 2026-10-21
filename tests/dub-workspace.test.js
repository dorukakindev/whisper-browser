const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {EventEmitter}=require('node:events');
const {registerDubWorkspace}=require('../src/dub-workspace');
const Model=require('../src/renderer/dub-workspace-model');
const {validate}=require('../src/renderer/dub-sync-map');
test('portable project owns its media and rejects path traversal, missing data and unauthorized IPC',async()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'dub486-'));
 try{
  const files={};for(const name of ['voice.wav','background.wav','music.wav','subtitles.srt','source.mp4']){files[name]=path.join(root,name);fs.writeFileSync(files[name],'fixture');}
  const handlers={},sender={isDestroyed:()=>false};let allowed=true;
  const target=path.join(root,'Türkçe.dubproject');
  const svc=registerDubWorkspace({ipcMain:{handle:(n,f)=>handlers[n]=f},authorized:()=>allowed,owner:()=>null,
   dialog:{showSaveDialog:async()=>({filePath:target}),showOpenDialog:async(_owner,opts)=>({filePaths:[opts.title.startsWith('Open ')?path.join(target,'project.json'):files['source.mp4']]})},
   authorizeMedia:async p=>{assert.ok(Object.values(files).includes(p)||p.startsWith(target));return p;},authorizeSubtitle:async p=>p,
   grantMedia:()=>{},grantSubtitle:()=>{}});
  const row={key:'1',text:'on iki kilometre.',displayText:'12 km.',speechRanges:[[0,1],[2,3]],sourceStart:10,sourceEnd:12,audioStart:0,audioEnd:3,status:'review',stretch:1.5};
  svc.register({path:files['voice.wav'],name:'Ses.wav',subtitle:files['subtitles.srt'],background:{path:files['background.wav']},quality:{groups:[row]}});
  const call=(n,r)=>handlers[n]({sender},r);
  allowed=false;assert.equal((await call('dub:projectSave',{path:files['voice.wav']})).ok,false);allowed=true;
  assert.equal((await call('dub:projectSave',{path:'unknown.wav'})).ok,false);
  assert.equal((await call('dub:projectSave',{path:files['voice.wav'],layers:{music:{path:files['music.wav']}},includeVideo:true,mix:{voice:.7}})).ok,true);
  const manifest=JSON.parse(fs.readFileSync(path.join(target,'project.json')));
  assert.equal(manifest.rows[0].text,row.text);assert.equal(manifest.rows[0].displayText,row.displayText);
  assert.ok(fs.readFileSync(path.join(target,manifest.files.subtitle),'utf8').includes('12 km.'));
  assert.ok(fs.readFileSync(path.join(target,manifest.files.spokenSubtitle),'utf8').includes('on iki kilometre.'));
  assert.deepEqual(manifest.rows[0].speechRanges,row.speechRanges);assert.equal(manifest.mix.voice,.7);assert.equal(manifest.files.music,'music.wav');
  assert.ok(!JSON.stringify(manifest).includes(root),'project contains only relative asset names');
  fs.unlinkSync(files['voice.wav']);
  const opened=await call('dub:projectOpen');assert.equal(opened.ok,true);assert.equal(opened.output.rows[0].audioEnd,3);assert.equal(opened.output.sourceSubtitle,path.join(target,'subtitles.srt'));assert.ok(opened.output.layers.music.url);assert.ok(opened.output.video.path.endsWith('source.mp4'));assert.equal(fs.readFileSync(opened.output.subtitle,'utf8').startsWith('\uFEFF'),true);
  assert.equal((await call('dub:projectSave',{path:opened.output.path})).ok,false,'existing project never overwritten');
  manifest.files.voice='../background.wav';fs.writeFileSync(path.join(target,'project.json'),JSON.stringify(manifest));
  assert.equal((await call('dub:projectOpen')).ok,false,'relative escape denied');
  manifest.files.voice='missing.wav';fs.writeFileSync(path.join(target,'project.json'),JSON.stringify(manifest));assert.equal((await call('dub:projectOpen')).ok,false);
  manifest.files.voice='voice.wav';manifest.rows[0].sourceEnd=-1;fs.writeFileSync(path.join(target,'project.json'),JSON.stringify(manifest));assert.equal((await call('dub:projectOpen')).ok,false);
 }finally{fs.rmSync(root,{recursive:true,force:true});}
});
test('mix and timeline validation are bounded; ducking attacks and releases around speech',()=>{
 const r={key:'1',text:'Konuşma',sourceStart:0,sourceEnd:1,audioStart:1,audioEnd:2,status:'ready'};
 assert.equal(Model.mix({voice:Infinity}).voice,1);assert.equal(Model.mix({voice:0}).voice,0);
 assert.equal(Model.duckAt([r],.9),0);assert.equal(Model.duckAt([r],1.08),1);assert.ok(Model.duckAt([r],2.2)<.5);assert.equal(Model.duckAt([r],3),0);
 assert.throws(()=>Model.groups([{...r,audioStart:NaN}]));
 const sync=validate({version:1,smooth:true,videoDuration:2,audioDuration:3,segments:[{v0:0,v1:2,a0:0,a1:3}]});assert.equal(sync.smooth,true);
});
test('cancelled export terminates its owned process and removes only its own partial output',async()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'dub486-cancel-'));
 try{
  const voice=path.join(root,'voice.wav'),keep=path.join(root,'keep.wav'),target=path.join(root,'export.wav');
  fs.writeFileSync(voice,'voice');fs.writeFileSync(keep,'preserve');
  const handlers={},sender=new EventEmitter();sender.isDestroyed=()=>false;let child,partial,notifySpawn;const spawned=new Promise(resolve=>{notifySpawn=resolve;});
  const svc=registerDubWorkspace({ipcMain:{handle:(n,f)=>handlers[n]=f},authorized:()=>true,owner:()=>null,
   dialog:{showSaveDialog:async()=>({filePath:target})},authorizeMedia:async p=>p,grantMedia:()=>{},
   python:()=>process.execPath,ffmpeg:()=> 'ffmpeg',
   spawn:(_exe,args)=>{partial=args[args.indexOf('--output')+1];fs.writeFileSync(partial,'unfinished');child=new EventEmitter();child.stdout=new EventEmitter();child.stderr=new EventEmitter();notifySpawn();return child;},
   terminate:async proc=>{assert.equal(proc,child);proc.emit('close',1);return true;}});
  svc.register({path:voice});const operation=handlers['dub:workspaceExport']({sender},{path:voice,kind:'audio'});
  await spawned;assert.ok(child);
  assert.equal((await handlers['dub:workspaceCancel']({sender:{}})).ok,false);
  assert.equal((await handlers['dub:workspaceCancel']({sender})).ok,true);
  const result=await operation;assert.equal(result.ok,false);assert.match(result.error,/Cancelled/);
  assert.equal(fs.existsSync(partial),false);assert.equal(fs.existsSync(target),false);assert.equal(fs.readFileSync(keep,'utf8'),'preserve');assert.equal(svc.running(),false);
 }finally{fs.rmSync(root,{recursive:true,force:true});}
});

 test('speech activity ducks only actual utterances; subtitle text stays separate',()=>{
 const row={key:'1',text:'on iki kilometre',displayText:'12 km',sourceStart:0,sourceEnd:3,audioStart:0,audioEnd:3,status:'ready',speechRanges:[[0,1],[2,3]]};
 const r=Model.groups([row])[0];assert.equal(r.displayText,'12 km');assert.equal(r.text,'on iki kilometre');
 assert.equal(Model.duckAt([r],1.6),0);assert.equal(Model.duckAt([r],2.5),1);
 assert.equal(Model.duckAt(Model.groups([{...row,speechRanges:[]}]),.5),0);
 assert.equal(Model.duckAt(Model.groups([{...row,speechRanges:[[9,10]]}]),.5),1,'invalid activity falls back to cue timing');
 });
