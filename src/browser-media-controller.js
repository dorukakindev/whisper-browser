function controllerBootstrap() {
  return `(() => {
    if (window.__whisperMediaController) return window.__whisperMediaController;
    const media = new Set();
    const observedRoots = new WeakSet();
    const observers = [];

    function scanShadowHosts(node, depth = 0) {
      if (!node || depth > 24) return;
      for (const item of node.children || []) {
        if (item.shadowRoot) {
          observeRoot(item.shadowRoot);
          scan(item.shadowRoot);
        }
        scanShadowHosts(item, depth + 1);
      }
    }

    const observeRoot = (root) => {
      if (!root || observedRoots.has(root)) return;
      observedRoots.add(root);
      const observer = new MutationObserver((mutations) => {
        for (const mutation of mutations) {
          for (const node of mutation.addedNodes) scan(node);
          if (mutation.removedNodes.length) {
            for (const item of [...media]) if (!item.isConnected) media.delete(item);
          }
        }
      });
      observer.observe(root, { childList: true, subtree: true });
      observers.push(observer);
    };

    function scan(node) {
      if (!node) return;
      if (node.nodeType === 9 || node.nodeType === 11) observeRoot(node);
      if (node.nodeType === 1 && node.matches?.('video,audio')) media.add(node);
      if (!node.querySelectorAll) return;
      for (const item of node.querySelectorAll('video,audio')) media.add(item);
      // Büyük SPA mutation'larında ikinci bir sınırsız evrensel seçici NodeList'i
      // tahsis etme; yalnız shadow host aramasını derinliği sınırlı dolaş.
      scanShadowHosts(node);
    }

    const select = () => {
      for (const item of [...media]) if (!item.isConnected) media.delete(item);
      return [...media].sort((a, b) => {
        const area = (item) => Math.max(0, item.clientWidth * item.clientHeight);
        return area(b) - area(a) || Number(!b.paused) - Number(!a.paused)
          || (Number(b.duration) || 0) - (Number(a.duration) || 0);
      })[0] || null;
    };

    scan(document);
    const controller = {
      select,
      probe() {
        const item = select();
        if (!item) return null;
        return {
          currentTime: Number(item.currentTime) || 0,
          duration: Number.isFinite(item.duration) ? item.duration : 0,
          paused: !!item.paused,
          muted: !!item.muted,
          volume: Number(item.volume) || 0,
          playbackRate: Number(item.playbackRate) || 1,
          area: Math.max(0, item.clientWidth * item.clientHeight),
        };
      },
      diagnostics() {
        return { candidateCount: media.size, observerCount: observers.length, persistent: true };
      },
    };
    window.__whisperMediaController = controller;
    return controller;
  })()`;
}

function buildBrowserMediaProbeScript() {
  return `(() => {
    const controller = ${controllerBootstrap()};
    return controller.probe();
  })()`;
}

function buildBrowserMediaCommandScript(command, value) {
  const safeCommand = JSON.stringify(String(command || ''));
  const safeValue = JSON.stringify(Number(value) || 0);
  return `(async () => {
    const controller = ${controllerBootstrap()};
    const video = controller.select();
    if (!video) return false;
    const command = ${safeCommand};
    if (command === 'seek') video.currentTime = Math.max(0, ${safeValue});
    else if (command === 'seek-relative') video.currentTime = Math.max(0, video.currentTime + ${safeValue});
    else if (command === 'play-pause') {
      if (video.paused) await video.play(); else video.pause();
    } else if (command === 'play') await video.play();
    else if (command === 'pause') video.pause();
    else if (command === 'mute') video.muted = !video.muted;
    else if (command === 'volume-relative') video.volume = Math.max(0, Math.min(1, video.volume + ${safeValue}));
    else if (command === 'volume-set') video.volume = Math.max(0, Math.min(1, ${safeValue}));
    else if (command === 'frame-step') {
      if (!video.paused) return false;
      video.currentTime = Math.max(0, video.currentTime + ${safeValue});
    } else if (command === 'speed') {
      video.playbackRate = Math.max(.25, Math.min(4, ${safeValue} || 1));
    } else if (command === 'fullscreen') {
      if (document.fullscreenElement) await document.exitFullscreen();
      else {
        // Replaced elements cannot paint our DOM captions as fullscreen children.
        const container = video.closest('.html5-video-player, [class*="player"], [id*="player"]');
        const target = container && container !== video ? container : video.parentElement || document.documentElement;
        await target.requestFullscreen();
      }
    } else if (command === 'pip') {
      if (!('requestPictureInPicture' in video)) return false;
      if (document.pictureInPictureElement) await document.exitPictureInPicture();
      else await video.requestPictureInPicture();
    } else return false;
    return { handled: true, currentTime: Number(video.currentTime) || 0,
      playbackRate: Number(video.playbackRate) || 1, paused: !!video.paused,
      volume: Number(video.volume) || 0, muted: !!video.muted };
  })()`;
}

module.exports = { buildBrowserMediaCommandScript, buildBrowserMediaProbeScript };
