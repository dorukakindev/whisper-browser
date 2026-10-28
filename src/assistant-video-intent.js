/* Only an explicit user message can request one of the existing video workflows. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.AssistantVideoIntent=api;})(typeof globalThis!=='undefined'?globalThis:this,()=>{
 'use strict';
 const foldCommand=(typeof module==='object'&&module.exports?require('./text-fold'):globalThis.WhisperTextFold).command;
 const clock=value=>{
  const parts=String(value).split(':').map(Number);
  if(parts.at(-1)>=60||parts.length===3&&parts[1]>=60)return NaN;
  return parts.length===2?parts[0]*60+parts[1]:parts[0]*3600+parts[1]*60+parts[2];
 };
 function match(value){
  const text=foldCommand(value).trim();
  if(!text||text.length>500||/["“”`]/u.test(text))return null;
  if(/(?:nasıl|neden|niye|how|why|what is|ne demek|yapabilir miyiz|mümkün mü)/u.test(text))return null;
  if(/(?:kötü|berbat|çalışmıyor|bozuk|terrible|broken|doesn't|isn't|do not|don't|istemiyorum)/u.test(text))return null;
  const noTranslation=/(?:çevirme|çevirmey|çevirilmesin|çevirisiz|çeviri olmadan|çeviri yapmadan|without translat|do not translat|don't translat)/u.test(text);
  if(/(?:çıkarma|çıkarılmasın|başlatma|without transcrib|do not transcrib|don't transcrib)/u.test(text))return null;
  if(/(?:sayfayı|web sayfasını|this page|the page|kitabı|book|pdf|film açıklamasını)/u.test(text))return null;
  // Configuration requests belong to the typed agent; never infer a production start.
  if(/(?:model(?:ini|i)?|motor(?:unu|u)?|engine|beam|ayar|settings?|precision|compute|device|font|boyut|opacity)/u.test(text))return null;
  const noWhisper=/(?:whisper.{0,15}kullanma|without whisper)/u.test(text);
  const whisper=!noWhisper&&/(?:\bwhisper\b|\btranscrib(?:e|ing|tion)\b)/u.test(text);
  const subtitle=/(?:altyaz|subtitle|caption)/u.test(text);
  const translate=/(?:çevir|translate|translation)/u.test(text);
  const action=/(?:çevir(?:ebilir misin|ir misin|sene|iniz|in)?|çıkar|oluştur|başlat|yap|hazırla)(?:\s|[,;.!?]|$)|\b(?:transcribe|translate|generate|create|start)\b/u.test(text)
    ||/^(?:(?:yalnız|sadece|only) whisper|whisper only|whisper\s*(?:\+|ve|and)\s*(?:çeviri|translation))[.!?]*$/u.test(text);
  if(!action||!(subtitle||whisper))return null;
  let kind;
  if(whisper)kind=translate&&!noTranslation?'whisper-translate':'whisper-only';
  else if(subtitle&&translate&&!noTranslation)kind='translate-track';
  else return null;
  // A time interval is accepted only when both ends and an explicit range connector exist.
  const timed=text.match(/\b(\d{1,3}:\d{2}(?::\d{2})?)\s*(?:-|–|—|ile|to|until|arasında|arasi)\s*(\d{1,3}:\d{2}(?::\d{2})?)\b/u);
  const minutes=text.match(/\b(\d{1,3})\s*(?:ile|-|–|—|to)\s*(\d{1,3})\s*(?:dakika|dakikalar|minute|min)\b/u);
  const ordinal=text.match(/\b(\d{1,3})\.?\s*dakika(?:dan|sından)?\s*(?:ile|to|-|–)?\s*(\d{1,3})\.?\s*dakika(?:ya|sına)?/u);
  const mins=minutes||ordinal;
  const range=timed?{start:clock(timed[1]),end:clock(timed[2])}:mins?{start:Number(mins[1])*60,end:Number(mins[2])*60}:null;
  const rangeInvalid=!!range&&(!Number.isFinite(range.start)||!Number.isFinite(range.end)||range.end<=range.start);
  const rangeUnresolved=!range&&/\d/u.test(text)&&/(?:dakika|saniye|minute|second|\d:|aralı|between)/u.test(text);
  const wholeVideo=/(?:videonun\s+(?:tamamını|tümünü)|(?:tüm|bütün)\s+videoyu|(?:whole|entire|full)\s+video)/u.test(text);
  const languages=[['tr',/türkçeye|(?:to|into)\s+turkish|türkçe\s+çevir/u],['en',/ingilizceye|(?:to|into)\s+english|ingilizce\s+çevir/u],['de',/almancaya|(?:to|into)\s+german|almanca\s+çevir/u],['fr',/fransızcaya|(?:to|into)\s+french|fransızca\s+çevir/u],['es',/ispanyolcaya|(?:to|into)\s+spanish|ispanyolca\s+çevir/u]];
  return Object.freeze({kind,range,rangeInvalid:rangeInvalid||wholeVideo&&!!range,rangeUnresolved,wholeVideo,targetLanguage:languages.find(([,rx])=>rx.test(text))?.[0]||'',forSpeech:/(?:seslendirmeye uygun|dublaj için|for dubbing|for speech)/u.test(text)});
 }
 return Object.freeze({match});
});
