(() => {
 'use strict';
 const contract=window.AssistantContextManifest,registry=window.AssistantCapabilities;
 const t=(en,tr)=>window.UiLocale?.get?.()==='tr'?tr:en;
 function snapshot(){
  const selection=globalAssistantContext(),tab=player.workspaceMode==='browser'?browserTabState():null;
  const url=player.browserPageUrl||'';
  const kind=selection?String(selection.type||'').startsWith('book')?'book':selection.workspace==='media-library'||selection.type==='library-title'?'library':'studio':currentBrowserYoutubeUrl()?'video':tab&&/^https?:/i.test(url)?'page':'studio';
  return contract.clean({kind,owner:aiSourceScope(),thread:window.AssistantWorkspace?.activeId()||'',tabId:tab?.id||'',generation:tab?.generation||0,
   pageKey:tab?window.AssistantSourceContext.pageKey(url):'',title:selection?.title||player.browserPageTitle||document.getElementById('playerTitle')?.textContent||'',
   time:player.workspaceMode==='browser'?Number(player.browserTime)||0:subtitleSourceTime(document.getElementById('playerVideo')?.currentTime||0,false),
   hasSubtitles:!selection&&!!(player.cues?.length||player.cues2?.length),
   range:kind==='video'?currentBrowserWhisperRange():null,
   tracks:kind==='video'?(player.browserTracks||[]).map(row=>({id:row.id,role:row.role,language:row.language,partial:row.captureComplete===false})):[]});
 }
 function current(owner){return contract.same(owner,snapshot());}
 async function execute(name,raw,owner,{deadline=Infinity}={}){
  if(!current(owner))throw Error(t('The source or conversation changed.','Kaynak veya sohbet değişti.'));
  if(Date.now()>=deadline)throw Error(t('Application action expired.','Uygulama işleminin süresi doldu.'));
  const args=registry.validate(name,JSON.parse(JSON.stringify(raw)),snapshot());
  const stale=()=>Date.now()>=deadline||!current(owner);
  if(name==='get_job_status')return {status:'completed',snapshot:true,running:!!(state.running||state.queueRunning),kind:player.job?.kind||'',percent:Number(player.job?.percent)||0,stage:String(player.job?.stage||'').slice(0,200)};
  if(name==='start_whisper'){
   if(state.running||state.queueRunning)throw Error(t('Another media job is running.','Başka bir medya işi çalışıyor.'));
   if(Object.hasOwn(args,'start')){
    const checked=validateBrowserWhisperRange(true,pSecToTime(args.start),pSecToTime(args.end),player.browserAdPlaying?0:Number(player.browserDuration));
    if(checked.error)throw Error(checked.error);player.browserWhisperRange={url:currentBrowserYoutubeUrl(),range:checked.range};
   }
   const executionOwner=snapshot();
   const result=await startBrowserYoutubeWhisper(args.translate,{forSpeech:args.forSpeech,isCancelled:()=>Date.now()>=deadline||!current(executionOwner)});
   if(!result?.ok)throw Error(t('Whisper was not confirmed as started.','Whisper başlangıcı doğrulanamadı.'));
   return {status:result.reused?'completed':'accepted',reused:!!result.reused,kind:result.job?.kind||'subtitles',note:result.reused?t('Existing subtitles were loaded.','Hazır altyazı yüklendi.'):t('The media job was accepted. Follow progress in the video job panel.','Medya işi kabul edildi. İlerlemeyi video işlem panelinden izle.')};
  }
  if(name==='translate_captions'){
   const track=player.browserTracks.find(row=>row.id===args.track_id&&row.role!=='translation');
   if(!track)throw Error(t('The source track no longer exists.','Kaynak altyazı artık bulunamıyor.'));
   if(state.running||state.queueRunning)throw Error(t('Another media job is running.','Başka bir medya işi çalışıyor.'));
   const result=await useBrowserTrack(true,track.id,{isCancelled:stale});
   if(!result?.ok)throw Error(result?.error||t('Caption translation was not confirmed as started.','Altyazı çevirisi başlangıcı doğrulanamadı.'));
   return {status:'accepted',note:t('Caption translation was accepted. Follow progress in the subtitle panel.','Altyazı çevirisi kabul edildi. İlerlemeyi altyazı panelinden izle.')};
  }
  if(name==='translate_page'){
   // The existing page service owns progress/cancellation. Do not hold the agent RPC until all blocks finish.
   void handleBrowserPageTranslationAction({ensureVisible:true,targetLanguage:args.target_language,isCancelled:stale}).then(result=>{
    if(!result?.ok&&!result?.partial&&!stale())logLine(result?.error||t('Page translation did not start.','Sayfa çevirisi başlamadı.'),'error');
   }).catch(error=>logLine(String(error.message).slice(0,200),'error'));
   return {status:'accepted',note:t('Page translation was requested. Its toolbar shows the actual progress and stop controls.','Sayfa çevirisi istendi. Gerçek ilerleme ve durdurma kontrolleri sayfa araç çubuğundadır.')};
  }
  if(name==='open_voice_preparation'){
   await window.MediaExperience.openVoice();return {status:'completed',note:t('Voice preparation is open. No audio was generated.','Ses hazırlığı açıldı. Ses üretilmedi.')};
  }
  if(name==='open_settings'){
   await window.AppSettingsUI.open(args.section);return {status:'completed',note:t('Settings opened.','Ayarlar açıldı.')};
  }
  const pool=contract.pool(window.AssistantWorkspace?.toolContext()?.rows),source=pool.find(row=>row.id===args.source_id);
  if(!source)throw Error(t('The source subtitle is no longer in scope.','Kaynak altyazı artık seçili kapsamda değil.'));
  if(name==='seek_to_time'){
   if(player.workspaceMode==='browser'){const result=await browserCommand('seek',source.start);if(!result?.ok)throw Error(result?.error||t('Playback jump failed.','Zamana gidilemedi.'));}
   else document.getElementById('playerVideo').currentTime=subtitleVideoTime(source.start,false);
   return {status:'completed',note:t('Moved to the source subtitle.','Kaynak altyazının zamanına gidildi.')};
  }
  if(name==='preview_translation_change'){
   await window.api.copyText(args.translation);return {status:'completed',note:t('Suggestion copied. The subtitle file was not modified.','Öneri kopyalandı. Altyazı dosyası değiştirilmedi.')};
  }
  throw Error(t('Action is not connected.','İşlem bağlı değil.'));
 }
 window.AssistantAppActions=Object.freeze({snapshot,current,execute});
})();
