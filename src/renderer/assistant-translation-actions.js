(() => {
 'use strict';
 const t=(en,tr)=>window.UiLocale?.get?.()==='tr'?tr:en;
 async function settings(){const s=await window.api.loadSettings();return s?.settings||s||{};}
 async function resolve(id){return window.AssistantTranslationProfiles.resolve(await settings(),id);}
 let changing=false;
 async function execute(name,args,owner,{deadline=Infinity,isCancelled=()=>false}={}){
  const stale=()=>isCancelled()||Date.now()>=deadline||!window.AssistantAppActions.current(owner);
  const s=await settings();if(stale())throw Error(t('The source changed.','Kaynak değişti.'));
  const profiles=window.AssistantTranslationProfiles.list(s);
  if(name==='list_translation_profiles')return {status:'completed',...window.AssistantTranslationProfiles.describe(s),note:t('Only configured profiles. No credentials are exposed. Selecting a job profile does not change global settings. Translation requests use standard scheduling.','Yalnız kayıtlı profiller. Anahtarlar gösterilmez. İş profili seçmek genel ayarları değiştirmez. Çeviri istekleri standart katmanı kullanır.')};
  const profile=profiles.find(p=>p.id===args.profile_id);if(!profile)throw Error(t('Configured profile unavailable.','Kayıtlı profil kullanılamıyor.'));
  if(name==='set_translation_profile'){
   if(changing)throw Error(t('Provider update is pending.','Sağlayıcı değişikliği sürüyor.'));const config=window.AssistantTranslationProfiles.resolve(s,args.profile_id),d=document;
   const controls={preset:d.getElementById('translateEndpointPreset'),url:d.getElementById('translateBaseUrl'),model:d.getElementById('translateModel'),key:d.getElementById('translateApiKey')};
   if(Object.values(controls).some(c=>!c||c.disabled))throw Error(t('Translation controls unavailable.','Çeviri kontrolleri kullanılamıyor.'));
   const before={preset:controls.preset.value,url:controls.url.value,model:controls.model.value,key:controls.key.value};
   const write=value=>{controls.url.value=value.url;controls.preset.value=value.preset;controls.preset.dispatchEvent(new Event('change',{bubbles:true}));controls.url.dispatchEvent(new Event('change',{bubbles:true}));controls.model.value=value.model;controls.model.dispatchEvent(new Event('input',{bubbles:true}));controls.key.value=value.key;controls.key.dataset.secretEdited='true';};
   const next={preset:[...controls.preset.options].some(o=>o.value===config.endpoint)?config.endpoint:'custom',url:config.endpoint,model:config.model,key:config.apiKey};
   const unchanged=()=>controls.preset.value===next.preset&&controls.url.value===next.url&&controls.model.value===next.model&&controls.key.value===next.key;
   changing=true;try{write(next);if(!await saveAppSettings())throw Error(t('Provider settings could not be saved.','Sağlayıcı ayarları kaydedilemedi.'));if(stale()||!unchanged())throw Error(t('Settings or source changed while saving. Review the provider.','Kaydederken kaynak veya ayarlar değişti. Sağlayıcıyı kontrol et.'));return {status:'completed',profile,note:t('Subtitle provider saved using the existing credential. No job started; running/queued jobs keep their own settings.','Altyazı sağlayıcısı kayıtlı anahtarıyla kaydedildi. İş başlamadı; çalışan/kuyruktaki işler kendi ayarını korur.')};}
   catch(error){if(unchanged()){write(before);if(!await saveAppSettings())throw Error(t('Provider update and rollback save failed. Review Settings.','Sağlayıcı değişimi ve geri alma kaydı başarısız. Ayarları kontrol et.'));}throw error;}finally{changing=false;}
  }
  return {status:'completed',profile};
 }
 window.AssistantTranslationActions=Object.freeze({execute,resolve});
})();
