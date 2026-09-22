'use strict';
// F-QE-1 (R104): player katmanı açıkken global keydown işleyicisi Escape'te
// koşulsuz preventDefault() çağırıyordu — bu, açık <dialog>'ün native
// cancel/Escape davranışını öldürüyordu (mediaCatalogDialog player'dan
// açılınca Esc ile kapanmıyordu). Beklenen: hedef açık dialog içindeyse
// handler hiçbir şey yapmasın; native dialog kapanışı çalışsın.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const js = fs.readFileSync(path.join(__dirname, '../src/renderer/renderer.js'), 'utf8');
const keyStart = js.indexOf("document.addEventListener('keydown', (e) => {",
  js.indexOf('// Klavye: oynatıcı açıkken'));
const keyEnd = js.indexOf('\n});', js.indexOf('// Gecikme/hiz/ses', keyStart) - 80) + 4;
assert(keyStart > 0 && keyEnd > keyStart, 'oynatıcı keydown işleyicisi kesilemedi');

const calls = [];
const rec = (name) => (...args) => { calls.push([name, ...args]); };
const mkEl = (hidden = true) => ({
  classList: { contains: (c) => c === 'hidden' ? hidden : false, add() {}, remove() {} },
  click: rec('el-click'),
});
const elements = {
  playerLayer: mkEl(false),
  playerVideo: { paused: true, muted: false, volume: 0.5, play: rec('play'), pause: rec('pause'), currentTime: 0 },
  subtitleModeMenu: mkEl(), browserPlacesPanel: mkEl(), browserDownloadsPanel: mkEl(),
  shortcutHelp: mkEl(), settingsDrawer: mkEl(false), youtubeLoginModal: mkEl(),
  fullscreenBtn: mkEl(), subtitleModeWrap: mkEl(),
};
const player = {
  workspaceMode: 'browser', editing: false, selectedWord: null,
  suppressClick: false, browserPaused: true, subsHidden: false,
};
const ctx = vm.createContext({
  document: {
    addEventListener: (type, fn) => { ctx.__keyHandler = type === 'keydown' ? fn : ctx.__keyHandler; },
    fullscreenElement: null, activeElement: null, hidden: false,
    querySelectorAll: () => [],
  },
  window: { api: { browserCommand: rec('browserCommand') }, BrowserCommandPalette: { browserShortcutForInput: () => null } },
  $: (id) => elements[id] ?? mkEl(),
  $$: () => [],
  player,
  runBrowserShortcut: () => false,
  browserCommand: rec('browserCommand'),
  stepBrowserFrame: rec('stepBrowserFrame'), nudgeSpeed: rec('nudgeSpeed'),
  nudgeOffset: rec('nudgeOffset'), setPlayerVolume: rec('setPlayerVolume'),
  openCueEditor: rec('openCueEditor'), closeCueEditor: rec('closeCueEditor'),
  stepCue: rec('stepCue'), replayCue: rec('replayCue'), copyCue: rec('copyCue'),
  toggleCueSaved: rec('toggleCueSaved'), toggleWordSaved: rec('toggleWordSaved'),
  toggleAbLoop: rec('toggleAbLoop'), capturePlayerFrame: rec('capturePlayerFrame'),
  setShortcutHelpOpen: rec('setShortcutHelpOpen'), setSettingsDrawer: rec('setSettingsDrawer'),
  setSubtitleModeMenuOpen: rec('setSubtitleModeMenuOpen'), setBrowserPlacesOpen: rec('setBrowserPlacesOpen'),
  setBrowserDownloadsOpen: rec('setBrowserDownloadsOpen'), hideWordInspector: rec('hideWordInspector'),
  setSubtitlesVisible: rec('setSubtitlesVisible'), closePlayer: rec('closePlayer'),
  showControls: rec('showControls'), osd: rec('osd'), logLine: rec('logLine'),
  setSubtitleMode: rec('setSubtitleMode'), closeYoutubeLogin: rec('closeYoutubeLogin'),
  console,
});
vm.runInContext(js.slice(keyStart, keyEnd), ctx);
const handler = ctx.__keyHandler;
assert(typeof handler === 'function', 'keydown işleyicisi yakalanamadı');

// --- 1) Escape, açık <dialog> içindeki hedefte → preventDefault YOK,
//        katman kapanış mantığına düşme YOK (native dialog cancel çalışsın).
const dialogEl = { open: true };
const dialogTarget = {
  tagName: 'BUTTON', isContentEditable: false,
  closest: (sel) => sel === 'dialog[open]' ? dialogEl : null,
};
let prevented = false;
calls.length = 0;
handler({
  key: 'Escape',
  preventDefault: () => { prevented = true; },
  target: dialogTarget,
});
assert.equal(prevented, false,
  'dialog içi Escape preventDefault edildi — native <dialog> kapanışı ölüyor');
assert(!calls.some(([n]) => n === 'closePlayer' || n === 'setSettingsDrawer'
  || n === 'closeYoutubeLogin' || n === 'setBrowserDownloadsOpen'),
  'dialog içi Escape katman kapanış mantığına düştü — dialog açıkken çift kapanma riski');

// --- 2) Escape, dialog DIŞI hedefte → mevcut sözleşme korunur:
//        preventDefault + açık katman (settingsDrawer) kapanır.
prevented = false;
calls.length = 0;
handler({
  key: 'Escape',
  preventDefault: () => { prevented = true; },
  target: { tagName: 'DIV', isContentEditable: false, closest: () => null },
});
assert.equal(prevented, true, 'dialog dışı Escape preventDefault çağırmadı');
assert(calls.some(([n, v]) => n === 'setSettingsDrawer' && v === false),
  'dialog dışı Escape açık katmanı kapatmadı');

// --- 3) Kapalı dialog (open=false) target'ı → dialog koruması devreye girmemeli.
prevented = false;
calls.length = 0;
handler({
  key: 'Escape',
  preventDefault: () => { prevented = true; },
  target: { tagName: 'DIV', isContentEditable: false, closest: () => null },
});
assert.equal(prevented, true, 'kapalı dialog yakını preventDefault davranışını bozdu');

console.log('player-escape-dialog: dialog içi Escape native cancel serbest, dışı sözleşme korunuyor — PASS');
