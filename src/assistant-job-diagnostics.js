/* Public job evidence contains codes/counts only, never raw logs, paths or credentials. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.AssistantJobDiagnostics=api;})(typeof globalThis!=='undefined'?globalThis:this,()=>{
 'use strict';
 const labels={
  gpu_memory:['GPU memory was insufficient. Reduce parallelism or use a smaller model.','GPU belleği yetmedi. Paralelliği azalt veya daha küçük model kullan.'],
  timeout:['The engine or provider timed out. Inspect the job log before retrying.','Motor veya sağlayıcı zaman aşımına uğradı. Tekrarlamadan önce işlem kaydını kontrol et.'],
  authorization:['The provider rejected authorization. Check this provider in Settings.','Sağlayıcı yetkilendirmeyi reddetti. Ayarlarda ilgili sağlayıcıyı kontrol et.'],
  rate_limit:['The provider rate limit was reached. Wait before retrying.','Sağlayıcı istek sınırına ulaşıldı. Tekrarlamadan önce bekle.'],
  disk_space:['The output disk has insufficient free space.','Çıktı diskindeki boş alan yetersiz.'],
  dependency:['A required runtime or dependency was unavailable. Open the job log.','Gerekli çalışma ortamı veya bağımlılık bulunamadı. İşlem kaydını aç.'],
  network:['The source or provider could not be reached. Check the connection and job log.','Kaynağa veya sağlayıcıya ulaşılamadı. Bağlantıyı ve işlem kaydını kontrol et.'],
  unknown:['The job failed. Its exact cause was not classified; open the job log.','İş başarısız. Kesin neden sınıflandırılamadı; işlem kaydını aç.']
 };
 function classify(event={}){
  const value=[event.code,event.message,event.error,event.stderr].filter(v=>typeof v==='string').map(v=>v.slice(0,8000)).join(' ');
  for(const [code,pattern]of [
   ['gpu_memory',/CUDA.*out of memory|CUDA_ERROR_OUT_OF_MEMORY|GPU.*belle.*yet|CUBLAS_STATUS_ALLOC_FAILED/i],
   ['authorization',/unauthori[sz]ed|invalid[_ ]api[_ ]key|HTTP\s*(?:401|403)\b/i],
   ['rate_limit',/rate[_ ]limit|HTTP\s*429\b/i],['disk_space',/ENOSPC|No space left|disk.*full|disk.*yetersiz/i],
   ['dependency',/ModuleNotFoundError|No module named|DLL load failed|ENOENT|cudnn.*not found|cublas.*not found/i],
   ['timeout',/timed?\s*out|timeout|zaman aşımı|zaman asimi/i],
   ['network',/ECONNRESET|ECONNREFUSED|ENOTFOUND|network.*error|connection.*(?:failed|reset)|HTTP\s*5\d\d\b/i]
  ])if(pattern.test(value))return code;
  return 'unknown';
 }
 function describe(code,locale='en'){return (labels[code]||labels.unknown)[locale==='tr'?1:0];}
 function publicEvidence(row={}){
  const count=value=>Number.isSafeInteger(value)&&value>=0?value:0;
  return {failureCode:Object.hasOwn(labels,row.failureCode)?row.failureCode:null,
   counts:row.counts&&Number.isSafeInteger(row.counts.total)&&row.counts.total>0?{done:Math.min(count(row.counts.done),row.counts.total),total:row.counts.total,failed:Math.min(count(row.counts.failed),row.counts.total)}:null,
   result:row.result&&Array.isArray(row.result.artifacts)?{artifacts:row.result.artifacts.slice(0,12).filter(item=>['source','translation','dual'].includes(item.role)&&['srt','vtt','ass','ssa'].includes(item.format)).map(item=>({role:item.role,format:item.format,language:/^[a-zA-Z0-9-]{1,24}$/.test(item.language)?item.language:'',total:count(item.total),completed:count(item.completed),failed:count(item.failed),partial:item.partial===true})),limited:row.result.limited===true}:null};
 }
 return Object.freeze({classify,describe,publicEvidence});
});
