(() => {
 'use strict';
 const t=(en,tr)=>window.UiLocale?.get?.()==='tr'?tr:en;
 let pending=null;
 const changed=()=>{if(typeof updateAiChatActions==='function')updateAiChatActions();document.dispatchEvent(new Event('assistant-video-task-changed'));};
 const status=()=>pending&&pending.scope===aiSourceScope()?pending:null;
 const owner=task=>player.workspaceMode==='browser'&&player.browserActiveTabId===task.tabId
   &&currentBrowserYoutubeUrl()===task.url&&browserTabState(task.tabId)?.generation===task.generation
   &&task.scope===aiSourceScope()&&window.AssistantWorkspace?.activeId()===task.thread;
 const describeRange=range=>range?` · ${Math.floor(range.start/60)}:${String(range.start%60).padStart(2,'0')}–${Math.floor(range.end/60)}:${String(range.end%60).padStart(2,'0')}`:'';
 function update(task,message){
  if(pending!==task)return;
  task.job.bubble.textContent=message;
  window.AssistantWorkspace?.partial(task.job,message);
  changed();
 }
 function finish(task,message,result){
  if(pending!==task)return;
  clearInterval(task.timer);
  document.removeEventListener('assistant-video-translation-state',task.onTranslation);
  task.job.bubble.classList.remove('is-loading');
  if(result==='failed'||result==='stopped')task.job.bubble.classList.add('ai-msg-err');
  task.job.bubble.textContent=message;
  window.AssistantWorkspace?.finish(task.job,message,result);
  pending=null;changed();
 }
 function followWhisper(task,engineJob){
  task.engineJob=engineJob;
  const inspect=()=>{
   if(pending!==task)return;
   if(engineJob.cancelled){if(!engineJob.awaitingExit)finish(task,t('Whisper was stopped.','Whisper durduruldu.'),'stopped');return;}
   if(engineJob.failed){finish(task,t('Whisper failed. Check the job log for the exact error.','Whisper başarısız oldu. Ayrıntılı hata için işlem kaydını aç.'),'failed');return;}
   const result=engineJob.assistantOutcome;
   if(result){
    const counts=`${result.sourceCount} ${t('source lines','kaynak satır')}`+(task.intent.kind==='whisper-translate'?` · ${result.translationCount} ${t('translated','çevrildi')}`:'');
    if(result.translationSkipped==='same_language'&&result.loaded)
     finish(task,t('The source is already in the target language. Source subtitles are ready; no translation request was needed.','Kaynak zaten hedef dilde. Kaynak altyazı hazır; çeviri isteği gerekmedi.'),'complete');
    else if(result.translationStopped||task.intent.kind==='whisper-translate'&&!result.translationCount)
     finish(task,t('Whisper saved the source; translation was not completed.','Whisper kaynak altyazıyı kaydetti; çeviri tamamlanmadı.')+` ${counts}`,'failed');
    else if(!result.loaded)finish(task,t('Output was saved, but could not be attached to the video.','Çıktı kaydedildi ancak videoya bağlanamadı.')+` ${counts} · ${result.reason}`,'failed');
    else finish(task,t('Subtitles are ready on this video.','Altyazı bu videoda hazır.')+` ${counts}`,'complete');
    return;
   }
   if(!engineJob.running&&!engineJob.awaitingExit){
    finish(task,t('Whisper ended without a confirmed output. Check the job log.','Whisper doğrulanmış çıktı olmadan sona erdi. İşlem kaydını kontrol et.'),'failed');return;
   }
   if(player.job!==engineJob){finish(task,t('The active job changed. Check the original video job for its output.','Etkin iş değişti. Çıktı için önceki videonun işini kontrol et.'),'failed');return;}
   const percent=Number(engineJob.percent);
   const step=Number.isFinite(percent)&&percent>0?` · %${Math.min(99,Math.round(percent))}`:'';
   const stage=String(engineJob.stage||'').slice(0,100);
   const message=t('Whisper is running','Whisper çalışıyor')+describeRange(task.range)+step+(stage?` · ${stage}`:'');
   if(message!==task.job.bubble.textContent)update(task,message);
  };
  task.timer=setInterval(inspect,650);inspect();
 }
 function followTranslation(task,trackId){
  task.trackId=trackId;
  task.onTranslation=event=>{
   const {tabId,generation,trackId:reported,progress}=event.detail||{};
   if(pending!==task||tabId!==task.tabId||generation!==task.generation||reported!==trackId||!progress)return;
   const total=Number(progress.total)||0,done=Number(progress.completed)||0,failed=Number(progress.failed)||0;
   if(task.cancelled)return;
   if(total&&done+failed>=total&&!Number(progress.pending)&&!Number(progress.queued)&&!Number(progress.retrying)){
    if(failed)finish(task,`${done}/${total} ${t('sentences translated;','cümle çevrildi;')} ${failed} ${t('failed. Review the translation report.','hata var. Çeviri raporunu incele.')}`,'failed');
    else finish(task,`${total}/${total} ${t('sentences translated.','cümle çevrildi.')}`+(progress.sourceComplete===false?t(' Only captured captions were available.',' Yalnız yakalanan altyazılar kullanıldı.') : ''),'complete');
   }else update(task,`${done}/${total||'?'} ${t('sentences translated','cümle çevrildi')}${failed?` · ${failed} ${t('failed','hata')}`:''}`);
  };
  document.addEventListener('assistant-video-translation-state',task.onTranslation);
  update(task,t('Translation was queued. Progress will appear here.','Çeviri kuyruğa alındı. İlerleme burada gösterilecek.'));
  task.timer=setInterval(()=>{
   const tab=browserTabState(task.tabId);
   if(!tab||tab.generation!==task.generation)finish(task,t('The source changed; the previous translation result cannot be confirmed here.','Kaynak değişti; önceki çevirinin sonucu burada doğrulanamıyor.'),'failed');
  },650);
  if(window.api.getBrowserTranslationSnapshot)void window.api.getBrowserTranslationSnapshot(task.tabId).then(result=>{
   if(result?.ok)task.onTranslation({detail:{tabId:task.tabId,generation:result.generation,trackId:result.trackId,progress:result.state}});
  }).catch(()=>{});
 }
 async function handle(question){
  const intent=window.AssistantVideoIntent?.match(question);
  if(!intent)return false;
  if(/deepseek|shuai|deepinfra|\bsol\b|gpt|gemini|claude|sağlayıcı|provider/i.test(question))return false;
  if(intent.kind==='translate-track'){
   const target=effectiveBrowserProfile().values.targetLanguage||'tr';
   if(intent.range||intent.forSpeech||intent.targetLanguage&&intent.targetLanguage!==target||!player.browserTracks.some(row=>row.role==='source'&&row.path))return false;
  }
  if(pending)return true;
  const tab=browserTabState(),url=typeof globalAssistantContext==='function'&&globalAssistantContext()?'':currentBrowserYoutubeUrl();
  const task={intent,scope:aiSourceScope(),tabId:tab?.id||'',generation:tab?.generation,url,thread:window.AssistantWorkspace?.activeId(),cancelled:false};
  aiChatAdd('user',question);
  task.job={chatQuestion:question,chatContext:{},bubble:aiChatAdd('ai',t('Checking the video and source…','Video ve kaynak kontrol ediliyor…'),'is-loading')};
  window.AssistantWorkspace?.begin(task.job);
  pending=task;changed();
  const input=document.getElementById('aiChatText');if(input)input.value='';
  try{
   if(!url||!task.tabId)throw Error(t('Open a YouTube video in the browser first.','Önce browser içinde bir YouTube videosu aç.'));
   if(intent.rangeInvalid||intent.rangeUnresolved)throw Error(t('Specify a valid interval, for example 05:00–10:00. The whole video was not started.','Geçerli bir aralık belirt; örneğin 05:00–10:00. Videonun tamamı başlatılmadı.'));
   const configuredTarget=intent.kind==='translate-track'?effectiveBrowserProfile().values.targetLanguage||'tr':document.getElementById('translateTo')?.value||'tr';
   if(intent.kind==='translate-track'&&intent.targetLanguage&&intent.targetLanguage!==configuredTarget)
    throw Error(t('The saved target language is ','Kayıtlı hedef dil ')+configuredTarget+t('. Change the translation target in settings, then retry.','. Çeviri ayarlarından hedef dili değiştirip yeniden dene.'));
   if(intent.kind==='translate-track'){
    if(intent.forSpeech)throw Error(t('Use the subtitle translation controls for speech-ready translation of an existing track.','Mevcut altyazının seslendirmeye uygun çevirisi için altyazı çeviri kontrollerini kullan.'));
    if(intent.range)throw Error(t('A time range for an existing track is not available here. Use Whisper with a selected range.','Mevcut altyazıda zaman aralığı çevirisi burada yok. Seçili aralık için Whisper kullan.'));
    const selected=browserTrackSelection(false);
    const track=selected?.role==='translation'?player.browserTracks.find(row=>row.role==='source'):selected;
    if(!track||track.role==='translation'||!track.path)throw Error(t('No source captions are available on this video. Ask for Whisper + translation if you want transcription first.','Bu videoda kaynak altyazı yok. Önce sesin yazılması gerekiyorsa Whisper + çeviri iste.'));
    if(!owner(task))throw Error(t('The video changed before translation could start.','Çeviri başlamadan video değişti.'));
    const result=await useBrowserTrack(true,track.id,{isCancelled:()=>task.cancelled||!owner(task)});
    if(task.cancelled){
     if(owner(task)&&player.browserTranslationTrackId===track.id){task.cancelled=false;task.trackId=track.id;await cancel();}
     else finish(task,t('The request was stopped before translation started.','Çeviri başlamadan istek durduruldu.'),'stopped');
     return true;
    }
    if(!owner(task))throw Error(t('The video changed during preparation; its job was not attached here.','Hazırlık sırasında video değişti; iş bu sekmeye bağlanmadı.'));
    if(!result?.ok||player.browserTranslationTrackId!==track.id)throw Error(result?.error||t('Translation did not start.','Çeviri başlamadı.'));
    followTranslation(task,track.id);
   }else{
    let range=currentBrowserWhisperRange();
    if(intent.range){
     const checked=validateBrowserWhisperRange(true,String(Math.floor(intent.range.start/60))+':'+String(intent.range.start%60).padStart(2,'0'),String(Math.floor(intent.range.end/60))+':'+String(intent.range.end%60).padStart(2,'0'),Number(player.browserDuration));
     if(checked.error)throw Error(checked.error);
     range=checked.range;
     player.browserWhisperRange={url,range};
    }
    if(!owner(task))throw Error(t('The video changed before Whisper could start.','Whisper başlamadan video değişti.'));
    task.range=range;
    const receipt=await startBrowserYoutubeWhisper(intent.kind==='whisper-translate',{forSpeech:intent.forSpeech||undefined,targetLanguage:intent.targetLanguage||undefined,isCancelled:()=>task.cancelled||!owner(task)});
    const engineJob=receipt?.job;
    if(task.cancelled){
     if(owner(task)&&engineJob?.browserTabId===task.tabId){task.engineJob=engineJob;followWhisper(task,engineJob);task.cancelled=false;await cancel();}
     else finish(task,t('The request was stopped before Whisper started.','Whisper başlamadan istek durduruldu.'),'stopped');
     return true;
    }
    if(receipt?.ok&&engineJob?.browserTabId===task.tabId){followWhisper(task,engineJob);}
    else if(receipt?.ok&&receipt.reused&&owner(task)&&(player.subPath===receipt.path||player.sub2Path===receipt.path)){
     finish(task,t('A matching Whisper result was loaded from this video.','Bu video için hazır Whisper çıktısı yüklendi.'),'complete');
    }else throw Error(t('Whisper was not confirmed as started. Check the video job panel.','Whisper’ın başladığı doğrulanamadı. Video işlem panelini kontrol et.'));
   }
  }catch(error){finish(task,String(error?.message||t('Video action failed.','Video işlemi başarısız oldu.')),'failed');}
  return true;
 }
 async function cancel(){
  const task=status();if(!task||task.cancelled)return;
  task.cancelled=true;
  update(task,t('Stopping the video job…','Video işi durduruluyor…'));
  if(task.engineJob){
   if(player.job!==task.engineJob){finish(task,t('The original job is no longer active.','Önceki iş artık etkin değil.'),'stopped');return;}
   document.getElementById('playerJobCancel')?.click();
  }else if(task.trackId){
   const result=await window.api.stopBrowserTranslation(task.tabId).catch(error=>({ok:false,error:error.message}));
   if(result?.ok){
    if(owner(task)&&player.browserTranslationTrackId===task.trackId){
     player.browserTranslationTrackId='';
     const tab=browserTabState(task.tabId);if(tab){tab.browserTranslationTrackId='';tab.browserTranslationComplete=false;}
     if(typeof renderBrowserSubtitleHealth==='function')renderBrowserSubtitleHealth();
    }
    finish(task,t('Translation was stopped. Finished captions were kept.','Çeviri durduruldu. Hazır altyazılar korundu.'),'stopped');
   }
   else{task.cancelled=false;update(task,result?.error||t('Stopping could not be confirmed.','Durdurma doğrulanamadı.'));}
  }
 }
 window.AssistantVideoCommands=Object.freeze({handle,status,busy:()=>!!pending,cancel});
})();
