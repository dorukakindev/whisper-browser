'use strict';

// Native sayfa araması; DOM enjeksiyonu yok. Her WebContents kendi isteğini tutar.
function createBrowserPageFind(wc, emit, isActive = () => true) {
  let requestId = null, query = '', token = 0, observerOn = false;
  function setObserverEnabled(enabled) {
    observerOn = !!enabled;
    try {
      if (typeof wc.send === 'function' && !wc.isDestroyed()) {
        wc.send('browser:find-state', { active: !!enabled });
      }
    } catch (_) {}
  }
  function stop() {
    requestId = null;
    query = '';
    setObserverEnabled(false);
    try { if (!wc.isDestroyed()) wc.stopFindInPage('clearSelection'); } catch (_) {}
  }
  wc.on('found-in-page', (_event, result) => {
    if (requestId === null || result.requestId !== requestId) return;
    // R123-B4: Sayfa DOM gözlemcisi ilk kesin sonuçtan SONRA açılır. Aramadan
    // hemen önce sayfaya giden IPC mesajı Chromium'un found-in-page sonucunu
    // düşürüyordu; bulma çubuğu "Aranıyor…"da takılı kalıyordu.
    if (result.finalUpdate && !observerOn) setObserverEnabled(true);
    emit({ type: 'find-result', token, matches: result.matches,
      activeMatch: result.activeMatchOrdinal, final: !!result.finalUpdate });
  });
  wc.on('did-start-navigation', (event, _url, _inPlace, isMainFrame) => {
    if (!(event.isMainFrame ?? isMainFrame)) return;
    stop();
    emit({ type: 'find-reset' });
  });
  wc.on('before-input-event', (event, input) => {
    if (!isActive() || input.type !== 'keyDown' || input.isComposing || input.alt) return;
    if ((input.control || input.meta) && String(input.key).toLowerCase() === 'f') {
      event.preventDefault();
      emit({ type: 'find-open' });
    }
  });
  return {
    stop,
    find(value = {}) {
      if (!value || typeof value.text !== 'string' || value.text.length > 2000
          || !Number.isSafeInteger(value.token) || value.token < 0) {
        return { ok: false, error: 'Sayfa araması geçersiz veya çok uzun.' };
      }
      token = value.token;
      if (!value.text) { stop(); return { ok: true, empty: true }; }
      const continuing = value.next === true && query === value.text;
      // R123-B4: Yeni sorgudan hemen önce aynı görevde stopFindInPage çağırmak
      // Chromium'un yeni aramanın found-in-page sonucunu düşürmesine yol
      // açıyordu (bulma çubuğu "Aranıyor…"da takılı kalıyordu). findNext:false
      // zaten yeni oturum başlatır; açık durdurma yalnız kapatmada yapılır.
      if (!continuing) requestId = null;
      query = value.text;
      try {
        // Electron keeps the current find session only when findNext is true.
        // A new query starts a fresh session; repeated next/previous actions
        // must advance the existing session instead of resetting to match one.
        requestId = wc.findInPage(query, { forward: value.forward !== false, findNext: continuing });
        return { ok: true, requestId };
      } catch (error) { requestId = null; return { ok: false, error: error.message }; }
    },
    refresh() {
      if (requestId === null || !query) return { ok: true, unchanged: true };
      try {
        requestId = wc.findInPage(query, { forward: true, findNext: false });
        return { ok: true, requestId, refreshed: true };
      } catch (error) { requestId = null; return { ok: false, error: error.message }; }
    },
  };
}

module.exports = { createBrowserPageFind };
