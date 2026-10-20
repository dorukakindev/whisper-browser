const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {EventEmitter}=require('node:events');
const {registerDubWorkspace}=require('../src/dub-workspace');
const Model=require('../src/renderer/dub-workspace-model');

test('duplicate sentence keys cannot select or regenerate the wrong sentence',()=>{
 const row={key:'1',text:'Bir cümle.',sourceStart:0,sourceEnd:1,audioStart:0,audioEnd:1};
 assert.throws(()=>Model.groups([row,{...row,sourceStart:2,sourceEnd:3}]),/Invalid/);
});

test('failed or inconsistent projects do not grant partial asset access',async()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'report488-import-'));
 try{
  const handlers={},grants=[],file=path.join(root,'project.json');
  fs.writeFileSync(path.join(root,'voice.wav'),'fixture');
  registerDubWorkspace({ipcMain:{handle:(n,f)=>handlers[n]=f},authorized:()=>true,owner:()=>null,
   dialog:{showOpenDialog:async()=>({filePaths:[file]})},grantMedia:p=>grants.push(p),grantSubtitle:p=>grants.push(p)});
  const value={format:'whisper-dub-project',version:1,files:{voice:'voice.wav',music:'missing.wav'},rows:[]};
  fs.writeFileSync(file,JSON.stringify(value));
  const e={sender:{isDestroyed:()=>false}};
  assert.equal((await handlers['dub:projectOpen'](e)).ok,false);assert.deepEqual(grants,[]);
 }finally{fs.rmSync(root,{recursive:true,force:true});}
});

test('project resave and export inherit stored mix and layers when controls are omitted',async()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'report488-defaults-'));
 try{
  const handlers={},sender={isDestroyed:()=>false};let exportCfg;
  const voice=path.join(root,'voice.wav'),music=path.join(root,'music.wav');
  fs.writeFileSync(voice,'voice');fs.writeFileSync(music,'music');
  let target=path.join(root,'Saved.dubproject');
  const service=registerDubWorkspace({ipcMain:{handle:(n,f)=>handlers[n]=f},authorized:()=>true,owner:()=>null,
   dialog:{showSaveDialog:async()=>({filePath:target})},authorizeMedia:async p=>p,grantMedia:()=>{},
   python:()=>process.execPath,ffmpeg:()=> 'ffmpeg',
   spawn:(_exe,args)=>{exportCfg=JSON.parse(fs.readFileSync(args[args.indexOf('--request')+1],'utf8'));fs.writeFileSync(args[args.indexOf('--output')+1],'export');const c=new EventEmitter();c.stdout=new EventEmitter();c.stderr=new EventEmitter();queueMicrotask(()=>c.emit('close',0));return c;}});
  service.register({path:voice,mix:{voice:.2,background:.3},layers:{music:{path:music}}});
  assert.equal((await handlers['dub:projectSave']({sender},{path:voice})).ok,true);
  const saved=JSON.parse(fs.readFileSync(path.join(target,'project.json'),'utf8'));
  assert.equal(saved.mix.voice,.2);assert.equal(saved.files.music,'music.wav');
  target=path.join(root,'Export.wav');
  assert.equal((await handlers['dub:workspaceExport']({sender},{path:voice,kind:'audio'})).ok,true);
  assert.equal(exportCfg.mix.voice,.2);assert.equal(exportCfg.music,music);
 }finally{fs.rmSync(root,{recursive:true,force:true});}
});

test('project range length must agree with source timing map',async()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'report488-range-'));
 try{
  const handlers={},file=path.join(root,'project.json');fs.writeFileSync(path.join(root,'voice.wav'),'voice');
  registerDubWorkspace({ipcMain:{handle:(n,f)=>handlers[n]=f},authorized:()=>true,owner:()=>null,
   dialog:{showOpenDialog:async()=>({filePaths:[file]})},grantMedia:()=>{},grantSubtitle:()=>{}});
  const value={format:'whisper-dub-project',version:1,files:{voice:'voice.wav'},rows:[],range:{start:10,end:14},
   sync:{version:1,videoDuration:3,audioDuration:4,segments:[{v0:0,v1:3,a0:0,a1:4}]}};
  fs.writeFileSync(file,JSON.stringify(value));
  assert.equal((await handlers['dub:projectOpen']({sender:{isDestroyed:()=>false}})).ok,false);
 }finally{fs.rmSync(root,{recursive:true,force:true});}
});
