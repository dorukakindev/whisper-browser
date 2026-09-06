const assert = require('assert');
const { browserTabUnloadDecision, groupBrowserProcessMetrics } = require('../src/browser-tab-resources');
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
console.log(`browser-tab-resources: ${passed} test`);
