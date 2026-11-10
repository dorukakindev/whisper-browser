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
    reviewSourceCues: (track,file,cues) => require('../src/browser-subtitle-review').reconcile(cues,[]).cues,
    browserTranslationMapFromCues: (cues) => new Map((cues || []).map((cue) => [String(cue.id), cue])),
    browserTrackSourceLanguage: (track) => track?.language || 'en',
    subLangFromPath: (file) => String(file || '').includes('.tr.') ? 'tr' : 'en',
    hideWordInspector() {}, renderCueList() {}, updateSubtitleChips() {}, updateMakeTransState() {},
    updateBrowserTranslationExportButton() {}, updateBrowserTranslationRetryButton() {},
    updatePlayerAutoSyncState() {}, renderCue() {}, scheduleBrowserOverlaySync() {}, logLine() {},
    updateSubCompareButton() {}, scheduleSubtitleWatchRefresh() {},
    updateCueEditHistoryButtons() {}, setSubtitleMode: (mode) => modes.push(mode),
    renderBrowserCueAt() {}, saveActiveBrowserTabWorkspace() {}, invalidateTimelineEdits() {},
    timelineCheckRecovery: async () => {},
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

require('node:test')('Browser subtitle choices and completion remain bound to the selected source', async () => {
  // Internal podcast loads select the requested file before reading, but still yield to a newer user selection.
  for (const changed of [false,true]) {
    const h=harness();let finish;h.ctx.addSubtitleOption=()=>{};
    h.ctx.window.api.readSubtitle=()=>new Promise(resolve=>finish=resolve);
    const pending=h.ctx.loadSubtitle('src.srt',false,{silent:true,select:true,role:'source'});
    assert.equal(h.controls.playerSubSelect.value,'src.srt');
    if(changed)h.controls.playerSubSelect.value='';
    finish({ok:true,text:'Saved source'});await pending;
    assert.equal(h.ctx.player.cues.length,changed?0:1);
  }
  {
    const h = harness();
    let generation = 1;
    let finish;
    h.ctx.currentGeneration = () => generation;
    h.ctx.staleGeneration = (started) => started !== generation;
    h.ctx.window.api.readSubtitle = () => new Promise(resolve => { finish = resolve; });
    const pending = h.load('src.srt');

    generation++;
    h.ctx.player.browserActiveTabId = 'b';
    // Reusing the same file path in another tab must not validate the old read.
    const currentCues = [{ id: 'current', start: 0, end: 1, text: 'Current tab' }];
    h.ctx.player.subPath = 'src.srt';
    h.ctx.player.cues = currentCues;
    finish({ ok: true, text: 'Late subtitle from the first tab' });
    await pending;
    assert.equal(h.ctx.player.cues, currentCues);
    assert.deepEqual(h.signals, []);
  }
  {
  const pair = harness();
  await pair.load('src.srt');
  await pair.load('src2.srt', true);
  const roles = pair.ctx.browserSubtitleRoleCues();
  assert.equal(roles.source, pair.ctx.player.cues, 'İki site dili birlikte seçilince birinci dil korunmalı');
  assert.equal(roles.translation, pair.ctx.player.cues2, 'İkinci site dili ayrı görüntüleme kanalında olmalı');
  pair.ctx.browserTransformForChannel = secondary => ({ scale: 1, offsetSeconds: secondary ? 2 : 1 });
  assert.equal(pair.ctx.browserTransformForRole('source').offsetSeconds, 1);
  assert.equal(pair.ctx.browserTransformForRole('translation').offsetSeconds, 2);
  const identity = pair.ctx.browserTrackSourceIdentity(pair.ctx.player.browserTracks[2], pair.ctx.player.cues2);
  assert.equal(identity.sourcePrefixHash, browserSubtitleSync.cuePrefixHash(pair.ctx.player.cues2, 1), 'İkinci kaynağın kimliği ilk dilin metninden üretilmemeli');

  const manualSync = harness();
  manualSync.tab.mediaId = 'manual-video';
  await manualSync.load('manual.srt');
  manualSync.ctx.nudgeBrowserSync(.5);
  assert.equal(manualSync.ctx.browserTransformForChannel(false).offsetSeconds, .5, 'Elle yüklenen SRT önizlemesi uygulanmalı');
  manualSync.ctx.saveBrowserSync();
  assert.equal(manualSync.tab.subtitleSyncRecords.length, 1);
  manualSync.ctx.player.browserSyncPreview = null;
  assert.equal(manualSync.ctx.browserTransformForChannel(false).offsetSeconds, .5, 'Dosya senkron kaydı yeniden kullanılmalı');
  manualSync.ctx.player.cuesRaw = [{ start: 5, end: 6, text: 'Aynı dosyada başka içerik' }];
  manualSync.ctx.player.cues = manualSync.ctx.player.cuesRaw;
  assert.equal(manualSync.ctx.browserTransformForChannel(false).offsetSeconds, 0, 'Değişen dosya içeriğine eski senkron uygulanmamalı');

  }
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

  // Turning captions off while a restored track is still being read must win.
  const toggled = harness();
  Object.assign(toggled.tab, { id: 'a', subtitleSelection: { primaryId: 'src', secondaryId: '' },
    subtitleSelectionRestored: false, restoreSubtitleMode: 'source' });
  toggled.ctx.addSubtitleOption = () => {};
  toggled.ctx.saveActiveBrowserTabWorkspace = () => {};
  let finishRead;
  toggled.ctx.window.api.readSubtitle = () => new Promise(resolve => { finishRead = resolve; });
  vm.runInContext(js.slice(js.indexOf('async function restoreBrowserSubtitleSelection('),
    js.indexOf('async function loadPersistedBrowserTranslation(')), toggled.ctx);
  const pendingRestore = toggled.ctx.restoreBrowserSubtitleSelection(toggled.tab);
  toggled.tab.subtitleMode = toggled.tab.restoreSubtitleMode = 'off';
  toggled.ctx.player.subsHidden = true;
  finishRead({ ok: true, text: 'Restored source' });
  await pendingRestore;
  assert.equal(toggled.modes.at(-1), 'off', 'a pending restore replaced the latest visibility choice');

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

  // The complete action also opens saved translations; the loader uses the primary channel.
  const completion = harness();
  completion.ctx.browserTrackSelection = () => completion.ctx.player.browserTracks[1];
  completion.ctx.addSubtitleOption = () => {};
  completion.ctx.renderBrowserTracks = () => {};
  completion.ctx.renderTranscript = () => {};
  completion.ctx.player.subtitles = [];
  completion.ctx.player.subOrigins = {};
  vm.runInContext(js.slice(js.indexOf('async function loadPersistedBrowserTranslation('), js.indexOf('function browserTrackSelection(')), completion.ctx);
  vm.runInContext(js.slice(js.indexOf('async function completeSelectedBrowserTranslation('), js.indexOf('async function startBrowserLiveTranslation(')), completion.ctx);
  assert.equal((await completion.ctx.completeSelectedBrowserTranslation()).ok, true, 'saved translation loaded in primary channel must report success');
  assert.equal(completion.ctx.player.browserLoadedTrackId, 'tr');
  assert.equal(completion.ctx.player.browserLoadedTrackId2, '');
  // A late completion on the same tab with reused track ids belongs to the old video.
  let videoGeneration = 1, completeRead;
  completion.ctx.currentGeneration = () => videoGeneration;
  completion.ctx.staleGeneration = captured => captured !== videoGeneration;
  completion.ctx.player.browserTranslationTrackId = 'src';
  completion.ctx.browserTrackSelection = () => completion.ctx.player.browserTracks[0];
  completion.ctx.window.api.completeBrowserTranslation = () => new Promise(resolve => { completeRead = resolve; });
  const pendingCompletion = completion.ctx.completeSelectedBrowserTranslation();
  videoGeneration++;
  completeRead({ok:true,remaining:12});
  assert.equal((await pendingCompletion).ok, false, 'same-tab new video must reject the old completion notice');

  console.log('Browser subtitle selection: pair refresh, channel reset, live replacement, failed reads and return races passed.');
});

