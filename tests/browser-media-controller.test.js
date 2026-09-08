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

function probe(items, selectors = {}) {
  const document = {
    nodeType: 9,
    children: [],
    querySelectorAll: () => items,
    querySelector: selector => selectors[selector] || null,
  };
  class MutationObserver { observe() {} }
  return vm.runInNewContext(buildBrowserMediaProbeScript(), { window: {}, document, MutationObserver });
}

function visibleAdElement(textContent = '') {
  return { isConnected: true, textContent, getClientRects: () => [{}] };
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

test('every supported media command produces valid JavaScript', () => {
  for (const command of [
    'seek', 'seek-relative', 'play-pause', 'play', 'pause', 'mute',
    'volume-relative', 'volume-set', 'frame-step', 'speed', 'fullscreen', 'pip',
  ]) {
    assert.doesNotThrow(() => new vm.Script(buildBrowserMediaCommandScript(command, 1)), command);
  }
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

test('canlı yayının sonsuz süresi eşit görünür adaylarda sıralamayı çalmaz', () => {
  const recorded = { isConnected: true, tagName: 'VIDEO', paused: false, ended: false,
    clientWidth: 800, clientHeight: 450, currentTime: 11, readyState: 4, duration: 500 };
  const live = { isConnected: true, tagName: 'VIDEO', paused: false, ended: false,
    clientWidth: 800, clientHeight: 450, currentTime: 22, readyState: 4, duration: Infinity };
  assert.equal(probe([recorded, live]).currentTime, 11);
});

test('bağlantısı kopmuş shadow kökü observerını controller bırakır', () => {
  const observers = [];
  class MutationObserver {
    observe(root) { this.root = root; observers.push(this); }
    disconnect() { this.disconnected = true; }
  }
  const shadow = { nodeType: 11, children: [], querySelectorAll: () => [] };
  const host = { nodeType: 1, children: [], shadowRoot: shadow, isConnected: true,
    matches: () => false, querySelectorAll: () => [] };
  shadow.host = host;
  const document = { nodeType: 9, children: [host], querySelectorAll: () => [] };
  const context = { window: {}, document, MutationObserver };
  vm.runInNewContext(buildBrowserMediaProbeScript(), context);
  assert.equal(context.window.__whisperMediaController.diagnostics().observerCount, 2);
  host.isConnected = false;
  context.window.__whisperMediaController.select();
  assert.equal(context.window.__whisperMediaController.diagnostics().observerCount, 1);
  assert.equal(observers.find((observer) => observer.root === shadow).disconnected, true);
});

test('bozuk medya değerleri finite olmayan zamanı dışarı sızdırmaz', () => {
  const broken = { isConnected: true, tagName: 'VIDEO', paused: false, ended: false,
    clientWidth: 800, clientHeight: 450, currentTime: Infinity, duration: NaN,
    volume: Infinity, playbackRate: NaN };
  assert.deepEqual(probe([broken]), {
    currentTime: 0, duration: 0, paused: false, ended: false, tagName: 'video', muted: false,
    volume: 0, playbackRate: 1, area: 360000, adPlaying: false,
    adSkippable: false, adRemaining: null,
  });
});

test('yalnız ad-showing sınıfı reklamı kesin olarak işaretler', () => {
  const video = { isConnected: true, tagName: 'VIDEO', paused: false, ended: false,
    clientWidth: 800, clientHeight: 450, currentTime: 2, duration: 15 };
  const result = probe([video], { '.html5-video-player.ad-showing': visibleAdElement() });
  assert.equal(result.adPlaying, true);
  assert.equal(result.adSkippable, false);
});

test('yalnız görünür atla düğmesi reklamı ve atlanabilirliği işaretler', () => {
  const video = { isConnected: true, tagName: 'VIDEO', paused: false, ended: false,
    clientWidth: 800, clientHeight: 450, currentTime: 2, duration: 15 };
  const result = probe([video], { '.ytp-ad-skip-button-modern': visibleAdElement() });
  assert.equal(result.adPlaying, true);
  assert.equal(result.adSkippable, true);
});

test('reklam sinyali yokken normal içerik reklam sayılmaz', () => {
  const video = { isConnected: true, tagName: 'VIDEO', paused: false, ended: false,
    clientWidth: 800, clientHeight: 450, currentTime: 20, duration: 300 };
  const result = probe([video]);
  assert.equal(result.adPlaying, false);
  assert.equal(result.adSkippable, false);
  assert.equal(result.adRemaining, null);
});

test('açık reklam sayacı kalan saniyeye çevrilir', () => {
  const video = { isConnected: true, tagName: 'VIDEO', paused: false, ended: false,
    clientWidth: 800, clientHeight: 450, currentTime: 2, duration: 15 };
  const result = probe([video], {
    '.ytp-ad-text': visibleAdElement('Reklam 1:07 içinde sona erecek'),
  });
  assert.equal(result.adPlaying, true);
  assert.equal(result.adRemaining, 67);
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
