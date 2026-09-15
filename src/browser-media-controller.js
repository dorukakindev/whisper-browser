const { compareBrowserMediaCandidates, browserMediaCandidateRank } = require('./browser-media-selection');
const { AUDIO_PROFILES, audioLevelDb, nextSilenceState } = require('./browser-audio-policy');

function controllerBootstrap() {
  return `(() => {
    if (window.__whisperMediaController) return window.__whisperMediaController;
    const media = new Set();
    const observers = new Map();
    let adAudioSnapshot = null;
    let playbackPreference = { rate: 1, enforceRate: false, preservesPitch: true,
      brightness: 1, contrast: 1, normalizeAudio: false, silenceSpeedEnabled: false,
      silenceSpeedRate: 3, silenceThresholdDb: -45, audioProfile: 'off' };
    const configuredMedia = new WeakSet();
    const audioGraphs = new WeakMap();
    const originalVideoFilters = new WeakMap();
    const appliedVideoFilters = new WeakMap();
    const explicitRateIntents = new WeakMap();
    const internalRateIntents = new WeakMap();
    let applyingRate = false;
    const profiles = ${JSON.stringify(AUDIO_PROFILES)};
    const audioLevelDb = ${audioLevelDb.toString()};
    const nextSilenceState = ${nextSilenceState.toString()};
    const setInternalRate = (item, rate) => {
      internalRateIntents.set(item, { rate, until: Date.now() + 1500 });
      item.playbackRate = rate;
    };

    const restoreSilenceRate = (item, graph) => {
      if (!graph?.boosted) return;
      graph.boosted = false;
      applyingRate = true;
      try { setInternalRate(item, graph.baseRate); }
      catch (_) {}
      finally { Promise.resolve().then(() => { applyingRate = false; }); }
    };
    const stopSilenceMonitor = (item, graph) => {
      if (!graph) return;
      if (graph.timer) clearInterval(graph.timer);
      graph.timer = null;
      graph.silence = { quietMs: 0, active: false };
      restoreSilenceRate(item, graph);
    };
    const tickSilenceMonitor = (item, graph) => {
      if (!item.isConnected || item.paused || item.ended || item.muted || item.volume === 0
          || graph.context.state !== 'running') {
        restoreSilenceRate(item, graph);
        graph.silence = { quietMs: 0, active: false };
        return;
      }
      try {
        graph.analyser.getByteTimeDomainData(graph.samples);
        const level = audioLevelDb(graph.samples);
        graph.silence = nextSilenceState(graph.silence, level, 100,
          playbackPreference.silenceThresholdDb);
        if (graph.silence.active && !graph.boosted) {
          graph.baseRate = finite(item.playbackRate, playbackPreference.rate);
          const target = Math.max(graph.baseRate, playbackPreference.silenceSpeedRate);
          if (target > graph.baseRate + .01) {
            graph.boosted = true;
            applyingRate = true;
            try { setInternalRate(item, target); }
            finally { Promise.resolve().then(() => { applyingRate = false; }); }
          }
        } else if (!graph.silence.active) restoreSilenceRate(item, graph);
      } catch (_) { stopSilenceMonitor(item, graph); }
    };

    const releaseMedia = (item) => {
      media.delete(item);
      explicitRateIntents.delete(item);
      internalRateIntents.delete(item);
      if (item?.style && originalVideoFilters.has(item)) {
        try { item.style.filter = originalVideoFilters.get(item); } catch (_) {}
        appliedVideoFilters.delete(item);
      }
      const graph = audioGraphs.get(item);
      if (!graph) return;
      stopSilenceMonitor(item, graph);
      // SPA oynatıcıları aynı medya öğesini kısa süre DOM'dan çıkarıp yeniden
      // takabilir. MediaElementSource bir öğe için yalnız bir kez üretilebilir;
      // context'i burada kapatmak yeniden takıldığında sessiz video bırakır.
      // WeakMap öğeyle birlikte toplanır; ayrıyken doğrudan çıkışa geri bağla.
      try {
        graph.source.disconnect(); graph.compressor.disconnect(); graph.analyser?.disconnect();
        graph.source.connect(graph.context.destination); graph.normalized = false; graph.monitored = false;
        graph.context.resume?.().catch?.(() => {});
      } catch (_) {}
    };

    const audioGraphAllowed = (item) => {
      const source = String(item?.currentSrc || item?.src || '');
      if (!source) return true;
      try {
        const url = new URL(source, location.href);
        return !/^https?:$/.test(url.protocol) || url.origin === location.origin
          || String(item.crossOrigin || '').toLowerCase() === 'anonymous';
      } catch (_) { return false; }
    };
    const applyAudioPreference = (item) => {
      let graph = audioGraphs.get(item);
      const profile = profiles[playbackPreference.audioProfile];
      const processing = playbackPreference.normalizeAudio || !!profile;
      const monitoring = playbackPreference.silenceSpeedEnabled;
      if (!processing && !monitoring && !graph) return;
      if (!audioGraphAllowed(item)) {
        if (graph) {
          stopSilenceMonitor(item, graph);
          try {
            graph.source.disconnect(); graph.compressor.disconnect(); graph.analyser?.disconnect();
            graph.source.connect(graph.context.destination);
            graph.normalized = false; graph.monitored = false;
          } catch (_) {}
        }
        return;
      }
      try {
        if (!graph) {
          const AudioContextClass = globalThis.AudioContext || globalThis.webkitAudioContext;
          if (!AudioContextClass) return;
          const context = new AudioContextClass();
          const source = context.createMediaElementSource(item);
          const compressor = context.createDynamicsCompressor();
          graph = { context, source, compressor, normalized: false, timer: null,
            boosted: false, silence: { quietMs: 0, active: false } };
          audioGraphs.set(item, graph);
        }
        if (processing) {
          const settings = profile || { threshold: -24, knee: 30, ratio: 8,
            attack: .003, release: .25 };
          graph.compressor.threshold.value = settings.threshold;
          graph.compressor.knee.value = settings.knee;
          graph.compressor.ratio.value = settings.ratio;
          graph.compressor.attack.value = settings.attack;
          graph.compressor.release.value = settings.release;
        }
        if (monitoring && !graph.analyser) {
          graph.analyser = graph.context.createAnalyser();
          graph.analyser.fftSize = 2048;
          graph.samples = new Uint8Array(graph.analyser.fftSize);
        }
        if (graph.normalized !== processing || graph.monitored !== monitoring) {
          graph.source.disconnect(); graph.compressor.disconnect(); graph.analyser?.disconnect();
          let output = graph.source;
          if (processing) { output.connect(graph.compressor); output = graph.compressor; }
          if (monitoring) { output.connect(graph.analyser); graph.analyser.connect(graph.context.destination); }
          else output.connect(graph.context.destination);
          graph.normalized = processing;
          graph.monitored = monitoring;
        }
        if (monitoring && !graph.timer) graph.timer = setInterval(() => tickSilenceMonitor(item, graph), 100);
        if (!monitoring) stopSilenceMonitor(item, graph);
        graph.context.resume?.().catch?.(() => {});
      } catch (_) { stopSilenceMonitor(item, graph); }
    };

    const applyPlaybackPreference = (item) => {
      if (!item) return;
      try {
        item.preservesPitch = playbackPreference.preservesPitch;
        if ('mozPreservesPitch' in item) item.mozPreservesPitch = playbackPreference.preservesPitch;
        if ('webkitPreservesPitch' in item) item.webkitPreservesPitch = playbackPreference.preservesPitch;
      } catch (_) {}
      if (item.tagName?.toLowerCase() === 'video' && item.style) {
        const b = playbackPreference.brightness;
        const c = playbackPreference.contrast;
        const currentFilter = String(item.style.filter || '');
        // Site filtresini biz uyguladıktan sonra değiştirdiyse yeni değeri esas
        // al. Böylece kalite/reklam geçişindeki site filtresi eski snapshot ile
        // ezilmez ve özellik kapatılınca güncel site görünümü geri gelir.
        if (!originalVideoFilters.has(item) || (appliedVideoFilters.has(item)
            && currentFilter !== appliedVideoFilters.get(item))) {
          originalVideoFilters.set(item, currentFilter);
        }
        const original = originalVideoFilters.get(item);
        const ownFilter = Math.abs(b - 1) < .001 && Math.abs(c - 1) < .001
          ? '' : 'brightness(' + b + ') contrast(' + c + ')';
        item.style.filter = [original, ownFilter].filter(Boolean).join(' ');
        appliedVideoFilters.set(item, item.style.filter);
      }
      applyAudioPreference(item);
      if (playbackPreference.enforceRate && !audioGraphs.get(item)?.boosted
          && Math.abs(finite(item.playbackRate, 1) - playbackPreference.rate) > .01) {
        applyingRate = true;
        try { setInternalRate(item, playbackPreference.rate); }
        finally { Promise.resolve().then(() => { applyingRate = false; }); }
      }
    };
    const registerMedia = (item) => {
      if (!item) return;
      media.add(item);
      if (!configuredMedia.has(item)) {
        configuredMedia.add(item);
        const reapply = () => applyPlaybackPreference(item);
        for (const type of ['play', 'seeking', 'seeked', 'loadstart', 'loadedmetadata']) {
          item.addEventListener?.(type, reapply, { passive: true });
        }
        item.addEventListener?.('ratechange', () => {
          if (applyingRate) return;
          const internal = internalRateIntents.get(item);
          if (internal && internal.until >= Date.now()
              && Math.abs(finite(item.playbackRate, 1) - internal.rate) <= .01) return;
          const graph = audioGraphs.get(item);
          if (graph?.boosted) {
            graph.baseRate = finite(item.playbackRate, playbackPreference.rate);
            graph.boosted = false;
            graph.silence = { quietMs: 0, active: false };
          }
          if (!playbackPreference.enforceRate) return;
          const intent = explicitRateIntents.get(item);
          if (intent && intent.until >= Date.now()
              && Math.abs(finite(item.playbackRate, 1) - intent.rate) <= .01) return;
          applyPlaybackPreference(item);
        }, { passive: true });
      }
      applyPlaybackPreference(item);
    };

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
      if (!root || observers.has(root) || observers.size >= 128) return;
      const observer = new MutationObserver((mutations) => {
        for (const mutation of mutations) {
          for (const node of mutation.addedNodes) scan(node);
          if (mutation.removedNodes.length) {
            for (const item of [...media]) if (!item.isConnected) releaseMedia(item);
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
      if (node.nodeType === 1 && node.matches?.('video,audio')) registerMedia(node);
      // MutationObserver eklenen düğüm olarak doğrudan bir shadow host verir.
      // Yalnız çocukları dolaşmak, SPA'nın söküp yeniden taktığı host'un kendi
      // shadowRoot'undaki medya öğelerini kaybettirir.
      if (node.nodeType === 1 && node.shadowRoot) {
        observeRoot(node.shadowRoot);
        scan(node.shadowRoot);
      }
      if (!node.querySelectorAll) return;
      for (const item of node.querySelectorAll('video,audio')) registerMedia(item);
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
      for (const item of [...media]) if (!item.isConnected) releaseMedia(item);
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
      setRate(item, rate) {
        if (!item) return false;
        const next = Math.max(.25, Math.min(4, finite(rate, 1)));
        explicitRateIntents.set(item, { rate: next, until: Date.now() + 1500 });
        const graph = audioGraphs.get(item);
        if (graph?.boosted) { graph.boosted = false; graph.silence = { quietMs: 0, active: false }; }
        item.playbackRate = next;
        return true;
      },
      configurePlayback(raw = {}) {
        const rate = Math.max(.25, Math.min(4, finite(raw.rate, 1)));
        const brightness = Math.max(.4, Math.min(2, finite(raw.brightness, 1)));
        const contrast = Math.max(.4, Math.min(2, finite(raw.contrast, 1)));
        playbackPreference = { rate, brightness, contrast,
          enforceRate: raw.enforceRate === true, preservesPitch: raw.preservesPitch !== false,
          normalizeAudio: raw.normalizeAudio === true,
          silenceSpeedEnabled: raw.silenceSpeedEnabled === true,
          silenceSpeedRate: Math.max(2, Math.min(8, finite(raw.silenceSpeedRate, 3))),
          silenceThresholdDb: Math.max(-70, Math.min(-20, finite(raw.silenceThresholdDb, -45))),
          audioProfile: profiles[raw.audioProfile] !== undefined ? raw.audioProfile : 'off' };
        for (const item of media) applyPlaybackPreference(item);
        return { ...playbackPreference };
      },
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
        const rect = item.getBoundingClientRect?.();
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
          bounds: rect ? { x: finite(rect.x), y: finite(rect.y),
            width: Math.max(0, finite(rect.width)), height: Math.max(0, finite(rect.height)) } : null,
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

function normalizeBrowserMediaPreference(raw = {}) {
  const number = (value, fallback, min, max) => {
    const parsed = Number(value);
    return Math.max(min, Math.min(max, Number.isFinite(parsed) ? parsed : fallback));
  };
  return {
    rate: number(raw.rate, 1, .25, 4),
    enforceRate: raw.enforceRate === true,
    preservesPitch: raw.preservesPitch !== false,
    brightness: number(raw.brightness, 1, .4, 2),
    contrast: number(raw.contrast, 1, .4, 2),
    normalizeAudio: raw.normalizeAudio === true,
    silenceSpeedEnabled: raw.silenceSpeedEnabled === true,
    silenceSpeedRate: number(raw.silenceSpeedRate, 3, 2, 8),
    silenceThresholdDb: number(raw.silenceThresholdDb, -45, -70, -20),
    audioProfile: Object.hasOwn(AUDIO_PROFILES, raw.audioProfile) ? raw.audioProfile : 'off',
  };
}

function buildBrowserMediaPreferenceScript(raw) {
  const safePreference = JSON.stringify(normalizeBrowserMediaPreference(raw));
  return `(() => {
    const controller = ${controllerBootstrap()};
    const preference = controller.configurePlayback(${safePreference});
    return { handled: true, preference, media: controller.probe() };
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
      controller.setRate(video, Math.max(.25, Math.min(4, ${safeValue} || 1)));
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

module.exports = { buildBrowserMediaCommandScript, buildBrowserMediaProbeScript,
  buildBrowserMediaPreferenceScript, normalizeBrowserMediaPreference };