require('node:test')('pair loader rejects mismatched translation and changed audio before loading either channel',async()=>{for(const mutate of [h=>h.ctx.player.browserTracks[1].sourceMismatch=true,h=>h.ctx.player.browserTracks[1].mediaToken='old']){const h=harness();h.controls.browserTrackSelect.value='src';h.controls.browserTrackSelect2.value='tr';h.ctx.addSubtitleOption=()=>{};h.ctx.setPlayerSidebarCollapsed=()=>{};h.ctx.currentBrowserWhisperAudio=()=>({mediaToken:'new'});vm.runInContext(js.slice(js.indexOf('function browserTrackSelection('),js.indexOf('function browserTrackSourceLanguage(')),h.ctx);vm.runInContext(js.slice(js.indexOf('async function useBrowserTrackPair('),js.indexOf('async function loadManualBrowserSubtitle(')),h.ctx);mutate(h);const result=await h.ctx.useBrowserTrackPair();assert.equal(result?.stale,true);assert.equal(h.ctx.player.subPath,'');assert.equal(h.ctx.player.sub2Path,'');assert(!h.modes.includes('both'));}});

require('node:test')('pair loader rechecks translation revision after the first asynchronous subtitle read',async()=>{const h=harness();h.controls.browserTrackSelect.value='src';h.controls.browserTrackSelect2.value='tr';h.ctx.addSubtitleOption=()=>{};h.ctx.setPlayerSidebarCollapsed=()=>{};vm.runInContext(js.slice(js.indexOf('function browserTrackSelection('),js.indexOf('function browserTrackSourceLanguage(')),h.ctx);vm.runInContext(js.slice(js.indexOf('async function useBrowserTrackPair('),js.indexOf('async function loadManualBrowserSubtitle(')),h.ctx);let release;h.ctx.window.api.readSubtitle=()=>new Promise(r=>release=r);const pending=h.ctx.useBrowserTrackPair();h.ctx.player.browserTracks[1].revision='new-revision';release({ok:true,text:'Source'});const result=await pending;assert.equal(result.stale,true);assert.equal(h.ctx.player.sub2Path,'');assert(!h.modes.includes('both'));});

