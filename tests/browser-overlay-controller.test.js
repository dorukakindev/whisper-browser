const assert = require('assert');
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
  assert.match(script, /state\.mode === 'off'\) cancelFrame/);
  assert.match(script, /requestVideoFrameCallback/);
});

test('doküman taraması frame callback içinde değil yalnız kirli keşifte yapılır', () => {
  const callback = script.slice(script.indexOf('const queueFrame'), script.indexOf('function render'));
  assert(!callback.includes('querySelectorAll'));
  assert.match(script, /if \(!mediaDirty && media && media\.isConnected\) return media/);
});

test('yeniden enjeksiyon yeni controller üretmeden state günceller', () => {
  assert.match(script, /existing && typeof existing\.update === 'function'/);
  assert.match(script, /existing\.update\(nextState\)/);
});

console.log(`browser-overlay-controller: ${passed} test`);
