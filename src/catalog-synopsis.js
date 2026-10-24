'use strict';
const {createHash}=require('node:crypto');
const synopsisHash=value=>createHash('sha256').update(String(value||'')).digest('hex');
function createSynopsisTranslation({store,translate}){
  const jobs=new Map();
  function stop(id,token){const job=jobs.get(id);if(job&&job.token===token)job.controller.abort();return {ok:true};}
  async function start(id,token){
    if(typeof token!=='string'||!/^[-a-zA-Z0-9]{8,100}$/.test(token))throw Error('Geçersiz çeviri isteği.');
    const item=store().get(id);if(!item?.synopsis)throw Error('Çevrilecek konu özeti bulunamadı.');
    const source=item.synopsis,hash=synopsisHash(source);
    if(item.synopsisTr&&item.synopsisTrSource===hash)return {ok:true,cached:true,item};
    if(typeof translate!=='function')throw Error('Çeviri sağlayıcısı kullanılamıyor.');
    const existing=jobs.get(id);if(existing&&!existing.controller.signal.aborted)throw Error('Bu özet zaten çevriliyor.');
    if(jobs.size>=2&&!existing)throw Error('Önce çalışan özet çevirisini bitirin veya durdurun.');
    const job={controller:new AbortController(),token};jobs.set(id,job);
    try{
      const result=await translate(source,job.controller.signal);job.controller.signal.throwIfAborted();
      if(typeof result!=='string'||!result.trim()||result.length>12000)throw Error('Çeviri yanıtı geçersiz veya çok uzun.');
      const current=store().get(id);if(!current||current.synopsis!==source)throw Error('Konu özeti değişti; yeniden çevirin.');
      const saved=store().upsert({id,synopsisTr:result.trim(),synopsisTrSource:hash});return {ok:true,item:saved};
    }catch(error){if(job.controller.signal.aborted)return {ok:false,canceled:true};throw error;}
    finally{if(jobs.get(id)===job)jobs.delete(id);}
  }
  return {start,stop};
}
module.exports={createSynopsisTranslation,synopsisHash};
