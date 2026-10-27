(() => {
 'use strict';
 const t=(en,tr)=>window.UiLocale?.get?.()==='tr'?tr:en;
 async function execute(name,args,owner,{deadline=Infinity,isCancelled=()=>false}={}){
  const stale=()=>isCancelled()||Date.now()>=deadline||!window.AssistantAppActions.current(owner);
  if(stale())throw Error(t('The source changed.','Kaynak değişti.'));
  const ui=window.DubGeneratorUI?.assistant;
  if(name==='get_voice_status')return {status:'completed',voice:ui?.state(args)||{opened:false},attached:!!window.BrowserDubAudioUI?.originalPlayback(),note:t('Only selected settings and bounded check results; the model has not listened to this audio.','Yalnız seçili ayarlar ve sınırlı kontrol sonuçlarıdır; model bu sesi dinlemedi.')};
  if(name==='list_voice_references'){
   const result=await window.api.listVoiceReferences();if(stale()||!result?.ok)throw Error(t('References could not be read.','Referanslar okunamadı.'));
   return {status:'completed',activeId:result.activeId,references:(result.references||[]).slice(0,80).map(row=>({id:row.id,name:String(row.name||'').slice(0,100)}))};
  }
  if(!ui)throw Error(t('Voice controls are unavailable.','Ses kontrolleri kullanılamıyor.'));
  let result,note;
  if(name==='restore_original_audio'){
   await window.BrowserDubAudioUI.stop();if(stale())throw Error(t('The source changed.','Kaynak değişti.'));
   return {status:'completed',note:t('Replacement audio was removed.','Harici ses bağlantısı kaldırıldı.')};
  }
  if(['set_voice_reference','pick_local_voice_reference','prepare_voice_reference'].includes(name)){
   if(!document.getElementById('dubGeneratorDialog')?.open)await window.DubGeneratorUI.prepareCurrent();if(stale())throw Error(t('The source changed.','Kaynak değişti.'));
   if(name==='set_voice_reference'){result=await window.VoiceReferenceUI.use(args.reference_id,stale);if(result?.ok)await ui.refreshReference();note=t('Voice reference selected. No audio generated.','Referans ses seçildi. Ses üretilmedi.');}
   if(name==='pick_local_voice_reference'){result=await window.VoiceReferenceUI.chooseLocal(stale);note=t('Local audio selected. Prepare and review its reference before applying.','Yerel ses seçildi. Kullanmadan önce referansı hazırla ve kontrol et.');}
   if(name==='prepare_voice_reference'){result=await window.VoiceReferenceUI.prepare(args,stale);note=t('Reference prepared. Listen and review the transcript, then select it separately.','Referans hazırlandı. Dinleyip dökümü kontrol ettikten sonra ayrıca seç.');}
  }else if(name==='configure_voice_generation'){result=await ui.configure(args,stale);note=t('Dubbing options updated. Generation did not start.','Dublaj seçenekleri güncellendi. Üretim başlamadı.');}
  else if(name==='start_voice_generation'){result=await ui.start(args,stale);note=t('Voice job accepted. Follow progress in Jobs; quality is not yet confirmed.','Ses işi kabul edildi. İlerlemeyi İşler bölümünden izle; kalite henüz doğrulanmadı.');}
  else if(name==='voice_group'){result=await ui.group(args,stale);note=args.operation==='regenerate'?t('Regeneration accepted for this group.','Bu grup için yeniden üretim kabul edildi.'):args.operation==='listen'?t('Group playback started.','Grup dinlemesi başladı.'):t('The exact group is open in the editor. Nothing was saved.','İlgili grup düzenleyicide açıldı. Dosya kaydedilmedi.');}
  else if(name==='use_generated_voice'){result=await ui.use(args.output_id,stale);note=t('The matching generated voice is attached to this video.','Bu videoya ait üretilen ses bağlandı.');}
  if(stale())throw Error(t('The source changed. The previous job remains in Jobs.','Kaynak değişti. Önceki iş İşler bölümünde izlenebilir.'));
  if(!result?.ok)throw Error(t('Voice action was not confirmed. Check the existing voice panel.','Ses işlemi doğrulanamadı. Mevcut ses panelini kontrol et.'));
  return {jobId:result.id,status:name==='start_voice_generation'||name==='voice_group'&&args.operation==='regenerate'?'accepted':'completed',note};
 }
 window.AssistantVoiceActions=Object.freeze({execute});
})();
