(() => {
 'use strict';
 // Assistant ↔ production panel. It reports which saved run the panel has selected and which media is open (two different
 // things), and opens one exact run in the existing panel. It never starts generation, recovery or a retry, never plays audio
 // and never approves anything: those stay with the user's own buttons in "Recent runs".
 const t=(en,tr)=>window.UiLocale?.get?.()==='tr'?tr:en;
 const dialog=()=>document.getElementById('dubGeneratorDialog');
 function panel(){
  const context=window.BrowserDubAudioUI?.context?.()||{},ui=window.DubRunsUI?.state?.()||{};
  return {status:'completed',panelOpen:!!dialog()?.open,selectedRunId:ui.selected||null,
   // The open media's source string is used by the main process only to compare recorded identities; it is not forwarded to the model.
   openSource:String(context.source||context.mediaKey||'').slice(0,4096),media:context.hasMedia?{title:String(document.getElementById('playerTitle')?.textContent||context.title||'').slice(0,160)}:null};
 }
 async function open(args,{stale=()=>false}={}){
  if(stale())throw Error(t('The source or conversation changed.','Kaynak veya sohbet değişti.'));
  if(args.target==='source'){
   // Main revalidates the recorded run/source identity before dispatch. Returning
   // reveals that same visible media; selecting a run is a different action.
   const context=window.BrowserDubAudioUI?.context?.();
   if(!context?.hasMedia||context.visible===false)throw Error(t('Open the matching source first. This record cannot reopen another source.','Önce eşleşen kaynağı açın. Bu kayıt başka bir kaynağı yeniden açamaz.'));
   if(dialog()?.open)dialog().close();
   return {status:'completed',run_id:args.run_id,target:'source',note:t('Returned to the matching open media. Nothing was played or generated.','Eşleşen açık medyaya dönüldü. Oynatma veya üretim başlatılmadı.')};
  }
  if(!window.DubGeneratorBridge||!window.DubRunsUI)throw Error(t('The production panel is not available.','Üretim paneli kullanılamıyor.'));
  if(!dialog()?.open)await window.DubGeneratorBridge.openPanel();
  if(stale())throw Error(t('The source or conversation changed.','Kaynak veya sohbet değişti.'));
  if(!dialog()?.open)throw Error(t('The production panel could not be opened.','Üretim paneli açılamadı.'));
  const result=await window.DubRunsUI.focusRun(args.run_id,args.target);
  if(stale())throw Error(t('The source or conversation changed.','Kaynak veya sohbet değişti.'));
  if(!result?.ok)throw Error(result?.code==='unknown-run'?t('This run is no longer in the list.','Bu çalışma artık listede yok.'):result?.message||t('Opening the run was not confirmed.','Çalışmanın açıldığı doğrulanamadı.'));
  const notes={source:t('The run is selected in the production panel. Its source matches the open media by recorded identity.','Çalışma üretim panelinde seçildi. Kaynağı, kayıtlı kimlikle açık medyayla eşleşiyor.'),
   result:t('The run is selected for listening-only review; nothing is playing and nothing was attached.','Çalışma yalnız dinleyerek inceleme için seçildi; hiçbir şey çalmıyor ve bağlanmadı.'),
   retry_preview:t('The retry preview is open in the panel. Nothing started; approval stays with the user.','Yeniden deneme önizlemesi panelde açık. Hiçbir şey başlamadı; onay kullanıcıda.')};
  return {status:'completed',run_id:args.run_id,target:args.target,selected:result.selected,audio_ready_paused:result.audioReady===true,preview_ready:result.previewReady===true,note:notes[args.target]};
 }
 window.AssistantVoiceRuns=Object.freeze({panel,open});
})();
