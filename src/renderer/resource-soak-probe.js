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
  const timeouts = new Set();
  const intervals = new Set();
  let listenerCount = 0;

  const captureFlag = options => typeof options === 'boolean' ? options : !!(options && options.capture);
  EventTarget.prototype.addEventListener = function trackedAddEventListener(type, listener, options) {
    if (listener) {
      let entries = listenerEntries.get(this);
      if (!entries) { entries = []; listenerEntries.set(this, entries); }
      const capture = captureFlag(options);
      if (!entries.some(entry => entry.type === type && entry.listener === listener && entry.capture === capture)) {
        entries.push({ type, listener, capture });
        listenerCount++;
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
      if (index >= 0) { entries.splice(index, 1); listenerCount--; }
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
    value: () => ({
      listeners: listenerCount,
      timeouts: timeouts.size,
      intervals: intervals.size,
      totalTimers: timeouts.size + intervals.size,
    }),
  });
})();
