'use strict';
const fs=require('node:fs'),https=require('node:https'),http=require('node:http');
const {pipeline}=require('node:stream/promises'),{Transform}=require('node:stream');
const {isPrivateHost}=require('./podcast-transcript');
const safeAudio=url=>{try{const u=new URL(url);return ['http:','https:'].includes(u.protocol)&&!u.username&&!u.password&&!isPrivateHost(u.hostname);}catch{return false;}};
// Same pinned DNS transport policy as feed/transcript requests; audio streams to disk.
async function acquireAudio(url,file,{signal,publicPin,transport,maxBytes=512*1024*1024}={}){
 let created=false;
 const combined=signal?AbortSignal.any([signal,AbortSignal.timeout(20*60*1000)]):AbortSignal.timeout(20*60*1000);
 try{for(let hop=0;hop<=5;hop++){
  combined.throwIfAborted();if(!safeAudio(url))throw Error('Unsafe podcast audio URL.');
  const pin=await publicPin(url,{signal:combined}),u=new URL(url),client=transport||(u.protocol==='https:'?https:http);
  const response=await new Promise((resolve,reject)=>{const req=client.request(u,{method:'GET',agent:false,signal:combined,headers:{Accept:'audio/*, video/mp4, application/octet-stream','Accept-Encoding':'identity','User-Agent':'Whisper-Browser-Podcast/1'},lookup:(_name,opts,cb)=>opts?.all?cb(null,[pin]):cb(null,pin.address,pin.family)},resolve);req.setTimeout(30000,()=>req.destroy(Error('Podcast audio timed out.')));req.on('error',reject);req.end();});
  if([301,302,303,307,308].includes(response.statusCode)){response.destroy();if(hop===5)throw Error('Podcast audio redirect limit.');const next=new URL(response.headers.location,url).href;if(u.protocol==='https:'&&new URL(next).protocol!=='https:')throw Error('Podcast audio redirect downgrade rejected.');url=next;continue;}
  const mime=String(response.headers['content-type']||'').split(';')[0].toLowerCase();
  if(response.statusCode!==200||!(/^(audio\/|video\/)/.test(mime)||mime==='application/octet-stream')){response.destroy();throw Error('Podcast audio unavailable or response is not audio.');}
  if(Number(response.headers['content-length'])>maxBytes){response.destroy();throw Error('Podcast audio exceeds 512 MiB.');}
  const stat=await fs.promises.statfs(require('node:path').dirname(file));if(stat.bavail*stat.bsize<maxBytes+256*1024*1024){response.destroy();throw Error('Insufficient space for bounded podcast download.');}
  let size=0,checked=false;
  const limit=new Transform({transform(chunk,_encoding,cb){size+=chunk.length;if(size>maxBytes)return cb(Error('Podcast audio exceeds 512 MiB.'));if(!checked){checked=true;if(/^\s*(?:<!doctype|<html|\{)/i.test(chunk.subarray(0,200).toString('utf8')))return cb(Error('Podcast source returned a document instead of audio.'));}cb(null,chunk);}});
  let handle;try{handle=await fs.promises.open(file,'wx');created=true;}catch(error){response.destroy();throw error;}await pipeline(response,limit,handle.createWriteStream(),{signal:combined});if(!size)throw Error('Empty podcast audio.');return {bytes:size,mime};
 }throw Error('Podcast audio redirect limit.');}catch(error){if(created)await fs.promises.rm(file,{force:true}).catch(()=>{});throw error;}
}
module.exports={acquireAudio};
