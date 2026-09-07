const assert = require('assert');
const { browserCommandContextMatches, browserShortcutForInput, normalizeTurkishSearch, rankBrowserCommands } = require('../src/browser-command-palette');
let passed = 0;
function test(name, fn) { fn(); passed++; console.log(`  PASS  ${name}`); }
test('Türkçe arama diakritikleri güvenli normalize eder', () => assert.equal(normalizeTurkishSearch('Çeviri İzi'), 'ceviri izi'));
test('tam ve prefix eşleşme daha yüksek sıralanır', () => {
  const rows = rankBrowserCommands([{ id: 'a', title: 'Altyazı' }, { id: 'b', title: 'Altyazı ayarları' }], 'altyazı');
  assert.deepEqual(rows.map((row) => row.id), ['a', 'b']);
});
test('devre dışı komut nedeni ile görünür kalır', () => {
  const [row] = rankBrowserCommands([{ id: 'a', title: 'Not ekle', available: () => ({ enabled: false, reason: 'Video yok.' }) }], 'not');
  assert.equal(row.enabled, false); assert.equal(row.disabledReason, 'Video yok.');
});
test('palet açıkken sekme veya medya değişirse eski bağlam reddedilir', () => {
  assert.equal(browserCommandContextMatches({ tabId: 'a', generation: 1, mediaId: 'x' }, { tabId: 'a', generation: 1, mediaId: 'x' }), true);
  assert.equal(browserCommandContextMatches({ tabId: 'a', generation: 1, mediaId: 'x' }, { tabId: 'b', generation: 1, mediaId: 'x' }), false);
});
test('native görünüm yalnız desteklenen kısayolları köprüler', () => {
  assert.equal(browserShortcutForInput({ type: 'keyDown', key: 'k', control: true }), 'k');
  assert.equal(browserShortcutForInput({ type: 'keyDown', key: 'f', meta: true }), 'f');
  assert.equal(browserShortcutForInput({ type: 'keyDown', key: 'l', control: true }), 'l');
  assert.equal(browserShortcutForInput({ type: 'keyDown', key: 't', control: true, shift: true }), 't');
  assert.equal(browserShortcutForInput({ type: 'keyDown', key: 'k', control: true, shift: true }), '');
  assert.equal(browserShortcutForInput({ type: 'keyDown', key: 'f', control: true, shift: true }), '');
  assert.equal(browserShortcutForInput({ type: 'keyDown', key: 'l', control: true, shift: true }), '');
  assert.equal(browserShortcutForInput({ type: 'keyDown', key: 'a', control: true }), '');
  assert.equal(browserShortcutForInput({ type: 'keyUp', key: 'k', control: true }), '');
  assert.equal(browserShortcutForInput({ type: 'keyDown', key: 'k', control: true, alt: true }), '');
});
console.log(`browser-command-palette: ${passed} test`);
