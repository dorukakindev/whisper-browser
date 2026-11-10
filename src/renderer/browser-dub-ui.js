(() => {
  'use strict';
  const byId = id => document.getElementById(id);
  const audio = byId('browserDubAudio'), input = byId('browserDubFile');
  const add = byId('browserDubAdd'), strip = byId('browserDubStrip');
  if (!audio || !input || !add) return;
  const video = byId('playerVideo');
  const remembered = new Map();
  const tabDubs = new Map();
  const sameSource = (a,b) => a.mode===b.mode && a.tabId===b.tabId && a.mediaKey===b.mediaKey
    && a.generation===b.generation && (a.mediaId||'')===(b.mediaId||'');
  const sameVerifiedMedia = (a,b) => a.tabId===b.tabId && a.source===b.source
    && !!a.sourceProof && a.sourceProof===b.sourceProof;
  // The probe token changes on element, source or document replacement.
  // It can prove an in-memory return, but is never saved in the profile.
  const sameLiveMedia = (a,b) => a.tabId===b.tabId && a.source===b.source
    && !!a.mediaToken && a.mediaToken===b.mediaToken;
  const matchesTabEntry = (owner,active) => owner.sourceProof
    ? sameVerifiedMedia(owner,active)
    : sameLiveMedia(owner,active);
  const tabVisit = owner => `${player.generation}:${owner.generation}`;
  let attaching = 0;
  let audioPreferenceRevision = 0;
  function remember(value) {
    remembered.set(player.mediaKey, value);
    if (remembered.size > 100) remembered.delete(remembered.keys().next().value);
    document.dispatchEvent(new CustomEvent('media-playback-preferences-changed'));
  }
  function snapshot() {
    if (controller.session?.playbackAsset && controller.owns()) {
      const s = controller.session;
      const value = { ...s.playbackAsset, offset: controller.offset, mix: s.mix,
        ...(s.sourceProof ? {sourceProof:s.sourceProof} : {}) };
      if (s.mode === 'browser' && !s.returnDisabled && s.mediaId) {
        const previous = tabDubs.get(s.tabId);
        if (previous && sameSource(previous.owner,s)) previous.saved = value;
        else tabDubs.set(s.tabId,{owner:{mode:s.mode,tabId:s.tabId,mediaKey:s.mediaKey,generation:s.generation,mediaId:s.mediaId,source:s.source,sourceProof:s.sourceProof,mediaToken:s.mediaToken},saved:value,visit:tabVisit(s)});
        if (tabDubs.size > 100) tabDubs.delete(tabDubs.keys().next().value);
      }
      remembered.set(s.mediaKey, value); return value;
    }
    const active = context();
    if (active.mode === 'browser') {
      const entry = tabDubs.get(active.tabId);
      return entry && (sameSource(entry.owner,active) || matchesTabEntry(entry.owner,active)) ? entry.saved : null;
    }
    return remembered.get(player.mediaKey);
  }
  function selectedLocalSubtitleRange() {
    const secondary=player.sub2Role==='translation'&&player.sub2Path;
    const saved=secondary?player.subtitleContext2:player.subtitleContext;
    const selected=secondary?player.sub2Path:player.subPath;
    const canonical=value=>String(value||'').replace(/\\/g,'/').replace(/^([a-z]):/i,(_,drive)=>drive.toLowerCase()+':');
    return saved&&selected&&canonical(saved.subtitlePath)===canonical(selected)&&canonical(saved.mediaPath)===canonical(player.localPath)?saved.range:null;
  }
  function selectedBrowserSubtitle() {
    const secondary=player.sub2Role==='translation'&&!!player.sub2Path;
    const path=secondary?player.sub2Path:player.subPath;
    const id=secondary?player.browserLoadedTrackId2:player.browserLoadedTrackId;
    const role=secondary?'translation':player.subRole;
    if (!path || player.browserAdPlaying) return null;
    return (player.browserTracks||[]).find(track=>track.path===path && (!id || track.id===id)
      && (!role || track.role===role) && !track.sourceMismatch
      && (!track.mediaToken || track.mediaToken===currentBrowserWhisperAudio()?.mediaToken)) || null;
  }
  function selectedSubtitleRange(selected) {
    // A loaded full-video track explicitly has no clip. A pending Whisper
    // selection must not silently narrow that already prepared subtitle.
    return selected ? selected.clipRange || null : (player.subPath||player.sub2Path ? null : currentBrowserWhisperRange());
  }
  const context = () => player.workspaceMode === 'player' ? ({
    mode: 'player', tabId: 'player-video', mediaKey: player.mediaKey,
    source: player.localPath || player.mediaKey || '',
    generation: player.generation, subtitleRange: selectedLocalSubtitleRange(),
    priorMuted: video.muted, volume: video.volume, playbackRate: video.playbackRate,
    currentTime: video.currentTime, duration:video.duration, backgroundSource: player.localPath || '',
    hasMedia: !!(video.currentSrc || video.getAttribute('src')),
    visible: !byId('playerLayer').classList.contains('hidden'),
  }) : (()=>{const subtitleTrack=selectedBrowserSubtitle();return { mode: player.workspaceMode, tabId: player.browserActiveTabId,
    mediaKey: player.mediaKey, source: player.browserPageUrl || player.mediaKey || '', generation: browserTabState()?.generation,
    mediaId: browserTabState()?.mediaId || '',
    mediaToken: browserTabState()?.browserClockSample?.generation === player.generation
      ? browserTabState().browserClockSample.mediaToken || '' : '',
    sourceProof: browserTabState()?.browserClockSample?.generation === player.generation
      ? browserTabState().browserClockSample.dubSourceIdentity || '' : '',
    subtitleRange: selectedSubtitleRange(subtitleTrack), subtitleTrack,
    priorMuted: !!browserTabState()?.tabMuted,
    hasMedia: !!player.browserMediaSeen,
    playbackRate: player.browserRate || 1, currentTime: player.browserTime, duration:player.browserDuration,
    visible: !byId('playerLayer').classList.contains('hidden') };})();
  const notify = message => player.workspaceMode === 'player'
    ? osd(message) : setBrowserSignal(message, false, { priority: 90, holdMs: 7000 });
  const savedDubUnavailable = () => notify(window.UiLocale?.get?.()==='tr'
    ? 'Kayıtlı dublaj açılamadı; özgün ses korunuyor.' : 'Saved dub unavailable; original audio is preserved.');
  function canOpenSavedAudio(url) {
    if (!url) return Promise.resolve(false);
    const probe = new Audio();
    return new Promise(resolve => {
      const done = ok => {
        clearTimeout(timer);
        probe.onloadedmetadata = probe.onerror = null;
        probe.removeAttribute('src');
        probe.load();
        resolve(ok);
      };
      const timer = setTimeout(() => done(false),4000);
      probe.onloadedmetadata = () => done(Number.isFinite(probe.duration) && probe.duration > 0);
      probe.onerror = () => done(false);
      probe.preload = 'metadata';
      probe.src = url;
    });
  }
  const controller = new window.BrowserDubAudio({ audio, context,
    backgroundAudio: byId('browserDubBackground'), musicAudio: byId('browserDubMusic'), ambienceAudio: byId('browserDubAmbience'),
    mute: (id, muted, expected, mode) => {
      if (id !== 'player-video') return window.api.muteBrowserTab(id, muted, expected ? {owner:expected.muteOwner,generation:expected.generation,mediaId:expected.mediaId||'',mode} : undefined);
      if (expected && (player.mediaKey !== expected.mediaKey || player.generation !== expected.generation)) return { ok: true, skipped: true };
      video.muted = muted; return { ok: true };
    }, error: notify,
    setRate: request => {
      if (request.tabId !== 'player-video') return window.api.setDubVideoRate(request);
      if (player.mediaKey !== request.mediaKey || player.generation !== request.generation) return { ok: true, skipped: true };
      video.playbackRate = request.rate;
      return { ok: true, media: { currentTime: video.currentTime, playbackRate: video.playbackRate } };
    },
    changed: (s, message) => {
      window.dispatchEvent(new CustomEvent('dub-master:changed'));
      strip.classList.toggle('hidden', !s);
      byId('browserDubName').textContent = s?.name || '';
      byId('browserDubStatus').textContent = message;
      byId('browserDubBackgroundControls').classList.toggle('hidden', !s?.background);
      byId('browserDubMusicControls')?.classList.toggle('hidden', !s?.layers?.music);
      byId('browserDubAmbienceControls')?.classList.toggle('hidden', !s?.layers?.ambience);
      add.classList.toggle('active', !!s);
      add.setAttribute('aria-pressed', String(!!s));
      byId('playerDubAdd')?.classList.toggle('active', !!s);
      scheduleBrowserBounds();
    } });
  let chosenContext = null;
  let choosingAudio = false;
  async function chooseAudio() {
    if (choosingAudio) return;
    byId('playerMore').open = false;
    const c = context();
    if (!c.tabId || !c.hasMedia) {
      notify('Ses eklemek için önce bir video açın.'); return;
    }
    if (!window.api.choosePlaybackAudio) { chosenContext = c; input.value = ''; input.click(); return; }
    choosingAudio = true; add.disabled = true;
    if (byId('playerDubAdd')) byId('playerDubAdd').disabled = true;
    try {
      const result = await window.api.choosePlaybackAudio();
      if (result?.canceled) return;
      if (!result?.ok || !result.output) { notify(result?.error || 'Ses açılamadı.'); return; }
      await window.BrowserDubAudioUI.attachGenerated(result.output, c);
    } catch (error) { notify(error.message || 'Ses açılamadı.'); }
    finally { choosingAudio = false; add.disabled = false; if (byId('playerDubAdd')) byId('playerDubAdd').disabled = false; }
  }
  add.addEventListener('click', chooseAudio);
  byId('playerDubAdd')?.addEventListener('click', chooseAudio);
  function updateLocal() {
    if (controller.session?.mode !== 'player') return;
    controller.update({ currentTime: video.currentTime, paused: video.paused,
      ended: video.ended, playbackRate: video.playbackRate, readyState: video.readyState });
  }
  for (const event of ['play','pause','seeking','seeked','timeupdate','ratechange','waiting','playing','ended','loadedmetadata']) {
    video.addEventListener(event, updateLocal);
  }
  byId('playerSpeed')?.addEventListener('change', event => {
    if (controller.session?.mode === 'player') controller.setBaseRate(Number(event.target.value));
  });
  input.addEventListener('change', async () => {
    const c = chosenContext, current = context(), file = input.files?.[0];
    if (!file || !c || c.tabId !== current.tabId || c.mediaKey !== current.mediaKey
        || c.generation !== current.generation || (c.mediaId || '') !== (current.mediaId || '') || current.mode !== c.mode || !current.visible) return;
    add.disabled = true;
    try {
      if (await controller.attach(file, { ...c, priorMuted: current.priorMuted })) {
        controller.setMix({voice:Number(byId('browserDubVolume').value),
          background:Number(byId('browserDubBackgroundVolume').value),
          music:Number(byId('browserDubMusicVolume').value),ambience:Number(byId('browserDubAmbienceVolume').value),
          duck:byId('browserDubDuck').checked});
        byId('browserDubOffset').value = '0';
        if (c.mode === 'browser') controller.update({ currentTime: player.browserTime, paused: player.browserPaused,
          playbackRate: player.browserRate, adPlaying: player.browserAdPlaying });
        updateLocal();
      }
    } finally { add.disabled = false; }
  });
  const changeMix=value=>{controller.setMix(value);if(controller.session){remember(snapshot());window.dispatchEvent(new CustomEvent('dub-mix:changed',{detail:{url:controller.session.url,mix:controller.session.mix}}));}};
  byId('browserDubRemove').addEventListener('click', () => {
    const active = context();
    if (active.mode === 'browser') tabDubs.delete(active.tabId);
    if (controller.session) controller.session.playbackAsset = null;
    remember(null); void controller.remove();
  });
  byId('browserDubVolume').addEventListener('input', e => { changeMix({voice:Number(e.target.value)}); });
  byId('browserDubBackgroundVolume').addEventListener('input', e => { changeMix({background:Number(e.target.value)}); });
  byId('browserDubMusicVolume')?.addEventListener('input',e=>changeMix({music:Number(e.target.value)}));
  byId('browserDubAmbienceVolume')?.addEventListener('input',e=>changeMix({ambience:Number(e.target.value)}));
  byId('browserDubDuck')?.addEventListener('change',e=>changeMix({duck:e.target.checked}));
  byId('browserDubBackground').volume=Number(byId('browserDubBackgroundVolume').value);
  byId('browserDubOffset').addEventListener('input', e => {
    controller.offset = Math.max(-60, Math.min(60, Number(e.target.value) || 0)); controller.tick();
    if (controller.session) remember(snapshot());
  });
  window.api.onBrowserEvent?.(event => {
    const s = controller.session;
    const navigation = event.type === 'closed' || (event.type === 'navigation' && event.loading);
    const manual = event.type === 'tab-audio' && event.manual;
    if (manual) audioPreferenceRevision++;
    const entry = tabDubs.get(event.tabId);
    if ((event.type === 'closed' || manual) && entry && (event.generation === undefined || event.generation >= entry.owner.generation)) {
      tabDubs.delete(event.tabId);
      if (manual) remembered.set(entry.owner.mediaKey,null);
    }
    if (!s || event.tabId !== s.tabId) return;
    if (navigation) {
      void controller.remove(); return;
    }
    if (event.generation !== undefined && event.generation !== s.generation) return;
    // Buffering can release our mute just as playback resumes. Its
    // acknowledgement is not a user request to remove the dub.
    if (manual) {
      s.returnDisabled = true;
      if (event.tabMuted === false) {
        s.playbackAsset = null;
        remember(null);
        void controller.remove();
        return;
      }
    }
    if (event.type === 'media' && event.media) controller.update(event.media);
  });
  window.BrowserDubAudioUI = {
    master: () => controller.session?.mode==='player'&&controller.matches() ? {...controller.session.master} : null,
    setMaster: value => {const changed=controller.setMaster(value);if(changed){if(Number.isFinite(value.volume))video.volume=controller.session.master.volume;window.dispatchEvent(new CustomEvent('dub-master:changed'));document.dispatchEvent(new CustomEvent('media-playback-preferences-changed'));}return changed;},
    snapshot,
    originalPlayback: () => controller.matches() ? { muted: controller.session.priorMuted, speed: controller.session.baseRate, adaptive: !!controller.session.sync } : null,
    restore: async (saved, expectedKey, stillWanted = () => true) => {
      if (!saved || !['local', 'generated'].includes(saved.kind) || typeof saved.id !== 'string') return false;
      const expected = context();
      if (expected.mediaKey !== expectedKey || !expected.visible || !expected.hasMedia) return false;
      const result = await Promise.resolve().then(() => saved.kind === 'local' ? window.api.restorePlaybackAudio(saved.id) : window.api.latestDub(saved.id)).catch(() => null);
      if (!stillWanted() || !sameSource(context(),expected)) return false;
      if (!result?.ok || !result.output || result.output.syncInvalid) {
        savedDubUnavailable(); return false;
      }
      const file = result.output;
      if (saved.kind === 'local') {
        const readable = await canOpenSavedAudio(file.url);
        if (!stillWanted() || !sameSource(context(),expected)) return false;
        if (!readable) { savedDubUnavailable(); return false; }
      }
      if (saved.kind === 'generated') file.rows = file.quality?.groups || [];
      if (!await window.BrowserDubAudioUI.attachGenerated({ ...file, mix: saved.mix }, expected)) return false;
      if (!controller.matches() || controller.session?.generation !== expected.generation || controller.session?.url !== file.url) return false;
      controller.session.playbackAsset = { kind: saved.kind, id: saved.id };
      controller.offset = Math.max(-60, Math.min(60, Number(saved.offset) || 0));
      byId('browserDubOffset').value = controller.offset;
      remember(snapshot()); controller.tick(); return true;
    },
    restoreBrowserPreference: (saved,key) => {
      const expected = context(), intent = controller.intent, revision = audioPreferenceRevision;
      const stillWanted = () => {
        const active = context();
        return sameSource(expected,active) && !!saved.sourceProof && active.sourceProof === saved.sourceProof
          && !controller.session && !attaching && !choosingAudio && controller.intent === intent
          && audioPreferenceRevision === revision
          && ![...tabDubs.values()].some(entry => entry.owner.mediaKey===key || entry.owner.tabId===active.tabId);
      };
      return stillWanted() ? window.BrowserDubAudioUI.restore(saved,key,stillWanted) : false;
    },
    restoreReturningTab: (event) => {
      const expected = context();
      if (expected.mode !== 'browser' || expected.tabId !== event.tabId || expected.generation !== event.generation
          || !expected.visible || !expected.hasMedia || !expected.mediaId || event.media?.adPlaying
          || !(Number(event.media?.readyState) >= 3) || controller.session || attaching || choosingAudio) return;
      const entry = tabDubs.get(expected.tabId), visit = tabVisit(expected);
      if (!entry || entry.visit === visit) return;
      if (!matchesTabEntry(entry.owner,expected)) {
        if (expected.sourceProof || expected.mediaToken || expected.source !== entry.owner.source) tabDubs.delete(expected.tabId);
        return;
      }
      entry.visit = visit;
      const intent = controller.intent;
      const stillWanted = () => tabDubs.get(expected.tabId) === entry && tabVisit(context()) === visit
        && controller.intent === intent && !controller.session && !attaching && !choosingAudio && !player.browserAdPlaying
        && matchesTabEntry(entry.owner,context());
      void window.BrowserDubAudioUI.restore(entry.saved,expected.mediaKey,stillWanted);
    },
    stop: () => { if (controller.session) remember(snapshot()); return controller.remove(); },
    stopForSourceChange: () => {
      const session = controller.session;
      const restoreLocal = session?.mode === 'player' && controller.owns(session);
      if (session) remember(snapshot());
      const cleanup = controller.remove();
      // The next source reuses this element. Restore the old owner's controls
      // before its key or generation changes and async cleanup loses ownership.
      if (restoreLocal) {
        video.muted = session.priorMuted;
        if (session.sync) {
          video.playbackRate = session.baseRate;
          syncPlayerSpeedControl(session.baseRate);
        }
      }
      return cleanup;
    },
    suspend: () => controller.suspend(), checkContext: () => controller.tick(),
    context,
    seekSource: async (seconds, expected) => {
      const c=context();
      if(!Number.isFinite(seconds)||seconds<0||!c.hasMedia||!c.visible||!expected||c.mode!==expected.mode||c.tabId!==expected.tabId||c.mediaKey!==expected.mediaKey||c.generation!==expected.generation||(c.mediaId||'')!==(expected.mediaId||'')) return false;
      if(c.mode==='player'){video.currentTime=seconds;return true;}
      try { const r=await browserCommand('seek',seconds);return r?.ok!==false; }catch(_){return false;}
    },
    openProjectVideo: (file,subtitle) => {setWorkspaceMode('player',false);openPlayer({video:file,files:subtitle?[subtitle]:[]});},
    pauseSource: async expected => {
      const c=context();
      if(!expected||c.mode!==expected.mode||c.tabId!==expected.tabId||c.mediaKey!==expected.mediaKey||c.generation!==expected.generation||(c.mediaId||'')!==(expected.mediaId||''))return false;
      if(c.mode==='player'){video.pause();return true;}
      try{return (await browserCommand('pause'))?.ok!==false;}catch(_){return false;}
    },
    setMix: (mix,layers,expectedUrl) => {
      if(expectedUrl && controller.session?.url!==expectedUrl)return;
      controller.setMix(mix,layers);
      const s=controller.session;
      if(s){for(const [key,id] of Object.entries({voice:'browserDubVolume',background:'browserDubBackgroundVolume',music:'browserDubMusicVolume',ambience:'browserDubAmbienceVolume'}))if(byId(id))byId(id).value=s.mix[key];
        if(byId('browserDubDuck'))byId('browserDubDuck').checked=s.mix.duck;}
    },
    setBaseRate: rate => controller.setBaseRate(rate),
    attachGenerated: async (file, expected) => {
      const c = context();
      if (!sameSource(c,expected) || !c.visible || !c.hasMedia) return false;
      attaching++;
      const pending = controller.attach(file,c);
      const intent = controller.intent;
      try { if (!await pending) return false; }
      finally { attaching--; }
      if (controller.intent !== intent || !controller.matches()) return false;
      const id = file.id || (()=>{ try { return decodeURIComponent(new URL(file.url).pathname.split('/').pop()).replace(/\.wav$/i,''); } catch { return ''; } })();
      controller.session.playbackAsset = file.playbackAsset || (/^[a-zA-Z0-9-]{1,80}$/.test(id) && !file.playbackAsset ? { kind: 'generated', id } : null);
      window.BrowserDubAudioUI.setMix(file.mix || {});
      remember(controller.session.playbackAsset ? snapshot() : null);
      window.dispatchEvent(new CustomEvent('dub-audio:attached',{detail:{url:file.url,context:c}}));
      byId('browserDubOffset').value = '0';
      if (c.mode === 'browser') controller.update({ currentTime: player.browserTime, paused: player.browserPaused,
        playbackRate: player.browserRate, adPlaying: player.browserAdPlaying });
      updateLocal();
      return true;
    },
  };
  window.addEventListener('beforeunload', () => { audio.pause(); void controller.remove(); });
})();
