const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const js = fs.readFileSync(path.join(__dirname, '../src/renderer/renderer.js'), 'utf8');
const browserSubtitleSync = require('../src/browser-subtitle-sync');

function harness() {
  const tracks = [
    { id: 'src', path: 'src.srt', role: 'source' },
    { id: 'tr', path: 'tr.srt', role: 'translation' },
    { id: 'src2', path: 'src2.srt', role: 'source' },
  ];
  const controls = Object.fromEntries(['playerSubSelect', 'playerSubSelect2', 'browserTrackSelect', 'browserTrackSelect2']
    .map((id) => [id, { value: '' }]));
  const tab = {};
  const stops = [];
  const modes = [];
  const signals = [];
  const ctx = {
    browserSubtitleSync,
    player: { workspaceMode: 'browser', browserActiveTabId: 'a', browserTracks: tracks,
      browserTranslationTrackId: '', browserLiveTranslations: new Map(), cues: [], cues2: [],
      browserLoadedTrackId: '', browserLoadedTrackId2: '', subPath: '', sub2Path: '' },
    $: (id) => controls[id] || null, browserTabState: () => tab,
    currentGeneration: () => 1, staleGeneration: () => false,
    window: { api: { readSubtitle: async (file) => ({ ok: true, text: file }),
      stopBrowserTranslation: async (id) => { stops.push(id); } } },
    parseSubtitles: (text) => [{ id: '1', start: 0, end: 1, text }], applyCueQuality: (cues) => cues,
    browserTranslationMapFromCues: (cues) => new Map((cues || []).map((cue) => [String(cue.id), cue])),
    hideWordInspector() {}, renderCueList() {}, updateSubtitleChips() {}, updateMakeTransState() {},
    updateBrowserTranslationExportButton() {}, updateBrowserTranslationRetryButton() {},
    updatePlayerAutoSyncState() {}, renderCue() {}, scheduleBrowserOverlaySync() {}, logLine() {},
    updateCueEditHistoryButtons() {}, setSubtitleMode: (mode) => modes.push(mode),
    setBrowserSignal: (message) => signals.push(message),
  };
  vm.createContext(ctx);
  vm.runInContext(js.slice(js.indexOf('function browserPrimaryIsTranslation('), js.indexOf('function bestAvailableSubtitleMode(')), ctx);
  vm.runInContext(js.slice(js.indexOf('function browserTranslationCueKey('), js.indexOf('function browserTranslationJustCompleted(')), ctx);
  vm.runInContext(js.slice(js.indexOf('function clearBrowserSecondarySelection('), js.indexOf('// Videonun yanindaki altyazilari bul')), ctx);
  const load = (file, secondary = false, options = {}) => {
    controls[secondary ? 'playerSubSelect2' : 'playerSubSelect'].value = file;
    return ctx.loadSubtitle(file, secondary, options);
  };
  return { ctx, controls, tab, stops, modes, signals, load };
}