require('node:test')('compatible browser pair still loads both source-owned tracks',async()=>{const h=harness();h.controls.browserTrackSelect.value='src';h.controls.browserTrackSelect2.value='tr';h.ctx.addSubtitleOption=()=>{};h.ctx.setPlayerSidebarCollapsed=()=>{};vm.runInContext(js.slice(js.indexOf('function browserTrackSelection('),js.indexOf('function browserTrackSourceLanguage(')),h.ctx);vm.runInContext(js.slice(js.indexOf('async function useBrowserTrackPair('),js.indexOf('async function loadManualBrowserSubtitle(')),h.ctx);await h.ctx.useBrowserTrackPair();assert.equal(h.ctx.player.subPath,'src.srt');assert.equal(h.ctx.player.sub2Path,'tr.srt');assert.equal(h.modes.at(-1),'both');});


require('node:test')('R853 B04 failed restore cannot use an unchanged selected path as a load receipt',async()=>{
 const tab={id:'a',subtitleSelection:{primaryFile:'same.srt',secondaryFile:'healthy.srt'}};
 const healthy=[{start:0,end:2,text:'Keep'}];let reads=0;
 const ctx={player:{browserActiveTabId:'a',browserTracks:[],subPath:'same.srt',cues:[],sub2Path:'healthy.srt',cues2:healthy},currentGeneration:()=>1,staleGeneration:()=>false,$:()=>({}),addSubtitleOption(){},loadSubtitle:async()=>{reads++;return {ok:false};},setSubtitleMode(){throw Error('Failed read restored mode');},saveActiveBrowserTabWorkspace(){throw Error('Failed read saved');}};
 vm.createContext(ctx);vm.runInContext(js.slice(js.indexOf('async function restoreBrowserSubtitleSelection('),js.indexOf('async function loadPersistedBrowserTranslation(')),ctx);
 await ctx.restoreBrowserSubtitleSelection(tab);await ctx.restoreBrowserSubtitleSelection(tab);
 assert.equal(reads,1);assert.equal(tab.subtitleSelectionRestored,undefined);assert.equal(tab.subtitleRestoreResults.primary.state,'failed');assert.equal(ctx.player.cues2,healthy);assert.equal(ctx.player.sub2Path,'healthy.srt');
});

