'use strict';

// Self-contained: contextBridge serializes this function into the page world.
// No Node objects, IPC functions, credentials or file access cross the bridge.
function installYoutubeAdGuard(policy = {}) {
  if (!/(^|\.)youtube\.com$/i.test(location.hostname)
      || !/^https?:$/.test(location.protocol)) return { active: false };
  const key = '__whisperYoutubeAdGuard';
  const previous = window[key];
  if (previous?.active && policy.enabled === true) return { active: true };
  if (previous) previous.dispose();
  if (policy.enabled !== true) return { active: false };

  const nativeParse = JSON.parse;
  const nativeStringify = JSON.stringify;
  const hasOwn = (value, name) => Object.prototype.hasOwnProperty.call(value, name);
  const fields = ['adPlacements', 'playerAds', 'adSlots', 'adBreakHeartbeatParams'];
  const adRenderers = ['adSlotRenderer', 'displayAdRenderer', 'promotedSparklesWebRenderer',
    'promotedSparklesTextSearchRenderer', 'inFeedAdLayoutRenderer', 'promotedVideoRenderer'];
  const marker = /"(?:adPlacements|playerAds|adSlots|adBreakHeartbeatParams|adSlotRenderer|displayAdRenderer|promotedSparklesWebRenderer|promotedSparklesTextSearchRenderer|inFeedAdLayoutRenderer|promotedVideoRenderer)"/;
  const state = { active: true, installedAt: document.readyState, pruned: 0, hidden: 0 };
  const restorers = [];
  const hidden = new Map();
  let timer = null;
  let observer = null;
  const isAdEntry = entry => entry && typeof entry === 'object' && (
    adRenderers.some(name => hasOwn(entry, name))
    || [entry.richItemRenderer?.content, entry.richSectionRenderer?.content]
      .some(content => content && adRenderers.some(name => hasOwn(content, name))));

  const prune = (value) => {
    if (!state.active || !value || typeof value !== 'object') return value;
    // Only these explicit ad keys are removed. Captions, streaming URLs,
    // tracking data, video metadata and playability errors stay untouched.
    const stack = [{ value, depth: 0 }];
    let visited = 0;
    try {
      while (stack.length && visited++ < 20000) {
        const { value: item, depth } = stack.pop();
        if (!item || typeof item !== 'object' || depth > 24) continue;
        if (Array.isArray(item)) {
          for (let i = item.length - 1; i >= 0; i--) {
            const entry = item[i];
            if (isAdEntry(entry)) {
              item.splice(i, 1); state.pruned++;
            } else if (entry && typeof entry === 'object') stack.push({ value: entry, depth: depth + 1 });
          }
        } else {
          for (const name of fields) if (hasOwn(item, name)) { delete item[name]; state.pruned++; }
          for (const name of Object.keys(item)) {
            if (adRenderers.includes(name)) { delete item[name]; state.pruned++; }
            else if (item[name] && typeof item[name] === 'object') stack.push({ value: item[name], depth: depth + 1 });
          }
        }
      }
    } catch (_) { /* Frozen objects/custom revivers must keep normal JSON semantics. */ }
    return value;
  };
  const apiUrl = (raw) => {
    try {
      const url = new URL(raw, location.href);
      return /(^|\.)youtube\.com$/i.test(url.hostname)
        && /^\/youtubei\/v1\/(?:player|browse|next|search|reel_watch_sequence)(?:\/|$)/.test(url.pathname);
    } catch (_) { return false; }
  };
  const wrapMethod = (target, name, create) => {
    const original = target?.[name];
    if (typeof original !== 'function') return;
    const wrapped = create(original);
    try {
      target[name] = wrapped;
      restorers.push(() => { if (target[name] === wrapped) target[name] = original; });
    } catch (_) {}
  };
  wrapMethod(JSON, 'parse', original => new Proxy(original, { apply(target, receiver, args) {
    const value = Reflect.apply(target, receiver, args);
    return typeof args[0] === 'string' && marker.test(args[0]) ? prune(value) : value;
  } }));
  wrapMethod(window.Response?.prototype, 'json', original => new Proxy(original, { apply(target, receiver, args) {
    return Reflect.apply(target, receiver, args).then(value => apiUrl(receiver.url) ? prune(value) : value);
  } }));
  // XHR's responseType=json bypasses the public JSON.parse function.
  for (const name of ['response', 'responseText']) {
    const target = window.XMLHttpRequest?.prototype;
    const descriptor = target && Object.getOwnPropertyDescriptor(target, name);
    if (!descriptor?.get || !descriptor.configurable) continue;
    const getter = function() {
      const value = descriptor.get.call(this);
      if (!state.active || !apiUrl(this.responseURL)) return value;
      if (value && typeof value === 'object' && this.responseType === 'json') return prune(value);
      if (typeof value !== 'string' || !marker.test(value)) return value;
      try { return nativeStringify(prune(nativeParse(value))); } catch (_) { return value; }
    };
    try {
      Object.defineProperty(target, name, { ...descriptor, get: getter });
      restorers.push(() => {
        if (Object.getOwnPropertyDescriptor(target, name)?.get === getter)
          Object.defineProperty(target, name, descriptor);
      });
    } catch (_) {}
  }
  // These are frequently assigned as object literals in the first inline script;
  // waiting for an asynchronous main-process injection misses that assignment.
  for (const name of ['ytInitialPlayerResponse', 'ytInitialData']) {
    const descriptor = Object.getOwnPropertyDescriptor(window, name);
    if (descriptor && (!descriptor.configurable || descriptor.get || descriptor.set)) continue;
    let value = prune(descriptor?.value);
    const getter = () => value;
    try {
      Object.defineProperty(window, name, { configurable: true, enumerable: descriptor?.enumerable ?? true,
        get: getter, set: next => { value = prune(next); } });
      restorers.push(() => {
        if (Object.getOwnPropertyDescriptor(window, name)?.get !== getter) return;
        Object.defineProperty(window, name, { ...(descriptor || { configurable: true, enumerable: true, writable: true }), value });
      });
    } catch (_) {}
  }

  const selectors = 'ytd-ad-slot-renderer,ytd-display-ad-renderer,ytd-promoted-sparkles-web-renderer,'
    + 'ytd-promoted-sparkles-text-search-renderer,ytd-promoted-video-renderer,ad-slot-renderer,'
    + 'ytm-promoted-sparkles-web-renderer,yt-ad-slot-view-model';
  const scan = () => {
    timer = null;
    if (!state.active) return;
    for (const [node] of hidden) if (!node.isConnected) hidden.delete(node);
    for (const node of document.querySelectorAll(selectors)) {
      // Collapse the ad's own grid cell, never a section containing normal videos.
      const cell = node.closest('ytd-rich-item-renderer,ytd-video-renderer,ytd-compact-video-renderer,ytm-rich-item-renderer') || node;
      if (hidden.has(cell) || hidden.size >= 500) continue;
      hidden.set(cell, { value: cell.style.getPropertyValue('display'), priority: cell.style.getPropertyPriority('display') });
      cell.style.setProperty('display', 'none', 'important');
      state.hidden++;
    }
  };
  const schedule = () => { if (timer === null && state.active) timer = setTimeout(scan, 150); };
  observer = new MutationObserver(schedule);
  observer.observe(document, { childList: true, subtree: true });
  document.addEventListener('DOMContentLoaded', scan, { once: true });
  document.addEventListener('yt-navigate-finish', schedule);
  const onHide = event => { if (!event.persisted) state.dispose(); };
  window.addEventListener('pagehide', onHide);
  state.dispose = () => {
    state.active = false;
    if (timer !== null) clearTimeout(timer);
    observer.disconnect();
    document.removeEventListener('DOMContentLoaded', scan);
    document.removeEventListener('yt-navigate-finish', schedule);
    window.removeEventListener('pagehide', onHide);
    for (const [node, old] of hidden) {
      if (node.style.getPropertyValue('display') === 'none' && node.style.getPropertyPriority('display') === 'important') {
        if (old.value) node.style.setProperty('display', old.value, old.priority);
        else node.style.removeProperty('display');
      }
    }
    hidden.clear();
    for (const restore of restorers.reverse()) { try { restore(); } catch (_) {} }
    if (window[key] === state) delete window[key];
  };
  Object.defineProperty(window, key, { configurable: true, value: state });
  if (document.readyState !== 'loading') scan();
  return { active: true, installedAt: state.installedAt };
}

if (typeof module !== 'undefined') module.exports = { installYoutubeAdGuard };
if (typeof window !== 'undefined' && window === window.top
    && /(^|\.)youtube\.com$/i.test(location.hostname)) {
  const { ipcRenderer, contextBridge } = require('electron');
  const apply = policy => {
    try { contextBridge.executeInMainWorld({ func: installYoutubeAdGuard, args: [policy || {}] }); }
    catch (_) { /* A guard failure must not prevent normal page playback. */ }
  };
  apply(ipcRenderer.sendSync('browser:youtube-guard:policy'));
  ipcRenderer.on('browser:youtube-guard:policy-changed', (_event, policy) => apply(policy));
}
