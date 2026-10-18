'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const { normalizeBrowserSession, BROWSER_SESSION_VERSION } = require('../src/browser-session-store');
const main = fs.readFileSync(path.join(__dirname, '../src/main.js'), 'utf8');
const tab = id => ({ id, url: 'https://example.test/' + (id || 'blank') });

test('fallback active tab cannot also be the split secondary tab', () => {
  const saved = normalizeBrowserSession({ version: BROWSER_SESSION_VERSION, tabs: [tab('a'), tab('b')], activeTabId: 'missing', splitSecondaryTabId: 'a' });
  assert.equal(saved.activeTabId, 'a'); assert.equal(saved.splitSecondaryTabId, '');
});

test('missing tab IDs are assigned unique stable identities without stealing original IDs', () => {
  const saved = normalizeBrowserSession({ tabs: [tab(''), tab(''), tab('tab-restored-1')] });
  assert(saved.tabs.every(item => item.id));
  assert.equal(new Set(saved.tabs.map(item => item.id)).size, 3);
  assert.equal(saved.tabs[2].id, 'tab-restored-1');
  assert.deepEqual(normalizeBrowserSession(saved).tabs.map(item => item.id), saved.tabs.map(item => item.id));
});

test('duplicate long tab IDs remain bounded and stable across normalization', () => {
  const id = 'x'.repeat(128);
  const once = normalizeBrowserSession({ tabs: [tab(id), tab(id)] });
  assert(once.tabs.every(item => item.id.length <= 128));
  assert.deepEqual(normalizeBrowserSession(once).tabs.map(item => item.id), once.tabs.map(item => item.id));
});

function context({ failedPlaces = false } = {}) {
  const session = { tabs: [tab('legacy-first'), tab('legacy-active')], activeTabId: 'legacy-active', splitSecondaryTabId: 'legacy-first', splitRatio: .6 };
  const oldPlaces = { bookmarks: [{ url: 'https://old.test' }], sitePermissions: {}, siteTerminology: {} };
  let handler, created = 0, destroyed = 0;
  const ctx = { Map, Math, JSON, app: {}, mainWindow: {},
    browserTabs: new Map(), browserActiveTabId: '', browserSplitSecondaryTabId: '',
    browserSessionRestoreEnabled: true, browserPlacesCache: oldPlaces, browserPlacesDirty: false,
    readBrowserSessionWithStatus: () => ({ session, warning: '' }), browserSessionPath: () => 'fixture',
    persistBrowserSessionNow: () => ({ ok: true }), subtitleFileAccess: { grant() {} },
    createBrowserTabRecord(snapshot) { const record = { ...snapshot, id: `tab-new-${++created}` };
      ctx.browserTabs.set(record.id, record); if (!ctx.browserActiveTabId) ctx.browserActiveTabId = record.id; return record; },
    ipcMain: { handle: (_name, fn) => { handler = fn; } }, authorizedBrowserSender: () => true,
    queueBrowserTabTransition: fn => fn(), trackBrowserSessionMutation: fn => fn(), dt: (_tr, en) => en,
    dialog: { showOpenDialog: async () => ({ filePaths: ['fixture.json'] }) },
    fs: { promises: { stat: async () => ({ size: 1 }), readFile: async () => '{}' } },
    inspectBrowserSessionPackage: () => ({ session, places: { bookmarks: [] }, variants: [], warnings: [] }),
    importBrowserSessionVariants: () => [], readBrowserPlaces: () => oldPlaces,
    writeBrowserPlaces(value) { ctx.browserPlacesCache = value; ctx.browserPlacesDirty = failedPlaces; return !failedPlaces; },
    destroyBrowserView() { destroyed++; ctx.browserTabs.clear(); ctx.browserActiveTabId = ''; },
    activeBrowserTab: () => ctx.browserTabs.get(ctx.browserActiveTabId), activateBrowserTab: async () => {},
    browserTabsSnapshot: () => [...ctx.browserTabs.values()], browserSplitSnapshot: () => ({}), browserPlacesSnapshot: () => ctx.browserPlacesCache,
  };
  vm.createContext(ctx);
  return { ctx, session, oldPlaces, get handler() { return handler; }, get destroyed() { return destroyed; } };
}

test('startup restore preserves active/split references when real tab IDs are regenerated', () => {
  const fixture = context();
  const start = main.indexOf('function restoreBrowserSessionState()');
  vm.runInContext(main.slice(start, main.indexOf('function browserEventContext(', start)), fixture.ctx);
  fixture.ctx.restoreBrowserSessionState();
  assert.equal(fixture.ctx.browserActiveTabId, 'tab-new-2');
  assert.equal(fixture.ctx.browserSplitSecondaryTabId, 'tab-new-1');
});

function loadImport(fixture) {
  const start = main.indexOf("ipcMain.handle('browser:session:import'");
  vm.runInContext(main.slice(start, main.indexOf("ipcMain.handle('browser:session:dismissRecovery'", start)), fixture.ctx);
}

test('portable import preserves active/split references when tab IDs are regenerated', async () => {
  const fixture = context(); loadImport(fixture);
  assert.equal((await fixture.handler({})).ok, true);
  assert.equal(fixture.ctx.browserActiveTabId, 'tab-new-2');
  assert.equal(fixture.ctx.browserSplitSecondaryTabId, 'tab-new-1');
});

test('failed places write during session import cannot close the existing tabs or replace their cache', async () => {
  const fixture = context({ failedPlaces: true });
  fixture.ctx.browserTabs.set('tab-existing', { id: 'tab-existing' }); fixture.ctx.browserActiveTabId = 'tab-existing';
  loadImport(fixture);
  const result = await fixture.handler({});
  assert.equal(result.ok, false);
  assert.equal(fixture.destroyed, 0);
  assert.equal(fixture.ctx.browserActiveTabId, 'tab-existing');
  assert.equal(fixture.ctx.browserPlacesCache, fixture.oldPlaces);
});
