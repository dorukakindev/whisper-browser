function buildBrowserOverlayScript(payload, findCuesSource) {
  const encoded = JSON.stringify(payload || {}).replace(/[\u2028\u2029]/g, ' ');
  const finder = String(findCuesSource || '(() => [])');
  return `(() => {
    const nextState = ${encoded};
    const existing = window.__whisperBrowserOverlayController;
    if (existing && typeof existing.update === 'function') {
      existing.update(nextState);
      return true;
    }

    const findCues = ${finder};
    let state = nextState;
    let root = null;
    let media = null;
    let mediaDirty = true;
    let frameToken = 0;
    let frameKind = '';
    let resizeObserver = null;
    const mediaListeners = [];

    const ensureRoot = () => {
      const marked = [...document.querySelectorAll('[data-whisper-browser-overlay="true"]')];
      root = marked[0] || document.getElementById('__whisper_browser_subtitles');
      for (const duplicate of marked.slice(1)) duplicate.remove();
      if (!root) {
        root = document.createElement('div');
        root.id = '__whisper_browser_subtitles';
      }
      root.dataset.whisperBrowserOverlay = 'true';
      root.style.cssText = 'position:fixed;z-index:2147483646;pointer-events:none;text-align:center;display:flex;flex-direction:column;align-items:center;gap:6px;font-family:Inter,Segoe UI,sans-serif;text-shadow:0 2px 5px #000,0 0 2px #000;';
      let source = root.querySelector('[data-kind="source"]');
      let translation = root.querySelector('[data-kind="translation"]');
      if (!source) { source = document.createElement('div'); source.dataset.kind = 'source'; root.appendChild(source); }
      if (!translation) { translation = document.createElement('div'); translation.dataset.kind = 'translation'; root.appendChild(translation); }
      const host = document.fullscreenElement || document.documentElement;
      if (root.parentNode !== host) host.appendChild(root);
      return root;
    };

    const cancelFrame = () => {
      if (!frameToken) return;
      if (frameKind === 'video' && media && typeof media.cancelVideoFrameCallback === 'function') {
        try { media.cancelVideoFrameCallback(frameToken); } catch (_) {}
      } else {
        cancelAnimationFrame(frameToken);
      }
      frameToken = 0;
      frameKind = '';
    };

    const stopWatchingMedia = () => {
      cancelFrame();
      while (mediaListeners.length) {
        const [target, type, listener] = mediaListeners.pop();
        try { target.removeEventListener(type, listener); } catch (_) {}
      }
      if (resizeObserver) resizeObserver.disconnect();
      resizeObserver = null;
    };

    const discoverMedia = () => {
      if (!mediaDirty && media && media.isConnected) return media;
      mediaDirty = false;
      const roots = [document];
      for (let index = 0; index < roots.length; index++) {
        for (const node of roots[index].querySelectorAll('*')) if (node.shadowRoot) roots.push(node.shadowRoot);
      }
      const candidates = roots.flatMap((scope) => [...scope.querySelectorAll('video,audio')]);
      const selected = candidates.sort((a, b) => {
        const area = (item) => Math.max(0, item.clientWidth * item.clientHeight);
        return area(b) - area(a) || Number(!b.paused) - Number(!a.paused)
          || (Number(b.duration) || 0) - (Number(a.duration) || 0);
      })[0] || null;
      if (selected === media) return media;
      stopWatchingMedia();
      media = selected;
      if (!media) return null;
      const redraw = () => render();
      for (const type of ['timeupdate', 'seeked', 'loadedmetadata', 'durationchange', 'play', 'pause', 'emptied']) {
        media.addEventListener(type, redraw, { passive: true });
        mediaListeners.push([media, type, redraw]);
      }
      if (typeof ResizeObserver === 'function') {
        resizeObserver = new ResizeObserver(redraw);
        resizeObserver.observe(media);
      }
      return media;
    };

    const queueFrame = () => {
      if (frameToken || document.hidden || state.mode === 'off' || !media || media.paused) return;
      const callback = () => {
        frameToken = 0;
        frameKind = '';
        render();
      };
      if (typeof media.requestVideoFrameCallback === 'function') {
        frameKind = 'video';
        frameToken = media.requestVideoFrameCallback(callback);
      } else {
        frameKind = 'raf';
        frameToken = requestAnimationFrame(callback);
      }
    };

    function render() {
      const box = ensureRoot();
      if (document.hidden || state.mode === 'off') {
        box.style.display = 'none';
        cancelFrame();
        return;
      }
      const activeMedia = discoverMedia();
      if (!activeMedia) {
        box.style.display = 'none';
        cancelFrame();
        return;
      }
      const rect = activeMedia.getBoundingClientRect();
      box.style.display = 'flex';
      box.style.left = Math.max(0, rect.left) + 'px';
      box.style.width = Math.max(0, rect.width) + 'px';
      box.style.top = Math.max(rect.top, rect.bottom - Math.max(96, rect.height * .17)) + 'px';
      const time = (Number(activeMedia.currentTime) || 0) - (Number(state.offset) || 0);
      const sourceCues = findCues(state.source || [], time);
      const translationCues = findCues(state.translation || [], time);
      const source = box.querySelector('[data-kind="source"]');
      const translation = box.querySelector('[data-kind="translation"]');
      source.textContent = sourceCues.length && (state.mode === 'source' || state.mode === 'both')
        ? sourceCues.map((cue) => cue.text).join('\\n') : '';
      translation.textContent = translationCues.length && (state.mode === 'translation' || state.mode === 'both')
        ? translationCues.map((cue) => cue.text).join('\\n') : '';
      source.style.cssText = 'max-width:88%;padding:3px 8px;border-radius:5px;background:rgba(5,7,10,.74);color:#f5f5f5;font-size:clamp(15px,2vw,25px);line-height:1.35;white-space:pre-line;';
      translation.style.cssText = 'max-width:88%;padding:4px 9px;border-radius:5px;background:rgba(5,7,10,.82);color:#e0ad5d;font-weight:650;font-size:clamp(16px,2.15vw,27px);line-height:1.35;white-space:pre-line;';
      source.style.display = source.textContent ? '' : 'none';
      translation.style.display = translation.textContent ? '' : 'none';
      queueFrame();
    }

    const mutationObserver = new MutationObserver(() => {
      mediaDirty = true;
      if (!document.hidden && state.mode !== 'off') render();
    });
    mutationObserver.observe(document, { childList: true, subtree: true });
    document.addEventListener('fullscreenchange', render);
    document.addEventListener('visibilitychange', render);
    window.addEventListener('scroll', render, { passive: true });
    window.addEventListener('resize', render, { passive: true });

    window.__whisperBrowserOverlayController = {
      update(value) {
        state = value || {};
        if (state.mode === 'off') cancelFrame();
        render();
      },
      diagnostics() {
        return { hasMedia: !!media, running: !!frameToken, hidden: document.hidden,
          mode: state.mode || 'off', observer: true };
      },
    };
    render();
    return true;
  })()`;
}

module.exports = { buildBrowserOverlayScript };
