const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const code = fs.readFileSync(path.join(__dirname, '../src/renderer/renderer.js'), 'utf8');
const normalizeStart = code.indexOf('function normalizeBrowserSponsorExemptions(');
const normalizeEnd = code.indexOf('function secretSettingValue(', normalizeStart);
assert(normalizeStart >= 0 && normalizeEnd > normalizeStart);
const normalizeContext = { result: null };
vm.runInNewContext(`${code.slice(normalizeStart, normalizeEnd)}\nresult = normalizeBrowserSponsorExemptions({\n  'browser:video-a': { ids: ['one', 'one', '', 'two'], updatedAt: 2 },\n  '': { ids: ['ignored'], updatedAt: 3 },\n  'browser:video-b': { ids: ['three'], updatedAt: 1 },\n});`, normalizeContext);
assert.deepEqual(JSON.parse(JSON.stringify(normalizeContext.result)), {
  'browser:video-a': { ids: ['one', 'two'], updatedAt: 2 },
  'browser:video-b': { ids: ['three'], updatedAt: 1 },
});

const start = code.indexOf('function browserSponsorMode(');
const end = code.indexOf('function renderBrowserCueAt(', start);
assert(start >= 0 && end > start);
const nodes = { browserSponsorMode: { value: 'off' }, browserSponsorCategories: { selectedOptions: [] } };
const commands = [], signals = [];
let watchTimerCallback = null;
let settingsSaves = 0;
let passed = 0;
const context = {
  Date, Number, Array, Set, URL,
  browserSponsorExemptions: {},
  player: {
    workspaceMode: 'browser', browserSponsorSegments: [{ start: 60, end: 90, category: 'sponsor', uuid: 'one' }],
    browserSponsorSkipped: new Set(), browserSponsorExempt: new Set(), browserSponsorPrompted: new Set(),
    browserSponsorMutedUntil: 0, browserSponsorTemporaryDisabled: false,
    browserSponsorWatchTimer: null, browserSignalState: null,
    browserSponsorGeneration: 2, browserAdPlaying: false, browserDuration: 120, browserActiveTabId: 'tab',
    browserTime: 61, abA: null, abB: null, browserPaused: false, mediaKey: 'browser:video-a',
  },
  $: id => nodes[id] || null,
  browserTabState: () => ({ generation: 2 }),
  browserCommand: async (command, value) => { commands.push([command, value]); return { ok: true }; },
  setBrowserSignal: (...args) => signals.push(args),
  setTimeout: (callback) => { watchTimerCallback = callback; return 1; },
  clearTimeout: () => { watchTimerCallback = null; },
  pSecToTime: value => String(value),
  currentGeneration: () => 2,
  normalizeBrowserSponsorExemptions: value => value,
  scheduleSave: () => { settingsSaves += 1; },
  document: { createElement: () => ({}) },
  window: { api: {} },
};
vm.createContext(context);
vm.runInContext(code.slice(start, end), context);

(async () => {
  context.applyBrowserSponsorSkip(61, 60, false);
  assert.equal(commands.length, 0, 'kapalı mod seek gönderdi');
  passed += 1;

  nodes.browserSponsorMode.value = 'ask';
  context.applyBrowserSponsorSkip(61, 60, false);
  assert.equal(commands.length, 0, 'sor modu kendiliğinden seek gönderdi');
  assert.equal(signals.at(-1)[2].action, 'sponsor-skip');
  passed += 1;
  context.applyBrowserSponsorSkip(62, 61, false);
  assert.equal(signals.length, 1, 'sor modu aynı segment için bildirimi tekrarladı');
  passed += 1;
  context.applyBrowserSponsorSkip(91, 62, false);
  context.applyBrowserSponsorSkip(61, 60, false);
  assert.equal(signals.length, 2, 'segment dışına çıkınca Sor bildirimi yeniden sunulmadı');
  passed += 1;

  nodes.browserSponsorMode.value = 'auto';
  context.applyBrowserSponsorSkip(61, 60, false);
  await Promise.resolve();
  assert.deepEqual(commands, [['seek', 90]]);
  passed += 1;
  context.applyBrowserSponsorSkip(62, 61, false);
  assert.equal(commands.length, 1, 'aynı segment ikinci kez atlandı');
  passed += 1;
  context.applyBrowserSponsorSkip(91, 62, false);
  context.applyBrowserSponsorSkip(61, 60, false);
  await Promise.resolve();
  assert.equal(commands.length, 2, 'segment dışına çıkıp geri dönünce SponsorBlock yeniden atlamadı');
  passed += 1;

  context.player.browserSponsorSkipped.clear(); context.player.abA = 50; context.player.abB = 70;
  context.applyBrowserSponsorSkip(61, 60, false);
  assert.equal(commands.length, 2, 'A-B döngüsü sırasında sponsor seek gönderildi');
  passed += 1;
  context.player.abA = context.player.abB = null; context.player.browserAdPlaying = true;
  context.applyBrowserSponsorSkip(61, 60, false);
  assert.equal(commands.length, 2, 'platform reklamı sırasında sponsor seek gönderildi');
  passed += 1;
  context.player.browserAdPlaying = false; context.player.browserSponsorMutedUntil = 0;
  context.applyBrowserSponsorSkip(61, 70, false);
  assert.equal(commands.length, 2, 'geri sarma ile aynı tick içinde yeniden atlandı');
  assert(context.player.browserSponsorMutedUntil > Date.now());
  assert.equal(signals.at(-1)[2].action, 'sponsor-watch', 'geri sarmada doğrudan izleme eylemi sunulmadı');
  assert.equal(typeof watchTimerCallback, 'function', 'izleme eylemi üç saniye sonra kapanmak üzere planlanmadı');
  context.exemptBrowserSponsorSegment(context.player.browserSponsorSegments[0]);
  assert(context.player.browserSponsorExempt.has('one'), 'Bu bölümü izle eylemi kalıcı video muafiyeti oluşturmadı');
  assert.equal(JSON.stringify(context.browserSponsorExemptions['browser:video-a'].ids), '["one"]');
  assert.equal(settingsSaves, 1, 'kalıcı sponsor istisnası ayar kaydını planlamadı');
  context.player.browserSponsorExempt.clear();
  context.restoreBrowserSponsorExemptions();
  assert(context.player.browserSponsorExempt.has('one'), 'kayıtlı sponsor istisnası medya geri açılınca yüklenmedi');
  passed += 1;
  context.player.abA = context.player.abB = null;
  context.player.browserSponsorSkipped.clear();
  context.player.browserSponsorExempt.clear();
  context.player.browserSponsorPrompted.clear();
  context.player.browserSponsorSegments = [{ start: 60, end: 90, category: 'sponsor', uuid: 'one' }];
  context.seekBrowserSponsorSegment(context.player.browserSponsorSegments[0], true);
  await Promise.resolve();
  assert.equal(JSON.stringify(context.browserSponsorExemptions['browser:video-a'].ids), '["one"]');
  assert.equal(settingsSaves, 2, 'başarılı geri alma sponsor istisnasını kalıcılaştırmadı');
  context.player.browserSponsorMutedUntil = 0;
  context.applyBrowserSponsorSkip(61, 60, false);
  assert.equal(commands.length, 3, 'geri alınan segment video içinde yeniden atlandı');
  passed += 1;
  console.log(`SponsorBlock renderer: ${passed} test`);
})().catch((error) => { console.error(error); process.exitCode = 1; });
