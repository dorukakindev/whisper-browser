'use strict';

const assert = require('assert');
const { EventEmitter } = require('events');
const fs = require('fs');
const path = require('path');
const {
  attachNavigationGuard,
  createWindowRegistry,
  decideUrlPolicy,
  isAllowedBrowserPermission,
  isTrustedMainFrameEvent,
  safeWebContentsUrl,
  securePopupWebPreferences,
} = require('../src/browser-navigation-policy');

const POLICY_CASES = JSON.parse(fs.readFileSync(
  path.join(__dirname, 'fixtures', 'popup-auth-policy.json'), 'utf8'));
const MAIN_SOURCE = fs.readFileSync(path.join(__dirname, '..', 'src', 'main.js'), 'utf8');

let passed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log(`  OK  ${name}`); }
  catch (error) { console.error(`  FAIL ${name}\n${error.stack}`); process.exitCode = 1; }
}

class FakeWebContents extends EventEmitter {
  constructor(url = 'about:blank') {
    super();
    this.url = url;
    this.destroyed = false;
  }
  getURL() { return this.url; }
  isDestroyed() { return this.destroyed; }
}

class FakeWindow extends EventEmitter {
  constructor(options = {}) {
    super();
    this.destroyed = false;
    this.closeCalls = 0;
    this.destroyCalls = 0;
    this.failDestroy = options.failDestroy === true;
    this.blockClose = options.blockClose === true;
  }
  isDestroyed() { return this.destroyed; }
  close() {
    this.closeCalls++;
    if (this.blockClose) return;
    this.destroyed = true;
    this.emit('closed');
  }
  destroy() {
    this.destroyCalls++;
    if (this.failDestroy) throw new Error('enjekte destroy hatası');
    this.destroyed = true;
    this.emit('closed');
  }
}

function fakeNavigationEvent(url, isMainFrame = true) {
  return {
    url,
    isMainFrame,
    prevented: false,
    preventDefault() { this.prevented = true; },
  };
}

function runRedirectRace(sequence) {
  const contents = new FakeWebContents(sequence[0]);
  const decisions = [];
  const external = [];
  attachNavigationGuard(contents, {
    sourceUrl: () => contents.getURL(),
    openExternal: (url) => external.push(url),
    onDecision: (decision) => decisions.push(decision),
  });
  const events = [];
  for (let i = 1; i < sequence.length; i++) {
    const event = fakeNavigationEvent(sequence[i]);
    contents.emit(i === 1 ? 'will-navigate' : 'will-redirect', event);
    events.push(event);
    if (!event.prevented) contents.url = sequence[i];
  }
  return { contents, decisions, events, external };
}

test('makine okunur corpus en az 35 URL politika vakasını kapsar', () => {
  assert.ok(POLICY_CASES.length >= 35, `yalnız ${POLICY_CASES.length} vaka var`);
  for (const fixture of POLICY_CASES) {
    const actual = decideUrlPolicy(fixture.url, fixture.surface, fixture.sourceUrl || '');
    assert.equal(actual.action, fixture.action, fixture.id);
    if (fixture.relation) assert.equal(actual.relation, fixture.relation, `${fixture.id}: relation`);
    if (fixture.hostname) assert.equal(actual.hostname, fixture.hostname, `${fixture.id}: hostname`);
    if (fixture.reason) assert.equal(actual.reason, fixture.reason, `${fixture.id}: reason`);
  }
});

test('eski normalizeBrowserUrl mantığının beş özel şema bypassı sabit regresyona indirgenmiştir', () => {
  function legacyAllows(raw) {
    const value = String(raw || '').trim();
    if (!value) return false;
    if (/^[a-z][a-z0-9+.-]*:\/\//i.test(value)) {
      try { return ['http:', 'https:'].includes(new URL(value).protocol); }
      catch (_) { return false; }
    }
    return true; // Eski kod girdiyi Google araması sanıp orijinal popup URL'sini allow ediyordu.
  }
  const bypasses = [
    'javascript:alert(1)',
    'data:text/html,<h1>x</h1>',
    'blob:https://example.test/id',
    'mailto:help@example.test',
    'whisper-local:oauth/callback',
  ];
  for (const url of bypasses) {
    assert.equal(legacyAllows(url), true, `legacy karşı örnek kayboldu: ${url}`);
    assert.notEqual(decideUrlPolicy(url, 'browser-window-open').action, 'allow', url);
  }
});

