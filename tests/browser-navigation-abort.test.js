const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const main = fs.readFileSync(path.join(__dirname, '../src/main.js'), 'utf8');
const renderer = fs.readFileSync(path.join(__dirname, '../src/renderer/renderer.js'), 'utf8');
const classifier = main.slice(main.indexOf('function isAbortedBrowserNavigation'), main.indexOf('function browserLoadErrorMessage'));
const isAborted = vm.runInNewContext(classifier + '\nisAbortedBrowserNavigation');
for (const error of [{ errno: -3 }, { code: 'ERR_ABORTED' }, { code: 'net::ERR_ABORTED' }]) assert.ok(isAborted(error));
for (const error of [{ errno: -105 }, { code: 'ERR_CERT_AUTHORITY_INVALID' }, {}, null]) assert.ok(!isAborted(error));

const watchdog = setTimeout(() => { console.error('Navigation abort tests did not finish'); process.exit(1); }, 5000);
(async () => {
  // Run both loadURL entry points. No actual website, cookies, DRM or user data.
  for (const aborted of [true, false]) {
    const tab = { id: 'test' };
    const error = { errno: aborted ? -3 : -105, code: aborted ? 'ERR_ABORTED' : 'ERR_NAME_NOT_RESOLVED' };
    const events = [];
    const view = { setVisible() {}, webContents: { loadURL: async () => { throw error; } } };
    const shared = {
      URL,
      loadedDirectBrowserMedia: vm.runInNewContext(main.slice(main.indexOf('async function loadedDirectBrowserMedia('),main.indexOf('function isAbortedBrowserNavigation('))+'\nloadedDirectBrowserMedia',{URL,setTimeout}),
      isAbortedBrowserNavigation: isAborted, normalizeBrowserUrl: url => url,
      browserLoadErrorMessage: (_, message) => message, waitForProtectedPlayback: async () => {},
      setBrowserTabCompatibilityMode: async (item, enabled) => { item.compatibilityMode = enabled; return true; },
      browserCompatibilityModeForUrl: () => false,
      suspendBrowserInstrumentationForNavigation() {},
      ensureBrowserView: () => { tab.view = view; return view; }, browserActiveTabId: tab.id, browserVisible: true, browserModalOccluded: false,
      scheduleBrowserSessionSave() {},
    };
    let navigate;
    const start = main.indexOf("ipcMain.handle('browser:navigate'");
    const end = main.indexOf('\n});', start) + 4;
    vm.runInNewContext(main.slice(start, end), {
      ...shared, authorizedBrowserSender: () => true, activeRequestedBrowserTab: () => tab,
      browserBounds: null, browserOverlay: {}, resetBrowserCaptureState() {}, startBrowserPolling() {},
      applyBrowserViewBounds() {},
      ipcMain: { handle: (_, fn) => { navigate = fn; } },
    });
    const result = await navigate({}, { url: 'https://example.test/watch', tabId: tab.id });
    assert.strictEqual(!!result.aborted, aborted);
    assert.strictEqual(result.error, aborted ? undefined : 'ERR_NAME_NOT_RESOLVED');

    const openStart = main.indexOf('async function openBrowserLinkInNewTab(');
    const openCode = main.slice(openStart, main.indexOf('function browserImageFileName', openStart));
    const open = vm.runInNewContext(openCode + '\nopenBrowserLinkInNewTab', {
      ...shared, decideUrlPolicy: require('../src/browser-navigation-policy').decideUrlPolicy,
      browserTabs: new Map(), MAX_SESSION_TABS: 24, createBrowserTabRecord: () => tab,
      browserTabsSnapshot: () => [], sendBrowserEvent: (...args) => events.push(args.at(-1)),
    });
    assert.strictEqual(await open('https://example.test/watch'), aborted);
    assert.strictEqual(events.some(event => event.type === 'load-error'), !aborted);

    const signals = [];
    const nodes = { browserAddress: { value: 'https://example.test/watch' }, playerMeta: { textContent: 'Oynuyor' } };
    const player = { browserNavigateSeq: 0, browserActiveTabId: 'test', workspaceMode: 'browser' };
    const navStart = renderer.indexOf('async function navigateBrowserFromAddress()');
    const navCode = renderer.slice(navStart, renderer.indexOf("if ($('workspacePlayerMode'))", navStart));
    const renderNavigate = vm.runInNewContext(navCode + '\nnavigateBrowserFromAddress', {
      $: id => nodes[id], player, window: { api: { navigateBrowser() {} } },
      navigateBrowser: async () => result, setBrowserSignal: text => signals.push(text), setBrowserLoadingState() {},
      syncBrowserAddressAction() {}, closeBrowserAddressResults() {},
    });
    await renderNavigate();
    assert.strictEqual(signals.some(text => text.startsWith('Sayfa açılamadı')), !aborted);
    assert.strictEqual(nodes.playerMeta.textContent, aborted ? 'Oynuyor' : 'Sayfa yüklenemedi');
  }

  // Arka planda açılan bağlantı DRM hazırlığında beklerken kullanıcı aynı
  // sekmede başka bir gezinme başlatırsa eski bağlantı artık yüklenmemeli.
  {
    const tab = { id: 'background', navigationRequestSeq: 0, closing: false };
    const tabs = new Map([[tab.id, tab]]);
    const loaded = [];
    let releaseProtected;
    let markProtectedStarted;
    const protectedGate = new Promise(resolve => { releaseProtected = resolve; });
    const protectedStarted = new Promise(resolve => { markProtectedStarted = resolve; });
    const view = { setVisible() {}, webContents: {
      isDestroyed: () => false,
      loadURL: async url => { loaded.push(url); },
    } };
    const openStart = main.indexOf('async function openBrowserLinkInNewTab(');
    const openCode = main.slice(openStart, main.indexOf('function browserImageFileName', openStart));
    const open = vm.runInNewContext(openCode + '\nopenBrowserLinkInNewTab', {
      URL, Number,
      decideUrlPolicy: require('../src/browser-navigation-policy').decideUrlPolicy,
      browserTabs: tabs,
      MAX_SESSION_TABS: 24,
      createBrowserTabRecord: () => tab,
      ensureBrowserView: item => { item.view = view; return view; },
      destroyBrowserTab() {},
      browserTabsSnapshot: () => [],
      browserActiveTabId: 'other',
      browserVisible: true,
      browserModalOccluded: false,
      sendBrowserEvent() {},
      setBrowserTabCompatibilityMode: async (item, enabled) => { item.compatibilityMode = enabled; return true; },
      browserCompatibilityModeForUrl: () => false,
      suspendBrowserInstrumentationForNavigation() {},
      waitForBrowserAdblockReady: async () => {},
      waitForProtectedPlayback: async () => { markProtectedStarted(); await protectedGate; },
      scheduleBrowserSessionSave() {},
      isAbortedBrowserNavigation: isAborted,
      browserLoadErrorMessage: (_, message) => message,
    });
    const opening = open('https://protected.test/slow');
    await protectedStarted;
    tab.navigationRequestSeq += 1;
    releaseProtected();
    assert.equal(await opening, true);
    assert.deepEqual(loaded, []);
  }

  // DRM hazırlığı gibi yavaş bir ön koşulda bekleyen eski adres, kullanıcı bu
  // sırada başka bir adres açtıysa daha sonra geri dönüp yeni sayfayı ezmemeli.
  {
    const tab = { id: 'race', navigationRequestSeq: 0 };
    const loaded = [];
    let releaseProtected;
    let markProtectedStarted;
    const protectedGate = new Promise(resolve => { releaseProtected = resolve; });
    const protectedStarted = new Promise(resolve => { markProtectedStarted = resolve; });
    const view = { setVisible() {}, webContents: { loadURL: async url => { loaded.push(url); } } };
    let navigate;
    const start = main.indexOf("ipcMain.handle('browser:navigate'");
    const end = main.indexOf('\n});', start) + 4;
    vm.runInNewContext(main.slice(start, end), {
      URL, Number,
      authorizedBrowserSender: () => true,
      activeRequestedBrowserTab: id => id === tab.id ? tab : null,
      normalizeBrowserUrl: url => url,
      setBrowserTabCompatibilityMode: async (item, enabled) => { item.compatibilityMode = enabled; return true; },
      browserCompatibilityModeForUrl: () => false,
      suspendBrowserInstrumentationForNavigation() {},
      waitForBrowserAdblockReady: async () => {},
      waitForProtectedPlayback: async url => {
        if (url.includes('protected')) { markProtectedStarted(); await protectedGate; }
      },
      ensureBrowserView: () => view,
      browserBounds: null,
      browserVisible: true,
      browserModalOccluded: false,
      browserOverlay: {},
      resetBrowserCaptureState() {},
      applyBrowserViewBounds() {},
      startBrowserPolling() {},
      scheduleBrowserSessionSave() {},
      browserEventContext: () => ({}),
      browserNavigationState: () => ({}),
      isAbortedBrowserNavigation: isAborted,
      browserLoadErrorMessage: (_, message) => message,
      ipcMain: { handle: (_, fn) => { navigate = fn; } },
    });
    const oldRequest = navigate({}, { url: 'https://protected.test/slow', tabId: tab.id });
    await protectedStarted;
    const newest = await navigate({}, { url: 'https://example.test/newest', tabId: tab.id });
    releaseProtected();
    const oldResult = await oldRequest;
    assert.equal(newest.ok, true, JSON.stringify(newest));
    assert.equal(oldResult.stale, true);
    assert.deepEqual(loaded, ['https://example.test/newest']);
  }

  // Eski "uyumluluk modunu aç" işi kanca kaldırmayı beklerken mod yeniden
  // kapatılırsa geç kalan iş güncel debugger bağlantısını koparmamalı.
  {
    const tab = { id: 'compat', view: {}, compatibilityMode: false, compatibilityActionSeq: 0 };
    let releaseUninstall;
    const uninstallGate = new Promise(resolve => { releaseUninstall = resolve; });
    let detachCount = 0;
    const start = main.indexOf('async function setBrowserTabCompatibilityMode(');
    const end = main.indexOf('function scheduleBrowserCloudflareProbe(', start);
    const compatibility = vm.runInNewContext(main.slice(start, end)
      + '\n({ setBrowserTabCompatibilityMode, syncBrowserTabCompatibilityForUrl })', {
      Number,
      browserTabById: id => id === tab.id ? tab : null,
      clearBrowserCloudflareTimer() {},
      invalidateBrowserCloudflareProbe: item => {
        item.cloudflareProbeSeq = (Number(item.cloudflareProbeSeq) || 0) + 1;
        item.cloudflareProbePromise = null;
      },
      uninstallBrowserCaptureHooks: async () => { await uninstallGate; },
      detachBrowserDebugger: () => { detachCount += 1; },
      browserActiveTabId: tab.id,
      browserDebuggerReady: true,
      browserPendingResponses: new Map([['pending', {}]]),
      browserTrackBusy: true,
      browserCompatibilityModeForUrl: () => false,
    });
    const opening = compatibility.setBrowserTabCompatibilityMode(tab, true);
    assert.equal(await compatibility.setBrowserTabCompatibilityMode(tab, false), true);
    releaseUninstall();
    assert.equal(await opening, false);
    assert.equal(tab.compatibilityMode, false);
    assert.equal(tab.browserInstrumentationPending, true);
    assert.equal(detachCount, 0);
  }
  console.log('Aborted navigation is neutral; real load failures remain visible.');
})().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => clearTimeout(watchdog));
