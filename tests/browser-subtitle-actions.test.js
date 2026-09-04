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
      browserTabState: () => ({}),
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

  // Artımlı yenileme renderer'daki sıfırlayıcı başlangıç yoluna dönmemeli.
  let refreshRequest;
  let snapshots = 0;
  const live = { id: 'live', path: 'live.srt', role: 'source' };
  Object.assign(refreshContext.player, { browserLoadedTrackId: 'live', subPath: 'live.srt',
    browserTranslationTrackId: 'live', browserTracks: [live], cuesRaw: [live] });
  refreshContext.window = { api: { startBrowserTranslation: async (_tabId, payload) => {
    refreshRequest = payload; return { ok: true };
  } } };
  refreshContext.browserTabState = () => ({ id: 'a' });
  refreshContext.restoreBrowserTranslationSnapshot = async () => { snapshots++; };
  refreshContext.scheduleActiveBrowserTrackRefresh(live);
  await refresh();
  assert.equal(refreshRequest.refresh, true);
  assert.equal(refreshRequest.cues, refreshContext.player.cuesRaw);
  assert.equal(snapshots, 1);

  const streamTab = {};
  const streamContext = {
    player: { browserTranslationTrackId: 'live', browserLiveTranslations: new Map(),
      cues: [], cues2: [], cues2Raw: null, workspaceMode: 'browser', mergeCont: true },
    browserTabState: () => streamTab,
    mergeCueContinuation: (cues) => cues.map((item) => ({ ...item })),
    updateBrowserTranslationExportButton() {}, syncSubtitleModeUi() {}, scheduleBrowserOverlaySync() {},
    renderBrowserCueAt() {}, renderCueList() {}, renderCue() {}, updateCueMeta() {},
  };
  vm.createContext(streamContext);
  vm.runInContext(source.slice(source.indexOf('function browserTranslationCueKey('),
    source.indexOf('async function restoreBrowserTranslationSnapshot(')), streamContext);
  vm.runInContext(source.slice(source.indexOf('function applyBrowserTranslationResult('),
    source.indexOf('async function useBrowserTrackPair(')), streamContext);
  vm.runInContext(source.slice(source.indexOf('function applyCueMerge('),
    source.indexOf('// ---- AI sohbet')), streamContext);
  const deliver = (id) => streamContext.applyBrowserTranslationResult({ trackId: 'live',
    result: { cues: [{ cueId: id, start: id, end: id + 1, text: `Çeviri ${id}` }] } });
  deliver(1);
  streamContext.applyCueMerge();
  deliver(2);
  streamContext.player.mergeCont = false;
  streamContext.applyCueMerge();
  assert.equal(streamContext.player.cues2.length, 2, 'birleştirme kapatılınca yeni çeviri kayboldu');
  assert.equal(streamTab.cues2Raw.length, 2);

  // Snapshot eski satırları geri birleştirmemeli ve ham kaynak/çeviriyi yenilemeli.
  Object.assign(streamTab, { id: 'a', browserTranslationTrackId: 'live', generation: 1,
    browserLiveTranslations: [{ id: 'web-tr-old', text: 'Silinmiş', start: 0, end: 1 }] });
  streamContext.player.browserActiveTabId = 'a';
  streamContext.window = { api: { getBrowserTranslationSnapshot: async () => ({
    ok: true, trackId: 'live', generation: 1,
    sourceCues: [{ id: 'new', text: 'Source.', start: 5, end: 6 }],
    results: [{ cueId: 'new', text: 'Yeni.', start: 5, end: 6 }],
    state: { total: 1, completed: 1, failures: [] },
  }) } };
  let restoredMode;
  streamContext.setSubtitleMode = (mode) => { restoredMode = mode; };
  streamContext.updateBrowserTranslationRetryButton = () => {};
  streamContext.renderTranscript = () => {};
  vm.runInContext(source.slice(source.indexOf('async function restoreBrowserTranslationSnapshot('),
    source.indexOf('function applyBrowserTranslationResult(')), streamContext);
  await streamContext.restoreBrowserTranslationSnapshot(streamTab);
  assert.equal(streamContext.player.browserLiveTranslations.size, 1);
  assert.equal(streamContext.player.browserLiveTranslations.has('old'), false);
  assert.equal(streamContext.player.cuesRaw[0].text, 'Source.');
  assert.equal(streamContext.player.cues2Raw[0].text, 'Yeni.');
  assert.equal(restoredMode, 'translation');
  restoredMode = 'source'; // Kullanıcı tamamlanmadan sonra kaynağı seçti.
  await streamContext.restoreBrowserTranslationSnapshot(streamTab);
  assert.equal(restoredMode, 'source', 'yinelenen tamamlanma kullanıcının seçimini geri aldı');
  assert.equal(streamContext.browserTranslationJustCompleted(streamTab, { total: 2, completed: 1 }), false);
  assert.equal(streamContext.browserTranslationJustCompleted(streamTab, { total: 2, completed: 2 }), true,
    'yeni eklenen cümleler tamamlanınca geçiş algılanmadı');

  const loadedTrack = { id: 'saved', path: 'saved.srt', role: 'translation', autoLoad: true };
  const autoContext = { player: { browserLoadedTrackId: 'saved', cues: [{}] }, browserTabState: () => ({ id: 'a' }) };
  vm.createContext(autoContext);
  vm.runInContext(source.slice(source.indexOf('async function loadPersistedBrowserTranslation('),
    source.indexOf('function browserTrackSelection(')), autoContext);
  await autoContext.loadPersistedBrowserTranslation(loadedTrack);
  assert.equal(loadedTrack.autoLoad, false, 'otomatik yükleme işareti her sekme dönüşünde tekrarlandı');

  console.log('Browser subtitle actions: export, start/retry races and saved translation refresh passed.');
})().catch((error) => { console.error(error); process.exitCode = 1; });
