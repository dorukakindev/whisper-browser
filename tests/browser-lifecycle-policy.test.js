'use strict';

const assert = require('node:assert/strict');
const { crashRecoveryPolicy, navigationRetryPolicy, parseRetryAfterMs,
  subtitleRequestRetryPolicy } = require('../src/browser-lifecycle-policy');

assert.deepEqual(navigationRetryPolicy({ status: 404 }), {
  action: 'terminal', reason: 'http-404', delayMs: 0,
});
assert.equal(navigationRetryPolicy({ status: 403,
  url: 'https://cdn.test/sub.m4s?X-Goog-Signature=secret' }).action, 'refresh-manifest');
assert.equal(navigationRetryPolicy({ status: 403,
  url: 'https://example.test/login' }).action, 'terminal');
assert.deepEqual(navigationRetryPolicy({ code: -105, attempt: 0 }), {
  action: 'retry', reason: 'net-err-105', delayMs: 10000, nextAttempt: 1,
});
assert.equal(navigationRetryPolicy({ status: 503, attempt: 1 }).delayMs, 30000);
assert.equal(navigationRetryPolicy({ status: 429, attempt: 0, retryAfterMs: 12500 }).delayMs, 12500);
assert.equal(navigationRetryPolicy({ code: -105, attempt: 3 }).reason, 'retry-limit');
assert.equal(crashRecoveryPolicy('clean-exit').action, 'ignore');
assert.equal(crashRecoveryPolicy('oom').severity, 'memory');
assert.equal(crashRecoveryPolicy('crashed').action, 'recreate-once');
assert.equal(crashRecoveryPolicy('integrity-failure').action, 'manual-reload');
assert.equal(parseRetryAfterMs('2.5', 0), 2500);
assert.equal(parseRetryAfterMs('Wed, 21 Oct 2015 07:28:00 GMT', Date.parse('Wed, 21 Oct 2015 07:27:50 GMT')), 10000);
assert.equal(parseRetryAfterMs('bozuk', 0), 0);
assert.deepEqual(subtitleRequestRetryPolicy({ status: 404, attempt: 0 }), {
  action: 'terminal', reason: 'http-404', delayMs: 0,
});
assert.equal(subtitleRequestRetryPolicy({ status: 403,
  url: 'https://cdn.test/sub.m4s?token=secret' }).action, 'refresh-manifest');
assert.equal(subtitleRequestRetryPolicy({ status: 429, retryAfterMs: 4200, attempt: 0 }).delayMs, 4200);
assert.equal(subtitleRequestRetryPolicy({ status: 503, attempt: 1 }).delayMs, 1000);
assert.equal(subtitleRequestRetryPolicy({ retryable: true, attempt: 2 }).delayMs, 3000);

// R51-46: çökme yeniden-deneme zamanlayıcısı sekmeye yazılır ve unload/close
// yolu onu temizler; boşaltılmış sekme crash retry ile dirilmez.
{
  const fs = require('fs');
  const path = require('path');
  const main = fs.readFileSync(path.join(__dirname, '..', 'src', 'main.js'), 'utf8');
  const crashStart = main.indexOf("wc.on('render-process-gone'");
  const crashBody = main.slice(crashStart, crashStart + 3600);
  assert.match(crashBody, /tab\.crashRecoveryTimer = setTimeout/,
    'crash retry zamanlayıcısı sekmeye yazılmıyor');
  assert.match(crashBody, /tab\.lifecycle === 'unloaded' \|\| tab\.lifecycle === 'unloading'/,
    'crash retry boşaltılmış sekmeyi diriltebilir');
  const unloadStart = main.indexOf('async function unloadBrowserTab(');
  const unloadBody = main.slice(unloadStart, unloadStart + 3200);
  assert.match(unloadBody, /clearTimeout\(tab\.crashRecoveryTimer\)/,
    'unloadBrowserTab crash retry zamanlayıcısını temizlemiyor');
  const destroyStart = main.indexOf('function destroyBrowserTab(');
  const destroyBody = main.slice(destroyStart, destroyStart + 1600);
  assert.match(destroyBody, /clearTimeout\(tab\.crashRecoveryTimer\)/,
    'destroyBrowserTab crash retry zamanlayıcısını temizlemiyor');
}

// R51-47: browser:show view kuramayınca bu çağrının ürettiği boş sekme kaydı
// kalmasın — yoksa oturum dosyasına "hayalet sekme" yazılır.
{
  const fs = require('fs');
  const path = require('path');
  const main = fs.readFileSync(path.join(__dirname, '..', 'src', 'main.js'), 'utf8');
  const showStart = main.indexOf("ipcMain.handle('browser:show'");
  const showBody = main.slice(showStart, showStart + 1600);
  assert.match(showBody, /createdHere = !!tab/, 'browser:show kaydın kim tarafından üretildiğini izlemiyor');
  assert.match(showBody, /createdHere && tab && !tab\.view && !tab\.restoredUrl[\s\S]{0,120}destroyBrowserTab\(tab\)/,
    'view kurulamayan yeni kayıt yok edilmiyor — hayalet sekme riski');
}

