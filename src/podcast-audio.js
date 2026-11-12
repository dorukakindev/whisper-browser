'use strict';
const fs=require('node:fs'),https=require('node:https'),http=require('node:http');
const {pipeline}=require('node:stream/promises'),{Transform}=require('node:stream');
const {createHash}=require('node:crypto');
const {isPrivateHost}=require('./podcast-transcript');
const safeAudio=url=>{try{const u=new URL(url);return ['http:','https:'].includes(u.protocol)&&!u.username&&!u.password&&!isPrivateHost(u.hostname);}catch{return false;}};
// Keep managed artifacts inside the existing media grant contract. A generic
// response needs a known enclosure suffix; never authorize an arbitrary suffix.
function managedAudioExtension(mime,url){
 const types={'audio/mpeg':'mp3','audio/mp3':'mp3','audio/mp4':'m4a','audio/x-m4a':'m4a','audio/aac':'aac','audio/aacp':'aac','audio/wav':'wav','audio/x-wav':'wav','audio/vnd.wave':'wav','audio/flac':'flac','audio/x-flac':'flac','audio/ogg':'ogg','application/ogg':'ogg','audio/opus':'opus','audio/x-ms-wma':'wma','audio/webm':'webm','video/webm':'webm','video/mp4':'mp4','audio/3gpp':'3gp','video/3gpp':'3gp'};
 if(types[mime])return '.'+types[mime];
 let ext;try{ext=/\.([a-z0-9]+)$/i.exec(new URL(url).pathname)?.[1].toLowerCase();}catch{}
 if(['mp3','wav','m4a','m4b','aac','flac','ogg','opus','wma','mp4','webm','3gp'].includes(ext))return '.'+ext;
 throw Error('Podcast audio format is unsupported.');
}
// Same pinned DNS transport policy as feed/transcript requests; audio streams to disk.
async function acquireAudio(url,file,{signal,publicPin,transport,onProgress,maxBytes=512*1024*1024,resume=false,retainPartial=false}={}){
 const requestHash=createHash('sha256').update(url).digest('hex'),sidecar=file+'.resume.json',hashFile=async()=>{const h=createHash('sha256');for await(const c of fs.createReadStream(file))h.update(c);return h.digest('hex');};
 const combined=signal?AbortSignal.any([signal,AbortSignal.timeout(20*60*1000)]):AbortSignal.timeout(20*60*1000);
 let offset=0,meta=null,transfer=null,owned=false,safePartial=false,resumeState='fresh';
 const validator=h=>{const etag=String(h.etag||'');if(/^"[^"\r\n]{1,498}"$/.test(etag))return {key:'etag',value:etag};const lm=String(h['last-modified']||'');return lm.length<100&&Number.isFinite(Date.parse(lm))&&!/[\r\n]/.test(lm)?{key:'last-modified',value:lm}:null;};
 try{
  if(retainPartial){owned=true;if(resume){try{const metadataStat=await fs.promises.lstat(sidecar);if(!metadataStat.isFile()||metadataStat.isSymbolicLink()||metadataStat.size>4096)throw Error('metadata');meta=JSON.parse(await fs.promises.readFile(sidecar,'utf8'));const stat=await fs.promises.lstat(file);if(stat.isSymbolicLink()||!stat.isFile()||meta.requestHash!==requestHash||!Number.isSafeInteger(meta.total)||meta.total>maxBytes||stat.size<=0||stat.size>meta.total||meta.bytes!==stat.size||meta.sha256!==await hashFile()||!meta.validator||validator({[meta.validator.key]:meta.validator.value})?.value!==meta.validator.value)throw Error('metadata');offset=stat.size;safePartial=true;transfer=meta;}catch{meta=null;offset=0;}}if(!meta){await fs.promises.rm(file,{force:true});await fs.promises.rm(sidecar,{force:true});resumeState=resume?'restart-unverified':'fresh';}}
  for(let hop=0;hop<=5;hop++){
   combined.throwIfAborted();if(!safeAudio(url))throw Error('Unsafe podcast audio URL.');const pin=await publicPin(url,{signal:combined}),u=new URL(url),client=transport||(u.protocol==='https:'?https:http),headers={Accept:'audio/*, video/mp4, application/octet-stream','Accept-Encoding':'identity','User-Agent':'Whisper-Browser-Podcast/1'};
   if(meta){headers.Range='bytes='+offset+'-';headers['If-Range']=meta.validator.value;}
   const response=await new Promise((resolve,reject)=>{const req=client.request(u,{method:'GET',agent:false,signal:combined,headers,lookup:(_name,opts,cb)=>opts?.all?cb(null,[pin]):cb(null,pin.address,pin.family)},resolve);req.setTimeout(30000,()=>req.destroy(Error('Podcast audio timed out.')));req.on('error',reject);req.end();});
   if([301,302,303,307,308].includes(response.statusCode)){response.destroy();if(hop===5)throw Error('Podcast audio redirect limit.');if(!response.headers.location)throw Error('Podcast audio redirect is missing a location.');const next=new URL(response.headers.location,url).href;if(u.protocol==='https:'&&new URL(next).protocol!=='https:')throw Error('Podcast audio redirect downgrade rejected.');url=next;continue;}
   const h=response.headers,effectiveHash=createHash('sha256').update(url).digest('hex'),v=validator(h),mime=String(h['content-type']||'').split(';')[0].toLowerCase(),matches=meta&&effectiveHash===meta.effectiveHash&&v?.key===meta.validator.key&&v.value===meta.validator.value;
   if(meta&&response.statusCode===416&&matches&&h['content-range']==='bytes */'+offset&&offset===meta.total){response.destroy();await fs.promises.rm(sidecar,{force:true});return {bytes:offset,mime:meta.mime,etag:h.etag||'unknown',sha256:await hashFile(),probe:'unknown',resumeState:'complete-416'};}
   if(meta&&response.statusCode===416){safePartial=false;response.destroy();throw Error('Range no longer valid; restart required. / Aralık geçersiz; baştan başlatın.');}
   if(![200,206].includes(response.statusCode)||!(/^(audio\/|video\/)/.test(mime)||mime==='application/octet-stream')||h['content-encoding']&&h['content-encoding']!=='identity'){response.destroy();throw Object.assign(Error('Podcast audio unavailable or response is not audio. HTTP '+response.statusCode+(h['retry-after']?' Retry-After: '+String(h['retry-after']).replace(/[\r\n]/g,'').slice(0,80):'')),{status:response.statusCode,retryAfter:String(h['retry-after']||'').slice(0,100)});}
   let total=h['content-length']===undefined?null:Number(h['content-length']),append=false;
   if(response.statusCode===206){const range=/^bytes (\d+)-(\d+)\/(\d+)$/.exec(String(h['content-range']||''));if(!matches||!range||Number(range[1])!==offset||Number(range[2])!==Number(range[3])-1||Number(range[3])!==meta.total||mime!==meta.mime||total!==Number(range[2])-offset+1){safePartial=false;response.destroy();throw Error('Range or validator changed; restart required / Aralık veya doğrulayıcı değişti; baştan başlatın.');}total=meta.total;append=true;resumeState='resumed';}
   else if(meta){offset=0;resumeState='restarted-200';}
   if(total!==null&&(!Number.isSafeInteger(total)||total<0||total>maxBytes)){safePartial=false;response.destroy();throw Error('Invalid podcast audio length.');}
   const stat=await fs.promises.statfs(require('node:path').dirname(file));if(stat.bavail*stat.bsize<(total??maxBytes)-offset+256*1024*1024){response.destroy();throw Error('Insufficient space for bounded podcast download.');}
   transfer={requestHash,effectiveHash,validator:v,total,mime};safePartial=!!v&&Number.isSafeInteger(total)&&total>0;
   let size=offset,checked=append,lastProgress=0;const report=()=>onProgress?.({bytes:size,totalBytes:total,resumeState});report();
   const limit=new Transform({transform(chunk,_encoding,cb){size+=chunk.length;if(size>maxBytes){safePartial=false;return cb(Error('Podcast audio exceeds 512 MiB.'));}if(!checked){checked=true;if(/^\s*(?:<!doctype|<html|\{)/i.test(chunk.subarray(0,200).toString('utf8'))){safePartial=false;return cb(Error('Podcast source returned a document instead of audio.'));}}if(Date.now()-lastProgress>=350){lastProgress=Date.now();report();}cb(null,chunk);}});
   let handle;try{handle=await fs.promises.open(file,append?'r+':retainPartial?'w':'wx');owned=true;}catch(error){response.destroy();throw error;}
   await pipeline(response,limit,handle.createWriteStream({start:offset}),{signal:combined});if(!size)throw Error('Empty podcast audio.');if(total!==null&&size!==total)throw Error('Podcast audio length mismatch.');combined.throwIfAborted();const sha256=await hashFile();await fs.promises.rm(sidecar,{force:true});report();return {bytes:size,mime,etag:typeof h.etag==='string'&&h.etag.length<=500&&!/[\r\n\0]/.test(h.etag)?h.etag:'unknown',sha256,probe:'unknown',resumeState};
  }throw Error('Podcast audio redirect limit.');
 }catch(error){let retained=false;if(retainPartial&&safePartial&&transfer){try{const stat=await fs.promises.lstat(file);if(stat.isFile()&&stat.size>0&&stat.size<=transfer.total){const saved={...transfer,bytes:stat.size,sha256:await hashFile()},tmp=sidecar+'.'+require('node:crypto').randomUUID()+'.tmp';await fs.promises.writeFile(tmp,JSON.stringify(saved),{flag:'wx'});await fs.promises.rename(tmp,sidecar);retained=true;}}catch{}}
  if(owned&&!retained){await fs.promises.rm(file,{force:true}).catch(()=>{});if(retainPartial)await fs.promises.rm(sidecar,{force:true}).catch(()=>{});}throw error;
 }
}

module.exports={acquireAudio,managedAudioExtension};
