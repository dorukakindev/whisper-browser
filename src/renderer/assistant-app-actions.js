(() => {
 'use strict';
 const contract=window.AssistantContextManifest,registry=window.AssistantCapabilities;
 const t=(en,tr)=>window.UiLocale?.get?.()==='tr'?tr:en;
 function subtitleIdentity(values){let hash=2166136261;for(const value of values||[player.subPath,player.sub2Path,JSON.stringify(player.cues||[]),JSON.stringify(player.cues2||[])])for(const char of String(value||'')){hash=Math.imul(hash^char.charCodeAt(0),16777619);}return String(hash>>>0);}
 function snapshot(){
  const selection=globalAssistantContext(),tab=player.workspaceMode==='browser'?browserTabState():null;
  const url=player.browserPageUrl||'';
  const shelfCandidate=selection?.workspace==='podcast'&&window.MediaShelfUI?.isPodcastMode?.()?window.MediaShelfUI.readSnapshot():null;
  const shelf=shelfCandidate&&shelfCandidate.episodeIdentity===selection.episodeIdentity&&shelfCandidate.sourceVersion===selection.sourceVersion?shelfCandidate:null;
  const shelfTracks=shelf?window.MediaShelfUI.getTranscriptTracks?.()||[]:[];
  const browserAudio=tab&&!selection&&typeof currentBrowserWhisperAudio==='function'?currentBrowserWhisperAudio():null;
  const kind=selection?String(selection.type||'').startsWith('book')?'book':selection.workspace==='media-library'||['library-title','discovery-title','taste-profile','collection-plan'].includes(selection.type)?'library':'studio':currentBrowserYoutubeUrl()?'video':tab&&/^https?:/i.test(url)?'page':'studio';
  return contract.clean({kind,owner:aiSourceScope(),thread:window.AssistantWorkspace?.activeId()||'',tabId:tab?.id||'',generation:tab?.generation||0,
   pageKey:tab?window.AssistantSourceContext.pageKey(url):'',title:selection?.title||player.browserPageTitle||document.getElementById('playerTitle')?.textContent||'',
   time:shelf?Number(shelf.time)||0:player.workspaceMode==='browser'?Number(player.browserTime)||0:subtitleSourceTime(document.getElementById('playerVideo')?.currentTime||0,false),
   hasMedia:!!shelf||!selection&&!!window.BrowserDubAudioUI?.context()?.hasMedia&&!!window.BrowserDubAudioUI?.context()?.visible,voiceStudio:!!document.getElementById('dubGeneratorDialog')?.open,
   hasFeedSources:['feed-sources','recall-sources'].includes(selection?.type),hasFeedEntries:selection?.type==='feed-sources',subtitleKey:shelf?subtitleIdentity([JSON.stringify(shelfTracks.map(track=>[track.id,track.revision,track.timed]))]):subtitleIdentity(),hasSubtitles:shelf?shelfTracks.some(track=>track.timed&&track.cues?.length):!selection&&!!(player.cues?.length||player.cues2?.length),
   hasBrowserAudio:!!browserAudio,audioKey:browserAudio?.mediaToken,range:kind==='video'||browserAudio?currentBrowserWhisperRange():null,
   tracks:kind==='video'?(player.browserTracks||[]).map(row=>({id:row.id,role:row.role,language:row.language,partial:row.captureComplete===false})):[]});
 }
 function current(owner){return contract.same(owner,snapshot());}
 async function personalSource(owner,guard){
  if(!owner.tabId||!['video','page'].includes(owner.kind))return null;
  const state=await window.api.getBrowserState();guard();const source=state?.personalMediaSource;
  if(!state?.ok||state.activeTabId!==owner.tabId||!source||source.tabId!==owner.tabId||source.generation!==owner.generation||typeof source.sourceToken!=='string'||!source.sourceToken||source.sourceToken.length>8000)throw Error(t('The native browser source changed. Read the current page again.','Yerel tarayıcı kaynağı değişti. Geçerli sayfayı yeniden oku.'));
  return {sourceToken:source.sourceToken,tabId:source.tabId,generation:source.generation,title:String(source.title||'').slice(0,300),hasMedia:source.hasMedia===true,positionSeconds:source.positionSeconds,duration:source.duration};
 }
 async function execute(name,raw,owner,{deadline=Infinity,isCancelled=()=>false,expectedSettings}={}){
  if(!current(owner))throw Error(t('The source or conversation changed.','Kaynak veya sohbet değişti.'));
  if(['seek_to_time','open_subtitle_editor','search_subtitles','get_current_subtitle'].includes(name)&&owner.subtitleKey!==snapshot().subtitleKey)throw Error(t('The subtitle track changed. Ask for a new action.','Altyazı izi değişti. Yeni bir işlem isteyin.'));
  if(isCancelled()||Date.now()>=deadline)throw Error(t('Application action expired.','Uygulama işleminin süresi doldu.'));
  if(name==='open_research_note'){const result=await window.AssistantResearchNotesUI.reveal(raw.source_id,owner);return result.ok?{status:'completed'}:{status:'failed',error:result.error};}
  if(name==='validate_research_owner')return {status:'completed'};
  if(name==='get_voice_panel')return window.AssistantVoiceRuns.panel();
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
  if(['read_feed_entry_state','set_feed_entry_state'].includes(name))return window.AssistantFeedSources.execute(name,args,owner,{expectedSettings,isCancelled:stale});
  if(name==='search_sources')return window.AssistantFeedSources.search(args.query,owner,()=>!stale());
  if(name==='open_saved_podcast_passage'){
   const locator=expectedSettings?.kind==='podcast-passage'?expectedSettings.locator:null;
   if(!locator)throw Error(t('Review this podcast passage again.','Podcast pasajını yeniden inceleyin.'));
   const conversation=window.AssistantWorkspace?.key();
   const resolve=async()=>{
    const result=await window.api.mediaShelf({...locator,locale:window.UiLocale?.get?.()});
    if(!result?.ok||result.row?.token!==locator.token)throw Error(result?.error||t('The saved passage changed.','Kayıtlı pasaj değişti.'));
    return result.row;
   };
   const row=await resolve();
   if(stale())throw Error(t('The source or conversation changed.','Kaynak veya sohbet değişti.'));
   const receipt={};
   const opened=await openPodcastResearchResult(row,{beforeSeek:resolve,receipt,isCancelled:()=>isCancelled()||Date.now()>=deadline||(window.AssistantWorkspace?.activeId(conversation)||'')!==owner.thread});
   if(!opened||!receipt.mode)throw Error(t('The passage could not be opened. Search again.','Pasaj açılamadı. Yeniden arayın.'));
   return {status:'completed',mode:receipt.mode,title:row.episodeTitle,show:row.showTitle};
  }
  if(name==='open_feed_entry'){
   const source=await window.api.feedsRequest({action:'entry',entryId:args.entry_id,revision:args.revision});
   if(stale()||!source?.ok||source.entry?.id!==args.entry_id||source.entry?.revision!==args.revision)throw Error(t('The feed entry changed. Review it again.','Akış girdisi değişti. Yeniden incele.'));
   const opened=await window.MediaHomeUI.openFeedEntry(args.entry_id);
   if(!opened||opened.id!==args.entry_id||opened.revision!==args.revision)throw Error(t('Opening this exact feed entry was not confirmed.','İlgili akış girdisinin açıldığı doğrulanamadı.'));
   return {status:'completed',entry_id:opened.id,title:String(opened.title||'').slice(0,300),note:t('The exact reader entry opened. Read, saved and film viewing states did not change.','İlgili girdi okuyucuda açıldı. Okunma, kaydetme ve film izleme durumu değişmedi.')};
  }
  if(name==='calculate_playback_time'){
   const math=window.AssistantPlaybackMath;math.options(args);
   const context=window.BrowserDubAudioUI?.context(),source=math.identity(context);
   const bound=context?.mode==='browser'?context.tabId===owner.tabId&&context.generation===owner.generation&&typeof context.mediaId==='string'&&!!context.mediaId&&!player.browserAdPlaying:context?.mediaKey===player.mediaKey&&context?.generation===player.generation;
   if(!owner.hasMedia||!source||!bound||context.mode!==player.workspaceMode)return {status:'unsupported',reason:'No current visible media source is available.'};
   const result=await window.AssistantLibraryActions.execute('get_playback_state',{},owner,{deadline,isCancelled});
   if(stale()||source.key!==math.identity(window.BrowserDubAudioUI?.context())?.key)throw Error(t('The source or conversation changed.','Kaynak veya sohbet değişti.'));
   return math.calculate(result.playback,args,source);
  }
  if(registry.get(name)?.domain==='library'||['get_app_preferences','set_app_preferences','undo_app_preferences','navigate_workspace','get_playback_state','playback_control'].includes(name))return window.AssistantLibraryActions.execute(name,args,owner,{deadline,isCancelled,expectedSettings,personalSource:()=>personalSource(owner,()=>{if(stale())throw Error(t('The source or conversation changed.','Kaynak veya sohbet değişti.'));})});
  if(registry.get(name)?.domain==='book')return window.AssistantBookActions.execute(name,args,owner,{deadline,isCancelled});
  if(registry.get(name)?.domain==='voice'&&name!=='open_voice_preparation')return window.AssistantVoiceActions.execute(name,args,owner,{deadline,isCancelled,expectedSettings});
  if(name==='open_voice_run')return window.AssistantVoiceRuns.open(args,{stale});
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
   if(owner.kind!=='video'&&!currentBrowserWhisperAudio())throw Error(t('Play the episode so its audio can be verified first.','Önce bölümü oynatıp ses kaynağını doğrulayın.'));
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
   if(stale()||result?.cancelled)throw Error(t('Whisper could not be confirmed for the source you approved.','Whisper, onayladığınız kaynak için doğrulanamadı.'));
   if(!result?.ok)throw Error(result?.message||t('Whisper was not confirmed as started. Check the Tasks panel.','Whisper başlangıcı doğrulanamadı. İşlemler panelini kontrol edin.'));
   return {status:result.reused?'completed':'accepted',jobId:result.jobId||result.job?.backendJobId,reused:!!result.reused,kind:result.job?.kind||'subtitles',note:result.reused?t('Existing subtitles were loaded.','Hazır altyazı yüklendi.'):t('The media job was accepted. Follow progress in the Tasks panel.','Medya işi kabul edildi. İlerlemeyi İşlemler panelinden izle.')};
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
   const shelf=window.MediaShelfUI?.isPodcastMode?.()?window.MediaShelfUI.readSnapshot():null;
   const opened=await window.MediaExperience.openVoice({receipt:true});
   const handoff=opened?.handoff,audio=player.workspaceAudio;
   const confirmedHandoff=shelf&&opened.from?.mediaKey===shelf.mediaKey&&opened.from?.generation===shelf.generation&&handoff&&audio?.entryId===handoff.entryId&&audio.mediaKey===handoff.mediaKey&&audio.generation===handoff.generation&&player.mediaKey===handoff.mediaKey&&player.generation===handoff.generation&&owner.thread===(window.AssistantWorkspace?.activeId()||'');
   if(isCancelled()||Date.now()>=deadline||stale()&&!confirmedHandoff)throw Error(t('The source or conversation changed.','Kaynak veya sohbet değişti.'));
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
   if(player.workspaceMode==='browser'){const result=await browserCommand('seek',source.start,owner.tabId);if(stale()||!result?.ok)throw Error(result?.error||t('Playback jump could not be confirmed on this source.','Bu kaynakta zamana gidildiği doğrulanamadı.'));}
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