test('deterministik şema fuzzı yalnız tanımlı protokolleri kabul eder', () => {
  let state = 0x21a0f00d;
  const next = () => {
    state ^= state << 13; state ^= state >>> 17; state ^= state << 5;
    return state >>> 0;
  };
  const alphabet = 'abcdefghijklmnopqrstuvwxyz0123456789+.-';
  for (let i = 0; i < 512; i++) {
    let scheme = 'x';
    const length = 2 + (next() % 18);
    for (let j = 1; j < length; j++) scheme += alphabet[next() % alphabet.length];
    assert.equal(decideUrlPolicy(`${scheme}:payload`, 'browser-window-open').action, 'deny', scheme);
  }
  for (let i = 0; i < 256; i++) {
    const scheme = i % 2 ? 'http' : 'https';
    const url = `${scheme}://fixture-${next().toString(16)}.example.test/${i}`;
    assert.equal(decideUrlPolicy(url, 'browser-window-open').action, 'allow', url);
    assert.equal(decideUrlPolicy(url, 'renderer-external').action, 'external', url);
  }
});

test('altı güvenli redirect OAuth zinciri bozulmadan kalır', () => {
  const race = runRedirectRace([
    'https://video.example.test/start',
    'https://accounts.example.test/oauth',
    'https://login.example.test/step-1',
    'https://login.example.test/step-2',
    'http://127.0.0.1:43121/callback',
    'https://video.example.test/session',
    'https://video.example.test/watch',
  ]);
  assert.equal(race.events.length, 6);
  assert.ok(race.events.every((event) => !event.prevented));
  assert.equal(race.contents.getURL(), 'https://video.example.test/watch');
});

test('redirect yarışı güvenli zincirin sonundaki javascript hedefini engeller', () => {
  const race = runRedirectRace([
    'https://video.example.test/start',
    'https://accounts.example.test/oauth',
    'https://accounts.example.test/consent',
    'javascript:location="file:///C:/secret"',
  ]);
  assert.equal(race.events.at(-1).prevented, true);
  assert.equal(race.contents.getURL(), 'https://accounts.example.test/consent');
});

test('redirect yarışı file hedefini engeller', () => {
  const race = runRedirectRace([
    'https://video.example.test/start',
    'https://login.example.test/oauth',
    'file:///C:/Windows/System32/drivers/etc/hosts',
  ]);
  assert.equal(race.events.at(-1).prevented, true);
});

test('redirect yarışı data hedefini engeller', () => {
  const race = runRedirectRace([
    'http://127.0.0.1:43121/start',
    'http://127.0.0.1:43121/redirect-1',
    'data:text/html,<script>location="file:///C:/secret"</script>',
  ]);
  assert.equal(race.events.at(-1).prevented, true);
});

test('redirect yarışı kullanıcı bilgili host kandırmasını engeller', () => {
  const race = runRedirectRace([
    'https://accounts.example.test/start',
    'https://accounts.example.test/consent',
    'https://accounts.example.test@evil.invalid/callback',
  ]);
  assert.equal(race.events.at(-1).prevented, true);
  assert.equal(race.decisions.at(-1).reason, 'credentials-not-allowed');
});

test('redirect yarışı mailto hedefini uygulama içinde durdurup dışarı yönlendirir', () => {
  const race = runRedirectRace([
    'https://video.example.test/start',
    'https://video.example.test/help',
    'mailto:support@example.test',
  ]);
  assert.equal(race.events.at(-1).prevented, true);
  assert.deepEqual(race.external, ['mailto:support@example.test']);
});

test('redirect yarışı bilinmeyen özel protokolü varsayılan-deny kapatır', () => {
  const race = runRedirectRace([
    'https://video.example.test/start',
    'https://video.example.test/oauth',
    'unknown-handler:takeover',
  ]);
  assert.equal(race.events.at(-1).prevented, true);
  assert.equal(race.external.length, 0);
});

test('legacy Electron navigation olay imzası da aynı guard ile engellenir', () => {
  const contents = new FakeWebContents('https://example.test');
  attachNavigationGuard(contents);
  const event = fakeNavigationEvent(undefined);
  contents.emit('will-redirect', event, 'file:///C:/secret', false, true);
  assert.equal(event.prevented, true);
});

