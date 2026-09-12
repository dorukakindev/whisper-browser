(() => {
  'use strict';
  if (!window.api || window.api.resourceSoakMode !== true) return;

  const originalAdd = EventTarget.prototype.addEventListener;
  const originalRemove = EventTarget.prototype.removeEventListener;
  const originalSetTimeout = window.setTimeout.bind(window);
  const originalClearTimeout = window.clearTimeout.bind(window);
  const originalSetInterval = window.setInterval.bind(window);
  const originalClearInterval = window.clearInterval.bind(window);
  const listenerEntries = new WeakMap();
  let listenerRecords = [];
  const timeouts = new Set();
  const intervals = new Set();

  const weakReference = value => typeof WeakRef === 'function'
    ? new WeakRef(value) : { deref: () => value };
  const listenerTargetLabel = target => {
    if (target === window) return 'window';
    if (target === document) return 'document';
    const id = typeof target?.id === 'string' && target.id ? `#${target.id}` : '';
    const nodeName = String(target?.nodeName || target?.constructor?.name || 'EventTarget').toLowerCase();
    return `${nodeName}${id}`;
  };
  const activeListenerSnapshot = () => {
    let count = 0;
    const breakdown = {};
    listenerRecords = listenerRecords.filter(record => {
      if (!record.active) return false;
      const target = record.target.deref();
      const listener = record.listener.deref();
      if (!target || !listener) return false;
      // replaceChildren ile çıkarılan sekme/favicon düğümleri artık etkin bir
      // dinleyici yüzeyi değildir. Eski sayaç bunları GC sonrasında bile sonsuza
      // dek saydığı için hibernasyon soak'ında sahte sızıntı üretiyordu.
      if (typeof Node === 'function' && target instanceof Node && !target.isConnected) return false;
      count++;
      const key = `${record.targetLabel}|${record.type}`;
      breakdown[key] = (breakdown[key] || 0) + 1;
      return true;
    });
    return { count, breakdown };
  };

  const captureFlag = options => typeof options === 'boolean' ? options : !!(options && options.capture);
  EventTarget.prototype.addEventListener = function trackedAddEventListener(type, listener, options) {
    if (listener) {
      let entries = listenerEntries.get(this);
      if (!entries) { entries = []; listenerEntries.set(this, entries); }
      const capture = captureFlag(options);
      if (!entries.some(entry => entry.type === type && entry.listener === listener && entry.capture === capture)) {
        const tracked = { active: true, target: weakReference(this),
          listener: weakReference(listener), type: String(type), targetLabel: listenerTargetLabel(this) };
        // `listener` yalnız WeakMap'teki hedefe bağlı yerel kayıtta güçlüdür;
        // global tarama dizisi hedefi veya callback'i hayatta tutmaz.
        const record = { type, listener, capture, tracked };
        entries.push(record);
        listenerRecords.push(tracked);
      }
    }
    return originalAdd.call(this, type, listener, options);
  };
  EventTarget.prototype.removeEventListener = function trackedRemoveEventListener(type, listener, options) {
    const entries = listenerEntries.get(this);
    const capture = captureFlag(options);
    if (entries) {
      const index = entries.findIndex(entry => entry.type === type
        && entry.listener === listener && entry.capture === capture);
      if (index >= 0) {
        const [record] = entries.splice(index, 1);
        record.tracked.active = false;
      }
    }
    return originalRemove.call(this, type, listener, options);
  };
  window.setTimeout = function trackedSetTimeout(callback, delay, ...args) {
    if (typeof callback !== 'function') return originalSetTimeout(callback, delay, ...args);
    let handle = null;
    handle = originalSetTimeout((...callbackArgs) => {
      timeouts.delete(handle);
      callback(...callbackArgs);
    }, delay, ...args);
    timeouts.add(handle);
    return handle;
  };
  window.clearTimeout = function trackedClearTimeout(handle) {
    timeouts.delete(handle);
    return originalClearTimeout(handle);
  };
  window.setInterval = function trackedSetInterval(callback, delay, ...args) {
    const handle = originalSetInterval(callback, delay, ...args);
    intervals.add(handle);
    return handle;
  };
  window.clearInterval = function trackedClearInterval(handle) {
    intervals.delete(handle);
    return originalClearInterval(handle);
  };
  Object.defineProperty(window, '__whisperResourceSoakSnapshot', {
    configurable: false,
    enumerable: false,
    value: () => {
      const listenerSnapshot = activeListenerSnapshot();
      return {
        listeners: listenerSnapshot.count,
        listenerBreakdown: listenerSnapshot.breakdown,
        timeouts: timeouts.size,
        intervals: intervals.size,
        totalTimers: timeouts.size + intervals.size,
      };
    },
  });
})();
