'use strict';
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),crypto=require('node:crypto'),{EventEmitter}=require('node:events'),assert=require('node:assert/strict');
const root=process.cwd(),out=process.env.R815_ENGINE_OUT?path.resolve(process.env.R815_ENGINE_OUT):path.join(root,'.tmp/unseen815-engines'),source=path.join(root,'src/media-torrents.js'),HASH='a'.repeat(40);
const deferred=()=>{let resolve;const promise=new Promise(r=>resolve=r);return{promise,resolve};};
let serial=0;
function fixture({deferPort=false}={}){
 fs.mkdirSync(out,{recursive:true});const folder=fs.mkdtempSync(path.join(out,'fixture-'));const exe=path.join(folder,'engine.stub');fs.writeFileSync(exe,'CONTROLLED NONEXECUTABLE FIXTURE');
 const trace=[],app=new EventEmitter();app.getPath=()=>folder;app.whenReady=()=>Promise.resolve();const port=deferred();let spawned=0,killed=0,failUpdate=false,updateGate=null,updateArrived=0;
 const fakeNet={createServer(){const server=new EventEmitter();server.listen=(_p,_h,cb)=>{if(deferPort)port.promise.then(cb);else queueMicrotask(cb);};server.address=()=>({port:31415});server.close=cb=>cb();return server;}};
 const fakeCrypto={...crypto,createHash:()=>({update(){return this;},digest(){return '2ed683203beca628e0c45f62f99feeef4242cecc3444c8422dfe5b1b6aa38cea';}})};
 const fakeSpawn=()=>{spawned++;trace.push({event:'spawn'});const p=new EventEmitter();p.stdout=new EventEmitter();p.stderr=new EventEmitter();p.exitCode=null;p.kill=()=>{killed++;p.exitCode=0;p.emit('close',0);return true;};return p;};
 async function fetchImpl(url,opts={}){const u=new URL(url);trace.push({route:u.pathname+u.search,method:opts.method||'GET',body:typeof opts.body==='string'?opts.body:null});
  if(u.pathname==='/stats')return Response.json({});
  if(u.searchParams.get('list_only')==='true')return Response.json({info_hash:HASH,details:{name:'Synthetic two-episode fixture',files:[{name:'a.mp4',length:10},{name:'b.mp4',length:20}]}});
  if(u.pathname==='/torrents')return Response.json({id:7});
  if(u.pathname.endsWith('/update_only_files')){if(updateGate){updateArrived++;if(updateArrived===2)updateGate.resolve();await updateGate.promise;}if(failUpdate)return new Response('synthetic provider failure',{status:503});return Response.json({});}
  return Response.json({});
 }
 const sandbox={require(name){if(name==='node:net')return fakeNet;if(name==='node:crypto')return fakeCrypto;if(name==='node:child_process')return {spawn:fakeSpawn};if(name.startsWith('./'))return require(path.resolve(root,'src',name));return require(name);},module:{exports:{}},exports:{},process,Buffer,URL,URLSearchParams,AbortSignal,Response,Headers,fetch,setTimeout,clearTimeout};
 vm.runInNewContext(fs.readFileSync(source,'utf8'),sandbox,{filename:source});
 const service=sandbox.module.exports.registerMediaTorrents({app,ipcMain:{handle(){}},authorized:()=>true,dialog:{},owner:()=>null,protocol:{handle(){}},grantMedia(){},enginePath:()=>exe,fetchImpl});
 const call=input=>service.handler({},input),preview=()=>call({action:'preview',magnet:'magnet:?xt=urn:btih:'+HASH});
 return {call,preview,service,app,trace,folder,port,setFail(v){failUpdate=v;},race(){updateGate=deferred();},stats:()=>({spawned,killed}),readDisk:()=>JSON.parse(fs.readFileSync(path.join(folder,'torrent-library.json'),'utf8'))};
}
(async()=>{
 const results={head:'db65f2e7f6e7b50649c440cb183cb88863ebf241',sourceSha256:crypto.createHash('sha256').update(fs.readFileSync(source)).digest('hex'),network:'NONE: fetch/net/spawn entirely controlled, fixture is nonexecutable',findings:{}};
 // UE01: failed update mutates the old committed selections through shared reference.
 const f=fixture(),p=await f.preview();assert.equal(p.ok,true);const first=await f.call({action:'play',token:p.token,index:0});assert.equal(first.ok,true);const before=f.readDisk();f.setFail(true);const failed=await f.call({action:'play',token:p.token,index:1});assert.equal(failed.ok,false);const status=await f.call({action:'status'});const stale=f.readDisk();assert.equal(JSON.stringify(status.jobs[0].selections.map(x=>x.index)),'[0,1]');assert.deepEqual(stale[0].selections.map(x=>x.index),[0]);f.setFail(false);await f.call({action:'pause',hash:HASH});const after=f.readDisk();assert.deepEqual(after[0].selections.map(x=>x.index),[0,1]);const reopened=await f.call({action:'reopen',hash:HASH,index:1});assert.equal(reopened.ok,true);
 results.findings.UE01={before,failed,statusJobs:status.jobs,diskImmediatelyAfterFailure:stale,diskAfterUnrelatedPause:after,reopenedFailedSelection:reopened.ok,trace:f.trace};f.service.close();
 // UE02: both distinct file buttons may be in flight; gates ensure both computed the initial [] before either commits.
 const r=fixture(),rp=await r.preview();r.race();const concurrent=await Promise.all([r.call({action:'play',token:rp.token,index:0}),r.call({action:'play',token:rp.token,index:1})]);assert.equal(concurrent.every(x=>x.ok),true);const concurrentDisk=r.readDisk();assert.equal(concurrentDisk[0].selections.length,1);
 const c=fixture(),cp=await c.preview();await c.call({action:'play',token:cp.token,index:0});await c.call({action:'play',token:cp.token,index:1});const sequentialDisk=c.readDisk();assert.deepEqual(sequentialDisk[0].selections.map(x=>x.index),[0,1]);
 results.findings.UE02={concurrent:concurrent.map(x=>({ok:x.ok,index:x.index})),concurrentDisk,sequentialDisk,concurrentTrace:r.trace,sequentialTrace:c.trace};r.service.close();c.service.close();
 // UE03: close and actual before-quit both miss an engine whose startup is waiting for local port allocation.
 const closing=[];for(const method of ['close','before-quit']){const q=fixture({deferPort:true}),pending=q.preview();await Promise.resolve();if(method==='close')q.service.close();else {q.app.on('before-quit',e=>e.preventDefault());q.app.emit('before-quit',{preventDefault(){}});}const atClose=q.stats();q.port.resolve();const late=await pending;const afterClose=q.stats();assert.equal(atClose.spawned,0);assert.equal(afterClose.spawned,1);assert.equal(afterClose.killed,0);assert.equal(late.ok,true);closing.push({method,atClose,afterClose,lateResult:late.ok,trace:q.trace});q.service.close();}
 const n=fixture();await n.preview();n.service.close();assert.equal(n.stats().killed,1);results.findings.UE03={lateStarts:closing,negativeControlAlreadyStarted:n.stats()};
 fs.writeFileSync(path.join(out,'torrent-results.json'),JSON.stringify(results,null,2));process.stdout.write(JSON.stringify({verified:Object.keys(results.findings),head:results.head})+'\n');
})().catch(e=>{console.error(e);process.exitCode=1;});
