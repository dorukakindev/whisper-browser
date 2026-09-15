const { ipcRenderer } = require('electron');

// Bu fonksiyon ziyaret edilen sayfanın ana JavaScript dünyasına açılmaz.
// Yalnız Electron'ın izole preload dünyasında çalışan manga/altyazı katmanı
// kalıcı düzenleme isteklerini ana sürece gönderebilir.
Object.defineProperty(globalThis, '__whisperTrustedBridgeSend', {
  configurable: false,
  enumerable: false,
  writable: false,
  value(type, payload) {
    if (!['manga-edit', 'overlay-style', 'subtitle-control', 'page-blocks', 'page-action', 'reading-position'].includes(type)) return false;
    ipcRenderer.send('browser:trusted-bridge', { type, payload });
    return true;
  },
});

// Chromium's default middle/Ctrl-click navigation can become a popup in
// embedded players. Capture only explicit new-tab gestures and route them to
// the owning browser tab; normal clicks, downloads and target=_blank popups
// retain the site's native behaviour.
function isNewTabLinkGesture(event = {}) {
  const button = Number(event.button);
  return button === 1 || (button === 0 && (!!event.ctrlKey || !!event.metaKey));
}

function linkElementFromEvent(event) {
  const path = typeof event.composedPath === 'function' ? event.composedPath() : [];
  for (const node of path) {
    if (node && node.nodeType === 1 && node.tagName === 'A' && node.href) return node;
  }
  const target = event.target;
  return target && typeof target.closest === 'function' ? target.closest('a[href]') : null;
}

function handleNewTabLink(event) {
  if (!event.isTrusted) return;
  if (!isNewTabLinkGesture(event)) return;
  const anchor = linkElementFromEvent(event);
  if (!anchor || anchor.hasAttribute('download')) return;
  let parsed;
  try { parsed = new URL(anchor.href, location.href); } catch (_) { return; }
  if (!['http:', 'https:'].includes(parsed.protocol)) return;
  event.preventDefault();
  event.stopImmediatePropagation();
  ipcRenderer.send('browser:open-link', { url: parsed.href });
}

window.addEventListener('click', handleNewTabLink, true);
window.addEventListener('auxclick', handleNewTabLink, true);

// Altyazı keşfinin normal yolu sayfa olaylarıdır. Preload yalnız küçük ve
// içeriksiz sinyaller yollar; cue metni, URL veya sayfa HTML'i IPC'ye taşınmaz.
// Ana süreç sender + güncel sekme/generation denetiminden sonra gerçek probe'u
// kendi izole betiğiyle yapar. Olay vermeyen siteler için düşük frekanslı
// fallback probe main süreçte ayrıca korunur.
let discoveryObserver = null;
let discoveryFlushTimer = null;
const discoveryPending = new Map();
const observedMedia = new WeakSet();
const observedTracks = new WeakSet();

function discoveryCounts(video, track) {
  const tracks = video?.textTracks ? [...video.textTracks] : [];
  return {
    mediaCount: Math.min(1000, document.querySelectorAll('video').length),
    trackCount: Math.min(1000, tracks.length),
    cueCount: Math.min(20000, Number(track?.cues?.length) || 0),
  };
}

function signalBrowserDiscovery(type, details = {}) {
  discoveryPending.set(type, { type, ...details });
  if (discoveryFlushTimer) return;
  discoveryFlushTimer = setTimeout(() => {
    discoveryFlushTimer = null;
    for (const payload of discoveryPending.values()) ipcRenderer.send('browser:discovery-signal', payload);
    discoveryPending.clear();
  }, 80);
}

function observeTextTrack(video, track) {
  if (!track || observedTracks.has(track)) return;
  observedTracks.add(track);
  const report = () => signalBrowserDiscovery(
    track.cues && track.cues.length ? 'cue_list_growing' : 'track_candidate_found',
    discoveryCounts(video, track));
  try { track.addEventListener('cuechange', report); } catch (_) {}
  report();
}

function observeVideo(video) {
  if (!video || observedMedia.has(video)) return;
  observedMedia.add(video);
  signalBrowserDiscovery('video_found', discoveryCounts(video));
  const metadata = () => {
    const details = discoveryCounts(video);
    signalBrowserDiscovery('media_metadata_ready', details);
    for (const track of [...(video.textTracks || [])]) observeTextTrack(video, track);
  };
  for (const eventName of ['loadedmetadata', 'durationchange', 'canplay', 'loadeddata', 'progress']) {
    video.addEventListener(eventName, metadata, { passive: true });
  }
  try {
    video.textTracks?.addEventListener('addtrack', (event) => {
      signalBrowserDiscovery('track_candidate_found', discoveryCounts(video, event.track));
      observeTextTrack(video, event.track);
    });
  } catch (_) {}
  if (video.readyState >= 1) metadata();
}

