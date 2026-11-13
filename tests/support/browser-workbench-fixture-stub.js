// Kontrollü Browser çalışma tezgâhı: discover stub'ının window.api'sini sarar ve tek sentetik sekme
// (https://workbench.test/watch) döndürür. Gerçek WebContentsView/medya/IPC yoktur; yalnız renderer
// araç çubuğu, menü ve panel yerleşimini sınar. Yalnız tests/ içindeki Chromium düzeneği içindir.
(() => {
  'use strict';
  const base = window.api;
  const fx = window.__fx || (window.__fx = { calls: [] });
  fx.browserTab = { id: 1, generation: 1, url: 'https://workbench.test/watch', title: 'Offline video fixture', loading: false,
    canGoBack: false, canGoForward: false, captureEnabled: true };
  const tabs = () => [{ ...fx.browserTab }];
  const extra = {
    async showBrowser() { return { ok: true, tabs: tabs(), activeTabId: fx.browserTab.id, hasPage: true, captureEnabled: true, places: { bookmarks: [], history: [] } }; },
    async listBrowserTabs() { return { ok: true, tabs: tabs(), activeTabId: fx.browserTab.id }; },
    async hideBrowser() { return { ok: true }; },
    async setBrowserBounds() { return { ok: true }; },
    async setBrowserCaptureEnabled(_, enabled) { return { ok: true, enabled: !!enabled }; },
  };
  window.api = new Proxy({}, { get(_, key) {
    if (key === 'then') return undefined;
    if (extra[key]) return (...args) => { fx.calls.push({ api: String(key) }); return Promise.resolve(extra[key](...args)); };
    return base[key];
  } });
})();
