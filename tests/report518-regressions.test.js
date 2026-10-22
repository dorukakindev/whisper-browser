const test=require('node:test'), assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const Dub=require('../src/renderer/browser-dub-audio');
const {BrowserAssetStore}=require('../src/browser-asset-store');
const {BrowserTranslationArchive}=require('../src/browser-translation-archive');
const {validVoiceOutput}=require('../src/voice-output');
const tick=()=>new Promise(setImmediate);
function temp(t){const dir=fs.mkdtempSync(path.join(os.tmpdir(),'r518-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));return dir;}
test('518-01 late play completion cannot restart removed voice or background',async()=>{
 for(const channel of ['voice','background']){
  let resolve;
  function audio(){return {currentTime:0,duration:100,readyState:4,paused:true,addEventListener(){},
   pause(){this.paused=true;},play(){this.paused=false;return Promise.resolve();},load(){},removeAttribute(){}};}
  const voice=audio(),background=audio(),a=channel==='voice'?voice:background;
  a.play=()=>new Promise(r=>{resolve=()=>{a.paused=false;r();};});
  const ctx={mode:'player',tabId:'v',mediaKey:'v'};
  const dub=new Dub({audio:voice,backgroundAudio:background,context:()=>ctx,mute:async()=>({ok:true}),
   urls:{createObjectURL:()=> 'blob:fixture',revokeObjectURL(){}}});
  try{
   await dub.attach({name:'voice.wav',background:channel==='background'?{url:'background.wav'}:null},ctx);
   dub.update({currentTime:2,paused:false,readyState:4});await tick();
   assert.equal(typeof resolve,'function');await dub.remove();resolve();await tick();
   assert.equal(a.paused,true,channel+' resumed after removal');
  }finally{await dub.remove();}
 }
});
test('518-03 speech translation identity survives asset persistence',t=>{
 const store=new BrowserAssetStore({rootDir:temp(t)});
 const saved=store.putTrack({mediaId:'movie',trackId:'speech',role:'translation',forSpeech:true,
  speechProtocol:'speech-v6-context-review',cues:[{start:0,end:2,text:'Tam bir cümle.'}]});
 const loaded=store.getTrack(saved.assetId);assert.equal(loaded.ok,true);
 assert.equal(loaded.document.forSpeech,true);assert.equal(loaded.document.speechProtocol,'speech-v6-context-review');
});
test('518-04 credentials cannot enter persisted provider metadata',t=>{
 const root=temp(t),provider='https://user:password@example.test/v1?api_key=secret&region=eu';
 const store=new BrowserAssetStore({rootDir:path.join(root,'assets')});
 const saved=store.putTrack({mediaId:'movie',provider,cues:[{start:0,end:2,text:'Metin'}]});
 const doc=JSON.parse(fs.readFileSync(saved.jsonPath));assert.equal(doc.provider,'https://example.test/v1?region=eu');
 const archive=new BrowserTranslationArchive(path.join(root,'archive'));
 archive.saveSubtitle({mediaId:'movie',provider,cues:[{start:0,end:2,text:'Metin'}]});
 const file=fs.readdirSync(archive.subtitleDir).find(n=>n.endsWith('.json'));
 const record=JSON.parse(fs.readFileSync(path.join(archive.subtitleDir,file)));
 assert.equal(record.provider,doc.provider);
});
test('518-05 corrupt or future archive index cannot be replaced by an empty one',t=>{
 const root=temp(t);
 for(const bytes of ['{broken',JSON.stringify({version:900,entries:[]})]){
  fs.writeFileSync(path.join(root,'index.json'),bytes);
  const archive=new BrowserTranslationArchive(root);
  assert.throws(()=>archive.saveSubtitle({mediaId:'movie',cues:[{start:0,end:2,text:'Metin'}]}),/preserved/);
  assert.equal(fs.readFileSync(path.join(root,'index.json'),'utf8'),bytes);
  assert.equal(fs.existsSync(archive.subtitleDir),false);
 }
});
test('518-06 empty, header-only, fake and truncated WAV cannot be successful output',t=>{
 const file=path.join(temp(t),'voice.wav'),wav=Buffer.alloc(48);
 wav.write('RIFF');wav.writeUInt32LE(40,4);wav.write('WAVEfmt ',8);wav.writeUInt32LE(16,16);
 wav.writeUInt16LE(1,20);wav.writeUInt16LE(1,22);wav.writeUInt32LE(24000,24);wav.writeUInt16LE(2,32);
 wav.writeUInt16LE(16,34);wav.write('data',36);wav.writeUInt32LE(4,40);
 for(const bytes of [Buffer.alloc(0),wav.subarray(0,44),Buffer.alloc(100),wav.subarray(0,46)]){
  fs.writeFileSync(file,bytes);assert.equal(validVoiceOutput(file),false);
 }
 fs.writeFileSync(file,wav);assert.equal(validVoiceOutput(file),true);
});