require('node:test')('R853 B01/B06 tab summaries and clock evidence never borrow another owner',()=>{
 const m=require('../src/renderer/browser-work-inspector'),tab={id:'a',workspaceGeneration:5,generation:3,mediaKey:'A',browserCeaCapture:{state:'partial'},browserTranslationTrackId:'src',browserTranslationComplete:false,browserTranslationFailed:2};
 assert.equal(m.summary(tab,{job:{browserTabId:'b',generation:5,mediaKey:'A',kind:'translate'}}).job,'');
 assert.equal(m.summary(tab,{job:{browserTabId:'a',generation:4,mediaKey:'A',kind:'translate'}}).job,'');
 assert.equal(m.summary(tab,{job:{browserTabId:'a',generation:5,mediaKey:'A',kind:'translate'}}).job,'translate');
 assert.equal(m.summary(tab).translating,true);assert.equal(m.summary(tab).failed,2);
 assert.equal(m.clock(tab,'A',5,1000).state,'unknown');tab.browserClockSample={at:1000,generation:5,mediaKey:'A',mediaToken:'opaque',time:4};
 assert.equal(m.clock(tab,'A',5,1500).state,'verified');assert.equal(m.clock(tab,'A',5,5000).state,'stale');assert.equal(m.clock(tab,'B',5,1500).state,'changed');
 tab.browserAdPlaying=true;assert.equal(m.clock(tab,'A',5,1500).state,'ad');tab.browserAdPlaying=false;tab.browserClockSample.live=true;assert.equal(m.clock(tab,'A',5,1500).state,'live');tab.browserClockSample.live=false;tab.browserClockSample.waiting=true;assert.equal(m.clock(tab,'A',5,1500).state,'waiting');
});

require('node:test')('R853 B04/B07 channel identity, missing role and provenance remain distinct',()=>{
 const m=require('../src/renderer/browser-work-inspector'),tab={subtitleSelection:{primaryId:'source',secondaryId:'translation'}},tracks=[{id:'source',path:'a.srt',source:'network',language:'tr'}],live={subPath:'a.srt',cues:[{}],sub2Path:'',cues2:[]};
 assert.equal(m.channel(tab,false,tracks,live,1).state,'loaded');assert.equal(m.channel(tab,true,tracks,live,1).state,'waiting');
 assert.match(m.origin({source:'translation',language:'tr'},true),/Application translation/);assert.match(m.origin({translatedByService:true,role:'translation',language:'tr'},true),/Service translation/);
 assert.match(m.origin({source:'network',automatic:true},true),/automatic/);assert.match(m.origin({source:'live-asr'},true),/ASR/);assert.match(m.origin({source:'manual'},true),/Manual file/);assert.match(m.origin({role:'translation'},true),/unverified/);
 assert.match(m.origin(tracks[0],true),/Publisher/);assert.match(m.origin({...tracks[0],sourceMismatch:true},true),/source changed/);
});

require('node:test')('R853 inspector preserves focused controls, escapes content, offers only proved retries and uses the captured owner',async()=>{
 const {JSDOM}=require('jsdom'),dom=new JSDOM('<details id="browserWorkInspector" open><summary id="browserWorkInspectorLabel"></summary><div id="browserWorkTabs"></div><section id="browserWorkDetail"></section></details>');
 try{const model=require('../src/renderer/browser-work-inspector'),ui=require('../src/renderer/browser-work-inspector-ui');let retried,activated;
 const tab={id:'a',title:'<img src=x onerror=bad>',mediaId:'episode-A',subtitleSelection:{primaryFile:'missing.srt'},browserCeaCapture:{state:'partial',missing:1,missingRangeCount:1,missingRanges:[{start:3,end:6}],reviewId:'capture-A',canRetryMissing:true}},live={mediaKey:'A',generation:1,subPath:'missing.srt',cues:[],browserCeaCapture:tab.browserCeaCapture};
 let owner='owner-A';const view=ui.create({document:dom.window.document,model,snapshot:()=>({tabs:[tab],tab,live,tracks:[],owner,generation:1}),activate:id=>activated=id,retryMissing:proof=>retried=proof,retryChannel(){},en:()=>true,now:()=>0});
 view.render();assert.equal(dom.window.document.querySelector('img'),null);const tabButton=dom.window.document.querySelector('#browserWorkTabs button');tabButton.click();assert.equal(activated,'a');tabButton.focus();view.render();assert.equal(dom.window.document.activeElement,tabButton);
 const retry=[...dom.window.document.querySelectorAll('button')].find(b=>b.textContent==='Retry missing segments only');retry.click();await Promise.resolve();assert.equal(retried.owner,'owner-A');assert.equal(retried.reviewId,'capture-A');owner='owner-B';view.render();retry.click();await Promise.resolve();assert.equal(retried.owner,'owner-A','old action must retain its proof so runtime can reject it');
 tab.browserCeaCapture={state:'partial',canRetryMissing:false};live.browserCeaCapture=tab.browserCeaCapture;view.render();assert(![...dom.window.document.querySelectorAll('button')].some(b=>b.textContent==='Retry missing segments only'));assert.match(dom.window.document.getElementById('browserWorkDetail').textContent,/full coverage unknown/);
 }finally{dom.window.close();}
});

