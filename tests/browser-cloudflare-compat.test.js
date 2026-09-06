const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const {
  browserCloudflareChallengeProbeScript,
  browserCompatibilityEnabledForUrl,
  browserCompatibilityHost,
  cloudflareCompatibilityMessage,
  cloudflareProbeState,
  normalizeBrowserCompatibilityHosts,
  withBrowserCompatibilityHost,
} = require('../src/browser-cloudflare-compat');
const { normalizeBrowserSession } = require('../src/browser-session-store');
const {
  createBrowserSessionPackage,
  inspectBrowserSessionPackage,
} = require('../src/browser-session-package');

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

test('başarısız denetim temiz sayfa sayılmaz', () => {
  assert.equal(cloudflareProbeState(null), 'unknown');
  assert.equal(cloudflareProbeState({}), 'unknown');
  assert.equal(cloudflareProbeState({ active: true }), 'active');
  assert.equal(cloudflareProbeState({ active: false }), 'clear');
});

test('uyumluluk tercihi yalnız geçerli alan adlarına uygulanır', () => {
  assert.equal(browserCompatibilityHost('https://WWW.Example.com/path?token=secret'), 'www.example.com');
  const enabled = withBrowserCompatibilityHost([], 'https://www.example.com/private', true);
  assert.deepEqual(enabled.hosts, ['www.example.com']);
  assert.equal(browserCompatibilityEnabledForUrl('https://www.example.com/other', enabled.hosts), true);
  assert.equal(browserCompatibilityEnabledForUrl('https://example.com/', enabled.hosts), false);
  assert.deepEqual(normalizeBrowserCompatibilityHosts(['GOOD.example', 'good.example', 'bad host', '']),
    ['good.example']);
  assert.deepEqual(withBrowserCompatibilityHost(enabled.hosts, 'https://www.example.com/', false).hosts, []);
});

test('uyumluluk modu sekme oturumunda ve taşınabilir paket Places verisinde korunur', () => {
  const session = normalizeBrowserSession({
    tabs: [{ id: 'tab-1', url: 'https://challenge.example/', compatibilityMode: true }],
    activeTabId: 'tab-1',
  });
  assert.equal(session.tabs[0].compatibilityMode, true);
  const bundle = createBrowserSessionPackage({
    session,
    places: { compatibilityHosts: ['challenge.example', 'bad host'] },
  });
  const inspected = inspectBrowserSessionPackage(bundle);
  assert.equal(inspected.session.tabs[0].compatibilityMode, true);
  assert.deepEqual(inspected.places.compatibilityHosts, ['challenge.example']);
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

test('uyumluluk IPC köprüsü ve fail-closed denetim yolu bağlıdır', () => {
  const preload = fs.readFileSync(path.join(__dirname, '../src/preload.js'), 'utf8');
  assert.match(preload, /setBrowserCompatibilityMode:[\s\S]*browser:compatibility:setEnabled/);
  assert.match(mainSource, /cloudflareProbeState\(probe\)/);
  assert.match(mainSource, /probeState === 'unknown'[\s\S]{0,260}browserInstrumentationPending = true/);
  assert.match(mainSource, /browser:compatibility:setEnabled/);
});

if (!process.exitCode) console.log('browser-cloudflare-compat: ' + passed + ' test');
