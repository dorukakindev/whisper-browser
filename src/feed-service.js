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
async function pinnedRequest(url,pin,{headers,signal,maxBytes=P.MAX_BYTES,transport}={}){
 const u=new URL(url),client=transport||(u.protocol==='https:'?https:http);
 return new Promise((resolve,reject)=>{
  let settled=false;const finish=(error,value)=>{if(settled)return;settled=true;signal?.removeEventListener('abort',stop);error?reject(error):resolve(value);};
  const request=client.request(u,{method:'GET',headers,agent:false,lookup:(_name,opts,callback)=>opts?.all?callback(null,[pin]):callback(null,pin.address,pin.family)},response=>{
   const status=Number(response.statusCode)||0,responseHeaders=new Headers();for(const [key,value]of Object.entries(response.headers||{}))if(value!==undefined)responseHeaders.set(key,Array.isArray(value)?value.join(', '):String(value));
   if([301,302,303,307,308,304].includes(status)||status!==200){finish(null,{status,headers:responseHeaders,buffer:Buffer.alloc(0)});response.destroy();return;}
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
async function fetchPublic(raw,{headers={},signal,lookup,transport}={}){
 let url=P.safeUrl(raw);if(!url)throw Object.assign(Error('Unsafe public feed URL.'),{code:'EUNSAFE'});
 const combined=signal?AbortSignal.any([signal,AbortSignal.timeout(15000)]):AbortSignal.timeout(15000);let requestHeaders={Accept:'application/rss+xml, application/atom+xml, application/feed+json, text/html;q=0.6','Accept-Encoding':'gzip, deflate, br','User-Agent':'Whisper-Browser-Feeds/1'};
 // This is a public feed transport, never an authenticated browser request.
 for(const key of ['If-None-Match','If-Modified-Since'])if(typeof headers[key]==='string'&&headers[key].length<=500&&!/[\r\n]/.test(headers[key]))requestHeaders[key]=headers[key];
 for(let hop=0;hop<=4;hop++){
  combined.throwIfAborted();const pin=await publicPin(url,{lookup,signal:combined}),response=await pinnedRequest(url,pin,{headers:requestHeaders,signal:combined,transport});combined.throwIfAborted();
  if(![301,302,303,307,308].includes(response.status))return {...response,effectiveUrl:url};
  const next=P.safeUrl(response.headers.get('location'),url);if(!next||hop===4||new URL(url).protocol==='https:'&&new URL(next).protocol!=='https:')throw Object.assign(Error('Unsafe or excessive feed redirect.'),{code:'EUNSAFE'});
  if(new URL(next).origin!==new URL(url).origin){requestHeaders={...requestHeaders};delete requestHeaders['If-None-Match'];delete requestHeaders['If-Modified-Since'];}url=next;
 }throw Error('Feed redirect limit.');
}
function errorKind(error){if(error?.code==='EUNSAFE')return 'unsafe';if(error?.code==='ELIMIT'||/exceeds|complexity|oversized/i.test(error?.message))return 'limit';if(error?.name==='AbortError')return 'cancelled';if(error?.name==='TimeoutError'||error?.code==='ETIMEDOUT')return 'timeout';if(error?.status===429)return 'rate-limit';if(error?.status)return 'http';if(/XML|JSON|RSS|Atom|feed body|response is not/i.test(error?.message))return 'parse';return 'network';}
function registerFeeds({app,ipcMain,authorized,userData=()=>app.getPath('userData'),catalogStore,translateText,transcriptFetcher=(descriptor,options)=>require('./podcast-transcript-service').fetchPodcastTranscript(descriptor,{...options,publicPin,pinnedRequest}),fetchValidated=fetchPublic,autoStart=true,now=()=>Date.now()}={}){
 const store=createFeedStore(path.join(userData(),'feeds.json'),{now}),jobs=new Map(),tokens=new Map(),hostChecks=new Map(),activeFeeds=new Set();let disposed=false,refreshing=false;
 const translateEntry=require('./feed-translation').createFeedTranslation({store,translate:translateText});
 const owner=event=>String(event?.sender?.id||'main');
 function token(event,type,value){const id=randomUUID();tokens.set(id,{owner:owner(event),type,value,expires:now()+600000});for(const [key,row]of tokens)if(row.expires<now())tokens.delete(key);while(tokens.size>30)tokens.delete(tokens.keys().next().value);return id;}
 function take(event,id,type){const row=tokens.get(id);if(!row||row.type!==type||row.owner!==owner(event)||row.expires<now())throw Error('Preview expired. Review the source again.');tokens.delete(id);return row.value;}
 async function requestFeed(url,options={}){
  const safe=P.safeUrl(url);if(!safe)throw Object.assign(Error('Unsafe public feed URL.'),{code:'EUNSAFE'});
  const response=await abortable(Promise.resolve().then(()=>fetchValidated(safe,options)),options.signal);const effectiveUrl=P.safeUrl(response.effectiveUrl||response.url||safe);if(!effectiveUrl)throw Object.assign(Error('Unsafe effective feed URL.'),{code:'EUNSAFE'});
  const headers=response.headers instanceof Headers?response.headers:new Headers(response.headers||{}),status=Number(response.status)||0;
  if(status===304)return {status,headers,effectiveUrl,text:''};
  if(status!==200)throw Object.assign(Error('Feed HTTP '+status+'.'),{status,retryAfter:headers.get('retry-after')});
  const bytes=response.buffer?Buffer.from(response.buffer):await abortable(readLimitedBytes(response,P.MAX_BYTES,'Feed'),options.signal);if(bytes.length>P.MAX_BYTES)throw Object.assign(Error('Feed body exceeds 2 MB.'),{code:'ELIMIT'});
  const type=headers.get('content-type')||'',charset=/charset\s*=\s*["']?([^;\s"']+)/i.exec(type)?.[1]||'utf-8';let text;try{text=new TextDecoder(charset).decode(bytes).replace(/^\uFEFF/,'');}catch{throw Error('Unsupported feed text encoding.');}return {status,headers,effectiveUrl,text};
 }
 async function job(event,input,run,timeout=30000){
  const requestId=clean(input.requestId||randomUUID(),80);if(!requestId||jobs.size>=4)throw Error('Feed request limit reached.');const key=owner(event)+':'+requestId;if(jobs.has(key))throw Error('Feed request already running.');const controller=new AbortController(),signal=AbortSignal.any([controller.signal,AbortSignal.timeout(timeout)]);jobs.set(key,controller);const sender=event?.sender,stop=()=>controller.abort();sender?.once?.('destroyed',stop);
  try{return await abortable(run(signal),signal);}finally{jobs.delete(key);sender?.removeListener?.('destroyed',stop);}
 }
 async function preview(event,url,signal){
  const response=await requestFeed(url,{signal});if(response.status===304)throw Error('Feed preview requires content.');const parsed=P.parseFeed(response.text,response.effectiveUrl),feed={...parsed,url:P.safeUrl(url),effectiveUrl:response.effectiveUrl,etag:response.headers.get('etag')||'',lastModified:response.headers.get('last-modified')||''};delete feed.entries;
  const previewToken=token(event,'feed',{feed,entries:parsed.entries});const dates=parsed.entries.map(e=>e.publishedAt).filter(Boolean).sort((a,b)=>b-a),frequencyDays=dates.length>1?(dates[0]-dates.at(-1))/86400000/(dates.length-1):null;
  return {token:previewToken,feed,entries:parsed.entries.slice(0,5),count:parsed.entries.length,contentScope:parsed.entries.some(e=>e.contentScope==='feed-full')?'mixed-or-full':'summary',frequencyDays};
 }
 async function refreshOne(feed,signal){
  if(activeFeeds.has(feed.id))return {feedId:feed.id,state:'busy',inserted:0};activeFeeds.add(feed.id);
  const headers={};if(feed.etag&&!/[\r\n]/.test(feed.etag))headers['If-None-Match']=feed.etag;if(feed.lastModified&&!/[\r\n]/.test(feed.lastModified))headers['If-Modified-Since']=feed.lastModified;
  try{const response=await requestFeed(feed.effectiveUrl||feed.url,{headers,signal});signal?.throwIfAborted();if(response.status===304){store.checked(feed.id);return {feedId:feed.id,state:'unchanged',inserted:0};}
   const parsed=P.parseFeed(response.text,response.effectiveUrl);signal?.throwIfAborted();const result=store.commit(feed.id,{...parsed,effectiveUrl:response.effectiveUrl,etag:response.headers.get('etag')||'',lastModified:response.headers.get('last-modified')||''});return {feedId:feed.id,state:'updated',inserted:result.inserted,updated:result.updated};
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
 const withLinkStates=entry=>({...entry,...require('./feed-editorial').view(entry),links:entry.links.map(link=>{const current=catalogStore?.().get(link.catalogId);return {...link,watchStatus:current?.watchStatus||'unspecified',state:!current?'missing':link.sourceRevision!==entry.revision?'stale':catalogSnapshot({...link,id:link.catalogId})===catalogSnapshot(current)?'confirmed':'stale'};})});
 const handle=async(event,input={})=>{
  if(!authorized(event))return {ok:false,error:'Unauthorized feed request.',errorKind:'unauthorized'};
  try{
   if(disposed)throw Error('Feed service is closed.');if(!input||typeof input!=='object'||Array.isArray(input))throw Error('Invalid feed request.');let result;
   switch(input.action){
    case 'list':result=store.list();break;
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
    case 'podcast-transcript':result=await job(event,input,async signal=>{const entry=store.entry(input.entryId);if(input.revision&&input.revision!==entry.revision)throw Error('Podcast entry changed.');const descriptor=entry.transcriptDescriptors?.[Number(input.descriptorIndex)||0];if(!descriptor)throw Error('Choose a publisher transcript.');const result=await transcriptFetcher(descriptor,{signal});const current=store.entry(input.entryId);if(current.revision!==entry.revision)throw Error('Podcast entry changed.');return {...result,entryId:entry.id,revision:entry.revision};},20000);break;
    case 'translate':result=await job(event,input,signal=>translateEntry(input,signal),180000);break;
    case 'preview':result=await job(event,input,signal=>preview(event,input.url,signal));break;
    case 'discover':result=await job(event,input,async signal=>{const response=await requestFeed(input.url,{signal});if(/^\s*<(?:!doctype\s+html|html|head)|text\/html/i.test(response.text.slice(0,200))||/text\/html/i.test(response.headers.get('content-type')||'')){const candidates=P.discoverFeeds(response.text,response.effectiveUrl);return {candidates,direct:false};}const p=await (async()=>{const parsed=P.parseFeed(response.text,response.effectiveUrl),feed={...parsed,url:P.safeUrl(input.url),effectiveUrl:response.effectiveUrl,etag:response.headers.get('etag')||'',lastModified:response.headers.get('last-modified')||''};delete feed.entries;return {token:token(event,'feed',{feed,entries:parsed.entries}),feed,entries:parsed.entries.slice(0,5),count:parsed.entries.length};})();return {candidates:[{url:response.effectiveUrl,title:p.feed.title,type:p.feed.format}],direct:true,preview:p};});break;
    case 'subscribe':{const p=take(event,input.token,'feed');result=store.subscribe({...p.feed,...(input.title!==undefined?{title:input.title}:{}),folder:input.folder},p.entries,input.initial||'latest20');break;}
    case 'refresh':result=await job(event,input,async signal=>{
     const snapshot=store.snapshot().feeds;
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
    case 'opml-export':result={text:P.exportOpml(store.snapshot().feeds)};break;
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
 function dispose(){if(disposed)return;disposed=true;clearTimeout(startup);clearInterval(interval);for(const controller of jobs.values())controller.abort();jobs.clear();tokens.clear();removeCleanup();}
 return {handle,dispose,store,refreshDue};
}
module.exports={registerFeeds,fetchPublic,publicPin,pinnedRequest};