require('node:test')('R853 B07 publisher automatic/service flags survive actual persistence projection',()=>{
 const source=require('fs').readFileSync(require('path').join(__dirname,'../src/main.js'),'utf8');let saved;
 const ctx={browserWatchMediaId:()=> 'episode',createHash:require('crypto').createHash,browserAssetStore:()=>({putTrack:input=>{saved=input;return {ok:true,srtPath:'cached.srt',assetId:'sha256:123',document:input};}}),watchIndex:()=>null,scheduleBrowserSessionSave(){}};
 vm.createContext(ctx);vm.runInContext(source.slice(source.indexOf('function persistBrowserTrack('),source.indexOf('function restorePersistedBrowserTracks(')),ctx);
 const result=ctx.persistBrowserTrack({}, {id:'service-tr',automatic:true,translatedByService:true,translationLanguages:['tr']},[{start:0,end:1,text:'Fixture'}],{format:'textTrack'});
 assert.equal(saved.automatic,true);assert.equal(saved.translatedByService,true);assert.equal(saved.translationLanguages[0],'tr');assert.equal(result.source,'text-track');
});


require('node:test')('R853 actual inspector action bridge refuses source changes during confirmation and preserves the other channel on failed reload',async()=>{
 const uiSource=fs.readFileSync(require('path').join(__dirname,'../src/renderer/browser-work-inspector-ui.js'),'utf8');let handlers,confirm,calls=0,loads=0;
 const tab={id:'a',generation:4,subtitleSelection:{primaryFile:'same.srt',secondaryFile:'healthy.srt'}};
 const healthy=[{text:'Keep',start:0,end:1}],player={workspaceMode:'browser',browserActiveTabId:'a',mediaKey:'A',generation:2,browserTabs:[tab],browserTracks:[],subPath:'same.srt',sub2Path:'healthy.srt',cues:[],cues2:healthy,browserCeaCapture:{reviewId:'capture-A'}};
 const ctx={window:{BrowserWorkInspectorUI:{create:opts=>{handlers=opts;return {render(){}};}},BrowserWorkInspector:require('../src/renderer/browser-work-inspector'),UiLocale:{get:()=> 'en'},api:{captureFullBrowserSubtitle:async()=>{calls++;return {ok:true};}}},player,state:{},document:{addEventListener(){}},setInterval(){},currentGeneration:()=>player.generation,browserTabState:()=>tab,activateBrowserTabAndFocus(){},browserTransformForChannel:()=>({scale:1,offsetSeconds:0}),browserSubtitleSync:{sourceToVideoTime:t=>t},openAppDialog:()=>new Promise(resolve=>confirm=resolve),staleGeneration:g=>g!==player.generation,timelineEditsPending:()=>false,loadSubtitle:async()=>{loads++;return {ok:false};},restoreBrowserSubtitleSelection:async()=>{throw Error('failed load cannot restore');}};
 vm.createContext(ctx);vm.runInContext(uiSource.slice(uiSource.indexOf("if (typeof window === 'object' && window.BrowserWorkInspectorUI")),ctx);
 let owner=handlers.snapshot().owner;let pending=handlers.retryMissing({owner,reviewId:'capture-A',missing:[{start:0,end:1}]});player.mediaKey='B';confirm(true);await assert.rejects(pending,/source or selection changed/);assert.equal(calls,0);
 player.mediaKey='A';owner=handlers.snapshot().owner;pending=handlers.retryMissing({owner,reviewId:'capture-A',missing:[]});confirm(false);await pending;assert.equal(calls,0);
 pending=handlers.retryMissing({owner,reviewId:'capture-A',missing:[]});confirm(true);await pending;assert.equal(calls,1);
 await assert.rejects(handlers.retryChannel({owner,secondary:false,path:'same.srt',id:''}),/could not be read/);assert.equal(loads,1);assert.equal(player.sub2Path,'healthy.srt');assert.equal(player.cues2,healthy);assert.equal(tab.subtitleRestoreResults.primary.state,'failed');
 player.editing=true;await assert.rejects(handlers.retryChannel({owner,secondary:false,path:'same.srt',id:''}),/pending subtitle edits/);assert.equal(loads,1);
});

