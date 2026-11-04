'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {versionKey}=require('../src/media-hub-service');
const {safeFile,registerMediaTorrents}=require('../src/media-torrents');
test('Version grouping keeps episodes and folders separate without merging playback identities',()=>{
 assert.equal(versionKey('Film.2025.1080p.WEB-DL.mkv'),versionKey('Film.2025.2160p.BluRay.mp4'));
 assert.notEqual(versionKey('Series.S01E01.1080p.mkv'),versionKey('Series.S01E02.1080p.mkv'));
 assert.notEqual(versionKey('a/Film.1080p.mkv'),versionKey('b/Film.1080p.mkv'));
});
test('Torrent paths reject Windows device aliases and corrupt index cannot be overwritten',async()=>{
 for(const name of ['../a.mp4','a/../b.mp4','NUL.mp4','foo /bar.mp4','C:/a.mp4'])assert.throws(()=>safeFile({name,length:100},0));
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'torrent-index-')),file=path.join(dir,'torrent-library.json');fs.writeFileSync(file,'corrupt data');
 try{
  const service=registerMediaTorrents({app:{getPath:()=>dir,whenReady:()=>Promise.resolve(),on(){}},ipcMain:{handle(){}},authorized:()=>true,protocol:{handle(){}},enginePath:()=>path.join(dir,'not-installed.exe')});
  const r=await service.handler({}, {action:'preview',magnet:'anything'});assert.equal(r.ok,false);assert.match(r.error,/preserved/);assert.equal(fs.readFileSync(file,'utf8'),'corrupt data');
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});


test('internal torrent media protocol rejects unissued tokens, wrong routes and methods without network access', async () => {
 const {EventEmitter}=require('node:events');
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'torrent-protocol-'));
 const app=new EventEmitter();app.getPath=()=>dir;app.whenReady=()=>Promise.resolve();
 let handle,network=0;
 try {
  const service=registerMediaTorrents({app,ipcMain:{handle(){}},authorized:()=>false,
   protocol:{handle(name,fn){assert.equal(name,'whisper-media');handle=fn;}},
   fetchImpl:async()=>{network++;throw Error('Network must not be used');}});
  await Promise.resolve();assert.equal(typeof handle,'function');
  for(const url of ['whisper-media://unissued/video','whisper-media://unissued/../secret','whisper-media://unissued/video?file=C:/private.mp4']) {
   const response=await handle(new Request(url));assert.equal(response.status,404);
  }
  assert.equal((await handle(new Request('whisper-media://unissued/video',{method:'POST'}))).status,405);
  assert.equal((await handle(new Request('whisper-media://unissued/video',{method:'HEAD'}))).status,404);
  assert.throws(()=>service.nativeSource('whisper-media://unissued/video'),/Expired/);
  assert.equal((await service.handler({}, {action:'reopen',hash:'forged'})).ok,false);
  assert.equal(network,0);service.close();
 } finally {fs.rmSync(dir,{recursive:true,force:true});}
});

test('Relink undo restores only reviewed sources and refuses changed history or another sender',async t=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'hub-relink-'));
 const app=new (require('node:events').EventEmitter)();
 app.getPath=()=>root;
 t.after(()=>{app.emit('before-quit');fs.rmSync(root,{recursive:true,force:true});});
 const folder=path.join(root,'new');fs.mkdirSync(folder);
 const previous=path.join(root,'old','Film.mp4'),replacement=path.join(folder,'Film.mp4');
 fs.writeFileSync(replacement,'sample');
 fs.writeFileSync(path.join(root,'media-folder-watches.json'),JSON.stringify([{id:'folder',path:folder,enabled:true}]));
 const catalog=require('../src/media-catalog-store').createMediaCatalogStore({filePath:path.join(root,'media-catalog.json')});
 catalog.upsert({id:'one',title:'Film',kind:'film',source:{type:'local',value:previous}});
 let history='original';
 const service=require('../src/media-hub-service').registerMediaHub({app,ipcMain:{handle(){}},authorized:()=>true,
  catalogStore:()=>catalog,inspectMedia:file=>file,grantMedia:()=>true,
  relinkHistory:async()=>{history='moved';return {
   check(){if(history!=='moved')throw Error('History changed.');},
   async apply(){history='original';}
  };}
 });
 const call=(action,input={},sender=1)=>service.handle({sender:{id:sender}},{action,...input});
 const preview=await call('relink-preview',{folderId:'folder'});
 assert.equal(preview.patches.length,1);
 const applied=await call('relink-apply',{token:preview.token});
 assert.equal(applied.ok,true,applied.error);
 assert.equal(catalog.get('one').source.value,replacement);
 assert.equal((await call('relink-undo',{token:applied.undoToken},2)).ok,false);
 history='changed';
 assert.match((await call('relink-undo',{token:applied.undoToken})).error,/History changed/);
 assert.equal(catalog.get('one').source.value,replacement);
 history='moved';
 catalog.upsert({id:'one',title:'Edited title'});
 assert.equal((await call('relink-undo',{token:applied.undoToken})).ok,true);
 assert.equal(catalog.get('one').source.value,previous);
 assert.equal(catalog.get('one').title,'Edited title');
 assert.equal(history,'original');
});
