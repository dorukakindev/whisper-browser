(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.AssistantContextManifest=api;})(typeof globalThis!=='undefined'?globalThis:this,()=>{
 'use strict';
 const text=(value,max=1000)=>typeof value==='string'?value.replace(/\0/g,'').slice(0,max):'';
 function clean(raw={}){
  const kind=['video','page','book','library','studio'].includes(raw.kind)?raw.kind:'studio';
  return {version:1,kind,owner:text(raw.owner,8000),thread:text(raw.thread,100),tabId:text(raw.tabId,200),generation:Number.isSafeInteger(raw.generation)?raw.generation:0,
   subtitleKey:text(raw.subtitleKey,100),title:text(raw.title,300),pageKey:text(raw.pageKey,100),time:Number.isFinite(raw.time)?Math.max(0,raw.time):0,
   hasFeedSources:raw.hasFeedSources===true,hasFeedEntries:raw.hasFeedEntries===true,hasSubtitles:raw.hasSubtitles===true,hasMedia:raw.hasMedia===true,voiceStudio:raw.voiceStudio===true,
   range:raw.range&&Number.isFinite(raw.range.start)&&Number.isFinite(raw.range.end)&&raw.range.start>=0&&raw.range.end>raw.range.start?{start:raw.range.start,end:raw.range.end}:null,
   tracks:(Array.isArray(raw.tracks)?raw.tracks:[]).slice(0,60).filter(row=>row&&typeof row.id==='string').map(row=>({id:text(row.id,200),role:row.role==='translation'?'translation':'source',language:text(row.language,24),partial:row.partial===true}))};
 }
 function same(left,right){return !!left&&!!right&&['kind','owner','thread','tabId','generation','pageKey'].every(key=>left[key]===right[key])&&left.range?.start===right.range?.start&&left.range?.end===right.range?.end;}
 function publicContext(raw){const {owner,thread,tabId,generation,pageKey,...safe}=clean(raw);return safe;}
 // Counts describe text delivered in this JSON, never evidence that the model read a whole source.
 function sourceSize(value={}){
  let characters=0,units=0;
  const add=(...parts)=>{const size=parts.reduce((sum,part)=>sum+(typeof part==='string'?part.replace(/\0/g,'').length:0),0);if(size){characters+=size;units++;}};
  for(const key of ['chapterText','selectedText','excerpt','reviewAnalysis','synopsis','note','cumle','mevcut_ceviri','not'])add(value[key]);
  add(value.page?.selectedText);
  for(const source of value.recallAnalysis?.sources||(Array.isArray(value.feedSources)?value.feedSources:[]))add(source?.text,source?.personalNote);
  for(const row of Array.isArray(value.page?.blocks)?value.page.blocks:[])add(row?.text);
  for(const key of ['onceki','sonraki'])for(const row of Array.isArray(value[key])?value[key]:[])add(row?.metin);
  add(value.hedef?.metin);
  const evidence=Array.isArray(value.transcript_evidence?.evidence)?value.transcript_evidence.evidence:Array.isArray(value.evidence)?value.evidence:[];
  for(const row of evidence)add(row?.metin??row?.text,row?.ceviri??row?.translation);
  return {characters,units};
 }
 function sourceText(context={},budget){
  const model=typeof module==='object'&&module.exports?require('./renderer/media-tools-model'):globalThis.MediaToolsModel;
  const reviewAnalysis=model?.normalizeReviewAnalysis(context.reviewAnalysis);
  // Only the reconstructed review contract receives a larger source allocation.
  budget=budget===undefined?(reviewAnalysis?72000:24000):budget;
  const supplied=sourceSize(context),prior=context.sourceCoverage;
  const upstreamOmissionsUnknown=prior?prior.upstreamOmissionsUnknown===true:context.sourceTruncated===true||context.truncated===true||context.selectedTextTruncated===true||context.page?.truncated===true||context.chapterTextComplete===false||(Array.isArray(context.transcript_evidence?.evidence)?context.transcript_evidence.evidence:Array.isArray(context.evidence)?context.evidence:[]).some(row=>row?.textTruncated===true||row?.translationTruncated===true);
  // A second normalization must retain the original denominator, including previously omitted units.
  const count=(value,fallback)=>Number.isSafeInteger(value)&&value>=fallback?value:fallback;
  const providedCharacters=count(prior?.providedCharacters,supplied.characters),providedUnits=count(prior?.providedUnits,supplied.units);
  const updateCoverage=()=>{
   const included=sourceSize(safe),omittedCharacters=Math.max(0,providedCharacters-included.characters),omittedUnits=Math.max(0,providedUnits-included.units);
   if(omittedCharacters||omittedUnits||upstreamOmissionsUnknown||prior?.status==='partial')safe.sourceTruncated=true;
   safe.sourceCoverage={scope:'provided_context',status:safe.sourceTruncated||upstreamOmissionsUnknown||prior?.status==='partial'?'partial':'provided_only',wholeSourceVerified:false,upstreamOmissionsUnknown,
    providedCharacters,includedCharacters:included.characters,omittedCharacters,providedUnits,includedUnits:included.units,omittedUnits};
  };
  const safe={};
  // Tool arguments need the selected title's public application identity, not
  // an opaque owner token or a guessed ID. Never forward paths or person IDs.
  const itemId=context.item_id||context.catalogId||context.id;
  if(['library-title','discovery-title'].includes(context.type)&&typeof itemId==='string'&&itemId.length<=160&&!itemId.startsWith('person:')&&(itemId.startsWith('discovery:')?/^discovery:(?:film|series):tt\d{7,12}$/.test(itemId):/^[A-Za-z0-9][A-Za-z0-9:_-]{0,159}$/.test(itemId)))safe.item_id=itemId;
  if(reviewAnalysis)safe.reviewAnalysis=reviewAnalysis;if(['available','empty','timeout','read_failed','source_changed','unavailable'].includes(context.pageReadStatus))safe.pageReadStatus=context.pageReadStatus;
  if(safe.pageReadStatus&&safe.pageReadStatus!=='available')safe.pageReadHint=({empty:'The page returned no readable text. Ask the user to select a passage or open the article, then read the new context.',timeout:'Page extraction exceeded four seconds. Retry reading the current page; do not infer missing content.',read_failed:'The page reader failed. Retry or use an explicitly selected passage; the exact site cause is unknown.',source_changed:'The extracted page no longer matches the current source. Read the current page again.',unavailable:'Page text is unavailable; the exact cause is unknown. Ask for a selected passage or retry reading.'})[safe.pageReadStatus];
  if(context.sourceTruncated===true||context.truncated===true||context.selectedTextTruncated===true)safe.sourceTruncated=true;
  const suppliedPool=context.assistant_tools?.rows;
  if(Array.isArray(suppliedPool)&&(suppliedPool.length>3100||suppliedPool.some(row=>typeof row?.text==='string'&&row.text.length>700||typeof row?.translation==='string'&&row.translation.length>700)))safe.sourceTruncated=true;
  for(const key of ['video','title','workspace','type','chapter','chapterText','chapterTextComplete','selectedText','excerpt','synopsis','note','pageUnavailable','zaman','cumle','mevcut_ceviri','not','sinir']){
   const limit=key==='chapterText'?16000:key==='excerpt'?8000:4000;
   const value=context[key];if(typeof value==='string'){safe[key]=text(value,limit);if(value.length>limit)safe.sourceTruncated=true;}else if(typeof value==='boolean')safe[key]=value;
  }
  if(['feed-sources','recall-sources'].includes(context.type)&&!context.recallAnalysis&&Array.isArray(context.feedSources)){let remaining=16000;safe.feedSources=context.feedSources.slice(0,3).filter(s=>s&&/^[FR][a-f0-9]{16}$/.test(s.id)&&typeof s.text==='string').map(s=>{const body=text(s.text,Math.min(6000,remaining));remaining-=body.length;return {id:s.id,entryId:text(s.entryId,200),title:text(s.title,300),url:text(s.url,2000),nodeId:text(s.nodeId,200),scope:context.type==='recall-sources'?text(s.scope,100):s.scope==='feed-full'?'feed-full':'summary',revision:text(s.revision,100),reactionRevision:text(s.reactionRevision,100),domain:text(s.domain,30),role:['positive-support','counter-evidence','context-only'].includes(s.role)?s.role:'context-only',tasteEligible:s.tasteEligible===true,startOffset:s.startOffset,endOffset:s.endOffset,text:body,shortened:s.shortened===true||body.length<s.text.length};});}
  if(context.type==='recall-sources'&&context.recallAnalysis){const contract=typeof module==='object'&&module.exports?require('./assistant-recall-contract'):globalThis.AssistantRecallContract;safe.recallAnalysis=contract.normalize(context.recallAnalysis);}
  if(typeof context.chapterText==='string'&&context.chapterText.length>16000)safe.chapterTextComplete=false;
  for(const key of ['onceki','sonraki'])if(Array.isArray(context[key]))safe[key]=context[key].slice(0,8).filter(row=>row&&typeof row==='object').map(row=>({zaman:text(row.zaman,30),metin:text(row.metin,1200)}));
  if(context.hedef)safe.hedef={zaman:text(context.hedef.zaman,30),metin:text(context.hedef.metin,1200),baslangic:Number(context.hedef.baslangic)||0,bitis:Number(context.hedef.bitis)||0};
  if(context.diller)safe.diller={kaynak:text(context.diller.kaynak,30),ceviri:text(context.diller.ceviri,30)};
  if(context.page&&typeof context.page==='object'){const blocks=Array.isArray(context.page.blocks)?context.page.blocks:[];safe.page={title:text(context.page.title,300),selectedText:text(context.page.selectedText,3000),truncated:context.page.truncated===true||blocks.length>40||String(context.page.selectedText||'').length>3000||blocks.some(row=>typeof row?.text==='string'&&row.text.length>400),
   blocks:blocks.slice(0,40).filter(row=>row&&typeof row==='object').map(row=>({id:text(row.id,40),text:text(row.text,400)}))};if(safe.page.truncated)safe.sourceTruncated=true;}
  const evidence=Array.isArray(context.transcript_evidence?.evidence)?context.transcript_evidence.evidence:Array.isArray(context.evidence)?context.evidence:null;
  if(evidence){safe.evidence=evidence.slice(0,12).filter(row=>row&&typeof row==='object').map(row=>({id:text(row.id,40),start:Number(row.baslangic??row.start)||0,text:text(row.metin??row.text,500),translation:text(row.ceviri??row.translation,500),
   ...(Number.isSafeInteger(row.textOffset)&&row.textOffset>=0?{textOffset:row.textOffset}:{}),...(Number.isSafeInteger(row.translationOffset)&&row.translationOffset>=0?{translationOffset:row.translationOffset}:{}),
   ...(row.textTruncated===true||String(row.metin??row.text??'').length>500?{textTruncated:true}:{}),...(row.translationTruncated===true||String(row.ceviri??row.translation??'').length>500?{translationTruncated:true}:{})}));if(evidence.length>12||evidence.some(row=>String(row?.metin??row?.text??'').length>500||String(row?.ceviri??row?.translation??'').length>500))safe.sourceTruncated=true;}
  updateCoverage();
  // Preserve valid JSON while bounding the source budget; never slice serialized JSON.
  while(JSON.stringify(safe).length>budget){
   safe.sourceTruncated=true;
   if(safe.page?.blocks.length){safe.page.blocks.pop();safe.page.truncated=true;}
   else if(safe.chapterText?.length>1000){safe.chapterText=safe.chapterText.slice(0,-1000);safe.chapterTextComplete=false;}
   else if(safe.feedSources?.length){safe.feedSources.pop();}
   else if(safe.evidence?.length)safe.evidence.pop();
   else if(safe.onceki?.length)safe.onceki.shift();
   else if(safe.sonraki?.length)safe.sonraki.pop();
   else if(safe.reviewAnalysis){delete safe.reviewAnalysis;}
   else {const key=Object.keys(safe).filter(key=>typeof safe[key]==='string').sort((a,b)=>safe[b].length-safe[a].length)[0];if(!key||!safe[key].length)return budget>=24?{sourceTruncated:true}:{};safe[key]=safe[key].slice(0,Math.max(0,safe[key].length-1000));}
   updateCoverage();
  }
  return safe;
 }
 function pool(raw){const seen=new Set();return (Array.isArray(raw)?raw:[]).slice(0,3100).filter(row=>row&&/^U\d+$/.test(row.id)&&!seen.has(row.id)&&Number.isFinite(row.start)&&Number.isFinite(row.end)&&row.start>=0&&row.end>=row.start&&(seen.add(row.id)||true)).map(row=>({id:row.id,start:row.start,end:row.end,text:text(row.text,700),translation:text(row.translation,700),
  ...(Number.isSafeInteger(row.textOffset)&&row.textOffset>=0?{textOffset:row.textOffset}:{}),...(Number.isSafeInteger(row.translationOffset)&&row.translationOffset>=0?{translationOffset:row.translationOffset}:{}),
  ...(row.textTruncated===true||typeof row.text==='string'&&row.text.length>700?{textTruncated:true}:{}),...(row.translationTruncated===true||typeof row.translation==='string'&&row.translation.length>700?{translationTruncated:true}:{})}));}
 return Object.freeze({clean,same,publicContext,sourceText,pool});
});
