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

const revision = { mediaId: 'media', variantId: 'translation', sourceHash: 'source', cueId: 'line', sourceCueHash: 'linehash',
  hasOverride: true, userOverride: 'Saved translation', timingOverride: { start: 8, end: 10 },
  previous: { text: 'Earlier translation', start: 7, end: 9 } };
const editTab = { ...raw, mediaId: 'media', subtitleEdits: [revision] };
const saved = normalizeBrowserSession({ tabs: [editTab] });
const reopened = normalizeBrowserSession(JSON.parse(JSON.stringify(saved))).tabs[0].subtitleEdits[0];
assert.deepEqual(reopened.previous, revision.previous);
assert.deepEqual(reopened.timingOverride, revision.timingOverride);
assert.equal(reopened.userOverride, revision.userOverride);
const invalidPrevious = { ...revision, previous: { ...revision.previous, end: 1 } };
assert.equal(normalizeSessionTab({ ...editTab, subtitleEdits: [invalidPrevious] }).subtitleEdits[0].previous, undefined);

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
    loadSubtitle: async (file, secondary) => { loads.push(file); ctx.player[secondary ? 'sub2Path' : 'subPath'] = file; return {ok:true,loaded:true}; } };
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

// Restart uses the selected document and never starts playback; a user command/navigation cancels it.
(async()=>{
 const body=main.slice(main.indexOf('async function restoreBrowserPlaybackOnce('),main.indexOf('async function probeActiveBrowserMedia('));
 const commands=[];let current=true,release;
 const restore={mediaId:'same',position:18,duration:60,rate:1.5};
 const tab={mediaId:'same',view:{},restoredPlayback:{...restore}};
 const context={isCurrentBrowserContext:()=>current,buildBrowserMediaCommandScript:(command,value,token)=>({command,value,token}),
  executeBrowserViewFrames:async(_view,command)=>{commands.push(command);return [{handled:true,currentTime:18,playbackRate:1.5,paused:true}];}};
 vm.createContext(context);vm.runInContext(body,context);
 const media={readyState:2,duration:60,docToken:'verified-document',adPlaying:false};
 const result=await context.restoreBrowserPlaybackOnce(tab,media,tab.view,{});
 assert.deepEqual(commands.map(c=>c.command),['pause','speed','seek']);assert(commands.every(c=>c.token===media.docToken));assert.equal(result.media.paused,true);assert.equal(tab.restoredPlayback,null);
 for(const variant of [{mediaId:'other'},{duration:90},{docToken:''}]){
  commands.length=0;tab.restoredPlayback={...restore};tab.mediaId=variant.mediaId||'same';
  await context.restoreBrowserPlaybackOnce(tab,{...media,...variant},tab.view,{});assert.equal(commands.length,0,'unverified/changed source must not receive saved position');
 }
 tab.mediaId='same';tab.restoredPlayback={...restore};commands.length=0;
 assert.equal((await context.restoreBrowserPlaybackOnce(tab,{...media,adPlaying:true},tab.view,{})).waiting,true);assert(tab.restoredPlayback);assert.equal(commands.length,0);
 context.executeBrowserViewFrames=async(_view,command)=>{commands.push(command);await new Promise(r=>release=r);return [{handled:true}];};
 const pending=context.restoreBrowserPlaybackOnce(tab,media,tab.view,{});await new Promise(setImmediate);tab.restoredPlayback=null;release();await pending;
 assert.deepEqual(commands.map(c=>c.command),['pause'],'explicit user cancellation must prevent the pending seek/rate');
 console.log('Browser restart: same document, paused restore, changed timeline, ads and cancellation passed.');
})().catch(error=>{console.error(error);process.exitCode=1;});

// The assistant may be hosted in its own window while a restored Browser track loads.
{
 const overlay={};let painted='';
 const ctx={$:id=>id==='playerVideo'?{currentTime:2,paused:true}:id==='subtitleOverlay'?overlay:null,
  performance:{now:()=>0},player:{cues:[{start:1,end:3,text:'Restored sentence'}],cues2:[],offset:0,activeIdx:-1,renderCostRing:[]},
  findCueAt:()=>0,highlightCueRow(){},updateCueMeta(){},aiChatCtxLabel(){throw Error('No attached assistant');},
  setOverlayText:(_overlay,text)=>{painted=text;return true;},renderActiveCueWord(){},applyPlaybackLearningPolicy(){},scheduleFitSubtitleOverlays(){},scheduleTimelineDraw(){}};
 vm.createContext(ctx);vm.runInContext(renderer.slice(renderer.indexOf('function renderCue() {'),renderer.indexOf('function localBufferedAhead(')),ctx);
 ctx.renderCue();assert.equal(painted,'Restored sentence');
}