test('popup kapanış yarışı kaynak URL okumayı bozsa da guard fail-closed kalır', () => {
  const contents = new FakeWebContents('https://example.test');
  attachNavigationGuard(contents, {
    sourceUrl: () => { throw new Error('enjekte getURL yarışı'); },
  });
  const event = fakeNavigationEvent('file:///C:/secret');
  assert.doesNotThrow(() => contents.emit('will-redirect', event));
  assert.equal(event.prevented, true);
  assert.equal(safeWebContentsUrl({
    isDestroyed: () => false,
    getURL: () => { throw new Error('enjekte getURL yarışı'); },
  }), '');
});

test('alt frame özel protokole sıçrayamaz ve harici uygulama tetikleyemez', () => {
  const contents = new FakeWebContents('https://video.example.test/watch');
  const external = [];
  const detach = attachNavigationGuard(contents, {
    openExternal: (url) => external.push(url),
  });

  const webFrame = fakeNavigationEvent('https://cdn.example.test/embed', false);
  contents.emit('will-frame-navigate', webFrame);
  assert.equal(webFrame.prevented, false, 'normal HTTPS alt frame bozulmamalı');

  for (const url of ['file:///C:/secret', 'javascript:alert(1)', 'mailto:spam@example.test']) {
    const event = fakeNavigationEvent(url, false);
    contents.emit('will-frame-navigate', event);
    assert.equal(event.prevented, true, url);
  }

  const redirected = fakeNavigationEvent('data:text/html,<h1>x</h1>', false);
  contents.emit('will-redirect', redirected);
  assert.equal(redirected.prevented, true, 'alt frame sunucu yönlendirmesi de korunmalı');
  assert.deepEqual(external, [], 'alt frame işletim sistemi protokolü açamamalı');

  const duplicateProbe = fakeNavigationEvent('mailto:user@example.test', true);
  contents.emit('will-frame-navigate', duplicateProbe);
  assert.equal(duplicateProbe.prevented, false, 'ana frame ikinci kez işlenmemeli');
  const mainNavigation = fakeNavigationEvent('mailto:user@example.test', true);
  contents.emit('will-navigate', mainNavigation);
  assert.equal(mainNavigation.prevented, true);
  assert.deepEqual(external, ['mailto:user@example.test']);

  detach();
  const afterDetach = fakeNavigationEvent('file:///C:/secret', false);
  contents.emit('will-frame-navigate', afterDetach);
  assert.equal(afterDetach.prevented, false, 'guard kapanışta alt frame dinleyicisini de bırakmalı');
});

test('izin politikası yalnız ana gömülü sayfanın iki ürün iznini kabul eder', () => {
  const allowed = ['fullscreen', 'clipboard-sanitized-write'];
  for (const permission of allowed) {
    assert.equal(isAllowedBrowserPermission({
      isPrimaryContents: true,
      isMainFrame: true,
      permission,
      requestingUrl: 'https://video.example.test/watch',
    }), true, permission);
  }
  const denied = [
    { isPrimaryContents: false, isMainFrame: true, permission: 'fullscreen', requestingUrl: 'https://video.example.test' },
    { isPrimaryContents: true, isMainFrame: false, permission: 'fullscreen', requestingUrl: 'https://video.example.test' },
    { isPrimaryContents: true, isMainFrame: true, permission: 'media', requestingUrl: 'https://video.example.test' },
    { isPrimaryContents: true, isMainFrame: true, permission: 'notifications', requestingUrl: 'https://video.example.test' },
    { isPrimaryContents: true, isMainFrame: true, permission: 'geolocation', requestingUrl: 'https://video.example.test' },
    { isPrimaryContents: true, isMainFrame: true, permission: 'clipboard-read', requestingUrl: 'https://video.example.test' },
    { isPrimaryContents: true, isMainFrame: true, permission: 'fullscreen', requestingUrl: 'file:///C:/secret' },
    { isPrimaryContents: true, isMainFrame: true, permission: 'fullscreen', requestingUrl: 'data:text/html,x' },
    { isPrimaryContents: true, isMainFrame: true, permission: 'fullscreen', requestingUrl: 'https://user@example.test' },
  ];
  for (const fixture of denied) assert.equal(isAllowedBrowserPermission(fixture), false, JSON.stringify(fixture));
});

