(() => {
 'use strict';
 const contract=window.AssistantContextManifest,registry=window.AssistantCapabilities;
 const t=(en,tr)=>window.UiLocale?.get?.()==='tr'?tr:en;
 function subtitleIdentity(){let hash=2166136261;for(const value of [player.subPath,player.subPath2,JSON.stringify(player.cues||[]),JSON.stringify(player.cues2||[])])for(const char of String(value||'')){hash=Math.imul(hash^char.charCodeAt(0),16777619);}return String(hash>>>0);}
 function snapshot(){
  const selection=globalAssistantContext(),tab=player.workspaceMode==='browser'?browserTabState():null;
  const url=player.browserPageUrl||'';
  const kind=selection?String(selection.type||'').startsWith('book')?'book':selection.workspace==='media-library'||['library-title','discovery-title','taste-profile','collection-plan'].includes(selection.type)?'library':'studio':currentBrowserYoutubeUrl()?'video':tab&&/^https?:/i.test(url)?'page':'studio';
  return contract.clean({kind,owner:aiSourceScope(),thread:window.AssistantWorkspace?.activeId()||'',tabId:tab?.id||'',generation:tab?.generation||0,
   pageKey:tab?window.AssistantSourceContext.pageKey(url):'',title:selection?.title||player.browserPageTitle||document.getElementById('playerTitle')?.textContent||'',
   time:player.workspaceMode==='browser'?Number(player.browserTime)||0:subtitleSourceTime(document.getElementById('playerVideo')?.currentTime||0,false),
   hasMedia:!selection&&!!window.BrowserDubAudioUI?.context()?.hasMedia&&!!window.BrowserDubAudioUI?.context()?.visible,voiceStudio:!!document.getElementById('dubGeneratorDialog')?.open,
   hasFeedSources:selection?.type==='feed-sources',subtitleKey:subtitleIdentity(),hasSubtitles:!selection&&!!(player.cues?.length||player.cues2?.length),
   range:kind==='video'?currentBrowserWhisperRange():null,
   tracks:kind==='video'?(player.browserTracks||[]).map(row=>({id:row.id,role:row.role,language:row.language,partial:row.captureComplete===false})):[]});
 }
 function current(owner){return contract.same(owner,snapshot());}
 async function execute(name,raw,owner,{deadline=Infinity,isCancelled=()=>false,expectedSettings}={}){
  if(!current(owner))throw Error(t('The source or conversation changed.','Kaynak veya sohbet değişti.'));
  if(['seek_to_time','open_subtitle_editor','search_subtitles','get_current_subtitle'].includes(name)&&owner.subtitleKey!==snapshot().subtitleKey)throw Error(t('The subtitle track changed. Ask for a new action.','Altyazı izi değişti. Yeni bir işlem isteyin.'));
  if(isCancelled()||Date.now()>=deadline)throw Error(t('Application action expired.','Uygulama işleminin süresi doldu.'));
  const args=registry.validate(name,JSON.parse(JSON.stringify(raw)),snapshot());
  const stale=()=>isCancelled()||Date.now()>=deadline||!current(owner);
  if(['search_subtitles','get_current_subtitle'].includes(name)){
   const result=window.AssistantWorkspace.searchSubtitleContext(name,args);
   if(stale()||owner.subtitleKey!==snapshot().subtitleKey)throw Error(t('The subtitle track or source changed.','Altyazı izi veya kaynak değişti.'));
   return result;
  }
  if(registry.get(name)?.domain==='music')return window.AssistantMusicActions.execute(name,args,owner,{deadline,isCancelled});
  if(['get_browser_tabs','browser_action'].includes(name))return window.AssistantBrowserActions.execute(name,args,owner,{deadline,isCancelled});
  if(['list_translation_profiles','get_translation_profile','set_translation_profile'].includes(name))return window.AssistantTranslationActions.execute(name,args,owner,{deadline,isCancelled,expectedSettings});
  if(['get_workflow_settings','configure_workflow','undo_workflow_settings'].includes(name))return window.AssistantWorkflowActions.execute(name,args,owner,{deadline,isCancelled,expectedSettings});
  if(name==='search_sources')return window.AssistantFeedSources.search(args.query,owner,()=>!stale());
  if(registry.get(name)?.domain==='library'||['get_app_preferences','set_app_preferences','undo_app_preferences','navigate_workspace','get_playback_state','playback_control'].includes(name))return window.AssistantLibraryActions.execute(name,args,owner,{deadline,isCancelled,expectedSettings});
  if(registry.get(name)?.domain==='book')return window.AssistantBookActions.execute(name,args,owner,{deadline,isCancelled});
  if(registry.get(name)?.domain==='voice'&&name!=='open_voice_preparation')return window.AssistantVoiceActions.execute(name,args,owner,{deadline,isCancelled,expectedSettings});
  if(name==='get_job_status')return {status:'completed',...await window.api.assistantJobs()};
  if(name==='use_job_subtitles'){
   const track=(player.browserTracks||[]).find(row=>row.backendJobId===args.job_id&&row.role===args.role&&row.path);
   if(!track)throw Error(t('This exact job output is not attached to the current source.','Bu işin çıktısı açık kaynağa kayıtlı değil.'));
   if((track.status==='partial'||track.failed>0)&&args.allow_partial!==true)throw Error(t('The subtitle output is partial. Review it before using.','Altyazı çıktısı kısmi. Kullanmadan önce kontrol et.'));
   const result=await useBrowserTrack(false,track.id,{isCancelled:stale});
   if(stale()||!result?.ok||player.subPath!==track.path)throw Error(t('Subtitle attachment was not confirmed.','Altyazı bağlantısı doğrulanamadı.'));
   return {status:'completed',track:{id:track.id,role:track.role,language:track.language,partial:track.status==='partial'||track.failed>0},note:t('The exact job subtitle was loaded. No new production started.','İlgili işin altyazısı yüklendi. Yeni üretim başlamadı.')};
  }
  if(name==='start_whisper'){
   if(state.running||state.queueRunning)throw Error(t('Another media job is running.','Başka bir medya işi çalışıyor.'));
   let clipRange=currentBrowserWhisperRange();
   if(Object.hasOwn(args,'start')){
    const checked=validateBrowserWhisperRange(true,String(args.start),String(args.end),player.browserAdPlaying?0:Number(player.browserDuration));
    if(checked.error)throw Error(checked.error);clipRange=checked.range;
   }
   const translationConfig=args.translation_profile?await window.AssistantTranslationActions.resolve(args.translation_profile):null;
   if(stale())throw Error(t('The source changed.','Kaynak değişti.'));
   const executionOwner=snapshot();
   const result=await startBrowserYoutubeWhisper(args.translate,{forSpeech:args.forSpeech,targetLanguage:args.target_language,translationConfig,clipRange,isCancelled:()=>isCancelled()||Date.now()>=deadline||!current(executionOwner)});
   if(!result?.ok)throw Error(t('Whisper was not confirmed as started.','Whisper başlangıcı doğrulanamadı.'));
   return {status:result.reused?'completed':'accepted',jobId:result.jobId||result.job?.backendJobId,reused:!!result.reused,kind:result.job?.kind||'subtitles',note:result.reused?t('Existing subtitles were loaded.','Hazır altyazı yüklendi.'):t('The media job was accepted. Follow progress in the video job panel.','Medya işi kabul edildi. İlerlemeyi video işlem panelinden izle.')};
  }
  if(['translate_captions','translate_video_captions'].includes(name))return window.AssistantCaptionActions.translate(args,owner,{deadline,isCancelled});
  if(name==='load_caption_track'){const result=await useBrowserTrack(false,args.track_id,{isCancelled:stale});if(!result?.ok||stale())throw Error(t('Subtitle load was not confirmed.','Altyazı yüklenmesi doğrulanamadı.'));return {status:'completed',note:t('Subtitles loaded; no translation started.','Altyazı yüklendi; çeviri başlamadı.')};}
  if(name==='translate_page'){
   // Await validation and exact job registration, never the whole translation.
   const result=await handleBrowserPageTranslationAction({ensureVisible:true,targetLanguage:args.target_language,waitForAcceptance:true,isCancelled:stale});
   if(stale()){
    if(result?.accepted&&result.jobId&&!result.running){
     const stopped=await window.api.cancelAssistantJob({id:result.jobId});
     if(!stopped?.ok)throw Error(t('The source changed and stopping the new translation failed. Open Jobs.','Kaynak değişti ve yeni çeviri durdurulamadı. İşler bölümünü açın.'));
    }
    throw Error(t('The source or conversation changed.','Kaynak veya sohbet değişti.'));
   }
   if(!result?.ok)throw Error(result?.error||t('Page translation did not start.','Sayfa çevirisi başlamadı.'));
   if(result.accepted&&typeof result.jobId==='string'&&result.jobId)
    return {status:'accepted',jobId:result.jobId,running:!!result.running,note:result.running?t('This page translation is already running. Follow this exact job in Jobs.','Bu sayfanın çevirisi zaten sürüyor. İşler bölümünde bu işi takip edin.'):t('Page translation was accepted. Follow progress and stop controls in Jobs or the page toolbar.','Sayfa çevirisi kabul edildi. İlerleme ve durdurmayı İşler bölümünde veya sayfa araç çubuğunda takip edin.')};
   if(result.shown)return {status:'completed',note:t('The existing page translation is shown. No new translation job started.','Mevcut sayfa çevirisi gösteriliyor. Yeni çeviri işi başlatılmadı.')};
   if(result.unchanged&&!result.budgetReached&&!(Number(result.completion?.pending)>0)&&!(Number(result.failed)>0))return {status:'completed',note:t('No new page blocks needed translation.','Çevrilecek yeni sayfa bloğu bulunmadı.')};
   throw Error(t('Page translation acceptance could not be verified. Open the page toolbar.','Sayfa çevirisinin kabulü doğrulanamadı. Sayfa araç çubuğunu açın.'));
  }
  if(name==='open_voice_preparation'){
   const opened=await window.MediaExperience.openVoice();
   if(stale())throw Error(t('The source or conversation changed.','Kaynak veya sohbet değişti.'));
   if(opened===false||!document.getElementById('dubGeneratorDialog')?.open)throw Error(t('Voice preparation could not open.','Ses hazırlığı açılamadı.'));
   return {status:'completed',note:t('Voice preparation is open. No audio was generated.','Ses hazırlığı açıldı. Ses üretilmedi.')};
  }
  if(name==='open_settings'){
   await window.AppSettingsUI.open(args.section,{preserveAssistantContext:true});return {status:'completed',note:t('Settings opened.','Ayarlar açıldı.')};
  }
  const source=window.AssistantWorkspace?.subtitleById(args.source_id,owner);
  if(!source)throw Error(t('The source subtitle is no longer in scope.','Kaynak altyazı artık seçili kapsamda değil.'));
  if(name==='open_subtitle_editor'){
   if(player.workspaceMode==='browser'){
    const descriptors=subtitleFindDescriptors();let target;
    for(const descriptor of descriptors){const index=descriptor.cues.findIndex(row=>row.start===source.start&&row.end===source.end&&row.text===source.text);if(index>=0){target={channel:descriptor.channel,index};break;}}
    if(!target)throw Error(t('The original subtitle changed.','Kaynak altyazı değişti.'));openBrowserQuickEditor(false,target);if(!browserQuickEditor?.rows?.length)throw Error(t('The editor could not open.','Düzenleyici açılamadı.'));
   }else{const index=player.cues.findIndex(row=>row.start===source.start&&row.end===source.end&&row.text===source.text);if(index<0)throw Error('Subtitle changed.');player.activeIdx=index;openCueEditor(false);if(!player.cueEditTarget)throw Error(t('The editor could not open.','Düzenleyici açılamadı.'));}
   return {status:'completed',note:t('Subtitle editor opened. Nothing was saved.','Altyazı düzenleyicisi açıldı. Dosya kaydedilmedi.')};
  }
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
