/* Adapter over the existing player. No media element, decoder, audio graph or IPC authority is created here. */
(() => {
  'use strict';
  const layer = document.getElementById('playerLayer');
  const body = layer?.querySelector('.player-body');
  const video = document.getElementById('playerVideo');
  const stage = document.getElementById('playerStage');
  const legacySide = document.getElementById('playerSide');
  if (!body || !video || !stage || !legacySide) return;
  const home = document.createComment('player-workspace-stage-home');
  stage.before(home);
  const assistant = document.getElementById('aiChat');
  const assistantHome = document.createComment('player-workspace-assistant-home');
  assistant?.before(assistantHome);
  const host = document.createElement('section'); host.id = 'playerWorkspaceV3'; host.hidden = true;
  const view = document.createElement('div'); host.append(view);
  const advanced = document.createElement('details'); advanced.className = 'pw-existing-tools';
  const summary = document.createElement('summary'); advanced.append(summary);
  host.append(advanced); body.append(host);
  let mounted = false, tab = 'transcript', query = '', follow = true, scope = 'watched';
  let selection = null, evidence = null, owner = '', rows = [], indexedRows = [], rowStamp = '', structural = '';
  let page = 0, lastActive = '', bridge = null, lastRefresh = 0;
  const trackIds = new WeakMap(), trackCache = new WeakMap(); let trackSeq = 0;
  const locale = () => window.UiLocale?.get?.() === 'tr' ? 'tr' : 'en';
  const text = (tr, en) => locale() === 'tr' ? tr : en;
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
    return { mediaKey: player.mediaKey, generation: player.generation, title: document.getElementById('playerTitle')?.textContent || '',
      time: Number(video.currentTime) || 0, duration: Number.isFinite(video.duration) ? video.duration : null,
      paused: video.paused, rate: video.playbackRate, sourceTrack: { id: source.id, revision: source.revision },
      secondaryTrack: secondary.cues.length ? { id: secondary.id, revision: secondary.revision } : null,
      capabilities: { seek: { support: player.isLive ? 'no' : 'yes' } } };
  }
  function sourceRole() {
    const [source] = tracks();
    return { trackId: source.id, trackRevision: source.revision, cues: source.cues, offsetSeconds: source.offsetSeconds };
  }
  async function execute(command) {
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
    evidence = PlayerContextEvidence.captureSelectionEvidence({ snapshot: snapshot(), selection: { text: selection.text, cueIds: [selection.cueId] }, scope, tracks: tracks() });
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
    const result = PlayerWorkspaceUI.renderPlayerWorkspace(view, { locale: locale(), media: { title: snap.title, subtitle: text('Oynatma çalışma alanı', 'Playback workspace'), kind: audio?'audio':'video' },
      transcriptState:audio?.transcriptState||'timed',snapshot: { ...snap, duration: snap.duration || 0 }, rows: shown, activeKey: at >= 0 ? rows[at].key : null,
      tab, query, follow, scope, selection, evidence, hasSecondary: secondary.cues.length > 0, stageMode: 'slot',
      subtitleMode: currentSubtitleMode() === 'translation' ? 'secondary' : currentSubtitleMode(),
      ab: player.abA !== null && player.abB !== null ? { a: player.abA, b: player.abB } : null,
      queue: (player.playlist || []).map((file, index) => ({ itemId: String(index), title: String(file).split(/[\\/]/).pop(), file })) }, {
      onBack: () => document.getElementById('playerBack')?.click(),
      onTab: setTab, onQuery: value => { query = value; page = 0; draw(); },
      onFollow: value => { follow = value; draw(); },
      onSeekRow: row => void send('seekCue', { cueId: row.cueId }, true),
      onSeekRatio: ratio => { if (snap.duration) void send('seek', { time: ratio * snap.duration }); },
      onTogglePlay: () => void send('togglePlay'), onPrevCue: () => step(-1,snap), onNextCue: () => step(1,snap),
      onReplay: () => { const row = rows[PlayerTranscriptModel.activeRowIndex(rows, snapshot().time)]; if (row) void send('seekCue', { cueId: row.cueId }, true); },
      onToggleAb: () => { toggleAbLoop(); draw(); }, onRate: rate => void send('setRate', { rate }),
      onVolume: () => { const menu=view.querySelector('.pw-tools');menu.open=true;view.querySelector('.pw-runtime-volume')?.focus(); },
      onFullscreen: () => document.getElementById('fullscreenBtn')?.click(),
      onSubtitleMode: mode => setSubtitleMode(mode === 'secondary' ? 'translation' : mode),
      onSelection: value => { selection = value; capture(); draw(); },
      onScope: value => { scope = value; capture(); draw(); }, onSwitchScope: () => { scope = 'selection'; capture(); draw(); },
      onAsk: () => { if (!evidence?.ok) return; const frozen = structuredClone(evidence.envelope); setTab('assistant'); void aiChatSend(text(`Seçili ifadeyi açıkla: ${frozen.selectedText}`, `Explain this selection: ${frozen.selectedText}`), null, aiSourceScope(), { playerEvidence: frozen }); },
      onCopy: value => void window.api.copyText(value.text),
      onSave: value => { const i = source.cues.findIndex(c => c.id === value.cueId); if (i >= 0) void saveQuote(source, i, snap); },
      onDictionary: value => { selection = value; player.selectedWord={word:value.text,cueIndex:source.cues.findIndex(c=>c.id===value.cueId),source:'source'};lookupSelectedWord(); },
      onOpenQueued: item => { const delta = Number(item.itemId) - player.playlistIndex; void playPlaylistDelta(delta); }
    });
    if (stage.parentNode !== result.stageSlot) result.stageSlot.append(stage);
    stage.querySelector('.pw-podcast-cover')?.remove();
    if(audio){const cover=document.createElement('div');cover.className='pw-podcast-cover';cover.append(PlayerUiKit.cover(audio.title,audio.entryId),PlayerUiKit.h('strong',{text:audio.title}));stage.append(cover);}
    if(audio?.transcriptState==='untimed'&&tab==='transcript'){
      const list=view.querySelector('.pw-transcript'),body=document.createElement('p'),more=document.createElement('button');body.className='pw-runtime-untimed';more.type='button';let loaded=0;
      const append=()=>{const chunk=audio.transcriptText.slice(loaded,loaded+50000);loaded+=chunk.length;body.append(document.createTextNode(chunk));more.textContent=text('Daha fazla metin','More text');more.hidden=loaded>=audio.transcriptText.length;};more.onclick=append;list.append(body,more);append();
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
    for(const [id,tr,en] of [['playerMediaCenter','Oynatma, sahneler ve kaynaklar','Playback, scenes and sources'],['playerMore','Diğer oynatma işlemleri','More playback actions']]){const button=document.createElement('button');button.type='button';button.className='pw-btn';button.textContent=text(tr,en);button.onclick=()=>{if(id==='playerMore'){advanced.open=true;document.getElementById('playerMediaCenter')?.click()}else document.getElementById(id)?.click()};toolsMenu.append(button);}
    const healthButton=document.createElement('button');
    healthButton.type='button';healthButton.className='pw-btn';
    healthButton.textContent=text('Oynatma sağlığı','Playback health');
    healthButton.onclick=()=>window.WhisperV3.open('health');
    toolsMenu.append(healthButton);
    const controls = view.querySelector('.pw-controls');
    if (controls && view.clientWidth < 1280) [...controls.children].filter(x => x.matches('button') && /A–B|A.B loop|Satırı tekrarla|Replay line/.test(x.getAttribute('aria-label') || '')).forEach(button => {
      const label = document.createElement('span'); label.textContent = button.getAttribute('aria-label'); button.append(label); button.classList.add('pw-runtime-tool'); view.querySelector('.pw-tools__menu').append(button);
    });
    summary.textContent = text('İleri araçlar ve altyazı işlemleri', 'Advanced tools and subtitle actions');
    const key = `${snap.mediaKey}:${snap.generation}`;
    view.querySelectorAll('.pw-controls button, .pw-controls input, .pw-controls select').forEach(node => node.dataset.owner = key);
  }
  function mount() {
    mounted = true; host.hidden = false; layer.classList.add('player-workspace-v3');
    advanced.append(legacySide);
    bridge = PlayerWorkspaceModel.createPlayerWorkspaceBridge({ readSnapshot: snapshot, executeExisting: execute, resolveSourceRole: sourceRole });
    structural = ''; rowStamp = '';
  }
  function unmount() {
    if (!mounted) return;
    restoreAssistant(); home.after(stage); document.getElementById('sideResizer').after(legacySide);
    bridge?.dispose(); bridge = null; mounted = false; host.hidden = true; layer.classList.remove('player-workspace-v3');
    view.replaceChildren(); structural = ''; owner = '';
  }
  function refresh(force = false) {
    const eligible = player.workspaceMode === 'player' && !layer.classList.contains('hidden') && !!player.mediaKey && !!video.getAttribute('src');
    if (!eligible) { unmount(); return; }
    if (!mounted) mount();
    const nextOwner = `${player.mediaKey}:${player.generation}`;
    if (nextOwner !== owner) { owner = nextOwner; query = ''; selection = null; evidence = null; page = 0; tab = 'transcript'; follow = true; }
    const [source, secondary] = tracks(); const stamp = `${owner}:${source.id}:${source.revision}:${source.offsetSeconds}:${secondary.id}:${secondary.revision}:${secondary.offsetSeconds}`;
    if (rowStamp !== stamp) { rowStamp = stamp; rows = PlayerTranscriptModel.buildTranscriptRows({ sourceTrack: source, secondaryTrack: secondary, mediaKey: player.mediaKey, generation: player.generation }); indexedRows=rows.map(row=>({start:row.videoStart,end:row.videoEnd,text:row.sourceText+'\n'+row.secondaryText})); if (selection) { selection = null; evidence = null; } }
    const key = `${stamp}:${locale()}:${video.paused}:${video.duration}:${video.playbackRate}:${currentSubtitleMode()}:${player.abA}:${player.abB}:${document.getElementById('playerTitle')?.textContent}`;
    if (force || structural !== key) { structural = key; draw(); }
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
  const pulse = setInterval(() => { if (document.hidden) return; const now = performance.now(); if (now - lastRefresh >= 240) { lastRefresh = now; refresh(); } }, 250);
  window.addEventListener('resize', () => { if (mounted) draw(); });
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
    return envelope.mediaKey===snap.mediaKey&&envelope.generation===snap.generation&&envelope.sourceTrackId===source.id&&envelope.sourceRevision===source.revision&&(!envelope.secondaryTrackId||(envelope.secondaryTrackId===secondary.id&&envelope.secondaryRevision===secondary.revision));
  }
  function serializeEvidence(envelope) {
    if(!acceptEvidence(envelope))return null;
    return {scope:envelope.scope==='whole'?'full':envelope.scope,position:envelope.scopeEnd,totalCues:rows.length,eligibleCues:envelope.evidence.length,coverage:'selection',limitations:envelope.limitations,
      evidence:envelope.evidence.map((entry,index)=>({id:'T'+(index+1),zaman:PlayerUiKit.formatClock(entry.videoStart),baslangic:entry.videoStart,bitis:entry.videoEnd,metin:entry.source,ceviri:entry.secondary||''})),
      playerAnchor:{mediaKey:envelope.mediaKey,generation:envelope.generation,sourceTrackId:envelope.sourceTrackId,sourceRevision:envelope.sourceRevision}};
  }
  window.PlayerWorkspaceIntegration = Object.freeze({ refresh, snapshot, sourceRole, freezeWatchQuestion, watchQuestionIsCurrent, acceptEvidence, serializeEvidence, get bridge() { return bridge; }, evidence: () => evidence?.envelope || null });
  refresh();
})();
