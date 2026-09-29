'use strict';
// Tur-2 UI paketinin regresyon kilitleri (TESTS-FOR-DEVIN §2):
//  1) Komut paleti: executeBrowserCommandPalette ham sekme nesnesiyle
//     ({id} — tabId alanı yok) çağrıldığında bile komutu çalıştırır;
//     sekme değişmişse çalıştırmaz. Master'da bu senaryo KIRMIZI'ydı.
//  2) browserTabsRightOf ekran sırasını (grup çekimli) kullanır, iç sırayı değil.
//  3) browser-page-find: aynı belge içi gezinme (SPA) bul çubuğunu sıfırlamaz.
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const fs = require('node:fs');
const path = require('node:path');
const { createBrowserPageFind } = require('../src/browser-page-find');
const paletteModule = require('../src/browser-command-palette');
const tabLayout = require('../src/browser-tab-layout');

const helpers = fs.readFileSync(path.join(__dirname, '..', 'src', 'renderer', 'renderer-helpers.js'), 'utf8');
function sliceBetween(source, start, end) {
  const i = source.indexOf(start);
  assert.ok(i >= 0, `dilim başı bulunamadı: ${start}`);
  const j = source.indexOf(end, i);
  assert.ok(j > i, `dilim sonu bulunamadı: ${end}`);
  return source.slice(i, j);
}
function sliceFunction(source, signature) {
  const i = source.indexOf(signature);
  assert.ok(i >= 0, signature);
  const j = source.indexOf('\nfunction ', i + signature.length);
  assert.ok(j > i, signature);
  return source.slice(i, j);
}

// ---- 1. executeBrowserCommandPalette — gerçek sekme nesnesiyle komut çalışır ----
(async () => {
  // currentBrowserWorkflowContext + browserWorkflowStepForCommand gövdeleri
  // gerçek halleriyle; bağımlılıklar parametre olarak verilir.
  const body = [
    sliceFunction(helpers, 'function currentBrowserWorkflowContext() {'),
    sliceFunction(helpers, 'function browserWorkflowStepForCommand(command) {'),
    sliceBetween(helpers,
      'async function executeBrowserCommandPalette(',
      '\n// Sekme ses düğmesi:'),
    'return executeBrowserCommandPalette;',
  ].join('\n');
  const factory = new Function(
    'browserCommandPaletteState', 'browserTabState', 'window',
    'setBrowserSignal', 'closeBrowserCommandPalette', 'browserWorkflowRecorder',
    body,
  );

  const ran = [];
  const signals = [];
  let closed = 0;
  const state = {
    results: [{ title: 'Sessiz', run: async () => { ran.push('x'); } }],
    selected: 0,
    context: { tabId: 't1', generation: 1, mediaId: '' }, // palet t1'de açıldı
  };
  let currentTab = { id: 't1', generation: 1, mediaId: '' }; // ham sekme nesnesi: `id`, tabId YOK
  const windowStub = { BrowserCommandPalette: paletteModule };
  const execPalette = factory(
    state,
    () => currentTab,
    windowStub,
    (msg) => signals.push(msg),
    () => { closed += 1; },
    { recording: false },
  );
  const call = () => execPalette(0);

  await call();
  assert.deepEqual(ran, ['x'], 'ham sekme nesnesiyle bile komut çalışır');
  assert.equal(signals.length, 0, '"Sekme veya medya değişti" hatası çıkmaz');

  currentTab = { id: 't2', generation: 1, mediaId: '' }; // sekme değişti
  await call();
  assert.deepEqual(ran, ['x'], 'sekme değişince komut çalışmaz');
  assert.ok(signals.some((m) => /değişti/.test(m)), 'bağlam uyarısı çıkar');
})().then(() => {

// ---- 2. browserTabsRightOf — ekran (grup çekimli) sırası ----
{
  const body = [
    sliceFunction(helpers, 'function browserTabsInScreenOrder() {'),
    sliceFunction(helpers, 'function browserTabsRightOf(tabId) {'),
    'return browserTabsRightOf;',
  ].join('\n');
  const rightOf = new Function('player', 'window', body);
  // İç sıra [A, B(g), C, D(g)]; aynı grup tek kümeye çekilir → ekran A, B, D, C.
  const g = { name: 'Okuma', color: 'blue' };
  const player = { browserTabs: [
    { id: 'A' }, { id: 'B', group: g }, { id: 'C' }, { id: 'D', group: g },
  ] };
  const windowStub = { BrowserTabLayout: tabLayout };
  assert.deepEqual(rightOf(player, windowStub)('D').map((t) => t.id), ['C'],
    'D\'nin ekran-sağında yalnız C kalır (iç sıraya göre B yoktur)');
  assert.deepEqual(rightOf(player, windowStub)('C'), [], 'son ekran sekmesinin sağı boş');
  assert.deepEqual(rightOf(player, windowStub)('A').map((t) => t.id), ['B', 'D', 'C'],
    'A\'nın sağı ekran sırasıyla B, D, C');
  assert.deepEqual(rightOf(player, windowStub)('Z'), [], 'bilinmeyen sekme → boş');

  // Sabit sekme sağdan kapanmaz.
  const player2 = { browserTabs: [{ id: 'A' }, { id: 'P', pinned: true }] };
  assert.deepEqual(rightOf(player2, windowStub)('A'), [], 'sabit sekme sağdan kapanmaz');
}

// ---- 3. browser-page-find — aynı belge içi gezinme sıfırlamaz ----
{
  class Contents extends EventEmitter {
    constructor() { super(); this.stopped = 0; }
    isDestroyed() { return false; }
    send() {}
    stopFindInPage() { this.stopped += 1; }
    findInPage() { return 1; }
  }
  const wc = new Contents();
  const events = [];
  createBrowserPageFind(wc, (e) => events.push(e), () => true);

  // SPA gezinmesi (pushState/hash): ana çerçeve ama aynı belge — sıfırlanmaz.
  wc.emit('did-start-navigation', { isMainFrame: true, isSameDocument: true }, 'https://x/watch?v=2', true, true);
  assert.equal(events.filter((e) => e.type === 'find-reset').length, 0,
    'aynı belge içi gezinmede find-reset gönderilmez');
  assert.equal(wc.stopped, 0, 'stopFindInPage çağrılmaz');

  // Eski argüman biçimi (positional inPlace) da aynı belge sayılır.
  wc.emit('did-start-navigation', {}, 'https://x/watch?v=3', true, true);
  assert.equal(wc.stopped, 0, 'inPlace=true → sıfırlanmaz');

  // Gerçek tam sayfa gezinmesi → sıfırlanır.
  wc.emit('did-start-navigation', { isMainFrame: true, isSameDocument: false }, 'https://y/', false, true);
  assert.equal(events.filter((e) => e.type === 'find-reset').length, 1,
    'farklı belgeye ana-çerçeve gezinmesi bul çubuğunu sıfırlar');
  assert.equal(wc.stopped, 1, 'stopFindInPage çağrılır');

  // Alt çerçeve gezinmesi her zaman yok sayılır.
  events.length = 0;
  wc.emit('did-start-navigation', { isMainFrame: false, isSameDocument: false }, 'https://f/', false, false);
  assert.equal(events.length, 0, 'iframe gezinmesi bul çubuğunu etkilemez');
}

console.log('browser-ui-round2: komut paleti, sağdaki sekmeler ve bul çubuğu kilitleri geçti.');
}).catch((error) => { console.error(error); process.exit(1); });
