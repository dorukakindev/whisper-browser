const assert = require('assert');
const {
  buildBrowserMediaCommandScript,
  buildBrowserMediaProbeScript,
} = require('../src/browser-media-controller');

let passed = 0;
function test(name, fn) { fn(); passed += 1; }

test('medya adayları sayfada kalıcı bir controller ile izlenir', () => {
  const script = buildBrowserMediaProbeScript();
  assert.match(script, /__whisperMediaController/);
  assert.match(script, /new MutationObserver/);
  assert.match(script, /const media = new Set/);
  assert.match(script, /if \(window\.__whisperMediaController\) return/);
});

test('her durum yoklaması bütün DOM ağacını yeniden taramaz', () => {
  const script = buildBrowserMediaProbeScript();
  const probe = script.slice(script.lastIndexOf('return controller.probe'));
  assert(!probe.includes('querySelectorAll'));
  assert.match(script, /scan\(document\)/);
});

test('komutlar durum yoklamasıyla aynı medya seçicisini kullanır', () => {
  const script = buildBrowserMediaCommandScript('speed', 1.5);
  assert.match(script, /const video = controller.select\(\)/);
  assert.match(script, /video\.playbackRate/);
  assert.match(script, /1\.5/);
});

console.log(`browser-media-controller: ${passed} test`);
