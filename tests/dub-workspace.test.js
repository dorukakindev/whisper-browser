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
  const row={key:'1',text:'Bir cümle.',sourceStart:10,sourceEnd:12,audioStart:0,audioEnd:3,status:'review',stretch:1.5};
  svc.register({path:files['voice.wav'],name:'Ses.wav',subtitle:files['subtitles.srt'],background:{path:files['background.wav']},quality:{groups:[row]}});
  const call=(n,r)=>handlers[n]({sender},r);
  allowed=false;assert.equal((await call('dub:projectSave',{path:files['voice.wav']})).ok,false);allowed=true;
  assert.equal((await call('dub:projectSave',{path:'unknown.wav'})).ok,false);
  assert.equal((await call('dub:projectSave',{path:files['voice.wav'],layers:{music:{path:files['music.wav']}},includeVideo:true,mix:{voice:.7}})).ok,true);
  const manifest=JSON.parse(fs.readFileSync(path.join(target,'project.json')));
  assert.equal(manifest.rows[0].text,row.text);assert.equal(manifest.mix.voice,.7);assert.equal(manifest.files.music,'music.wav');
  assert.ok(!JSON.stringify(manifest).includes(root),'project contains only relative asset names');
  fs.unlinkSync(files['voice.wav']);
  const opened=await call('dub:projectOpen');assert.equal(opened.ok,true);assert.equal(opened.output.rows[0].audioEnd,3);assert.ok(opened.output.layers.music.url);assert.ok(opened.output.video.path.endsWith('source.mp4'));assert.equal(fs.readFileSync(opened.output.subtitle,'utf8').startsWith('\uFEFF'),true);
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
