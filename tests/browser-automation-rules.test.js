const assert = require('assert');
const { browserAutomationDecision, browserAutomationOperationKey, createBrowserAutomationGate } = require('../src/browser-automation-rules');
let passed = 0;
function test(name, fn) { fn(); passed++; console.log(`  PASS  ${name}`); }

const base = { mode: 'auto', tabCurrent: true, mediaId: 'youtube:abc', sourceReady: true,
  sourceCharacters: 100, newCharacters: 100, targetLanguage: 'tr' };

test('aynı olay yirmi kez yalnız tek işlem üretir', () => {
  const gate = createBrowserAutomationGate(); const key = browserAutomationOperationKey(base);
  assert.equal(Array.from({ length: 20 }, () => gate.claim(key)).filter(Boolean).length, 1);
});
test('iptal edilen işlem yeni cue ile kendiliğinden dirilmez', () => {
  const gate = createBrowserAutomationGate(); const key = browserAutomationOperationKey(base);
  assert.equal(gate.claim(key), true); gate.cancel(key); assert.equal(gate.claim(key), false);
  gate.allowAgain(key); assert.equal(gate.claim(key), true);
});
test('reklam kimliği belirsizken ve kimlik yokken otomatik çağrı uygun değildir', () => {
  assert.equal(browserAutomationDecision({ ...base, advertisementUncertain: true }).reason, 'advertisement_uncertain');
  assert.equal(browserAutomationDecision({ ...base, mediaId: '' }).state, 'awaiting_identity');
});
test('tamamlanmış çeviri API çağrısını engeller', () => {
  assert.equal(browserAutomationDecision({ ...base, completed: true }).state, 'already_completed');
});
test('sor modu onay ister; otomatik mod uygun döner', () => {
  assert.equal(browserAutomationDecision({ ...base, mode: 'ask' }).state, 'requires_confirmation');
  assert.equal(browserAutomationDecision(base).state, 'eligible');
});
test('harcama sınırı başarılı kaynağı silmeden onaya geçirir', () => {
  assert.equal(browserAutomationDecision({ ...base, sourceCharacters: 200001 }).state, 'blocked_by_limit');
});
test('append-only kaynak aynı lineage için yeni iş kimliği üretmez', () => {
  const first = browserAutomationOperationKey({ ...base, sourceLineage: 'stream-1', sourceFingerprint: 'old' });
  const grown = browserAutomationOperationKey({ ...base, sourceLineage: 'stream-1', sourceFingerprint: 'new' });
  assert.equal(first, grown);
});
test('tamamlanan işlem tekrar başlamaz; açık yeniden deneme tekrar izin verir', () => {
  const gate = createBrowserAutomationGate(); const key = browserAutomationOperationKey(base);
  assert.equal(gate.claim(key), true); gate.complete(key); assert.equal(gate.claim(key), false);
  gate.allowAgain(key); assert.equal(gate.claim(key), true);
});
test('açık sıfır yeni karakter tüm kaynağa dönüşmez', () => {
  assert.equal(browserAutomationDecision({ ...base, sourceCharacters: 999999, newCharacters: 0,
    limits: { maxSourceCharacters: 1000000, maxSessionJobs: 10, maxLiveCharacters: 1 }, liveCharacters: 0 }).state, 'eligible');
});
test('canlı karakter sayacı yokken harcama sınırı atlanmaz', () => {
  assert.equal(browserAutomationDecision({
    ...base,
    sourceCharacters: 2,
    newCharacters: 2,
    limits: { maxSourceCharacters: 1000000, maxSessionJobs: 10, maxLiveCharacters: 1 },
  }).state, 'blocked_by_limit');
});
console.log(`browser-automation-rules: ${passed} test`);
