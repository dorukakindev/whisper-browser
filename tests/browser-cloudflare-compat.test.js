const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const {
  browserCloudflareChallengeProbeScript,
  cloudflareCompatibilityMessage,
} = require('../src/browser-cloudflare-compat');

let passed = 0;
function test(name, fn) {
  try {
    fn();
    passed += 1;
    console.log('  PASS  ' + name);
  } catch (error) {
    console.error('  FAIL  ' + name + '\n' + error.stack);
    process.exitCode = 1;
  }
}

function probe({ title = '', text = '', url = 'https://example.com/', selectors = [] } = {}) {
  const document = {
    title,
    body: { innerText: text },
    querySelector(query) {
      return selectors.some((selector) => query.includes(selector)) ? {} : null;
    },
  };
  return vm.runInNewContext(browserCloudflareChallengeProbeScript(), {
    document,
    location: { href: url },
    String,
  });
}

test('Cloudflare ara sayfasını güçlü DOM işaretinden algılar', () => {
  assert.equal(probe({ selectors: ['#challenge-stage'] }).active, true);
});

test('normal sayfadaki bağımsız Turnstile formunu engelleyici ara sayfa sanmaz', () => {
  const result = probe({
    title: 'İletişim',
    text: 'Mesajınızı gönderin',
    selectors: ['iframe[src*="challenges.cloudflare.com"]'],
  });
  assert.equal(result.turnstile, true);
  assert.equal(result.active, false);
});

test('Turnstile ve insan doğrulama metni birlikteyse uyumluluk modunu açar', () => {
  assert.equal(probe({
    title: 'Just a moment...',
    text: 'Performing security verification',
    selectors: ['input[name="cf-turnstile-response"]'],
  }).active, true);
  assert.equal(probe({
    title: 'Bir dakika',
    text: 'İnsan olduğunuzu doğrulayın',
    selectors: ['script[src*="challenges.cloudflare.com/turnstile"]'],
  }).active, true);
});

test('normal Cloudflare arkasındaki sayfa false positive üretmez', () => {
  assert.equal(probe({
    title: 'Haberler',
    text: 'Bugünün haberleri ve son gelişmeler',
    url: 'https://example.com/news',
  }).active, false);
});

test('kullanıcı mesajları duraklatma, zaman aşımı ve geri açılmayı ayırır', () => {
  assert.match(cloudflareCompatibilityMessage(true), /geçici olarak durduruldu/);
  assert.match(cloudflareCompatibilityMessage(true, true), /sayfayı yenileyin/);
  assert.match(cloudflareCompatibilityMessage(false), /yeniden açıldı/);
});

const mainSource = fs.readFileSync(path.join(__dirname, '../src/main.js'), 'utf8');
const uninstallStart = mainSource.indexOf('function browserCaptureUninstallScript()');
const uninstallEnd = mainSource.indexOf('function browserPageTranslationConfig(', uninstallStart);
const hookStart = mainSource.indexOf('function browserCaptureHookScript()');
const hookEnd = mainSource.indexOf('function browserCaptureDrainScript()', hookStart);
assert(uninstallStart >= 0 && uninstallEnd > uninstallStart && hookStart >= 0 && hookEnd > hookStart);
const factories = vm.runInNewContext('(() => {\n'
  + mainSource.slice(uninstallStart, uninstallEnd) + '\n'
  + mainSource.slice(hookStart, hookEnd) + '\n'
  + 'return { browserCaptureHookScript, browserCaptureUninstallScript };\n})()');

function captureHarness() {
  function FakeXhr() {}
  const nativeOpen = function nativeOpen() {};
  const nativeSend = function nativeSend() {};
  FakeXhr.prototype.open = nativeOpen;
  FakeXhr.prototype.send = nativeSend;
  const nativeFetch = function nativeFetch() { return Promise.resolve({}); };
  const window = { fetch: nativeFetch };
  const context = vm.createContext({
    window,
    XMLHttpRequest: FakeXhr,
    crypto: { randomUUID: () => 'frame-test' },
    Math, Date, Set, Map, Uint8Array, String, Number, Array, JSON, Promise,
    btoa: () => '',
  });
  window.window = window;
  return { context, window, FakeXhr, nativeFetch, nativeOpen, nativeSend };
}

test('yakalama kaldırılırken native fetch ve XHR yöntemleri geri yüklenir', () => {
  const h = captureHarness();
  vm.runInContext(factories.browserCaptureHookScript(), h.context);
  assert.notEqual(h.window.fetch, h.nativeFetch);
  assert.notEqual(h.FakeXhr.prototype.open, h.nativeOpen);
  assert.notEqual(h.FakeXhr.prototype.send, h.nativeSend);
  assert.equal(Object.prototype.propertyIsEnumerable.call(h.window, '__whisperCaptureOriginals'), false);
  vm.runInContext(factories.browserCaptureUninstallScript(), h.context);
  assert.equal(h.window.fetch, h.nativeFetch);
  assert.equal(h.FakeXhr.prototype.open, h.nativeOpen);
  assert.equal(h.FakeXhr.prototype.send, h.nativeSend);
  assert.equal('__whisperCaptureInstalled' in h.window, false);
  assert.equal('__whisperCaptureOriginals' in h.window, false);
});

test('site kancayı sonradan değiştirdiyse kaldırma işlemi site yöntemini ezmez', () => {
  const h = captureHarness();
  vm.runInContext(factories.browserCaptureHookScript(), h.context);
  const siteFetch = function siteFetch() {};
  const siteOpen = function siteOpen() {};
  h.window.fetch = siteFetch;
  h.FakeXhr.prototype.open = siteOpen;
  vm.runInContext(factories.browserCaptureUninstallScript(), h.context);
  assert.equal(h.window.fetch, siteFetch);
  assert.equal(h.FakeXhr.prototype.open, siteOpen);
  assert.equal(h.FakeXhr.prototype.send, h.nativeSend);
});

test('oturum User-Agent kimliği WebContents yaratılmadan önce sabitlenir', () => {
  const start = mainSource.indexOf('function ensureBrowserView(');
  const end = mainSource.indexOf('function persistActiveBrowserTabState(', start);
  const body = mainSource.slice(start, end);
  const sessionUa = body.indexOf('browserSession.setUserAgent(browserUserAgent)');
  const viewCreate = body.indexOf('new WebContentsView(');
  assert(sessionUa >= 0 && viewCreate > sessionUa);
  assert.match(body, /prepareBrowserPageInstrumentation\(tab\)/);
});

if (!process.exitCode) console.log('browser-cloudflare-compat: ' + passed + ' test');
