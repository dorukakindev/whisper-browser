const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),vm=require('node:vm');
const root=process.env.REPORT496_BASE || path.resolve(__dirname,'..');
const mod=name=>require(path.join(root,'src',name));
const source=fs.readFileSync(path.join(root,'src/main.js'),'utf8');
function temporary(fn){const folder=fs.mkdtempSync(path.join(os.tmpdir(),'report496-'));try{return fn(folder);}finally{fs.rmSync(folder,{recursive:true,force:true});}}
function indexed(fn){return temporary(folder=>{const {WatchIndex}=mod('watch-index');const index=new WatchIndex(path.join(folder,'index.sqlite'));try{return fn(index);}finally{index.close();}});}
const anchor=(start,exact='Repeated quotation')=>({version:2,kind:'text',documentId:'page',exact,positionStart:start,positionEnd:start+exact.length});
test('496-01 merging libraries preserves the chosen file size',()=>{
 const M=mod('media-relink-matcher');const r=M.mergeWatchItems({key:'file:old',sizeBytes:900},{key:'file:new',sizeBytes:200});assert.equal(r.sizeBytes,200);
});
test('496-02 subtitle index retains canonical cue identities',()=>indexed(index=>{
 index.upsertMedia({id:'media'});index.upsertTrack({id:'track',mediaId:'media'});
 index.replaceTrackCues('track',[{cueId:'canonical-a',id:'temporary-a',start:0,end:1,text:'Searchable phrase'}]);
 assert.equal(index.searchCues('Searchable')[0].cue_id,'canonical-a');
}));
test('496-03 relinking cannot overwrite an existing index target',()=>indexed(index=>{
 index.upsertMedia({id:'old',title:'Old'});index.upsertMedia({id:'target',title:'Keep',position:80});
 assert.throws(()=>index.renameMediaId('old','target'));
 assert.equal(index.getMedia('target').title,'Keep');assert.equal(index.getMedia('old').title,'Old');
}));
test('496-04 repeated web quotations keep distinct anchor identities',()=>{
 const L=mod('browser-learning'),raw={mediaId:'page',type:'quote',source:'Repeated quotation'};
 assert.notEqual(L.normalizeAnnotation({...raw,anchor:anchor(10)}).id,L.normalizeAnnotation({...raw,anchor:anchor(100)}).id);
});
test('496-05 unsaving a new quotation cannot delete another quote at time zero',()=>{
 const L=mod('browser-learning');const saved=L.normalizeAnnotation({mediaId:'page',type:'quote',source:'First quotation',anchor:anchor(10,'First quotation')});
 assert.equal(L.matchingLearningAnnotation([saved],'quote',{mediaId:'page',source:'Second quotation',anchor:anchor(100,'Second quotation')}),null);
});
test('496-06 context updates retain omitted user note metadata',()=>temporary(folder=>{
 const {BrowserNoteStore}=mod('browser-note-store'),s=new BrowserNoteStore(path.join(folder,'notes.json'));
 s.upsert({id:'note',mediaId:'page',source:'Original',note:'Keep',tags:['important'],links:['https://example.test/read'],anchor:anchor(10),status:'known'});
 const next=s.upsert({id:'note',mediaId:'page',source:'Corrected'});
 assert.deepEqual(next.tags,['important']);assert.equal(next.links.length,1);assert.equal(next.anchor.positionStart,10);assert.equal(next.status,'known');assert.equal(next.note,'Keep');
 assert.deepEqual(s.upsert({id:'note',mediaId:'page',tags:[]}).tags,[]);
}));
test('496-06 real annotation IPC preserves user metadata on context refresh',async()=>{
 const folder=fs.mkdtempSync(path.join(os.tmpdir(),'note-ipc496-'));
 try{
  const {BrowserNoteStore}=mod('browser-note-store'),L=mod('browser-learning'),store=new BrowserNoteStore(path.join(folder,'notes.json'));
  const raw={mediaId:'page',type:'quote',source:'Repeated quotation',anchor:anchor(10)};
  const original=store.upsert({...raw,tags:['important'],note:'Keep',status:'known'});
  const handlers={},start=source.indexOf("ipcMain.handle('library:annotations:toggle'"),end=source.indexOf("ipcMain.handle('browser:research:list'",start);
  vm.runInNewContext(source.slice(start,end),{ipcMain:{handle:(n,f)=>handlers[n]=f},authorizedBrowserSender:()=>true,
   normalizeAnnotation:L.normalizeAnnotation,matchingLearningAnnotation:L.matchingLearningAnnotation,loadWatchLibrary:()=>[],
   persistentBrowserMediaUrl:v=>v,ensureBrowserNotesReady:()=>store,watchIndex:()=>null,ensureIndexMediaForAnnotation:()=>{}});
  const result=await handlers['library:annotations:toggle']({}, {annotation:raw,saved:true});
  assert.equal(result.ok,true,result.error);assert.equal(result.annotation.id,original.id);assert.deepEqual(result.annotation.tags,['important']);assert.equal(result.annotation.note,'Keep');
 }finally{fs.rmSync(folder,{recursive:true,force:true});}
});
test('496-07 structurally corrupt note rows recover the valid backup',()=>temporary(folder=>{
 const {BrowserNoteStore}=mod('browser-note-store'),file=path.join(folder,'notes.json');
 fs.writeFileSync(file,JSON.stringify({version:1,annotations:[null]}));
 fs.writeFileSync(file+'.bak',JSON.stringify({version:1,annotations:[{id:'keep',mediaId:'page',note:'Keep'}]}));
 const store=new BrowserNoteStore(file);assert.equal(store.recoveredFromBackup,true);assert.equal(store.get('keep').note,'Keep');
}));
test('496-08 a source or wrong-language subtitle does not satisfy a translation watch job',()=>{
 const W=mod('watch-folder'),video=path.resolve('fixture.mp4');
 const wrong=new Set([path.resolve('fixture.en.srt'),path.resolve('fixture.srt')]);
 assert.equal(W.hasConfiguredWatchOutput(video,{translateTo:'tr'},p=>wrong.has(p)),false);
 wrong.add(path.resolve('fixture.tr.srt'));assert.equal(W.hasConfiguredWatchOutput(video,{translateTo:'tr'},p=>wrong.has(p)),true);
});
test('496-09 zero-byte output cannot make the real folder scanner skip a video',()=>temporary(folder=>{
 const W=mod('watch-folder'),file=path.join(folder,'video.mp4');fs.writeFileSync(file,'video');fs.writeFileSync(path.join(folder,'video.srt'),'');
 const call=source.match(/const hasOutput = (hasConfiguredWatchOutput\(\s*file, watchOutputConfig,[\s\S]*?\));/)[1];
 const scope={file,watchOutputConfig:{formats:'srt'},fs,hasConfiguredWatchOutput:W.hasConfiguredWatchOutput,
  isUsableWatchOutput:W.isUsableWatchOutput,outputEntriesFor:()=>['video.srt']};
 assert.equal(vm.runInNewContext(call,scope),false);
 scope.watchOutputConfig.langSuffix=true;assert.equal(vm.runInNewContext(call,scope),false);
}));
const item=(id,status='pending')=>({id,type:'file',input:'fixture.mp4',status,opts:{}});
test('496-10 oversized queues are rejected before dropping jobs',()=>{
 assert.equal(mod('queue-persistence').validateQueueOptions({version:1,items:Array.from({length:501},(_,i)=>item(i+1))}).ok,false);
});
test('496-11 stale saves cannot drop the active queue job',()=>{
 const Q=mod('queue-persistence'),disk={version:1,queueRunning:true,currentQueueId:1,items:[item(1,'running'),item(2)]};
 const merged=Q.mergeQueueSnapshotForSave(disk,{version:1,items:[item(2)]},1);
 assert.equal(merged.items.find(i=>i.id===1)?.status,'running');assert.equal(merged.currentQueueId,1);
 assert.equal(Q.mergeQueueSnapshotForSave(disk,{items:[item(1)]},1).items[0].status,'running');
 disk.items[0].status='done';assert.equal(Q.mergeQueueSnapshotForSave(disk,{items:[]},1).items[0].status,'done');
});
test('496-12 future queue schemas are rejected and their files preserved',()=>temporary(folder=>{
 const Q=mod('queue-persistence');assert.equal(Q.validateQueueOptions({version:99,items:[]}).ok,false);
 const target=path.join(folder,'queue.json'),original=JSON.stringify({version:99,items:[item(1)],future:'Keep'});fs.writeFileSync(target,original);
 const start=source.indexOf('function writeQueueState(raw)'),end=source.indexOf('\nfunction loadQueueState',start);
 const scope={queueStatePath:()=>target,queueSnapshotForDisk:Q.queueSnapshotForDisk,fs,
  readQueueStateRaw:()=>JSON.parse(fs.readFileSync(target)),writeJsonAtomic:(file,value)=>fs.writeFileSync(file,JSON.stringify(value))};
 vm.runInNewContext(source.slice(start,end),scope);assert.equal(scope.writeQueueState({version:1,items:[]}).ok,false);
 assert.equal(fs.readFileSync(target,'utf8'),original);
 fs.writeFileSync(target+'.bak',original);fs.writeFileSync(target,'{broken');
 assert.equal(scope.writeQueueState({version:1,items:[]}).ok,false);
 assert.equal(fs.readFileSync(target,'utf8'),'{broken');assert.equal(fs.readFileSync(target+'.bak','utf8'),original);
}));
test('496-13 notebook Markdown exports redact source/link credentials',()=>{
 const R=mod('browser-research-notebook');const text=R.researchAnnotationsToMarkdown([{mediaUrl:'https://u:SECRET@example.test/read?token=SECRET&id=2',
  links:[{url:'https://example.test/a;jsessionid=SECRET#/read?token=SECRET&id=3'}]}]);
 assert.doesNotMatch(text,/SECRET/);assert.match(text,/id=2/);assert.match(text,/id=3/);
});
test('496-14 Windows file key aliases resolve to one library identity',()=>{
 const S=mod('watch-library-store');assert.equal(S.canonicalWatchKey('file:C:\\Movies\\..\\Film.mp4'),S.canonicalWatchKey('file:C:/Film.mp4'));
 const L=mod('browser-learning');assert.equal(L.normalizeAnnotation({mediaId:'file:C:\\Movies\\..\\Film.mp4'}).mediaId,'file:c:/film.mp4');
 indexed(index=>{
  const alias='file:C:/Movies/../Film.mp4',key='file:c:/film.mp4';
  index.upsertMedia({id:alias});index.upsertTrack({id:'old-track',mediaId:alias});
  index.migrateLegacyWatchLibrary([{key,legacyKeys:[alias]}]);
  assert.equal(index.getTrack('old-track').media_id,key);assert.equal(index.getMedia(alias),null);
 });
});
test('496-15 unreported HLS stalls cannot combine separate stable windows',()=>{
 const H=mod('hls-recovery').createHlsRecoveryState();H.sourceChanged('fixture');const attempt=H.beginRecovery('network');H.completeRecovery(attempt.token);H.playbackStarted(0,0);
 for(let i=1;i<=36;i++)H.playbackProgress(i*.25,i*250);
 for(let i=1;i<=8;i++)H.playbackProgress(9,9000+i*250);
 const result=H.playbackProgress(10,12000);assert.equal(result.reset,false);assert.equal(H.snapshot().networkAttempts,1);
});
test('496-16 queued provider URLs redact matrix and fragment credentials',()=>{
 const Q=mod('queue-persistence');const result=Q.clonePublicOptions({providerUrl:'https://example.test/api;jsessionid=SECRET#/route?token=SECRET&id=2'});
 assert.doesNotMatch(JSON.stringify(result),/SECRET/);assert.match(result.providerUrl,/id=2/);
});
