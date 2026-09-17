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
    player: { workspaceMode: 'browser', browserActiveTabId: 'a', cues: [{ text: 'Başka iz' }] },
    currentGeneration: () => 1, staleGeneration: () => false,
    $: () => null, updateBrowserTranslationExportButton() {},
    browserTrackSelection: () => ({ id: 'missing', path: 'missing.srt' }),
    window: { api: { readSubtitle: async () => ({ ok: false }),
      exportBrowserSubtitle: async () => { exported++; return { ok: true }; } } },
    setBrowserSignal: (...args) => signals.push(args),
  };
  vm.createContext(exportContext);
  vm.runInContext(source.slice(source.indexOf('async function runBrowserSubtitleExport('),
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
      effectiveBrowserProfile: () => ({ values: { targetLanguage: 'tr' } }),
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

  // Başlangıç reddi geçici üst bildirimde kaybolmamalı: günlük, sağlık durumu
  // ve tekrar/ayar eylemi için son hata saklanır.
  const rejectedTab = {};
  const rejectionSignals = [];
  const rejectionLogs = [];
  let rejectionHealthRenders = 0;
  const rejectionContext = {
    player: { browserActiveTabId: 'a', browserTranslationStartSeq: 0,
      cues: [{ start: 0, end: 1, text: 'Hello' }], browserTranslationLastError: '' },
    currentGeneration: () => 1, staleGeneration: () => false,
    browserTabState: () => rejectedTab,
    effectiveBrowserProfile: () => ({ values: { targetLanguage: 'tr' } }),
    $: () => null,
    window: { api: { startBrowserTranslation: async () => ({ ok: false,
      error: 'Canlı web çevirisi için seçili sağlayıcının API anahtarı girilmemiş.' }) } },
    updateBrowserTranslationExportButton() {}, updateBrowserTranslationRetryButton() {}, syncSubtitleModeUi() {},
    setSubtitleMode() {}, setBrowserSignal: (...args) => rejectionSignals.push(args),
    logLine: (...args) => rejectionLogs.push(args),
    renderBrowserSubtitleHealth: () => { rejectionHealthRenders++; },
  };
  vm.createContext(rejectionContext);
  vm.runInContext(source.slice(source.indexOf('async function startBrowserLiveTranslation('),
    source.indexOf('function browserTranslationCueKey(')), rejectionContext);
  const rejected = await rejectionContext.startBrowserLiveTranslation({ id: 'source', role: 'source' });
  assert.equal(rejected.ok, false);
  assert.match(rejectionContext.player.browserTranslationLastError, /API anahtarı girilmemiş/);
  assert.equal(rejectedTab.browserTranslationLastError, rejectionContext.player.browserTranslationLastError);
  assert.match(rejectionLogs[0][0], /başlatılamadı/);
  assert.equal(rejectionLogs[0][1], 'error');
  assert.equal(rejectionSignals.at(-1)[2].holdMs, 15000);
  assert.equal(rejectionHealthRenders, 1);

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

  // Canlı iz aynı kimlikle yeni asset yoluna geçtiğinde eski yol artık diskte
  // bulunmaz. Yenileme kararlı track kimliği üzerinden devam etmeli.
  const updatedSaved = { ...saved, path: 'saved-v2.srt' };
  Object.assign(refreshContext.player, { subPath: 'saved.srt', browserTracks: [updatedSaved] });
  refreshContext.scheduleActiveBrowserTrackRefresh(updatedSaved);
  await refresh();
  assert.equal(reloads, 2, 'yolu değişen etkin iz yeniden yüklenmedi');

  const option = { value: 'saved.srt', textContent: 'Eski' };
  const pathContext = {
    player: { subtitles: [{ path: 'saved.srt', label: 'Eski' }],
      subOrigins: { 'saved.srt': 'Web' } },
    subtitleOrigin: () => 'Web',
    $: () => ({ options: [option] }),
  };
  vm.createContext(pathContext);
  vm.runInContext(source.slice(source.indexOf('function replaceBrowserTrackSubtitlePath('),
    source.indexOf('function announceBrowserTrack(')), pathContext);
  assert.equal(pathContext.replaceBrowserTrackSubtitlePath(saved, updatedSaved), true);
  assert.equal(pathContext.player.subtitles.length, 1, 'eski asset seçeneği birikti');
  assert.equal(pathContext.player.subtitles[0].path, 'saved-v2.srt');
  assert.equal(option.value, 'saved-v2.srt');

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

  const displayReports = [];
  const streamTab = { id: 'a' };
  const streamContext = {
    player: { browserTranslationTrackId: 'live', browserLiveTranslations: new Map(),
      cues: [], cues2: [], cues2Raw: null, workspaceMode: 'browser', mergeCont: true },
    browserTabState: () => streamTab,
    currentGeneration: () => 1, staleGeneration: () => false,
    $: () => null,
    mergeCueContinuation: (cues) => cues.map((item) => ({ ...item })),
    updateBrowserTranslationExportButton() {}, syncSubtitleModeUi() {}, scheduleBrowserOverlaySync() {},
    renderBrowserCueAt() {}, renderCueList() {}, renderCue() {}, updateCueMeta() {},
    window: { api: { reportBrowserTranslationDisplayed: async (...args) => { displayReports.push(args); } } },
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
  assert.equal(displayReports.length, 2, 'artımlı sonuçlar görünüm bütünlüğü IPCsine bildirilmedi');
  assert.deepEqual(JSON.parse(JSON.stringify(displayReports)), [['a', 'live', ['1']], ['a', 'live', ['2']]]);

  // Snapshot eski satırları geri birleştirmemeli ve ham kaynak/çeviriyi yenilemeli.
  Object.assign(streamTab, { id: 'a', browserTranslationTrackId: 'live', generation: 1,
    browserLiveTranslations: [{ id: 'web-tr-old', text: 'Silinmiş', start: 0, end: 1 }] });
  streamContext.player.browserActiveTabId = 'a';
  streamContext.window = { api: {
    reportBrowserTranslationDisplayed: async (...args) => { displayReports.push(args); },
    getBrowserTranslationSnapshot: async () => ({
    ok: true, trackId: 'live', generation: 1,
    sourceCues: [{ id: 'new', text: 'Source.', start: 5, end: 6 }],
    results: [{ cueId: 'new', text: 'Yeni.', start: 5, end: 6 }],
    state: { total: 1, completed: 1, failures: [] },
  }), } };
  let restoredMode;
  streamContext.setSubtitleMode = (mode) => { restoredMode = mode; };
  streamContext.updateBrowserTranslationRetryButton = () => {};
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
  let viewGeneration = 1;
  streamContext.currentGeneration = () => viewGeneration;
  streamContext.staleGeneration = (value) => value !== viewGeneration;
  let finishSnapshot;
  streamContext.window.api.getBrowserTranslationSnapshot = () => new Promise((resolve) => { finishSnapshot = resolve; });
  const staleSnapshot = streamContext.restoreBrowserTranslationSnapshot(streamTab);
  viewGeneration += 2; // Aynı sekmeye geri dönüldü; main kuşağı değişmeyebilir.
  finishSnapshot({ ok: true, trackId: 'live', generation: 1,
    sourceCues: [{ id: 'old', text: 'Eski kaynak', start: 0, end: 1 }],
    results: [{ cueId: 'old', text: 'Eski çeviri', start: 0, end: 1 }], state: {} });
  await staleSnapshot;
  assert.equal(streamContext.player.cuesRaw[0].text, 'Source.', 'geç snapshot kaynak seçimini ezdi');
  assert.equal(streamContext.player.cues2Raw[0].text, 'Yeni.', 'geç snapshot güncel çeviriyi ezdi');
  assert.equal(streamContext.browserTranslationJustCompleted(streamTab, { total: 2, completed: 1 }), false);
  assert.equal(streamContext.browserTranslationJustCompleted(streamTab, { total: 2, completed: 2 }), true,
    'yeni eklenen cümleler tamamlanınca geçiş algılanmadı');

  const loadedTrack = { id: 'saved', path: 'saved.srt', role: 'translation', autoLoad: true };
  const autoContext = { player: { browserLoadedTrackId: 'saved', cues: [{}] },
    currentGeneration: () => 1, browserTabState: () => ({ id: 'a' }) };
  vm.createContext(autoContext);
  vm.runInContext(source.slice(source.indexOf('async function loadPersistedBrowserTranslation('),
    source.indexOf('function browserTrackSelection(')), autoContext);
  await autoContext.loadPersistedBrowserTranslation(loadedTrack);
  assert.equal(loadedTrack.autoLoad, false, 'otomatik yükleme işareti her sekme dönüşünde tekrarlandı');

  // R51-71: updateCueMeta her karede 10k cue için imza dizisi kuruyordu
  // (~3.4ms/frame → ~0.6ms). İmza WeakMap'te cache'lenir; start/end/text'e
  // yazan iki nokta (zaman çizelgesi sürükleme, kayıtlı düzenleme) invalidate eder.
  assert.match(source, /const cueSignatureCache = new WeakMap\(\)/, 'cueSignature cache yok');
  assert.match(source, /function invalidateCueSignature\(cue\)/, 'invalidate yardımcısı yok');
  const dragBlock = source.slice(source.indexOf("if (drag.mode === 'start')"), source.indexOf('drag.changed = true'));
  assert.match(dragBlock, /invalidateCueSignature\(cue\)/, 'zaman sürüklemesi imzayı eskitmiyor');
  const editStart = source.indexOf('cue.text = text;');
  const editBlock = source.slice(editStart, source.indexOf('refreshCueWordRanges(cue)', editStart));
  assert.match(editBlock, /invalidateCueSignature\(cue\)/, 'metin düzenlemesi imzayı eskitmiyor');
  // migrateSavedCueAssociation eski anahtarı beforeKOPYASI üzerinden okur —
  // invalidate, migrate çağrısından önce gelmeli ki yeni imza doğru hesaplansın.
  const editOrder = source.indexOf('invalidateCueSignature(cue);', source.indexOf('cue.text = text;'));
  const migrateOrder = source.indexOf('migrateSavedCueAssociation(beforeCue, cue)');
  assert(editOrder > 0 && migrateOrder > editOrder, 'invalidate→migrate sırası bozuk');

  console.log('Browser subtitle actions: export, start/retry races and saved translation refresh passed.');
})().catch((error) => { console.error(error); process.exitCode = 1; });
