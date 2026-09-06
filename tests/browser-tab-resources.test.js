const assert = require('assert');
const { browserTabUnloadDecision, groupBrowserProcessMetrics, normalizeBrowserPageResourceMetrics,
  summarizeBrowserResourceBudgets } = require('../src/browser-tab-resources');
let passed = 0;
function test(name, fn) { fn(); passed++; console.log(`  PASS  ${name}`); }

test('aktif, oynayan, sabit ve çalışan işli sekmeler korunur', () => {
  assert.equal(browserTabUnloadDecision({ id: 'a' }, { activeTabId: 'a' }).allowed, false);
  assert.equal(browserTabUnloadDecision({ id: 'a', audible: true }, {}).reason, 'media_playing');
  assert.equal(browserTabUnloadDecision({ id: 'a', pinned: true }, {}).reason, 'pinned');
  assert.equal(browserTabUnloadDecision({ id: 'a', mangaJob: {} }, {}).reason, 'active_job');
});
test('kontrolden sonra başlayan iş ikinci kontrolde boşaltmayı engeller', () => {
  const tab = { id: 'a' }; assert.equal(browserTabUnloadDecision(tab).allowed, true);
  tab.pageTranslateJob = {}; assert.equal(browserTabUnloadDecision(tab).allowed, false);
});
test('form, giriş ve ölçülemeyen sayfa güvenli varsayılanla korunur', () => {
  assert.equal(browserTabUnloadDecision({ id: 'a', formOrLogin: true }).reason, 'form_or_login');
  assert.equal(browserTabUnloadDecision({ id: 'a', stateKnown: false }).reason, 'unknown_state');
});
test('paylaşılan process belleği iki sekmeye bölünmez veya toplanmış gibi sunulmaz', () => {
  const rows = groupBrowserProcessMetrics([{ id: 'a', processId: 7 }, { id: 'b', processId: 7 }],
    [{ pid: 7, memory: { workingSetSize: 1234 }, cpu: { percentCPUUsage: 2 } }]);
  assert.equal(rows[0].processShared, true); assert.deepEqual(rows[0].sharedTabIds, ['a', 'b']);
  assert.equal(rows[0].memoryKiB, 1234); assert.equal(rows[1].memoryKiB, 1234);
});
test('ölçülemeyen değer sıfır değil null olur', () => {
  const [row] = groupBrowserProcessMetrics([{ id: 'a', processId: 0 }], []);
  assert.equal(row.memoryKiB, null); assert.equal(row.cpuPercent, null);
});
test('sayfa telemetrisi negatif ve sonsuz sayaçları güvenli hale getirir', () => {
  const row = normalizeBrowserPageResourceMetrics({ activeTimers: -4, observerCount: 2.9,
    overlayNodes: Infinity, ipcPerMinute: 12 });
  assert.equal(row.activeTimers, 0); assert.equal(row.observerCount, 2);
  assert.equal(row.overlayNodes, 0); assert.equal(row.ipcPerMinute, 12);
  assert.equal(normalizeBrowserPageResourceMetrics({ measured: false }).observerCount, null);
});
test('kaynak bütçesi sekme sayaçlarını ana süreç sayaçlarıyla bir kez toplar', () => {
  const result = summarizeBrowserResourceBudgets([
    { resources: { activeTimers: 2, observerCount: 3, overlayNodes: 4, ipcPerMinute: 5 } },
    { resources: { activeTimers: 1, observerCount: 2, overlayNodes: 0, ipcPerMinute: 7 } },
  ], { activeTimers: 3, pendingResponses: 8, bufferedCues: 90, networkSubscriptions: 2 });
  assert.deepEqual(result, { activeTimers: 6, observerCount: 5, overlayNodes: 4,
    ipcPerMinute: 12, networkSubscriptions: 2, pendingResponses: 8, bufferedCues: 90,
    networkCaptureActive: false });
});
console.log(`browser-tab-resources: ${passed} test`);
