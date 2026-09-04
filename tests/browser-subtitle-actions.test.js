const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const source = fs.readFileSync(path.join(__dirname, '../src/renderer/renderer.js'), 'utf8');

function action(name, next, context) {
  vm.createContext(context);
  vm.runInContext(source.slice(source.indexOf(`async function ${name}(`),
    source.indexOf(`async function ${next}(`)), context);
  return context[name];
}

(async () => {
  // Okunamayan seçili iz, bellekteki başka altyazıyla sessizce değiştirilmemeli.
  let exported = 0;
  const signals = [];
  const exportContext = {
    player: { browserActiveTabId: 'a', cues: [{ text: 'Başka iz' }] },
    browserTrackSelection: () => ({ id: 'missing', path: 'missing.srt' }),
    window: { api: { readSubtitle: async () => ({ ok: false }),
      exportBrowserSubtitle: async () => { exported++; return { ok: true }; } } },
    setBrowserSignal: (...args) => signals.push(args),
  };
  vm.createContext(exportContext);
  vm.runInContext(source.slice(source.indexOf('async function exportSelectedBrowserTrack('),
    source.indexOf('function updateBrowserTranslationExportButton(')), exportContext);
  await exportContext.exportSelectedBrowserTrack();
  assert.equal(exported, 0);
  assert.match(signals[0][0], /Seçilen altyazı okunamadı/);

  let loaded = 0;
  let completed = 0;
  const completeContext = {
    player: { browserActiveTabId: 'a', browserTranslationTrackId: 'saved' },
    browserTrackSelection: () => ({ id: 'saved', role: 'translation' }),
    loadPersistedBrowserTranslation: async () => { loaded++; },
    window: { api: { completeBrowserTranslation: async () => { completed++; } } },
  };
  await action('completeSelectedBrowserTranslation', 'startBrowserLiveTranslation', completeContext)();
  assert.equal(loaded, 1);
  assert.equal(completed, 0, 'kayıtlı çeviri için olmayan scheduler çağrıldı');

  let finishRetry;
  const retryContext = {
    player: { browserActiveTabId: 'a', browserTranslationTrackId: 'source-a', browserTranslationFailed: 3 },
    window: { api: { retryFailedBrowserTranslation: () => new Promise((resolve) => { finishRetry = resolve; }) } },
    setBrowserSignal: () => { throw new Error('eski sekme sinyali gösterildi'); },
    updateBrowserTranslationRetryButton: () => { throw new Error('yeni sekme değiştirildi'); },
  };
  vm.createContext(retryContext);
  vm.runInContext(source.slice(source.indexOf('async function retryFailedBrowserTranslation('),
    source.indexOf('function abSubtitleExcerpt(')), retryContext);
  const pending = retryContext.retryFailedBrowserTranslation();
  retryContext.player.browserActiveTabId = 'b';
  finishRetry({ ok: true, retried: 3 });
  await pending;
  assert.equal(retryContext.player.browserTranslationFailed, 3);
  console.log('Browser subtitle actions: failed export, saved translation and stale retry guards passed.');
})().catch((error) => { console.error(error); process.exitCode = 1; });
