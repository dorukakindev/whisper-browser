'use strict';
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const repo=path.resolve(process.env.AUDIT822_REPO||process.cwd());assert.equal(fs.existsSync(path.join(repo,'src/workspace-package.js')),true,'Run from repository root or set AUDIT822_REPO');
const out=path.resolve(process.env.AUDIT822_OUT||path.join(repo,'.uiprev/audit822-packages-'+Date.now()));fs.mkdirSync(out,{recursive:true});
// Keep Python/ZIP intermediate files inside the authorized synthetic area.
process.env.TMP=out;process.env.TEMP=out;
const req=n=>require(path.join(repo,'src',n));
const core=req('workspace-package'),video=req('workspace-video-package');
const python=path.join(repo,'backend/venv/Scripts/python.exe');
const makeRoot=name=>{const p=path.join(out,name);fs.mkdirSync(p,{recursive:true});return p;};
const watch=root=>req('watch-library-store').createWatchLibraryStore({filePath:path.join(root,'watch-library.json')});
const canon=req('watch-library-store').canonicalWatchKey;
function service(root,selected){
 let handler,restarts=0;const storage={};
 const owner={webContents:{executeJavaScript:async code=>vm.runInNewContext(code,{localStorage:{getItem:k=>storage[k]??null,setItem:(k,v)=>{storage[k]=v;},removeItem:k=>{delete storage[k];}}})}};
 const result=req('media-catalog-service').registerMediaCatalogService({ipcMain:{handle:(name,fn)=>{if(name==='media-catalog:request')handler=fn;}},dialog:{showOpenDialog:async()=>({canceled:false,filePaths:[selected()]}),showSaveDialog:async()=>({canceled:true})},owner:()=>owner,authorized:()=>true,userData:()=>root,pythonPath:()=>python,inspectMedia:p=>p,grantMedia:()=>true,watchItems:()=>watch(root).load(),nativeImage:{},restart:()=>{restarts++;},canRestore:()=>true});
 return {call:input=>handler({sender:{id:822}},input),store:result.store,restarts:()=>restarts};
}
async function setup(name){
 const root=makeRoot(name),media=path.join(makeRoot('source-media'),'clip.mp4');fs.writeFileSync(media,Buffer.from('SYNTHETIC VIDEO BYTES: PACKAGE TRANSPORT ONLY'));
 const svc=service(root,()=>media);const saved=svc.store().upsert({id:'fixture-film',kind:'film',title:'Fixture Film'});assert.equal(saved.id,'fixture-film');
 assert.equal((await svc.call({action:'source-file',id:'fixture-film'})).ok,true);
 watch(root).upsert({key:canon('file:'+media),localPath:media,sourceRef:media,type:'local',title:'Fixture Film',position:123,duration:600,prefs:{speed:1.25}});
 assert.equal((await svc.call({action:'list'})).items[0].progress.position,123);
 return {root,media,svc};
}
async function inspect(root,selected){const svc=service(root,()=>selected);const listed=await svc.call({action:'list'});assert.equal(listed.ok,true);const played=await svc.call({action:'play',id:'fixture-film'});return {listed,played,rows:watch(root).load()};}
(async()=>{
 const source=await setup('source');const bundle=path.join(out,'fixture-video.wbp');
 const exported=await video.exportWithVideos(source.root,bundle,{},python);assert.equal(exported.videos,1);
 const target=makeRoot('target-video');let selected='';const importer=service(target,()=>selected||bundle);
 const preview=await importer.call({action:'package-preview'});assert.equal(preview.ok,true);
 const applied=await importer.call({action:'package-apply',token:preview.token});assert.equal(applied.ok,true);assert.equal(importer.restarts(),1);
 selected=JSON.parse(fs.readFileSync(path.join(target,'media-catalog.json'))).items[0].source.value;
 assert.equal(fs.readFileSync(selected).toString(),fs.readFileSync(source.media).toString());
 const imported=await inspect(target,selected);assert.equal(imported.played.watchItem.prefs,undefined);
 assert.equal(imported.played.ok,true);assert.equal(imported.listed.items[0].progress,null);assert.equal(imported.played.watchItem.position,0);assert.equal(imported.played.watchItem.prefs,undefined);assert.equal(imported.rows[0].position,123);assert.notEqual(imported.rows[0].key,imported.played.watchItem.key);
 // Negative control: no relocation keeps the original identity and resume state.
 const plain=path.join(out,'fixture-plain.wbp');core.exportPackage(source.root,plain);const targetPlain=makeRoot('target-plain');core.restorePackage(targetPlain,core.readPackage(plain));const plainResult=await inspect(targetPlain,source.media);
 assert.equal(plainResult.listed.items[0].progress.position,123);assert.equal(plainResult.played.watchItem.position,123);
 // Positive mapping control: ordinary absolute path fields do relocate correctly.
 assert.equal(imported.rows[0].localPath,selected);assert.equal(imported.rows[0].sourceRef,selected);
 // Same failure without optional video packaging, using the real missing-folder wizard contract.
 const movedDir=makeRoot('relocated-media'),moved=path.join(movedDir,'clip.mp4');fs.copyFileSync(source.media,moved);fs.unlinkSync(source.media);
 const targetMapped=makeRoot('target-mapped');let mapSelection=plain;const mappedSvc=service(targetMapped,()=>mapSelection);const mappedPreview=await mappedSvc.call({action:'package-preview'});assert.equal(mappedPreview.ok,true);assert.equal(mappedPreview.missingMedia.some(row=>row.root===path.dirname(source.media)),true);
 const mappedApply=await mappedSvc.call({action:'package-apply',token:mappedPreview.token,mediaMappings:[[path.dirname(source.media),movedDir]]});assert.equal(mappedApply.ok,true);
 const mapped=await inspect(targetMapped,moved);assert.equal(mapped.played.ok,true);assert.equal(mapped.played.watchItem.position,0);assert.equal(mapped.rows[0].localPath,moved);
 const result={head:require('node:child_process').execFileSync('git',['rev-parse','HEAD'],{cwd:repo,encoding:'utf8'}).trim(),exported,preview:{ok:preview.ok,videos:preview.videos,count:preview.count},applied,restarts:importer.restarts(),video:{catalogPath:selected,videoBytesEqual:true,progress:imported.listed.items[0].progress,play:imported.played.watchItem,retainedHistory:imported.rows},noRelocationControl:{progress:plainResult.listed.items[0].progress,playPosition:plainResult.played.watchItem.position},manualMapping:{progress:mapped.listed.items[0].progress,playPosition:mapped.played.watchItem.position,retainedHistory:mapped.rows},boundaries:['Real JS export/preview/apply/catalog store/watch store/list/play and Python ZIP writer/reader/extractor','Owner executeJavaScript localStorage runs in VM; native picker, restart, inspect/grant controlled','Synthetic .mp4 bytes are transport fixture; actual media decoding/GPU/native UI not tested']};
 fs.writeFileSync(path.join(out,'result.json'),JSON.stringify(result,null,2));console.log(JSON.stringify({ok:true,videoPosition:result.video.play.position,noMovePosition:result.noRelocationControl.playPosition,mappingPosition:result.manualMapping.playPosition}));
})().catch(e=>{console.error(e);process.exitCode=1;});
