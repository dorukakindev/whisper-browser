const {test}=require('node:test');
const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {EventEmitter}=require('node:events');
const {PersistentTranslationCache:Cache}=require('../src/browser-translation-cache');
const {summarizeTranslationIntegrity:integrity}=require('../src/browser-translation-integrity');
const Model=require('../src/renderer/dub-workspace-model');
const Sync=require('../src/renderer/dub-sync-map');
const Subs=require('../src/browser-subtitles');
const Output=require('../src/browser-subtitle-output');
const Contract=require('../src/subtitle-output-contract');
const {registerDubWorkspace}=require('../src/dub-workspace');
const row={key:'1',text:'Eksiksiz konuşma.',sourceStart:0,sourceEnd:1,audioStart:0,audioEnd:1,status:'ready',verification:{status:'passed'}};
const tick=()=>new Promise(setImmediate);
function fixture(){
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'wb527-'));
 const handlers={},sender=new EventEmitter();sender.isDestroyed=()=>false;
 const voice=path.join(root,'voice.wav');fs.writeFileSync(voice,'owned fixture');
 let save=path.join(root,'Dublaj.DUBPROJECT'),open,child,partial;
 let started;const spawned=new Promise(resolve=>started=resolve);
 const svc=registerDubWorkspace({ipcMain:{handle:(k,v)=>handlers[k]=v},authorized:()=>true,owner:()=>null,
  dialog:{showSaveDialog:async()=>({filePath:save}),showOpenDialog:async()=>({filePaths:[open]})},
  authorizeMedia:async file=>file,authorizeSubtitle:async file=>file,grantMedia(){},grantSubtitle(){},
  python:()=>process.execPath,ffmpeg:()=> 'ffmpeg',
  spawn:(_exe,args)=>{child=new EventEmitter();child.stdout=new EventEmitter();child.stderr=new EventEmitter();partial=args[args.indexOf('--output')+1];fs.writeFileSync(partial,'partial');started();return child;},
  terminate:async()=>{child.emit('close',1);return true;}});
 return {root,voice,svc,spawned,call:(name,r)=>handlers[name]({sender},r),
  setSave:p=>save=p,setOpen:p=>open=p,get child(){return child;},get partial(){return partial;},
  clean(){fs.rmSync(root,{recursive:true,force:true});}};
}

test('idle flush releases its promise before future translations are persisted',async()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'wb527-cache-'));let c;
 try{
  c=new Cache(path.join(root,'cache.json'));c.set('first','ilk');assert.equal((await c.flush()).ok,true);
  await c.flush();assert.equal(c.flushPromise,null);
  c.set('second','ikinci');await c.flush();clearTimeout(c.timer);
  const restored=new Cache(c.filePath);assert.equal(restored.get('second'),'ikinci');
  await c.flush();c.set('third','üçüncü');await c.flush();
  assert.equal(new Cache(c.filePath).get('third'),'üçüncü');
 }finally{clearTimeout(c?.timer);fs.rmSync(root,{recursive:true,force:true});}
});

test('covered IDs outside a timed translation cannot claim file or display completion',()=>{
 const sourceCues=[{id:'x',start:0,end:1,text:'one'},{id:'y',start:4,end:5,text:'two'}];
 const bad={id:'x',coveredCueIds:['x','y'],start:0,end:1,text:'bir'};
 for(const stage of ['results','fileCues','displayedCues']){
  const value={sourceCues,results:[{...bad,end:5}],state:{total:1,completed:1},[stage]:[bad]};
  const out=integrity(value);assert.equal(out.status,'partial',stage);
  assert.equal(out[stage==='results'?'missingCues':stage==='fileCues'?'missingFileCues':'missingDisplayCues'],1);
 }
 assert.equal(integrity({sourceCues,results:[{...bad,end:5}],state:{total:1,completed:1}}).status,'complete');
 assert.equal(integrity({sourceCues,results:[{...bad,start:undefined,end:undefined}],state:{total:1,completed:1}}).status,'complete','legacy identity-only rows remain supported');
});

