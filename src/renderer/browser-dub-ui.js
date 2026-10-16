(() => {
  'use strict';
  const byId = id => document.getElementById(id);
  const audio = byId('browserDubAudio'), input = byId('browserDubFile');
  const add = byId('browserDubAdd'), strip = byId('browserDubStrip');
  if (!audio || !input || !add) return;
  const video = byId('playerVideo');
  const context = () => player.workspaceMode === 'player' ? ({
    mode: 'player', tabId: 'player-video', mediaKey: player.mediaKey,
    priorMuted: video.muted, playbackRate: video.playbackRate,
    currentTime: video.currentTime, backgroundSource: player.localPath || '',
    hasMedia: !!(video.currentSrc || video.getAttribute('src')),
    visible: !byId('playerLayer').classList.contains('hidden'),
  }) : ({ mode: player.workspaceMode, tabId: player.browserActiveTabId,
    mediaKey: player.mediaKey, generation: browserTabState()?.generation,
    mediaId: browserTabState()?.mediaId || '',
    subtitleRange: player.browserTracks.find(track => track.id === player.browserLoadedTrackId)?.clipRange || currentBrowserWhisperRange(),
    priorMuted: !!browserTabState()?.tabMuted,
    hasMedia: !!player.browserMediaSeen,
    playbackRate: player.browserRate || 1, currentTime: player.browserTime,
    visible: !byId('playerLayer').classList.contains('hidden') });
  const notify = message => player.workspaceMode === 'player'
    ? osd(message) : setBrowserSignal(message, false, { priority: 90, holdMs: 7000 });
  const controller = new window.BrowserDubAudio({ audio, context,
    backgroundAudio: byId('browserDubBackground'),
    mute: (id, muted) => {
      if (id !== 'player-video') return window.api.muteBrowserTab(id, muted);
      video.muted = muted; return { ok: true };
    }, error: notify,
    setRate: request => {
      if (request.tabId !== 'player-video') return window.api.setDubVideoRate(request);
      video.playbackRate = request.rate;
      return { ok: true, media: { currentTime: video.currentTime, playbackRate: video.playbackRate } };
    },
    changed: (s, message) => {
      strip.classList.toggle('hidden', !s);
      byId('browserDubName').textContent = s?.name || '';
      byId('browserDubStatus').textContent = message;
      byId('browserDubBackgroundControls').classList.toggle('hidden', !s?.background);
      add.classList.toggle('active', !!s);
      add.setAttribute('aria-pressed', String(!!s));
      byId('playerDubAdd')?.classList.toggle('active', !!s);
      scheduleBrowserBounds();
    } });
  let chosenContext = null;
  function chooseAudio() {
    byId('playerMore').open = false;
    const c = context();
    if (!c.tabId || !c.hasMedia) {
      notify('Ses eklemek için önce bir video açın.'); return;
    }
    chosenContext = c; input.value = ''; input.click();
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
        || c.generation !== current.generation || current.mode !== c.mode || !current.visible) return;
    add.disabled = true;
    try {
      if (await controller.attach(file, { ...c, priorMuted: current.priorMuted })) {
        audio.volume = Number(byId('browserDubVolume').value);
        byId('browserDubOffset').value = '0';
        if (c.mode === 'browser') controller.update({ currentTime: player.browserTime, paused: player.browserPaused,
          playbackRate: player.browserRate, adPlaying: player.browserAdPlaying });
        updateLocal();
      }
    } finally { add.disabled = false; }
  });
  byId('browserDubRemove').addEventListener('click', () => void controller.remove());
  byId('browserDubVolume').addEventListener('input', e => { audio.volume = Number(e.target.value); });
  byId('browserDubBackgroundVolume').addEventListener('input', e => { byId('browserDubBackground').volume=Number(e.target.value); });
  byId('browserDubBackground').volume=Number(byId('browserDubBackgroundVolume').value);
  byId('browserDubOffset').addEventListener('input', e => {
    controller.offset = Math.max(-60, Math.min(60, Number(e.target.value) || 0)); controller.tick();
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
    stop: () => void controller.remove(), checkContext: () => controller.tick(),
    context,
    setBaseRate: rate => controller.setBaseRate(rate),
    attachGenerated: async (file, expected) => {
      const c = context();
      if (c.tabId !== expected.tabId || c.mediaKey !== expected.mediaKey || c.generation !== expected.generation
          || c.mode !== expected.mode || !c.visible || !c.hasMedia) return false;
      if (!await controller.attach(file, c)) return false;
      if (c.mode === 'browser') controller.update({ currentTime: player.browserTime, paused: player.browserPaused,
        playbackRate: player.browserRate, adPlaying: player.browserAdPlaying });
      updateLocal();
      return true;
    },
  };
  window.addEventListener('beforeunload', () => { audio.pause(); void controller.remove(); });
})();
