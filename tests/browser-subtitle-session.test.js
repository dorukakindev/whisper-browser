const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { normalizeBrowserSession, normalizeSessionTab } = require('../src/browser-session-store');

const raw = { id: 'a', url: 'https://example.com/watch/1', subtitleMode: 'off',
  subtitleSelection: { primaryId: 'tr', secondaryId: 'source' } };
const restored = normalizeBrowserSession(JSON.parse(JSON.stringify(normalizeBrowserSession({ tabs: [raw] }))));
assert.deepEqual(restored.tabs[0].subtitleSelection, raw.subtitleSelection);
assert.equal(restored.tabs[0].subtitleMode, 'off');
assert.equal(normalizeSessionTab({ ...raw, subtitleSelection: undefined }).subtitleSelection, null);
assert.deepEqual(normalizeSessionTab({ ...raw, subtitleSelection: {} }).subtitleSelection, { primaryId: '', secondaryId: '' });
assert.equal(normalizeSessionTab({ ...raw, subtitleSelection: { primaryId: 'x'.repeat(500) } }).subtitleSelection.primaryId.length, 180);

const renderer = fs.readFileSync(path.join(__dirname, '../src/renderer/renderer.js'), 'utf8');
const save = renderer.slice(renderer.indexOf('function saveActiveBrowserTabWorkspace('), renderer.indexOf('function restoreActiveBrowserTabWorkspace('));
const selectState = new Function('tab', 'player', 'browserSubtitleMode',
  `${save.slice(save.indexOf('const restoringSelection'), save.indexOf('Object.assign(tab'))}; return { selection, savedSubtitleMode };`);
const pending = { subtitleSelection: raw.subtitleSelection, subtitleSelectionRestored: false, restoreSubtitleMode: 'off' };
assert.deepEqual(selectState(pending, {}, () => 'source'), { selection: raw.subtitleSelection, savedSubtitleMode: 'off' });
assert.equal(selectState({}, {}, () => 'source').selection, null, 'yeni sekme bilinçli boş seçim sayıldı');
assert.deepEqual(selectState({ subtitleSelectionExplicit: true }, {}, () => 'off').selection, { primaryId: '', secondaryId: '' });

const main = fs.readFileSync(path.join(__dirname, '../src/main.js'), 'utf8');
const events = [];
const ctx = {
  browserWatchMediaId: () => 'media',
  watchIndex: () => ({ listTracks: () => [{ asset_path: 'tr' }] }),
  browserAssetStore: () => ({ getTrack: () => ({ ok: true, srtPath: 'tr.srt',
    document: { trackId: 'tr', role: 'translation', cues: [{ text: 'Yeni' }] } }) }),
  sendBrowserEvent: (_tab, event) => events.push(event),
};
vm.createContext(ctx);
vm.runInContext(main.slice(main.indexOf('function restorePersistedBrowserTracks('), main.indexOf('function publishBrowserTrackNow(')), ctx);
for (const [selection, mode, expected] of [[null, 'source', true], [null, 'off', false], [raw.subtitleSelection, 'both', false]]) {
  events.length = 0;
  ctx.restorePersistedBrowserTracks({ subtitleSelection: selection, overlay: { mode }, acquisitionPlan: { start() {}, finish() {} } });
  assert.equal(events.length, 1);
  assert.equal(events[0].track.autoLoad, expected);
}
// Gerçek navigation handler: aynı medya içindeki URL değişimi tercihi korur,
// başka bölüme geçiş ise bekleyen eski seçimi iptal eder.
const tab = { id: 'a', mediaId: 'one', subtitleSelection: raw.subtitleSelection,
  subtitleSelectionRestored: false, subtitleSelectionExplicit: true };
const element = { value: '', classList: { toggle() {} }, setAttribute() {} };
const nav = { player: { browserActiveTabId: 'a', browserPageUrl: 'https://example.com/one',
    browserTabEventGate: { accept: () => true } },
  browserTabState: () => tab, browserPlaceKey: (url) => url, $: () => element,
  document: {}, localStorage: { setItem() {} },
  setMediaKey() {}, applyBrowserMangaState() {}, clearBrowserTracks() {},
  scheduleBrowserOverlaySync() {}, setBrowserLoadingState() {}, showBrowserErrorSurface() {},
  loadBrowserPlaces() {}, updateBrowserTabPresentation() {}, updateBrowserBookmarkButton() {},
};
vm.createContext(nav);
const navSource = renderer.slice(renderer.indexOf('function updateBrowserNavigation('));
vm.runInContext(navSource.slice(0, navSource.search(/\r?\n}\r?\n/)) + '\n}', nav);
nav.updateBrowserNavigation({ tabId: 'a', mediaId: 'one', url: 'https://example.com/one?lang=en' });
assert.equal(tab.subtitleSelection, raw.subtitleSelection);
nav.updateBrowserNavigation({ tabId: 'a', mediaId: 'two', url: 'https://example.com/two' });
assert.equal(tab.subtitleSelection, null);
assert.equal(tab.subtitleSelectionRestored, true);
assert.equal(tab.subtitleSelectionExplicit, false);
console.log('Browser subtitle session: explicit slots, off mode, legacy fallback, pending saves and navigation passed.');
