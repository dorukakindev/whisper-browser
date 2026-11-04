/* Adapter over the existing player. No media element, decoder, audio graph or IPC authority is created here. */
(() => {
  'use strict';
  const layer = document.getElementById('playerLayer');
  const body = layer?.querySelector('.player-body');
  const video = document.getElementById('playerVideo');
  const stage = document.getElementById('playerStage');
  // The original title remains the media/context owner; chrome labels describe the page.
  const chromeTitle = document.createElement('span'); chromeTitle.className = 'pw-page-label';
  const syncChromeTitle = () => { chromeTitle.textContent = window.UiLocale?.get?.() === 'tr' ? 'Oynatıcı' : 'Player'; };
  syncChromeTitle(); document.getElementById('playerTitle')?.before(chromeTitle);
  const legacySide = document.getElementById('playerSide');
  if (!body || !video || !stage || !legacySide) return;
  const home = document.createComment('player-workspace-stage-home');
  stage.before(home);
  const assistant = document.getElementById('aiChat');
  const assistantHome = document.createComment('player-workspace-assistant-home');
  assistant?.before(assistantHome);
  const host = document.createElement('section'); host.id = 'playerWorkspaceV3'; host.hidden = true;
  const view = document.createElement('div'); host.append(view);
  const advanced = document.createElement('dialog'); advanced.className = 'pw-existing-tools'; advanced.hidden=true;
  const summary = document.createElement('button'); summary.type='button';summary.className='pw-existing-tools-close';advanced.append(summary);
  summary.onclick=()=>{advanced.close?.();advanced.hidden=true;advanced.removeAttribute('data-pw-occludes-native');view.querySelector('.pw-player-heading-actions button:last-child')?.focus();};
  advanced.addEventListener('close',()=>{advanced.hidden=true;advanced.removeAttribute('data-pw-occludes-native');});
  const scrim=document.createElement('button');scrim.type='button';scrim.className='pw-panel-scrim';scrim.hidden=true;host.append(scrim);
  host.append(advanced); body.append(host);
  let mounted = false, tab = 'transcript', query = '', follow = true, scope = 'watched';
  let selection = null, evidence = null, owner = '', rows = [], indexedRows = [], rowStamp = '', structural = '';
  let page = 0, lastActive = '', bridge = null, lastRefresh = 0, panelOpen=false,panelReturnFocus=null,idleTimer=null,ambient=null;
  let podcastMode=false;const subscribers=new Set();
  const podcastEntry=document.createElement('button');podcastEntry.type='button';podcastEntry.className='mh-action';
  const podcastLabel=()=>{podcastEntry.textContent=text(podcastMode?'Podcast görünümünden çık':'Podcast görünümü',podcastMode?'Exit podcast view':'Podcast view');podcastEntry.setAttribute('aria-pressed',String(podcastMode));};
  podcastEntry.onclick=()=>{podcastMode=!podcastMode;layer.classList.toggle('podcast-presentation',podcastMode);podcastLabel();refresh(true);};
  document.querySelector('#playerHeadMore .ph-more-body, #playerHeadMore [role=menu]')?.append(podcastEntry);
  const trackIds = new WeakMap(), trackCache = new WeakMap(); let trackSeq = 0;
  const locale = () => window.UiLocale?.get?.() === 'tr' ? 'tr' : 'en';
  const text = (tr, en) => locale() === 'tr' ? tr : en;
  podcastLabel();
  document.addEventListener('ui-locale-change',podcastLabel);
  function openAdvanced(){advanced.hidden=false;advanced.setAttribute('data-pw-occludes-native','true');PlayerUiKit.enhanceControls?.(advanced);if(!advanced.open)advanced.showModal?.();summary.focus();}
  function updatePanel() {
    const panel=view.querySelector('.pw-panel'),narrow=window.innerWidth<1100;
    host.classList.toggle('pw-panel-is-open',panelOpen&&narrow);scrim.hidden=!(panelOpen&&narrow);
    scrim.setAttribute('aria-label',text('Paneli kapat','Close panel'));
    if(!panel)return;
    if(panelOpen&&narrow){panel.setAttribute('role','dialog');panel.setAttribute('aria-modal','true');panel.setAttribute('data-pw-occludes-native','true');}
    else{panel.removeAttribute('role');panel.removeAttribute('aria-modal');panel.removeAttribute('data-pw-occludes-native');}
    const theater=view.querySelector('.pw-stage-col');if(theater)theater.inert=panelOpen&&narrow;
    view.querySelector('.pw-open-panel')?.setAttribute('aria-expanded',String(panelOpen&&narrow));
  }
  function openPanel(){panelReturnFocus=document.activeElement;panelOpen=true;updatePanel();view.querySelector('.pw-panel .pw-tab[aria-selected="true"]')?.focus();}
  function closePanel(){panelOpen=false;updatePanel();if(panelReturnFocus?.isConnected)panelReturnFocus.focus();else view.querySelector('.pw-open-panel')?.focus();}
  scrim.onclick=closePanel;
  host.addEventListener('keydown',event=>{
    if(event.key==='Escape'){if(!advanced.hidden){summary.click();event.preventDefault();}else if(panelOpen){closePanel();event.preventDefault();}}
    if(event.key!=='Tab'||!panelOpen||window.innerWidth>=1100)return;
    const nodes=[...view.querySelectorAll('.pw-panel button:not([disabled]),.pw-panel input:not([disabled]),.pw-panel [tabindex="0"]')].filter(n=>!n.hidden&&n.getClientRects().length);
    const first=nodes[0],last=nodes[nodes.length-1];if(!first)return;
    if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus();}else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus();}
  });
  function revealControls(){
    host.classList.remove('pw-controls-idle');clearTimeout(idleTimer);
    if(!mounted||video.paused)return;
    idleTimer=setTimeout(()=>{const active=document.activeElement;if(!video.paused&&!view.querySelector('.pw-tools__menu:not([hidden]),:popover-open')&&!view.querySelector('.pw-transport')?.contains(active))host.classList.add('pw-controls-idle');},2400);
  }
  host.addEventListener('pointermove',revealControls);host.addEventListener('pointerdown',revealControls);host.addEventListener('focusin',revealControls);
  function createAmbient(){
    const container=view.querySelector('.pw-ambient'),layers=[...container.querySelectorAll('.pw-ambient-layer')];
    const canvas=document.createElement('canvas');canvas.width=16;canvas.height=9;
    const ctx=canvas.getContext('2d',{willReadFrequently:true}),reduced=window.matchMedia('(prefers-reduced-motion: reduce)');
    layers.forEach(layer=>{layer.style.background='';layer.style.opacity='0';});delete container.dataset.sample;
    let active=0,color='',busy=false,pending='',animations=[],lastSample=0,dead=false,lastFrame=-1;
    const available=()=>mounted&&!host.hidden&&!layer.classList.contains('source-catalog-open')&&!document.hidden&&document.hasFocus()&&document.documentElement.dataset.mediaWindowInactive!=='true'&&player.ambientOn&&!panelOpen&&!advanced.open;
    const allowed=()=>mounted&&!host.hidden&&!layer.classList.contains('source-catalog-open')&&!document.hidden&&!video.paused&&player.ambientOn&&!reduced.matches&&(PlayerUiKit.motionAllowed?.()??true)&&document.documentElement.dataset.motion!=='off'&&document.body.dataset.motion!=='off'&&!panelOpen&&!advanced.open;
    const finish=(incoming,outgoing,next,rgb)=>{if(dead)return;incoming.style.opacity='1';outgoing.style.opacity='0';animations.forEach(a=>a.cancel());animations=[];active=next;color=rgb;busy=false;const latest=pending;pending='';if(latest&&allowed()&&latest!==color)fade(latest);};
    function fade(rgb){
      if(!available())return;if(!allowed()){animations.forEach(a=>a.cancel());animations=[];busy=false;pending='';}else if(busy){pending=rgb;return;}if(rgb===color)return;
      const next=1-active,incoming=layers[next],outgoing=layers[active];incoming.style.background=`radial-gradient(ellipse at 50% 35%,rgb(${rgb} / .8),rgb(${rgb} / .15) 55%,transparent 80%)`;
      if(!color||!incoming.animate||!allowed()){finish(incoming,outgoing,next,rgb);return;}
      busy=true;animations=[incoming.animate([{opacity:0},{opacity:1}],{duration:900,easing:'ease-in-out',fill:'forwards'}),outgoing.animate([{opacity:1},{opacity:0}],{duration:900,easing:'ease-in-out',fill:'forwards'})];
      Promise.all(animations.map(a=>a.finished)).then(()=>finish(incoming,outgoing,next,rgb)).catch(()=>{});
    }
    function sync(){
      const enabled=allowed();container.hidden=!player.ambientOn;
      animations.forEach(animation=>enabled?animation.play():animation.pause());
      if(player.ambientTimer)stopAmbient();
      if(!available())return;
      if(color && !video.paused && (reduced.matches || ['off','reduced'].includes(document.documentElement.dataset.cinemaMotion) || ['off','reduced'].includes(document.getElementById('uiMotion')?.value)))return;
      if(window.NativePlayerUI?.active()){container.hidden=true;container.dataset.sample='native-frame-unavailable';container.title=text('mpv kare rengine erişim yok; ortam ışığı gösterilemiyor.','mpv frame color is unavailable; ambient light cannot be shown.');return;}
      const now=performance.now();if((video.paused&&lastFrame===video.currentTime)||now-lastSample<500||video.readyState<2||!video.videoWidth||!ctx)return;lastSample=now;lastFrame=video.currentTime;
      try{ctx.drawImage(video,0,0,16,9);const pixels=ctx.getImageData(0,0,16,9).data;let r=0,g=0,b=0;for(let i=0;i<pixels.length;i+=4){r+=pixels[i];g+=pixels[i+1];b+=pixels[i+2];}const n=pixels.length/4;fade(`${Math.round(r/n)} ${Math.round(g/n)} ${Math.round(b/n)}`);container.dataset.sample='video-canvas';}catch{container.dataset.sample='frame-unavailable';}
    }
    document.addEventListener('visibilitychange',sync);window.addEventListener('blur',sync);window.addEventListener('focus',sync);reduced.addEventListener('change',sync);
    return{sync,dispose(){dead=true;animations.forEach(a=>a.cancel());document.removeEventListener('visibilitychange',sync);window.removeEventListener('blur',sync);window.removeEventListener('focus',sync);reduced.removeEventListener('change',sync);}};
  }
  function track(cues, secondary, role) {
    if (!trackIds.has(cues)) trackIds.set(cues, ++trackSeq);
    const id = (secondary ? 'secondary:' : 'primary:') + (secondary ? player.sub2Path : player.subPath || 'live');
    const offsetSeconds = Number(secondary ? player.offset2 : player.offset) || 0;
    const revision = `${trackIds.get(cues)}:${cues._cueIndexVersion || 0}:${cues.length}:${offsetSeconds}`;
    const cached = trackCache.get(cues);
    const mapped = cached?.revision === revision ? cached.cues : cues.map((cue, i) => ({ ...cue, id: String(cue.id ?? i) }));
    trackCache.set(cues, { revision, cues: mapped });
    return { id, revision, role, offsetSeconds, cues: mapped };
  }
  function tracks() {
    const roles = browserSubtitleRoleCues();
    const sourceSecondary = roles.source === player.cues2 || roles.primaryTranslation;
    const primary = track(player.cues, false, sourceSecondary ? 'translation' : 'source');
    const secondary = track(player.cues2, true, sourceSecondary ? 'source' : 'translation');
    return sourceSecondary ? [secondary, primary] : [primary, secondary];
  }
  function snapshot() {
    const [source, secondary] = tracks();
    const audio=player.workspaceAudio?.mediaKey===player.mediaKey&&player.workspaceAudio?.generation===player.generation?player.workspaceAudio:null;
    const browser=player.workspaceMode==='browser',native=!!window.NativePlayerUI?.active();
    const duration=browser?Number(player.browserDuration)||null:Number.isFinite(video.duration)?video.duration:null;
    const hasMedia=!!player.mediaKey&&(browser?!!player.browserMediaSeen:!!video.getAttribute('src')||native);
    const spotifyOnly=browser&&/^https?:\/\/(?:open\.)?spotify\.com(?:[/:]|$)/i.test(player.browserPageUrl||'');
    const existingAsr=!!player.localPath||!!audio?.entryId||/^youtube:/.test(player.mediaKey||'');
    const capability=(support,reason)=>({support,reason});
    const transport=capability(hasMedia?'yes':'unknown',hasMedia?'existing-playback-owner':'media-not-observed');
    const sourceBinding=audio?.sourceBinding||{episodeIdentity:player.mediaKey,revision:player.generation,fingerprintStatus:'unknown',etag:'unknown',length:'unknown',sha256:'unknown',probe:{status:'observed',duration:duration??'unknown',videoWidth:!browser&&video.videoWidth||'unknown',videoHeight:!browser&&video.videoHeight||'unknown',reason:'playback-observation-is-not-byte-verification'}};
    return { episodeIdentity:audio?.episodeIdentity||player.mediaKey,sourceVersion:audio?.sourceVersion||('observed:'+player.mediaKey+':'+player.generation),sourceBinding,sourceVersionStatus:sourceBinding.fingerprintStatus||'unknown',sourceKind:audio?'rss':browser?'browser':player.localPath?'local':'unknown',playbackOwner:browser?'browser':native?'native':'player', mediaKey: player.mediaKey, generation: player.generation, title: document.getElementById('playerTitle')?.textContent || '',
      time: player.workspaceMode==='browser'?Number(player.browserTime)||0:Number(video.currentTime)||0, duration: player.workspaceMode==='browser'?Number(player.browserDuration)||null:Number.isFinite(video.duration)?video.duration:null,
      paused: player.workspaceMode==='browser'?player.browserPaused:video.paused, rate: player.workspaceMode==='browser'?player.browserRate:video.playbackRate, sourceTrack: { id: source.id, revision: source.revision },
      secondaryTrack: secondary.cues.length ? { id: secondary.id, revision: secondary.revision } : null,
      capabilities: {play:transport,pause:transport,seek:player.isLive?capability('no','live-source'):capability(hasMedia&&duration?'yes':'unknown',hasMedia&&duration?'existing-seek-owner':'seek-range-unverified'),rate:transport,
        readTranscript:capability(source.cues.length||audio?.transcriptState==='untimed'?'yes':'no',source.cues.length||audio?.transcriptState==='untimed'?'existing-transcript-owner':'no-transcript'),
        asr:capability(spotifyOnly?'no':existingAsr?'yes':'unknown',spotifyOnly?'no-authorized-audio-source':existingAsr?'existing-whisper-queue':'audio-acquisition-unverified'),
        ASR:capability(spotifyOnly?'no':existingAsr?'yes':'unknown',spotifyOnly?'no-authorized-audio-source':existingAsr?'existing-whisper-queue':'audio-acquisition-unverified'),
        download:capability(spotifyOnly?'no':player.localPath?'no':'unknown',spotifyOnly?'no-authorized-download-source':player.localPath?'already-local':'download-not-verified')} };
  }
  function sourceRole() {
    const [source] = tracks();
    return { trackId: source.id, trackRevision: source.revision, cues: source.cues, offsetSeconds: source.offsetSeconds };
  }
  async function execute(command) {
    const current=snapshot();if(command.mediaKey&&command.mediaKey!==current.mediaKey||command.generation!==undefined&&command.generation!==current.generation)return {ok:false,code:'source-changed'};
    if(player.workspaceMode==='browser'){
      const commands={seek:'seek',togglePlay:player.browserPaused?'play':'pause',setRate:'speed',setVolume:'volume-set'};
      if(command.type==='seekCue'){const source=sourceRole(),cue=source.cues.find(c=>c.id===command.cueId);return cue?browserCommand('seek',cue.start+source.offsetSeconds):{ok:false,code:'unknown-cue'};}
      if(!commands[command.type])return {ok:false,code:'unsupported'};
      return browserCommand(commands[command.type],command.time??command.rate??command.volume);
    }
    switch (command.type) {
      case 'seekCue': {
        const [source] = tracks(); const index = source.cues.findIndex(c => c.id === command.cueId);
        if (index < 0) return { ok: false, code: 'unknown-cue' };
        if (source.id.startsWith('primary:')) seekToCue(index);
        else { player.loopCueId = ''; video.currentTime = Math.max(0, source.cues[index].start + source.offsetSeconds + .01); }
        break;
      }
      case 'seek': player.loopCueId = ''; video.currentTime = command.time; break;
      case 'togglePlay': if (video.paused) await video.play(); else video.pause(); break;
      case 'setVolume': if (!Number.isFinite(command.volume) || command.volume < 0 || command.volume > 1) return {ok:false,code:'invalid-range'}; setPlayerVolume(command.volume); break;
      case 'setRate': document.getElementById('playerSpeed').value = String(command.rate); document.getElementById('playerSpeed').dispatchEvent(new Event('change', { bubbles: true })); break;
      case 'setAB': player.abA = command.a; player.abB = command.b; renderAbMarkers(); break;
      default: return { ok: false, code: 'unsupported' };
    }
    return { ok: true }; // Accepted by the original player path, not proof of native seek completion.
  }
  function dispatch(type, args = {}, trackBound = false) {
    const snap = snapshot(); const source = sourceRole();
    return bridge?.dispatch({ type, mediaKey: snap.mediaKey, generation: snap.generation,
      ...(trackBound ? { trackId: source.trackId, trackRevision: source.trackRevision } : {}), ...args });
  }
  function restoreAssistant() { if (assistant && assistant.parentNode !== assistantHome.parentNode) assistantHome.after(assistant); }
  function capture() {
    if (!selection) { evidence = null; return; }
    const snap=snapshot();
    evidence = PlayerContextEvidence.captureSelectionEvidence({ snapshot: snap, selection: { text: selection.text, cueIds: [selection.cueId] }, scope, tracks: tracks() });
    if(evidence?.ok)evidence={...evidence,envelope:{...evidence.envelope,episodeIdentity:snap.episodeIdentity,sourceVersion:snap.sourceVersion,playbackTime:snap.time,selectedCueIds:[selection.cueId]}};
  }
  function step(delta, expected) {
    if(expected&&(expected.mediaKey!==player.mediaKey||expected.generation!==player.generation))return;
    const i = PlayerTranscriptModel.activeRowIndex(rows, snapshot().time);
    const row = rows[Math.max(0, Math.min(rows.length - 1, (i < 0 ? 0 : i) + delta))];
    if (row) void dispatch('seekCue', { cueId: row.cueId }, true);
  }
  async function saveQuote(source,index,snap) {
    const cues=source.id.startsWith('primary:')?player.cues:player.cues2;
    const original=cues[index]; if(!original)return;
    const context=await learningAnnotationContext(original);
    if(player.mediaKey!==snap.mediaKey||player.generation!==snap.generation||cues[index]!==original)return;
    const primary=source.id.startsWith('primary:'),sig=cueSignature(original),at=primary?player.savedCues.indexOf(sig):-1;
    const result=await syncLearningAnnotation('quote',original,at<0,context);
    if(!result?.ok||player.mediaKey!==snap.mediaKey||player.generation!==snap.generation)return;
    if(primary){if(at<0)player.savedCues.push(sig);else player.savedCues.splice(at,1);}
    persistSavedCues();renderCueList();
  }
  function setTab(next) { restoreAssistant(); tab = next; draw(); }
  function draw() {
    if (!mounted) return;
    restoreAssistant();
    const snap = snapshot(); const [source, secondary] = tracks();
    const audio=player.workspaceAudio?.mediaKey===snap.mediaKey&&player.workspaceAudio?.generation===snap.generation?player.workspaceAudio:null;
    const at = PlayerTranscriptModel.activeRowIndex(rows, snap.time);
    const send = (type, args = {}, bound = false) => bridge.dispatch({type,mediaKey:snap.mediaKey,generation:snap.generation,...(bound?{trackId:source.id,trackRevision:source.revision}:{}),...args});
    const visible = query ? [...cueTextSearchIndex(indexedRows, []).query(foldQuery(query))].sort((a,b)=>a-b).map(i=>rows[i]) : rows;
    if (!query && follow && at >= 0) page = Math.floor(at / 500);
    const shown = visible.slice(page * 500, (page + 1) * 500);
    syncChromeTitle();
    const originalName = player.localPath ? player.localPath.split(/[\\/]/).pop() : null;
    const metadata=[audio?text('Ses kaynağı','Audio source'):player.localPath?text('Yerel dosya','Local file'):player.metaBase?(window.UiLocale?.t(player.metaBase)||player.metaBase):null,
      snap.duration?PlayerUiKit.formatClock(snap.duration):null,video.videoWidth&&video.videoHeight?`${video.videoWidth} × ${video.videoHeight}`:null,
      ...[[player.cues,player.subLang],[player.cues2,player.sub2Lang]].filter(([cues,lang])=>cues.length&&PlayerUiKit.languageName(lang,locale())).map(([,lang])=>`${PlayerUiKit.languageName(lang,locale())} ${text('altyazı','subtitles')}`),originalName,
      window.NativePlayerUI?.active()&&player.ambientOn?text('Ortam ışığı bu oynatma modunda kullanılamıyor','Ambient light is unavailable in this playback mode'):null];
    const markers=player.cues.filter(cue=>player.savedCues.includes(cueSignature(cue))).map(cue=>({time:cue.start+(Number(player.offset)||0),label:text('Kaydedilen konum','Saved position')}));
    const result = PlayerWorkspaceUI.renderPlayerWorkspace(view, { locale: locale(), media: { title: originalName ? PlayerUiKit.displayTitle(originalName) : snap.title, originalName, metadata, kind: audio?'audio':'video' },
      transcriptState:audio?.transcriptState||'timed',snapshot: { ...snap, duration: snap.duration || 0 }, rows: shown, activeKey: at >= 0 ? rows[at].key : null,
      tab, query, follow, scope, selection, evidence, hasSecondary: secondary.cues.length > 0, stageMode: 'slot',panelOpen,markers,hasMoreRows:(page+1)*500<visible.length,sourceLang:source.id.startsWith('primary:')?player.subLang:player.sub2Lang,secondaryLang:secondary.id.startsWith('primary:')?player.subLang:player.sub2Lang,
      subtitleMode: currentSubtitleMode() === 'translation' ? 'secondary' : currentSubtitleMode(),
      ab: player.abA !== null && player.abB !== null ? { a: player.abA, b: player.abB } : null,
      nextQueueIndex:Math.max(0,player.playlistIndex+1),queue: (player.playlist || []).map((file, index) => ({ itemId: String(index), title: String(file).split(/[\\/]/).pop(), file })) }, {
      onBack: () => document.getElementById('playerBack')?.click(),
      onTab: setTab, onQuery: value => { query = value; page = 0; draw(); },
      onFollow: value => { follow = value; draw(); },
      onSeekRow: row => void send('seekCue', { cueId: row.cueId }, true),
      onSeekRatio: ratio => { if (snap.duration) void send('seek', { time: ratio * snap.duration }); },
      onTogglePlay: () => void send('togglePlay'), onPrevCue: () => step(-1,snap), onNextCue: () => step(1,snap),
      onReplay: () => { const row = rows[PlayerTranscriptModel.activeRowIndex(rows, snapshot().time)]; if (row) void send('seekCue', { cueId: row.cueId }, true); },
      onToggleAb: () => { toggleAbLoop(); draw(); }, onRate: rate => void send('setRate', { rate }),
      onVolume: () => {view.querySelector('.pw-tools').__open();view.querySelector('.pw-runtime-volume')?.focus();},
      onPanelOpen:openPanel,onPanelClose:closePanel,onControlsReveal:revealControls,
      onMarker:()=>{if(snap.mediaKey===player.mediaKey&&snap.generation===player.generation)void toggleCueSaved();},
      onNote:()=>{if(snap.mediaKey===player.mediaKey&&snap.generation===player.generation)void saveCueNote();},
      onAdvanced:openAdvanced,onHealth:()=>window.WhisperV3.open('health'),
      onFullscreen: () => document.getElementById('fullscreenBtn')?.click(),
      onSubtitleMode: mode => setSubtitleMode(mode === 'secondary' ? 'translation' : mode),
      onSelection: value => { selection = value; capture(); draw(); },
      onScope: value => { scope = value; capture(); draw(); }, onSwitchScope: () => { scope = 'selection'; capture(); draw(); },
      onAsk: kind => { if (!evidence?.ok) {if(kind==='scene'){setTab('assistant');void aiChatSend(text('Bu sahneyi açıkla.','Explain this scene.'),null,aiSourceScope());}return;} const frozen = structuredClone(evidence.envelope); setTab('assistant'); void aiChatSend(text(`Seçili ifadeyi açıkla: ${frozen.selectedText}`, `Explain this selection: ${frozen.selectedText}`), null, aiSourceScope(), { playerEvidence: frozen }); },
      onCopy: value => void window.api.copyText(value.text),
      onSave: value => { const i = source.cues.findIndex(c => c.id === value.cueId); if (i >= 0) void saveQuote(source, i, snap); },
      onDictionary: value => { selection = value; player.selectedWord={word:value.text,cueIndex:source.cues.findIndex(c=>c.id===value.cueId),source:'source'};lookupSelectedWord(); },
      onOpenQueued: item => { const delta = Number(item.itemId) - player.playlistIndex; void playPlaylistDelta(delta); }
    });
    if (stage.parentNode !== result.stageSlot) result.stageSlot.append(stage);
    updatePanel();if(!ambient)ambient=createAmbient();ambient.sync();revealControls();
    stage.querySelector('.pw-podcast-cover')?.remove();
    if(audio){const cover=document.createElement('div');cover.className='pw-podcast-cover';cover.append(PlayerUiKit.cover(audio.title,audio.entryId),PlayerUiKit.h('strong',{text:audio.title}));stage.append(cover);}
    if(audio?.transcriptState==='untimed'&&tab==='transcript'){
      const list=view.querySelector('.pw-transcript'),body=document.createElement('p'),more=document.createElement('button');body.className='pw-runtime-untimed';more.type='button';let loaded=0;
      if(audio.transcriptTimingNotice){const notice=document.createElement('p');notice.className='pw-runtime-untimed';notice.setAttribute('role','status');notice.textContent=audio.transcriptTimingNotice;list.append(notice);}
      const transcriptText=String(audio.transcriptText||'');
      const append=()=>{const chunk=transcriptText.slice(loaded,loaded+50000);loaded+=chunk.length;body.append(document.createTextNode(chunk));more.textContent=text('Daha fazla metin','More text');more.hidden=loaded>=transcriptText.length;};more.onclick=append;list.append(body,more);append();
    }
    if(audio?.transcriptState==='choice-required'&&tab==='transcript'){
      const list=view.querySelector('.pw-transcript'),notice=document.createElement('p'),choose=document.createElement('button');notice.className='pw-runtime-untimed';
      notice.textContent=text('Birden çok yayıncı dökümü var. Dil ve zaman bilgisini inceleyerek kullanacağınız dökümü seçin.','Multiple publisher transcripts are available. Choose a transcript by language and timing.');
      choose.type='button';choose.className='pw-btn';choose.textContent=text('Yayıncı dökümünü seç','Choose publisher transcript');choose.onclick=()=>window.PlayerSourceCatalogIntegration?.podcastTools();
      list.querySelector('.pw-empty')?.remove();list.append(notice,choose);
    }
    if(audio?.transcriptState==='needs-review'&&tab==='transcript'){
      const list=view.querySelector('.pw-transcript'),notice=document.createElement('p');notice.className='pw-runtime-untimed';notice.setAttribute('role','status');
      notice.textContent=text('Ses kaynağı değişti. Eski döküm ve zaman konumu uygulanmadı; yeni kaynak için yayıncı dökümünü yeniden yükleyin veya Whisper çalıştırın.','The audio source changed. The old transcript and position were not applied; reload the publisher transcript or run Whisper for the new source.');
      list.querySelector('.pw-empty')?.remove();list.append(notice);
    }
    if (tab === 'assistant' && assistant) {
      const destination = view.querySelector('.pw-assistant');
      destination.replaceChildren(assistant); setSideTab('ai'); assistant.classList.remove('hidden');
    }
    const tabs = [...view.querySelectorAll('.pw-tab')];
    tabs.forEach((node, i) => { node.tabIndex = node.getAttribute('aria-selected') === 'true' ? 0 : -1;
      node.addEventListener('keydown', event => { const delta = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0; if (!delta) return; event.preventDefault(); setTab(['transcript','assistant','queue'][(i + delta + 3) % 3]); view.querySelector('.pw-tab[aria-selected="true"]')?.focus(); }); });
    if (visible.length > 500) {
      const paging = document.createElement('div'); paging.className = 'pw-runtime-pages';
      for (const delta of [-1, 1]) { const button = document.createElement('button'); button.type = 'button'; button.textContent = delta < 0 ? text('Önceki 500', 'Previous 500') : text('Sonraki 500', 'Next 500'); button.disabled = delta < 0 ? page === 0 : (page + 1) * 500 >= visible.length; button.onclick = () => { page += delta; follow = false; draw(); }; paging.append(button); }
      view.querySelector('.pw-panel__tools')?.after(paging);
    }
    const toolsMenu=view.querySelector('.pw-tools__menu');
    const volumeLabel=document.createElement('label'); volumeLabel.textContent=text('Ses düzeyi','Volume');
    const volume=document.createElement('input');volume.type='range';volume.min='0';volume.max='1';volume.step='.01';volume.value=String(video.volume);volume.className='pw-runtime-volume';volume.setAttribute('aria-label',volumeLabel.textContent);volume.addEventListener('input',()=>void send('setVolume',{volume:Number(volume.value)}));volumeLabel.append(volume);toolsMenu.append(volumeLabel);
    for(const [id,tr,en] of [['playerMediaCenter','Oynatma, sahneler ve kaynaklar','Playback, scenes and sources'],['playerMore','Diğer oynatma işlemleri','More playback actions']]){const button=document.createElement('button');button.type='button';button.className='pw-btn';button.textContent=text(tr,en);button.onclick=()=>{if(id==='playerMore'){openAdvanced();document.getElementById('playerMediaCenter')?.click()}else document.getElementById(id)?.click()};toolsMenu.append(button);}
    const healthButton=document.createElement('button');
    healthButton.type='button';healthButton.className='pw-btn';
    healthButton.textContent=text('Oynatma sağlığı','Playback health');
    healthButton.onclick=()=>window.WhisperV3.open('health');
    toolsMenu.append(healthButton);
    summary.textContent = text('İleri araçları kapat', 'Close advanced tools');
    const ambientButton=document.createElement('button');ambientButton.className='pw-btn';ambientButton.type='button';ambientButton.textContent=text('Ortam ışığı','Ambient light');ambientButton.setAttribute('aria-pressed',String(player.ambientOn));ambientButton.onclick=()=>{setAmbient(!player.ambientOn);if(player.ambientTimer)stopAmbient();ambient?.sync();ambientButton.setAttribute('aria-pressed',String(player.ambientOn));};toolsMenu.append(ambientButton);
    const key = `${snap.mediaKey}:${snap.generation}`;
    view.querySelectorAll('.pw-controls button, .pw-controls input, .pw-controls select').forEach(node => node.dataset.owner = key);
  }
  function mount() {
    mounted = true; host.hidden = false; layer.classList.add('player-workspace-v3');
    stopAmbient();
    advanced.append(legacySide);
    bridge = PlayerWorkspaceModel.createPlayerWorkspaceBridge({ readSnapshot: snapshot, executeExisting: execute, resolveSourceRole: sourceRole });
    structural = ''; rowStamp = '';
  }
  function unmount() {
    if (!mounted) return;
    ambient?.dispose();ambient=null;clearTimeout(idleTimer);panelOpen=false;if(advanced.open)advanced.close();advanced.hidden=true;advanced.removeAttribute('data-pw-occludes-native');scrim.hidden=true;
    restoreAssistant(); home.after(stage); document.getElementById('sideResizer').after(legacySide);
    bridge?.dispose(); bridge = null; mounted = false; host.hidden = true; layer.classList.remove('player-workspace-v3');
    view.replaceChildren(); structural = ''; owner = '';
  }
  function refresh(force = false) {
    const eligible = player.workspaceMode === 'player' && !layer.classList.contains('hidden') && !!player.mediaKey && !!video.getAttribute('src');
    if (!eligible) { unmount(); return; }
    if (!mounted) mount();
    const nextOwner = `${player.mediaKey}:${player.generation}`;
    if (nextOwner !== owner) { ambient?.dispose();ambient=null;owner = nextOwner; query = ''; selection = null; evidence = null; page = 0; tab = 'transcript'; follow = true;panelOpen=false; }
    const [source, secondary] = tracks(); const stamp = `${player.workspaceAudio?.transcriptState||''}:${owner}:${source.id}:${source.revision}:${source.offsetSeconds}:${secondary.id}:${secondary.revision}:${secondary.offsetSeconds}`;
    if (rowStamp !== stamp) { rowStamp = stamp; rows = player.workspaceAudio?.transcriptState==='untimed'?[]:PlayerTranscriptModel.buildTranscriptRows({ sourceTrack: source, secondaryTrack: secondary, mediaKey: player.mediaKey, generation: player.generation }); indexedRows=rows.map(row=>({start:row.videoStart,end:row.videoEnd,text:row.sourceText+'\n'+row.secondaryText})); if (selection) { selection = null; evidence = null; } }
    const key = `${stamp}:${locale()}:${video.paused}:${video.duration}:${video.playbackRate}:${currentSubtitleMode()}:${player.abA}:${player.abB}:${player.savedCues.join('|')}:${player.subLang}:${player.sub2Lang}:${video.videoWidth}:${video.videoHeight}:${window.NativePlayerUI?.active()}:${document.getElementById('playerTitle')?.textContent}`;
    if (force || structural !== key) { structural = key; draw(); }
    ambient?.sync();if(video.paused)revealControls();
    const time = Number(video.currentTime) || 0, duration = Number(video.duration) || 0;
    const timer = view.querySelector('.pw-time'); if (timer) timer.textContent = `${PlayerUiKit.formatClock(time)} / ${PlayerUiKit.formatClock(duration)}`;
    const fill = view.querySelector('.pw-timeline__fill'), knob = view.querySelector('.pw-timeline__knob'), range = view.querySelector('.pw-timeline input');
    const percent = duration ? Math.min(100, Math.max(0, time / duration * 100)) : 0;
    if (fill) fill.style.width = percent + '%'; if (knob) knob.style.left = percent + '%'; if (range && document.activeElement !== range) range.value = String(Math.round(percent * 10));
    const index = PlayerTranscriptModel.activeRowIndex(rows, time), active = index >= 0 ? rows[index].key : '';
    if (lastActive !== active) {
      lastActive = active;
      for (const node of view.querySelectorAll('.pw-cue')) { if (node.dataset.key === active) { node.setAttribute('aria-current','true'); if (follow) { const list = node.closest('.pw-transcript'); list.scrollTop += node.getBoundingClientRect().top - list.getBoundingClientRect().top - (list.clientHeight - node.clientHeight) / 2; } } else node.removeAttribute('aria-current'); }
      if (follow && index >= 0 && Math.floor(index / 500) !== page) draw();
    }
  }
  for (const event of ['timeupdate','play','pause','loadedmetadata','ratechange','volumechange','emptied']) video.addEventListener(event, () => refresh());
  new MutationObserver(() => refresh()).observe(layer, { attributes:true, attributeFilter:['class'] });
  const pulse = setInterval(() => { if (document.hidden) return; const now = performance.now(); if (now - lastRefresh >= 240) { lastRefresh = now; refresh();if(podcastMode)for(const listener of subscribers)listener(snapshot()); } }, 250);
  window.addEventListener('resize', () => { if (mounted) {updatePanel();draw();} });
  window.addEventListener('pagehide', () => { clearInterval(pulse); unmount(); }, {once:true});
  function freezeWatchQuestion(question) {
    if (!mounted || player.workspaceMode !== 'player') return null;
    const snap = snapshot();
    const [track] = tracks();
    const active = rows[PlayerTranscriptModel.activeRowIndex(rows, snap.time)];
    const anchor = AssistantWatchContext.freezeWatchAnchor({
      snapshot: { ...snap, activeCueId: active?.cueId }, question
    });
    return AssistantWatchContext.buildWatchContext({ anchor, track });
  }
  function watchQuestionIsCurrent(packet) {
    return mounted && player.workspaceMode === 'player' &&
      AssistantWatchContext.anchorStillValid(packet?.anchor, snapshot());
  }
  function acceptEvidence(envelope) {
    if(!mounted||!envelope||envelope.schema!=='player-evidence-v1')return false;
    const snap=snapshot(),[source,secondary]=tracks();
    return (!envelope.sourceVersion||(envelope.sourceVersion===snap.sourceVersion&&envelope.episodeIdentity===snap.episodeIdentity))&&envelope.mediaKey===snap.mediaKey&&envelope.generation===snap.generation&&envelope.sourceTrackId===source.id&&envelope.sourceRevision===source.revision&&(!envelope.secondaryTrackId||(envelope.secondaryTrackId===secondary.id&&envelope.secondaryRevision===secondary.revision));
  }
  function serializeEvidence(envelope) {
    if(!acceptEvidence(envelope))return null;
    return {scope:envelope.scope==='whole'?'full':envelope.scope,position:envelope.scopeEnd,totalCues:rows.length,eligibleCues:envelope.evidence.length,coverage:'selection',limitations:envelope.limitations,
      evidence:envelope.evidence.map((entry,index)=>({id:'T'+(index+1),zaman:PlayerUiKit.formatClock(entry.videoStart),baslangic:entry.videoStart,bitis:entry.videoEnd,metin:entry.source,ceviri:entry.secondary||''})),
      playerAnchor:{episodeIdentity:envelope.episodeIdentity,sourceVersion:envelope.sourceVersion,playbackTime:envelope.playbackTime,selectedCueIds:envelope.selectedCueIds,mediaKey:envelope.mediaKey,generation:envelope.generation,sourceTrackId:envelope.sourceTrackId,sourceRevision:envelope.sourceRevision}};
  }
  async function seekEvidence(entry, anchor) {
    const snap=snapshot(),source=sourceRole();
    const identity=window.AssistantSourceContext?.conversation(player,globalAssistantContext());
    const sameTrack=anchor?.sourceTrack?.id===snap.sourceTrack.id&&anchor?.sourceTrack?.revision===snap.sourceTrack.revision;
    if(!mounted||!anchor||anchor.mediaKey!==snap.mediaKey||anchor.generation!==snap.generation||!sameTrack||entry?.sourceKey!==identity||!Number.isFinite(entry.time)||entry.time<0||entry.time>snap.duration)return{ok:false,code:'source-changed'};
    const normalized=value=>String(value||'').normalize('NFKC').replace(/\s+/g,' ').trim();
    const requested=normalized(entry.text),row=rows.find(candidate=>entry.time>=candidate.videoStart-.05&&entry.time<=candidate.videoEnd+.05&&requested&&[candidate.sourceText,candidate.secondaryText].some(value=>{const content=normalized(value);return content&&(content===requested||content.includes(requested));}));
    if(!row)return{ok:false,code:'source-changed'};
    const result=await bridge.dispatch({type:'seek',mediaKey:snap.mediaKey,generation:snap.generation,trackId:source.trackId,trackRevision:source.trackRevision,time:entry.time});
    if(!result?.ok)return result;
    if(player.mediaKey!==snap.mediaKey||player.generation!==snap.generation||sourceRole().trackRevision!==source.trackRevision)return{ok:false,code:'source-changed'};
    restoreAssistant();tab='transcript';query='';follow=true;page=Math.floor(Math.max(0,rows.indexOf(row))/500);draw();
    const cue=[...view.querySelectorAll('.pw-cue')].find(node=>node.dataset.key===row.key);
    cue?.classList.add('pw-cue-evidence');setTimeout(()=>cue?.classList.remove('pw-cue-evidence'),1400);
    if(window.innerWidth<1100)openPanel();
    return result;
  }
  // Public adapters enter the same owner/track/range gate as workspace controls.
  window.PlayerWorkspaceIntegration = Object.freeze({ setPodcastMode:value=>{if(podcastMode!==!!value)podcastEntry.click();},isPodcastMode:()=>podcastMode&&!layer.classList.contains('hidden')&&!window.MediaShelfUI?.isPodcastMode?.(),getTranscriptTracks:()=>tracks().map(track=>({...track,timed:!['untimed','needs-review'].includes(player.workspaceAudio?.transcriptState)})),executeExisting:command=>bridge?bridge.dispatch(command):Promise.resolve({ok:false,code:'stale-source',message:text('Etkin oynatıcı kaynağı yok.','No active player source.')}),subscribe(listener){subscribers.add(listener);return ()=>subscribers.delete(listener);},refresh, snapshot, sourceRole, freezeWatchQuestion, watchQuestionIsCurrent, acceptEvidence, serializeEvidence, seekEvidence, get bridge() { return bridge; }, evidence: () => evidence?.envelope || null });
  refresh();
})();
