const { compareBrowserMediaCandidates, browserMediaCandidateRank } = require('./browser-media-selection');

function controllerBootstrap() {
  return `(() => {
    if (window.__whisperMediaController) return window.__whisperMediaController;
    const media = new Set();
    const observers = new Map();

    const cleanupDetachedRoots = () => {
      for (const [root, observer] of observers) {
        if (root !== document && root.host?.isConnected === false) {
          observer.disconnect();
          observers.delete(root);
        }
      }
    };

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
      if (!root || observers.has(root)) return;
      const observer = new MutationObserver((mutations) => {
        for (const mutation of mutations) {
          for (const node of mutation.addedNodes) scan(node);
          if (mutation.removedNodes.length) {
            for (const item of [...media]) if (!item.isConnected) media.delete(item);
            cleanupDetachedRoots();
          }
        }
      });
      observer.observe(root, { childList: true, subtree: true });
      observers.set(root, observer);
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

    ${browserMediaCandidateRank.toString()}
    const compareMedia = ${compareBrowserMediaCandidates.toString()};
    const finite = (value, fallback = 0) => {
      const number = Number(value);
      return Number.isFinite(number) ? number : fallback;
    };
    const select = () => {
      cleanupDetachedRoots();
      for (const item of [...media]) if (!item.isConnected) media.delete(item);
      return [...media].sort(compareMedia)[0] || null;
    };

    scan(document);
    const controller = {
      select,
      probe() {
        const item = select();
        if (!item) return null;
        return {
          currentTime: finite(item.currentTime),
          duration: finite(item.duration),
          paused: !!item.paused,
          ended: !!item.ended,
          tagName: String(item.tagName || '').toLowerCase(),
          muted: !!item.muted,
          volume: finite(item.volume),
          playbackRate: finite(item.playbackRate, 1),
          area: Math.max(0, item.clientWidth * item.clientHeight),
          adPlaying: !!document.querySelector?.('.html5-video-player.ad-showing'),
        };
      },
      diagnostics() {
        return { candidateCount: media.size, observerCount: observers.size, persistent: true };
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
  const allowedCommands = new Set([
    'seek', 'seek-relative', 'play-pause', 'play', 'pause', 'mute',
    'volume-relative', 'volume-set', 'frame-step', 'speed', 'fullscreen', 'pip',
  ]);
  // Bilinmeyen komutlar sayfa denetleyicisini kurmadan reddedilir. Ayrıca
  // JSON.stringify(Infinity) null ürettiği için sayısal komutlar finite olmalı.
  if (!allowedCommands.has(command)) return '(async () => false)()';
  if (['seek', 'seek-relative', 'speed', 'volume-relative', 'volume-set', 'frame-step'].includes(command)
      && !Number.isFinite(Number(value))) return '(async () => false)()';
  const safeCommand = JSON.stringify(String(command || ''));
  const safeValue = JSON.stringify(Number(value) || 0);
  return `(async () => {
    const controller = ${controllerBootstrap()};
    const video = controller.select();
    if (!video) return false;
    const command = ${safeCommand};
    try {
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
      if (!('requestPictureInPicture' in video)) {
        return { handled: false, error: 'Bu video Picture-in-Picture desteklemiyor.' };
      }
      if (document.pictureInPictureElement) await document.exitPictureInPicture();
      else await video.requestPictureInPicture();
    } else return false;
    const finite = (value, fallback = 0) => {
      const number = Number(value);
      return Number.isFinite(number) ? number : fallback;
    };
    return { handled: true, currentTime: finite(video.currentTime),
      playbackRate: finite(video.playbackRate, 1), paused: !!video.paused,
      volume: finite(video.volume), muted: !!video.muted };
    } catch (error) {
      const detail = String(error?.message || error?.name || '').replace(/https?:\\/\\/\\S+/gi, '[adres gizlendi]').slice(0, 180);
      return { handled: false, error: detail || 'Oynatıcı komutu reddetti.' };
    }
  })()`;
}

module.exports = { buildBrowserMediaCommandScript, buildBrowserMediaProbeScript };