test('quality states preserve failed verification across register and project roundtrips',async()=>{
 const f=fixture();try{
  for(const status of ['review','unavailable']){
   const value=f.svc.register({path:f.voice,quality:{groups:[{...row,verification:{status}}]}});
   assert.equal(value.rows[0].status,'review');assert.equal(value.quality.groups[0].status,'review');
  }
  assert.equal(Model.groups([{...row,verification:{status:'passed',review:true}}])[0].status,'review');
  assert.equal(Model.groups([{...row,status:'failed'}])[0].status,'failed');
  for (const verification of [{}, {status:'invented'}, [], {status:null}])assert.equal(Model.groups([{...row,verification}])[0].status,'review');
  assert.equal(Model.groups([{...row,verification:{status:'not_checked'}}])[0].status,'ready');
  f.svc.register({path:f.voice,quality:{groups:[{...row,verification:{status:'review'}}]}});
  assert.equal((await f.call('dub:projectSave',{path:f.voice})).ok,true);
  f.setOpen(path.join(f.root,'Dublaj.DUBPROJECT','project.json'));
  const result=await f.call('dub:projectOpen');assert.equal(result.ok,true);assert.equal(result.output.rows[0].status,'review');
 }finally{f.clean();}
});

test('unaddressable or structural subtitle text cannot be installed as project rows',()=>{
 for(const key of ['',' ','\t'])assert.throws(()=>Model.groups([{...row,key}]));
 for(const text of ['hi\u0000there','hi\n\n2\n00:00:05,000 --> 00:00:06,000\nforged']){
  assert.throws(()=>Model.groups([{...row,text}]));assert.throws(()=>Model.groups([{...row,displayText:text}]));
 }
 assert.equal(Model.groups([{...row,text:'Birinci\nİkinci'}])[0].text,'Birinci\nİkinci');
});

test('timing maps reject negative origins and backward steps instead of jumping audio',()=>{
 for(const coordinate of ['v0','a0']){
  const segment={v0:0,v1:1,a0:0,a1:1,[coordinate]:-.0005};
  assert.throws(()=>Sync.validate({version:1,videoDuration:1,audioDuration:1,segments:[segment]}));
 }
 assert.throws(()=>Sync.validate({version:1,videoDuration:2,audioDuration:2.9995,segments:[
  {v0:0,v1:1,a0:0,a1:2},{v0:1,v1:2,a0:1.9995,a1:2.9995}]}));
 assert.throws(()=>Sync.validate({version:1,videoDuration:3,audioDuration:4,segments:[
  {v0:0,v1:1,a0:0,a1:2},{v0:2,v1:3,a0:2.96,a1:4}]}),'a gap cannot introduce a 40 ms backward audio jump');
 const rounded=Sync.validate({version:1,videoDuration:3,audioDuration:4,segments:[
  {v0:0,v1:1,a0:0,a1:2},{v0:2,v1:3,a0:2.99999,a1:4}]});
 assert.equal(rounded.segments[1].a0,3,'submillisecond gap noise is normalized continuously');
 const sync=Sync.validate({version:1,smooth:true,videoDuration:2,audioDuration:3,segments:[{v0:0,v1:1,a0:0,a1:2},{v0:1,v1:2,a0:2,a1:3}]});
 let previous=-1;for(let n=0;n<=100;n++){const mapped=Sync.at(sync,n/50).time;assert(mapped>=previous);previous=mapped;}
});

test('Windows project suffix and UTF8 BOM are recognized without losing assets',async()=>{
 const f=fixture();try{
  f.svc.register({path:f.voice,quality:{groups:[row]}});
  const saved=await f.call('dub:projectSave',{path:f.voice});assert.equal(saved.ok,true);assert.equal(saved.path,path.join(f.root,'Dublaj.DUBPROJECT'));
  const file=path.join(saved.path,'project.json');fs.writeFileSync(file,'\uFEFF'+fs.readFileSync(file,'utf8'));
  f.setOpen(file);const opened=await f.call('dub:projectOpen');assert.equal(opened.ok,true);assert.equal(opened.output.rows[0].text,row.text);
 }finally{f.clean();}
});

