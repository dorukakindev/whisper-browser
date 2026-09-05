const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const code = fs.readFileSync(path.join(__dirname, '../src/renderer/renderer.js'), 'utf8');
const start = code.indexOf('function browserSponsorMode(');
const end = code.indexOf('function renderBrowserCueAt(', start);
assert(start >= 0 && end > start);
const nodes = { browserSponsorMode: { value: 'off' }, browserSponsorCategories: { selectedOptions: [] } };
const commands = [], signals = [];
const context = {
  Date, Number, Array, Set, URL,
  player: {
    workspaceMode: 'browser', browserSponsorSegments: [{ start: 60, end: 90, category: 'sponsor', uuid: 'one' }],
    browserSponsorSkipped: new Set(), browserSponsorExempt: new Set(), browserSponsorPrompted: new Set(),
    browserSponsorMutedUntil: 0, browserSponsorTemporaryDisabled: false,
    browserSponsorGeneration: 2, browserAdPlaying: false, browserDuration: 120, browserActiveTabId: 'tab',
    browserTime: 61, abA: null, abB: null, browserPaused: false,
  },
  $: id => nodes[id] || null,
  browserTabState: () => ({ generation: 2 }),
  browserCommand: async (command, value) => { commands.push([command, value]); return { ok: true }; },
  setBrowserSignal: (...args) => signals.push(args),
  pSecToTime: value => String(value),
  currentGeneration: () => 2,
  document: { createElement: () => ({}) },
  window: { api: {} },
};
vm.createContext(context);
vm.runInContext(code.slice(start, end), context);

(async () => {
  context.applyBrowserSponsorSkip(61, 60, false);
  assert.equal(commands.length, 0, 'kapalı mod seek gönderdi');

  nodes.browserSponsorMode.value = 'ask';
  context.applyBrowserSponsorSkip(61, 60, false);
  assert.equal(commands.length, 0, 'sor modu kendiliğinden seek gönderdi');
  assert.equal(signals.at(-1)[2].action, 'sponsor-skip');
  context.applyBrowserSponsorSkip(62, 61, false);
  assert.equal(signals.length, 1, 'sor modu aynı segment için bildirimi tekrarladı');

  nodes.browserSponsorMode.value = 'auto';
  context.applyBrowserSponsorSkip(61, 60, false);
  await Promise.resolve();
  assert.deepEqual(commands, [['seek', 90]]);
  context.applyBrowserSponsorSkip(62, 61, false);
  assert.equal(commands.length, 1, 'aynı segment ikinci kez atlandı');

  context.player.browserSponsorSkipped.clear(); context.player.abA = 50; context.player.abB = 70;
  context.applyBrowserSponsorSkip(61, 60, false);
  assert.equal(commands.length, 1, 'A-B döngüsü sırasında sponsor seek gönderildi');
  context.player.abA = context.player.abB = null; context.player.browserAdPlaying = true;
  context.applyBrowserSponsorSkip(61, 60, false);
  assert.equal(commands.length, 1, 'platform reklamı sırasında sponsor seek gönderildi');
  context.player.browserAdPlaying = false; context.player.browserSponsorMutedUntil = 0;
  context.applyBrowserSponsorSkip(61, 70, false);
  assert.equal(commands.length, 1, 'geri sarma ile aynı tick içinde yeniden atlandı');
  assert(context.player.browserSponsorMutedUntil > Date.now());
  context.player.abA = context.player.abB = null;
  context.player.browserSponsorSkipped.clear();
  context.player.browserSponsorExempt.clear();
  context.player.browserSponsorPrompted.clear();
  context.player.browserSponsorSegments = [{ start: 60, end: 90, category: 'sponsor', uuid: 'one' }];
  context.seekBrowserSponsorSegment(context.player.browserSponsorSegments[0], true);
  await Promise.resolve();
  context.player.browserSponsorMutedUntil = 0;
  context.applyBrowserSponsorSkip(61, 60, false);
  assert.equal(commands.length, 2, 'geri alınan segment video içinde yeniden atlandı');
  console.log('SponsorBlock renderer: kapalı/sor/otomatik, tek seek, A-B, reklam ve geri sarma testleri geçti.');
})().catch((error) => { console.error(error); process.exitCode = 1; });
