const assert = require('assert');
const vm = require('vm');
const {
  buildBrowserMediaCommandScript,
  buildBrowserMediaProbeScript,
} = require('../src/browser-media-controller');

let passed = 0;
// Geçersiz komut DOM'a/controller'a bile dokunmadan reddedilmeli.
for (const command of ['seek', 'seek-relative', 'speed', 'volume']) {
  for (const value of [Infinity, -Infinity, NaN, '1e999']) {
    vm.runInNewContext(buildBrowserMediaCommandScript(command, value), {})
      .then(result => assert.strictEqual(result, false));
  }
}
function test(name, fn) { fn(); passed += 1; }

function probe(items) {
  const document = { nodeType: 9, children: [], querySelectorAll: () => items };
  class MutationObserver { observe() {} }
  return vm.runInNewContext(buildBrowserMediaProbeScript(), { window: {}, document, MutationObserver });
}

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
  assert.doesNotMatch(script, /querySelectorAll\('\*'\)/);
  assert.match(script, /scanShadowHosts\(node, depth = 0\)/);
});

test('komutlar durum yoklamasıyla aynı medya seçicisini kullanır', () => {
  const script = buildBrowserMediaCommandScript('speed', 1.5);
  assert.match(script, /const video = controller.select\(\)/);
  assert.match(script, /video\.playbackRate/);
  assert.match(script, /1\.5/);
});

test('oynayan görünür video büyük ama duraklatılmış videodan önce seçilir', () => {
  const paused = { isConnected: true, tagName: 'VIDEO', paused: true, ended: false,
    clientWidth: 1920, clientHeight: 1080, currentTime: 11, duration: 500 };
  const playing = { isConnected: true, tagName: 'VIDEO', paused: false, ended: false,
    clientWidth: 640, clientHeight: 360, currentTime: 22, duration: 400 };
  assert.equal(probe([paused, playing]).currentTime, 22);
});

test('bir piksellik oynayan izleyici video görünür oynatıcıyı çalmaz', () => {
  const hidden = { isConnected: true, tagName: 'VIDEO', paused: false, ended: false,
    clientWidth: 1, clientHeight: 1, currentTime: 11, duration: 5 };
  const visible = { isConnected: true, tagName: 'VIDEO', paused: true, ended: false,
    clientWidth: 800, clientHeight: 450, currentTime: 22, duration: 400 };
  assert.equal(probe([hidden, visible]).currentTime, 22);
});

test('oynayan ses öğesi duraklatılmış dekoratif videodan önce seçilir', () => {
  const video = { isConnected: true, tagName: 'VIDEO', paused: true, ended: false,
    clientWidth: 800, clientHeight: 450, currentTime: 11, duration: 400 };
  const audio = { isConnected: true, tagName: 'AUDIO', paused: false, ended: false,
    clientWidth: 0, clientHeight: 0, currentTime: 22, duration: 300 };
  assert.equal(probe([video, audio]).currentTime, 22);
});

test('bozuk medya değerleri finite olmayan zamanı dışarı sızdırmaz', () => {
  const broken = { isConnected: true, tagName: 'VIDEO', paused: false, ended: false,
    clientWidth: 800, clientHeight: 450, currentTime: Infinity, duration: NaN,
    volume: Infinity, playbackRate: NaN };
  assert.deepEqual(probe([broken]), {
    currentTime: 0, duration: 0, paused: false, ended: false, tagName: 'video', muted: false,
    volume: 0, playbackRate: 1, area: 360000, adPlaying: false,
  });
});

test('tam ekran ham video yerine altyazıyı taşıyabilen oynatıcı kapsayıcısını seçer', () => {
  const script = buildBrowserMediaCommandScript('fullscreen', 0);
  assert.match(script, /video\.closest\('\.html5-video-player/);
  assert.match(script, /target\.requestFullscreen/);
  assert.doesNotMatch(script, /else await video\.requestFullscreen/);
});

test('Picture-in-Picture desteklenmiyorsa kullanıcıya açık hata döner', () => {
  const script = buildBrowserMediaCommandScript('pip', 0);
  assert.match(script, /Picture-in-Picture desteklemiyor/);
  assert.match(script, /handled: false, error/);
});

console.log(`browser-media-controller: ${passed} test`);
