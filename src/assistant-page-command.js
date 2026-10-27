/* Explicit page commands only: page text is never allowed to request actions. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.AssistantPageIntent=api;})(typeof globalThis!=='undefined'?globalThis:this,()=>{
 'use strict';
 const foldCommand=(typeof module==='object'&&module.exports?require('./text-fold'):globalThis.WhisperTextFold).command;
 function match(value){
  const text=foldCommand(value).trim();
  if(!text||text.length>500)return null;
  // Questions about the feature, quoted text, and negative requests stay in chat.
  if(/["“”`]/.test(text)||/\b(?:nasıl|neden|niye|how|why|whether)\b/u.test(text)||/(?:çevirme(?:yin|meni|yi)?|çevirmey|çevrilmesin|do not|don[’']t|without translating)/u.test(text))return null;
  if(/(?:ne demek|ne anlama|what does|what is|altyaz|subtitle|bu cümle|şu cümle|this sentence|selected text|seçili met)/u.test(text))return null;
  const page=/(?:sayfa[\p{L}]*|bu site[\p{L}]*|this (?:web)?page|the (?:web)?page|current (?:web)?page)/u.test(text);
  const translate=/(?:çevir(?:ebilir|ir|sene|seniz|in|iniz)?(?:\b|[?!.])|translate|translation)/u.test(text);
  const bare=/^(?:(?:lütfen|selam|merhaba)[, ]+)?(?:(?:bunu|burayı)\s+)?(?:(?:türkçeye|ingilizceye|almancaya|fransızcaya|ispanyolcaya)\s+)?çevir(?:ebilir misin(?:iz)?|ir misin(?:iz)?|sene|in|iniz)?[.!?]*$/u.test(text)||/^(?:please )?(?:(?:can|could) you )?translate (?:this|it)(?: (?:to|into) (?:turkish|english|german|french|spanish))?[.!?]*$/u.test(text);
  if((!page&&!bare)||!translate)return null;
  if(/(?:çevirisi|translation)/u.test(text)&&!/(?:başlat|aç|start|show|enable|translate (?:this|the|current))/u.test(text))return null;
  const languages=[['tr',/(?:türkçe|turkish)/u],['en',/(?:ingilizce|english)/u],['de',/(?:almanca|german)/u],['fr',/(?:fransızca|french)/u],['es',/(?:ispanyolca|spanish)/u]];
  return {kind:'translate-page',targetLanguage:languages.find(([,pattern])=>pattern.test(text))?.[0]||''};
 }
 return Object.freeze({match});
});
