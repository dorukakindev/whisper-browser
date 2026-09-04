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
  const events = [];
  const visibility = [];
  const tabs = new Map([['old', { id: 'old' }]]);
  const links = extract('async function openBrowserLinkInNewTab(', 'function browserImageFileName', {
    normalizeBrowserUrl: value => value, browserTabs: tabs, MAX_SESSION_TABS: 2,
    browserTabsSnapshot: () => [...tabs.values()],
    browserActiveTabId: 'old', browserVisible: true, browserModalOccluded: false,
    createBrowserTabRecord() { const tab = { id: 'new' }; tabs.set('new', tab); return tab; },
    ensureBrowserView: () => ({ setVisible: value => visibility.push(value), webContents: { async loadURL() {} } }),
    sendBrowserEvent: (...args) => events.push(args.at(-1)),
    async waitForProtectedPlayback() {}, scheduleBrowserSessionSave() {},
  });
  for (const url of ['javascript:alert(1)', 'data:text/html,a', 'file:///C:/x', 'iki kelime']) {
    assert.equal(await links.openBrowserLinkInNewTab(url), false);
    assert.equal(tabs.size, 1, 'geçersiz link sekme oluşturdu');
  }
  events.length = 0;
  assert.equal(await links.openBrowserLinkInNewTab('https://example.test/'), true);
  assert.equal(events[0].activeTabId, 'old');
  assert.deepEqual(visibility, [false]);
  assert.equal(await links.openBrowserLinkInNewTab('https://example.test/2'), false);
  assert.equal(events.at(-1).type, 'notice');
  assert.equal(events.at(-1).success, false);

  for (const fail of [false, true]) {
    let origin;
    const clear = extract('async function clearBrowserSiteData(', 'async function clearAllBrowserCookies', {
      BROWSER_PARTITION: 'test', browserCookieMatchesHost: () => true, browserCookieUrl: () => 'https://example.test/',
      session: { fromPartition: () => ({
        cookies: { async get() { return [{ name: 'test' }]; }, async remove() {}, async flushStore() {} },
        async clearStorageData(options) { origin = options.origin; if (fail) throw new Error('disk'); },
      }) },
    });
    const result = await clear.clearBrowserSiteData('https://example.test/page');
    assert.equal(origin, 'https://example.test');
    assert.equal(result.ok, !fail);
    if (fail) { assert.equal(result.partial, true); assert(result.error); }
  }

  let menu, handler;
  const actions = [];
  const searches = [];
  const menuContext = extract('function installBrowserContextMenu(', 'function browserSubtitleDir', {
    mainWindow: {}, browserNavigationCapabilities: () => ({ canGoBack: false, canGoForward: false }),
    Menu: { buildFromTemplate(items) { menu = items; return { popup() {} }; } },
    clipboard: { writeText(text) { actions.push(text); } },
    openBrowserLinkInNewTab: async url => { searches.push(url); },
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
  handler({}, { linkURL: 'https://a.test/?sig=a%2Bb', selectionText: 'İstanbul & İzmir #1' });
  menu.find(item => item.label === 'Bağlantı adresini kopyala').click();
  assert.equal(actions.at(-1), 'https://a.test/?sig=a%2Bb');
  menu.find(item => item.label === 'Seçili metni ara').click();
  assert.equal(new URL(searches[0]).searchParams.get('q'), 'İstanbul & İzmir #1');
  console.log('browser-controls-behavior: sertifika, dosya adı, protokol, arka plan, limit, kısmi temizlik ve düzenleme menüsü geçti');
})().catch(error => { console.error(error); process.exitCode = 1; });
