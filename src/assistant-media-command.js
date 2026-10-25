(function(root,factory){const value=factory();if(typeof module==='object'&&module.exports)module.exports=value;else root.AssistantMediaIntent=value;})(typeof globalThis!=='undefined'?globalThis:this,()=>{
 'use strict';
 function match(value){
  const q=String(value||'').normalize('NFKC').toLocaleLowerCase('tr').replace(/[’']/g,"'").trim();if(!q||q.length>240||/["“”`]/.test(q)||/(?:nasıl|neden|why|how|ekleme(?:yin)?|eklemey|bulma|arama|don't|do not)/u.test(q))return null;
  if(/(?:izleme listem[eia]|izleme listesi|watchlist)/u.test(q)&&/(?:ekle(?:yebilir|r misin|sene)?|add|save)/u.test(q))return /(?:bu film|bu dizi|bu yapım|bunu|this|selected|\bit\b)/u.test(q)?{kind:'watchlist'}:null;
  if(/(?:bu film|bu dizi|bu yapım|bunu|this (?:film|movie|show|title))/u.test(q)&&/(?:yorumlarımla karşılaştır|zevk(?:imle| profilimle) karşılaştır|compare.*(?:my reviews|my taste))/u.test(q))return {kind:'reviews',question:q};
  if(/(?:benzer(?:lerini|leri|lerini de| yapım(?:ları)?| film(?:leri)?)|similar (?:titles|movies|films|shows))/u.test(q)&&/(?:bul|göster|ara|find|show|search)/u.test(q))return {kind:'similar',question:q};
  if(/(?:nerede izlenir|nereden izleyebilirim|nerede izleyebilirim|hangi platform|where (?:can i|to) watch|watch providers)/u.test(q)){
   const countries=[['TR',/türkiye|turkey|türkiye’de|turkish/u],['US',/amerika|birleşik devlet|united states|usa/u],['GB',/ingiltere|united kingdom|uk/u],['DE',/almanya|germany/u],['FR',/fransa|france/u],['IT',/italya|italy/u],['ES',/ispanya|spain/u],['NL',/hollanda|netherlands/u],['CA',/kanada|canada/u],['AU',/avustralya|australia/u],['JP',/japonya|japan/u],['KR',/güney kore|south korea/u],['IN',/hindistan|india/u],['BR',/brezilya|brazil/u]];
   return {kind:'providers',question:q,region:countries.find(([,r])=>r.test(q))?.[0]||''};
  }
  return null;
 }
 function selectedRequest(question,title){
  const fold=value=>String(value||'').toLocaleLowerCase('tr').replace(/[’']/g,'').replace(/[^\p{L}\p{N} ]/gu,' ').replace(/\s+/g,' ').trim();
  const q=fold(question),name=fold(title);
  if(name&&q.includes(name))return true;
  if(/(?:bu film|bu dizi|bu yapım|bunun|seçili|this|selected)/u.test(q))return true;
  const countries='(?:türkiye|turkey|amerika|usa|united states|ingiltere|united kingdom|almanya|germany|fransa|france|italya|italy|ispanya|spain|hollanda|netherlands|kanada|canada|avustralya|australia|japonya|japan|güney kore|south korea|hindistan|india|brezilya|brazil)';
  const bare=q.replace(/^(?:lütfen|please)\s+/,'').replace(new RegExp('^'+countries+'(?:de|da|den|dan)? +'),'');
  return /^(?:benzer|find similar|show similar|search similar|nerede izlenir|nereden izleyebilirim|nerede izleyebilirim|hangi platform|where (?:can i|to) watch|watch providers)/u.test(bare);
 }
 return Object.freeze({match,selectedRequest});
});
