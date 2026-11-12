'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto');
const {registerMediaTorrents}=require('../src/media-torrents');
function bencode(v){if(Buffer.isBuffer(v))return Buffer.concat([Buffer.from(v.length+':'),v]);if(typeof v==='string')return bencode(Buffer.from(v));if(typeof v==='number')return Buffer.from('i'+v+'e');return Buffer.concat([Buffer.from('d'),...Object.keys(v).sort().flatMap(k=>[bencode(k),bencode(v[k])]),Buffer.from('e')]);}
(async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'torrent-contract-'));let service;
 try{
  process.env.WHISPER_TORRENT_TEST='1';const bytes=Buffer.alloc(128000,71),info={length:bytes.length,name:'fixture.mp4','piece length':262144,pieces:crypto.createHash('sha1').update(bytes).digest()},hash=crypto.createHash('sha1').update(bencode(info)).digest('hex');
  const metadata=path.join(dir,'fixture.torrent');fs.writeFileSync(metadata,bencode({info}));const folder=path.join(dir,'torrent-media',hash);fs.mkdirSync(folder,{recursive:true});fs.writeFileSync(path.join(folder,'fixture.mp4'),bytes);
  let streamHandler;service=registerMediaTorrents({app:{getPath:()=>dir,whenReady:()=>Promise.resolve(),on(){}},ipcMain:{handle(){}},authorized:e=>e.ok,dialog:{showOpenDialog:async()=>({canceled:false,filePaths:[metadata]})},owner:()=>null,protocol:{handle:(_s,fn)=>{streamHandler=fn;}},grantMedia:()=>true,enginePath:()=>process.env.WHISPER_RQBIT_PATH||path.resolve('tmp/media-engine-research/rqbit.exe')});
  const api=req=>service.handler({ok:true},req);assert.equal((await api({action:'status'})).engineState,'ready');assert((await api({action:'check-engine'})).checked);assert.equal((await api({action:'status'})).running,false,'Version check must not start server/transfers');assert.equal((await service.handler({ok:false},{action:'preview',file:true})).ok,false);
  assert((await api({action:'limits',download:1000000,upload:100000})).ok,'Global limits work before any saved torrent');
  for(const magnet of ['magnet:?xt=invalid','magnet:?xt=urn:btmh:1220'+'a'.repeat(64)]){const invalid=await api({action:'preview',magnet});assert.equal(invalid.ok,false);assert.equal(typeof invalid.error,'string');}
  const preview=await api({action:'preview',file:true});assert(preview.ok,JSON.stringify(preview));assert.equal(preview.files[0].name,'fixture.mp4');
  const played=await api({action:'play',token:preview.token,index:0});assert(played.ok,JSON.stringify(played));
  const response=await streamHandler(new Request(played.url,{headers:{range:'bytes=10-99'}}));assert.equal(response.status,206);assert.deepEqual(Buffer.from(await response.arrayBuffer()),bytes.subarray(10,100));
  const reopened=await api({action:'reopen',hash,index:0});assert(reopened.ok,JSON.stringify(reopened));const reopenedResponse=await streamHandler(new Request(reopened.url,{headers:{range:'bytes=10-99'}}));assert.equal(reopenedResponse.status,206);assert.deepEqual(Buffer.from(await reopenedResponse.arrayBuffer()),bytes.subarray(10,100));
  assert.equal((await streamHandler(new Request('whisper-media://unknown/video'))).status,404);
  const stats=await api({action:'stats',hash});assert(stats.ok,JSON.stringify(stats));
  if(process.env.WHISPER_TORRENT_STATS==='1')console.log(JSON.stringify(stats.stats));
  assert((await api({action:'limits',hash,download:1000000,upload:100000})).ok,'JSON rate limit contract');
  assert((await api({action:'pause',hash})).ok);assert((await api({action:'resume',hash})).ok);
  const completed=await api({action:'local',hash,index:0});assert(completed.ok,JSON.stringify(completed));assert.equal(completed.path,fs.realpathSync(path.join(folder,'fixture.mp4')));
  const localFile=path.join(folder,'fixture.mp4'),movedFile=localFile+'.moved';fs.renameSync(localFile,movedFile);try{const missing=await api({action:'local',hash,index:0});assert.equal(missing.ok,false);assert.equal(typeof missing.error,'string');}finally{fs.renameSync(movedFile,localFile);}
  assert((await api({action:'forget',hash})).ok);assert(fs.existsSync(path.join(folder,'fixture.mp4')),'Forget must not delete downloaded files');
  console.log('rqbit 9.0.1: real metadata, range streaming, status, pause/resume, safe forget passed');
 }finally{service?.close();await new Promise(r=>setTimeout(r,400));fs.rmSync(dir,{recursive:true,force:true});}
})().catch(error=>{console.error(error);process.exitCode=1;});
