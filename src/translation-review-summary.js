(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory();else root.TranslationReviewSummary=factory();})(globalThis,()=>{
 'use strict';
 const count=value=>Number.isFinite(Number(value))?Math.max(0,Math.floor(Number(value))):0;
 const indices=value=>Array.isArray(value)?[...new Set(value.filter(n=>Number.isSafeInteger(n)&&n>=0))]:[];
 function summarize(report={},coverage=[]){
  const groups=[
   ['numbers','translation_number_mismatch_indices','Numbers differ','Sayılar uyuşmuyor'],
   ['negation','translation_negation_mismatch_indices','Negation may be reversed','Olumlu/olumsuz anlam değişmiş olabilir'],
   ['names','translation_name_mismatch_indices','Names need review','Özel adları kontrol et'],
   ['empty','translation_empty_indices','Empty translation','Boş çeviri'],
   ['source','translation_untranslated_indices','Source text remains','Kaynak dilde kalan metin'],
   ['fragments','translation_truncated_fragment_indices','Incomplete sentence','Kesik cümle'],
   ['timing','translation_timing_mismatch_indices','Time expressions differ','Saat/süre ifadeleri uyuşmuyor'],
   ['currency','translation_currency_mismatch_indices','Currency differs','Para birimi uyuşmuyor'],
   ['units','translation_unit_mismatch_indices','Units differ','Ölçü birimi uyuşmuyor']
  ].map(([id,key,en,tr])=>({id,en,tr,indices:indices(report[key])})).filter(row=>row.indices.length);
  const shortened=indices(coverage);if(shortened.length)groups.push({id:'coverage',en:'Strongly shortened; review omissions',tr:'Belirgin kısalma; anlam kaybını kontrol et',indices:shortened});
  const total=count(report.translation_blocks),failed=Math.min(total,count(report.translation_failed));
  return {total,failed,ready:Math.max(0,total-failed),layout:count(report.cps_violations)+count(report.overlaps)+count(report.too_long),groups,
   needsReview:failed>0||count(report.translation_issues)>0||groups.length>0,rows:[...new Set(groups.flatMap(row=>row.indices))].sort((a,b)=>a-b)};
 }
 // Conservative advisory: short names, quotations and shared words are not failures.
 function untranslatedIndices(source,target,targetLanguage='tr'){
  if(targetLanguage!=='tr')return [];
  const normalize=value=>String(value||'').normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]/gu,'');
  const shortSentence=/^(?:i (?:do not|don['’]t) know|i (?:can not|cannot|can['’]t) remember|what (?:is it|do you mean)|where are we|that['’]s right)[.!?…]*$/iu;
  return target.flatMap((row,i)=>{
   const text=String(row.text||'').replace(/<[^>]*>/g,' '),words=text.match(/\p{L}+/gu)||[];
   const markers=text.toLowerCase().match(/\b(?:the|this|that|which|with|would|because|they|their|have|were|will|from|and|of|in|is|are|can|be|for|to|you|our)\b/g)||[];
   const sourceEcho=normalize(text)===normalize(source[i]?.text);
   if(sourceEcho&&shortSentence.test(text.trim()))return [i];
   if(words.length>=6&&markers.length>=3&&new Set(markers).size>=3&&!/[çğıöşüÇĞİÖŞÜ]/u.test(text)&&sourceEcho)return [i];
   if(words.length<10||markers.length<4||new Set(markers).size<3||/[çğıöşüÇĞİÖŞÜ]/u.test(text))return [];
   return [i];
  });
 }
 return Object.freeze({summarize,untranslatedIndices});
});
