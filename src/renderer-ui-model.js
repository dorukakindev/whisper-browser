(function initRendererUiModel(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.RendererUiModel = api;
})(typeof window !== 'undefined' ? window : globalThis, function rendererUiModelFactory() {
  const ACTIVE_PHASES = new Set(['starting', 'running', 'cancelling', 'awaiting-exit']);

  function snapshot(state) {
    return { ...state };
  }

  function createJobModel() {
    const state = {
      phase: 'idle',
      generation: 0,
      queueRunning: false,
      capture: 'enabled',
      tab: 'main',
      navigationGeneration: 0,
      selectionGeneration: null,
    };

    function result(accepted, effect = '') {
      return { accepted, effect, state: snapshot(state) };
    }

    function current(event) {
      return event.generation === undefined || event.generation === state.generation;
    }

    function dispatch(event) {
      switch (event.type) {
        case 'start':
          if (state.phase !== 'idle' || state.queueRunning) return result(false, 'busy');
          state.generation++;
          state.phase = 'starting';
          return result(true, 'invoke-start');
        case 'queue-start':
          if (state.phase !== 'idle' || state.queueRunning) return result(false, 'busy');
          state.queueRunning = true;
          return result(true, 'queue-ready');
        case 'queue-item-start':
          if (!state.queueRunning || state.phase !== 'idle') return result(false, 'busy');
          state.generation++;
          state.phase = 'starting';
          return result(true, 'invoke-start');
        case 'start-resolved':
          if (!current(event) || (state.phase !== 'starting' && state.phase !== 'cancelling')) {
            return result(false, 'stale');
          }
          if (!event.ok) {
            state.phase = 'idle';
            return result(true, 'start-failed');
          }
          if (state.phase === 'cancelling') return result(true, 'retry-cancel');
          state.phase = 'running';
          return result(true, 'started');
        case 'cancel':
          if (!ACTIVE_PHASES.has(state.phase) || state.phase === 'cancelling') {
            return result(false, state.phase === 'cancelling' ? 'duplicate-cancel' : 'idle');
          }
          state.phase = 'cancelling';
          return result(true, 'invoke-cancel');
        case 'progress':
        case 'status':
        case 'segment':
          if (!current(event) || (state.phase !== 'starting' && state.phase !== 'running')) {
            return result(false, 'stale');
          }
          return result(true, 'render');
        case 'done':
        case 'error':
          if (!current(event) || (state.phase !== 'starting' && state.phase !== 'running')) {
            return result(false, 'stale');
          }
          state.phase = 'awaiting-exit';
          return result(true, event.type);
        case 'exit':
          if (!current(event) || !ACTIVE_PHASES.has(state.phase)) return result(false, 'stale');
          state.phase = 'idle';
          return result(true, state.queueRunning ? 'next-queue-item' : 'idle');
        case 'queue-stop':
          state.queueRunning = false;
          if (state.phase === 'idle') return result(true, 'idle');
          return result(true, 'stop-after-active');
        case 'capture-error':
          state.capture = 'error';
          return result(true, 'announce-capture-error');
        case 'capture-recover':
          state.capture = 'enabled';
          return result(true, 'announce-capture-ready');
        case 'capture-disable':
          state.capture = 'disabled';
          return result(true, 'capture-disabled');
        case 'tab':
          state.tab = event.tab || 'main';
          return result(true, 'focus-tab');
        case 'navigate':
          state.navigationGeneration++;
          state.selectionGeneration = null;
          return result(true, 'clear-selection');
        case 'select':
          if (event.navigationGeneration !== state.navigationGeneration) return result(false, 'stale-selection');
          state.selectionGeneration = event.navigationGeneration;
          return result(true, 'selection');
        case 'reload':
          state.generation++;
          state.phase = 'idle';
          state.queueRunning = false;
          state.navigationGeneration++;
          state.selectionGeneration = null;
          return result(true, 'reset');
        default:
          return result(false, 'unknown');
      }
    }

    return { state, dispatch };
  }

  function validateJobState(state) {
    if (!ACTIVE_PHASES.has(state.phase) && state.phase !== 'idle') return false;
    if (!Number.isInteger(state.generation) || state.generation < 0) return false;
    if (!Number.isInteger(state.navigationGeneration) || state.navigationGeneration < 0) return false;
    if (state.selectionGeneration !== null && state.selectionGeneration !== state.navigationGeneration) return false;
    return ['enabled', 'disabled', 'error'].includes(state.capture);
  }

  function shouldAcceptRunEvent(state, type) {
    if (type === 'log') return true;
    if (type === 'exit') return !!(state.running || state.cancelled || state.awaitingExit);
    if (type === 'done' || type === 'error') return !!state.running && !state.cancelled;
    const live = new Set(['status', 'download_progress', 'language', 'progress', 'segment',
      'llm_progress', 'preview_refresh', 'quality_report']);
    return !live.has(type) || (!!state.running && !state.cancelled && !state.awaitingExit);
  }

  function cycleFocusIndex(currentIndex, count, backwards) {
    if (count <= 0) return -1;
    if (currentIndex < 0 || currentIndex >= count) return backwards ? count - 1 : 0;
    return (currentIndex + (backwards ? count - 1 : 1)) % count;
  }

  function isElementVisibleForFocus(element) {
    if (!element || typeof element.closest !== 'function'
        || typeof element.getClientRects !== 'function') return false;
    if (element.closest('[hidden], .hidden, [aria-hidden="true"]')) return false;
    return element.getClientRects().length > 0;
  }

  function effectiveViewport(width, height, scalePercent) {
    const scale = Math.max(1, Number(scalePercent) || 100) / 100;
    const cssWidth = width / scale;
    const cssHeight = height / scale;
    return {
      cssWidth,
      cssHeight,
      mainColumns: cssWidth <= 980 ? 1 : 2,
      compact: cssWidth <= 560,
      playerStacked: cssWidth <= 860,
    };
  }

  return {
    createJobModel,
    validateJobState,
    shouldAcceptRunEvent,
    cycleFocusIndex,
    isElementVisibleForFocus,
    effectiveViewport,
  };
});
