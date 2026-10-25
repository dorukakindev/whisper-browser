(() => {
  'use strict';
  const byId = id => document.getElementById(id);
  const audio = byId('browserDubAudio'), input = byId('browserDubFile');
  const add = byId('browserDubAdd'), strip = byId('browserDubStrip');
  if (!audio || !input || !add) return;
  const video = byId('playerVideo');
  const remembered = new Map();
  function remember(value) {
    remembered.set(player.mediaKey, value);
    if (remembered.size > 100) remembered.delete(remembered.keys().next().value);
    document.dispatchEvent(new CustomEvent('media-playback-preferences-changed'));
  }
  function snapshot() {
    if (controller.session?.playbackAsset) {
      const value = { ...controller.session.playbackAsset, offset: controller.offset, mix: controller.session.mix };
      remembered.set(controller.session.mediaKey, value); return value;
    }
    return remembered.get(player.mediaKey);
  }
  const context = () => player.workspaceMode === 'player' ? ({
    mode: 'player', tabId: 'player-video', mediaKey: player.mediaKey,
    source: player.localPath || player.mediaKey || '',
    generation: player.generation,
    priorMuted: video.muted, playbackRate: video.playbackRate,
    currentTime: video.currentTime, backgroundSource: player.localPath || '',
    hasMedia: !!(video.currentSrc || video.getAttribute('src')),
    visible: !byId('playerLayer').classList.contains('hidden'),
  }) : ({ mode: player.workspaceMode, tabId: player.browserActiveTabId,
    mediaKey: player.mediaKey, source: player.browserPageUrl || player.mediaKey || '', generation: browserTabState()?.generation,
    mediaId: browserTabState()?.mediaId || '',
    subtitleRange: player.browserTracks.find(track => track.id === player.browserLoadedTrackId)?.clipRange || currentBrowserWhisperRange(),
    priorMuted: !!browserTabState()?.tabMuted,
    hasMedia: !!player.browserMediaSeen,
    playbackRate: player.browserRate || 1, currentTime: player.browserTime,
    visible: !byId('playerLayer').classList.contains('hidden') });
  const notify = message => player.workspaceMode === 'player'
    ? osd(message) : setBrowserSignal(message, false, { priority: 90, holdMs: 7000 });
  const controller = new window.BrowserDubAudio({ audio, context,
    backgroundAudio: byId('browserDubBackground'), musicAudio: byId('browserDubMusic'), ambienceAudio: byId('browserDubAmbience'),
    mute: (id, muted, expected) => {
      if (id !== 'player-video') return window.api.muteBrowserTab(id, muted);
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
    if (!s || event.tabId !== s.tabId) return;
    if ((event.type === 'navigation' && event.loading) || event.type === 'closed') {
      void controller.remove(); return;
    }
    if (event.generation !== undefined && event.generation !== s.generation) return;
    if (event.type === 'media' && event.media) controller.update(event.media);
    if (event.type === 'tab-audio' && event.tabMuted === false && s.desiredMuted) void controller.remove();
  });
  window.BrowserDubAudioUI = {
    snapshot,
    originalPlayback: () => controller.matches() ? { muted: controller.session.priorMuted, speed: controller.session.baseRate } : null,
    restore: async (saved, expectedKey) => {
      if (!saved || !['local', 'generated'].includes(saved.kind) || typeof saved.id !== 'string') return false;
      remembered.set(expectedKey, saved);
      const expected = context();
      if (expected.mediaKey !== expectedKey || !expected.visible || !expected.hasMedia) return false;
      const result = await Promise.resolve().then(() => saved.kind === 'local' ? window.api.restorePlaybackAudio(saved.id) : window.api.latestDub(saved.id)).catch(() => null);
      if (!result?.ok || !result.output || result.output.syncInvalid) {
        notify(window.UiLocale?.get?.()==='tr' ? 'Kayıtlı dublaj bulunamadı; özgün ses korunuyor.' : 'Saved dub unavailable; original audio is preserved.'); return false;
      }
      const file = result.output;
      if (saved.kind === 'generated') file.rows = file.quality?.groups || [];
      if (!await window.BrowserDubAudioUI.attachGenerated({ ...file, mix: saved.mix }, expected)) return false;
      if (!controller.matches() || controller.session?.generation !== expected.generation || controller.session?.url !== file.url) return false;
      controller.session.playbackAsset = { kind: saved.kind, id: saved.id };
      controller.offset = Math.max(-60, Math.min(60, Number(saved.offset) || 0));
      byId('browserDubOffset').value = controller.offset;
      remember(snapshot()); controller.tick(); return true;
    },
    stop: () => { if (controller.session) remember(snapshot()); return controller.remove(); }, checkContext: () => controller.tick(),
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
      if (c.tabId !== expected.tabId || c.mediaKey !== expected.mediaKey || c.generation !== expected.generation
          || (c.mediaId || '') !== (expected.mediaId || '') || c.mode !== expected.mode || !c.visible || !c.hasMedia) return false;
      if (!await controller.attach(file, c)) return false;
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
