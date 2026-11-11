(() => {
 'use strict';const video=document.getElementById('playerVideo');if(!video||!window.api.nativePlayer)return;
 let lastFailure=null;
 let active=false,starting=false,key='',generation=0,sample={},source='',pulse=null,originals=new Map(),ended=false,startEpoch=0;
 const originalPlay=video.play.bind(video),originalPause=video.pause.bind(video);
 const event=name=>video.dispatchEvent(new Event(name));
 const playbackError=message=>message==='Native media could not play.'&&window.UiLocale?.get?.()==='tr'
  ?'Medya oynatılamadı.':message;
 function command(name,value){if(!active)return Promise.resolve({ok:false});return window.api.nativePlayer({action:'command',key,generation,command:name,value});}
 function subtitleProjection(){
  const mode=currentSubtitleMode(),primaryRole=player.subRole==='translation'?'translation':'source',secondaryRole=player.sub2Role==='source'?'source':'translation';
  const visible=role=>mode!=='off'&&(mode==='both'||mode===role);
  const content=(id,role)=>visible(role)?String(document.getElementById(id)?.innerText||document.getElementById(id)?.textContent||''):'';
  const style=player.subStyle||{};
  return{primary:content('subtitleOverlay',primaryRole),secondary:content('subtitleOverlay2',secondaryRole),primaryRole,secondaryRole,
   fontSize:Number.isFinite(Number(style.size))?Number(style.size):28,font:['system','serif','mono','rounded'].includes(style.font)?style.font:'system',weight:Number.isFinite(Number(style.weight))?Number(style.weight):600,outline:Number.isFinite(Number(style.outline))?Number(style.outline):70};
 }
 let projectedText='';
 function syncSubtitles(force=false){if(!active||key!==player.mediaKey||generation!==player.generation)return;const value=subtitleProjection(),stamp=JSON.stringify(value);if(!force&&stamp===projectedText)return;projectedText=stamp;void command('text',value);}
 function descriptor(name,get,set){originals.set(name,Object.getOwnPropertyDescriptor(video,name));Object.defineProperty(video,name,{configurable:true,get,set});}
 function install(){
  for(const [name,field,defaultValue]of [['currentTime','time',0],['duration','duration',NaN],['playbackRate','speed',1],['volume','volume',1],['muted','muted',false],['paused','paused',true]])descriptor(name,()=>sample[field]??defaultValue,['currentTime','playbackRate','volume','muted'].includes(name)?value=>{sample[field]=value;void command({currentTime:'seek',playbackRate:'speed',volume:'volume',muted:'mute'}[name],value);if(name==='currentTime'){ended=false;event('seeking');event('timeupdate');event('seeked');}else event(name==='playbackRate'?'ratechange':'volumechange');}:undefined);
  descriptor('readyState',()=>sample.duration>0?4:1);descriptor('ended',()=>ended);descriptor('currentSrc',()=>source);
  originals.set('play',Object.getOwnPropertyDescriptor(video,'play'));originals.set('pause',Object.getOwnPropertyDescriptor(video,'pause'));
  video.play=async()=>{sample.paused=false;const result=await command('play');if(!result?.ok)throw Error(result?.error||'Playback failed.');event('play');event('playing');};
  video.pause=()=>{sample.paused=true;void command('pause');event('pause');};
 }
 function restore(){for(const [name,old]of originals)if(old)Object.defineProperty(video,name,old);else delete video[name];originals.clear();}
 function bounds(){
  const r=video.getBoundingClientRect(),box={x:r.x,y:r.y,width:r.width,height:r.height};
  const tools=document.querySelector('#playerStage > .sx-native-tools');
  if(tools&&active){const d=tools.getBoundingClientRect();if(d.width>0&&d.height>0){
   if(d.width<r.width*.75)box.width=Math.max(1,Math.min(r.width,d.left-r.left-12));
   else box.height=Math.max(1,Math.min(r.height,d.top-r.top-12));
  }}
  return box;
 }
 let layoutKey='',assistantOpen=false,freeze=null,freezing=false,freezeAttempted=false;
 function fitWorkspace(){
  const workspace=document.getElementById('playerWorkspaceV3'),theater=workspace?.querySelector('.pw-theater'),slot=theater?.querySelector('.pw-stage'),transport=theater?.querySelector('.pw-transport');
  if(!workspace||workspace.hidden||!theater||!slot?.contains(video)||!transport)return;
  const top=theater.getBoundingClientRect().top+workspace.scrollTop,availableWidth=theater.clientWidth;
  if(!(availableWidth>0))return;
  // The native child window owns the image plane. Its transport occupies real
  // layout space below it; reserve that measured height before fitting 16:9.
  // A second pass accounts for a transport row wrapping at the fitted width.
  for(let pass=0;pass<2;pass++){
   const height=Math.max(120,window.innerHeight-top-transport.getBoundingClientRect().height-24);
   const width=Math.floor(Math.min(availableWidth,height*16/9));
   if(Math.abs(parseFloat(theater.style.getPropertyValue('--pw-native-stage-width'))-width)<1)break;
   theater.style.setProperty('--pw-native-stage-width',width+'px');
  }
 }
 function layout(){if(!active)return;fitWorkspace();const hidden=document.getElementById('playerLayer').classList.contains('source-catalog-open')||player.workspaceMode!=='player'||assistantOpen||!!document.querySelector('dialog[open], .player-controls details[open], #playerWorkspaceV3 details[open]:not(.sx-work-tracks), [data-pw-occludes-native="true"], .mk-popup:popover-open')||document.getElementById('playerLayer').classList.contains('hidden')||!!(typeof _activeModal!=='undefined'&&_activeModal);const box=bounds(),next=JSON.stringify([box,hidden]);if(next===layoutKey)return;
  if(hidden&&!freeze&&!freezing&&!freezeAttempted){freezing=true;freezeAttempted=true;const expected=key,expectedGen=generation;void window.api.nativePlayer({action:'snapshot',key,generation}).then(r=>{if(!active||expected!==key||expectedGen!==generation)return;if(r?.ok&&/^data:image\/png;base64,/.test(r.image)){freeze=document.createElement('img');freeze.alt='';freeze.src=r.image;freeze.style.cssText='position:absolute;inset:0;width:100%;height:100%;object-fit:contain;background:#000;pointer-events:none;z-index:1';video.parentElement.append(freeze);}}).finally(()=>{freezing=false;if(expected===key&&expectedGen===generation){layoutKey='';layout();}});return;}
  if(!hidden){freeze?.remove();freeze=null;freezeAttempted=false;}layoutKey=next;void window.api.nativePlayer({action:'layout',key,generation,bounds:box,hidden});
 }
 async function start(){
  if(active||starting)return;
  const requestedSource=video.src||video.currentSrc;
  const sameElementSource=video.currentSrc===requestedSource;
  const requestedKey=player.mediaKey,requestedGeneration=player.generation;
  lastFailure=null;
  const pending=player.pendingLibrarySeek;
  const now=pending?.key===requestedKey&&pending.generation===requestedGeneration
   ?Number(pending.seconds)||0:sameElementSource?video.currentTime:0;
  starting=true;const epoch=++startEpoch,wasPaused=video.paused,saved=window.BrowserDubAudioUI?.snapshot(),desired={speed:video.playbackRate,volume:video.volume,muted:video.muted};
  try{
   if(player.hls)throw Error(window.UiLocale?.get?.()==='tr'?'HLS için mevcut oynatıcı kullanılıyor; native geçiş yerel dosya ve torrent akışında kullanılabilir.':'Keep HLS in the existing player; native switching supports local files and torrent streams.');
   await window.BrowserDubAudioUI?.stop();if(epoch!==startEpoch||requestedKey!==player.mediaKey||requestedGeneration!==player.generation)return;
   originalPause();key=requestedKey;generation=requestedGeneration;source=requestedSource;sample={time:now,duration:sameElementSource?video.duration:0,paused:true,speed:video.playbackRate,volume:video.volume,muted:video.muted};
   const result=await window.api.nativePlayer({action:'start',key,generation,path:player.localPath,source,time:now,bounds:bounds()});
   if(epoch!==startEpoch)return;if(!result?.ok)throw Error(playbackError(result?.error)||'Native player failed.');if(key!==player.mediaKey||generation!==player.generation){await window.api.nativePlayer({action:'stop'});return;}
   active=true;ended=false;sample={time:now,duration:video.duration,paused:true,speed:video.playbackRate,volume:video.volume,muted:video.muted,...sample};install();document.getElementById('playerStage').classList.add('native-player-active');
   document.dispatchEvent(new window.CustomEvent('native-player-state-changed',{detail:{key,generation,active:true}}));
   if(activePlaybackRecovery()?.owner==='html')clearPlayerPlaybackRecovery();
   event('loadedmetadata');event('canplay');await command('speed',desired.speed);await command('volume',desired.volume);await command('mute',desired.muted);
   projectedText='';syncSubtitles(true);pulse=setInterval(()=>{layout();syncSubtitles(true);},300);
   if(saved)await window.BrowserDubAudioUI?.restore(saved,key);
   if(!wasPaused)await video.play();layout();return true;
  }catch(error){
   if(epoch!==startEpoch)return false;
   lastFailure={key:requestedKey,generation:requestedGeneration,message:String(error.message||'Native media could not play.').slice(0,400)};
   osd(error.message);
   if(active)await stop();
   else if(requestedKey===player.mediaKey&&requestedGeneration===player.generation){
    if(saved)await window.BrowserDubAudioUI?.restore(saved,requestedKey);
    if(epoch===startEpoch&&requestedKey===player.mediaKey&&requestedGeneration===player.generation){
     if(video.error&&/^https?:\/\//i.test(requestedSource)&&activePlaybackRecovery()?.owner!=='native'){
      void showLocalPlaybackRecovery(video,{position:now,nativeFailure:true});
     }else if(video.error&&!activePlaybackRecovery())void showLocalPlaybackRecovery(video,{code:video.error.code});
     if(!wasPaused)void originalPlay().catch(()=>{});
    }
   }
   return false;
  }finally{if(epoch===startEpoch)starting=false;}
 }
 async function stop({resume=true}={}){if(!active&&!starting)return;startEpoch++;starting=false;const saved={...sample},time=Number(saved.time)||0,expectedKey=key,expectedGeneration=generation;active=false;layoutKey='';freeze?.remove();freeze=null;document.getElementById('playerStage').classList.remove('native-player-active');clearInterval(pulse);pulse=null;restore();await window.api.nativePlayer({action:'stop'}).catch(()=>null);if(player.mediaKey===expectedKey&&player.generation===expectedGeneration){try{video.currentTime=time;video.playbackRate=Number(saved.speed)||1;video.volume=Math.max(0,Math.min(1,Number(saved.volume)||0));video.muted=!!saved.muted;}catch{}document.dispatchEvent(new window.CustomEvent('native-player-state-changed',{detail:{key:expectedKey,generation:expectedGeneration,active:false}}));event('timeupdate');if(resume&&saved.paused===false)void originalPlay().catch(()=>{});}}
 window.api.onNativePlayer(row=>{if(row.key!==key||row.generation!==generation)return;
  if(row.type==='error'){
   lastFailure={key:row.key,generation:row.generation,message:String(playbackError(row.error)||'Native media could not play.').slice(0,400)};
   window.MediaShelfUI?.podcastQueueError?.({mediaKey:row.key,generation:row.generation});osd(playbackError(row.error));
   const position=Number(row.time)||Number(sample.time)||0,intent=player.openIntent;
   void stop({resume:false}).then(()=>{
    if(player.mediaKey===row.key&&player.generation===row.generation&&player.openIntent===intent)
     return showLocalPlaybackRecovery(video,{position,nativeFailure:true});
   });
   return;
  }const previous={...sample};sample={...sample,...row};
  if(row.type==='input'){if(row.input==='whisper-toggle')video.paused?void video.play():video.pause();else if(row.input==='whisper-fullscreen')document.getElementById('fullscreenBtn')?.click();return;}
  if(row.type==='ended'){ended=true;event('ended');return;}if(active){event('timeupdate');if(previous.duration!==sample.duration)event('durationchange');if(previous.paused!==sample.paused)event(sample.paused?'pause':'playing');if(previous.buffering!==sample.buffering)event(sample.buffering?'waiting':'canplay');}
 });
 const subtitleObserver=new MutationObserver(()=>syncSubtitles());for(const id of ['subtitleOverlay','subtitleOverlay2']){const overlay=document.getElementById(id);if(overlay)subtitleObserver.observe(overlay,{subtree:true,childList:true,characterData:true,attributes:true,attributeFilter:['class','style','hidden']});}
 window.addEventListener('resize',layout);document.addEventListener('toggle',layout,true);new MutationObserver(layout).observe(document.body,{subtree:true,attributes:true,attributeFilter:['class','open','data-pw-occludes-native']});
 window.api.onAssistantVisibility?.(row=>{assistantOpen=!!row.expanded;layout();});
 window.NativePlayerUI=Object.freeze({start,stop,failure:()=>lastFailure&&lastFailure.key===player.mediaKey&&lastFailure.generation===player.generation?{...lastFailure}:null,active:()=>active,busy:()=>active||starting,state:()=>({...sample}),command,layout,syncSubtitles});
 void originalPlay;
})();
