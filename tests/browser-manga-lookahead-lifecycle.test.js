const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '..', 'src', 'renderer', 'renderer.js'), 'utf8');
const lifecycleStart = source.indexOf('async function runBrowserMangaLookahead()');
const lifecycleEnd = source.indexOf("$('browserProfileScope')?.addEventListener", lifecycleStart);
assert(lifecycleStart >= 0 && lifecycleEnd > lifecycleStart, 'Manga lookahead lifecycle was not found.');

const nodes = {
  browserMangaAuto: { checked: true },
  browserMangaMaxImages: { value: '24' },
  browserMangaWorkers: { value: '3' },
  browserMangaFont: { value: 'comic' },
  browserMangaVertical: { checked: false },
  browserMangaSfx: { checked: true },
};
const player = {
  workspaceMode: 'player', browserMangaBusy: false, browserMangaLookaheadBusy: false,
  browserMangaTranslated: 1, browserMangaVisible: true, browserMangaLookaheadTimer: null,
  browserActiveTabId: 'tab-1',
};
const intervals = new Map();
const cleared = [];
const calls = [];
let timerId = 40;
const context = {
  player,
  document: { hidden: false },
  $: (id) => nodes[id] || null,
  effectiveBrowserProfile: () => ({ values: { mangaTargetLanguage: 'tr', mangaFontScale: 1 } }),
  window: { api: { startBrowserManga: async (...args) => { calls.push(args); } } },
  setInterval: (callback, delay) => {
    const id = ++timerId;
    intervals.set(id, { callback, delay });
    return id;
  },
  clearInterval: (id) => { cleared.push(id); intervals.delete(id); },
};
vm.createContext(context);
vm.runInContext(source.slice(lifecycleStart, lifecycleEnd), context);

context.startBrowserMangaLookaheadTimer();
context.startBrowserMangaLookaheadTimer();
assert.equal(intervals.size, 1, 'Repeated start created a second manga timer.');
assert.equal(intervals.get(player.browserMangaLookaheadTimer).delay, 5000);

(async () => {
  await intervals.get(player.browserMangaLookaheadTimer).callback();
  assert.equal(calls.length, 0, 'Manga lookahead ran in player mode.');

  player.workspaceMode = 'browser';
  await intervals.get(player.browserMangaLookaheadTimer).callback();
  assert.equal(calls.length, 1, 'Manga lookahead did not run in browser mode.');

  const firstTimer = player.browserMangaLookaheadTimer;
  context.stopBrowserMangaLookaheadTimer();
  assert.deepEqual(cleared, [firstTimer]);
  assert.equal(player.browserMangaLookaheadTimer, null);
  assert.equal(intervals.size, 0);

  context.startBrowserMangaLookaheadTimer();
  assert.notEqual(player.browserMangaLookaheadTimer, firstTimer, 'Browser re-entry did not recreate the timer.');

  const workspaceBody = source.slice(source.indexOf('function setWorkspaceMode('),
    source.indexOf('async function navigateBrowserFromAddress'));
  assert.match(workspaceBody, /if \(mode === 'browser'\) \{[\s\S]*startBrowserMangaLookaheadTimer\(\)/);
  assert.match(workspaceBody, /else \{\s*stopBrowserMangaLookaheadTimer\(\)/);
  const unloadStart = source.indexOf("window.addEventListener('beforeunload'");
  const unloadBody = source.slice(unloadStart, source.indexOf('\n});', unloadStart) + 4);
  assert.match(unloadBody, /stopBrowserMangaLookaheadTimer\(\)/);
  console.log('browser-manga-lookahead-lifecycle: 8 tests');
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
