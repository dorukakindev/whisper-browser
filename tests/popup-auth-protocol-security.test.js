'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { EventEmitter } = require('events');
const {
  MAX_POLICY_URL_LENGTH,
  attachNavigationGuard,
  createWindowRegistry,
  decideUrlPolicy,
  parsePolicyUrl,
  safeWebContentsUrl,
  securePopupWebPreferences,
} = require('../src/browser-navigation-policy');

const mainSource = fs.readFileSync(path.join(__dirname, '../src/main.js'), 'utf8');
let passed = 0;
function test(name, fn) {
  try {
    fn();
    passed++;
    console.log(`  OK  ${name}`);
  } catch (error) {
    console.error(`  FAIL ${name}`);
    throw error;
  }
}

class FakeWebContents extends EventEmitter {
  constructor(url = 'https://video.example.test/watch') {
    super();
    this.url = url;
    this.destroyed = false;
  }
  getURL() { return this.url; }
  isDestroyed() { return this.destroyed; }
}

class FakeWindow extends EventEmitter {
  constructor({ failDestroy = false, blockClose = false } = {}) {
    super();
    this.destroyed = false;
    this.failDestroy = failDestroy;
    this.blockClose = blockClose;
    this.destroyCalls = 0;
    this.closeCalls = 0;
  }
  isDestroyed() { return this.destroyed; }
  destroy() {
    this.destroyCalls++;
    if (this.failDestroy) throw new Error('enjekte destroy hatası');
    this.destroyed = true;
    this.emit('closed');
  }
  close() {
    this.closeCalls++;
    if (this.blockClose) return;
    this.destroyed = true;
    this.emit('closed');
  }
}

function navigationEvent(url, isMainFrame = true) {
  return {
    url,
    isMainFrame,
    prevented: false,
    preventDefault() { this.prevented = true; },
  };
}

test('URL ayrıştırıcı kontrol karakteri, aşırı uzunluk ve kullanıcı bilgisi kandırmasını reddeder', () => {
  for (const [raw, reason] of [
    ['', 'empty'],
    ['https://example.test/\nfile:///C:/secret', 'control-character'],
    [`https://example.test/${'a'.repeat(MAX_POLICY_URL_LENGTH)}`, 'too-long'],
    ['https://accounts.example.test@evil.invalid/login', 'credentials-not-allowed'],
    ['https://user:secret@example.test/', 'credentials-not-allowed'],
  ]) assert.equal(parsePolicyUrl(raw).reason, reason, raw.slice(0, 80));
});

test('popup politikası yalnız web ve tam about:blank hedefini içeride bırakır', () => {
  const source = 'https://accounts.example.test/start';
  for (const url of [
    'https://accounts.example.test/login',
    'http://127.0.0.1:43121/callback',
    'about:blank',
  ]) assert.equal(decideUrlPolicy(url, 'browser-window-open', source).action, 'allow', url);
  for (const url of [
    'about:blank#payload',
    'about:srcdoc',
    'javascript:alert(1)',
    'data:text/html,secret',
    'blob:https://example.test/id',
    'file:///C:/secret',
    'chrome-extension://id/page.html',
    'devtools://devtools/bundled/inspector.html',
    'ftp://example.test/file',
    'whisper-local:oauth/callback',
  ]) assert.equal(decideUrlPolicy(url, 'browser-window-open', source).action, 'deny', url);
  assert.equal(decideUrlPolicy('mailto:help@example.test', 'browser-window-open', source).action, 'external');
});

test('origin ilişkisi port, Unicode host ve sahte suffix için URL standardını kullanır', () => {
  assert.equal(decideUrlPolicy(
    'https://example.test/login',
    'browser-window-open',
    'https://example.test:443/start',
  ).relation, 'same-origin');
  assert.equal(decideUrlPolicy(
    'https://bücher.example/login',
    'browser-window-open',
    'https://xn--bcher-kva.example/start',
  ).relation, 'same-origin');
  const suffix = decideUrlPolicy(
    'https://accounts.example.test.evil.invalid/login',
    'browser-window-open',
    'https://accounts.example.test/start',
  );
  assert.equal(suffix.relation, 'cross-origin');
  assert.equal(suffix.hostname, 'accounts.example.test.evil.invalid');
});

test('uygulama ve renderer harici politikası yalnız açık protokolleri açar', () => {
  for (const surface of ['app-window-open', 'renderer-external']) {
    for (const url of ['http://localhost:43121/docs', 'https://example.test/help', 'mailto:help@example.test']) {
      assert.equal(decideUrlPolicy(url, surface).action, 'external', `${surface} ${url}`);
    }
    for (const url of ['file:///C:/secret', 'javascript:alert(1)', 'data:text/plain,x', 'ms-settings:privacy']) {
      assert.equal(decideUrlPolicy(url, surface).action, 'deny', `${surface} ${url}`);
    }
  }
  assert.equal(decideUrlPolicy('https://example.test', 'bilinmeyen-yüzey').reason, 'unknown-surface');
});

