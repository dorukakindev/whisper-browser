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
      isAbortedBrowserNavigation: isAborted, normalizeBrowserUrl: url => url,
      browserLoadErrorMessage: (_, message) => message, waitForProtectedPlayback: async () => {},
      setBrowserTabCompatibilityMode: async () => {}, browserCompatibilityModeForUrl: () => false,
      ensureBrowserView: () => view, browserActiveTabId: tab.id, browserVisible: true, browserModalOccluded: false,
      scheduleBrowserSessionSave() {},
    };
    let navigate;
    const start = main.indexOf("ipcMain.handle('browser:navigate'");
    const end = main.indexOf('\n});', start) + 4;
    vm.runInNewContext(main.slice(start, end), {
      ...shared, authorizedBrowserSender: () => true, activeRequestedBrowserTab: () => tab,
      browserBounds: null, browserOverlay: {}, resetBrowserCaptureState() {}, startBrowserPolling() {},
      ipcMain: { handle: (_, fn) => { navigate = fn; } },
    });
    const result = await navigate({}, { url: 'https://example.test/watch', tabId: tab.id });
    assert.strictEqual(!!result.aborted, aborted);
    assert.strictEqual(result.error, aborted ? undefined : 'ERR_NAME_NOT_RESOLVED');

    const openStart = main.indexOf('async function openBrowserLinkInNewTab(');
    const openCode = main.slice(openStart, main.indexOf('function browserImageFileName', openStart));
    const open = vm.runInNewContext(openCode + '\nopenBrowserLinkInNewTab', {
      ...shared, browserTabs: new Map(), MAX_SESSION_TABS: 24, createBrowserTabRecord: () => tab,
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
    });
    await renderNavigate();
    assert.strictEqual(signals.some(text => text.startsWith('Sayfa açılamadı')), !aborted);
    assert.strictEqual(nodes.playerMeta.textContent, aborted ? 'Oynuyor' : 'Sayfa yüklenemedi');
  }
  console.log('Aborted navigation is neutral; real load failures remain visible.');
})().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => clearTimeout(watchdog));
