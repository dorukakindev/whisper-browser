'use strict';
const {randomUUID}=require('node:crypto'),C=require('./personal-collection'),model=require('./renderer/media-tools-model');
function create({metadata,rows,preferences,taste,getConfig,fetchImpl=fetch,run=require('./assistant-provider').run}){
 const previews=new Map(),jobs=new Map();
 const row=id=>{const r=rows().find(r=>r.id===id);if(!r||!['anime','manga'].includes(r.domain))throw Error('Choose an exact anime/manga title. / Kesin anime/manga yapımı seç.');return r;};
 async function preview(event,input){
  const initial=row(input.id),revision=C.hash(initial),source=await metadata.reviews({id:initial.id});if(C.hash(row(initial.id))!==revision)throw Error('Title changed; reload. / Yapım değişti; yeniden yükle.');
  if(!Array.isArray(input.selected)||!input.selected.length||input.selected.length>12||new Set(input.selected).size!==input.selected.length)throw Error('Select 1–12 reviews. / 1–12 yorum seç.');
  const selected=source.rows.filter(r=>input.selected.includes(r.id));if(selected.length!==input.selected.length)throw Error('Review sample changed; reload. / Yorum örneği değişti; yeniden yükle.');
  const reviews=selected.flatMap(r=>model.reviewRows(JSON.stringify([{id:String(r.id),author:r.author,authorId:r.authorId,text:r.body,permalink:r.url}])));
  const current=row(input.id),item={title:current.title,kind:current.domain,providerId:current.providerId,year:current.year||current.metadata?.year,synopsis:current.metadata?.description||''},signals=preferences.signals(current.domain),profile={...taste(current.domain),collectionPreferences:{domain:current.domain,revision:signals.revision,evidence:signals.evidence}};
  const {evidence,sample}=model.decisionEvidence(item,reviews,profile);if(!sample.reviews.length||!model.normalizeReviewAnalysis(JSON.stringify(evidence)))throw Error('No usable review sample. / Kullanılabilir yorum örneği yok.');
  const token=randomUUID(),p={sender:event.sender,id:current.id,revision:C.hash(current),preferences:signals.revision,profileRevision:JSON.stringify(evidence.profile),evidence,sample,at:Date.now()};previews.set(token,p);while(previews.size>20)previews.delete(previews.keys().next().value);
  return {token,evidence,reviews:sample.reviews,loaded:source.rows.length,selected:reviews.length,analyzed:sample.reviews.length,shortened:sample.truncated};
 }
 async function analyze(event,input){
  const p=previews.get(input.token);if(!p||p.sender!==event.sender||Date.now()-p.at>600000||input.confirm!==true)throw Error('Preview and confirm the current sample. / Güncel örneği inceleyip onayla.');
  const current=()=>{const r=row(p.id),s=preferences.signals(r.domain),profile={...taste(r.domain),collectionPreferences:{domain:r.domain,revision:s.revision,evidence:s.evidence}};return C.hash(r)===p.revision&&s.revision===p.preferences&&JSON.stringify(model.decisionEvidence({title:r.title,kind:r.domain,providerId:r.providerId,year:r.year||r.metadata?.year,synopsis:r.metadata?.description||''},p.sample.reviews,profile).evidence.profile)===p.profileRevision;};
  if(!current())throw Error('Title or profile changed; preview again. / Yapım veya profil değişti; yeniden önizle.');if(jobs.has(event.sender))throw Error('An analysis is running. / Analiz çalışıyor.');
  if(typeof input.requestId!=='string'||!/^[\w-]{1,80}$/.test(input.requestId))throw Error('Invalid request ID.');const config=getConfig?.();if(!config)throw Error('Configure the assistant provider. / Asistan sağlayıcısını yapılandır.');
  const controller=new AbortController(),job={id:input.requestId,controller};jobs.set(event.sender,job);previews.delete(input.token);
  try{const answer=await run({question:model.reviewAnalysisPrompt()+(p.evidence.kind==='manga'?' This is manga/manhwa: assess drawing under visuals; do not assess animation, music or voice acting.':' This is anime: visuals may include animation; sound may include music and voice acting.'),responseContract:'review-analysis',context:{kind:'library',title:p.evidence.title,reviewAnalysis:JSON.stringify(p.evidence)},config,locale:input.locale==='en'?'en':'tr',signal:AbortSignal.any([controller.signal,AbortSignal.timeout(240000)]),fetchImpl});controller.signal.throwIfAborted();if(!current())throw Error('Title or profile changed; result withheld. / Yapım veya profil değişti; sonuç uygulanmadı.');const analysis=model.parseDecisionResponse(answer.text,p.sample.reviews);if(p.evidence.kind==='manga'&&analysis.points.some(p=>p.topic==='sound'))throw Error('Unsupported manga aspect; result withheld. / Manga için geçersiz ölçüt; sonuç uygulanmadı.');return {analysis,reviews:p.sample.reviews,identity:p.evidence.identity,profile:p.evidence.profile};}
  catch(error){if(controller.signal.aborted)throw Error('Analysis stopped. / Analiz durduruldu.');if(error.message==='A review quote could not be verified.')throw Error(error.message);if(error.message.startsWith('Title or profile changed; result withheld.'))throw Error('Title or profile changed; result withheld. / Yapım veya profil değişti; sonuç uygulanmadı.');if(error.message.startsWith('Unsupported manga aspect; result withheld.'))throw Error('Unsupported manga aspect; result withheld. / Manga için geçersiz ölçüt; sonuç uygulanmadı.');throw Error('Analysis failed; your sample was kept. / Analiz başarısız; yorum örneği korundu.');}
  finally{if(jobs.get(event.sender)===job)jobs.delete(event.sender);}
 }
 function cancel(event,input){const job=jobs.get(event.sender);if(job?.id===input.requestId){job.controller.abort();return {cancelled:true};}return {cancelled:false};}
 return {preview,analyze,cancel};
}
module.exports={create};
