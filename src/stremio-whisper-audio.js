'use strict';
// Main-only, seekable direct-file relay. The remote URL and provider credentials
// stay in this process; ffmpeg receives only an expiring random loopback route.
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),https=require('node:https');
const {randomUUID}=require('node:crypto'),{pipeline}=require('node:stream/promises'),{Transform}=require('node:stream');
const {isPrivateHost}=require('./podcast-transcript'),{isPublicMangaIpAddress}=require('./browser-manga');
const {run:runMedia}=require('./browser-media-tools');
const {inspectVoiceOutput}=require('./voice-output');
const MAX_SECONDS=6*3600,MAX_OUTPUT=MAX_SECONDS*16000*2+65536,MAX_NETWORK=128*1024**3;
const fail=code=>Object.assign(Error({UNSAFE:'The media source or redirect is not a safe public HTTPS file.',CANCELLED:'Audio preparation was cancelled.',LIMIT:'Audio preparation exceeded its time, size or request limit.',FORMAT:'This source does not provide a supported direct media file. HLS, DASH and protected streams are not supported here.',FAILED:'Could not prepare audio from this source. Existing playback and subtitles were kept.'}[code]||'Audio preparation failed.'),{code:'STREAM_AUDIO_'+code});
function safeUrl(raw){try{const u=new URL(raw);if(u.protocol!=='https:'||u.username||u.password||u.href.length>8192||isPrivateHost(u.hostname))throw Error();return u;}catch{throw fail('UNSAFE');}}
function providerHeaders(source){
 const result={};const entries=Array.isArray(source)?source:Object.entries(source||{});
 if(entries.length>10)throw fail('UNSAFE');
 for(const entry of entries){if(!Array.isArray(entry)||entry.length!==2)throw fail('UNSAFE');const [name,value]=entry;
  if(typeof name!=='string'||! /^(?:referer|origin|user-agent|authorization|cookie|accept|accept-language|x-[a-z0-9-]{1,60})$/i.test(name)||typeof value!=='string'||value.length>1024||/[\u0000-\u001f\u007f]/.test(value))throw fail('UNSAFE');result[name.toLowerCase()]=value;
 }return result;
}
function createStreamAudioPreparer({directory,ffmpeg,grantMedia,publicPin,run=runMedia,transport}={}){
 const completed=new Map();
 const prepare=async function prepare({url,headers=[],signal,onProgress}={}){
  let root,output,server,networkBytes=0,requests=0,relayFailure=null;
  const controller=new AbortController(),combined=signal?AbortSignal.any([signal,controller.signal,AbortSignal.timeout(30*60*1000)]):AbortSignal.any([controller.signal,AbortSignal.timeout(30*60*1000)]);
  const upstreams=new Set(),route='/'+randomUUID()+'/media',sockets=new Set();
  const progress=value=>{try{onProgress?.(value);}catch{}};
  const stop=error=>{if(!relayFailure)relayFailure=error;controller.abort();};
  try{
   combined.throwIfAborted();const source=safeUrl(url),privateHeaders=providerHeaders(headers);
   if(/\.(?:m3u8|mpd)(?:$|[?#])/i.test(source.pathname))throw fail('FORMAT');
   if(typeof publicPin!=='function'||typeof grantMedia!=='function')throw fail('FAILED');
   const base=typeof directory==='function'?directory():directory;
   await fs.promises.mkdir(base,{recursive:true});
   const free=await fs.promises.statfs(base);if(free.bavail*free.bsize<MAX_OUTPUT+256*1024**2)throw fail('LIMIT');
   root=await fs.promises.mkdtemp(path.join(base,'stream-audio-'));output=path.join(root,'audio.wav');
   async function requestRemote(target,method,range,hop=0,forwardHeaders=privateHeaders){
    combined.throwIfAborted();if(++requests>128||hop>5)throw fail('LIMIT');
    const next=safeUrl(target);const pin=await publicPin(next.href,{signal:combined});combined.throwIfAborted();
    if(!pin||![4,6].includes(pin.family)||!isPublicMangaIpAddress(pin.address))throw fail('UNSAFE');
    const client=transport||https,requestHeaders={accept:'*/*',...forwardHeaders,'accept-encoding':'identity',...(range?{range}:{})};
    const response=await new Promise((resolve,reject)=>{
     const req=client.request(next,{method,agent:false,signal:combined,headers:requestHeaders,lookup:(_name,options,done)=>options?.all?done(null,[pin]):done(null,pin.address,pin.family)},resolve);
     upstreams.add(req);req.once('close',()=>upstreams.delete(req));req.once('error',reject);req.setTimeout(30000,()=>req.destroy(fail('LIMIT')));req.end();
    });
    if([301,302,303,307,308].includes(response.statusCode)){
     response.destroy();let redirected;try{if(typeof response.headers.location!=='string')throw Error();redirected=safeUrl(new URL(response.headers.location,next).href);}catch{throw fail('UNSAFE');}
     // Authentication and origin-specific headers never cross provider origins.
     return requestRemote(redirected.href,method,range,hop+1,redirected.origin===next.origin?forwardHeaders:{});
    }
    if(![200,206].includes(response.statusCode)){response.destroy();throw fail('FAILED');}
    const mime=String(response.headers['content-type']||'').split(';')[0].toLowerCase();
    if(mime&& !/^(?:audio\/|video\/|application\/(?:octet-stream|x-matroska|x-download|force-download|x-msdownload)$|binary\/octet-stream$)/.test(mime)||response.headers['content-encoding']&&response.headers['content-encoding']!=='identity'){response.destroy();throw fail('FORMAT');}
    return response;
   }
   server=http.createServer(async(req,res)=>{
    if(req.url!==route||!['GET','HEAD'].includes(req.method)){res.writeHead(404);res.end();return;}
    const range=req.headers.range;if(range&&(!/^bytes=(?:\d+-\d*|-\d+)$/.test(range)||range.length>80)){res.writeHead(416);res.end();return;}
    let response;
    try{
     response=await requestRemote(source.href,req.method,range);
     if(res.destroyed){response.destroy();return;}
     const outputHeaders={};
     for(const key of ['content-type','content-length','content-range','accept-ranges']){const value=response.headers[key];if(typeof value==='string'&&value.length<200&&!/[\r\n]/.test(value))outputHeaders[key]=value;}
     const declared=Number(outputHeaders['content-length']);if(Number.isFinite(declared)&&declared>MAX_NETWORK-networkBytes)throw fail('LIMIT');
     res.writeHead(response.statusCode,outputHeaders);
     if(req.method==='HEAD'){response.destroy();res.end();return;}
     let downstreamClosed=false;
     const close=()=>{downstreamClosed=!res.writableFinished;response.destroy();};res.once('close',close);
     // A normal ffmpeg seek closes its old downstream range. An upstream
     // truncation instead fails the entire preparation, even when pipeline has
     // already destroyed res and the decoder accepts a playable prefix.
     const upstreamFailed=()=>{if(!downstreamClosed)stop(fail('FAILED'));};
     const upstreamClosed=()=>{if(!response.readableEnded)upstreamFailed();};
     response.once('error',upstreamFailed);response.once('aborted',upstreamFailed);response.once('close',upstreamClosed);
     const counter=new Transform({transform(chunk,_encoding,done){networkBytes+=chunk.length;if(networkBytes>MAX_NETWORK){const error=fail('LIMIT');stop(error);return done(error);}done(null,chunk);}});
     try{await pipeline(response,counter,res,{signal:combined});}finally{res.removeListener('close',close);response.removeListener('error',upstreamFailed);response.removeListener('aborted',upstreamFailed);response.removeListener('close',upstreamClosed);}
    }catch(error){response?.destroy();if(!res.destroyed){if(!res.headersSent)res.writeHead(502);res.end();stop(error?.code?.startsWith('STREAM_AUDIO_')?error:fail('FAILED'));}}
   });
   server.on('connection',socket=>{sockets.add(socket);socket.once('close',()=>sockets.delete(socket));});
   await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});combined.throwIfAborted();
   progress({phase:'extracting',seconds:null});
   // Keep the container's media clock. In particular, an audio stream beginning
   // after the video's first frame needs leading silence rather than captions
   // shifted to zero. Only timestamps from this exact source drive the padding.
   const args=['-hide_banner','-loglevel','error','-nostdin','-nostats','-progress','pipe:2','-copyts','-start_at_zero','-protocol_whitelist','http,tcp','-format_whitelist','mov,matroska,mp3,wav,ogg,flac,aac,mpegts,avi','-rw_timeout','30000000','-i',`http://127.0.0.1:${server.address().port}${route}`,'-map','0:a:0?','-vn','-sn','-dn','-af','aresample=async=1:first_pts=0','-ac','1','-ar','16000','-c:a','pcm_s16le','-t',String(MAX_SECONDS+1),'-fs',String(MAX_OUTPUT),'-n',output];
   await run(typeof ffmpeg==='function'?ffmpeg():ffmpeg,args,undefined,combined,30*60*1000,line=>{const match=/^out_time_us=(\d+)$/.exec(line);if(match)progress({phase:'extracting',seconds:Number(match[1])/1000000});},{waitForCloseOnCancel:true});
   combined.throwIfAborted();if(relayFailure)throw relayFailure;
   progress({phase:'checking',seconds:null});const stat=await fs.promises.lstat(output);
   if(!stat.isFile()||stat.isSymbolicLink()||stat.size<=44)throw fail('FAILED');if(stat.size>=MAX_OUTPUT-65536)throw fail('LIMIT');
   // Decoder exit 0 and a RIFF signature alone do not prove complete PCM data.
   const audio=inspectVoiceOutput(output);
   if(!audio||audio.channels!==1||audio.sampleRate!==16000||audio.bits!==16)throw fail('FAILED');
   if(audio.seconds>MAX_SECONDS)throw fail('LIMIT');
   combined.throwIfAborted();
   const granted=await grantMedia(output);combined.throwIfAborted();if(!granted)throw fail('FAILED');
   const result={path:typeof granted==='string'?granted:output,bytes:stat.size};completed.set(result.path,{output,root,size:stat.size,mtimeMs:stat.mtimeMs});root=null;return result;
  }catch(error){
   if(relayFailure)throw relayFailure;
   if(signal?.aborted)throw fail('CANCELLED');
   if(error?.code?.startsWith('STREAM_AUDIO_'))throw error;
   if(combined.aborted)throw fail('LIMIT');throw fail('FAILED');
  }finally{
   controller.abort();for(const req of upstreams){try{req.destroy();}catch{}}
   for(const socket of sockets)socket.destroy();
   if(server?.listening)await new Promise(resolve=>server.close(resolve));
   if(root){await fs.promises.rm(output,{force:true}).catch(()=>{});await fs.promises.rmdir(root).catch(()=>{});}
  }
 };
 // Caller may discard a late result before handing it to Whisper. This is not
 // eviction: it never guesses arbitrary paths or removes an in-use audio file.
 prepare.discard=async file=>{
  const owned=completed.get(file);if(!owned)return false;
  try{const current=await fs.promises.lstat(owned.output);if(!current.isFile()||current.isSymbolicLink()||current.size!==owned.size||current.mtimeMs!==owned.mtimeMs)return false;
   await fs.promises.unlink(owned.output);completed.delete(file);await fs.promises.rmdir(owned.root).catch(()=>{});return true;
  }catch{return false;}
 };
 return prepare;
}
module.exports={createStreamAudioPreparer};
