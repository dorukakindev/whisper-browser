'use strict';

// #181 FLAG_0002: sayfa çevirisi "Önizleme" düğmesinin tıklama yolu —
// gerçek dinleyici kaynağı (addEventListener satırı) VM'de çalıştırılır:
// ilk tıklama API'yi çağırıp paneli açar + etiketi 'Önizlemeyi gizle' yapar;
// ikinci tıklama paneli kapatıp durumu sıfırlar. Sağlayıcı gerekmez (api stub).

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const RENDERER = fs.readFileSync(path.join(__dirname, '..', 'src', 'renderer', 'renderer.js'), 'utf8');
// renderBrowserPagePreview + previewBrowserPage dilimi (renderBrowserPageReport'a dek).
const FN_SRC = RENDERER.slice(
  RENDERER.indexOf('function renderBrowserPagePreview'),
  RENDERER.indexOf('function renderBrowserPageReport'),
);
// Gerçek tıklama dinleyicisi: $('browserPagePreview')?.addEventListener('click', ...) satırı.
const CLICK_SRC = (() => {
  const start = RENDERER.indexOf("$('browserPagePreview')?.addEventListener('click'");
  const endMarker = "Önizlemeyi gizle';\n});";
  const end = RENDERER.indexOf(endMarker, start);
  assert.ok(start > 0 && end > start, 'önizleme dinleyici kaynağı bulunamadı');
  return RENDERER.slice(start, end + endMarker.length);
})();

function makeHarness({ apiResult } = {}) {
  const apiCalls = [];
  const elements = {};
  const el = (id) => elements[id] || (elements[id] = {
    id,
    hidden: true,
    children: [],
    innerHTML: '',
    textContent: '',
    listeners: {},
    replaceChildren() { this.children = []; },
    addEventListener(type, fn) { (this.listeners[type] = this.listeners[type] || []).push(fn); },
    getAttribute() { return null; },
  });
  const tabState = { generation: 7, browserPagePreview: null };
  const player = {
    browserActiveTabId: 't1',
    browserPageScope: 'article',
    browserPagePreview: null,
  };
  const ctx = vm.createContext({
    document: { activeElement: null },
    window: { api: { previewBrowserPageTranslation: async (tabId, opts) => {
      apiCalls.push({ tabId, opts });
      return apiResult === undefined
        ? { ok: true, totalBlocks: 5, apiBlocks: 2, memoryBlocks: 1, excludedBlocks: 0, pendingBlocks: 2, apiCharacters: 120 }
        : apiResult;
    } } },
    $: (id) => (id === 'browserPagePreview' || id === 'browserPagePreviewPanel' ? el(id) : null),
    player,
    browserTabState: (id) => (id === undefined || id === 't1' ? tabState : null),
    loadBrowserPagePrefs: () => ({ lockedTerms: [], excludedSections: [], excludedSelectors: [], pageCharacterBudget: 0 }),
    effectiveBrowserProfile: () => ({ values: { pageTargetLanguage: 'tr' } }),
    browserPagePreviewSeq: 0,
    escapeHtml: (s) => s,
    Number, String, Math, Promise, JSON,
  });
  vm.runInContext(`${FN_SRC}\n${CLICK_SRC}`, ctx);
  const button = el('browserPagePreview');
  button.textContent = 'Önizlemeyi göster';
  const panel = el('browserPagePreviewPanel');
  const click = () => button.listeners.click.at(-1)({ currentTarget: button });
  return { ctx, apiCalls, button, panel, player, tabState, click };
}

test('ilk tıklama API\'yi çağırır, paneli açar ve etiketi gizle moduna çevirir', async () => {
  const { apiCalls, button, panel, player, tabState, click } = makeHarness();
  await click();
  assert.equal(apiCalls.length, 1, 'önizleme IPC çağrısı beklenir');
  assert.equal(apiCalls[0].tabId, 't1');
  assert.equal(apiCalls[0].opts.targetLanguage, 'tr');
  assert.equal(panel.hidden, false, 'panel açılmalı');
  assert.match(panel.innerHTML, /5 blok bulundu/, 'özet içeriği yazılmalı');
  assert.equal(button.textContent, 'Önizlemeyi gizle');
  assert.ok(player.browserPagePreview?.ok, 'sonuç duruma yazılmalı');
  assert.equal(tabState.browserPagePreview.totalBlocks, 5, 'sekme önbelleğine kopyalanmalı');
});

test('ikinci tıklama paneli kapatır ve durumu sıfırlar (API çağrısı yok)', async () => {
  const { apiCalls, button, panel, player, tabState, click } = makeHarness();
  await click();
  await click();
  assert.equal(apiCalls.length, 1, 'kapatma API çağırmamalı');
  assert.equal(panel.hidden, true, 'panel kapanmalı');
  assert.equal(button.textContent, 'Önizlemeyi göster');
  assert.equal(player.browserPagePreview, null);
  assert.equal(tabState.browserPagePreview, null, 'sekme önbelleği de sıfırlanmalı');
});

test('API hatası panelde metin olarak gösterilir, durum boş kalır', async () => {
  const { apiCalls, panel, player, click } = makeHarness({ apiResult: { ok: false, error: 'sağlayıcı kapalı' } });
  await click();
  assert.equal(apiCalls.length, 1);
  assert.equal(panel.hidden, false);
  assert.equal(panel.textContent, 'sağlayıcı kapalı');
  assert.equal(player.browserPagePreview, null);
});
