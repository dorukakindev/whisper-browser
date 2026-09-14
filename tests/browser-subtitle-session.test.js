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
const nav = { state: {}, player: { browserActiveTabId: 'a', browserPageUrl: 'https://example.com/one',
    browserTabEventGate: { accept: () => true } },
  browserTabState: () => tab, browserPlaceKey: (url) => url, $: () => element,
  document: {}, localStorage: { setItem() {} },
  setMediaKey() {}, applyBrowserMangaState() {}, clearBrowserTracks() {},
  scheduleBrowserOverlaySync() {}, setBrowserLoadingState() {}, showBrowserErrorSurface() {},
  syncBrowserCompatibilityControl() {},
  syncBrowserReaderControl() {},
  renderBrowserPermissions() {},
  loadBrowserPlaces() {}, updateBrowserTabPresentation() {}, updateBrowserBookmarkButton() {},
  updateBrowserWhisperActions() {}, syncBrowserAddressAction() {},
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

const manualSelection = { primaryId: '', secondaryId: '', primaryFile: 'C:/subs/film.srt', secondaryFile: 'C:/subs/film.tr.vtt' };
assert.deepEqual(normalizeSessionTab({ ...raw, subtitleSelection: manualSelection }).subtitleSelection, manualSelection);
assert.deepEqual(selectState({ subtitleSelectionExplicit: true }, { subPath: manualSelection.primaryFile, sub2Path: manualSelection.secondaryFile }, () => 'both').selection, manualSelection);
(async () => {
  const tab = { id: 'a', subtitleSelection: manualSelection, restoreSubtitleMode: 'both' };
  const controls = { playerSubSelect: {}, playerSubSelect2: {} };
  const loads = [];
  const ctx = { player: { browserActiveTabId: 'a', browserTracks: [] }, currentGeneration: () => 1,
    staleGeneration: () => false, $: id => controls[id], addSubtitleOption() {},
    setSubtitleMode: mode => { assert.equal(mode, 'both'); }, saveActiveBrowserTabWorkspace() {},
    loadSubtitle: async (file, secondary) => { loads.push(file); ctx.player[secondary ? 'sub2Path' : 'subPath'] = file; } };
  vm.createContext(ctx);
  vm.runInContext(renderer.slice(renderer.indexOf('async function restoreBrowserSubtitleSelection('), renderer.indexOf('async function loadPersistedBrowserTranslation(')), ctx);
  await ctx.restoreBrowserSubtitleSelection(tab);
  assert.deepEqual(loads, [manualSelection.primaryFile, manualSelection.secondaryFile]);
  assert.equal(tab.subtitleSelectionRestored, true);
  tab.subtitleSelectionRestored = false; ctx.player.subPath = ''; loads.length = 0;
  ctx.loadSubtitle = async file => { loads.push(file); };
  await ctx.restoreBrowserSubtitleSelection(tab);
  await ctx.restoreBrowserSubtitleSelection(tab);
  assert.equal(loads.length, 1, 'Eksik dosya her iz olayında tekrar okunmamalı');
  assert.equal(tab.subtitleSelection.primaryFile, manualSelection.primaryFile, 'Dosyayı bulmak için seçim korunmalı');
})().catch(error => { console.error(error); process.exitCode = 1; });
