(function exposeBrowserTabs(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.BrowserTabs = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, () => {
  'use strict';

const BROWSER_TAB_ID = /^tab-[a-z0-9_-]{1,48}$/i;

function normalizeBrowserTabId(value) {
  const id = String(value || '').trim();
  return BROWSER_TAB_ID.test(id) ? id : '';
}

class BrowserTabEventGate {
  constructor() {
    this.contexts = new Map();
  }

  open(tabId, generation = 0, context = {}) {
    const id = normalizeBrowserTabId(tabId);
    if (!id) return false;
    this.contexts.set(id, {
      generation: Math.max(0, Number(generation) || 0),
      mediaId: String(context.mediaId || ''),
      acquisitionId: String(context.acquisitionId || ''),
    });
    return true;
  }

  close(tabId) {
    return this.contexts.delete(normalizeBrowserTabId(tabId));
  }

  generation(tabId) {
    return this.contexts.get(normalizeBrowserTabId(tabId))?.generation;
  }

  accept(event) {
    const id = normalizeBrowserTabId(event && event.tabId);
    if (!id || !this.contexts.has(id)) return false;
    const incoming = Math.max(0, Number(event && event.generation) || 0);
    const current = this.contexts.get(id);
    if (incoming < current.generation) return false;
    if (incoming > current.generation) {
      current.generation = incoming;
      current.mediaId = '';
      current.acquisitionId = '';
    }
    const mediaId = String(event && event.mediaId || '');
    const acquisitionId = String(event && event.acquisitionId || '');
    const establishesContext = event.type === 'capture-status' || event.type === 'navigation';
    if (current.mediaId && mediaId && current.mediaId !== mediaId) {
      // did-start-loading yeni kuşağı, yönlendirme tamamlanmadan önce eski
      // mediaId ile açabilir. Discovery+ gibi /topical -> /video/watch
      // geçişlerinde aynı kuşaktaki ilk durum/gezinme olayı yeni bağlamı
      // kurabilmelidir; normal altyazı/medya olayları ise eski kimlikle hâlâ
      // reddedilir.
      if (!establishesContext) return false;
      current.mediaId = '';
      current.acquisitionId = '';
    }
    if (current.acquisitionId && acquisitionId && current.acquisitionId !== acquisitionId) {
      if (!establishesContext) return false;
      current.acquisitionId = '';
    }
    if (mediaId) current.mediaId = mediaId;
    if (acquisitionId) current.acquisitionId = acquisitionId;
    return true;
  }
}

  return { BrowserTabEventGate, normalizeBrowserTabId };
});
