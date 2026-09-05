const { ipcRenderer } = require('electron');

// Bu fonksiyon ziyaret edilen sayfanın ana JavaScript dünyasına açılmaz.
// Yalnız Electron'ın izole preload dünyasında çalışan manga/altyazı katmanı
// kalıcı düzenleme isteklerini ana sürece gönderebilir.
Object.defineProperty(globalThis, '__whisperTrustedBridgeSend', {
  configurable: false,
  enumerable: false,
  writable: false,
  value(type, payload) {
    if (!['manga-edit', 'overlay-style', 'page-blocks'].includes(type)) return false;
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