// R51-91: mini-player kapanışında ana pencereye geri bağlama, ana pencere
// kapanırken native addChildView fırlatırsa süreci düşürmemeli.
{
  const fs = require('fs');
  const path = require('path');
  const mini = fs.readFileSync(path.join(__dirname, '..', 'src', 'browser-mini-player.js'), 'utf8');
  assert.match(mini, /main && !main\.isDestroyed\(\)[\s\S]{0,140}try \{ main\.contentView\.addChildView/,
    'mini-player geri bağlama try/catch korumasız');
}

// R58-02/03: sekme render-process-gone'da sekmeye ait canlı Whisper süreci ve
// ücretli tam-iz çeviri scheduler'ı serbest bırakılmalı — yoksa model süreci
// sahipsiz kalır, API istekleri ölü sayfa için çalışmaya devam eder.
{
  const fs = require('fs');
  const path = require('path');
  const vm = require('vm');
  const main = fs.readFileSync(path.join(__dirname, '..', 'src', 'main.js'), 'utf8')
    .replace(/\r\n/g, '\n');
  const start = main.indexOf("wc.on('render-process-gone'");
  const end = main.indexOf("\n  });", start);
  assert.ok(start >= 0 && end > start, 'render-process-gone işleyicisi bulunamadı');
  const calls = [];
  const cancelled = [];
  const asrJob = { stopping: false, proc: { stdin: { write() {} } } };
  const tab = {
    id: 'tab-crash', closing: false, lifecycle: 'active',
    restoredUrl: 'https://video.example/watch?v=1', restoredTitle: 'Video',
    translationScheduler: { cancelAll: (reason) => { cancelled.push(reason); } },
    pageFind: null, generation: 0, crashRecoveryAttempt: 1,
  };
  const view = { setVisible() { calls.push('hide'); }, webContents: null };
  tab.view = view;
  const wc = {
    getURL: () => 'https://video.example/watch?v=1',
    getTitle: () => 'Video',
    isDestroyed: () => false,
    close: () => calls.push('wc-close'),
  };
  const context = vm.createContext({
    tab, view, wc,
    mainWindowClosing: false,
    browserTabById: (id) => id === 'tab-crash' ? tab : null,
    crashRecoveryPolicy: () => ({ action: 'notify', message: 'İşlem sona erdi.' }),
    cancelBrowserPermissionRequestsForTab() {},
    clearBrowserCloudflareTimer() {},
    stopBrowserManga: (t) => calls.push(['manga', t === tab]),
    stopBrowserPageTranslation: (t) => calls.push(['pagetr', t === tab]),
    stopBrowserLiveAsr: (reason) => calls.push(['asr', reason]),
    browserLiveAsr: { tab },
    detachBrowserDebugger() {},
    mainWindow: { isDestroyed: () => false, contentView: { removeChildView() {} } },
    browserActiveTabId: 'other',
    browserView: null,
    stopBrowserPolling() {},
    browserDebuggerReady: true,
    browserPendingResponses: new Map(),
    browserRequestRanges: new Map(),
    sendBrowserEvent() {},
    scheduleBrowserSessionSave() {},
    setTimeout: () => ({ unref() {} }),
    clearTimeout() {},
    ensureBrowserView: () => null,
    applyBrowserViewsLayout() {},
    resumeRestoredBrowserPage() {},
    String, Number, Object, console,
  });
  // Kesim arrow işlevinin kapanış süslüsünü dışarıda bırakır; elle eklenir.
  const handler = vm.runInContext(
    '(' + main.slice(start, end).replace(/^wc\.on\('render-process-gone',\s*/, '') + '\n})', context);
  handler(null, { reason: 'crashed' });
  assert.ok(calls.some((c) => Array.isArray(c) && c[0] === 'asr'),
    'crash handler sekmeye ait canlı Whisper işini durdurmuyor (R58-02)');
  assert.equal(cancelled.length, 1,
    'crash handler tam-iz çeviri schedulerını iptal etmiyor (R58-03)');
  assert.equal(context.tab.translationScheduler, null,
    'scheduler referansı crash sonrası temizlenmeli');
  assert.ok(calls.some((c) => Array.isArray(c) && c[0] === 'manga')
    && calls.some((c) => Array.isArray(c) && c[0] === 'pagetr'),
    'manga/sayfa çevirisi işleri crashde durdurulmadı');
  assert.equal(context.tab.view, null, 'görünüm crash sonrası bırakılmalı');
}

console.log('Tarayıcı yaşam döngüsü: retry sınıfları ve çökme neden politikası geçti.');
