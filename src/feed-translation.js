'use strict';
const {createHash}=require('node:crypto');
// The original feed text and read state are never rewritten by a translation.
function chunksOf(text,limit=2200){
 const parts=[];let rest=text;
 while(rest.length>limit){let cut=rest.lastIndexOf('\n',limit);if(cut<limit/2)cut=rest.lastIndexOf(' ',limit);if(cut<limit/2)cut=limit;if(/[\uD800-\uDBFF]/.test(rest[cut-1]))cut--;parts.push(rest.slice(0,cut));rest=rest.slice(cut);}
 if(rest)parts.push(rest);return parts;
}
function createFeedTranslation({store,translate}){
 const cache=new Map(),running=new Set();
 return async function start(input,signal){
  const entry=store.entry(input.entryId);
  if(!input.revision||input.revision!==entry.revision)throw Error('Kaynak metni değişti. Yazıyı yeniden açıp çevir.');
  if(entry.spoiler==='marked'&&!entry.spoilerAllowed)throw Error('Çevirmeden önce spoiler içeren kaynak metnini göster.');
  const text=entry.text||entry.summary||'';if(!text.trim()||text.length>50000)throw Error('Çevrilecek kayıtlı metin bulunamadı veya sınırı aşıyor.');
  const hash=createHash('sha256').update(text).digest('hex'),key=entry.id+':'+entry.revision+':'+hash;
  if(cache.has(key))return {text:cache.get(key),revision:entry.revision,cached:true};
  if(typeof translate!=='function')throw Error('Çeviri sağlayıcısı kullanılamıyor.');
  if(running.has(key)||running.size>=2)throw Error('Önce çalışan yazı çevirisini bitir veya durdur.');
  running.add(key);
  try{const translated=[];for(const part of chunksOf(text)){signal.throwIfAborted();const value=await translate(part,signal);signal.throwIfAborted();if(typeof value!=='string'||!value.trim()||value.length>14000)throw Error('Çeviri sağlayıcısı geçerli metin döndürmedi.');translated.push(value.trim());}
   const current=store.entry(entry.id);if(current.revision!==entry.revision||(current.text||current.summary||'')!==text)throw Error('Kaynak çeviri sırasında değişti; sonuç uygulanmadı.');
   const result=translated.join('\n\n');if(result.length>100000)throw Error('Çeviri sonucu saklama sınırını aşıyor.');cache.set(key,result);while(cache.size>16)cache.delete(cache.keys().next().value);return {text:result,revision:entry.revision,cached:false};
  }finally{running.delete(key);}
 };
}
module.exports={createFeedTranslation,chunksOf};
