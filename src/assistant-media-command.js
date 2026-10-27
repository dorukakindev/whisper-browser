(function(root,factory){const value=factory();if(typeof module==='object'&&module.exports)module.exports=value;else root.AssistantMediaIntent=value;})(typeof globalThis!=='undefined'?globalThis:this,()=>{
 'use strict';
 const foldCommand=(typeof module==='object'&&module.exports?require('./text-fold'):globalThis.WhisperTextFold).command;
 const test=(re,q)=>re.test(q)||new RegExp(re.source.replace(/ı/g,'i'),re.flags).test(q.replace(/ı/g,'i'));
 function match(value){
  const q=foldCommand(value).replace(/[’']/g,"'").trim();if(!q||q.length>240||test(/["“”`]/,q)||test(/(?:nasıl|neden|why|how|ekleme(?:yin)?|eklemey|bulma|arama|don't|do not)/u,q))return null;
  if(test(/(?:izleme listem[eia]|izleme listesi|watchlist)/u,q)&&test(/(?:ekle(?:yebilir|r misin|sene)?|add|save)/u,q))return test(/(?:bu film|bu dizi|bu yapım|bunu|this|selected|\bit\b)/u,q)?{kind:'watchlist'}:null;
  if(test(/(?:bu film|bu dizi|bu yapım|bunu|this (?:film|movie|show|title))/u,q)&&test(/(?:yorumlarımla karşılaştır|zevk(?:imle| profilimle) karşılaştır|compare.*(?:my reviews|my taste))/u,q))return {kind:'reviews',question:q};
  if(test(/(?:benzer(?:lerini|leri|lerini de| yapım(?:ları)?| film(?:leri)?)|similar (?:titles|movies|films|shows))/u,q)&&test(/(?:bul|göster|ara|find|show|search)/u,q))return {kind:'similar',question:q};
  if(test(/(?:nerede izlenir|nereden izleyebilirim|nerede izleyebilirim|hangi platform|where (?:can [iı]|to) watch|watch providers)/u,q)){
   const countries=[['TR',/türkiye|turkey|türkiye’de|turkish/u],['US',/amerika|birleşik devlet|united states|\b(?:usa|abd)\b/u],['GB',/ingiltere|united kingdom|\buk\b/u],['DE',/almanya|germany/u],['FR',/fransa|france/u],['IT',/italya|italy/u],['ES',/ispanya|spain/u],['NL',/hollanda|netherlands/u],['CA',/kanada|canada/u],['AU',/avustralya|australia/u],['JP',/japonya|japan/u],['KR',/güney kore|south korea/u],['IN',/hindistan|india/u],['BR',/brezilya|brazil/u]];
   return {kind:'providers',question:q,region:countries.find(([,r])=>test(r,q))?.[0]||''};
  }
  return null;
 }
 function selectedRequest(question,title){
  const fold=value=>String(value||'').replace(/İ/g,'I').toLowerCase().replace(/ı/g,'i').replace(/[’']/g,'').replace(/[^\p{L}\p{N} ]/gu,' ').replace(/\s+/g,' ').trim();
  const q=fold(question),name=fold(title);
  if(name&&q.includes(name))return true;
  if(/(?:bu film|bu dizi|bu yapım|bunun|seçili|this|selected)/u.test(q))return true;
  const countries='(?:abd|türkiye|turkey|amerika|usa|united states|ingiltere|united kingdom|almanya|germany|fransa|france|italya|italy|ispanya|spain|hollanda|netherlands|kanada|canada|avustralya|australia|japonya|japan|güney kore|south korea|hindistan|india|brezilya|brazil)';
  const bare=q.replace(/^(?:lütfen|please)\s+/,'').replace(new RegExp('^'+countries.replace(/ı/g,'i')+'(?:de|da|den|dan)? +'),'');
  return test(/^(?:benzer|find similar|show similar|search similar|nerede izlenir|nereden izleyebilirim|nerede izleyebilirim|hangi platform|where (?:can [iı]|to) watch|watch providers)/u,bare);
 }
 return Object.freeze({match,selectedRequest});
});
