const assert = require('assert');
const vm = require('vm');
const { buildBrowserOverlayScript } = require('../src/browser-overlay-controller');

let passed = 0;
function test(name, fn) { fn(); passed += 1; }

const script = buildBrowserOverlayScript({ mode: 'both', source: [], translation: [] }, '(cues) => cues');

test('overlay tek controller ve observer yaşam döngüsü kurar', () => {
  assert.match(script, /__whisperBrowserOverlayController/);
  assert.match(script, /new MutationObserver/);
  assert.match(script, /new ResizeObserver/);
  assert.match(script, /visibilitychange/);
  assert.match(script, /fullscreenchange/);
});

test('kapalı, gizli ve duraklatılmış durumda sürekli frame planlamaz', () => {
  assert.match(script, /document\.hidden \|\| state\.mode === 'off' \|\| !media \|\| media\.paused/);
  assert.match(script, /state\.mode === 'off'\) \{[\s\S]*?cancelFrame/);
  assert.match(script, /requestVideoFrameCallback/);
});

test('ilk durum kapalıysa DOM katmanı ve medya taraması oluşturmaz', () => {
  let created = 0, scanned = 0;
  const window = { addEventListener() {} };
  const document = {
    hidden: false, documentElement: {},
    addEventListener() {}, getElementById() { return null; },
    createElement() { created++; return {}; },
    querySelectorAll() { scanned++; return []; },
  };
  const result = vm.runInNewContext(
    buildBrowserOverlayScript({ mode: 'off', style: { hideSiteCaptions: true } }, '() => []'),
    { window, document, globalThis: window, cancelAnimationFrame() {}, requestAnimationFrame() { return 1; } });
  assert.equal(result, true);
  assert.equal(created, 0);
  assert.equal(scanned, 0);
  assert.equal(window.__whisperBrowserOverlayController.diagnostics().hasMedia, false);
});

test('kapalı moda geçiş medya dinleyicilerini ve seçimi bırakır', () => {
  assert.match(script, /state\.mode === 'off'\) \{[\s\S]*?stopWatchingMedia\(\);[\s\S]*?media = null/);
  assert.match(script, /if \(state\.mode !== 'off'\) startObserving\(\)/);
});

test('mevcut başka bir medya oynayınca seçim önbelleği yenilenir', () => {
  assert.match(script, /const candidateListeners = new Map\(\)/);
  assert.match(script, /for \(const type of \['play', 'pause', 'loadedmetadata', 'emptied'\]\)/);
  assert.match(script, /const activity = \(\) => \{[\s\S]*?mediaDirty = true;[\s\S]*?render\(\)/);
  assert.match(script, /candidateListeners\.clear\(\)/);
});

test('doküman taraması frame callback içinde değil yalnız kirli keşifte yapılır', () => {
  const callback = script.slice(script.indexOf('const queueFrame'), script.indexOf('function render'));
  assert(!callback.includes('querySelectorAll'));
  assert.match(script, /if \(!mediaDirty && media && media\.isConnected\) return media/);
  assert.doesNotMatch(script, /querySelectorAll\('\*'\)/);
  assert.match(script, /scanShadowHosts = \(node, depth = 0\)/);
});

test('DOM değişiklikleri tek animation frame içinde birleştirilir', () => {
  const observer = script.slice(script.indexOf('const mutationObserver'), script.indexOf('mutationObserver.observe'));
  assert.match(observer, /if \(mutationFrame/);
  assert.match(observer, /mutationFrame = requestAnimationFrame/);
});

test('yeniden enjeksiyon yeni controller üretmeden state günceller', () => {
  assert.match(script, /existing && typeof existing\.update === 'function'/);
  assert.match(script, /existing\.update\(nextState\)/);
});

test('web altyazısı basılı tutularak taşınır ve yeni konum uygulamaya bildirilir', () => {
  assert.match(script, /addEventListener\('pointerdown'/);
  assert.match(script, /setPointerCapture/);
  assert.match(script, /__whisperTrustedBridgeSend\?\.\('overlay-style'/);
  assert.equal((script.match(/!event\.isTrusted/g) || []).length, 3);
  assert.doesNotMatch(script, /__WHISPER_BROWSER_OVERLAY_STYLE__/);
  assert.match(script, /Math\.min\(75/);
  assert.match(script, /style\.pointerEvents = 'auto'/);
});

test('satır ayırıcı karakterleri silmeden JavaScript içinde güvenle escape eder', () => {
  const escaped = buildBrowserOverlayScript({ mode: 'source', source: [{ text: `a\u2028b\u2029c` }] }, '(cues) => cues');
  assert(escaped.includes('a\\u2028b\\u2029c'));
  assert(!escaped.includes(`a\u2028b`));
});

console.log(`browser-overlay-controller: ${passed} test`);
