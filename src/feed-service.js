'use strict';
const path=require('node:path'),http=require('node:http'),https=require('node:https'),dns=require('node:dns').promises,zlib=require('node:zlib');
const {isIP}=require('node:net'),{randomUUID,createHash}=require('node:crypto');
const {isPublicMangaIpAddress}=require('./browser-manga');
const {readLimitedBytes}=require('./catalog-discovery');
const {registerQuitCleanup}=require('./quit-cleanup');
const P=require('./feed-parser'),{createFeedStore}=require('./feed-store');
const clean=(value,max=200)=>String(value??'').replace(/\0/g,'').trim().slice(0,max);
function abortable(promise,signal){if(!signal)return promise;signal.throwIfAborted();let abort;const stopped=new Promise((_,reject)=>{abort=()=>reject(signal.reason||Error('Cancelled.'));signal.addEventListener('abort',abort,{once:true});});return Promise.race([promise,stopped]).finally(()=>signal.removeEventListener('abort',abort));}
async function publicPin(url,{lookup=dns.lookup.bind(dns),signal}={}){
 const host=new URL(url).hostname.replace(/^\[|\]$/g,'');const addresses=isIP(host)?[{address:host,family:isIP(host)}]:await abortable(lookup(host,{all:true,verbatim:true}),signal);
 if(!Array.isArray(addresses)||!addresses.length||addresses.some(a=>!isPublicMangaIpAddress(a.address)))throw Object.assign(Error('Feed host must resolve only to public network addresses.'),{code:'EUNSAFE'});return addresses[0];
}
async function pinnedRequest(url,pin,{headers,signal,maxBytes=P.MAX_BYTES,transport,method='GET'}={}){
 const u=new URL(url),client=transport||(u.protocol==='https:'?https:http);
 return new Promise((resolve,reject)=>{
  let settled=false;const finish=(error,value)=>{if(settled)return;settled=true;signal?.removeEventListener('abort',stop);error?reject(error):resolve(value);};
  const request=client.request(u,{method,headers,agent:false,lookup:(_name,opts,callback)=>opts?.all?callback(null,[pin]):callback(null,pin.address,pin.family)},response=>{
   const status=Number(response.statusCode)||0,responseHeaders=new Headers();for(const [key,value]of Object.entries(response.headers||{}))if(value!==undefined)responseHeaders.set(key,Array.isArray(value)?value.join(', '):String(value));
   if(method==='HEAD'||status!==200){finish(null,{status,headers:responseHeaders,buffer:Buffer.alloc(0)});response.destroy();return;}
   const length=Number(responseHeaders.get('content-length'))||0;if(length>maxBytes){request.destroy(Object.assign(Error('Feed response exceeds 2 MB.'),{code:'ELIMIT'}));return;}
   const encoding=(responseHeaders.get('content-encoding')||'identity').toLowerCase();let stream=response;
   if(!['identity','gzip','deflate','br'].includes(encoding)){request.destroy(Error('Unsupported feed compression.'));return;}
   let compressed=0;response.on('data',chunk=>{compressed+=chunk.length;if(compressed>maxBytes)request.destroy(Object.assign(Error('Compressed feed exceeds 2 MB.'),{code:'ELIMIT'}));});
   if(encoding!=='identity'){stream=encoding==='gzip'?zlib.createGunzip():encoding==='br'?zlib.createBrotliDecompress():zlib.createInflate();response.pipe(stream);}
   const chunks=[];let size=0;stream.on('data',chunk=>{size+=chunk.length;if(size>maxBytes){stream.destroy();request.destroy(Object.assign(Error('Decoded feed exceeds 2 MB.'),{code:'ELIMIT'}));return;}chunks.push(chunk);});stream.on('end',()=>finish(null,{status,headers:responseHeaders,buffer:Buffer.concat(chunks,size)}));stream.on('error',error=>{request.destroy();finish(error);});response.on('error',error=>finish(error));
  });
  const stop=()=>request.destroy(signal?.reason||Error('Cancelled.'));request.setTimeout(12000,()=>request.destroy(Object.assign(Error('Feed request timed out.'),{code:'ETIMEDOUT'})));request.on('error',error=>finish(error));if(signal?.aborted)stop();else signal?.addEventListener('abort',stop,{once:true});request.end();
 });
}
async function fetchPublic(raw,{headers={},signal,lookup,transport,maxBytes=P.MAX_BYTES,accept,head=false}={}){
 let url=P.safeUrl(raw);if(!url)throw Object.assign(Error('Unsafe public feed URL.'),{code:'EUNSAFE'});
 const combined=signal?AbortSignal.any([signal,AbortSignal.timeout(15000)]):AbortSignal.timeout(15000);let requestHeaders={Accept:accept||'application/rss+xml, application/atom+xml, application/feed+json, text/html;q=0.6','Accept-Encoding':'gzip, deflate, br','User-Agent':'Whisper-Browser-Feeds/1'};
 // This is a public feed transport, never an authenticated browser request.
 for(const key of ['If-None-Match','If-Modified-Since'])if(typeof headers[key]==='string'&&headers[key].length<=500&&!/[\r\n]/.test(headers[key]))requestHeaders[key]=headers[key];
 for(let hop=0;hop<=4;hop++){
  combined.throwIfAborted();const pin=await publicPin(url,{lookup,signal:combined}),response=await pinnedRequest(url,pin,{headers:requestHeaders,signal:combined,transport,maxBytes,method:head?'HEAD':'GET'});combined.throwIfAborted();
  if(![301,302,303,307,308].includes(response.status))return {...response,effectiveUrl:url};
  const next=P.safeUrl(response.headers.get('location'),url);if(!next||hop===4||new URL(url).protocol==='https:'&&new URL(next).protocol!=='https:')throw Object.assign(Error('Unsafe or excessive feed redirect.'),{code:'EUNSAFE'});
  if(new URL(next).origin!==new URL(url).origin){requestHeaders={...requestHeaders};delete requestHeaders['If-None-Match'];delete requestHeaders['If-Modified-Since'];}url=next;
 }throw Error('Feed redirect limit.');
}
function errorKind(error){if(error?.code==='EUNSAFE')return 'unsafe';if(error?.code==='ELIMIT'||/exceeds|complexity|oversized/i.test(error?.message))return 'limit';if(error?.name==='AbortError')return 'cancelled';if(error?.name==='TimeoutError'||error?.code==='ETIMEDOUT')return 'timeout';if(error?.status===429)return 'rate-limit';if(error?.status)return 'http';if(/XML|JSON|RSS|Atom|feed body|response is not/i.test(error?.message))return 'parse';return 'network';}
function registerFeeds({app,ipcMain,authorized,userData=()=>app.getPath('userData'),catalogStore,translateText,createTextTranslator,grantMedia,grantSubtitle,observePodcastAudio,audioFetcher=require('./podcast-audio').acquireAudio,transcriptFetcher=(descriptor,options)=>require('./podcast-transcript-service').fetchPodcastTranscript(descriptor,{...options,publicPin,pinnedRequest}),fetchValidated=fetchPublic,autoStart=true,now=()=>Date.now()}={}){
 let readingWorkspace;
 const store=createFeedStore(path.join(userData(),'feeds.json'),{now,protectedEntryIds:()=>readingWorkspace?.references()||[]}),jobs=new Map(),tokens=new Map(),hostChecks=new Map(),activeFeeds=new Set();let disposed=false,refreshing=false;
 const managedAudio=new Map(),audioProgress=new Map();
 function progressKey(event,input){return owner(event)+':'+clean(input.requestId,80);}
 function audioStage(event,input,stage,values={}){const key=progressKey(event,input);audioProgress.set(key,{stage,...values,at:now()});while(audioProgress.size>64)audioProgress.delete(audioProgress.keys().next().value);}
 const offline=require('./podcast-offline').create({root:userData,store,fetchAudio:audioFetcher,publicPin,grantMedia});
 const verifiedCopies=new Map();
 const cacheDirectory=()=>path.join(userData(),'podcast-audio','transcript-cache');
 const cacheName=/^[a-f0-9]{64}\.(mp3|wav|m4a|m4b|aac|flac|ogg|opus|wma|mp4|webm|3gp)$/;
 function retainTranscriptAudio(download,binding){
  const fs=require('node:fs'),dir=cacheDirectory(),file=binding.sha256+path.extname(download.file);
  if(!cacheName.test(file))return null;
  fs.mkdirSync(dir,{recursive:true});
  const existing=fs.readdirSync(dir,{withFileTypes:true}).filter(item=>item.isFile()&&cacheName.test(item.name));
  if(!existing.some(item=>item.name===file)){
   const used=existing.reduce((total,item)=>total+fs.statSync(path.join(dir,item.name)).size,0);
   if(used+binding.length>1024**3||existing.length>=32)return null;
   fs.linkSync(download.file,path.join(dir,file));
  }
  return {file,sha256:binding.sha256,episodeIdentity:binding.episodeIdentity,sourceVersion:download.sourceVersion,clock:'absolute-media-seconds'};
 }
 async function exactTranscriptAudio(entry){
  const kept=await offline.open(entry);if(kept.available)return kept;
  const fs=require('node:fs'),session=require('./podcast-session'),binding=session.sourceBinding(entry);
  const version=session.sourceVersion(entry),proof=entry.podcastWorkspace?.transcript?.timeline;
  if(!session.matchesTranscriptTimeline(proof,version,binding)||!cacheName.test(proof.file))return {available:false};
  const file=path.join(cacheDirectory(),proof.file);
  const stamp=stat=>[stat.dev,stat.ino,stat.size,stat.mtimeMs,stat.ctimeMs].join(':');
  try{
   const stat=await fs.promises.lstat(file);
   if(!stat.isFile()||stat.size!==binding.length)return {available:false};
   const signature=stamp(stat);
   if(verifiedCopies.get(file)!==signature){
    const digest=createHash('sha256');
    for await(const chunk of fs.createReadStream(file))digest.update(chunk);
    if(digest.digest('hex')!==binding.sha256||stamp(await fs.promises.lstat(file))!==signature)return {available:false};
    verifiedCopies.set(file,signature);
   }
   const current=store.entry(entry.id);
   if(session.sourceVersion(current)!==version||JSON.stringify(current.podcastWorkspace?.transcript?.timeline)!==JSON.stringify(proof))return {available:false};
   if(!grantMedia?.(file))return {available:false};
   return {available:true,path:file,sourceVersion:version,sourceBinding:{...binding,fingerprintStatus:'cached-playback'}};
  }catch{return {available:false};}
 }

 const requestTranscript=require('./podcast-transcript-service').createTranscriptRequester(transcriptFetcher,{now});
 const translateEntry=require('./feed-translation').createFeedTranslation({store,translate:translateText});
 const translatePodcastText=require('./podcast-text-translation').createPodcastTextTranslation({store,translate:translateText,createTranslator:createTextTranslator});
 const owner=event=>String(event?.sender?.id||'main');
 function token(event,type,value){const id=randomUUID();tokens.set(id,{owner:owner(event),type,value,expires:now()+600000});for(const [key,row]of tokens)if(row.expires<now())tokens.delete(key);while(tokens.size>30)tokens.delete(tokens.keys().next().value);return id;}
 function take(event,id,type,{keep=false}={}){const row=tokens.get(id);if(!row||row.type!==type||row.owner!==owner(event)||row.expires<now())throw Error('Preview expired. Review the source again.');if(!keep)tokens.delete(id);return row.value;}
 async function requestFeed(url,options={}){
  const safe=P.safeUrl(url);if(!safe)throw Object.assign(Error('Unsafe public feed URL.'),{code:'EUNSAFE'});
  const response=await abortable(Promise.resolve().then(()=>fetchValidated(safe,options)),options.signal);const effectiveUrl=P.safeUrl(response.effectiveUrl||response.url||safe);if(!effectiveUrl)throw Object.assign(Error('Unsafe effective feed URL.'),{code:'EUNSAFE'});
  const headers=response.headers instanceof Headers?response.headers:new Headers(response.headers||{}),status=Number(response.status)||0;
  if(status===304)return {status,headers,effectiveUrl,text:''};
  if(status!==200)throw Object.assign(Error('Feed HTTP '+status+'.'),{status,retryAfter:headers.get('retry-after')});
  const bytes=response.buffer?Buffer.from(response.buffer):await abortable(readLimitedBytes(response,options.maxBytes||P.MAX_BYTES,'Feed'),options.signal);if(bytes.length>(options.maxBytes||P.MAX_BYTES))throw Object.assign(Error('Feed body exceeds 2 MB.'),{code:'ELIMIT'});
  const type=headers.get('content-type')||'',charset=/charset\s*=\s*["']?([^;\s"']+)/i.exec(type)?.[1]||'utf-8';let text;try{text=new TextDecoder(charset).decode(bytes).replace(/^\uFEFF/,'');}catch{throw Error('Unsupported feed text encoding.');}return {status,headers,effectiveUrl,text};
 }
 async function job(event,input,run,timeout=30000){
  const requestId=clean(input.requestId||randomUUID(),80);if(!requestId||jobs.size>=4)throw Error('Feed request limit reached.');const key=owner(event)+':'+requestId;if(jobs.has(key))throw Error('Feed request already running.');const controller=new AbortController(),signal=AbortSignal.any([controller.signal,AbortSignal.timeout(timeout)]);jobs.set(key,controller);const sender=event?.sender,stop=()=>controller.abort();sender?.once?.('destroyed',stop);
  try{return await abortable(run(signal),signal);}finally{jobs.delete(key);sender?.removeListener?.('destroyed',stop);}
 }
 async function preview(event,url,signal,episodeSource){
  const response=await requestFeed(url,{signal});if(response.status===304)throw Error('Feed preview requires content.');const parsed=P.parseFeed(response.text,response.effectiveUrl),feed={...parsed,url:P.safeUrl(url),effectiveUrl:response.effectiveUrl,etag:response.headers.get('etag')||'',lastModified:response.headers.get('last-modified')||''};delete feed.entries;
  const previewToken=token(event,'feed',{feed,entries:parsed.entries});const dates=parsed.entries.map(e=>e.publishedAt).filter(Boolean).sort((a,b)=>b-a),frequencyDays=dates.length>1?(dates[0]-dates.at(-1))/86400000/(dates.length-1):null;
  return {token:previewToken,feed,entries:parsed.entries.slice(0,5),count:parsed.entries.length,contentScope:parsed.entries.some(e=>e.contentScope==='feed-full')?'mixed-or-full':'summary',frequencyDays,...(episodeSource?{suggestedEpisodes:require('./podcast-spotify-discovery').episodeSuggestions(episodeSource,parsed.entries,feed)}:{})};
 }
 const refreshBasis=id=>JSON.stringify(store.snapshot().entries.filter(e=>e.feedId===id).map(e=>[e.id,e.revision,require('./podcast-session').sourceVersion(e),e.publishedAt,e.updatedAt,e.title,e.externalId,e.url]));
 async function podcastRefreshPreview(event,input,signal){
  const feed=store.list().feeds.find(f=>f.id===input.feedId||f.url===input.url);if(!feed)throw Error('Choose a subscribed feed.');
  const basis=refreshBasis(feed.id),response=await requestFeed(feed.effectiveUrl||feed.url,{signal});signal.throwIfAborted();
  const parsed=P.parseFeed(response.text,response.effectiveUrl),snapshot={...parsed,effectiveUrl:response.effectiveUrl,etag:response.headers.get('etag')||'',lastModified:response.headers.get('last-modified')||''};
  if(basis!==refreshBasis(feed.id))throw Error('Source changed; review again. / Kaynak değişti; yeniden inceleyin.');
  const existing=store.snapshot().entries.filter(e=>e.feedId===feed.id&&e.kind==='podcast'),changes=[];
  for(const row of parsed.entries.filter(e=>e.kind==='podcast')){
   const matches=existing.filter(e=>row.externalId?e.externalId===row.externalId:e.url===row.url),old=matches.length===1?matches[0]:null;
   const fields=['url','publishedAt','durationSeconds','enclosures','transcriptDescriptors'].filter(k=>JSON.stringify(old?.[k]??null)!==JSON.stringify(row[k]??null));
   const uncertain=matches.length>1||!!old&&old.url!==row.url;
   changes.push({title:row.title,state:uncertain?'uncertain':!old?'new':fields.includes('enclosures')?'audio-changed':'same-episode',fields,hasSavedWork:!!old?.podcastWorkspace});
  }
  return {token:token(event,'podcast-refresh',{feedId:feed.id,basis,snapshot}),changes:changes.slice(0,200),total:changes.length,bytesVerified:false};
 }
 async function refreshOne(feed,signal){
  if(activeFeeds.has(feed.id))return {feedId:feed.id,state:'busy',inserted:0};activeFeeds.add(feed.id);
  const headers={};if(feed.etag&&!/[\r\n]/.test(feed.etag))headers['If-None-Match']=feed.etag;if(feed.lastModified&&!/[\r\n]/.test(feed.lastModified))headers['If-Modified-Since']=feed.lastModified;
  try{const response=await requestFeed(feed.effectiveUrl||feed.url,{headers,signal});signal?.throwIfAborted();if(response.status===304){store.checked(feed.id);return {feedId:feed.id,state:'unchanged',inserted:0};}
   const parsed=P.parseFeed(response.text,response.effectiveUrl);signal?.throwIfAborted();const result=store.commit(feed.id,{...parsed,effectiveUrl:response.effectiveUrl,etag:response.headers.get('etag')||'',lastModified:response.headers.get('last-modified')||''});return {feedId:feed.id,state:result.feed.state,inserted:result.inserted,updated:result.updated};
  }catch(error){const kind=signal?.aborted?'cancelled':errorKind(error),retryRaw=error.retryAfter,retryAfter=/^\d+$/.test(retryRaw||'')?Number(retryRaw)*1000:Math.max(0,Date.parse(retryRaw||'')-now())||0;if(kind!=='cancelled')try{store.failure(feed.id,{error:clean(error.message,300),errorKind:kind,retryAfter});}catch{}return {feedId:feed.id,state:kind==='cancelled'?'cancelled':'failed',inserted:0,error:clean(error.message,300),errorKind:kind};}finally{activeFeeds.delete(feed.id);}
 }
 async function refreshDue(){
  if(disposed||refreshing||store.snapshot().settings.paused)return [];refreshing=true;const controller=new AbortController();jobs.set('scheduler',controller);const results=[];
  try{const due=store.snapshot().feeds.filter(f=>f.enabled&&Math.max(f.nextAttempt||0,f.lastAttempt?f.lastAttempt+f.intervalMinutes*60000:0)<=now()).slice(0,4);for(const feed of due){if(disposed||controller.signal.aborted||store.snapshot().settings.paused)break;const host=new URL(feed.effectiveUrl||feed.url).host;if(hostChecks.has(host)&&now()-hostChecks.get(host)<60000)continue;hostChecks.set(host,now());results.push(await refreshOne(feed,controller.signal));}return results;}finally{jobs.delete('scheduler');refreshing=false;}
 }
 const catalogSnapshot=item=>JSON.stringify([item.id,item.kind,item.title,item.year||null,item.imdbId||'',item.tmdbId||'']);
 const stateKeys=['saved','read','later'];
 function selectedState(entryId,revision){
  const snapshot=store.snapshot(),entry=snapshot.entries.find(e=>e.id===entryId);
  if(!entry||!revision||entry.revision!==revision||entry.spoiler==='marked'&&!entry.spoilerAllowed)throw Error('The selected feed revision or permission changed. Attach the source again.');
  const copies=snapshot.entries.filter(e=>e.canonicalId===entry.canonicalId).sort((a,b)=>a.id.localeCompare(b.id));
  return {entry:{entry_id:entry.id,title:entry.title,url:entry.url,revision:entry.revision,copyCount:copies.length,saved:copies.some(e=>e.saved),read:copies.every(e=>e.read),later:copies.some(e=>e.later)},
   snapshot:JSON.stringify(copies.map(e=>[e.id,e.revision,e.url,e.saved,e.read,e.later,e.spoiler,e.spoilerAllowed])),ids:copies.map(e=>e.id)};
 }
 readingWorkspace=require('./feed-reading-workspace').create({root:userData,entry:id=>store.entry(id),now});
 const withLinkStates=entry=>({...entry,...require('./feed-editorial').view(entry),links:entry.links.map(link=>{const current=catalogStore?.().get(link.catalogId);return {...link,watchStatus:current?.watchStatus||'unspecified',state:!current?'missing':link.sourceRevision!==entry.revision?'stale':catalogSnapshot({...link,id:link.catalogId})===catalogSnapshot(current)?'confirmed':'stale'};})});
 const handle=async(event,input={})=>{
  if(!authorized(event))return {ok:false,error:'Unauthorized feed request.',errorKind:'unauthorized'};
  try{
   if(disposed)throw Error('Feed service is closed.');if(!input||typeof input!=='object'||Array.isArray(input))throw Error('Invalid feed request.');let result;
   switch(input.action){
    case 'podcast-refresh-preview':result=await job(event,input,signal=>podcastRefreshPreview(event,input,signal));break;
    case 'podcast-refresh-commit':{const p=take(event,input.token,'podcast-refresh');if(p.basis!==refreshBasis(p.feedId))throw Error('Source changed; review again. / Kaynak değişti; yeniden inceleyin.');result=store.commit(p.feedId,p.snapshot);break;}
    case 'podcast-offline-keep':result=await job(event,input,signal=>offline.keep(input.entryId,input.sourceVersion,signal,p=>audioStage(event,input,'downloading',p),input.resume===true),20*60*1000);break;
    case 'podcast-offline-open':result=await offline.open(store.entry(input.entryId));break;
    case 'podcast-offline-inventory':result=offline.inventory();break;
    case 'podcast-storage':result={...require('./podcast-storage').inventory({root:userData(),entries:store.snapshot().entries,managed:[...managedAudio.values()]}),offline:offline.inventory()};break;
    case 'podcast-recovery-preview':result=require('./podcast-recovery').inspect(store.entry(input.entryId),input);break;
    case 'retention-status':result=store.retention();break;
    case 'reading-workspace':result=readingWorkspace.get(store.entry(input.entryId));break;
    case 'reading-remove':result=readingWorkspace.remove(input);break;
    case 'reading-save':result=readingWorkspace.save(input);break;
    case 'podcast-relations':{const rows=[];let total=0;for(let offset=0;offset<4000;offset+=200){const page=store.entries({kind:'podcast',offset,limit:200});total=page.total;rows.push(...page.rows.map(withLinkStates).filter(e=>!e.links.some(l=>l.state==='confirmed'&&l.watchStatus!=='completed')));if(offset+200>=total)break;}result=require('./podcast-relations').relate(withLinkStates(store.entry(input.entryId)),rows,{partial:total>4000});break;}
    case 'list':result=store.list({podcastLibrary:input.podcastLibrary===true});break;
    case 'podcast-page-confirm':result=await job(event,input,async signal=>{
      const review=take(event,input.token,'podcast-page',{keep:true});
      if(review.binding){
        const observed=await observePodcastAudio?.(review.binding);
        if(observed!==review.source.episode.url)throw Error('Playing episode changed. Review the source again. / Çalan bölüm değişti. Kaynağı yeniden inceleyin.');
      }
      signal.throwIfAborted();
      const entry=store.ensurePodcastEntry(review.source,{save:input.save===true});
      return {entryId:entry.id,saved:entry.saved};
    });break;
    case 'source-pins':result={pins:store.sourcePins(input.pins)};break;
    case 'preference-save':result={preference:store.preference(input)};break;
    case 'preference-remove':result=store.preference({...input,remove:true});break;
    case 'view-save':result={view:store.view(input)};break;
    case 'view-delete':result=store.view({...input,remove:true});break;
    case 'visit':result=store.visit(input.entryId);break;
    case 'recent-settings':result=store.recentSettings(input);break;
    case 'correction':result={correction:store.correction(input.entryId,input.acknowledge===true,input.revision)};break;
    case 'entries':if(input.kind&&!['article','video','podcast'].includes(input.kind))throw Error('Unsupported entry kind.');result=store.entries(input);result.rows=result.rows.map(withLinkStates);break;
    case 'entry':result={entry:withLinkStates(store.entry(input.entryId,input.revision))};break;
    case 'podcast-audio-status':{const row=audioProgress.get(progressKey(event,input));result=row&&now()-row.at<600000?{...row}:{stage:'unknown',bytes:0,totalBytes:null};break;}
    case 'podcast-audio':result=await job(event,input,async signal=>{const entry=store.entry(input.entryId),version=require('./podcast-session').sourceVersion(entry);if(input.sourceVersion!==version||entry.kind!=='podcast')throw Error('Podcast audio source changed.');if(managedAudio.size>=4)throw Error('Finish or remove an existing podcast download first.');const enclosure=entry.enclosures.find(e=>/^audio\//.test(e.type));if(!enclosure)throw Error('No public podcast audio.');const fs=require('node:fs'),dir=path.join(userData(),'podcast-audio');await fs.promises.mkdir(dir,{recursive:true});const tokenId=randomUUID(),temporary=path.join(dir,tokenId+'.partial');let file=temporary;audioStage(event,input,'validating',{entryId:entry.id,sourceVersion:version,bytes:0,totalBytes:null});managedAudio.set(tokenId,{file,owner:owner(event)});try{const evidence=await audioFetcher(enclosure.url,temporary,{signal,publicPin,onProgress:p=>{if(signal.aborted)return;const bytes=Number(p.bytes),total=p.totalBytes;if(!Number.isSafeInteger(bytes)||bytes<0||bytes>512*1024*1024)return;audioStage(event,input,'downloading',{entryId:entry.id,sourceVersion:version,bytes,totalBytes:Number.isSafeInteger(total)&&total>0&&total<=512*1024*1024&&total>=bytes?total:null});}});signal.throwIfAborted();if(require('./podcast-session').sourceVersion(store.entry(entry.id))!==version)throw Error('Podcast audio source changed.');audioStage(event,input,'preparing',{entryId:entry.id,sourceVersion:version,bytes:evidence.bytes,totalBytes:evidence.bytes});const target=path.join(dir,tokenId+require('./podcast-audio').managedAudioExtension(evidence.mime,enclosure.url));await fs.promises.link(temporary,target);file=target;managedAudio.get(tokenId).file=file;await fs.promises.rm(temporary);signal.throwIfAborted();if(typeof grantMedia!=='function'||!grantMedia(file))throw Error('Podcast audio could not be authorized.');const binding=store.podcastAudioEvidence(entry.id,version,evidence);Object.assign(managedAudio.get(tokenId),{entryId:entry.id,sourceVersion:binding.sourceVersion});audioStage(event,input,'ready',{entryId:entry.id,sourceVersion:binding.sourceVersion,bytes:evidence.bytes,totalBytes:evidence.bytes});return {path:file,downloadToken:tokenId,sourceVersion:binding.sourceVersion,sourceBinding:binding.sourceBinding};}catch(error){audioStage(event,input,signal.aborted?'cancelled':'failed',{entryId:entry.id,sourceVersion:version,bytes:audioProgress.get(progressKey(event,input))?.bytes||0,totalBytes:null});managedAudio.delete(tokenId);await fs.promises.rm(file,{force:true}).catch(()=>{});if(file!==temporary)await fs.promises.rm(temporary,{force:true}).catch(()=>{});throw error;}},20*60*1000);break;
    case 'podcast-chapters':result=await job(event,input,async signal=>{
     const session=require('./podcast-session'),entry=store.entry(input.entryId);
     if(entry.kind!=='podcast'||session.sourceVersion(entry)!==input.sourceVersion||!entry.chapterUrl)return {chapters:[]};
     const response=await requestFeed(entry.chapterUrl,{signal,maxBytes:256*1024,accept:'application/json+chapters, application/json'});
     signal.throwIfAborted();
     const current=store.entry(entry.id);
     if(current.chapterUrl!==entry.chapterUrl||session.sourceVersion(current)!==input.sourceVersion)return {chapters:[]};
     const doc=JSON.parse(response.text);
     if(typeof doc?.version!=='string'||!Array.isArray(doc.chapters))throw Error('Invalid publisher chapters.');
     const chapters=doc.chapters.slice(0,200).flatMap(chapter=>{
      const title=typeof chapter?.title==='string'?clean(chapter.title,160):'';
      if(!title||chapter.toc===false)return [];
      const at=chapter.startTime;
      return [{label:title,t:Number.isFinite(at)&&at>=0&&at<=604800?at:null}];
     });
     return {chapters};
    },16000);break;
    case 'podcast-exact-audio':result=await exactTranscriptAudio(store.entry(input.entryId));break;
    case 'podcast-audio-release':{const row=managedAudio.get(input.downloadToken);if(row&&row.owner===owner(event)){await require('node:fs').promises.rm(row.file,{force:true});managedAudio.delete(input.downloadToken);}result={released:true};break;}
    case 'podcast-translate-text':result=await job(event,input,signal=>translatePodcastText(input,signal),5*60*1000);break;
    case 'podcast-materialize':{const entry=store.entry(input.entryId),version=require('./podcast-session').sourceVersion(entry),transcript=entry.podcastWorkspace?.sourceVersion===version?entry.podcastWorkspace[input.role==='translation'?'translation':'transcript']:null;if(input.sourceVersion!==version||transcript?.state!=='timed')throw Error('No current timed podcast transcript.');const fs=require('node:fs'),dir=path.join(userData(),'podcast-transcripts');await fs.promises.mkdir(dir,{recursive:true});if(input.as!==undefined&&input.as!=='srt')throw Error('Unsupported transcript format / Desteklenmeyen döküm biçimi.');const revision=createHash('sha256').update(transcript.text).digest('hex').slice(0,16);// as:'srt' derives a dubbing copy (VTT -> SRT with proven timings) next to the stored original; the original file name and bytes never change.
let format=transcript.format,body=transcript.text,derived=false;if(input.as==='srt'&&format!=='srt'){body=require('./podcast-dub-subtitle').deriveDubSrt(transcript.text).srt;format='srt';derived=true;}const file=path.join(dir,version+(input.role==='translation'?'-translation':'')+(derived?'-dub':'')+'-'+revision+'.'+format);require('./fsync-utils').atomicWriteFileSync(file,body);grantSubtitle?.(file);result={path:file,format,derived,role:input.role==='translation'?'translation':'source',revision,language:String(transcript.targetLanguage||transcript.language||'')};break;}
    case 'podcast-workspace':{const entry=store.entry(input.entryId),version=require('./podcast-session').sourceVersion(entry);if(input.sourceVersion&&input.sourceVersion!==version)throw Error('Podcast audio source changed.');if(input.position!==undefined&&(!Number.isFinite(input.position)||input.position<0||input.position>31536000)||input.rate!==undefined&&(!Number.isFinite(input.rate)||input.rate<.25||input.rate>4))throw Error('Invalid podcast progress.');if(input.played===true){if(input.sourceVersion!==version)throw Error('Verified source version required.');store.podcastListened(entry.id,version);}if(input.position!==undefined||input.rate!==undefined){const patch={};for(const k of ['position','rate'])if(input[k]!==undefined)patch[k]=input[k];store.podcastWorkspace(entry.id,version,patch);}const saved=store.entry(entry.id).podcastWorkspace;result={sourceVersion:version,sourceBinding:require('./podcast-session').sourceBinding(entry),workspace:saved?.sourceVersion===version?saved:null,translationRetry:require('./podcast-translation-recovery').recoveryInfo(saved?.sourceVersion===version?saved.transcript:null,saved?.sourceVersion===version?saved.translation:null),state:saved&&(saved.sourceVersion!==version||saved.previous&&!saved.transcript)?'needs-review':'current'};break;}
    case 'podcast-save-transcript':{
     const entry=store.entry(input.entryId),recovery=require('./podcast-translation-recovery'),role=input.role==='translation'?'translation':'transcript';
     if(role==='translation'&&input.expectedTranscriptText!==undefined&&entry.podcastWorkspace?.transcript?.text!==input.expectedTranscriptText)throw Error('Podcast source transcript changed.');
     const track={state:input.timed===true?'timed':'untimed',text:input.text,format:input.format,provenance:input.provenance==='asr'?'asr':'user',status:input.status==='partial'?'partial':'complete',coverage:recovery.coverage(input.coverage)};
     const session=require('./podcast-session'),binding=session.sourceBinding(entry);
     const download=managedAudio.get(input.downloadToken);
     if(track.provenance==='asr'&&track.state==='timed'&&track.status==='complete'&&download?.owner===owner(event)&&download.entryId===entry.id&&download.sourceVersion===input.sourceVersion&&session.sourceVersion(entry)===input.sourceVersion){
      try{const timeline=retainTranscriptAudio(download,binding);if(timeline)track.timeline={...timeline,extractionStart:track.coverage?.start||0};}catch{/* A cache failure preserves the transcript as read-only. */}
     }
     const source=entry.podcastWorkspace?.transcript;
     if(role==='translation'&&track.status==='complete'&&track.state==='timed'&&input.expectedTranscriptText===source?.text&&source?.timeline)track.timeline=source.timeline;
     if(role==='translation'&&input.targetLanguage!==undefined){if(typeof input.targetLanguage!=='string'||!/^[a-z]{2,3}(?:-[a-z0-9]{2,8})?$/i.test(input.targetLanguage))throw Error('Invalid translation target language.');track.targetLanguage=input.targetLanguage.toLowerCase();}
     if(role==='translation'&&input.recovery!=null){if(track.state!=='timed'||entry.podcastWorkspace?.transcript?.state!=='timed')throw Error('Recovery requires timed source and translation.');track.recovery=recovery.validate(input.recovery,entry.podcastWorkspace.transcript.text,track.text,track.targetLanguage);}
     const workspace=store.podcastWorkspace(entry.id,input.sourceVersion,{[role]:track});result={workspace,translationRetry:recovery.recoveryInfo(workspace.transcript,workspace.translation)};break;
    }
    case 'podcast-translation-retry':{
     const entry=store.entry(input.entryId),version=require('./podcast-session').sourceVersion(entry),workspace=entry.podcastWorkspace;
     if(entry.kind!=='podcast'||input.sourceVersion!==version||workspace?.sourceVersion!==version)throw Error('Podcast source changed / Podcast kaynağı değişti.');
     const files=require('./podcast-translation-recovery').materialize({directory:path.join(userData(),'podcast-transcripts'),sourceVersion:version,source:workspace.transcript,translation:workspace.translation,targetLanguage:input.targetLanguage,expectedTranscriptText:input.expectedTranscriptText});
     grantSubtitle?.(files.sourcePath);grantSubtitle?.(files.translationPath);result=files;break;
    }
    case 'podcast-spotify-preview':result=await job(event,input,async signal=>{
     const address=require('./podcast-link-source').spotify(input.url);if(!address)throw Error('Choose a Spotify show or episode URL.');const url=address.url,response=await requestFeed('https://open.spotify.com/oembed?url='+encodeURIComponent(url),{signal});let metadata;try{metadata=JSON.parse(response.text);}catch{throw Error('Spotify metadata unavailable. Add a publisher RSS feed manually.');}
     const discoveryTools=require('./podcast-spotify-discovery'),source=discoveryTools.spotifySource(url,metadata);
     const candidates=address.kind==='show'?[]:store.snapshot().entries.filter(e=>e.kind==='podcast').map(e=>({...discoveryTools.candidateMetadata(e),entryId:e.id,revision:e.revision,title:e.title,publisher:e.author||e.sourceFeed.title,feedUrl:e.sourceFeed.url,source:'library',identityVerified:false,sourceVersion:require('./podcast-session').sourceVersion(e),assessment:require('./podcast-episode-match').assessEpisodeMatch(source,{...discoveryTools.candidateMetadata(e),title:e.title,publisher:e.author||e.sourceFeed.title})})).filter(e=>e.assessment.evidence.length).slice(0,30);
     let suggestedFeeds=[],suggestedEpisodes=[],feedPreview,discovery={state:'not-requested',provider:'apple-directory'};
     if(input.rssUrl){
      const {suggestedEpisodes:episodes,...review}=await preview(event,input.rssUrl,signal,source);feedPreview=review;suggestedEpisodes=episodes;
      discovery={state:'feed-preview',provider:'user-selected-rss'};
     }else if(input.discover===true){
      const searchUrl=discoveryTools.directorySearchUrl(source);discovery={state:'no-results',provider:'apple-directory',query:source.title.slice(0,160)};
      try{const response=await requestFeed(searchUrl,{signal});suggestedFeeds=discoveryTools.directorySuggestions(JSON.parse(response.text));discovery.state=suggestedFeeds.length?'suggestions':'no-results';}
      catch(error){signal.throwIfAborted();discovery={...discovery,state:'unavailable',errorKind:errorKind(error)};}
     }
     signal.throwIfAborted();return {url,kind:address.kind,title:source.title,source,candidates,suggestedFeeds,suggestedEpisodes,...(feedPreview?{feedPreview}:{}),discovery,token:token(event,'podcast-spotify',{url,candidates}),audioAccess:false,timelineCompatibility:'unverified'};
    });break;
    case 'podcast-spotify-confirm':{const p=take(event,input.token,'podcast-spotify'),candidate=p.candidates.find(c=>c.entryId===input.entryId);if(!candidate)throw Error('Choose a previewed RSS episode.');if(store.entry(candidate.entryId).revision!==candidate.revision)throw Error('Podcast candidate changed. Preview again.');result={workspace:store.podcastWorkspace(candidate.entryId,candidate.sourceVersion,{spotifyUrl:p.url}),timelineCompatibility:'unverified',audioAccess:false};break;}
    case 'podcast-transcript':result=await job(event,input,async signal=>{const entry=store.entry(input.entryId);if(input.revision&&input.revision!==entry.revision)throw Error('Podcast entry changed.');const descriptor=entry.transcriptDescriptors?.[Number(input.descriptorIndex)||0];if(!descriptor)throw Error('Choose a publisher transcript.');const version=require('./podcast-session').sourceVersion(entry),saved=entry.podcastWorkspace;if(saved?.sourceVersion===version&&saved.transcript?.descriptorUrl===descriptor.url)return {...saved.transcript,timed:saved.transcript.state==='timed'?'yes':'no',ok:true,cached:true,entryId:entry.id,revision:entry.revision};const result=await requestTranscript(descriptor,{signal});const current=store.entry(input.entryId);if(current.revision!==entry.revision||require('./podcast-session').sourceVersion(current)!==version)throw Error('Podcast entry changed.');if(result.ok&&result.text.length>500000)throw Error('Publisher transcript exceeds the 500000 character workspace limit.');if(result.ok&&['vtt','srt','plain'].includes(result.format))store.podcastWorkspace(entry.id,version,{transcript:{state:result.timed==='yes'?'timed':'untimed',text:result.text,format:result.format,provenance:'publisher',descriptorUrl:descriptor.url}});return {...result,entryId:entry.id,revision:entry.revision};},20000);break;
    case 'translate':result=await job(event,input,signal=>translateEntry(input,signal),180000);break;
    case 'preview':result=await job(event,input,signal=>preview(event,input.url,signal));break;
    case 'discover':result=await job(event,input,async signal=>{const response=await requestFeed(input.url,{signal});if(/^\s*<(?:!doctype\s+html|html|head)|text\/html/i.test(response.text.slice(0,200))||/text\/html/i.test(response.headers.get('content-type')||'')){const candidates=P.discoverFeeds(response.text,response.effectiveUrl);
      const source=input.podcastPage===true?P.discoverPodcastEpisode(response.text,response.effectiveUrl):null;
      if(!source)return {candidates,direct:false};
      const binding=input.playingAudio||null;
      try{
        const audio=await fetchValidated(source.episode.url,{head:true,accept:'audio/*',signal});
        const mime=audio.headers.get('content-type')?.split(';')[0].trim().toLowerCase();
        if(audio.status!==200||!mime?.startsWith('audio/')||/mpegurl|scpls/.test(mime))return {candidates,direct:false};
        if(binding&&(await observePodcastAudio?.(binding))!==source.episode.url)return {candidates,direct:false};
        signal.throwIfAborted();
        const length=Number(audio.headers.get('content-length'));
        if(!source.episode.duration&&!(Number.isSafeInteger(length)&&length>0))return {candidates,direct:false};
        source.episode.enclosureType=mime;
        if(Number.isSafeInteger(length)&&length>0)source.episode.enclosureLength=length;
        const {title,image,duration,pageUrl}=source.episode;
        return {candidates,direct:false,episode:{token:token(event,'podcast-page',{source,binding}),title,image,duration,pageUrl,show:source.podcast.title}};
      }catch(error){signal.throwIfAborted();return {candidates,direct:false};}}const p=await (async()=>{const parsed=P.parseFeed(response.text,response.effectiveUrl),feed={...parsed,url:P.safeUrl(input.url),effectiveUrl:response.effectiveUrl,etag:response.headers.get('etag')||'',lastModified:response.headers.get('last-modified')||''};delete feed.entries;return {token:token(event,'feed',{feed,entries:parsed.entries}),feed,entries:parsed.entries.slice(0,5),count:parsed.entries.length};})();return {candidates:[{url:response.effectiveUrl,title:p.feed.title,type:p.feed.format}],direct:true,preview:p};});break;
    case 'subscribe':{const p=take(event,input.token,'feed');result=store.subscribe({...p.feed,...(input.title!==undefined?{title:input.title}:{}),folder:input.folder},p.entries,input.initial||'latest20');break;}
    case 'refresh':result=await job(event,input,async signal=>{
     const snapshot=store.list().feeds;
     if(input.feedIds!==undefined&&(!Array.isArray(input.feedIds)||input.feedIds.length>200||input.feedIds.some(id=>typeof id!=='string')))throw Error('Choose up to 200 subscribed feeds.');
     const requested=input.feedId?[input.feedId]:input.feedIds;
     const eligible=requested?[...new Set(requested)].map(id=>snapshot.find(f=>f.id===id)):snapshot.filter(f=>f.enabled);
     if(eligible.some(f=>!f))throw Error('Choose a subscribed feed.');
     const feeds=eligible.slice(0,8),remainingFeedIds=eligible.slice(8).map(f=>f.id),results=[];
     for(const f of feeds){signal.throwIfAborted();results.push(await refreshOne(f,signal));}
     return {results,remainingFeedIds,...store.list()};
    });break;
    case 'cancel':jobs.get(owner(event)+':'+clean(input.requestId,80))?.abort();result={cancelled:true};break;
    case 'settings':result={settings:store.settings(input.paused)};if(input.paused)jobs.get('scheduler')?.abort();break;
    case 'feed-update':result={feed:store.updateFeed(input.feedId,input)};break;
    case 'unsubscribe':result=store.unsubscribe(input.feedId);break;
    case 'state':result=store.setState(input.entryIds,input);break;
    case 'state-read':result={entry:selectedState(input.entryId,input.revision).entry};break;
    case 'state-preview':{
     const changes=input.changes;
     if(!changes||typeof changes!=='object'||Array.isArray(changes)||!Object.keys(changes).length||Object.keys(changes).some(key=>!stateKeys.includes(key)||typeof changes[key]!=='boolean'))throw Error('Choose saved, read or later boolean changes only.');
     const selected=selectedState(input.entryId,input.revision),value={entryId:input.entryId,revision:input.revision,snapshot:selected.snapshot,changes:{...changes}};
     result={token:token(event,'entry-state',value),entry:selected.entry,changes:value.changes};break;
    }
    case 'state-apply':{
     const preview=take(event,input.token,'entry-state'),selected=selectedState(preview.entryId,preview.revision);
     if(selected.snapshot!==preview.snapshot)throw Error('Feed state changed. Review the source again.');
     const applied=store.setState(selected.ids,preview.changes);result={updated:applied.updated,entry:selectedState(preview.entryId,preview.revision).entry};break;
    }
    case 'undo':result=store.undo(input.token);break;
    case 'opml-preview':{const parsed=P.parseOpml(input.text);result={token:token(event,'opml',parsed.rows),rows:parsed.rows.map(r=>({...r,existing:store.snapshot().feeds.some(f=>f.url===r.url)})),rejected:parsed.rejected};break;}
    case 'opml-import':{const rows=take(event,input.token,'opml');if(!Array.isArray(input.selectedUrls)||input.selectedUrls.length>200||input.selectedUrls.some(url=>!rows.some(r=>r.url===url)))throw Error('Choose only previewed feeds.');const selected=rows.filter(r=>input.selectedUrls.includes(r.url)&&!store.snapshot().feeds.some(f=>f.url===r.url));if(store.snapshot().feeds.length+selected.length>200)throw Error('Feed subscription limit is 200.');for(const row of selected)store.subscribe(row,[],input.initial||'latest20');result={imported:selected.length,...store.list()};break;}
    case 'opml-export':result={text:P.exportOpml(store.list().feeds)};break;
    case 'editorial-preview':{const entry=store.entry(input.entryId),record=require('./feed-editorial').proposal(entry,input);result={token:token(event,'editorial',{entryId:entry.id,record,expectedRevision:entry.revision,expectedVersion:entry.editorial?.metadataVersion||0,catalogState:JSON.stringify(entry.links.map(link=>catalogStore?.().get(link.catalogId)||null))}),source:{title:entry.title,quote:record.quote},record};break;}
    case 'editorial-confirm':{const p=take(event,input.token,'editorial'),entry=store.entry(p.entryId);if(JSON.stringify(entry.links.map(link=>catalogStore?.().get(link.catalogId)||null))!==p.catalogState)throw Error('Linked film changed. Preview again.');result={entry:withLinkStates(store.editorial(p.entryId,p.record,p.expectedRevision,p.expectedVersion))};break;}
    case 'link-preview':{const entry=store.entry(input.entryId),catalog=catalogStore?.().get(input.catalogId);if(!catalog)throw Error('Choose a current library title.');const value={entryId:entry.id,catalogId:catalog.id,snapshot:catalogSnapshot(catalog),revision:entry.revision};result={token:token(event,'link',value),entryId:entry.id,catalog:{id:catalog.id,title:catalog.title,year:catalog.year,kind:catalog.kind,imdbId:catalog.imdbId,tmdbId:catalog.tmdbId},source:{title:entry.title,url:entry.url},automatic:false};break;}
    case 'link-confirm':{const p=take(event,input.token,'link'),catalog=catalogStore?.().get(p.catalogId),entry=store.entry(p.entryId);if(!catalog||catalogSnapshot(catalog)!==p.snapshot||entry.revision!==p.revision)throw Error('The source or film identity changed. Preview the relationship again.');result={entry:store.link(p.entryId,catalog)};break;}
    case 'unlink':result={entry:store.unlink(input.entryId,input.catalogId)};break;
    case 'related':{if(!catalogStore?.().get(input.catalogId))throw Error('Choose a current library title.');const candidates=store.entries({catalogId:input.catalogId,limit:200});const rows=candidates.rows.map(withLinkStates).filter(e=>e.links.some(l=>l.catalogId===input.catalogId&&l.state==='confirmed'));result={rows:rows.slice(0,50),total:rows.length,limited:candidates.total>200};break;}
    case 'context':{if(!Array.isArray(input.entryIds)||!input.entryIds.length||input.entryIds.length>3)throw Error('Select one to three sources.');const sources=[],seen=new Set();let remaining=16000,omitted=0;for(const id of input.entryIds){const e=store.entry(id);if(seen.has(e.canonicalId))continue;seen.add(e.canonicalId);if(e.spoiler==='marked'&&!e.spoilerAllowed){omitted++;continue;}const text=e.text.slice(0,Math.min(6000,remaining));remaining-=text.length;sources.push({id:'F'+createHash('sha256').update(e.id+e.revision).digest('hex').slice(0,16),entryId:e.id,title:e.title,url:e.url,text,scope:e.contentScope,revision:e.revision,shortened:e.textTruncated||text.length<e.text.length});}result={sources,text:sources.map(s=>'['+s.id+'] '+s.title+'\n'+s.scope+' · '+s.url+'\n'+s.text).join('\n\n'),counts:{selected:input.entryIds.length,included:sources.length,omitted},budget:16000};break;}
    default:throw Error('Unsupported feed action.');
   }
   return {ok:true,...result};
  }catch(error){return {ok:false,error:clean(error.message,500),errorKind:errorKind(error)};}
 };
 ipcMain.handle('feeds:request',handle);const startup=autoStart?setTimeout(()=>{void refreshDue().catch(()=>{});},5000):null,interval=autoStart?setInterval(()=>{void refreshDue().catch(()=>{});},60000):null;startup?.unref?.();interval?.unref?.();
 const removeCleanup=registerQuitCleanup(app,()=>dispose());
 function dispose(){if(disposed)return;disposed=true;clearTimeout(startup);clearInterval(interval);for(const controller of jobs.values())controller.abort();jobs.clear();tokens.clear();for(const row of managedAudio.values())void require('node:fs').promises.rm(row.file,{force:true}).catch(()=>{});managedAudio.clear();audioProgress.clear();removeCleanup();}
 return {handle,dispose,store,refreshDue,exactAudio:entry=>exactTranscriptAudio(entry),bindShelfPodcast(persisted){if(disposed)throw Error('Feed service is closed.');const entry=store.ensurePodcastEntry(persisted),session=require('./podcast-session');return {entryId:entry.id,sourceVersion:session.sourceVersion(entry),sourceBinding:session.sourceBinding(entry),episodeIdentity:session.episodeIdentity(entry),workspace:entry.podcastWorkspace||null};}};
}
module.exports={registerFeeds,fetchPublic,publicPin,pinnedRequest};