test('redirect zinciri güvenli hedefleri geçirir ve ilk tehlikeli hedefte durur', () => {
  const contents = new FakeWebContents('https://video.example.test/start');
  const decisions = [];
  attachNavigationGuard(contents, {
    sourceUrl: () => contents.getURL(),
    onDecision: decision => decisions.push(decision),
  });
  for (const url of [
    'https://accounts.example.test/oauth',
    'http://127.0.0.1:43121/callback',
    'https://video.example.test/watch',
  ]) {
    const event = navigationEvent(url);
    contents.emit('will-redirect', event);
    assert.equal(event.prevented, false, url);
    contents.url = url;
  }
  const escape = navigationEvent('javascript:location="file:///C:/secret"');
  contents.emit('will-redirect', escape);
  assert.equal(escape.prevented, true);
  assert.equal(decisions.at(-1).reason, 'protocol-not-allowed');
});

test('alt frame özel protokole sıçrayamaz ve işletim sistemi uygulaması açamaz', () => {
  const contents = new FakeWebContents();
  const external = [];
  const detach = attachNavigationGuard(contents, { openExternal: url => external.push(url) });
  const webFrame = navigationEvent('https://cdn.example.test/embed', false);
  contents.emit('will-frame-navigate', webFrame);
  assert.equal(webFrame.prevented, false);
  for (const url of ['file:///C:/secret', 'javascript:alert(1)', 'mailto:spam@example.test']) {
    const event = navigationEvent(url, false);
    contents.emit('will-frame-navigate', event);
    assert.equal(event.prevented, true, url);
  }
  assert.deepEqual(external, []);
  const mainMail = navigationEvent('mailto:user@example.test', true);
  contents.emit('will-navigate', mainMail);
  assert.equal(mainMail.prevented, true);
  assert.deepEqual(external, ['mailto:user@example.test']);
  detach();
  const afterDetach = navigationEvent('file:///C:/secret', false);
  contents.emit('will-frame-navigate', afterDetach);
  assert.equal(afterDetach.prevented, false);
});

test('legacy Electron redirect imzası da fail-closed korunur', () => {
  const contents = new FakeWebContents();
  attachNavigationGuard(contents);
  const event = navigationEvent(undefined);
  contents.emit('will-redirect', event, 'file:///C:/secret', false, true);
  assert.equal(event.prevented, true);
});

test('kapanış yarışı kaynak URL okumayı bozsa da guard ve güvenli okuyucu çökmez', () => {
  const contents = new FakeWebContents();
  attachNavigationGuard(contents, { sourceUrl: () => { throw new Error('enjekte yarış'); } });
  const event = navigationEvent('file:///C:/secret');
  assert.doesNotThrow(() => contents.emit('will-redirect', event));
  assert.equal(event.prevented, true);
  assert.equal(safeWebContentsUrl({
    isDestroyed: () => false,
    getURL: () => { throw new Error('enjekte yarış'); },
  }), '');
});

test('popup webPreferences aynı oturumu korurken yerel yetki sızdırmaz', () => {
  const prefs = securePopupWebPreferences('persist:whisper-browser');
  assert.equal(prefs.partition, 'persist:whisper-browser');
  for (const field of [
    'nodeIntegration', 'nodeIntegrationInWorker', 'nodeIntegrationInSubFrames',
    'allowRunningInsecureContent', 'webviewTag', 'navigateOnDragDrop',
  ]) assert.equal(prefs[field], false, field);
  assert.equal(prefs.contextIsolation, true);
  assert.equal(prefs.sandbox, true);
  assert.equal(prefs.webSecurity, true);
  assert.equal(Object.hasOwn(prefs, 'preload'), false);
});

test('popup registry kapananları çıkarır, başarısız kapanışı yeniden denemek üzere saklar', () => {
  const registry = createWindowRegistry();
  const normal = Array.from({ length: 8 }, () => new FakeWindow());
  const stubborn = new FakeWindow({ failDestroy: true, blockClose: true });
  for (const window of [...normal, stubborn]) assert.equal(registry.add(window), true);
  normal[0].close();
  assert.equal(registry.size(), 8);
  assert.deepEqual(registry.closeAll(), { attempted: 8, closed: 7, remaining: 1 });
  assert.equal(registry.values()[0], stubborn);
  stubborn.failDestroy = false;
  assert.deepEqual(registry.closeAll(), { attempted: 1, closed: 1, remaining: 0 });
});

test('üretim bağlantısı popup, nested popup, alt-frame ve kapanış kapılarını birlikte kurar', () => {
  assert.match(mainSource, /const browserPopupWindows = createWindowRegistry\(\)/);
  assert.match(mainSource, /wc\.setWindowOpenHandler\(browserWindowOpenHandler\(wc, tab\)\)/);
  assert.match(mainSource, /outlivesOpener: false/);
  assert.match(mainSource, /function configureBrowserPopup[\s\S]*did-create-window[\s\S]*configureBrowserPopup\(child, tab, childDetails\)/);
  assert.match(mainSource, /attachNavigationGuard\(wc,[\s\S]{0,300}surface: 'browser-navigation'/);
  assert.match(mainSource, /browserPopupWindows\.closeAll\(\)/);
  assert.match(mainSource, /openExternalByPolicy\(url, 'app-window-open'\)/);
  assert.match(mainSource, /ipcMain\.handle\('shell:openExternal'[\s\S]{0,220}authorizedBrowserSender\(_event\)/);
});

console.log(`${passed} popup/OAuth/protokol güvenlik testi geçti.`);
