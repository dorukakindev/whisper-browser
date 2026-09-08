'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { EventEmitter } = require('events');
const {
  bindBrowserNavigationLifecycle,
  browserNavigationStartDetails,
  browserWorkStillCurrent,
} = require('../src/browser-lifecycle');

let checks = 0;
function check(value, message) { assert.ok(value, message); checks += 1; }

async function run() {
  const modern = browserNavigationStartDetails({
    url: 'https://example.test/yeni', isSameDocument: false, isMainFrame: true,
  }, 'legacy', true, false);
  check(modern.url === 'https://example.test/yeni' && modern.isMainFrame && !modern.isSameDocument,
    'modern did-start-navigation ayrıntıları okunamadı');

  const legacy = browserNavigationStartDetails({}, 'https://example.test/eski', true, true);
  check(legacy.url === 'https://example.test/eski' && legacy.isMainFrame && legacy.isSameDocument,
    'eski Electron gezinme argümanları okunamadı');

  const contents = new EventEmitter();
  contents.destroyed = false;
  contents.reloadCount = 0;
  contents.isDestroyed = () => contents.destroyed;
  contents.reload = () => { contents.reloadCount += 1; };
  const view = { webContents: contents };
  const token = { generation: 7, view, contents };
  check(browserWorkStillCurrent(token, 7, view), 'güncel belge işi yanlışlıkla eski sayıldı');
  check(!browserWorkStillCurrent(token, 8, view)
    && !browserWorkStillCurrent(token, 7, { webContents: contents }),
    'eski kuşak veya görünüm işi güncel sayıldı');

  const seen = [];
  const unbind = bindBrowserNavigationLifecycle(contents, {
    onNavigationStart: (details) => seen.push(['start', details]),
    onNavigate: (details) => seen.push(['navigate', details]),
    onNavigateInPage: (details) => seen.push(['in-page', details]),
    onDomReady: () => seen.push(['dom-ready']),
    onRenderProcessGone: (details) => { seen.push(['gone', details]); return true; },
    canReloadAfterRenderGone: () => true,
    onRenderReload: () => seen.push(['reload']),
    onDestroyed: () => seen.push(['destroyed']),
  });

  contents.emit('did-start-navigation', {
    url: 'https://example.test/a', isSameDocument: false, isMainFrame: true,
  });
  contents.emit('did-start-navigation', {
    url: 'https://frame.test/', isSameDocument: false, isMainFrame: false,
  });
  contents.emit('did-navigate', {}, 'https://example.test/a', 200, 'OK');
  contents.emit('did-navigate-in-page', {}, 'https://example.test/a#spa', true, 4, 5);
  contents.emit('dom-ready');
  check(seen.filter(([type]) => type === 'start').length === 1,
    'alt frame gezinmesi ana belge başlangıcı sayıldı');
  check(seen.some(([type]) => type === 'navigate')
    && seen.some(([type]) => type === 'in-page')
    && seen.some(([type]) => type === 'dom-ready'),
    'tam gezinme, SPA veya dom-ready callbacki kayboldu');

  contents.emit('render-process-gone', {}, { reason: 'crashed', exitCode: 1 });
  await new Promise((resolve) => setImmediate(resolve));
  check(contents.reloadCount === 1 && seen.some(([type]) => type === 'reload'),
    'renderer kaybı yeni süreçte reload istemedi');

  contents.emit('destroyed');
  check(seen.some(([type]) => type === 'destroyed'), 'webContents yeniden yaratma sinyali kayboldu');
  const seenBeforeUnbind = seen.length;
  unbind();
  contents.emit('dom-ready');
  check(seen.length === seenBeforeUnbind, 'yaşam döngüsü listenerları temizlenmedi');

  const main = fs.readFileSync(path.join(__dirname, '..', 'src', 'main.js'), 'utf8');
  check(/onNavigationStart:[\s\S]*invalidateBrowserDocumentWork\(\)/.test(main)
    && /workToken: browserWorkToken\(\)/.test(main)
    && /CAPTURE_STALE/.test(main),
  'ana süreç eski belge kuşağı korumasına bağlı değil');
  check(/onRenderProcessGone:/.test(main) && /onDestroyed:/.test(main)
    && /replacement\.webContents\.loadURL\(browserLastCommittedUrl\)/.test(main),
  'renderer kaybı veya webContents yeniden yaratma yolu bağlı değil');
  check(/browserRenderRecoveryAttempts < 2/.test(main)
    && /browserViewRecreateAttempts < 2/.test(main)
    && /onDomReady:[\s\S]*browserRenderRecoveryAttempts = 0/.test(main),
  'renderer veya görünüm kurtarma bütçesi sınırsız');

  const electronHarness = fs.readFileSync(
    path.join(__dirname, 'browser-navigation-lifecycle.electron.js'), 'utf8');
  check(/http\.createServer/.test(electronHarness) && /history\.pushState/.test(electronHarness)
    && /navigationHistory\.goBack/.test(electronHarness)
    && /navigationHistory\.goForward/.test(electronHarness)
    && /forcefullyCrashRenderer/.test(electronHarness),
  'isteğe bağlı gerçek Electron matrisi zorunlu yerel senaryoları kapsamıyor');

  console.log(`browser-navigation-lifecycle: ${checks} test`);
}

run().catch((error) => {
  console.error(error && error.stack || error);
  process.exitCode = 1;
});
