'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { EventEmitter } = require('node:events');
const { cloudflareProbeState, cloudflareCompatibilityMessage } = require('../src/browser-cloudflare-compat');
const source = fs.readFileSync(require('node:path').join(__dirname, '../src/main.js'), 'utf8');

function harness() {
  const wc = new EventEmitter();
  wc.isDestroyed = () => false;
  const tab = { id: 'one', view: { webContents: wc }, generation: 1,
    browserInstrumentationPending: true, cloudflareProbeSeq: 0 };
  const calls = { overlay: 0, events: [] };
  const context = vm.createContext({
    tab, wc, browserView: tab.view, browserActiveTabId: tab.id,
    browserTabById: id => id === tab.id ? tab : null,
    browserCloudflareChallengeProbeScript: () => 'probe',
    executeBrowserTrustedMain: async () => [{ active: false }],
    cloudflareProbeState, cloudflareCompatibilityMessage,
    clearBrowserCloudflareTimer() {}, browserDebuggerNeeded: () => false,
    applyBrowserOverlay: async () => { calls.overlay++; return true; },
    recoverBrowserManifestResources: async () => 0,
    sendBrowserEvent: (_tab, event) => calls.events.push(event),
    scheduleBrowserCloudflareProbe() {},
    browserNavigationStateForTab: () => ({}), scheduleBrowserPageIndex() {},
    scheduleArchivedBrowserPageTranslationRestore() {}, scheduleBrowserDiscoveryProbe() {},
    reportBrowserDrmSupport() {}, clearTimeout() {},
  });
  const start = source.indexOf('async function performBrowserPageInstrumentation(');
  const end = source.indexOf('function executeBrowserFrames(', start);
  vm.runInContext(source.slice(start, end), context);
  context.prepareBrowserPageInstrumentation = context.performBrowserPageInstrumentation;
  const listenerStart = source.indexOf("wc.on('did-stop-loading',");
  const listenerEnd = source.indexOf("wc.on('did-navigate',", listenerStart);
  vm.runInContext(source.slice(listenerStart, listenerEnd), context);
  return { tab, wc, calls, context };
}

(async () => {
  const failures=[];
  async function check(name, fn) {
    try { await fn(); console.log('PASS ' + name); }
    catch(error) { failures.push(error); console.error('FAIL ' + name + ': ' + error.message); }
  }
  await check('gecikmiş güvenlik ölçümü tamamlanınca bekleyen katman uygulanır', async () => {
    const h=harness();await h.context.performBrowserPageInstrumentation(h.tab);
    assert.equal(h.calls.overlay,1);
  });
  await check('normal açılışta Cloudflare doğrulaması yaşanmış gibi mesaj verilmez', async () => {
    const h=harness();await h.context.performBrowserPageInstrumentation(h.tab);
    assert.equal(h.calls.events.length,1);
    assert(!h.calls.events[0].message.includes('Cloudflare'));
  });
  await check('güvenlik ölçümü önceden tamamlanmış sayfanın yükleme bitişi katmanı yeniler', async () => {
    const h=harness();h.tab.browserInstrumentationPending=false;h.wc.emit('did-stop-loading');
    assert.equal(h.calls.overlay,1);
  });
  await check('arka plan sekmesi etkin videonun katmanına dokunmaz', async () => {
    const h=harness();h.context.browserActiveTabId='other';h.wc.emit('did-stop-loading');
    await h.context.performBrowserPageInstrumentation(h.tab);assert.equal(h.calls.overlay,0);
  });
  await check('bilinmeyen güvenlik durumu katmanı etkinleştirmez', async () => {
    const h=harness();h.context.executeBrowserTrustedMain=async()=>[];
    await h.context.performBrowserPageInstrumentation(h.tab);assert.equal(h.calls.overlay,0);
    assert.equal(h.tab.browserInstrumentationPending,true);
  });
  if(failures.length)process.exitCode=1;
})().catch(error=>{console.error(error);process.exitCode=1;});
