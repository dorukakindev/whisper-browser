'use strict';

const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {
  DEFAULT_CACHE_TTL_MS,
  createBrowserAdblock,
  loadEngine,
  fetchWithTimeout,
} = require('../src/browser-adblock');

class FakeEngine extends EventEmitter {
  constructor(label = 'engine') {
    super();
    this.label = label;
    this.enabledSessions = new Set();
  }
  serialize() { return Buffer.from(this.label, 'utf8'); }
  enableBlockingInSession(session) { this.enabledSessions.add(session); }
  disableBlockingInSession(session) { this.enabledSessions.delete(session); }
  onBeforeRequest(_details, callback) { callback({ cancel: true }); }
  onHeadersReceived(_details, callback) { callback({ responseHeaders: { test: ['1'] } }); }
  onInjectCosmeticFilters(event, _url, message) { return event.sender.insertCSS(message); }
}

(async () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'whisper-adblock-test-'));
  const cachePath = path.join(tempRoot, 'engine.bin');
  let builds = 0;
  let lastEngine = null;
  class FakeBlocker {
    static async fromPrebuiltAdsOnly(fetcher) {
      builds += 1;
      await fetcher('https://filters.invalid/ads.txt');
      lastEngine = new FakeEngine(`network-${builds}`);
      return lastEngine;
    }
    static deserialize(buffer) {
      lastEngine = new FakeEngine(Buffer.from(buffer).toString('utf8'));
      return lastEngine;
    }
  }

  try {
    const network = await loadEngine({
      cachePath,
      blockerClass: FakeBlocker,
      fetchImpl: async () => ({ ok: true }),
    });
    assert.equal(network.source, 'network');
    assert.equal(network.stale, false);
    assert.equal(builds, 1);
    assert.equal(fs.readFileSync(cachePath, 'utf8'), 'network-1');

    const freshNow = fs.statSync(cachePath).mtimeMs + 1000;
    const fresh = await loadEngine({
      cachePath,
      blockerClass: FakeBlocker,
      fetchImpl: async () => { throw new Error('fresh cache must avoid network'); },
      now: freshNow,
    });
    assert.equal(fresh.source, 'cache');
    assert.equal(fresh.stale, false);
    assert.equal(builds, 1);

    const stale = await loadEngine({
      cachePath,
      blockerClass: FakeBlocker,
      fetchImpl: async () => { throw new Error('offline'); },
      now: freshNow + DEFAULT_CACHE_TTL_MS + 1,
      logger: { warn() {} },
    });
    assert.equal(stale.source, 'cache');
    assert.equal(stale.stale, true);
    assert.equal(builds, 2, 'stale cache should first attempt a refresh');

    await assert.rejects(fetchWithTimeout(async () => ({ ok: false, status: 503 }), 100)(
      'https://filters.invalid/list'), /HTTP 503/);
    let signal;
    const bodyTimeout = fetchWithTimeout(async (_url, options) => {
      signal = options.signal;
      return { ok: true, text: () => new Promise((_resolve, reject) => {
        signal.addEventListener('abort', () => reject(signal.reason), { once: true });
      }) };
    }, 10);
    // Keep this unit-test process alive while the production timer is unref'ed.
    const keepAlive = setTimeout(() => {}, 1000);
    try { await assert.rejects(bodyTimeout('https://filters.invalid/list'), /zaman aşımı/); }
    finally { clearTimeout(keepAlive); }

    const session = { name: 'persist:whisper-browser' };
    const controller = createBrowserAdblock({
      cachePath,
      blockerClass: FakeBlocker,
      fetchImpl: async () => ({ ok: true }),
      initialEnabled: false,
    });
    assert.equal(controller.getState().state, 'disabled');
    const enabled = await controller.setEnabled(session, true);
    assert.equal(enabled.ok, true);
    assert.equal(enabled.enabled, true);
    assert.equal(enabled.changed, true);
    assert.equal(lastEngine.enabledSessions.has(session), true);
    const controllerEngine = lastEngine;
    let blockedNotice = null;
    const diagnosedController = createBrowserAdblock({
      cachePath,
      blockerClass: FakeBlocker,
      fetchImpl: async () => ({ ok: true }),
      initialEnabled: false,
      onBlocked: (entry) => { blockedNotice = entry; },
    });
    await diagnosedController.setEnabled(session, true);
    lastEngine.emit('request-blocked', {
      url: 'https://media.example/subtitles/en.vtt?token=SECRET', type: 'texttrack',
    }, { filter: { getFilter: () => '||media.example/subtitles^?token=SECRET' } });
    const blockedState = diagnosedController.getState();
    assert.equal(blockedState.blocked, 1);
    assert.equal(blockedState.recentBlocked.length, 1);
    assert.equal(blockedState.recentBlocked[0].url, 'https://media.example/subtitles/en.vtt');
    assert.equal(blockedState.recentBlocked[0].subtitleLike, true);
    assert(!JSON.stringify(blockedState).includes('SECRET'));
    assert.equal(blockedNotice.subtitleLike, true);
    let allowedNotice = null;
    const bypassController = createBrowserAdblock({
      cachePath,
      blockerClass: FakeBlocker,
      fetchImpl: async () => ({ ok: true }),
      initialEnabled: false,
      isSitePaused: (details) => details.webContentsId === 77,
      onAllowed: (entry) => { allowedNotice = entry; },
    });
    await bypassController.setEnabled(session, true);
    let bypassDecision = null;
    lastEngine.onBeforeRequest({ webContentsId: 77,
      url: 'https://ads.test/x?token=SECRET', resourceType: 'image' }, (value) => { bypassDecision = value; });
    assert.deepEqual(bypassDecision, {});
    assert.equal(bypassController.getState().allowedBySite, 1);
    assert.equal(allowedNotice.decision, 'allowed-by-site-switch');
    assert(!JSON.stringify(bypassController.getState()).includes('SECRET'));
    let otherTabDecision = null;
    lastEngine.onBeforeRequest({ webContentsId: 78,
      url: 'https://ads.test/other-tab', resourceType: 'image' }, (value) => { otherTabDecision = value; });
    assert.deepEqual(otherTabDecision, { cancel: true },
      'site anahtarı başka bir tarayıcı sekmesindeki engellemeyi gevşetmemeli');
    assert.equal(bypassController.getState().allowedBySite, 1,
      'yalnız duraklatılmış sekmenin izin sayacı artmalı');
    const cosmeticWarnings = [];
    const cosmeticController = createBrowserAdblock({
      cachePath, blockerClass: FakeBlocker,
      fetchImpl: async () => ({ ok: true }),
      initialEnabled: false,
      isSitePaused: () => false,
      logger: { warn: (message) => cosmeticWarnings.push(message) },
    });
    await cosmeticController.setEnabled(session, true);
    const cosmeticEngine = lastEngine;
    const wc = new EventEmitter();
    let cosmeticUrl = 'https://site.test/watch/1';
    let cosmeticFailure = 'CSS failed';
    Object.assign(wc, {
      isDestroyed: () => false, isLoading: () => false,
      getURL: () => cosmeticUrl,
      insertCSS: async () => { throw new Error(cosmeticFailure); },
    });
    for (let index = 0; index < 5; index++) {
      await cosmeticEngine.onInjectCosmeticFilters({ sender: wc }, cosmeticUrl, '.ad {display:none}');
    }
    assert.equal(cosmeticWarnings.length, 1, 'aynı sayfadaki CSS hatası logu doldurdu');
    cosmeticUrl = 'https://site.test/watch/2';
    await cosmeticEngine.onInjectCosmeticFilters({ sender: wc }, cosmeticUrl, '.ad {display:none}');
    assert.equal(cosmeticWarnings.length, 2, 'yeni sayfanın gerçek hatası görünmez oldu');
    cosmeticFailure = 'Execution context was destroyed';
    cosmeticUrl = 'https://site.test/watch/3';
    await cosmeticEngine.onInjectCosmeticFilters({ sender: wc }, cosmeticUrl, '.ad {display:none}');
    assert.equal(cosmeticWarnings.length, 2, 'beklenen gezinme yarışı hata olarak yazıldı');

    const frameCalls = [];
    const frameUrl = 'https://www.youtube.com/watch?v=public';
    let failRefresh = false;
    class FrameEngine extends FakeEngine {
      enableBlockingInSession(target) {
        if (this.failEnable) throw new Error('fixture enable failed');
        super.enableBlockingInSession(target);
      }
      async onInjectCosmeticFilters(event) {
        await event.sender.executeJavaScript('wrap-fetch');
        await event.sender.insertCSS('hide-home-ads');
      }
    }
    const frameController = createBrowserAdblock({
      cachePath: path.join(tempRoot, 'frame.bin'),
      blockerClass: class { static async fromPrebuiltAdsOnly() {
        lastEngine = new FrameEngine(); lastEngine.failEnable = failRefresh; return lastEngine;
      } },
      fetchImpl: async () => ({ ok: true }), isSitePaused: () => false,
    });
    await frameController.setEnabled(session, true);
    const frameEngine = lastEngine;
    const senderFrame = { url: frameUrl, isDestroyed: () => false,
      executeJavaScript: async (code) => frameCalls.push(code) };
    const sender = new EventEmitter();
    Object.assign(sender, { id: 44, isDestroyed: () => false, isLoading: () => true,
      getURL: () => frameUrl,
      executeJavaScript: () => { throw new Error('must not wait for full page load'); },
      insertCSS: async (css) => frameCalls.push(css) });
    await frameEngine.onInjectCosmeticFilters({ sender, senderFrame }, frameUrl);
    assert.match(frameCalls[0], /^\(function \(\) \{\nwrap-fetch\n\}\)\(\);$/);
    assert.equal(frameCalls[1], 'hide-home-ads');
    assert.equal(sender.listenerCount('did-stop-loading'), 0);
    senderFrame.url = 'https://example.com/new-document';
    await frameEngine.onInjectCosmeticFilters({ sender, senderFrame }, frameUrl);
    assert.equal(frameCalls.length, 2, 'old frame URL must not inject into a new document');
    const beforeRefresh = frameEngine;
    const refreshed = await frameController.refresh();
    assert.equal(refreshed.changed, true);
    assert.equal(beforeRefresh.enabledSessions.size, 0);
    assert.equal(lastEngine.enabledSessions.has(session), true);
    const afterRefresh = lastEngine;
    failRefresh = true;
    const rollback = await frameController.refresh();
    assert.equal(rollback.enabled, true, 'failed update must keep previous protection');
    assert.equal(rollback.stale, true);
    assert.equal(afterRefresh.enabledSessions.has(session), true);
    const failedReplacement = lastEngine;
    await frameController.setEnabled(session, false);
    await frameController.refresh();
    assert.equal(lastEngine, failedReplacement, 'disabled protection must not refresh or re-enable');

    senderFrame.url = frameUrl;
    const lateController = createBrowserAdblock({
      cachePath: path.join(tempRoot, 'late.bin'), isSitePaused: () => false,
      getOpenPages: () => [sender],
      blockerClass: class { static async fromPrebuiltAdsOnly() { return new FrameEngine(); } },
      fetchImpl: async () => ({ ok: true }),
    });
    sender.mainFrame = senderFrame;
    const previousCalls = frameCalls.length;
    await lateController.setEnabled(session, true);
    await new Promise(setImmediate);
    assert.equal(frameCalls.length, previousCalls + 2, 'first open page missed late session preload');
    await lateController.setEnabled(session, false);
    lastEngine.emit('request-blocked');
    assert.equal(controller.getState().blocked, 0);
    const unchanged = await controller.setEnabled(session, true);
    assert.equal(unchanged.changed, false);
    const disabled = await controller.setEnabled(session, false);
    assert.equal(disabled.enabled, false);
    assert.equal(disabled.state, 'disabled');
    assert.equal(disabled.changed, true);
    assert.equal(controllerEngine.enabledSessions.has(session), false);

    let concurrentEnables = 0;
    let releaseEnable;
    let signalEnableEntered;
    const enableEntered = new Promise((resolve) => { signalEnableEntered = resolve; });
    class SlowEngine extends FakeEngine {
      enableBlockingInSession(target) {
        concurrentEnables += 1;
        super.enableBlockingInSession(target);
      }
    }
    const slowController = createBrowserAdblock({
      cachePath: path.join(tempRoot, 'slow.bin'),
      blockerClass: class SlowBlocker {
        static async fromPrebuiltAdsOnly() {
          signalEnableEntered();
          await new Promise((resolve) => { releaseEnable = resolve; });
          return new SlowEngine('slow');
        }
      },
      fetchImpl: async () => ({ ok: true }),
    });
    const readinessA = slowController.setEnabled(session, true);
    const readinessB = slowController.waitUntilReady();
    await enableEntered;
    releaseEnable();
    await Promise.all([readinessA, readinessB]);
    assert.equal(concurrentEnables, 1, 'eşzamanlı hazırlık tek etkinleştirme paylaşmalı');

    const failedController = createBrowserAdblock({
      cachePath: path.join(tempRoot, 'missing', 'engine.bin'),
      blockerClass: class BrokenBlocker {
        static async fromPrebuiltAdsOnly() { throw new Error('network unavailable'); }
        static deserialize() { throw new Error('invalid cache'); }
      },
      fetchImpl: async () => { throw new Error('offline'); },
      logger: { warn() {} },
    });
    const failed = await failedController.setEnabled(session, true);
    assert.equal(failed.ok, false);
    assert.equal(failed.enabled, false);
    assert.equal(failed.state, 'error');
    assert.match(failed.error, /network unavailable/);

    const root = path.join(__dirname, '..');
    const main = fs.readFileSync(path.join(root, 'src', 'main.js'), 'utf8');
    const preload = fs.readFileSync(path.join(root, 'src', 'preload.js'), 'utf8');
    const renderer = fs.readFileSync(path.join(root, 'src', 'renderer', 'renderer.js'), 'utf8');
    const html = fs.readFileSync(path.join(root, 'src', 'renderer', 'index.html'), 'utf8');

    assert.match(main, /createBrowserAdblock/);
    assert.match(main, /browser:adblock:getState/);
    assert.match(main, /browser:adblock:setEnabled/);
    assert.match(main, /noteBrowserCapture\('adblock'/);
    assert.match(main, /siteOverrideOrigin === origin[\s\S]{0,260}adblockEnabled/);
    assert.match(main, /adblock: adblock \?/);
    assert.match(main, /recentAllowed:[\s\S]{0,500}redactCaptureUrl/);
    assert.match(renderer, /adblock: 'FİLTRE'/);
    assert.match(preload, /getBrowserAdblockState/);
    assert.match(preload, /setBrowserAdblockEnabled/);
    assert.match(html, /id="browserAdblockEnabled"[^>]*checked/);
    const siteChipIndex = html.indexOf('id="browserSiteChipDetails"');
    const permissionsIndex = html.indexOf('id="browserSitePermissionsOpen"');
    const quickToggleIndex = html.indexOf('id="browserAdblockQuick"');
    assert.ok(siteChipIndex >= 0 && quickToggleIndex > siteChipIndex && quickToggleIndex < permissionsIndex,
      'reklam koruması anahtarı site çipi popover içinde (izinler düğmesinden önce) değil');
    assert.ok(html.slice(quickToggleIndex, quickToggleIndex + 220).includes('aria-pressed="true"'),
      'üst reklam koruması anahtarı erişilebilir basılı durumunu taşımıyor');
    assert.ok(renderer.includes("quick.setAttribute('aria-pressed', String(enabled))"),
      'üst anahtar gerçek reklam koruması durumuyla senkron değil');
    // Site bazlı korumada mantık toggleBrowserAdblockForSite içinde; genel
    // ayar kapalıysa/boş sekmede kalıcı kontrolün ortak change yolu kullanılır.
    const toggleStart = renderer.indexOf('async function toggleBrowserAdblockForSite');
    const quickBinding = renderer.slice(toggleStart, renderer.indexOf('\nfunction ', toggleStart + 10));
    assert.ok(quickBinding.includes('control.checked = !control.checked;')
      && quickBinding.includes("dispatchEvent(new Event('change'"),
      'üst anahtar kalıcı ayar kontrolünün ortak değişiklik yolunu kullanmıyor');
    const persisted = renderer.slice(renderer.indexOf('const PERSIST_CHECKBOX_CONTROLS'), renderer.indexOf('function collectUiSettings'));
    assert.match(persisted, /browserAdblockEnabled/);
    assert.ok(renderer.indexOf("event.type === 'adblock-status'") < renderer.indexOf('if (event.tabId)', renderer.indexOf('if (window.api.onBrowserEvent)')),
      'global adblock status must not be dropped by the per-tab event gate');

    for (const marker of ['async function openBrowserLinkInNewTab', 'function resumeRestoredBrowserPage', "ipcMain.handle('browser:navigate'"]) {
      const start = main.indexOf(marker);
      const load = main.indexOf('loadURL(', start);
      const preparation = main.indexOf('startBrowserAdblock()', start);
      const blockingReadiness = main.indexOf('await waitForBrowserAdblockReady()', start);
      assert.ok(start >= 0 && preparation > start && preparation < load,
        `${marker} reklam korumasını gezinmeden önce arka planda başlatmalı`);
      assert.ok(blockingReadiness < 0 || blockingReadiness > load,
        `${marker} ilk gezinmeyi filtre indirmesine kilitlememeli`);
    }

    console.log('Browser adblock cache, fallback, toggle and integration tests passed');
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
