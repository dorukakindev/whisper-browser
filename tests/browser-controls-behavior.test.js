const assert = require('assert/strict');
const fs = require('fs');
const vm = require('vm');
const path = require('path');
const source = fs.readFileSync(path.join(__dirname, '../src/main.js'), 'utf8');
function extract(start, end, deps = {}) {
  const from = source.indexOf(start);
  const to = source.indexOf(end, from + start.length);
  assert(from >= 0 && to > from);
  const context = { URL, Buffer, path, console: { warn() {} }, ...deps };
  vm.runInNewContext(source.slice(from, to), context);
  return context;
}
(async () => {
  const cert = extract('function browserCertificateErrorMessage(', 'async function openBrowserLinkInNewTab');
  for (const code of ['ERR_CERT_AUTHORITY_INVALID', 'ERR_CERT_DATE_INVALID', 'ERR_CERT_COMMON_NAME_INVALID']) {
    const result = cert.browserCertificateErrorMessage(code);
    assert(result.includes('invalid'));
    assert(!result.includes('ınvalıd'));
  }
  const names = extract('function browserImageFileName(', 'async function saveBrowserContextImage');
  assert.equal(names.browserImageFileName('https://example.test/photo', 'image/png'), 'photo.png');
  assert.equal(names.browserImageFileName('https://example.test/photo.exe', 'image/webp'), 'photo.webp');
  assert.equal(names.browserImageFileName('https://example.test/a%3Fb.png'), 'a_b.png');

  const images = extract('async function saveBrowserContextImage(', 'function installBrowserContextMenu');
  for (const url of ['blob:https://example.test/id', 'data:image/png;base64,AA==']) {
    await assert.rejects(images.saveBrowserContextImage(null, url), /henüz kaydedilemiyor/);
  }

  const pageConfig = extract('function browserPageTranslationConfig(', 'function browserPageMemoryVersion', {
    browserTranslationConfig: () => ({ targetLanguage: 'de', workers: 2 }),
    loadSettings: () => ({ ui: { browserPageTarget: 'fr', browserPageMode: 'replace' } }),
  });
  const preferredPageConfig = pageConfig.browserPageTranslationConfig({});
  assert.equal(preferredPageConfig.targetLanguage, 'fr');
  assert.equal(preferredPageConfig.mode, 'replace');
  assert.equal(preferredPageConfig.view, 'translation');
  const overriddenPageConfig = pageConfig.browserPageTranslationConfig({
    targetLanguage: 'tr', mode: 'bilingual', view: 'original',
  });
  assert.equal(overriddenPageConfig.targetLanguage, 'tr');
  assert.equal(overriddenPageConfig.mode, 'bilingual');
  assert.equal(overriddenPageConfig.view, 'original');

  // Programatik history.goBack will-navigate üretmediği için uyumluluk tercihi
  // hedef sayfanın ağ isteğinden önce, burada açıkça uygulanmalı.
  {
    let releaseCompatibility;
    let markCompatibilityStarted;
    let compatibilityAccepted = true;
    const compatibilityGate = new Promise(resolve => { releaseCompatibility = resolve; });
    const compatibilityStarted = new Promise(resolve => { markCompatibilityStarted = resolve; });
    let wentBack = 0;
    let reloaded = 0;
    let suspensions = 0;
    const wc = {
      isDestroyed: () => false,
      reload() { reloaded += 1; },
      navigationHistory: {
        getActiveIndex: () => 1,
        getEntryAtIndex: index => ({ url: index === 0 ? 'https://protected.test/watch' : 'https://normal.test/' }),
        goBack() {
          assert.equal(tab.compatibilityMode, true, 'geçmiş hedefinin uyumluluk tercihi beklenmedi');
          wentBack += 1;
        },
      },
    };
    const view = { webContents: wc };
    const tab = { id: 'history', view, navigationRequestSeq: 0, compatibilityMode: false };
    const history = extract('function browserHistoryTargetUrl(', 'function installBrowserContextMenu', {
      normalizeBrowserUrl: value => value,
      browserCompatibilityModeForUrl: url => url.includes('protected'),
      setBrowserTabCompatibilityMode: async (item, enabled) => {
        markCompatibilityStarted();
        await compatibilityGate;
        if (compatibilityAccepted) item.compatibilityMode = enabled;
        return compatibilityAccepted;
      },
      browserTabById: id => id === tab.id ? tab : null,
      browserActiveTabId: tab.id,
      browserView: view,
      suspendBrowserInstrumentationForNavigation: () => { suspensions += 1; },
    });
    const goingBack = history.navigateBrowserHistory(tab, wc, 'back');
    await compatibilityStarted;
    assert.equal(wentBack, 0, 'uyumluluk hazırlığı sürerken geçmiş gezinmesi başladı');
    releaseCompatibility();
    assert.equal(await goingBack, true);
    assert.equal(wentBack, 1);
    assert.equal(suspensions, 1, 'geçmiş gezinmesinden önce debugger askıya alınmadı');
    compatibilityAccepted = false;
    tab.compatibilityMode = false;
    assert.equal(await history.navigateBrowserHistory(tab, wc, 'back'), false,
      'geçersiz kalan uyumluluk işi geçmiş gezinmesini durdurmadı');
    assert.equal(wentBack, 1);
    const previousSeq = tab.navigationRequestSeq;
    assert.equal(history.reloadBrowserTab(tab, wc), true);
    assert.equal(reloaded, 1);
    assert.equal(suspensions, 2, 'yenilemeden önce debugger askıya alınmadı');
    assert.equal(tab.navigationRequestSeq, previousSeq + 1, 'sağ tık yenile eski adres isteğini geçersiz kılmadı');
  }
  const events = [];
  const visibility = [];
  const drmTabs = [];
  const tabs = new Map([['old', { id: 'old' }]]);
  const links = extract('async function openBrowserLinkInNewTab(', 'function browserImageFileName', {
    normalizeBrowserUrl: value => value, browserTabs: tabs, MAX_SESSION_TABS: 2,
    browserTabsSnapshot: () => [...tabs.values()],
    browserActiveTabId: 'old', browserVisible: true, browserModalOccluded: false,
    createBrowserTabRecord() { const tab = { id: 'new' }; tabs.set('new', tab); return tab; },
    ensureBrowserView: tab => {
      const view = { setVisible: value => visibility.push(value),
        webContents: { isDestroyed: () => false, async loadURL() {
          assert.equal(tab.compatibilityMode, true, 'uyumluluk tercihi yüklemeden önce uygulanmadı');
        } } };
      tab.view = view;
      return view;
    },
    sendBrowserEvent: (...args) => events.push(args.at(-1)),
    setBrowserTabCompatibilityMode: async (tab, enabled) => { tab.compatibilityMode = enabled; return true; },
    browserCompatibilityModeForUrl: () => true,
    suspendBrowserInstrumentationForNavigation() {},
    async waitForProtectedPlayback(_url, tab) { drmTabs.push(tab); }, scheduleBrowserSessionSave() {},
  });
  for (const url of ['javascript:alert(1)', 'data:text/html,a', 'file:///C:/x', 'iki kelime']) {
    assert.equal(await links.openBrowserLinkInNewTab(url), false);
    assert.equal(tabs.size, 1, 'geçersiz link sekme oluşturdu');
  }
  events.length = 0;
  assert.equal(await links.openBrowserLinkInNewTab('https://example.test/'), true);
  assert.equal(events[0].activeTabId, 'old');
  assert.deepEqual(visibility, [false]);
  assert.equal(drmTabs[0].id, 'new', 'DRM bekleme olayı yeni sekmeye bağlanmalı');
  assert.equal(drmTabs[0].compatibilityMode, true,
    'programatik yeni sekme kayıtlı uyumluluk tercihini yüklemeden önce almalı');
  assert.equal(await links.openBrowserLinkInNewTab('https://example.test/2'), false);
  assert.equal(events.at(-1).type, 'notice');
  assert.equal(events.at(-1).success, false);

  const { clearBrowserSiteData } = require('../src/browser-session-privacy');
  for (const fail of [false, true]) {
    let origin;
    let valuesRead = false;
    const result = await clearBrowserSiteData({
      closeAllConnections: async () => {},
      clearData: async options => { origin = options.origins[0]; },
      clearStorageData: async () => { if (fail) throw new Error('disk'); },
      cookies: {
        get: async () => { valuesRead = true; return []; },
        flushStore: async () => {},
      },
    }, 'https://example.test/page');
    assert.equal(origin, 'https://example.test');
    assert.equal(valuesRead, false);
    assert.equal(result.ok, !fail);
    if (fail) { assert.equal(result.partial, true); assert(result.error); }
  }

  let menu, handler;
  const actions = [];
  const searches = [];
  const pageStarts = [];
  const browserEvents = [];
  const menuContext = extract('function installBrowserContextMenu(', 'function browserSubtitleDir', {
    mainWindow: {}, browserNavigationCapabilities: () => ({ canGoBack: false, canGoForward: false }),
    Menu: { buildFromTemplate(items) { menu = items; return { popup() {} }; } },
    clipboard: { writeText(text) { actions.push(text); } },
    openBrowserLinkInNewTab: async url => { searches.push(url); },
    queueBrowserTabTransition: work => work(),
    startBrowserPageTranslation: async (tab, options) => { pageStarts.push({ tab, options }); return { ok: true }; },
    sendBrowserEvent: (tab, event) => browserEvents.push({ tab, event }),
  });
  const wc = { on(_name, callback) { handler = callback; },
    cut() { actions.push('cut'); }, paste() { actions.push('paste'); }, selectAll() { actions.push('all'); } };
  menuContext.installBrowserContextMenu({}, wc);
  handler({}, { isEditable: true, editFlags: { canCut: true, canPaste: true, canSelectAll: true } });
  for (const label of ['Kes', 'Yapıştır', 'Tümünü seç']) {
    const item = menu.find(item => item.label === label);
    assert(item.visible && item.enabled); item.click();
  }
  assert.deepEqual(actions, ['cut', 'paste', 'all']);
  handler({}, { isEditable: false });
  assert.equal(menu.find(item => item.label === 'Yapıştır').visible, false);
  assert.equal(menu.find(item => item.label === 'Seçili metni ara').visible, false);
  assert.equal(menu.find(item => item.label === 'Bu satırı çevir').visible, false);
  const tab = {};
  menuContext.installBrowserContextMenu(tab, wc);
  handler({}, { linkURL: 'https://a.test/?sig=a%2Bb', selectionText: 'İstanbul & İzmir #1' });
  menu.find(item => item.label === 'Bağlantı adresini kopyala').click();
  assert.equal(actions.at(-1), 'https://a.test/?sig=a%2Bb');
  menu.find(item => item.label === 'Seçili metni ara').click();
  assert.equal(new URL(searches[0]).searchParams.get('q'), 'İstanbul & İzmir #1');
  const translate = menu.find(item => item.label === 'Bu satırı çevir');
  assert.equal(translate.visible, true);
  assert.equal(translate.enabled, true);
  translate.click();
  await Promise.resolve();
  assert.equal(pageStarts.length, 1);
  assert.equal(pageStarts[0].tab, tab);
  assert.equal(pageStarts[0].options.scope, 'selection');
  assert.equal(pageStarts[0].options.autoContinue, false);
  assert.deepEqual(browserEvents, []);
  menuContext.startBrowserPageTranslation = async () => ({ ok: false, error: 'API anahtarı gerekli.' });
  handler({}, { selectionText: 'yeniden dene' });
  menu.find(item => item.label === 'Bu satırı çevir').click();
  await Promise.resolve();
  assert.equal(browserEvents.at(-1).event.message, 'API anahtarı gerekli.');
  assert.equal(browserEvents.at(-1).event.success, false);
  handler({}, { isEditable: true, selectionText: 'düzenlenen metin' });
  assert.equal(menu.find(item => item.label === 'Bu satırı çevir').visible, false);
  tab.pageTranslateJob = {};
  handler({}, { selectionText: 'meşgul' });
  assert.equal(menu.find(item => item.label === 'Bu satırı çevir').enabled, false);
  console.log('browser-controls-behavior: sertifika, dosya adı, protokol, geçmiş uyumluluğu, arka plan, limit, kısmi temizlik ve düzenleme menüsü geçti');
})().catch(error => { console.error(error); process.exitCode = 1; });
