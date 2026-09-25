const assert = require('assert');
const vm = require('vm');
const {
  buildBrowserMediaCommandScript,
  buildBrowserMediaProbeScript,
  buildBrowserMediaPreferenceScript,
  buildBrowserOsdScript,
  normalizeBrowserMediaPreference,
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
const pending = [];
function asyncTest(name, fn) {
  pending.push(Promise.resolve().then(fn).then(() => { passed += 1; }));
}

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

function mediaCommandHarness(video, selectors = {}) {
  const document = {
    nodeType: 9,
    children: [],
    querySelectorAll: () => [video],
    querySelector: selector => selectors[selector] || null,
  };
  class MutationObserver { observe() {} }
  return {
    context: { window: {}, document, MutationObserver },
    selectors,
  };
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

asyncTest('R51-13: probe ile komut arasındaki gezinme yeni belgede mutasyonu reddeder', async () => {
  const oldVideo = { isConnected: true, tagName: 'VIDEO', paused: false, ended: false,
    clientWidth: 800, clientHeight: 450, currentTime: 5, duration: 100 };
  const oldDoc = mediaCommandHarness(oldVideo);
  const oldProbe = await vm.runInNewContext(buildBrowserMediaProbeScript(), oldDoc.context);
  assert.match(String(oldProbe.docToken || ''), /^doc-/);
  // Gezinme: aynı frame yeni belgeyi barındırıyor — yeni window + yeni controller.
  const newVideo = { isConnected: true, tagName: 'VIDEO', paused: false, ended: false,
    clientWidth: 800, clientHeight: 450, currentTime: 77, duration: 200 };
  const newDoc = mediaCommandHarness(newVideo);
  const staleSeek = await vm.runInNewContext(
    buildBrowserMediaCommandScript('seek', 1, oldProbe.docToken), newDoc.context);
  assert.deepEqual(staleSeek, { handled: false, stale: true },
    'eski belgenin tokeni yeni belgede mutasyona izin vermemeli');
  assert.equal(newVideo.currentTime, 77, 'yeni belgenin videosu seek edilmemeli');
  // Aynı belge: token eşleşir, komut uygulanır.
  const applied = await vm.runInNewContext(
    buildBrowserMediaCommandScript('seek', 42, oldProbe.docToken), oldDoc.context);
  assert.equal(applied.handled, true);
  assert.equal(oldVideo.currentTime, 42);
  // Geriye uyumluluk: token verilmezse komut eskisi gibi çalışır.
  const legacy = await vm.runInNewContext(
    buildBrowserMediaCommandScript('seek', 9), oldDoc.context);
  assert.equal(legacy.handled, true);
  assert.equal(oldVideo.currentTime, 9);
});

asyncTest('R51-13: medya tercihi de belge tokenine bağlıdır', async () => {
  const video = { isConnected: true, tagName: 'VIDEO', paused: false, ended: false,
    clientWidth: 800, clientHeight: 450, currentTime: 5, duration: 100,
    playbackRate: 1, preservesPitch: true, style: {} };
  const first = mediaCommandHarness(video);
  const probeResult = await vm.runInNewContext(buildBrowserMediaProbeScript(), first.context);
  const foreign = mediaCommandHarness(video);
  const refused = await vm.runInNewContext(
    buildBrowserMediaPreferenceScript({ rate: 2 }, probeResult.docToken), foreign.context);
  assert.deepEqual(refused, { handled: false, stale: true });
  const applied = await vm.runInNewContext(
    buildBrowserMediaPreferenceScript({ rate: 2 }, probeResult.docToken), first.context);
  assert.equal(applied.handled, true);
});

test('every supported media command produces valid JavaScript', () => {
  for (const command of [
    'seek', 'seek-relative', 'play-pause', 'play', 'pause', 'mute',
    'volume-relative', 'volume-set', 'frame-step', 'speed', 'fullscreen', 'pip', 'skipAd',
  ]) {
    assert.doesNotThrow(() => new vm.Script(buildBrowserMediaCommandScript(command, 1)), command);
  }
});

test('medya tercihi sınırlandırılır ve çalıştırılabilir JavaScript üretir', () => {
  assert.deepEqual(normalizeBrowserMediaPreference({ rate: 99, brightness: 0,
    contrast: 3, enforceRate: true, preservesPitch: false, normalizeAudio: true }), {
    rate: 4, brightness: .4, contrast: 2, enforceRate: true, preservesPitch: false,
    normalizeAudio: true, silenceSpeedEnabled: false, silenceSpeedRate: 3,
    silenceThresholdDb: -45, audioProfile: 'off',
  });
  assert.doesNotThrow(() => new vm.Script(buildBrowserMediaPreferenceScript({ rate: 1.25 })));
});

asyncTest('hız koruması, ses perdesi ve video filtresi aynı kalıcı controller üzerinden uygulanır', async () => {
  const listeners = {};
  const video = { isConnected: true, tagName: 'VIDEO', paused: false, ended: false,
    clientWidth: 800, clientHeight: 450, currentTime: 5, duration: 100,
    playbackRate: 1, preservesPitch: false, style: {},
    addEventListener(type, fn) { listeners[type] = fn; } };
  const harness = mediaCommandHarness(video);
  const result = await vm.runInNewContext(buildBrowserMediaPreferenceScript({
    rate: 1.5, enforceRate: true, preservesPitch: true, brightness: 1.2, contrast: .9,
  }), harness.context);
  assert.equal(result.handled, true);
  assert.equal(video.playbackRate, 1.5);
  assert.equal(video.preservesPitch, true);
  assert.equal(video.style.filter, 'brightness(1.2) contrast(0.9)');
  video.playbackRate = 1;
  listeners.ratechange();
  assert.equal(video.playbackRate, 1.5, 'site hız sıfırlaması geri alınmadı');
});

asyncTest('site hız sıfırlaması tercih yazımıyla aynı görevde yarışsa da yeniden uygulanır', async () => {
  const listeners = {};
  const video = { isConnected: true, tagName: 'VIDEO', paused: false, ended: false,
    clientWidth: 800, clientHeight: 450, currentTime: 5, duration: 100,
    playbackRate: 1, preservesPitch: true, style: {},
    addEventListener(type, fn) { listeners[type] = fn; } };
  const harness = mediaCommandHarness(video);
  const result = vm.runInNewContext(buildBrowserMediaPreferenceScript({
    rate: 1.75, enforceRate: true,
  }), harness.context);
  assert.equal(result.handled, true);
  assert.equal(video.playbackRate, 1.75);
  // configurePlayback'in applyingRate bayrağı mikro-görevde kapanmadan site
  // kendi hızını yazıyor: Electron kabul testinde yakalanan gerçek yarış.
  video.playbackRate = 1;
  listeners.ratechange();
  assert.equal(video.playbackRate, 1, 'yarış senaryosu eşzamanlı olarak gizlenmemeli');
  await Promise.resolve();
  await Promise.resolve();
  assert.equal(video.playbackRate, 1.75, 'kaçırılan ratechange sonradan doğrulanmadı');
});

asyncTest('video filtresi sitenin kendi filtresini korur ve kapatılınca geri yükler', async () => {
  const video = { isConnected: true, tagName: 'VIDEO', paused: false, ended: false,
    clientWidth: 800, clientHeight: 450, currentTime: 5, duration: 100,
    playbackRate: 1, preservesPitch: true, style: { filter: 'saturate(0.8)' },
    addEventListener() {} };
  const harness = mediaCommandHarness(video);
  await vm.runInNewContext(buildBrowserMediaPreferenceScript({ brightness: 1.2, contrast: .9 }),
    harness.context);
  assert.equal(video.style.filter, 'saturate(0.8) brightness(1.2) contrast(0.9)');
  await vm.runInNewContext(buildBrowserMediaPreferenceScript({ brightness: 1, contrast: 1 }),
    harness.context);
  assert.equal(video.style.filter, 'saturate(0.8)');
});

asyncTest('site filtreyi sonradan değiştirirse güncel değer korunur', async () => {
  const video = { isConnected: true, tagName: 'VIDEO', paused: false, ended: false,
    clientWidth: 800, clientHeight: 450, currentTime: 5, duration: 100,
    playbackRate: 1, preservesPitch: true, style: { filter: 'saturate(0.8)' },
    addEventListener() {} };
  const harness = mediaCommandHarness(video);
  await vm.runInNewContext(buildBrowserMediaPreferenceScript({ brightness: 1.2 }), harness.context);
  video.style.filter = 'sepia(0.3)';
  await vm.runInNewContext(buildBrowserMediaPreferenceScript({ brightness: 1.4 }), harness.context);
  assert.equal(video.style.filter, 'sepia(0.3) brightness(1.4) contrast(1)');
  await vm.runInNewContext(buildBrowserMediaPreferenceScript({ brightness: 1, contrast: 1 }),
    harness.context);
  assert.equal(video.style.filter, 'sepia(0.3)');
});

test('ses normalleştirme çapraz kaynak CORS kapısı ve compressor yolu içerir', () => {
  const script = buildBrowserMediaPreferenceScript({ normalizeAudio: true });
  assert.match(script, /crossOrigin/);
  assert.match(script, /createMediaElementSource/);
  assert.match(script, /createDynamicsCompressor/);
  assert.match(script, /ratio: 8/);
  assert.doesNotMatch(script, /graph\.context\.close/);
  assert.match(script, /graph\.source\.connect\(graph\.context\.destination\)/);
  assert.match(script, /releaseMedia\(item\)/);
});

asyncTest('açık hız niyeti fightback tarafından aynı olayda geri alınmaz', async () => {
  const listeners = {};
  const video = { isConnected: true, tagName: 'VIDEO', paused: false, ended: false,
    clientWidth: 800, clientHeight: 450, currentTime: 5, duration: 100,
    playbackRate: 1, preservesPitch: true, style: {},
    addEventListener(type, fn) { listeners[type] = fn; } };
  const harness = mediaCommandHarness(video);
  await vm.runInNewContext(buildBrowserMediaPreferenceScript({ rate: 1.25, enforceRate: true }),
    harness.context);
  const result = await vm.runInNewContext(buildBrowserMediaCommandScript('speed', 2), harness.context);
  assert.equal(result.playbackRate, 2);
  listeners.ratechange();
  assert.equal(video.playbackRate, 2, 'açık uygulama hız niyeti eski profile geri alındı');
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

test('yeniden eklenen shadow host kendi kökündeki medyayı tekrar kaydeder', () => {
  const observed = new Map();
  class MutationObserver {
    constructor(callback) { this.callback = callback; }
    observe(root) { observed.set(root, this); }
    disconnect() {}
  }
  const video = { nodeType: 1, isConnected: true, tagName: 'VIDEO', paused: true, ended: false,
    clientWidth: 640, clientHeight: 360, currentTime: 7, duration: 90,
    playbackRate: 1, preservesPitch: true, style: {}, matches: () => true,
    addEventListener() {}, querySelectorAll: () => [] };
  const shadow = { nodeType: 11, children: [video], querySelectorAll: () => [video] };
  const host = { nodeType: 1, children: [], shadowRoot: shadow, isConnected: true,
    matches: () => false, querySelectorAll: () => [] };
  shadow.host = host;
  const document = { nodeType: 9, children: [], querySelectorAll: () => [] };
  const context = { window: {}, document, MutationObserver };
  vm.runInNewContext(buildBrowserMediaProbeScript(), context);
  observed.get(document).callback([{ addedNodes: [host], removedNodes: [] }]);
  assert.equal(context.window.__whisperMediaController.diagnostics().candidateCount, 1);
  assert.equal(context.window.__whisperMediaController.diagnostics().observerCount, 2);
  assert.equal(context.window.__whisperMediaController.select(), video);
});

test('bozuk medya değerleri finite olmayan zamanı dışarı sızdırmaz', () => {
  const broken = { isConnected: true, tagName: 'VIDEO', paused: false, ended: false,
    clientWidth: 800, clientHeight: 450, currentTime: Infinity, duration: NaN,
    volume: Infinity, playbackRate: NaN };
  const brokenProbe = probe([broken]);
  assert.match(String(brokenProbe.docToken || ''), /^doc-/, 'probe belge tokeni taşımalı');
  delete brokenProbe.docToken;
  assert.deepEqual(brokenProbe, {
    currentTime: 0, duration: 0, paused: false, ended: false, tagName: 'video', muted: false,
    volume: 0, playbackRate: 1, area: 360000, bounds: null, adPlaying: false,
    readyState: 0, videoWidth: 0, videoHeight: 0, totalVideoFrames: null,
    spinnerVisible: false, errorCode: 0, errorMessage: '',
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

asyncTest('skipAd reklam yokken normal içeriğe ve sese dokunmaz', async () => {
  const video = { isConnected: true, tagName: 'VIDEO', paused: false, ended: false,
    clientWidth: 800, clientHeight: 450, currentTime: 20, duration: 300, volume: .45, muted: false };
  const { context } = mediaCommandHarness(video);
  const result = await vm.runInNewContext(buildBrowserMediaCommandScript('skipAd', 0), context);
  assert.equal(result.handled, false);
  assert.equal(video.currentTime, 20);
  assert.equal(video.muted, false);
});

asyncTest('skipAd görünür Atla düğmesini kullanır ve reklam bitince sesi geri yükler', async () => {
  let clicks = 0;
  const video = { isConnected: true, tagName: 'VIDEO', paused: false, ended: false,
    clientWidth: 800, clientHeight: 450, currentTime: 2, duration: 15, volume: .4, muted: false };
  const button = visibleAdElement();
  button.click = () => { clicks += 1; };
  const harness = mediaCommandHarness(video, { '.ytp-ad-skip-button': button });
  const result = await vm.runInNewContext(buildBrowserMediaCommandScript('skipAd', 0), harness.context);
  assert.equal(result.adAction, 'clicked');
  assert.equal(clicks, 1);
  assert.equal(video.muted, true);
  delete harness.selectors['.ytp-ad-skip-button'];
  vm.runInNewContext(buildBrowserMediaProbeScript(), harness.context);
  assert.equal(video.muted, false);
  assert.equal(video.volume, .4);
});

asyncTest('reklam sırasında kullanıcının değiştirdiği ses kararı geri yüklenerek ezilmez', async () => {
  const video = { isConnected: true, tagName: 'VIDEO', paused: false, ended: false,
    clientWidth: 800, clientHeight: 450, currentTime: 2, duration: 15, volume: .4, muted: false };
  const harness = mediaCommandHarness(video, {
    '.html5-video-player.ad-showing': visibleAdElement(),
  });
  const result = await vm.runInNewContext(buildBrowserMediaCommandScript('skipAd', 0), harness.context);
  assert.equal(result.adAction, 'seeked');
  video.muted = false;
  video.volume = .8;
  delete harness.selectors['.html5-video-player.ad-showing'];
  vm.runInNewContext(buildBrowserMediaProbeScript(), harness.context);
  assert.equal(video.muted, false);
  assert.equal(video.volume, .8);
});

test('tam ekran ham video yerine altyazıyı taşıyabilen oynatıcı kapsayıcısını seçer', () => {
  const script = buildBrowserMediaCommandScript('fullscreen', 0);
  assert.match(script, /video\.closest\('\.html5-video-player/);
  assert.match(script, /target\.requestFullscreen/);
  assert.doesNotMatch(script, /else await video\.requestFullscreen/);
});

test('R51-36: OSD scripti sayfa içinde görünür aria-live bildirim oluşturur ve yeniden kullanır', () => {
  const appended = [];
  const document = {
    getElementById: (id) => appended.find((e) => e.id === id) || null,
    createElement: () => {
      const el = { id: '', attrs: {}, style: {}, textContent: '' };
      el.setAttribute = (k, v) => { el.attrs[k] = v; };
      return el;
    },
    body: { appendChild: (node) => appended.push(node) },
    documentElement: { appendChild: (node) => appended.push(node) },
  };
  const timers = [];
  const sandbox = {
    document, window: {},
    requestAnimationFrame: (fn) => fn(),
    clearTimeout: () => {},
    setTimeout: (fn, ms) => { timers.push({ fn, ms }); return timers.length; },
  };
  const first = vm.runInNewContext(buildBrowserOsdScript('Hız: 1.5×', 1400), sandbox);
  assert.deepEqual(first, { handled: true });
  assert.equal(appended.length, 1);
  const el = appended[0];
  assert.equal(el.id, '__whisper-osd');
  assert.equal(el.attrs.role, 'status');
  assert.equal(el.attrs['aria-live'], 'polite');
  assert.equal(el.textContent, 'Hız: 1.5×');
  assert.match(el.style.cssText, /position:fixed/);
  assert.match(el.style.cssText, /z-index:2147483647/);
  assert.equal(el.style.opacity, '1');
  assert.equal(timers.at(-1).ms, 1400);
  // İkinci bildirim yeni düğüm açmaz; mevcut düğüm güncellenir
  const second = vm.runInNewContext(buildBrowserOsdScript('Ses: %80'), sandbox);
  assert.deepEqual(second, { handled: true });
  assert.equal(appended.length, 1);
  assert.equal(el.textContent, 'Ses: %80');
  // Süre sınırları: 300-5000 ms arasına kenetlenir
  vm.runInNewContext(buildBrowserOsdScript('x', 999999), sandbox);
  assert.equal(timers.at(-1).ms, 5000);
  vm.runInNewContext(buildBrowserOsdScript('x', 1), sandbox);
  assert.equal(timers.at(-1).ms, 300);
});

test('R51-36: renderer OSD browser modunda sayfa içi bildirime yönlendirir', () => {
  const fs = require('fs');
  const path = require('path');
  const renderer = fs.readFileSync(path.join(__dirname, '..', 'src', 'renderer', 'renderer.js'), 'utf8');
  const main = fs.readFileSync(path.join(__dirname, '..', 'src', 'main.js'), 'utf8');
  const osdStart = renderer.indexOf('function osd(text, ms)');
  const osdBody = renderer.slice(osdStart, osdStart + 1200);
  assert.match(osdBody, /workspaceMode === 'browser'/);
  assert.match(osdBody, /browserCommand\('osd'/);
  const cmdStart = main.indexOf("ipcMain.handle('browser:command'");
  const cmdBody = main.slice(cmdStart, main.indexOf('ipcMain.handle(', cmdStart + 20));
  assert.match(cmdBody, /command === 'osd'/);
  assert.match(cmdBody, /executeBrowserTrustedMain\(tab\.view, buildBrowserOsdScript/);
  const styles = fs.readFileSync(path.join(__dirname, '..', 'src', 'renderer', 'styles.css'), 'utf8')
    + fs.readFileSync(path.join(__dirname, '..', 'src', 'renderer', 'browser-chrome.css'), 'utf8');
  assert.match(styles, /\.workspace-browser \.player-stage \{ display: none/,
    'browser modunda sahne gizli — sayfa içi OSD tek görünür kanal');
});

test('Picture-in-Picture desteklenmiyorsa kullanıcıya açık hata döner', () => {
  const script = buildBrowserMediaCommandScript('pip', 0);
  assert.match(script, /Picture-in-Picture desteklemiyor/);
  assert.match(script, /handled: false, error/);
});

Promise.all(pending).then(() => console.log(`browser-media-controller: ${passed} test`)).catch((error) => {
  console.error(error.stack || error);
  process.exitCode = 1;
});
