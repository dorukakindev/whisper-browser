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

  // Geciken başlangıç yanıtı ne başka sekmeyi ne daha yeni aynı-iz işini ezer.
  for (const replacement of ['tab', 'track', 'request', 'generation', 'current']) {
    let finishStart;
    let generation = 1;
    const modes = [];
    const controls = { playerSubSelect2: { value: 'old.srt' }, browserTrackSelect2: { value: 'old' } };
    const startContext = {
      player: { browserActiveTabId: 'a', browserTranslationStartSeq: 0,
        cues: [{ start: 0, end: 1, text: 'Hello' }], cues2Raw: [{ text: 'old' }] },
      currentGeneration: () => generation, staleGeneration: (gen) => gen !== generation,
      $: (id) => controls[id],
      window: { api: { startBrowserTranslation: () => new Promise((resolve) => { finishStart = resolve; }) } },
      updateBrowserTranslationExportButton() {}, updateBrowserTranslationRetryButton() {}, syncSubtitleModeUi() {},
      setSubtitleMode: (mode) => modes.push(mode), setBrowserSignal: (...args) => modes.push(args),
    };
    vm.createContext(startContext);
    vm.runInContext(source.slice(source.indexOf('async function startBrowserLiveTranslation('),
      source.indexOf('function browserTranslationCueKey(')), startContext);
    const starting = startContext.startBrowserLiveTranslation({ id: 'source', role: 'source' });
    assert.equal(startContext.player.cues2Raw, null);
    assert.equal(controls.playerSubSelect2.value, '');
    if (replacement === 'tab') startContext.player.browserActiveTabId = 'b';
    if (replacement === 'track') startContext.player.browserTranslationTrackId = 'other';
    if (replacement === 'request') startContext.player.browserTranslationStartSeq++;
    if (replacement === 'generation') generation++;
    const selected = startContext.player.browserTranslationTrackId;
    finishStart(replacement === 'current' ? { ok: true, sentenceCount: 1 }
      : { ok: false, error: 'eski istek hatası' });
    await starting;
    assert.equal(startContext.player.browserTranslationTrackId, selected, replacement);
    if (replacement === 'current') assert.equal(modes[0], 'both', 'güncel başarılı istek uygulanmadı');
    else assert.equal(modes.length, 0, `${replacement}: eski yanıt görünümü değiştirdi`);
  }

  // Kaydedilmiş çeviri dosyası büyür/güncellenirse yalnız yeniden yüklenir.
  let refresh;
  let starts = 0;
  let reloads = 0;
  const saved = { id: 'saved', path: 'saved.srt', role: 'translation' };
  const refreshContext = {
    player: { browserActiveTabId: 'a', browserLoadedTrackId: 'saved', subPath: 'saved.srt',
      browserTranslationTrackId: 'saved', browserTrackRefreshTimers: {}, browserTracks: [saved] },
    currentGeneration: () => 1, staleGeneration: () => false,
    clearTimeout() {}, setTimeout: (fn) => { refresh = fn; return 1; },
    state: {}, $: () => null, loadSubtitle: async () => { reloads++; },
    startBrowserLiveTranslation: async () => { starts++; }, browserTrackSourceLanguage: () => 'tr',
  };
  vm.createContext(refreshContext);
  vm.runInContext(source.slice(source.indexOf('function scheduleActiveBrowserTrackRefresh('),
    source.indexOf('function browserSubtitleMode(')), refreshContext);
  refreshContext.scheduleActiveBrowserTrackRefresh(saved);
  await refresh();
  assert.equal(reloads, 1);
  assert.equal(starts, 0, 'kayıtlı çeviri yeniden çeviriye gönderildi');

  console.log('Browser subtitle actions: export, start/retry races and saved translation refresh passed.');
})().catch((error) => { console.error(error); process.exitCode = 1; });
