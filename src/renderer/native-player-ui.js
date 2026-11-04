(() => {
 'use strict';const video=document.getElementById('playerVideo');if(!video||!window.api.nativePlayer)return;
 let active=false,starting=false,key='',generation=0,sample={},source='',pulse=null,originals=new Map(),ended=false,startEpoch=0;
 const originalPlay=video.play.bind(video),originalPause=video.pause.bind(video);
 const event=name=>video.dispatchEvent(new Event(name));
 function command(name,value){if(!active)return Promise.resolve({ok:false});return window.api.nativePlayer({action:'command',key,generation,command:name,value});}
 function descriptor(name,get,set){originals.set(name,Object.getOwnPropertyDescriptor(video,name));Object.defineProperty(video,name,{configurable:true,get,set});}
 function install(){
  for(const [name,field,defaultValue]of [['currentTime','time',0],['duration','duration',NaN],['playbackRate','speed',1],['volume','volume',1],['muted','muted',false],['paused','paused',true]])descriptor(name,()=>sample[field]??defaultValue,['currentTime','playbackRate','volume','muted'].includes(name)?value=>{sample[field]=value;void command({currentTime:'seek',playbackRate:'speed',volume:'volume',muted:'mute'}[name],value);if(name==='currentTime'){ended=false;event('seeking');event('timeupdate');event('seeked');}else event(name==='playbackRate'?'ratechange':'volumechange');}:undefined);
  descriptor('readyState',()=>sample.duration>0?4:1);descriptor('ended',()=>ended);descriptor('currentSrc',()=>source);
  originals.set('play',Object.getOwnPropertyDescriptor(video,'play'));originals.set('pause',Object.getOwnPropertyDescriptor(video,'pause'));
  video.play=async()=>{sample.paused=false;const result=await command('play');if(!result?.ok)throw Error(result?.error||'Playback failed.');event('play');event('playing');};
  video.pause=()=>{sample.paused=true;void command('pause');event('pause');};
 }
 function restore(){for(const [name,old]of originals)if(old)Object.defineProperty(video,name,old);else delete video[name];originals.clear();}
 function bounds(){const r=video.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height};}
 let layoutKey='',assistantOpen=false,freeze=null,freezing=false,freezeAttempted=false;
 function layout(){if(!active)return;const hidden=player.workspaceMode!=='player'||assistantOpen||!!document.querySelector('dialog[open], .player-controls details[open], #playerWorkspaceV3 details[open]')||document.getElementById('playerLayer').classList.contains('hidden')||!!(typeof _activeModal!=='undefined'&&_activeModal);const box=bounds(),next=JSON.stringify([box,hidden]);if(next===layoutKey)return;
  if(hidden&&!freeze&&!freezing&&!freezeAttempted){freezing=true;freezeAttempted=true;const expected=key,expectedGen=generation;void window.api.nativePlayer({action:'snapshot',key,generation}).then(r=>{if(!active||expected!==key||expectedGen!==generation)return;if(r?.ok&&/^data:image\/png;base64,/.test(r.image)){freeze=document.createElement('img');freeze.alt='';freeze.src=r.image;freeze.style.cssText='position:absolute;inset:0;width:100%;height:100%;object-fit:contain;background:#000;pointer-events:none;z-index:1';video.parentElement.append(freeze);}}).finally(()=>{freezing=false;if(expected===key&&expectedGen===generation){layoutKey='';layout();}});return;}
  if(!hidden){freeze?.remove();freeze=null;freezeAttempted=false;}layoutKey=next;void window.api.nativePlayer({action:'layout',key,generation,bounds:box,hidden});
 }
 async function start(){
  if(active||starting)return;starting=true;const epoch=++startEpoch,now=video.currentTime,wasPaused=video.paused,saved=window.BrowserDubAudioUI?.snapshot(),desired={speed:video.playbackRate,volume:video.volume,muted:video.muted};
  try{
   if(player.hls)throw Error(window.UiLocale?.get?.()==='tr'?'HLS için mevcut oynatıcı kullanılıyor; native geçiş yerel dosya ve torrent akışında kullanılabilir.':'Keep HLS in the existing player; native switching supports local files and torrent streams.');
   await window.BrowserDubAudioUI?.stop();if(epoch!==startEpoch)return;originalPause();key=player.mediaKey;generation=player.generation;source=video.currentSrc||video.src;sample={time:now,duration:video.duration,paused:true,speed:video.playbackRate,volume:video.volume,muted:video.muted};
   const result=await window.api.nativePlayer({action:'start',key,generation,path:player.localPath,source,time:now,bounds:bounds()});
   if(epoch!==startEpoch)return;if(!result?.ok)throw Error(result?.error||'Native player failed.');if(key!==player.mediaKey||generation!==player.generation){await window.api.nativePlayer({action:'stop'});return;}
   active=true;ended=false;sample={time:now,duration:video.duration,paused:true,speed:video.playbackRate,volume:video.volume,muted:video.muted,...sample};install();document.getElementById('playerStage').classList.add('native-player-active');
   event('loadedmetadata');event('canplay');await command('speed',desired.speed);await command('volume',desired.volume);await command('mute',desired.muted);
   pulse=setInterval(()=>{layout();const text=[document.getElementById('subtitleOverlay')?.innerText,document.getElementById('subtitleOverlay2')?.innerText].filter(Boolean).join('\n');void command('text',text);},300);
   if(saved)await window.BrowserDubAudioUI?.restore(saved,key);
   if(!wasPaused)await video.play();layout();return true;
  }catch(error){if(epoch===startEpoch){osd(error.message);if(active)await stop();else if(key===player.mediaKey&&generation===player.generation){if(saved)await window.BrowserDubAudioUI?.restore(saved,key);if(!wasPaused)void originalPlay().catch(()=>{});}}return false;}finally{if(epoch===startEpoch)starting=false;}
 }
 async function stop(){if(!active&&!starting)return;startEpoch++;starting=false;const saved={...sample},time=Number(saved.time)||0,expectedKey=key,expectedGeneration=generation;active=false;layoutKey='';freeze?.remove();freeze=null;document.getElementById('playerStage').classList.remove('native-player-active');clearInterval(pulse);pulse=null;restore();await window.api.nativePlayer({action:'stop'}).catch(()=>null);if(player.mediaKey===expectedKey&&player.generation===expectedGeneration){try{video.currentTime=time;video.playbackRate=Number(saved.speed)||1;video.volume=Math.max(0,Math.min(1,Number(saved.volume)||0));video.muted=!!saved.muted;}catch{}event('timeupdate');if(saved.paused===false)void originalPlay().catch(()=>{});}}
 window.api.onNativePlayer(row=>{if(row.key!==key||row.generation!==generation)return;
  if(row.type==='error'){osd(row.error);void stop();return;}const previous={...sample};sample={...sample,...row};
  if(row.type==='input'){if(row.input==='whisper-toggle')video.paused?void video.play():video.pause();else if(row.input==='whisper-fullscreen')document.getElementById('fullscreenBtn')?.click();return;}
  if(row.type==='ended'){ended=true;event('ended');return;}if(active){event('timeupdate');if(previous.duration!==sample.duration)event('durationchange');if(previous.paused!==sample.paused)event(sample.paused?'pause':'playing');if(previous.buffering!==sample.buffering)event(sample.buffering?'waiting':'canplay');}
 });
 window.addEventListener('resize',layout);new MutationObserver(layout).observe(document.body,{subtree:true,attributes:true,attributeFilter:['class','open']});
 window.api.onAssistantVisibility?.(row=>{assistantOpen=!!row.expanded;layout();});
 window.NativePlayerUI=Object.freeze({start,stop,active:()=>active,busy:()=>active||starting,state:()=>({...sample}),command,layout});
 void originalPlay;
})();