(async () => {
  const first = harness();
  await first.load('src.srt');
  await first.load('tr.srt', true);
  await first.load('src.srt', false, { silent: true });
  assert.equal(first.ctx.player.sub2Path, 'tr.srt', 'kaynak yenilenmesi seçili çeviriyi sildi');
  assert.equal(first.ctx.player.browserTranslationTrackId, 'tr');
  assert.equal(first.controls.playerSubSelect2.value, 'tr.srt');
  await first.load('src2.srt');
  assert.equal(first.ctx.player.browserLoadedTrackId2, '');
  assert.equal(first.controls.playerSubSelect2.value, '');
  assert.equal(first.tab.browserLoadedTrackId2, '');
  assert.equal(first.ctx.player.cues2.length, 0);

  const edited = harness();
  edited.tab.mediaId = 'youtube:video-1';
  const editedTrack = edited.ctx.player.browserTracks.find((track) => track.id === 'tr');
  Object.assign(editedTrack, { sourceTrackId: 'src', sourceHash: 'a1b2c3d4',
    cueIdentities: [{ id: 'web-tr-source-7', cueId: 'source-7', start: 0, end: 1,
      sourceCueHash: 'deadbeef' }] });
  edited.tab.subtitleEdits = [browserSubtitleSync.createEditRecord({
    mediaId: edited.tab.mediaId, variantId: 'tr', sourceHash: editedTrack.sourceHash,
    cueId: 'source-7', sourceCueHash: 'deadbeef', baseTranslation: 'tr.srt',
    hasOverride: true, userOverride: 'Kullanıcının kalıcı düzeltmesi', revision: 1,
  })];
  await edited.load('tr.srt');
  assert.equal(edited.ctx.player.cues[0].text, 'Kullanıcının kalıcı düzeltmesi');
  assert.equal([...edited.ctx.player.browserLiveTranslations.values()][0].text, 'tr.srt',
    'model temeli kullanıcı override metniyle kirletildi');
  edited.ctx.window.api.readSubtitle = async () => ({ ok: true, text: 'Yeni model metni' });
  await edited.load('tr.srt', false, { silent: true });
  assert.equal(edited.ctx.player.cues[0].text, 'Kullanıcının kalıcı düzeltmesi',
    'yenilenen model sonucu kullanıcı düzeltmesini ezdi');
  assert.equal(edited.ctx.player.browserBaseCues.get('youtube:video-1|tr').get('source-7').text, 'Yeni model metni');

  const second = harness();
  await second.load('tr.srt');
  await second.load('src.srt', true);
  second.modes.length = 0;
  await second.load('tr.srt', false, { silent: true });
  assert.equal(second.ctx.player.sub2Path, 'src.srt', 'çeviri yenilenmesi karşılaştırma kaynağını sildi');
  assert.equal(second.ctx.player.browserLoadedTrackId2, 'src');
  assert.equal(second.modes.length, 0, 'sessiz yenileme görünüm tercihini değiştirdi');

  const third = harness();
  await third.load('src.srt');
  third.ctx.player.browserTranslationTrackId = 'src';
  third.ctx.player.browserLiveTranslations.set('1', { text: 'Eski çeviri' });
  await third.load('src2.srt', true);
  assert.equal(third.stops.length, 1, 'elle seçilen ikinci izin üzerine canlı iş devam etti');
  assert.equal(third.ctx.player.browserTranslationTrackId, '');
  assert.equal(third.ctx.player.browserLiveTranslations.size, 0);

  const fourth = harness();
  await fourth.load('src.srt');
  fourth.ctx.window.api.readSubtitle = async () => { throw Error('dosya yok'); };
  await fourth.load('missing.srt');
  assert.equal(fourth.controls.playerSubSelect.value, 'src.srt');
  assert.equal(fourth.ctx.player.cues[0].text, 'src.srt');
  assert.match(fourth.signals[0], /dosya yok/);
  let finish;
  fourth.ctx.window.api.readSubtitle = () => new Promise((resolve) => { finish = resolve; });
  const stale = fourth.load('stale.srt');
  fourth.controls.playerSubSelect.value = 'new-choice.srt';
  finish({ ok: false, error: 'gecikmiş hata' });
  await stale;
  assert.equal(fourth.controls.playerSubSelect.value, 'new-choice.srt', 'eski hata yeni seçimi geri aldı');
  assert.equal(fourth.signals.length, 1);

  const pair = harness();
  await pair.load('src.srt');
  await pair.load('tr.srt', true);
  pair.ctx.browserTrackSelection = (secondary) => pair.ctx.player.browserTracks.find((track) => track.id === (secondary ? 'tr' : 'src2'));
  pair.ctx.addSubtitleOption = () => {};
  pair.ctx.setPlayerSidebarCollapsed = () => {};
  vm.runInContext(js.slice(js.indexOf('async function useBrowserTrackPair('),
    js.indexOf('async function loadManualBrowserSubtitle(')), pair.ctx);
  await pair.ctx.useBrowserTrackPair();
  assert.equal(pair.ctx.player.subPath, 'src2.srt');
  assert.equal(pair.ctx.player.sub2Path, 'tr.srt', 'birincil değişimi çift yükleme isteğinin ikinci seçimini sildi');
  assert.equal(pair.controls.playerSubSelect2.value, 'tr.srt');

  for (const mode of ['off', 'both']) {
    const restored = harness();
    Object.assign(restored.tab, { id: 'a', subtitleSelection: { primaryId: 'tr', secondaryId: 'src' },
      subtitleSelectionRestored: false, restoreSubtitleMode: mode });
    restored.ctx.player.subsHidden = mode === 'off';
    restored.ctx.setSubtitlesVisible = () => { throw Error('geri yükleme kapalı altyazıyı erken açtı'); };
    restored.ctx.addSubtitleOption = () => {};
    let saved = 0;
    restored.ctx.saveActiveBrowserTabWorkspace = () => { saved++; };
    vm.runInContext(js.slice(js.indexOf('async function restoreBrowserSubtitleSelection('),
      js.indexOf('async function loadPersistedBrowserTranslation(')), restored.ctx);
    const sourceTrack = restored.ctx.player.browserTracks.shift();
    await restored.ctx.restoreBrowserSubtitleSelection(restored.tab);
    assert.equal(restored.ctx.player.subPath, '', 'ikinci iz gelmeden yarım seçim yüklendi');
    restored.ctx.player.browserTracks.push(sourceTrack);
    await restored.ctx.restoreBrowserSubtitleSelection(restored.tab);
    assert.equal(restored.ctx.player.subPath, 'tr.srt');
    assert.equal(restored.ctx.player.sub2Path, 'src.srt');
    assert.equal(restored.modes.at(-1), mode);
    assert.equal(restored.tab.subtitleSelectionRestored, true);
    assert.equal(saved, 1);
    await restored.ctx.restoreBrowserSubtitleSelection(restored.tab);
    assert.equal(saved, 1, 'aynı seçim tekrar yüklendi');
  }
  const returning = harness();
  Object.assign(returning.tab, { id: 'a', subtitleSelection: { primaryId: 'tr', secondaryId: '' },
    subtitleSelectionRestored: false, restoreSubtitleMode: 'translation' });
  let generation = 1;
  returning.ctx.currentGeneration = () => generation;
  returning.ctx.staleGeneration = (value) => value !== generation;
  returning.ctx.addSubtitleOption = () => {};
  returning.ctx.saveActiveBrowserTabWorkspace = () => {};
  const reads = [];
  returning.ctx.window.api.readSubtitle = () => new Promise((resolve) => reads.push(resolve));
  vm.runInContext(js.slice(js.indexOf('async function restoreBrowserSubtitleSelection('),
    js.indexOf('async function loadPersistedBrowserTranslation(')), returning.ctx);
  const oldRestore = returning.ctx.restoreBrowserSubtitleSelection(returning.tab);
  generation += 2; // A -> B -> A, ilk A'nın dosya okuması hâlâ sürüyor.
  const newRestore = returning.ctx.restoreBrowserSubtitleSelection(returning.tab);
  assert.equal(reads.length, 2, 'eski okuma kilidi sekmeye dönüşte geri yüklemeyi engelledi');
  reads[0]({ ok: true, text: 'Eski' });
  await oldRestore;
  assert.ok(returning.tab.subtitleSelectionLoading, 'eski finally yeni okumanın kilidini kaldırdı');
  reads[1]({ ok: true, text: 'Güncel' });
  await newRestore;
  assert.equal(returning.ctx.player.cues[0].text, 'Güncel');
  assert.equal(returning.tab.subtitleSelectionRestored, true);
  assert.equal(returning.tab.subtitleSelectionLoading, false);

  const automatic = harness();
  automatic.tab.id = 'a';
  let autoGeneration = 1;
  automatic.ctx.currentGeneration = () => autoGeneration;
  automatic.ctx.staleGeneration = (value) => value !== autoGeneration;
  automatic.ctx.addSubtitleOption = () => {};
  automatic.ctx.renderBrowserTracks = () => {};
  automatic.ctx.renderTranscript = () => {};
  automatic.ctx.player.subtitles = [];
  automatic.ctx.player.subOrigins = {};
  const autoReads = [];
  automatic.ctx.window.api.readSubtitle = () => new Promise((resolve) => autoReads.push(resolve));
  vm.runInContext(js.slice(js.indexOf('async function loadPersistedBrowserTranslation('),
    js.indexOf('function browserTrackSelection(')), automatic.ctx);
  const savedTrack = automatic.ctx.player.browserTracks.find((track) => track.id === 'tr');
  const oldAuto = automatic.ctx.loadPersistedBrowserTranslation(savedTrack);
  autoGeneration += 2;
  const newAuto = automatic.ctx.loadPersistedBrowserTranslation(savedTrack);
  assert.equal(autoReads.length, 2, 'otomatik çeviri yüklemesinin eski kilidi kaldı');
  // Aynı dosya yolu sekmeye dönüşte zaten kaydedilmiş olabilir: sadece yol
  // karşılaştırması eski loadSubtitle çağrısının son işlemlerini engellemez.
  automatic.ctx.player.subPath = savedTrack.path;
  autoReads[0]({ ok: true, text: 'Eski otomatik' });
  await oldAuto;
  assert.equal(automatic.modes.length, 0, 'iptal edilmiş yükleme görünümü değiştirdi');
  assert.ok(automatic.tab.persistedTranslationLoading, 'eski finally yeni otomatik yüklemeyi kilitsiz bıraktı');
  autoReads[1]({ ok: true, text: 'Yeni otomatik' });
  await newAuto;
  assert.equal(automatic.ctx.player.cues[0].text, 'Yeni otomatik');
  assert.equal(automatic.tab.persistedTranslationLoading, false);

  console.log('Browser subtitle selection: pair refresh, channel reset, live replacement, failed reads and return races passed.');
})().catch((error) => { console.error(error); process.exitCode = 1; });
