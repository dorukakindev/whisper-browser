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

test('relink subset validates token-owned indices, refreshes scope, and only undoes selected source',async t=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'hub-selected-relink-'));const app=new (require('node:events').EventEmitter)();app.getPath=()=>root;t.after(()=>{app.emit('before-quit');fs.rmSync(root,{recursive:true,force:true});});
 const folder=path.join(root,'new');fs.mkdirSync(folder);for(const name of ['One.mp4','Two.mp4'])fs.writeFileSync(path.join(folder,name),'sample');fs.writeFileSync(path.join(root,'media-folder-watches.json'),JSON.stringify([{id:'folder',path:folder,enabled:true}]));
 const catalog=require('../src/media-catalog-store').createMediaCatalogStore({filePath:path.join(root,'media-catalog.json')});for(const [id,title] of [['one','One'],['two','Two']])catalog.upsert({id,title,kind:'film',favorite:true,ratings:{personal:'8.5'},source:{type:'local',value:path.join(root,'old',title+'.mp4')}});
 const changed=[];const service=require('../src/media-hub-service').registerMediaHub({app,ipcMain:{handle(){}},authorized:()=>true,catalogStore:()=>catalog,inspectMedia:file=>file,grantMedia(){},relinkHistory:async(old,next)=>{changed.push(next);return {check(){},async apply(){changed.splice(changed.indexOf(next),1);}};}});const call=(action,input={},sender=1)=>service.handle({sender:{id:sender}},{action,...input});
 const initial=await call('v3-maintenance');assert.equal(initial.rootChecks[0].accessible,true);assert.equal(initial.untrackedSources.length,2);assert.equal(initial.preview.issues.filter(i=>i.kind==='missing-file').length,0);
 const preview=await call('relink-preview',{folderId:'folder'});assert.equal(preview.patches.length,2);
 for(const selectedIndices of [[],[-1],[2],[0,0],[0.5],['0']])assert.equal((await call('relink-apply',{token:preview.token,selectedIndices})).ok,false);
 assert.equal((await call('relink-apply',{token:preview.token,selectedIndices:[0]},2)).ok,false);
 const selectedIndex=preview.patches.findIndex(p=>p.id==='two');const applied=await call('relink-apply',{token:preview.token,selectedIndices:[selectedIndex]});assert.equal(applied.ok,true,applied.error);assert.equal(applied.count,1);assert.equal(changed.length,1);assert.equal(catalog.get('one').source.value,path.join(root,'old','One.mp4'));assert.equal(catalog.get('two').source.value,path.join(folder,'Two.mp4'));
 const refreshed=await call('v3-maintenance');assert.equal(refreshed.untrackedSources.length,1);assert.equal(refreshed.untrackedSources[0].workId,'one');assert.equal(catalog.get('two').favorite,true);assert.equal(catalog.get('two').ratings.personal,'8.5');
 assert.equal((await call('relink-undo',{token:applied.undoToken})).ok,true);assert.equal(catalog.get('two').source.value,path.join(root,'old','Two.mp4'));assert.equal(catalog.get('two').favorite,true);assert.equal(catalog.get('two').ratings.personal,'8.5');assert.equal(changed.length,0);
});

test('Fable OYN-14: source resume uses the existing encrypted store, never plaintext history',async t=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'stream-vault-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 const safeStorage={isEncryptionAvailable:()=>true,encryptString:s=>Buffer.from(s).map(x=>x^165),decryptString:b=>Buffer.from(b).map(x=>x^165).toString()};
 const build=(secure=safeStorage,dir=root)=>require('../src/media-hub-service').registerMediaHub({app:{getPath:()=>dir,on(){}},ipcMain:{handle(){}},authorized:()=>true,safeStorage:secure});
 const first=build(),url='https://fixture.invalid/private-path-marker/video.mp4?token=fixture-only';let r=await first.handle({}, {action:'network',url});assert(r.ok);const key=r.key;
 assert.equal((await first.handle({}, {action:'remember-stream',url,key})).persistent,true);
 const file=path.join(root,'stream-sources.safe.json');assert(!fs.readFileSync(file,'utf8').includes('private-path-marker'));
 assert.equal((await build().handle({}, {action:'network',key})).url,url,'restart resume resolves inside main');
 assert.equal(require('../src/workspace-package').allowed('stream-sources.safe.json'),false,'private source vault is outside portable workspace export');
 const store=require('../src/watch-library-store').createWatchLibraryStore({filePath:path.join(root,'history.json')});store.upsert({key,type:'stream',sourceRef:url,title:'Fixture',position:32,prefs:{speed:1.25},rating:3});
 const text=fs.readFileSync(path.join(root,'history.json'),'utf8');assert(!text.includes('private-path-marker'));const item=store.load()[0];assert.equal(item.sourceRef,key);assert.equal(item.rating,3);assert.equal(item.position,32);
 const temporaryRoot=path.join(root,'no-encryption'),unavailable={isEncryptionAvailable:()=>false},temporary=build(unavailable,temporaryRoot);assert.equal((await temporary.handle({}, {action:'remember-stream',url,key})).persistent,false);assert.equal((await temporary.handle({}, {action:'network',key})).url,url);assert.equal(fs.existsSync(path.join(temporaryRoot,'stream-sources.safe.json')),false,'no plaintext fallback');
 fs.writeFileSync(file,'broken fixture');const preserved=fs.readFileSync(file,'utf8');const third=build();await third.handle({}, {action:'remember-stream',url,key});assert.equal(fs.readFileSync(file,'utf8'),preserved,'corrupt vault is never overwritten');
});


