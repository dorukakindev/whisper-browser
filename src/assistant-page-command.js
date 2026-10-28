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
  const page=/(?:sayfa[\p{L}]*|bu site[\p{L}]*|(?:this|the|current)(?: current)? (?:(?:turkish|english|german|french|spanish) )?(?:web)?page)/u.test(text);
  const translate=/(?:çevir(?:ebilir|ir|sene|seniz|in|iniz)?(?:\b|[?!.])|translate|translation)/u.test(text);
  const bare=/^(?:(?:lütfen|selam|merhaba)[, ]+)?(?:(?:bunu|burayı)\s+)?(?:(?:türkçeye|ingilizceye|almancaya|fransızcaya|ispanyolcaya)\s+)?çevir(?:ebilir misin(?:iz)?|ir misin(?:iz)?|sene|in|iniz)?[.!?]*$/u.test(text)||/^(?:please )?(?:(?:can|could) you )?translate (?:this|it)(?: (?:to|into) (?:turkish|english|german|french|spanish))?[.!?]*$/u.test(text);
  if((!page&&!bare)||!translate)return null;
  if(/(?:çevirisi|translation)/u.test(text)&&!/(?:başlat|aç|start|show|enable|translate (?:this|the|current))/u.test(text))return null;
  // A language describing the page is its source, not a requested target.
  const languages=[['tr','türkçe','turkish','ye'],['en','ingilizce','english','ye'],['de','almanca','german','ya'],['fr','fransızca','french','ya'],['es','ispanyolca','spanish','ya']];
  const explicit=text.match(/(?:^|\s)(?:to|into)\s+(turkish|english|german|french|spanish)(?=$|[^\p{L}])/u);
  const inLanguage=text.match(/(?:^|\s)in\s+(turkish|english|german|french|spanish)(?=$|[^\p{L}])/u);
  const target=explicit?languages.find(([, ,en])=>en===explicit[1]):languages.find(([,tr,,suffix])=>
   new RegExp('(?:^|[^\\p{L}])'+tr+"(?:['’]?"+suffix+')(?=$|[^\\p{L}])','u').test(text)
   ||new RegExp('(?:^|[^\\p{L}])'+tr+'\\s+çevir','u').test(text))
   ||(inLanguage?languages.find(([, ,en])=>en===inLanguage[1]):null);
  return {kind:'translate-page',targetLanguage:target?.[0]||''};
 }
 return Object.freeze({match});
});