test('missing adaptive timing map cannot silently become an ordinary-video export',async()=>{
 const f=fixture();try{
  const saved=f.svc.register({path:f.voice,settings:{timingMode:'video'},quality:{groups:[row]}});
  assert.equal(saved.syncInvalid,true);
  assert.equal((await f.call('dub:workspaceExport',{path:f.voice,kind:'video'})).ok,false);
  assert.equal((await f.call('dub:projectSave',{path:f.voice})).ok,true);
  const file=path.join(f.root,'Dublaj.DUBPROJECT','project.json');const doc=JSON.parse(fs.readFileSync(file));doc.syncInvalid=false;fs.writeFileSync(file,JSON.stringify(doc));f.setOpen(file);
  const loaded=await f.call('dub:projectOpen');assert.equal(loaded.ok,true);assert.equal(loaded.output.syncInvalid,true);
 }finally{f.clean();}
});

test('export errors retain the live worker and partial output until confirmed close',async()=>{
 const f=fixture();try{
  f.setSave(path.join(f.root,'export.wav'));f.svc.register({path:f.voice,quality:{groups:[row]}});
  const operation=f.call('dub:workspaceExport',{path:f.voice,kind:'audio'});await f.spawned;
  f.child.emit('error',new Error('controlled runtime failure'));await tick();
  assert.equal(f.svc.running(),true);assert.equal(fs.existsSync(f.partial),true);
  assert.equal((await f.call('dub:projectOpen')).ok,false,'second work must stay blocked');
  assert.doesNotThrow(()=>f.child.emit('error',new Error('second runtime failure')));
  f.child.emit('close',0);const result=await operation;assert.equal(result.ok,false);assert.match(result.error,/second runtime failure/);
  assert.equal(fs.existsSync(f.partial),false);assert.equal(fs.existsSync(path.join(f.root,'export.wav')),false);assert.equal(f.svc.running(),false);
 }finally{f.clean();}
});

test('CR-only and CRLF subtitle files preserve lines across supported timed formats',()=>{
 const documents=[['srt','1\n00:00:00,000 --> 00:00:01,000\nMerhaba.\n\n2\n00:00:02,000 --> 00:00:03,000\nDünya.'],
  ['vtt','WEBVTT\n\n00:00:00.000 --> 00:00:01.000\nMerhaba.\n\n00:00:02.000 --> 00:00:03.000\nDünya.'],
  ['ass','[Script Info]\nScriptType: v4.00+\n[Events]\nFormat: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\nDialogue: 0,0:00:00.00,0:00:01.00,Default,,0,0,0,,Merhaba.\nDialogue: 0,0:00:02.00,0:00:03.00,Default,,0,0,0,,Dünya.'],
  ['lrc','[00:00.00]Merhaba.\n[00:02.00]Dünya.']];
 for(const [extension,text] of documents)for(const newline of ['\n','\r\n','\r']){
  const parsed=Subs.parseSubtitlePayload(text.replaceAll('\n',newline),'','file.'+extension);
  assert.deepEqual(parsed.cues.map(c=>c.text),['Merhaba.','Dünya.'],extension+JSON.stringify(newline));
 }
 for(const format of ['srt','vtt','ass'])for(const newline of ['\n','\r\n','\r']){
  const output=Output.buildBrowserSubtitleDocument([{start:0,end:2,text:'Satır'+newline+'devam'}],format);
  assert.equal(output.cues[0].text,'Satır\ndevam');
 }
});

test('a translation failure without totals cannot be normalized into complete',()=>{
 for(const failed of [1,3,10]){
  const value=Contract.outputDescriptors({outputs:[{path:'x.tr.srt',role:'translation',failed}]})[0];
  assert.equal(value.status,'partial');assert.equal(value.failed,failed);assert.equal(value.completed,0);
 }
 assert.equal(Contract.outputDescriptors({outputs:[{path:'x.srt',role:'source'}]})[0].status,'complete');
});