test('Torrent engine installation is deduplicated, verified, repairable and never starts transfers',async()=>{
 const vm=require('node:vm'),crypto=require('node:crypto'),{ENGINE}=require('../src/media-torrents'),fixture=Buffer.from('verified isolated engine fixture'),dir=fs.mkdtempSync(path.join(os.tmpdir(),'torrent-install-'));
 const module={exports:{}},realHash=crypto.createHash,serviceRequire=require('node:module').createRequire(require.resolve('../src/media-torrents'));
 const mockedCrypto={...crypto,createHash(name){const hash=realHash(name),chunks=[];return {update(value){chunks.push(Buffer.from(value));hash.update(value);return this;},digest(encoding){return Buffer.concat(chunks).equals(fixture)?ENGINE.sha256:hash.digest(encoding);}};}};
 vm.runInNewContext(fs.readFileSync(require.resolve('../src/media-torrents'),'utf8'),{module,exports:module.exports,require:name=>name==='node:crypto'?mockedCrypto:serviceRequire(name),process:{platform:'win32',env:{}},Buffer,URL,URLSearchParams,Response,Headers,AbortSignal,setTimeout,clearTimeout,setInterval,clearInterval,console});
 let downloads=0,resolveDownload,mode='hold',checks=0;
 const app=new(require('node:events').EventEmitter)();app.getPath=()=>dir;app.whenReady=()=>Promise.resolve();
 const target=path.join(dir,'media-engines','rqbit.exe'),index=path.join(dir,'torrent-library.json');fs.writeFileSync(index,'corrupt index');
 const service=module.exports.registerMediaTorrents({app,ipcMain:{handle(){}},authorized:e=>e==='owner',protocol:{handle(){}},checkExecutable:async()=>{checks++;return 'rqbit 9.0.1';},fetchImpl:async url=>{assert.equal(url,ENGINE.url);downloads++;if(mode==='hold')return new Promise(resolve=>{resolveDownload=resolve;});if(mode==='bad')return new Response('bad checksum');if(mode==='offline')throw Error('private proxy detail');if(mode==='streamfail')return new Response(new ReadableStream({start(c){c.error(Object.assign(Error('private transport detail'),{code:'ECONNRESET'}));}}));return new Response(fixture);}});
 const call=action=>service.handler('owner',{action});
 try{
  assert.equal((await call('status')).engineState,'missing');assert((await call('status')).libraryError);
  assert.equal((await service.handler('foreign',{action:'install'})).ok,false);assert.equal(downloads,0);
  const first=call('install'),second=call('install');await Promise.resolve();assert.equal(downloads,1);assert.equal((await call('status')).engineState,'installing');resolveDownload(new Response(fixture));assert((await first).ok);assert((await second).ok);assert(fs.readFileSync(target).equals(fixture));assert.equal(fs.readFileSync(index,'utf8'),'corrupt index');
  assert.equal((await call('status')).installed,true);assert((await call('check-engine')).checked);assert.equal(checks,1);assert.equal((await call('status')).running,false);assert.equal(downloads,1);assert((await call('install')).alreadyInstalled);assert.equal(downloads,1);
  fs.writeFileSync(target,'old invalid executable');const original=fs.readFileSync(target);assert.equal((await call('status')).installed,false);assert.equal((await call('status')).engineState,'invalid');assert.equal((await call('check-engine')).code,'ENGINE_INVALID');assert.equal(checks,1);
  mode='bad';assert.equal((await call('install')).code,'ENGINE_CHECKSUM');assert(fs.readFileSync(target).equals(original));mode='offline';const failed=await call('install');assert.equal(failed.code,'ENGINE_DOWNLOAD');assert(!failed.error.includes('private'));assert(failed.errorTr);assert(fs.readFileSync(target).equals(original));mode='streamfail';const interrupted=await call('install');assert.equal(interrupted.code,'ENGINE_DOWNLOAD');assert(interrupted.errorTr);assert(!interrupted.error.includes('private'));assert(fs.readFileSync(target).equals(original));
  mode='good';assert((await call('install')).ok);assert.equal((await call('status')).installed,true);assert.equal((await call('status')).running,false);service.close();assert.equal((await call('check-engine')).code,'ENGINE_CLOSED');
 }finally{service.close();fs.rmSync(dir,{recursive:true,force:true});}
});

test('Torrent setup helper checks the engine without replaying a source and discards stale UI completion',async()=>{
 const vm=require('node:vm'),source=fs.readFileSync(require.resolve('../src/renderer/media-hub-ui'),'utf8'),code=source.slice(source.indexOf(' async function installTorrentEngine('),source.indexOf(' const engineProgressLabel='));
 const calls=[],progress=[];let current=true,timers=0,finish;
 const c={torrent:async action=>{calls.push(action);return {ok:true,installed:true,engineState:'ready',version:'9.0.1'};},setInterval:()=>++timers,clearInterval:()=>timers--};vm.createContext(c);vm.runInContext(code,c);
 const ready=await c.installTorrentEngine({isCurrent:()=>current,onProgress:s=>progress.push(s.stage)});assert(ready.ok);assert.deepEqual(calls,['install','check-engine']);assert.deepEqual(progress,['download','check','ready']);assert.equal(timers,0);
 calls.length=0;c.torrent=action=>{calls.push(action);return new Promise(resolve=>{finish=resolve;});};const pending=c.installTorrentEngine({isCurrent:()=>current});current=false;finish({ok:true});assert.equal(await pending,false);assert.deepEqual(calls,['install']);assert.equal(timers,0);assert.equal(await c.installTorrentEngine({isCurrent:()=>false}),false);assert.equal(calls.length,1);
});
