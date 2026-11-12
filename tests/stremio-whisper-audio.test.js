'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),http=require('node:http');
const {EventEmitter}=require('node:events'),{PassThrough}=require('node:stream');
const {createStreamAudioPreparer}=require('../src/stremio-whisper-audio');
const wav=()=>{const b=Buffer.alloc(128);b.write('RIFF');b.write('WAVE',8);return b;};
function transportFor(reply,calls){return {request(url,options,callback){const req=new EventEmitter();req.setTimeout=()=>{};req.destroy=()=>{};req.end=()=>{calls.push({url:url.href,options});queueMicrotask(()=>{const r=new PassThrough();r.statusCode=200;r.headers={'content-type':'video/x-matroska','content-length':'8','accept-ranges':'bytes'};const override=reply(url,options)||{};Object.assign(r,override);callback(r);if(override.abrupt){r.write(Buffer.from('testdata'));setImmediate(()=>r.destroy(Error('upstream closed with private-key')));}else if(override.hold)r.write(Buffer.from('testdata'));else r.end(Buffer.from('testdata'));});};return req;}};}
const get=url=>new Promise((resolve,reject)=>{http.get(url,{headers:{Range:'bytes=0-7'}},r=>{const chunks=[];r.on('data',b=>chunks.push(b));r.on('error',reject);r.on('end',()=>resolve({status:r.statusCode,body:Buffer.concat(chunks).toString()}));}).on('error',reject);});
function harness(t,{reply=()=>{},run,publicPin,grantMedia}={}){
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'stremio-audio-'));t.after(()=>fs.rmSync(directory,{recursive:true,force:true}));const calls=[],pins=[],argv=[];
 const prepare=createStreamAudioPreparer({directory,ffmpeg:'ffmpeg-fixture',publicPin:publicPin||(async url=>{pins.push(url);return {address:'1.1.1.1',family:4};}),transport:transportFor(reply,calls),grantMedia:grantMedia||((file)=>file),run:async(_tool,args,_input,signal,_timeout,_line,options)=>{argv.push(args);assert.equal(options.waitForCloseOnCancel,true);if(run)return run(args,signal);const r=await get(args[args.indexOf('-i')+1]);assert.equal(r.status,200);assert.equal(r.body,'testdata');fs.writeFileSync(args.at(-1),wav());}});
 return {prepare,directory,calls,pins,argv};
}
test('direct audio preparation uses an authenticated pinned seekable relay and keeps secrets out of ffmpeg argv',async t=>{
 const h=harness(t);const result=await h.prepare({url:'https://media.example/private-key/movie.mkv',headers:[['Authorization','Bearer fixture-key']]});
 assert(fs.existsSync(result.path));assert.equal(result.bytes,128);assert.equal(h.calls[0].options.headers.range,'bytes=0-7');assert.equal(h.calls[0].options.headers.authorization,'Bearer fixture-key');assert.equal(h.pins.length,1);assert(!JSON.stringify(h.argv).includes('private-key'));assert(!JSON.stringify(h.argv).includes('Bearer'));
 assert(h.argv[0].includes('0:a:0?'));assert(h.argv[0].includes('16000'));assert(h.argv[0].includes('mov,matroska,mp3,wav,ogg,flac,aac,mpegts,avi'));assert(h.argv[0].includes('-copyts'));assert(h.argv[0].includes('-start_at_zero'));assert(h.argv[0].includes('aresample=async=1:first_pts=0'));
 await assert.rejects(get(h.argv[0][h.argv[0].indexOf('-i')+1]),/ECONNREFUSED|ECONNRESET/);
});
test('redirects are repinned and cross-origin redirects drop all provider credentials',async t=>{
 const h=harness(t,{reply:url=>url.hostname==='media.example'?{statusCode:302,headers:{location:'https://cdn.example/video.mkv'}}:{}});
 await h.prepare({url:'https://media.example/key/movie.mkv',headers:[['Authorization','Bearer fixture-key'],['X-Api-Key','private-key'],['Cookie','session=private-key']]});
 assert.equal(h.pins.length,2);assert.equal(h.calls[1].options.headers.authorization,undefined);assert.equal(h.calls[1].options.headers.cookie,undefined);assert.equal(h.calls[1].options.headers['x-api-key'],undefined);assert.equal(h.calls[1].options.headers.range,'bytes=0-7');
});
test('unsafe targets, downgrade and private DNS fail without exposing provider URLs',async t=>{
 const h=harness(t,{reply:()=>({statusCode:302,headers:{location:'http://cdn.example/private-key'}})});
 await assert.rejects(h.prepare({url:'https://media.example/private-key/movie.mkv'}),e=>e.code==='STREAM_AUDIO_UNSAFE'&&!e.message.includes('private-key'));
 assert.equal(fs.readdirSync(h.directory).length,0);
 for(const url of ['file:///C:/secret','https://127.0.0.1/secret','https://user:pass@example.com/movie.mkv'])await assert.rejects(h.prepare({url}),e=>e.code==='STREAM_AUDIO_UNSAFE');
 const privateDns=harness(t,{publicPin:async()=>({address:'127.0.0.1',family:4})});await assert.rejects(privateDns.prepare({url:'https://media.example/secret'}),e=>e.code==='STREAM_AUDIO_UNSAFE');assert.equal(privateDns.calls.length,0);
});
test('relay rejects wrong paths and multi-range without making upstream requests',async t=>{
 const h=harness(t,{run:async args=>{const url=args[args.indexOf('-i')+1];const bad=await get(new URL('/wrong',url));assert.equal(bad.status,404);const multi=await new Promise((resolve,reject)=>{http.get(url,{headers:{Range:'bytes=0-1,4-5'}},r=>{r.resume();r.on('end',()=>resolve(r.statusCode));}).on('error',reject);});assert.equal(multi,416);fs.writeFileSync(args.at(-1),wav());}});
 await h.prepare({url:'https://media.example/movie.mkv'});assert.equal(h.calls.length,0);
});
test('cancelled extraction cleans only its own partial audio and sanitizes tool failure',async t=>{
 const controller=new AbortController();const h=harness(t,{run:async(args,signal)=>{fs.writeFileSync(args.at(-1),wav());controller.abort();signal.throwIfAborted();}});const keep=path.join(h.directory,'keep.wav');fs.writeFileSync(keep,'keep');
 await assert.rejects(h.prepare({url:'https://media.example/private-key/movie.mkv',signal:controller.signal}),e=>e.code==='STREAM_AUDIO_CANCELLED');assert.deepEqual(fs.readdirSync(h.directory),['keep.wav']);
 const failed=harness(t,{run:async()=>{throw Error('ffmpeg https://media.example/private-key Authorization: secret');}});await assert.rejects(failed.prepare({url:'https://media.example/private-key'}),e=>e.code==='STREAM_AUDIO_FAILED'&&!e.message.includes('private-key')&&!e.message.includes('secret'));assert.equal(fs.readdirSync(failed.directory).length,0);
});
test('upstream truncation cannot grant a plausible partial WAV even if ffmpeg exits successfully',async t=>{
 let grants=0;const h=harness(t,{grantMedia:file=>{grants++;return file;},reply:()=>({abrupt:true,headers:{'content-type':'video/x-matroska','content-length':'1000'}}),run:async args=>{
  // A decoder can report success for a valid prefix; the relay must remember
  // the broken upstream independently of the already-destroyed local response.
  await get(args[args.indexOf('-i')+1]).catch(()=>{});fs.writeFileSync(args.at(-1),wav());
 }});
 await assert.rejects(h.prepare({url:'https://media.example/private-key/movie.mkv'}),e=>e.code==='STREAM_AUDIO_FAILED');assert.equal(grants,0);assert.equal(fs.readdirSync(h.directory).length,0);
});
test('intentional decoder range cancellation can seek and finish without a false truncation failure',async t=>{
 let count=0;const h=harness(t,{reply:()=>++count===1?{hold:true,headers:{'content-type':'video/x-matroska','content-length':'1000'}}:{},run:async args=>{
  const url=args[args.indexOf('-i')+1];await new Promise((resolve,reject)=>{const request=http.get(url,response=>{response.once('data',()=>{request.destroy();resolve();});response.on('error',()=>{});});request.on('error',reject);});
  const final=await get(url);assert.equal(final.body,'testdata');fs.writeFileSync(args.at(-1),wav());
 }});const result=await h.prepare({url:'https://media.example/movie.mkv'});assert(fs.existsSync(result.path));assert.equal(h.calls.length,2);
});
test('explicit stale-result discard is limited to an unchanged artifact created by this preparer',async t=>{
 const h=harness(t);const unrelated=path.join(h.directory,'personal.wav');fs.writeFileSync(unrelated,'keep');assert.equal(await h.prepare.discard(unrelated),false);assert.equal(fs.readFileSync(unrelated,'utf8'),'keep');
 const first=await h.prepare({url:'https://media.example/movie.mkv'});assert.equal(await h.prepare.discard(first.path),true);assert(!fs.existsSync(first.path));assert.equal(await h.prepare.discard(first.path),false);
 const second=await h.prepare({url:'https://media.example/movie.mkv'});fs.appendFileSync(second.path,'newer');assert.equal(await h.prepare.discard(second.path),false);assert(fs.existsSync(second.path));
});
