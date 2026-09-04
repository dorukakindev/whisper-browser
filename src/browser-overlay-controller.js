const { compareBrowserMediaCandidates, browserMediaCandidateRank } = require('./browser-media-selection');

function buildBrowserOverlayScript(payload, findCuesSource) {
  const encoded = JSON.stringify(payload || {})
    .replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');
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
    let mutationFrame = 0;
    let resizeObserver = null;
    let drag = null;
    let dragFrame = 0;
    let appliedStyleKey = '';
    const mediaListeners = [];
    const mediaCandidates = new Set();
    const candidateListeners = new Map();
    let observedRoots = new WeakSet();
    const mutationObservers = [];
    ${browserMediaCandidateRank.toString()}
    const compareMedia = ${compareBrowserMediaCandidates.toString()};

    const bindDrag = (item) => {
      if (!item || item.dataset.whisperDragBound === 'true') return;
      item.dataset.whisperDragBound = 'true';
      item.title = 'Basılı tutup yukarı veya aşağı sürükleyin';
      item.style.pointerEvents = 'auto';
      item.style.cursor = 'grab';
      item.style.touchAction = 'none';
      item.style.userSelect = 'none';
      item.addEventListener('pointerdown', (event) => {
        if (!event.isTrusted || event.button !== 0) return;
        const activeMedia = discoverMedia();
        const measured = activeMedia?.getBoundingClientRect?.();
        const height = measured?.height > 2 ? measured.height : innerHeight;
        const current = Number(state.style?.bottomOffset);
        drag = {
          pointerId: event.pointerId, startY: event.clientY,
          startOffset: Number.isFinite(current) ? current : 8,
          bottomOffset: Number.isFinite(current) ? current : 8,
          height: Math.max(1, height), moved: false,
        };
        item.style.cursor = 'grabbing';
        try { item.setPointerCapture(event.pointerId); } catch (_) {}
        event.preventDefault();
        event.stopPropagation();
      });
      item.addEventListener('pointermove', (event) => {
        if (!event.isTrusted || !drag || drag.pointerId !== event.pointerId) return;
        const delta = drag.startY - event.clientY;
        if (Math.abs(delta) >= 3) drag.moved = true;
        drag.bottomOffset = Math.max(0, Math.min(75,
          drag.startOffset + delta / drag.height * 100));
        state.style = { ...(state.style || {}), bottomOffset: drag.bottomOffset };
        if (!dragFrame) {
          dragFrame = requestAnimationFrame(() => { dragFrame = 0; render(); });
        }
        event.preventDefault();
        event.stopPropagation();
      });
      const finishDrag = (event, canceled = false) => {
        if (!event.isTrusted || !drag || drag.pointerId !== event.pointerId) return;
        const { bottomOffset, startOffset, moved } = drag;
        drag = null;
        if (dragFrame) cancelAnimationFrame(dragFrame);
        dragFrame = 0;
        item.style.cursor = 'grab';
        try { item.releasePointerCapture(event.pointerId); } catch (_) {}
        if (canceled) {
          state.style = { ...(state.style || {}), bottomOffset: startOffset };
          render();
        } else if (moved) {
          render();
          globalThis.__whisperTrustedBridgeSend?.('overlay-style', {
            bottomOffset, bridgeToken: state.bridgeToken || '',
          });
        }
        event.preventDefault();
        event.stopPropagation();
      };
      item.addEventListener('pointerup', finishDrag);
      item.addEventListener('pointercancel', (event) => finishDrag(event, true));
    };

    const syncNativeCaptionVisibility = () => {
      const id = '__whisper_hide_native_captions';
      let sheet = document.getElementById(id);
      // Uygulama katmanı kapalıyken sitenin kendi altyazısını asla gizleme;
      // aksi halde kullanıcı iki altyazı kaynağını da aynı anda kaybeder.
      if (state.mode !== 'off' && state.style?.hideSiteCaptions) {
        if (!sheet) {
          sheet = document.createElement('style');
          sheet.id = id;
          sheet.textContent = 'video::cue { opacity: 0 !important; color: transparent !important; background: transparent !important; } .ytp-caption-window-container, .player-timedtext { visibility: hidden !important; }';
          (document.head || document.documentElement).appendChild(sheet);
        }
      } else if (sheet) sheet.remove();
    };

    const ensureRoot = () => {
      const marked = [...document.querySelectorAll('[data-whisper-browser-overlay="true"]')];
      root = marked[0] || document.getElementById('__whisper_browser_subtitles');
      for (const duplicate of marked.slice(1)) duplicate.remove();
      if (!root) {
        root = document.createElement('div');
        root.id = '__whisper_browser_subtitles';
        root.style.cssText = 'position:fixed;z-index:2147483646;pointer-events:none;text-align:center;display:flex;flex-direction:column;align-items:center;gap:6px;font-family:Inter,Segoe UI,sans-serif;text-shadow:0 2px 5px #000,0 0 2px #000;';
      }
      root.dataset.whisperBrowserOverlay = 'true';
      let source = root.querySelector('[data-kind="source"]');
      let translation = root.querySelector('[data-kind="translation"]');
      if (!source) {
        source = document.createElement('div'); source.dataset.kind = 'source'; source.dir = 'auto';
        source.style.cssText = 'max-width:88%;padding:3px 8px;border-radius:5px;background:rgba(5,7,10,.74);color:#f5f5f5;font-size:clamp(15px,2vw,25px);line-height:1.35;white-space:pre-line;overflow:hidden;';
        root.appendChild(source);
      }
      if (!translation) {
        translation = document.createElement('div'); translation.dataset.kind = 'translation'; translation.dir = 'auto';
        translation.style.cssText = 'max-width:88%;padding:4px 9px;border-radius:5px;background:rgba(5,7,10,.82);color:#e0ad5d;font-weight:650;font-size:clamp(16px,2.15vw,27px);line-height:1.35;white-space:pre-line;overflow:hidden;';
        root.appendChild(translation);
      }
      bindDrag(source);
      bindDrag(translation);
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

    const scanShadowHosts = (node, depth = 0) => {
      if (!node || depth > 24) return;
      for (const item of node.children || []) {
        if (item.shadowRoot) {
          observeRoot(item.shadowRoot);
          scanMediaNode(item.shadowRoot);
        }
        scanShadowHosts(item, depth + 1);
      }
    };

    const scanMediaNode = (node) => {
      if (!node) return;
      const addCandidate = (item) => {
        if (!item || mediaCandidates.has(item)) return;
        mediaCandidates.add(item);
        const activity = () => {
          mediaDirty = true;
          if (state.mode !== 'off' && !document.hidden) render();
        };
        for (const type of ['play', 'pause', 'loadedmetadata', 'emptied']) {
          item.addEventListener(type, activity, { passive: true });
        }
        candidateListeners.set(item, activity);
      };
      if (node.nodeType === 1 && node.matches?.('video,audio')) addCandidate(node);
      if (node.querySelectorAll) {
        for (const item of node.querySelectorAll('video,audio')) addCandidate(item);
        // Mutation başına devasa bir '*' NodeList'i kurma. Shadow hostları
        // sınırlı derinlikte gezmek video sayfalarındaki ani düzen maliyetini keser.
        scanShadowHosts(node);
      }
    };

    const observeRoot = (scope) => {
      if (!scope || observedRoots.has(scope) || state.mode === 'off') return;
      observedRoots.add(scope);
      const observer = new MutationObserver((mutations) => {
        if (state.mode === 'off') return;
        for (const mutation of mutations) for (const node of mutation.addedNodes) scanMediaNode(node);
        mediaDirty = true;
        if (mutationFrame || document.hidden) return;
        mutationFrame = requestAnimationFrame(() => { mutationFrame = 0; render(); });
      });
      observer.observe(scope, { childList: true, subtree: true });
      mutationObservers.push(observer);
    };

    const startObserving = () => {
      observeRoot(document);
      scanMediaNode(document);
    };

    const stopObserving = () => {
      while (mutationObservers.length) mutationObservers.pop().disconnect();
      for (const [item, listener] of candidateListeners) {
        for (const type of ['play', 'pause', 'loadedmetadata', 'emptied']) {
          try { item.removeEventListener(type, listener); } catch (_) {}
        }
      }
      candidateListeners.clear();
      observedRoots = new WeakSet();
      mediaCandidates.clear();
      mediaDirty = true;
    };

    const discoverMedia = () => {
      if (!mediaDirty && media && media.isConnected) return media;
      mediaDirty = false;
      for (const item of [...mediaCandidates]) {
        if (item.isConnected) continue;
        const listener = candidateListeners.get(item);
        if (listener) for (const type of ['play', 'pause', 'loadedmetadata', 'emptied']) {
          try { item.removeEventListener(type, listener); } catch (_) {}
        }
        candidateListeners.delete(item);
        mediaCandidates.delete(item);
      }
      const candidates = [...mediaCandidates];
      const selected = candidates.sort(compareMedia)[0] || null;
      if (selected === media) return media;
      stopWatchingMedia();
      media = selected;
      if (!media) return null;
      const redraw = () => render();
      // Aday yaşam döngüsü dinleyicileri play/pause/metadata/emptied olaylarını
      // zaten yeniden seçim için işler; seçili medyada bunları ikinci kez bağlama.
      const eventTypes = ['seeked', 'durationchange'];
      // Oynayan videoda rVFC zaten her görüntü karesinde güncelliyor. Aynı anda
      // timeupdate dinlemek aynı cueyu iki kez çiziyordu; rVFC yoksa fallback.
      if (typeof media.requestVideoFrameCallback !== 'function') eventTypes.unshift('timeupdate');
      for (const type of eventTypes) {
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
      syncNativeCaptionVisibility();
      if (document.hidden || state.mode === 'off') {
        if (root) root.style.display = 'none';
        cancelFrame();
        return;
      }
      const box = ensureRoot();
      const activeMedia = discoverMedia();
      if (!activeMedia) {
        box.style.display = 'none';
        cancelFrame();
        return;
      }
      const measured = activeMedia.getBoundingClientRect();
      const rect = measured.width > 2 && measured.height > 2 ? measured
        : { left: 0, right: innerWidth, width: innerWidth, top: 0, bottom: innerHeight, height: innerHeight };
      box.style.display = 'flex';
      box.style.left = Math.max(0, rect.left) + 'px';
      box.style.width = Math.max(0, rect.width) + 'px';
      const style = state.style || {};
      const bottomOffset = Math.max(0, Math.min(75, Number.isFinite(Number(style.bottomOffset)) ? Number(style.bottomOffset) : 8));
      box.style.top = Math.max(rect.top, rect.bottom - Math.max(96, rect.height * (bottomOffset / 100 + .09))) + 'px';
      const time = (Number(activeMedia.currentTime) || 0) - (Number(state.offset) || 0);
      const sourceCues = findCues(state.source || [], time);
      const translationCues = findCues(state.translation || [], time);
      const source = box.querySelector('[data-kind="source"]');
      const translation = box.querySelector('[data-kind="translation"]');
      const sourceText = sourceCues.length && (state.mode === 'source' || state.mode === 'both')
        ? sourceCues.map((cue) => cue.text).join('\\n') : '';
      const translationText = translationCues.length && (state.mode === 'translation' || state.mode === 'both')
        ? translationCues.map((cue) => cue.text).join('\\n') : '';
      if (source.textContent !== sourceText) source.textContent = sourceText;
      if (translation.textContent !== translationText) translation.textContent = translationText;
      const scale = Math.max(.65, Math.min(1.8, Number(style.scale) || 1));
      const opacity = Math.max(.2, Math.min(1, Number(style.opacity) || .82));
      const width = Math.max(40, Math.min(98, Number(style.width) || 88));
      const lines = Math.max(1, Math.min(6, Number(style.maxLines) || 3));
      const styleKey = [scale, opacity, width, lines].join(':');
      if (styleKey !== appliedStyleKey) {
        appliedStyleKey = styleKey;
        for (const item of [source, translation]) {
          item.style.maxWidth = width + '%';
          item.style.fontSize = 'clamp(' + (15 * scale) + 'px,' + (2.05 * scale) + 'vw,' + (27 * scale) + 'px)';
          item.style.backgroundColor = 'rgba(5,7,10,' + opacity + ')';
          item.style.maxHeight = (lines * 1.35) + 'em';
        }
      }
      if (style.sourceFirst === false) {
        if (translation.nextSibling !== source) box.appendChild(source);
      } else if (source.nextSibling !== translation) box.appendChild(translation);
      source.style.display = source.textContent ? '' : 'none';
      translation.style.display = translation.textContent ? '' : 'none';
      queueFrame();
    }

    document.addEventListener('fullscreenchange', render);
    document.addEventListener('visibilitychange', render);
    window.addEventListener('scroll', render, { passive: true });
    window.addEventListener('resize', render, { passive: true });

    window.__whisperBrowserOverlayController = {
      update(value) {
        state = value || {};
        if (state.mode === 'off') {
          cancelFrame();
          stopWatchingMedia();
          media = null;
          if (mutationFrame) cancelAnimationFrame(mutationFrame);
          mutationFrame = 0;
          stopObserving();
        } else startObserving();
        render();
      },
      diagnostics() {
        return { hasMedia: !!media, running: !!frameToken, hidden: document.hidden,
          mode: state.mode || 'off', observer: mutationObservers.length > 0 };
      },
    };
    if (state.mode !== 'off') startObserving();
    render();
    return true;
  })()`;
}

module.exports = { buildBrowserOverlayScript };
