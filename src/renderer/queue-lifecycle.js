(function initQueueLifecycle(root, factory) {
  'use strict';
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.QueueLifecycle = api;
}(typeof globalThis !== 'undefined' ? globalThis : this, () => {
  'use strict';

  const RESULT_EVENTS = new Set(['done', 'error']);

  function cloneValue(value) {
    if (typeof structuredClone === 'function') return structuredClone(value);
    return JSON.parse(JSON.stringify(value));
  }

  function deepFreeze(value, seen = new WeakSet()) {
    if (!value || typeof value !== 'object' || seen.has(value)) return value;
    seen.add(value);
    Object.values(value).forEach((entry) => deepFreeze(entry, seen));
    return Object.freeze(value);
  }

  function snapshotOptions(value) {
    return deepFreeze(cloneValue(value || {}));
  }

  // Aşamalı çıktı soneki sözleşmesi tek yerde: main.js aynı kuralı doğrular,
  // renderer kuyruk çakışma sonekini aynı kuralla üretir. '-whisper-'
  // sonrası en az 4 karakter zorunlu — 'q2'/'q12' gibi küçük kuyruk
  // kimlikleri eskiden geçersiz sonek üretip işi başlamadan düşürüyordu.
  const OUTPUT_NAME_SUFFIX_RE = /^-whisper-[a-z0-9-]{4,48}$/i;

  function isValidOutputNameSuffix(value) {
    return OUTPUT_NAME_SUFFIX_RE.test(String(value || ''));
  }

  function queueOutputNameSuffix(id) {
    const numeric = Math.max(0, Math.floor(Number(id) || 0));
    return `-whisper-q${String(numeric).padStart(4, '0')}`;
  }

  let fallbackJobSequence = 0;
  function createJobId() {
    const cryptoObject = typeof globalThis !== 'undefined' ? globalThis.crypto : null;
    if (cryptoObject && typeof cryptoObject.randomUUID === 'function') return cryptoObject.randomUUID();
    fallbackJobSequence += 1;
    return `job-${Date.now().toString(36)}-${fallbackJobSequence.toString(36)}`;
  }

  function activeQueueItem(state) {
    if (!state || state.currentQueueId === null || state.currentQueueId === undefined) return null;
    return Array.isArray(state.queue)
      ? state.queue.find((item) => item && item.id === state.currentQueueId) || null
      : null;
  }

  function beginQueueRun(state, item, jobId) {
    if (!state || !item || !jobId) return { accepted: false, reason: 'invalid' };
    if (!state.queueRunning || state.running || state.currentQueueId !== null || item.status !== 'pending') {
      return { accepted: false, reason: 'busy' };
    }
    const generation = Number(item.runGeneration || 0) + 1;
    item.runGeneration = generation;
    item.startCount = Number(item.startCount || 0) + 1;
    item.activeRun = {
      id: jobId,
      generation,
      terminal: null,
      terminalCount: 0,
      closed: false,
    };
    if (!Array.isArray(item.runs)) item.runs = [];
    item.runs.push(item.activeRun);
    item.status = 'running';
    state.currentQueueId = item.id;
    state.activeJobId = jobId;
    state.running = true;
    state.cancelled = false;
    return { accepted: true, item, run: item.activeRun };
  }

  function eventMatchesActiveJob(state, event) {
    return !!state && !!event && typeof event.jobId === 'string'
      && event.jobId.length > 0 && event.jobId === state.activeJobId;
  }

  function applyQueueRunEvent(state, event) {
    const item = activeQueueItem(state);
    const run = item && item.activeRun;
    if (!run || !event || event.jobId !== run.id || event.jobId !== state.activeJobId) {
      return { accepted: false, stale: true };
    }

    if (RESULT_EVENTS.has(event.type)) {
      if (state.cancelled) return { accepted: false, cancelled: true, item, run };
      if (run.closed || run.terminal) return { accepted: false, duplicate: true, item, run };
      run.terminal = event.type;
      run.terminalCount += 1;
      item.status = event.type;
      if (event.type === 'done') {
        item.files = Array.isArray(event.files) ? event.files.slice() : [];
        item.warnings = Array.isArray(event.warnings) ? event.warnings.slice() : [];
      }
      return { accepted: true, terminal: true, outcome: run.terminal, item, run };
    }

    if (event.type !== 'exit') return { accepted: true, item, run };
    if (run.closed) return { accepted: false, duplicate: true, item, run };

    let synthesizedTerminal = false;
    if (!run.terminal) {
      synthesizedTerminal = true;
      run.terminal = state.cancelled || event.cancelled ? 'cancelled' : 'error';
      run.terminalCount += 1;
      item.status = run.terminal === 'cancelled' ? 'pending' : 'error';
    }
    run.closed = true;
    const outcome = run.terminal;
    state.currentQueueId = null;
    state.activeJobId = null;
    state.running = false;
    state.cancelled = false;
    return { accepted: true, closed: true, outcome, synthesizedTerminal, item, run };
  }

  function assertQueueInvariants(state) {
    if (!state || !Array.isArray(state.queue)) throw new Error('Kuyruk durumu geçersiz.');
    const openRuns = state.queue.filter((item) => item && item.activeRun && !item.activeRun.closed);
    if (openRuns.length > 1) throw new Error('Birden fazla açık kuyruk çalışması var.');
    for (const item of state.queue) {
      if (!item || !item.activeRun) continue;
      const runs = item.runs || [item.activeRun];
      if (Number(item.startCount || 0) !== Number(item.runGeneration || 0)
          || runs.length !== Number(item.runGeneration || 0)) {
        throw new Error('Bir generation birden fazla kez başladı veya sayaçlar ayrıştı.');
      }
      for (let index = 0; index < runs.length; index++) {
        const run = runs[index];
        if (run.generation !== index + 1) throw new Error('Çalışma generation sırası bozuldu.');
        if (run.terminalCount > 1) throw new Error('Bir çalışma birden fazla terminale ulaştı.');
      }
    }
    const hasCurrent = state.currentQueueId !== null && state.currentQueueId !== undefined;
    if (state.running !== hasCurrent) throw new Error('UI busy ve aktif kuyruk kimliği ayrıştı.');
    if (hasCurrent && (!state.activeJobId || openRuns.length !== 1)) {
      throw new Error('Aktif kuyruk çalışmasının süreç kimliği yok.');
    }
    if (!hasCurrent && state.activeJobId) throw new Error('Kapalı kuyrukta süreç kimliği kaldı.');
    return true;
  }

  function createSingleFlightScheduler(task, timer = setTimeout) {
    if (typeof task !== 'function' || typeof timer !== 'function') throw new TypeError('Görev ve zamanlayıcı gerekli.');
    let scheduled = false;
    let running = false;
    let rerun = false;
    let rerunDelay = 0;

    const arm = (delay) => {
      scheduled = true;
      timer(async () => {
        scheduled = false;
        if (running) {
          rerun = true;
          rerunDelay = Math.min(rerunDelay || delay, delay);
          return;
        }
        running = true;
        try {
          await task();
        } finally {
          running = false;
          if (rerun) {
            const nextDelay = rerunDelay;
            rerun = false;
            rerunDelay = 0;
            arm(nextDelay);
          }
        }
      }, Math.max(0, Number(delay) || 0));
    };

    return {
      request(delay = 0) {
        if (scheduled) return false;
        if (running) {
          rerun = true;
          const normalized = Math.max(0, Number(delay) || 0);
          rerunDelay = rerunDelay ? Math.min(rerunDelay, normalized) : normalized;
          return false;
        }
        arm(delay);
        return true;
      },
      snapshot() { return { scheduled, running, rerun }; },
    };
  }

  function createProcessTerminalLatch(jobId) {
    if (typeof jobId !== 'string' || !jobId) throw new TypeError('Süreç kimliği gerekli.');
    const state = {
      jobId,
      terminalType: null,
      terminalCount: 0,
      cancelRequested: false,
      closed: false,
    };
    return {
      state,
      acceptTerminal(type) {
        if (!RESULT_EVENTS.has(type) || state.closed || state.terminalType || state.cancelRequested) return false;
        state.terminalType = type;
        state.terminalCount += 1;
        return true;
      },
      requestCancel() {
        if (state.closed || state.terminalType) return false;
        state.cancelRequested = true;
        return true;
      },
      close(code, stderr = '') {
        if (state.closed) return { accepted: false, duplicate: true };
        let syntheticTerminal = null;
        if (!state.terminalType && !state.cancelRequested) {
          state.terminalType = 'error';
          state.terminalCount += 1;
          syntheticTerminal = {
            type: 'error',
            message: code === 0
              ? 'Backend başarı veya hata terminal olayı göndermeden kapandı.'
              : `Backend çıkış kodu ${code} ile terminal olayı göndermeden kapandı.`,
          };
        } else if (!state.terminalType) {
          state.terminalType = 'cancelled';
          state.terminalCount += 1;
        }
        state.closed = true;
        return {
          accepted: true,
          syntheticTerminal,
          exitEvent: {
            type: 'exit', code, stderr, cancelled: state.cancelRequested, jobId,
          },
        };
      },
    };
  }

  return {
    applyQueueRunEvent,
    assertQueueInvariants,
    beginQueueRun,
    cloneValue,
    createJobId,
    createProcessTerminalLatch,
    createSingleFlightScheduler,
    eventMatchesActiveJob,
    isValidOutputNameSuffix,
    queueOutputNameSuffix,
    snapshotOptions,
  };
}));
