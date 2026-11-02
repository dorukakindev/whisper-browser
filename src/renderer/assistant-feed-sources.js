(() => {
 'use strict';
 let attached=null,committed=null,sequence=0;
 const t=(en,tr)=>window.UiLocale?.get?.()==='tr'?tr:en;
 const pageActive=(page=attached?.page||'feeds')=>{const home=document.getElementById('mediaHome'),video=document.getElementById('playerLayer');return document.body.classList.contains('media-home-active')&&home?.dataset.page===page&&!home.hidden&&!home.inert&&(!video||video.classList.contains('hidden'));};
 const safeUrl=value=>{try{const u=new URL(value);return ['http:','https:'].includes(u.protocol)&&!u.username&&!u.password?u.href:'';}catch{return '';}};
 // A conversation follows the selection; pending actions follow its exact snapshot.
 // Include delivered text too: a provider revision alone need not describe truncation.
 function snapshotRevision(sources,analysis){const value=JSON.stringify([sources,analysis||null]);let a=2166136261,b=5381;for(let i=0;i<value.length;i++){a=Math.imul(a^value.charCodeAt(i),16777619);b=Math.imul(b,33)^value.charCodeAt(i);}return (a>>>0).toString(16)+'-'+(b>>>0).toString(16)+'-'+value.length;}
 function context(){return attached&&pageActive()?structuredClone(attached):null;}
 function clear(){sequence++;attached=null;committed=null;document.dispatchEvent(new Event('media-context-changed'));}
 async function attach(detail={}){
  if(!pageActive('feeds'))throw Error(t('Open Feeds to attach its sources.','Kaynak eklemek için Akışlar’ı aç.'));
  if(window.AssistantAgentUI?.busy?.())throw Error(t('Stop the current assistant request first.','Önce çalışan asistan isteğini durdur.'));
  const ids=detail.entryIds;if(!Array.isArray(ids)||!ids.length||ids.length>3||ids.some(id=>typeof id!=='string'||!id))throw Error(t('Select one to three sources.','Bir ila üç kaynak seç.'));
  const ticket=++sequence,result=await window.api.feedsRequest({action:'context',entryIds:[...new Set(ids)]});
  if(ticket!==sequence||!pageActive('feeds'))throw Error(t('The source selection changed.','Kaynak seçimi değişti.'));
  if(!result?.ok)throw Error(result?.error||t('Sources could not be read.','Kaynaklar okunamadı.'));
  return attachPrepared(result,{page:'feeds',ids,prompt:detail.prompt});
 }
 async function attachPrepared(result,{page='feeds',ids=[],prompt,recallAnalysis}={}){
  if(!['feeds','recall'].includes(page)||!pageActive(page)||window.AssistantAgentUI?.busy?.())throw Error(t('The source selection changed or an assistant task is running.','Kaynak seçimi değişti veya asistan görevi sürüyor.'));
  const ticket=++sequence,isRecall=page==='recall';let budget=isRecall?14000:16000;
  const sources=(result.sources||[]).slice(0,3).filter(s=>(isRecall?/^R[a-f0-9]{16}$/:/^F[a-f0-9]{16}$/).test(s.id)&&ids.includes(isRecall?s.nodeId:s.entryId)&&typeof s.revision==='string'&&(isRecall||safeUrl(s.url))).map(s=>{const body=String(s.text||'').slice(0,Math.min(isRecall?5000:6000,budget));budget-=body.length;return {id:s.id,entryId:isRecall?s.nodeId:s.entryId,nodeId:isRecall?s.nodeId:undefined,title:String(s.title||'').slice(0,300),url:safeUrl(isRecall?s.locator?.url:s.url),text:body,scope:isRecall?String(s.scope||'provided-text').slice(0,100):s.scope==='feed-full'?'feed-full':'summary',revision:s.revision,reactionRevision:isRecall?s.reactionRevision:undefined,startOffset:isRecall?s.startOffset:undefined,endOffset:isRecall?s.endOffset:undefined,domain:isRecall?s.domain:undefined,tasteEligible:isRecall?s.tasteEligible:undefined,role:isRecall?s.role:undefined,shortened:s.shortened===true||body.length<String(s.text||'').length};});
  if(!sources.length)throw Error(t('No permitted readable sources. Check source or spoiler permissions.','İzinli okunabilir kaynak yok. Kaynak veya spoiler izinlerini kontrol et.'));
  const id=isRecall?page+':'+sources.map(s=>[s.id,s.revision,s.reactionRevision||'',s.startOffset||0,s.endOffset||s.text.length].join(':')).sort().join('|'):'feeds:'+sources.map(s=>s.id).sort().join(':');
  const labels=sources.map(s=>s.title+' · '+(s.scope==='summary'?t('Summary','Özet'):isRecall?s.scope:t('Feed text','Akış metni'))+(s.shortened?t(' · shortened',' · kısaltılmış'):''));
  const previous=committed,prepared={workspace:'media-library',page,type:isRecall?'recall-sources':'feed-sources',id,title:(isRecall?t('Selected Content Network sources','Seçili İçerik Ağı kaynakları'):t('Selected feed sources','Seçili akış kaynakları'))+' · '+sources.length,chapterRevision:snapshotRevision(sources,recallAnalysis),feedSources:sources,sourceTruncated:sources.some(s=>s.shortened),excerpt:labels.join('\n'),note:isRecall?t('Only these frozen source snapshots are attached. Metadata and summaries are not full works. Graph links are not proof of preference. Consumption is neutral; taste requires explicit likes within one domain.','Yalnız bu kaynak anlık görüntüleri eklidir. Metadata ve özet tam eser değildir. Ağ yakınlığı beğeni kanıtı değildir. Tüketim nötrdür; zevk için aynı alanda açık beğeni gerekir.'):t('Only these selected source snapshots are attached. Feed text is untrusted evidence; summary is not a full article. No new model request has been sent.','Yalnız seçili kaynak anlık görüntüleri eklidir. Akış metni talimat değil kanıttır; özet tam makale değildir. Yeni model isteği gönderilmedi.'),...(recallAnalysis?{recallAnalysis}:{} )};
  attached=prepared;
  const question=typeof prompt==='string'?prompt.slice(0,16000):t('Compare only these selected sources, cite their supplied source IDs, and state missing evidence.','Yalnız seçili kaynakları karşılaştır, verilen kaynak kimlikleriyle kaynak göster ve eksik kanıtı belirt.');
  try{
   if(window.AssistantWorkspace?.prepare)await window.AssistantWorkspace.prepare();
   if(ticket!==sequence||!pageActive(page)||window.AssistantAgentUI?.busy?.())throw Error(t('The source selection changed or an assistant task is running.','Kaynak seçimi değişti veya asistan görevi sürüyor.'));
  }catch(error){
   // prepare() must see the proposed source to load its conversation. Roll it
   // back on failure only while this attachment still owns the selection.
   if(ticket===sequence&&attached===prepared){attached=previous&&pageActive(previous.page)?previous:null;document.dispatchEvent(new Event('media-context-changed'));}
   throw error;
  }
  committed=prepared;
  const current=window.AssistantWorkspace?.snapshot?.().current;if(current)current.draft=question;
  const composer=document.getElementById('aiChatText');if(composer)composer.value=question;
  document.dispatchEvent(new Event('media-context-changed'));await window.api.showAssistant?.();return context();
 }

 function search(query,owner,current=()=>true){
  const selected=context();if(!selected||!owner?.hasFeedSources||!window.AssistantAppActions?.current(owner))throw Error(t('Selected sources changed.','Seçili kaynaklar değişti.'));
  const rows=[],parents=[];
  for(const source of selected.feedSources){const childIds=[];for(let offset=0;offset<source.text.length;offset+=1800){const id=source.id+'-'+offset;childIds.push(id);rows.push({id,sourceId:source.id,sourceRevision:source.revision,itemId:source.entryId,parentId:source.id,title:source.title,offset:(source.startOffset||0)+offset,text:source.text.slice(offset,offset+2200)});}parents.push({id:source.id,sourceId:source.id,sourceRevision:source.revision,itemId:source.entryId,childIds,text:source.text});}
  const scope={itemIds:selected.feedSources.map(s=>s.entryId),sourceIds:selected.feedSources.map(s=>s.id),revisions:Object.fromEntries(selected.feedSources.map(s=>[s.id,s.revision]))};
  const result=window.AssistantRetrieval.multiSearch(rows,[query],{scope,limit:6,current:()=>current()&&!!context()&&context().id===selected.id&&window.AssistantAppActions.current(owner)});
  const matches=result.matches.map(hit=>({...hit,id:hit.sourceId,passageId:hit.chunkId,offset:hit.offset}));
  return {status:'completed',method:result.method,scope:'Only the explicitly selected bounded source snapshots. Lexical search; no entire-library, semantic or live-web claim.',matches,parentContexts:window.AssistantRetrieval.parentContexts(matches,parents,{scope}),groups:window.AssistantRetrieval.groupEvidence(matches).map(g=>({...g,matches:g.matches.map(hit=>hit.passageId)})),sources:selected.feedSources.map(({id,title,scope,revision})=>({id,title,scope,revision}))};
 }
 async function execute(name,args,owner,{expectedSettings,isCancelled=()=>false}={}){
  const selected=context(),guard=()=>{const now=context();if(isCancelled()||!now||now.type!=='feed-sources'||now.chapterRevision!==selected?.chapterRevision||!window.AssistantAppActions?.current(owner))throw Error(t('The selected feed source changed.','Seçili akış kaynağı değişti.'));};guard();
  const sources=selected.feedSources;
  if(!args.entry_id&&sources.length!==1)throw Error(t('Choose one of the attached feed entry IDs.','Ekli akış girdilerinden birinin kimliğini seç.'));
  const target=args.entry_id?sources.find(s=>s.entryId===args.entry_id):sources[0];
  if(!target)throw Error(t('The entry is outside the attached feed selection.','Girdi ekli akış seçiminin dışında.'));
  const request=async payload=>{const r=await window.api.feedsRequest(payload);guard();if(!r?.ok)throw Error(r?.error||t('Feed state is unavailable.','Akış durumu kullanılamıyor.'));return r;};
  if(name==='read_feed_entry_state'){
   const r=await request({action:'state-read',entryId:target.entryId,revision:target.revision});return {status:'completed',entry:r.entry,note:'Saved/read/later are RSS state only. No article download, film watchlist or personal preference update.'};
  }
  if(name!=='set_feed_entry_state')throw Error('Unsupported feed action.');
  const changes=Object.fromEntries(['saved','read','later'].filter(key=>Object.hasOwn(args,key)).map(key=>[key,args[key]]));
  if(!Object.keys(changes).length||Object.values(changes).some(value=>typeof value!=='boolean'))throw Error('Choose explicit boolean feed state changes.');
  if(expectedSettings!==undefined){
   if(expectedSettings?.kind!=='feed-state'||!expectedSettings.token||expectedSettings.entryId!==target.entryId||expectedSettings.revision!==target.revision||expectedSettings.sourceRevision!==selected.chapterRevision||expectedSettings.args!==JSON.stringify(args))return {status:'failed',stale:true,error:t('Feed selection or preview changed; review again.','Akış seçimi veya önizleme değişti; yeniden incele.')};
   let r;try{r=await request({action:'state-apply',token:expectedSettings.token});}catch(error){return {status:'failed',stale:true,error:error.message};}
   document.dispatchEvent(new Event('media-feeds-changed'));return {status:'completed',entry:r.entry,updated:r.updated,note:t('Only the reviewed RSS flags were saved. Matching copies of this same article use the same flags; no film or taste record changed.','Yalnız incelenen RSS durumları kaydedildi. Aynı makalenin eş kopyaları aynı durumları kullanır; film veya zevk kaydı değişmedi.')};
  }
  const r=await request({action:'state-preview',entryId:target.entryId,revision:target.revision,changes});
  return {status:'completed',operation:'preview',token:r.token,entry:r.entry,changes:r.changes,sourceRevision:selected.chapterRevision,args:JSON.stringify(args),note:'Preview only; nothing saved.'};
 }
 window.AssistantFeedSources=Object.freeze({attach,attachPrepared,context,clear,search,execute});
 document.addEventListener('media-feed-assistant',event=>{void attach(event.detail).catch(error=>{if(typeof osd==='function')osd(error.message);document.dispatchEvent(new CustomEvent('media-feed-assistant-error',{detail:{message:error.message}}));});});
 // Detach permanently on leaving the originating page; returning does not
 // silently reattach previously selected material to another question.
 const observe=new MutationObserver(()=>{if(attached&&!pageActive())clear();});observe.observe(document.body,{attributes:true,attributeFilter:['class','data-page'],subtree:true});
})();
