'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),{EventEmitter}=require('node:events');
const {registerMediaHub}=require('../src/media-hub-service');
function fixture(t,prepareAudio){
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'whisper-network-audio-')),app=new EventEmitter();app.getPath=()=>root;
 const sender={},event={sender},other={sender:{}},calls=[];
 const service=registerMediaHub({app,ipcMain:{handle(){}},authorized:()=>true,prepareAudio,sourceHeaders:url=>{calls.push(url);return [['Authorization','Bearer fixture-only']];}});
 t.after(()=>{app.emit('before-quit');fs.rmSync(root,{recursive:true,force:true});});
 return {app,event,other,calls,request:(input,owner=event)=>service.handle(owner,input)};
}
test('a manually opened network file grants a private source-owned capability using the existing preparer',async t=>{
 let prepared;const f=fixture(t,async input=>{prepared=input;return {path:'fixture-audio.wav'};});
 const opened=await f.request({action:'network',url:'https://cdn.example/private-token/movie.mkv'});
 assert.equal(opened.whisperAudio,'ready');assert.equal(opened.audioSource.owner,'mediaHub');assert.equal(opened.audioSource.key,opened.key);
 assert(opened.audioSource.token);assert(!JSON.stringify(opened.audioSource).includes('private-token'));
 const result=await f.request({action:'audio-prepare',...opened.audioSource,requestId:'network-a',url:'https://other.example/override.mkv',headers:[['Cookie','override']]});
 assert.equal(result.ok,true);assert.equal(result.key,opened.key);assert.equal(result.path,'fixture-audio.wav');
 assert.equal(prepared.url,opened.url);assert.deepEqual(prepared.headers,[['Authorization','Bearer fixture-only']]);assert.deepEqual(f.calls,[opened.url]);
});
test('network grants reject key, sender and request forgery and remain bounded',async t=>{
 let calls=0;const f=fixture(t,async()=>{calls++;return {path:'unused.wav'};});
 const opened=await f.request({action:'network',url:'https://cdn.example/movie.mkv'}),base={action:'audio-prepare',...opened.audioSource,requestId:'valid'};
 for(const [input,event]of [[{...base,key:'stream:forged'},f.event],[base,f.other],[{...base,requestId:'bad request'},f.event]])assert.equal((await f.request(input,event)).ok,false);
 for(let i=0;i<24;i++)await f.request({action:'network',url:'https://cdn.example/movie-'+i+'.mkv'});
 assert.equal((await f.request(base)).ok,false);assert.equal(calls,0);
});
test('adaptive, HTTP and RTSP playback stays available without claiming direct Whisper support',async t=>{
 const f=fixture(t,async()=>{throw Error('must not call');});
 for(const [url,kind]of [['https://cdn.example/live.m3u8','adaptive'],['https://cdn.example/live.mpd','adaptive'],['http://cdn.example/movie.mp4','insecure'],['rtsp://cdn.example/live','insecure']]){
  const r=await f.request({action:'network',url});assert.equal(r.ok,true);assert.equal(r.whisperAudio,kind);assert.equal(r.audioSource.key,r.key);assert.equal(r.audioSource.token,'');
 }
});
test('audio status and cancellation stay sender-owned and cancelled late output is discarded',async t=>{
 let finish,signal;const discarded=[];const prepare=input=>{signal=input.signal;input.onProgress({phase:'extracting',seconds:7});return new Promise(resolve=>finish=()=>resolve({path:'owned-late.wav'}));};prepare.discard=async file=>discarded.push(file);
 const f=fixture(t,prepare),a=await f.request({action:'network',url:'https://cdn.example/A.mkv'}),input={action:'audio-prepare',...a.audioSource,requestId:'owned'};
 const pending=f.request(input);await Promise.resolve();
 assert.equal((await f.request({action:'audio-status',requestId:'owned'},f.other)).active,false);
 assert.equal((await f.request({action:'audio-status',requestId:'owned'})).progress.seconds,7);
 await f.request({action:'audio-cancel',requestId:'owned'},f.other);assert.equal(signal.aborted,false);
 await f.request({action:'audio-cancel',requestId:'owned'});assert.equal(signal.aborted,true);finish();
 const result=await pending;assert.equal(result.ok,false);assert.equal(result.code,'AUDIO_CANCELLED');assert.deepEqual(discarded,['owned-late.wav']);
});
test('source replacement and shutdown abort the pending network preparation',async t=>{
 let finish,signal;const prepare=input=>{signal=input.signal;return new Promise(resolve=>finish=()=>resolve({path:'replaced.wav'}));};prepare.discard=async()=>{};
 const f=fixture(t,prepare),a=await f.request({action:'network',url:'https://cdn.example/A.mkv'});
 const pending=f.request({action:'audio-prepare',...a.audioSource,requestId:'replace'});await Promise.resolve();
 await f.request({action:'network',url:'https://cdn.example/B.mkv'});assert.equal(signal.aborted,true);finish();assert.equal((await pending).code,'AUDIO_CANCELLED');
 const b=await f.request({action:'network',url:'https://cdn.example/B.mkv'}),second=f.request({action:'audio-prepare',...b.audioSource,requestId:'quit'});await Promise.resolve();f.app.emit('before-quit');assert.equal(signal.aborted,true);finish();assert.equal((await second).code,'AUDIO_CANCELLED');
});
test('audio errors retain actionable codes without leaking private source strings',async t=>{
 const f=fixture(t,async()=>{throw Object.assign(Error('https://cdn.example/private-token Authorization: fixture-only'),{code:'STREAM_AUDIO_LIMIT'});});
 const a=await f.request({action:'network',url:'https://cdn.example/private-token/movie.mkv'}),result=await f.request({action:'audio-prepare',...a.audioSource,requestId:'limit'});
 assert.equal(result.ok,false);assert.equal(result.code,'STREAM_AUDIO_LIMIT');assert.doesNotMatch(JSON.stringify(result),/private-token|Authorization|fixture-only/);
});