test('popup webPreferences oturumu korurken yerel yetki sızdırmaz', () => {
  const prefs = securePopupWebPreferences('persist:whisper-browser');
  assert.equal(prefs.partition, 'persist:whisper-browser');
  assert.equal(prefs.nodeIntegration, false);
  assert.equal(prefs.nodeIntegrationInWorker, false);
  assert.equal(prefs.nodeIntegrationInSubFrames, false);
  assert.equal(prefs.contextIsolation, true);
  assert.equal(prefs.sandbox, true);
  assert.equal(prefs.webSecurity, true);
  assert.equal(prefs.allowRunningInsecureContent, false);
  assert.equal(prefs.webviewTag, false);
  assert.equal(Object.hasOwn(prefs, 'preload'), false);
});

test('popup registry kapananları sayımdan çıkarır ve kalanların tümünü kapatır', () => {
  const registry = createWindowRegistry();
  const windows = Array.from({ length: 32 }, () => new FakeWindow());
  for (const window of windows) assert.equal(registry.add(window), true);
  assert.equal(registry.add(windows[0]), true);
  assert.equal(registry.size(), 32);
  for (let i = 0; i < 7; i++) windows[i].close();
  assert.equal(registry.size(), 25);
  assert.deepEqual(registry.closeAll(), { attempted: 25, closed: 25, remaining: 0 });
  assert.equal(registry.size(), 0);
  assert.ok(windows.every((window) => window.isDestroyed()));
  assert.ok(windows.slice(0, 7).every((window) => window.closeCalls === 1 && window.destroyCalls === 0));
  assert.ok(windows.slice(7).every((window) => window.closeCalls === 0 && window.destroyCalls === 1));
});

test('popup cleanup hatası pencereyi kapatılmış gibi saymaz ve yeniden denemeye saklar', () => {
  const registry = createWindowRegistry();
  const stubborn = new FakeWindow({ failDestroy: true, blockClose: true });
  registry.add(stubborn);
  assert.deepEqual(registry.closeAll(), { attempted: 1, closed: 0, remaining: 1 });
  assert.equal(registry.size(), 1);
  stubborn.failDestroy = false;
  assert.deepEqual(registry.closeAll(), { attempted: 1, closed: 1, remaining: 0 });
  assert.equal(registry.size(), 0);
});

test('ayrıcalıklı IPC yalnız uygulama ana frame gönderenini kabul eder', () => {
  const mainFrame = {};
  const webContents = { mainFrame };
  const mainWindow = { isDestroyed: () => false, webContents };
  assert.equal(isTrustedMainFrameEvent({ sender: webContents, senderFrame: mainFrame }, mainWindow), true);
  assert.equal(isTrustedMainFrameEvent({ sender: webContents, senderFrame: {} }, mainWindow), false);
  assert.equal(isTrustedMainFrameEvent({ sender: {}, senderFrame: mainFrame }, mainWindow), false);
  assert.equal(isTrustedMainFrameEvent(null, mainWindow), false);
  assert.equal(isTrustedMainFrameEvent({ sender: webContents, senderFrame: mainFrame }, {
    isDestroyed: () => true, webContents,
  }), false);
});

test('üretim bağlantısı redirect, nested popup, permission ve cleanup kapılarını birlikte kurar', () => {
  assert.match(MAIN_SOURCE, /attachNavigationGuard\(wc,[\s\S]*surface: 'browser-navigation'/);
  assert.match(MAIN_SOURCE, /contents\.on\('did-create-window', \(child\) => configureBrowserPopup\(child\)\)/);
  assert.match(MAIN_SOURCE, /outlivesOpener: false/);
  assert.match(MAIN_SOURCE, /browserPopupWindows\.closeAll\(\)/);
  assert.ok(MAIN_SOURCE.indexOf('browserPopupWindows.closeAll()') < MAIN_SOURCE.indexOf('if (!browserView) return;'));
  assert.match(MAIN_SOURCE, /setPermissionRequestHandler/);
  assert.match(MAIN_SOURCE, /setPermissionCheckHandler/);
  assert.match(MAIN_SOURCE, /const sourceUrl = safeWebContentsUrl\(sourceContents\)/);
  assert.match(MAIN_SOURCE, /requestingUrl: details\.requestingUrl[\s\S]*safeWebContentsUrl\(requestingContents\)/);
  assert.match(MAIN_SOURCE, /isTrustedMainFrameEvent\(event, mainWindow\)/);
});

console.log(`${passed} popup/auth/protocol test grubu geçti (${POLICY_CASES.length} corpus vakası, 768 fuzz vakası, 7 yarış).`);
