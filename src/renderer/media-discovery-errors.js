/* Stable, bounded user-facing discovery failures; shared by main and renderer. */
(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  else root.MediaDiscoveryErrors=api;
})(typeof window!=='undefined'?window:globalThis,function(){
  'use strict';
  const messages=Object.freeze({
    unauthorized:['This action was not authorized. Reopen the window and try again.','Bu işlem için yetki doğrulanamadı. Pencereyi yeniden açıp deneyin.'],
    rate_limit:['The catalog request limit was reached. Wait a little before trying again.','Katalog istek sınırına ulaşıldı. Biraz bekleyip yeniden deneyin.'],
    busy:['The catalog is busy. Wait for the current requests, then try again.','Katalog meşgul. Devam eden istekleri bekleyip yeniden deneyin.'],
    timeout:['The catalog did not respond in time. Check your connection and try again.','Katalog zamanında yanıt vermedi. Bağlantınızı kontrol edip yeniden deneyin.'],
    network:['Could not connect to the catalog. Check your internet connection and try again.','Kataloğa bağlanılamadı. İnternet bağlantınızı kontrol edip yeniden deneyin.'],
    unavailable:['The catalog is temporarily unavailable. Try again shortly.','Kataloğa şu anda erişilemiyor. Biraz sonra yeniden deneyin.'],
    invalid_filter:['The catalog filter or page is invalid. Check the year, genre and page, then try again.','Katalog filtresi veya sayfası geçersiz. Yıl, tür ve sayfa seçimini kontrol edip yeniden deneyin.'],
    invalid_data:['The catalog returned an unreadable response. Try again shortly.','Katalog okunamayan bir yanıt döndürdü. Biraz sonra yeniden deneyin.'],
    preferences:['Catalog preferences could not be read. Reopen the application and try again.','Katalog tercihleri okunamadı. Uygulamayı yeniden açıp deneyin.'],
    cancelled:['The operation was stopped. You can try again.','İşlem durduruldu. Yeniden deneyebilirsiniz.'],
    audio_unavailable:['This audio file could not be opened. Check that the file is still available.','Bu ses dosyası açılamadı. Dosyanın hâlâ yerinde olduğunu kontrol edin.'],
    unknown:['The operation could not be completed. Try again.','İşlem tamamlanamadı. Yeniden deneyin.'],
  });
  function classify(error){
    const code=error?.errorCode||error?.code;
    if(typeof code==='string'&&Object.hasOwn(messages,code))return code;
    const text=String(error?.error||error?.message||error||'').slice(0,2000);
    if(/unauthorized|yetkisiz/i.test(text))return 'unauthorized';
    if(/request limit|HTTP 429/i.test(text))return 'rate_limit';
    if(/discovery is busy/i.test(text))return 'busy';
    if(error?.name==='TimeoutError'||/timed?\s*out|timeout/i.test(text))return 'timeout';
    if(error?.name==='AbortError'||/aborted|cancelled|canceled|translation stopped/i.test(text))return 'cancelled';
    if(/fetch failed|failed to fetch|network|ENOTFOUND|ECONNREFUSED|ECONNRESET/i.test(text))return 'network';
    if(/HTTP 5\d\d|HTTP 40[134]|discovery redirect/i.test(text))return 'unavailable';
    if(/Invalid (?:discovery (?:page|limit|genre|preference)|release year)|Search uses the popular/i.test(text))return 'invalid_filter';
    if(/discovery preferences|discovery preference limit/i.test(text))return 'preferences';
    if(error?.name==='SyntaxError'||/Discovery.*(?:limit|large)|Invalid.*JSON|Unexpected.*JSON/i.test(text))return 'invalid_data';
    if(/Audio unavailable/i.test(text))return 'audio_unavailable';
    return 'unknown';
  }
  function message(error,locale){return messages[classify(error)][locale==='tr'?1:0];}
  return Object.freeze({classify,message});
});
