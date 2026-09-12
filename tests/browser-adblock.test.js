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
    const newTabIndex = html.indexOf('id="browserTabNew"');
    const quickToggleIndex = html.indexOf('id="browserAdblockQuick"');
    assert.ok(newTabIndex >= 0 && quickToggleIndex > newTabIndex && quickToggleIndex - newTabIndex < 900,
      'üst reklam koruması anahtarı yeni sekme düğmesinin yanında değil');
    assert.ok(html.slice(quickToggleIndex, quickToggleIndex + 220).includes('aria-pressed="true"'),
      'üst reklam koruması anahtarı erişilebilir basılı durumunu taşımıyor');
    assert.ok(renderer.includes("quick.setAttribute('aria-pressed', String(enabled))"),
      'üst anahtar gerçek reklam koruması durumuyla senkron değil');
    const quickBinding = renderer.slice(renderer.indexOf("if ($('browserAdblockQuick'))"), renderer.indexOf("if ($('browserPlayerResponseAdPrune'))"));
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