function scanAddedVideos(node) {
  if (!node || node.nodeType !== 1) return;
  if (node.tagName === 'VIDEO') observeVideo(node);
  for (const video of node.querySelectorAll?.('video') || []) observeVideo(video);
}

function startBrowserDiscoveryObserver() {
  signalBrowserDiscovery('document_ready', { mediaCount: document.querySelectorAll('video').length });
  for (const video of document.querySelectorAll('video')) observeVideo(video);
  if (!document.documentElement || typeof MutationObserver !== 'function') return;
  discoveryObserver = new MutationObserver((records) => {
    for (const record of records) for (const node of record.addedNodes) scanAddedVideos(node);
  });
  discoveryObserver.observe(document.documentElement, { subtree: true, childList: true });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', startBrowserDiscoveryObserver, { once: true });
} else startBrowserDiscoveryObserver();

window.addEventListener('pagehide', () => {
  discoveryObserver?.disconnect();
  discoveryObserver = null;
  if (discoveryFlushTimer) clearTimeout(discoveryFlushTimer);
  discoveryFlushTimer = null;
  discoveryPending.clear();
}, { once: true });

// Native find-in-page does not always recalculate when an SPA appends text
// after the initial search. Keep a small, opt-in observer: the main process
// enables it only while the find bar has a live query, and the debounce keeps
// infinite-scroll pages from flooding IPC.
let pageFindObserver = null;
let pageFindMutationTimer = null;
let pageFindObserverEnabled = false;
function stopPageFindObserver() {
  pageFindObserverEnabled = false;
  if (pageFindMutationTimer) clearTimeout(pageFindMutationTimer);
  pageFindMutationTimer = null;
  if (pageFindObserver) pageFindObserver.disconnect();
  pageFindObserver = null;
}
function startPageFindObserver() {
  if (pageFindObserverEnabled && pageFindObserver) return;
  stopPageFindObserver();
  const root = document.documentElement;
  if (!root || typeof MutationObserver !== 'function') return;
  pageFindObserverEnabled = true;
  pageFindObserver = new MutationObserver(() => {
    if (!pageFindObserverEnabled || pageFindMutationTimer) return;
    pageFindMutationTimer = setTimeout(() => {
      pageFindMutationTimer = null;
      if (pageFindObserverEnabled) ipcRenderer.send('browser:page-mutated');
    }, 350);
  });
  pageFindObserver.observe(root, { subtree: true, childList: true, characterData: true });
}
ipcRenderer.on('browser:find-state', (_event, payload = {}) => {
  if (payload.active) startPageFindObserver();
  else stopPageFindObserver();
});

// Yalnız konumun değiştiğini bildir. Görsel kimliği/oranı ana süreç,
// güvenilir isolated world içinde yeniden okuyup doğrular.
let readingPositionTimer = null;
window.addEventListener('scroll', () => {
  if (readingPositionTimer) return;
  readingPositionTimer = setTimeout(() => {
    readingPositionTimer = null;
    if (!document.querySelector('[data-whisper-manga-id]')) return;
    ipcRenderer.send('browser:trusted-bridge', { type: 'reading-position', payload: null });
  }, 700);
}, { passive: true, capture: true });

function browserPageResourceTelemetry() {
  const activeTimers = [discoveryFlushTimer, pageFindMutationTimer, readingPositionTimer].filter(Boolean).length;
  const mutationObservers = [discoveryObserver, pageFindObserver].filter(Boolean).length;
  return {
    measured: true,
    activeTimers,
    observerCount: mutationObservers,
    mutationObservers,
    resizeObservers: 0,
    mediaListeners: 0,
    overlayNodes: 0,
    pendingFrames: 0,
  };
}

ipcRenderer.on('browser:resource-snapshot-request', (_event, payload = {}) => {
  const requestId = String(payload.requestId || '').slice(0, 96);
  if (!requestId) return;
  ipcRenderer.send('browser:resource-snapshot-response', { requestId, ...browserPageResourceTelemetry() });
});

window.addEventListener('pagehide', () => {
  stopPageFindObserver();
  if (readingPositionTimer) clearTimeout(readingPositionTimer);
  readingPositionTimer = null;
}, { once: true });
