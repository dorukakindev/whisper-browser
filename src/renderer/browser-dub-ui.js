(() => {
  'use strict';
  const byId = id => document.getElementById(id);
  const audio = byId('browserDubAudio'), input = byId('browserDubFile');
  const add = byId('browserDubAdd'), strip = byId('browserDubStrip');
  if (!audio || !input || !add) return;
  const context = () => ({ mode: player.workspaceMode, tabId: player.browserActiveTabId,
    mediaKey: player.mediaKey, generation: browserTabState()?.generation,
    priorMuted: !!browserTabState()?.tabMuted,
    visible: !byId('playerLayer').classList.contains('hidden') });
  const notify = message => setBrowserSignal(message, false, { priority: 90, holdMs: 7000 });
  const controller = new window.BrowserDubAudio({ audio, context,
    mute: (id, muted) => window.api.muteBrowserTab(id, muted), error: notify,
    changed: (s, message) => {
      strip.classList.toggle('hidden', !s);
      byId('browserDubName').textContent = s?.name || '';
      byId('browserDubStatus').textContent = message;
      add.classList.toggle('active', !!s);
      add.setAttribute('aria-pressed', String(!!s));
      scheduleBrowserBounds();
    } });
  let chosenContext = null;
  add.addEventListener('click', () => {
    const c = context();
    if (c.mode !== 'browser' || !c.tabId || !player.browserMediaSeen) {
      notify('Dublaj için önce browser videosunu açın.'); return;
    }
    chosenContext = c; input.value = ''; input.click();
  });
  input.addEventListener('change', async () => {
    const c = chosenContext, current = context(), file = input.files?.[0];
    if (!file || !c || c.tabId !== current.tabId || c.mediaKey !== current.mediaKey
        || c.generation !== current.generation || current.mode !== 'browser') return;
    add.disabled = true;
    try {
      if (await controller.attach(file, { ...c, priorMuted: current.priorMuted })) {
        audio.volume = Number(byId('browserDubVolume').value);
        byId('browserDubOffset').value = '0';
        controller.update({ currentTime: player.browserTime, paused: player.browserPaused,
          playbackRate: player.browserRate, adPlaying: player.browserAdPlaying });
      }
    } finally { add.disabled = false; }
  });
  byId('browserDubRemove').addEventListener('click', () => void controller.remove());
  byId('browserDubVolume').addEventListener('input', e => { audio.volume = Number(e.target.value); });
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
    if (event.type === 'tab-audio' && event.tabMuted === false && s.muted) void controller.remove();
  });
  window.BrowserDubAudioUI = { stop: () => void controller.remove(), checkContext: () => controller.tick() };
  window.addEventListener('beforeunload', () => { audio.pause(); void controller.remove(); });
})();
