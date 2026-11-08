/* Podcast presentation and context over the existing embedded video. Never owns media. */
(() => {
  'use strict';
  const layer = document.getElementById('playerLayer');
  if (!layer || !window.BrowserStudy) return;
  const sessions = new Map(), listeners = new Set();
  const copy = (tr,en) => window.UiLocale?.get?.() === 'en' ? en : tr;
  const write = (node,value) => { if (node && node.textContent !== value) node.textContent = value; };
  const key = () => player.workspaceMode === 'browser' ? player.browserActiveTabId : null;
  const media = () => browserTabState()?.mediaId || player.mediaKey;
  const currentSession = () => {
    const session = sessions.get(key());
    return session?.media === media() ? session : null;
  };
  const isActive = () => !!key() && !!currentSession() && window.BrowserStudy.isActive() && !layer.classList.contains('hidden');
  let bridge, ui, toolsOpen = false;
  function getTranscriptTracks() {
    if (!isActive()) return [];
    const roles = browserSubtitleRoleCues();
    return ['source','translation'].map(role => {
      const cues = roles[role] || [], secondary = cues === player.cues2;
      const loaded = (player.browserTracks || []).find(track => track.id === (secondary ? player.browserLoadedTrackId2 : player.browserLoadedTrackId));
      const transform = subtitleVideoTransform(secondary);
      const mapped = cues.map((cue,index) => ({ ...cue, id:String(cue.id ?? index), start:subtitleVideoTime(cue.start,secondary,transform), end:subtitleVideoTime(cue.end,secondary,transform) }));
      const content = JSON.stringify(mapped.map(cue => [cue.id,cue.start,cue.end,cue.text]));
      // Bind evidence to the actual mapped times and text, including independent drift/offset edits.
      const revision = browserSubtitleSync.hashText(content);
      return { id:`browser:${key()}:${loaded?.id || (secondary?'secondary':'primary')}:${role}`, revision, role, timed:true, offsetSeconds:0, cues:mapped };
    });
  }
  function snapshot() {
    if (!isActive()) return null;
    const [source,translation] = getTranscriptTracks();
    const duration = Number(player.browserDuration) > 0 ? Number(player.browserDuration) : null;
    const cap = (support,reason) => ({ support,reason });
    const observed = !!player.browserMediaSeen, youtube = !!currentBrowserYoutubeUrl();
    const spotify = /^https?:\/\/(?:open\.)?spotify\.com(?:[/:]|$)/i.test(player.browserPageUrl||'');
    return { mediaKey:player.mediaKey, generation:player.generation, episodeIdentity:player.mediaKey,
      sourceVersion:`observed:${key()}:${player.mediaKey}:${player.generation}`, sourceVersionStatus:'unknown', sourceKind:'browser', playbackOwner:'browser',
      sourceBinding:{fingerprintStatus:'unknown',sha256:'unknown',etag:'unknown',length:'unknown'},
      title:player.browserPageTitle || document.getElementById('playerTitle')?.textContent || '',
      time:Number(player.browserTime)||0, currentTime:Number(player.browserTime)||0, duration, paused:!!player.browserPaused, rate:Number(player.browserRate)||1,
      sourceTrack:{id:source.id,revision:source.revision}, secondaryTrack:translation.cues.length?{id:translation.id,revision:translation.revision}:null,
      capabilities:{play:cap(observed?'yes':'unknown','existing-web-player'),pause:cap(observed?'yes':'unknown','existing-web-player'),
        seek:cap(observed&&duration&&!player.isLive?'yes':'no','existing-web-seek-range'),rate:cap(observed?'yes':'unknown','existing-web-rate'),
        readTranscript:cap(source.cues.length?'yes':'no','existing-source-captions'),asr:cap(spotify?'no':youtube?'yes':'unknown',spotify?'no-authorized-audio-source':youtube?'existing-youtube-queue':'audio-access-unverified'),ASR:cap(spotify?'no':youtube?'yes':'unknown',spotify?'no-authorized-audio-source':youtube?'existing-youtube-queue':'audio-access-unverified'),
        liveAsr:cap(observed?'unknown':'no','system-audio-requires-explicit-consent'),download:cap(spotify?'no':'unknown',spotify?'no-authorized-download-source':'download-not-verified')} };
  }
  function sourceRole() { const source=getTranscriptTracks()[0]; return source?{trackId:source.id,trackRevision:source.revision,cues:source.cues,offsetSeconds:0}:null; }
  async function executeExisting(command) {
    const snap=snapshot(), tab=key();
    if (!snap) return {ok:false,code:'stale-source'};
    if (command.type==='seekCue' || command.type==='previousCue' || command.type==='nextCue' || command.type==='replay') {
      const cues=sourceRole().cues;
      const timeline=cues.filter(cue=>Number.isFinite(cue.start)&&Number.isFinite(cue.end)&&cue.end>cue.start&&cue.end>0&&cue.start<snap.duration).sort((a,b)=>a.start-b.start);
      // Compare video-clock positions, including independent subtitle drift/offset.
      // A gap has no active cue: it must not reset next/replay to the first line.
      let current=-1;
      timeline.forEach((cue,index)=>{if(snap.time>=cue.start&&snap.time<cue.end)current=index;});
      let cue=timeline[current];
      if(command.type==='seekCue')cue=timeline.find(row=>row.id===command.cueId);
      else if(command.type==='previousCue')cue=timeline.filter(row=>row.start<(cue?.start??snap.time)).at(-1)||timeline[0];
      else if(command.type==='nextCue')cue=timeline.find(row=>row.start>(cue?.start??snap.time));
      if(!cue)return {ok:false,code:'unknown-cue'};
      const landing=Math.max(0,cue.start+Math.min(.01,(cue.end-cue.start)/2,(snap.duration-cue.start)/2));
      const result=await browserCommand('seek',landing,tab);
      if (command.type==='replay' && result?.ok && snap.paused && player.browserPaused && key()===tab && player.mediaKey===snap.mediaKey && player.generation===snap.generation) return browserCommand('play',undefined,tab);
      return result;
    }
    const action={play:'play',pause:'pause',togglePlay:snap.paused?'play':'pause',seek:'seek',setRate:'speed',setVolume:'volume-set'}[command.type];
    if (!action) return {ok:false,code:'unsupported'};
    return browserCommand(action,command.time??command.rate??command.volume,tab);
  }
  function execute(command) {
    if (!bridge) bridge=window.PlayerWorkspaceModel.createPlayerWorkspaceBridge({readSnapshot:snapshot,resolveSourceRole:sourceRole,executeExisting});
    return bridge.dispatch(command);
  }
  function send(type,args={},trackBound=false) {
    const snap=snapshot(); if(!snap)return;
    return execute({type,mediaKey:snap.mediaKey,generation:snap.generation,...(trackBound?{trackId:snap.sourceTrack.id,trackRevision:snap.sourceTrack.revision}:{}),...args});
  }
  function setMode(value) {
    if (!key()) return;
    closeBrowserToolbarMenus();
    if (value) {
      if (!window.BrowserStudy.isActive()) window.BrowserStudy.open({ preservePodcast:true });
      sessions.set(key(),{media:media()});
    }
    else sessions.delete(key());
    toolsOpen=false; refresh();
    if (typeof scheduleBrowserOverlaySync === 'function') scheduleBrowserOverlaySync();
  }
  const menu=document.createElement('button');menu.type='button';menu.id='browserPodcastMode';menu.setAttribute('role','menuitem');
  menu.onclick=()=>setMode(!isActive());
  document.querySelector('#appModeMenu [role=menu]')?.append(menu);
  function refresh() {
    const on=isActive();
    if(layer.classList.contains('browser-podcast-presentation')!==on)layer.classList.toggle('browser-podcast-presentation',on);
    write(menu,copy(on?'Podcast görünümünden çık':'Podcast görünümü',on?'Exit podcast view':'Podcast view'));
    const box=document.querySelector('#playerSide .browser-study'); if(!box)return;
    if(!ui){
      ui=document.createElement('section');ui.className='browser-podcast-controls';ui.dataset.uiUntranslated='';
      const mode=document.createElement('button');mode.type='button';mode.className='bp-button browser-podcast-toggle';mode.onclick=()=>setMode(!isActive());ui.append(mode);
      const transport=document.createElement('div');transport.className='browser-podcast-transport';
      for(const [type,tr,en] of [['previousCue','Önceki','Previous'],['togglePlay','Oynat','Play'],['replay','Tekrar','Replay'],['nextCue','Sonraki','Next']]){
        const button=document.createElement('button');button.type='button';button.className='bp-button';button.dataset.podcastCommand=type;button.__copy=[tr,en];button.onclick=()=>void send(type,{},['previousCue','nextCue','replay'].includes(type));transport.append(button);
      }
      const speed=window.PlayerUiKit.select({label:copy('Oynatma hızı','Playback speed'),value:String(player.browserRate||1),options:[.5,.75,1,1.25,1.5,1.75,2].map(rate=>({value:String(rate),label:`${rate}×`})),onChange:rate=>{
        const binding=speed.__binding,now=snapshot();if(now&&binding?.mediaKey===now.mediaKey&&binding.generation===now.generation&&binding.tab===key())void send('setRate',{rate:Number(rate)});
      }});speed.classList.add('browser-podcast-speed');transport.append(speed);
      const bindSpeed=()=>{const now=snapshot();speed.__binding=now?{mediaKey:now.mediaKey,generation:now.generation,tab:key()}:null;};
      speed.trigger.addEventListener('click',()=>{if(speed.trigger.getAttribute('aria-expanded')!=='true')bindSpeed();},{capture:true});
      speed.trigger.addEventListener('keydown',event=>{if(['ArrowDown','ArrowUp'].includes(event.key))bindSpeed();},{capture:true});
      const tools=document.createElement('button');tools.type='button';tools.className='bp-button browser-podcast-tools';tools.onclick=()=>{toolsOpen=!toolsOpen;refresh();};
      ui.append(transport,tools);
    }
    if(ui.parentNode!==box)box.querySelector('.browser-study-status')?.after(ui);
    write(ui.querySelector('.browser-podcast-toggle'),copy(on?'Video görünümü':'Podcast görünümüne geç',on?'Video view':'Open podcast view'));
    const transport=ui.querySelector('.browser-podcast-transport'),tools=ui.querySelector('.browser-podcast-tools');transport.hidden=!on;tools.hidden=!on;
    write(tools,copy(toolsOpen?'Araçları gizle':'Altyazı araçları',toolsOpen?'Hide tools':'Caption tools'));tools.title=copy('Altyazı seçimi, Whisper ve çeviri','Caption selection, Whisper and translation');tools.setAttribute('aria-expanded',String(toolsOpen));
    for(const target of box.querySelectorAll('.browser-study-actions,.browser-study-second'))target.hidden=on&&!toolsOpen;
    if(on){
      write(document.querySelector('#playerSide .bp-title h2'),copy('Podcast dinleme','Podcast listening'));
      write(box.querySelector('.browser-study-title'),copy('Dinle, oku, kaldığın cümleden devam et.','Listen, read, continue from your sentence.'));
      for(const button of transport.querySelectorAll('button[data-podcast-command]')){
        const type=button.dataset.podcastCommand;
        write(button,type==='togglePlay'?copy(player.browserPaused?'Oynat':'Duraklat',player.browserPaused?'Play':'Pause'):copy(...button.__copy));
        button.title=type==='replay'?copy('Cümleyi tekrar dinle','Replay this sentence'):button.textContent;button.setAttribute('aria-label',button.title);
        button.disabled=!player.browserMediaSeen || (type!=='togglePlay'&&!browserSubtitleRoleCues().source?.length);
      }
      const speed=transport.querySelector('.browser-podcast-speed');speed.value=String(player.browserRate||1);
    }
    if(listeners.size)for(const fn of listeners)fn(snapshot());
  }
  window.BrowserPodcastUI=Object.freeze({setMode,isActive,snapshot,getTranscriptTracks,sourceRole,execute,subscribe(fn){listeners.add(fn);return()=>listeners.delete(fn);}});
  new MutationObserver(refresh).observe(layer,{attributes:true,attributeFilter:['class']});
  window.addEventListener('browser-panel-layout',refresh);document.addEventListener('ui-locale-change',()=>{ui?.remove();ui=null;refresh();});
  const off=window.api?.onBrowserEvent?.(event=>{if(event?.tabId===key()&&isActive())queueMicrotask(refresh);});
  window.addEventListener('pagehide',()=>{off?.();bridge?.dispose();listeners.clear();},{once:true});
  refresh();
})();
