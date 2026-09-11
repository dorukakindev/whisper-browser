const { compareBrowserMediaCandidates, browserMediaCandidateRank } = require('./browser-media-selection');

function controllerBootstrap() {
  return `(() => {
    if (window.__whisperMediaController) return window.__whisperMediaController;
    const media = new Set();
    const observers = new Map();
    let adAudioSnapshot = null;

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
    const adPlayingSelectors = [
      '.html5-video-player.ad-showing',
      '.html5-video-player.ad-interrupting',
      '.ad-interrupting',
      '.ytp-ad-player-overlay',
      '.ytp-ad-text',
      '.ytp-preview-ad',
    ];
    const adSkipSelectors = [
      '.ytp-ad-skip-button',
      '.ytp-skip-ad-button',
      '.ytp-ad-skip-button-modern',
    ];
    const adCountdownSelectors = [
      '.ytp-ad-duration-remaining',
      '.ytp-ad-preview-text',
      '.ytp-ad-text',
    ];
    const visibleElement = (selector) => {
      const element = document.querySelector?.(selector) || null;
      if (!element || element.isConnected === false) return null;
      if (typeof element.getClientRects === 'function' && element.getClientRects().length === 0) return null;
      if (typeof getComputedStyle === 'function') {
        const style = getComputedStyle(element);
        if (style?.display === 'none' || style?.visibility === 'hidden' || style?.visibility === 'collapse') return null;
      }
      return element;
    };
    const firstVisible = (selectors) => {
      for (const selector of selectors) {
        const element = visibleElement(selector);
        if (element) return element;
      }
      return null;
    };
    const explicitAdRemaining = () => {
      const text = String(firstVisible(adCountdownSelectors)?.textContent || '');
      const match = /(?:^|\\D)(\\d{1,2}):(\\d{2})(?:\\D|$)/.exec(text);
      if (!match) return null;
      const minutes = Number(match[1]);
      const seconds = Number(match[2]);
      return Number.isFinite(minutes) && seconds >= 0 && seconds < 60 ? minutes * 60 + seconds : null;
    };
    const detectAd = () => {
      const skipButton = firstVisible(adSkipSelectors);
      const adSignal = firstVisible(adPlayingSelectors);
      return {
        adPlaying: !!(adSignal || skipButton),
        adSkippable: !!skipButton,
        adRemaining: explicitAdRemaining(),
        skipButton,
      };
    };
    const muteForAd = (item) => {
      if (!adAudioSnapshot || adAudioSnapshot.video !== item) {
        adAudioSnapshot = {
          video: item,
          muted: !!item.muted,
          volume: Math.max(0, Math.min(1, finite(item.volume))),
        };
      }
      item.muted = true;
      return true;
    };
    const restoreAdAudioIfEnded = (item, adPlaying) => {
      if (!adAudioSnapshot || adPlaying) return false;
      const snapshot = adAudioSnapshot;
      adAudioSnapshot = null;
      const target = snapshot.video?.isConnected ? snapshot.video : item;
      if (!target) return false;
      const currentVolume = Math.max(0, Math.min(1, finite(target.volume)));
      const unchangedSinceAutoMute = !!target.muted && Math.abs(currentVolume - snapshot.volume) < .001;
      if (!unchangedSinceAutoMute) return false;
      target.volume = snapshot.volume;
      target.muted = snapshot.muted;
      return true;
    };
    const select = () => {
      cleanupDetachedRoots();
      for (const item of [...media]) if (!item.isConnected) media.delete(item);
      return [...media].sort(compareMedia)[0] || null;
    };

    scan(document);
    const controller = {
      select,
      adState() {
        const state = detectAd();
        return { adPlaying: state.adPlaying, adSkippable: state.adSkippable,
          adRemaining: state.adRemaining };
      },
      findAdSkipButton() { return detectAd().skipButton; },
      muteForAd(item) { return muteForAd(item); },
      probe() {
        const item = select();
        if (!item) return null;
        const ad = detectAd();
        restoreAdAudioIfEnded(item, ad.adPlaying);
        let totalVideoFrames = null;
        try {
          const quality = typeof item.getVideoPlaybackQuality === 'function'
            ? item.getVideoPlaybackQuality() : null;
          const frames = Number(quality?.totalVideoFrames);
          if (Number.isFinite(frames) && frames >= 0) totalVideoFrames = frames;
        } catch (_) {}
        let errorCode = 0;
        let errorMessage = '';
        try {
          errorCode = Math.max(0, finite(item.error?.code));
          errorMessage = String(item.error?.message || '').slice(0, 180);
        } catch (_) {}
        const spinnerVisible = !!firstVisible([
          '.html5-video-player.buffering .ytp-spinner',
          '.jwplayer.jw-state-buffering .jw-display-icon-container',
          '.vjs-waiting .vjs-loading-spinner',
          '[data-testid="player-spinner"]',
        ]);
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
          readyState: Math.max(0, Math.min(4, finite(item.readyState))),
          videoWidth: Math.max(0, finite(item.videoWidth)),
          videoHeight: Math.max(0, finite(item.videoHeight)),
          totalVideoFrames,
          spinnerVisible,
          errorCode,
          errorMessage,
          adPlaying: ad.adPlaying,
          adSkippable: ad.adSkippable,
          adRemaining: ad.adRemaining,
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
    'volume-relative', 'volume-set', 'frame-step', 'speed', 'fullscreen', 'pip', 'skipAd',
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
    const finite = (value, fallback = 0) => {
      const number = Number(value);
      return Number.isFinite(number) ? number : fallback;
    };
    try {
    if (command === 'skipAd') {
      const ad = controller.adState();
      if (!ad.adPlaying) return { handled: false };
      controller.muteForAd(video);
      let adAction = 'muted';
      const skipButton = controller.findAdSkipButton();
      if (skipButton) {
        skipButton.click();
        adAction = 'clicked';
      } else {
        const duration = Number(video.duration);
        if (Number.isFinite(duration) && duration > 0) {
          video.currentTime = duration;
          adAction = 'seeked';
        }
      }
      return { handled: true, currentTime: finite(video.currentTime),
        playbackRate: finite(video.playbackRate, 1), paused: !!video.paused,
        volume: finite(video.volume), muted: !!video.muted,
        adPlaying: true, adSkippable: ad.adSkippable, adRemaining: ad.adRemaining, adAction };
    }
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