require('node:test')('B04 successful primary restoration preserves the healthy secondary translation and its owner',async()=>{
 const h=harness();await h.load('tr.srt',true);const healthy=h.ctx.player.cues2;h.ctx.player.browserTranslationFailed=2;
 assert.equal(h.ctx.player.browserTranslationTrackId,'tr');
 await h.load('src.srt',false,{silent:true,restoringSelection:true,preserveSecondary:true});
 assert.equal(h.ctx.player.cues2,healthy);assert.equal(h.ctx.player.sub2Path,'tr.srt');assert.equal(h.ctx.player.browserLoadedTrackId2,'tr');assert.equal(h.ctx.player.browserTranslationTrackId,'tr');assert.equal(h.ctx.player.subPath,'src.srt');assert.equal(h.ctx.player.browserTranslationFailed,2);
});

require('node:test')('B03 provider quality warnings remain review issues without altering cue flags',()=>{
 const review=require('../src/browser-subtitle-review'),cue={start:0,end:10,text:'Short',qualityWarning:true,qualityIssues:['provider-warning']},before=JSON.stringify(cue);
 const issues=review.issues([{channel:'secondary',role:'translation',cues:[cue]}]);assert(issues[0].reasons.includes('quality-warning'));assert.equal(JSON.stringify(cue),before);
});
require('node:test')('S05 status is read-only and distinguishes stale clocks, ads, pause, range and source ownership',()=>{
 const Dub=require('../src/renderer/browser-dub-audio'),base={session:{url:'local',range:{start:5,end:10}},sample:{at:1000,currentTime:6,paused:false,readyState:4},audio:{readyState:4,paused:false},offset:0,now:()=>1100,owns:()=>true,matches:()=>true};
 const status=()=>Dub.prototype.status.call(base);assert.equal(status().state,'playing');base.sample.at=0;base.now=()=>3000;assert.equal(status().state,'stale');base.now=()=>1000;base.sample.at=1000;base.sample.adPlaying=true;assert.equal(status().state,'ad');base.sample.adPlaying=false;base.sample.paused=true;assert.equal(status().state,'paused');base.sample.paused=false;base.sample.currentTime=2;assert.equal(status().state,'outside');base.owns=()=>false;assert.equal(status().state,'source-changed');
});

require('node:test')('B05/B08/G01 inspection compares observed revisions without crossing episodes or claiming playback',()=>{
 const {JSDOM}=require('jsdom'),dom=new JSDOM('<details id="browserWorkInspector" open><summary id="browserWorkInspectorLabel"></summary><div id="browserWorkTabs"></div><section id="browserWorkDetail"></section></details>');
 try{const tab={id:'a',mediaId:'episode-A',title:'A',browserTranslationTrackId:'tr',browserTranslationComplete:false},track={id:'s',sourceHash:'old',cueCount:2},live={mediaKey:'A',browserTranslationTrackId:'tr',cues:[],cues2:[]};
 const view=require('../src/renderer/browser-work-inspector-ui').create({document:dom.window.document,model:require('../src/renderer/browser-work-inspector'),snapshot:()=>({tabs:[tab],tab,live,tracks:[track],owner:tab.mediaId,generation:1}),activate(){},retryMissing(){},retryChannel(){},en:()=>true,now:()=>0});
 view.render();let text=dom.window.document.body.textContent;assert.match(text,/Changing content cancels/);assert.match(text,/playback needs verification/);assert.match(text,/unknown/);
 track.sourceHash='new';track.cueCount=3;view.render();text=dom.window.document.body.textContent;assert.match(text,/old/);assert.match(text,/new/);assert.match(text,/2 cues/);assert.match(text,/3 cues/);
 tab.mediaId='episode-B';view.render();assert.match(dom.window.document.body.textContent,/No old\/new difference observed/);
 }finally{dom.window.close();}
});

