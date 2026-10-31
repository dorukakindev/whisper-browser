'use strict';
const {test}=require('node:test'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),vm=require('node:vm'),crypto=require('node:crypto'),{EventEmitter}=require('node:events'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),source=path.join(root,'src/media-torrents.js'),HASH='a'.repeat(40),out=fs.mkdtempSync(path.join(os.tmpdir(),'r815-torrent-'));
const deferred=()=>{let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve};};
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
  if(u.pathname.endsWith('/update_only_files')){if(updateGate){updateArrived++;await updateGate.promise;}if(failUpdate)return new Response('synthetic provider failure',{status:503});return Response.json({});}
  return Response.json({});
 }
 const sandbox={require(name){if(name==='node:net')return fakeNet;if(name==='node:crypto')return fakeCrypto;if(name==='node:child_process')return {spawn:fakeSpawn};if(name.startsWith('./'))return require(path.resolve(root,'src',name));return require(name);},module:{exports:{}},exports:{},process,Buffer,URL,URLSearchParams,AbortSignal,Response,Headers,fetch,setTimeout,clearTimeout};
 vm.runInNewContext(fs.readFileSync(source,'utf8'),sandbox,{filename:source});
 const service=sandbox.module.exports.registerMediaTorrents({app,ipcMain:{handle(){}},authorized:()=>true,dialog:{},owner:()=>null,protocol:{handle(){}},grantMedia(){},enginePath:()=>exe,fetchImpl});
 const call=input=>service.handler({},input),preview=()=>call({action:'preview',magnet:'magnet:?xt=urn:btih:'+HASH});
 return {call,preview,service,app,trace,folder,port,setFail(v){failUpdate=v;},race(){updateGate=deferred();},release(){updateGate.resolve();},stats:()=>({spawned,killed}),readDisk:()=>JSON.parse(fs.readFileSync(path.join(folder,'torrent-library.json'),'utf8'))};
}

test('B106: failed file selection preserves committed memory and later persistence',async()=>{const f=fixture();try{const p=await f.preview();assert(p.ok);assert((await f.call({action:'play',token:p.token,index:0})).ok);f.setFail(true);assert.equal((await f.call({action:'play',token:p.token,index:1})).ok,false);assert.equal(JSON.stringify((await f.call({action:'status'})).jobs[0].selections.map(x=>x.index)),'[0]');f.setFail(false);await f.call({action:'pause',hash:HASH});assert.deepEqual(f.readDisk()[0].selections.map(x=>x.index),[0]);assert.equal((await f.call({action:'reopen',hash:HASH,index:1})).ok,false);}finally{f.service.close();fs.rmSync(f.folder,{recursive:true,force:true});}});
test('B107: concurrent file selection is explicitly rejected and retry retains both selections',async()=>{const f=fixture();try{const p=await f.preview();f.race();const first=f.call({action:'play',token:p.token,index:0});await new Promise(r=>setImmediate(r));const second=await f.call({action:'play',token:p.token,index:1});assert.equal(second.ok,false);assert.match(second.error,/pending/);f.release();assert((await first).ok);assert((await f.call({action:'play',token:p.token,index:1})).ok);assert.deepEqual(f.readDisk()[0].selections.map(x=>x.index),[0,1]);}finally{f.service.close();fs.rmSync(f.folder,{recursive:true,force:true});}});
test('B108: close and before-quit prevent spawning a pending engine startup',async()=>{for(const method of ['close','before-quit']){const f=fixture({deferPort:true});try{const pending=f.preview();await Promise.resolve();if(method==='close')f.service.close();else f.app.emit('before-quit');f.port.resolve();assert.equal((await pending).ok,false);assert.equal(f.stats().spawned,0);}finally{f.service.close();fs.rmSync(f.folder,{recursive:true,force:true});}}});
test('B109: native snapshot rejects a source change while decoding, with a stable success control',async()=>{const source=path.join(root,'src/renderer/renderer.js'),text=fs.readFileSync(source,'utf8'),begin=text.indexOf('async function capturePlayerFrame() {'),end=text.indexOf('// ---- altyazı görünümü',begin),code=text.slice(begin,end);
async function run(mode){
 const entered=deferred(),decode=deferred(),reply=deferred(),observations={drawn:[],subtitles:[],saved:[],osd:[]};
 const player={workspaceMode:'player',mediaKey:'synthetic-A',generation:1,subsHidden:false,activeIdx:0,cues:[{text:'Subtitle A'}],subStyle:{}};
 const video={videoWidth:640,videoHeight:360,currentTime:12};
 class Image{constructor(){this.naturalWidth=640;this.naturalHeight=360;}async decode(){entered.resolve();await decode.promise;}}
 const ctx={drawImage(frame){observations.drawn.push(frame.src);},measureText(s){return{width:s.length*10};},strokeText(){},fillText(s){observations.subtitles.push(s);}};
 const document={createElement(tag){assert.equal(tag,'canvas');return {getContext:()=>ctx,toDataURL:()=> 'data:image/png;base64,CONTROLLED_CANVAS'};}};
 const sandbox={player,Image,document,$:()=>video,osd:s=>observations.osd.push(s),logLine(){},window:{NativePlayerUI:{active:()=>true},api:{nativePlayer:async()=>{if(mode==='before-response')await reply.promise;return {ok:true,image:'data:image/png;base64,SOURCE_A'};},saveImage:async v=>{observations.saved.push(v);return{ok:true,path:'synthetic.png'};}}}};
 vm.runInNewContext(code+'\nthis.capture=capturePlayerFrame;',sandbox,{filename:source});
 const pending=sandbox.capture();
 const switchSource=()=>{player.mediaKey='synthetic-B';player.generation=2;player.cues=[{text:'Subtitle B'}];video.currentTime=45;};
 if(mode==='before-response'){switchSource();reply.resolve();decode.resolve();}
 else {await entered.promise;if(mode==='during-decode')switchSource();decode.resolve();}
 await pending;return observations;
}

 const stable=await run('stable'),before=await run('before-response'),during=await run('during-decode');assert.equal(stable.saved.length,1);assert.deepEqual(stable.subtitles,['Subtitle A']);assert.equal(before.saved.length,0);assert.equal(during.saved.length,0);assert.deepEqual(during.drawn,[]);assert.deepEqual(during.subtitles,[]);
});
test.after(()=>fs.rmSync(out,{recursive:true,force:true}));
