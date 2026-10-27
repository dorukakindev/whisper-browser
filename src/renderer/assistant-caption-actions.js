(() => {
 'use strict';
 const t=(en,tr)=>window.UiLocale?.get?.()==='tr'?tr:en;
 async function translate(args,owner,{deadline=Infinity,isCancelled=()=>false}={}){
  const stale=()=>isCancelled()||Date.now()>=deadline||!window.AssistantAppActions.current(owner);
  if(stale())throw Error(t('The source changed.','Kaynak değişti.'));
  if(state.running||state.queueRunning)throw Error(t('Another media job is running.','Başka bir medya işi çalışıyor.'));
  const translationConfig=args.translation_profile?await window.AssistantTranslationActions.resolve(args.translation_profile):null;
  if(stale())throw Error(t('The source changed.','Kaynak değişti.'));
  let track=player.browserTracks.find(row=>row.id===args.track_id&&row.role==='source');
  if(args.caption_id){
   const match=/^yt-(manual|auto):([a-zA-Z0-9][a-zA-Z0-9_-]{0,40})$/.exec(args.caption_id);if(!match)throw Error('Invalid caption ID.');
   const result=await window.api.downloadYoutubeSubs({url:currentBrowserYoutubeUrl(),lang:match[2],auto:match[1]==='auto',cookieBrowser:youtubeCookieBrowser(),inputDir:state.inputDir||undefined});
   if(stale())throw Error(t('The video changed. Downloaded captions were not attached.','Video değişti. İndirilen altyazı bağlanmadı.'));
   if(!result?.ok||!result.data?.path)throw Error(result?.error||t('Caption download failed.','Altyazı indirilemedi.'));
   track={id:'youtube-caption-'+browserSubtitleSync.hashText(result.data.path),path:result.data.path,role:'source',language:match[2],label:'YouTube · '+match[2]+(match[1]==='auto'?' · auto':' · manual'),captureComplete:true,generatedBy:'youtube-captions'};
   const index=player.browserTracks.findIndex(row=>row.id===track.id);if(index>=0)player.browserTracks[index]=track;else player.browserTracks.push(track);
   const tab=browserTabState();if(tab)tab.browserTracks=player.browserTracks.slice();renderBrowserTracks(track.id);
  }
  if(!track?.path)throw Error(t('Source captions are unavailable.','Kaynak altyazı bulunamadı.'));
  const range=Object.hasOwn(args,'start')?{start:args.start,end:args.end}:currentBrowserWhisperRange();
  if(range){const checked=validateBrowserWhisperRange(true,String(range.start),String(range.end),Number(player.browserDuration));if(checked.error)throw Error(checked.error);}
  const loaded=await useBrowserTrack(false,track.id,{isCancelled:stale});
  if(stale()||!loaded?.ok||player.subPath!==track.path)throw Error(t('Source captions could not be attached to this video.','Kaynak altyazı bu videoya bağlanamadı.'));
  const result=await startPlayerSubtitleTranslation({translationConfig,targetLanguage:args.target_language,sourceLanguage:browserTrackSourceLanguage(track),forSpeech:args.forSpeech,range,isCancelled:stale});
  if(!result?.ok)throw Error(result?.error||t('Translation did not start.','Çeviri başlamadı.'));
  return {status:'accepted',jobId:result.jobId,note:t('Caption translation started without re-transcribing the audio. Follow it in Jobs.','Ses yeniden yazıya dökülmeden altyazı çevirisi başladı. İşler bölümünden izleyebilirsin.')};
 }
 window.AssistantCaptionActions=Object.freeze({translate});
})();