require('node:test')('S02 explicit failed output read is never attached through the old selected path',async()=>{
 const outputs={items:[{path:'same.srt',role:'source',status:'partial'}],source:{path:'same.srt',role:'source'}},receipts=[];
 const ctx={state:{},player:{mediaKey:'A',subPath:'same.srt',sub2Path:'',cues:[],workspaceMode:'player'},SubtitleWorkStatus:{completion:(job,out,result)=>receipts.push(result)},completedSubtitleOutputs:()=>outputs,currentGeneration:()=>1,staleGeneration:()=>false,registerCompletedBrowserOutputs(){},addSubtitleOption(){},friendlySystemError:message=>message,subtitleOutputContract:{outputLabel:()=>''},$:()=>({}),loadSubtitle:async()=>({ok:false}),rememberPendingPlayerLoad(){}};
 vm.createContext(ctx);vm.runInContext(js.slice(js.indexOf('async function attachCompletedJobSubtitles('),js.indexOf('async function retryPendingPlayerLoad(')),ctx);
 const result=await ctx.attachCompletedJobSubtitles({}, {mediaKey:'A',generation:1,selectedSubPath:'same.srt'});assert.equal(result.loaded,false);assert.equal(receipts[0].loaded,false);assert.match(result.reason,/failed|yüklenemedi/);
});
require('node:test')('S02 completion receipts freeze source identity without copying credentials or approvals',()=>{
 const m=require('../src/renderer/subtitle-work-status'),job={id:'receipt-fixture',mediaKey:'A',generation:1,apiKey:'PRIVATE',approvalToken:'PRIVATE'},out={items:[{path:'a.srt',role:'translation',status:'partial'}]};
 m.completion(job,out,{loaded:false,reason:'source changed'});job.mediaKey='B';out.items[0].status='complete';const row=m.results().find(r=>r.id==='receipt-fixture');assert.equal(row.job.mediaKey,'A');assert.equal(row.outputs[0].status,'partial');assert.equal(row.loaded,false);assert(!JSON.stringify(row).includes('PRIVATE'));
});
require('node:test')('S04/S07 real action bridge checks source after approval and never plays after a failed restart seek',async()=>{
 const code=fs.readFileSync(require('path').join(__dirname,'../src/renderer/browser-work-inspector-ui.js'),'utf8');let handlers,confirm,attached=0;const commands=[];
 const tab={id:'a',generation:2,mediaKey:'A'},player={workspaceMode:'browser',browserActiveTabId:'a',mediaKey:'A',generation:1,browserTabs:[tab],browserTracks:[],cues:[],cues2:[]};
 let failSeek=false;const ctx={player,state:{},document:{addEventListener(){}},setInterval(){},currentGeneration:()=>player.generation,browserTabState:()=>tab,browserTransformForChannel:()=>({scale:2,offsetSeconds:.5}),browserSubtitleSync:{sourceToVideoTime:t=>2*t+.5},activateBrowserTabAndFocus:async()=>{},openAppDialog:()=>new Promise(r=>confirm=r),logLine(){},browserCommand:async(command)=>{commands.push(command);return {ok:!(failSeek&&command==='seek')};},attachCompletedJobSubtitles:async(event,job,options)=>{attached++;assert.equal(options.expectedOutputHashes['a.srt'],'a'.repeat(64));return {loaded:true};},window:{UiLocale:{get:()=> 'en'},BrowserWorkInspectorUI:{create:options=>{handlers=options;return {render(){}};}},api:{readSubtitle:async()=>({ok:true,sha256:'a'.repeat(64)})}}};
 vm.createContext(ctx);vm.runInContext(code.slice(code.indexOf("if (typeof window === 'object' && window.BrowserWorkInspectorUI")),ctx);
 const receipt={job:{browserTabId:'a',mediaKey:'A'},outputs:[{path:'a.srt',role:'source',status:'partial'}]};let run=handlers.openResult(receipt);await new Promise(setImmediate);player.mediaKey='B';confirm(true);await assert.rejects(run,/source or selection changed/);assert.equal(attached,0);
 player.mediaKey='A';run=handlers.openResult(receipt);await new Promise(setImmediate);confirm(true);await run;assert.equal(attached,1);
 receipt.outputs[0].receiptHash='b'.repeat(64);await assert.rejects(handlers.openResult(receipt),/changed after recording/);assert.equal(attached,1);
 const owner=handlers.snapshot().owner;failSeek=true;await handlers.resume(true,owner);assert.deepEqual(commands,['seek']);commands.length=0;failSeek=false;await handlers.resume(true,owner);assert.deepEqual(commands,['seek','play']);
});

