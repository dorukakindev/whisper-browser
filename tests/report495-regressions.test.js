const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const base=process.env.REPORT495_BASE || path.resolve(__dirname,'..');
const mod=n=>require(path.join(base,'src',n));
const {safeShortening}=mod('dub-text-guard');
test('495-01 percentage meaning survives speech rewriting',()=>{
 assert.equal(safeShortening('Oran %50 olarak belirlendi.','Oran 50 oldu.'),false);
 assert.equal(safeShortening('Oran %50 olarak belirlendi.','Oran %50 oldu.'),true);
 assert.equal(safeShortening('Oran yüzde 50 olarak belirlendi.','Oran %50 oldu.'),true);
});
test('495-02 measured units survive speech rewriting',()=>{
 assert.equal(safeShortening('Ağırlık 12 kg olarak ölçüldü.','Ağırlık 12 km.'),false);
 assert.equal(safeShortening('Ağırlık 12 kg olarak ölçüldü.','Ağırlık 12 kg.'),true);
 assert.equal(safeShortening('Ağırlık 12 kg olarak ölçüldü.','12 kilogram.'),true);
});
test('495-03 Turkish negative verbs survive speech rewriting',()=>{
 assert.equal(safeShortening('Bu insan yarın gelmeyecek.','Yarın gelecek.'),false);
 assert.equal(safeShortening('Bu insan yarın gelmeyecek.','Yarın gelmeyecek.'),true);
});
async function portable(extra){
 const folder=fs.mkdtempSync(path.join(os.tmpdir(),'dub495-')),handlers={};
 const voice=path.join(folder,'voice.wav'),target=path.join(folder,'fixture.dubproject');fs.writeFileSync(voice,'fixture');
 const {registerDubWorkspace}=mod('dub-workspace');
 const svc=registerDubWorkspace({ipcMain:{handle:(n,f)=>handlers[n]=f},authorized:()=>true,owner:()=>null,
  dialog:{showSaveDialog:async()=>({filePath:target}),showOpenDialog:async()=>({filePaths:[path.join(target,'project.json')]})},
  authorizeMedia:async p=>p,grantMedia:()=>{},grantSubtitle:()=>{}});
 svc.register({path:voice,...extra});const event={sender:{isDestroyed:()=>false}};
 try{assert.equal((await handlers['dub:projectSave'](event,{path:voice})).ok,true);
  const opened=await handlers['dub:projectOpen'](event);assert.equal(opened.ok,true,opened.error);return opened.output;
 }finally{fs.rmSync(folder,{recursive:true,force:true});}
}
test('495-04 portable projects retain missing-quality warning',async()=>{
 assert.equal((await portable({qualityUnavailable:true})).qualityUnavailable,true);
});
test('495-05 explicit subtitle off preference survives reopening',()=>{
 const {BrowserSubtitlePreferences}=mod('browser-subtitle-preferences');let saved;
 const s=new BrowserSubtitlePreferences({read:()=>null,write:v=>saved=v});
 s.put({url:'https://video.test/a',mediaId:'a',subtitleMode:'off',subtitleSelection:{primaryId:'',secondaryId:''}});
 assert.ok(saved);const r=new BrowserSubtitlePreferences({read:()=>saved,write:()=>{}});
 const id=mod('browser-media-identity').canonicalMediaIdentity('https://video.test/a').key;
 assert.equal(r.get(id).subtitleMode,'off');
});
test('495-06 merged subtitles cannot evade number-loss audit',()=>{
 const Q=mod('subtitle-pair-quality');
 const s=[{start:0,end:1,text:'There are 12 people.'},{start:1,end:2,text:'We have 3 cars.'}];
 const bad=Q.auditSubtitlePair(s,[{start:0,end:2,text:'İnsanlar ve arabalar var.'}]);
 assert.equal(bad.pass,false);assert.ok(bad.issues.numberMismatch.length);
 assert.equal(Q.auditSubtitlePair(s,[{start:0,end:2,text:'12 insan ve 3 araba var.'}]).issues.numberMismatch.length,0);
});
test('495-07 stable cue identities survive timing changes in review diff',()=>{
 const D=mod('translation-diff');const before=[{cueId:'a',start:0,end:1,text:'A old'},{cueId:'b',start:10,end:11,text:'B old'}];
 const after=[{cueId:'a',start:10,end:11,text:'A new'},{cueId:'b',start:0,end:1,text:'B new'}];
 assert.deepEqual(D.diffTranslationCues(before,after).map(r=>r.before),['A old','B old']);
});
test('495-08 simultaneous source cues match edits by exact base text',()=>{
 const R=mod('browser-subtitle-review'),a={start:0,end:2,text:'First speaker'},b={start:0,end:2,text:'Second speaker'};
 const r=R.reconcile([a,b],[{base:b,edited:{...b,text:'Reviewed second'}}]);
 assert.equal(r.conflicts.length,0);assert.deepEqual(r.cues.map(c=>c.text),['First speaker','Reviewed second']);
});
test('495-09 scientific quantities cannot silently change exponent',()=>{
 const Q=mod('subtitle-sentence-layout');
 assert.ok(Q.translationMeaningIssues('The mass is 1e6 kg.','Kütle 1e3 kg.').includes('number_mismatch'));
 assert.equal(Q.translationMeaningIssues('The mass is 1e6 kg.','Kütle 1000000 kg.').includes('number_mismatch'),false);
});
test('495-10 a missing series episode defaults to one, not zero',async()=>{
 let url;const S=mod('browser-subtitle-search');
 await S.searchSubtitles({query:'Fixture',imdbId:'tt1234567',season:2,episode:null},{apiKey:'',fetch:async u=>{url=u;return new Response('{"subtitles":[]}',{status:200});}});
 assert.match(url,/:2:1\.json$/);
});
test('495-11 downloaded subtitle headers without cues are rejected',async()=>{
 const S=mod('browser-subtitle-search');
 await assert.rejects(()=>S.downloadSubtitle({provider:'stremio',url:'https://example.strem.io/file.vtt'},{fetch:async()=>new Response('WEBVTT\n\nNOTE empty\n',{status:200})}),/altyazı/);
});
class Audio {constructor(){this.paused=true;this.readyState=4;this.duration=10;this.currentTime=0;this.playbackRate=1;}addEventListener(){}load(){}removeAttribute(){}pause(){this.paused=true;}play(){this.paused=false;return Promise.resolve();}}
test('495-12 stale browser telemetry restores original sound while dubbing pauses',async()=>{
 const C=mod('renderer/browser-dub-audio'),a=new Audio();let clock=0,muted=false;
 const c={mode:'player',tabId:'p',mediaKey:'fixture',priorMuted:false};
 const controller=new C({audio:a,context:()=>c,now:()=>clock,mute:async(_id,v)=>{muted=v;return {ok:true};}});
 try{await controller.attach({url:'file:///voice.wav'},c);controller.update({currentTime:2,paused:false});await new Promise(setImmediate);
  assert.equal(muted,true);clock=3000;controller.tick();await new Promise(setImmediate);assert.equal(muted,false);
 }finally{await controller.remove();}
});
test('495-13 portable projects retain their recorded generation settings',async()=>{
 const settings={profile:'quality',steps:15,timingMode:'video',verification:'detailed'};
 assert.deepEqual((await portable({settings})).settings,settings);
});
test('495-14 a ready speech row cannot have zero playable duration',()=>{
 const M=mod('renderer/dub-workspace-model');const row={key:'a',text:'Speech',sourceStart:0,sourceEnd:2,audioStart:1,audioEnd:1,status:'ready'};
 assert.throws(()=>M.groups([row]),/timeline/);assert.equal(M.groups([{...row,status:'failed'}])[0].status,'failed');
});
test('495-15 integrity counters exclude IDs from unrelated tracks',()=>{
 const I=mod('browser-translation-integrity');const cue={cueId:'a',start:0,end:1,text:'Speech'};
 const r=I.summarizeTranslationIntegrity({sourceCues:[cue],results:[cue],state:{total:1,completed:1},fileCueIds:['a','foreign'],displayedCueIds:['a','foreign']});
 assert.equal(r.writtenCues,1);assert.equal(r.displayedCues,1);assert.equal(r.status,'complete');
});