require('node:test')('S07 actual catalog resume retains the end position without starting playback and rejects stale metadata',()=>{
 const code=fs.readFileSync(require('path').join(__dirname,'../src/renderer/player-source-catalog-integration.js'),'utf8');let offered=0,loaded;const player={mediaKey:'A',generation:1},video={duration:10,readyState:1,currentTime:5,addEventListener:(_,fn)=>loaded=fn};
 const ctx={player,document:{getElementById:()=>video},maybeOfferResume:()=>offered++};vm.createContext(ctx);vm.runInContext(code.slice(code.indexOf('function videoRate('),code.indexOf('let podcastPositionAt',code.indexOf('function videoRate('))),ctx);
 ctx.videoRate(1,9,{mediaKey:'A',generation:1});assert.equal(video.currentTime,0);assert.equal(player.resumeBoundary.position,9);assert.equal(offered,1);video.readyState=0;ctx.videoRate(1,8,{mediaKey:'A',generation:1});player.mediaKey='B';loaded();assert.equal(offered,1);
});

require('node:test')('S02/S06/S08 inspector separates partial output, two time maps and offline readable text',()=>{
 const {JSDOM}=require('jsdom'),dom=new JSDOM('<details id="browserWorkInspector" open><summary id="browserWorkInspectorLabel"></summary><div id="browserWorkTabs"></div><section id="browserWorkDetail"></section></details>');
 try{const tab={id:'a',mediaId:'A'},live={mediaKey:'A',cues:[{start:1,end:2,text:'Readable'}],cues2:[],browserDuration:10,browserTime:9,browserPaused:true};let opened=0,resumed=0;const value={tabs:[tab],tab,live,tracks:[],owner:'A',generation:1,offline:true,timing:[{channel:'1',scale:2,offset:.5,start:1,media:2.5},{channel:'2',scale:1,offset:-1,start:1,media:0}],results:[{id:'job',at:1,job:{mediaKey:'A'},outputs:[{role:'translation',status:'partial'}],loaded:false,reason:'source changed'}]};
 const view=require('../src/renderer/browser-work-inspector-ui').create({document:dom.window.document,model:require('../src/renderer/browser-work-inspector'),snapshot:()=>value,activate(){},retryMissing(){},retryChannel(){},openResult:()=>opened++,resume:()=>resumed++,en:()=>true,now:()=>0});view.render();let text=dom.window.document.body.textContent;assert.match(text,/2 × source seconds/);assert.match(text,/2.500/);assert.match(text,/partial/);assert.match(text,/not attached/);assert.match(text,/Browser reports offline/);assert.match(text,/text readable; audio\/seek unverified/);assert.equal(opened,0);assert.equal(resumed,0);
 const button=[...dom.window.document.querySelectorAll('button')].find(b=>b.textContent==='Return to source and review saved output');button.click();assert.equal(opened,1);value.tracks=[{id:'changed',sourceMismatch:true}];view.render();assert.match(dom.window.document.body.textContent,/alternative\/old revision/);
 }finally{dom.window.close();}
});
