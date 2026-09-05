const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const contract = require('../src/subtitle-output-contract');

const onlyTranslation = {
  files: ['C:\\out\\film.tr.srt'],
  outputs: [{ path: 'C:\\out\\film.tr.srt', role: 'translation', language: 'tr',
    sourceId: 'video-1', sourceHash: 'hash-1', status: 'complete', total: 2, completed: 2, failed: 0 }],
};
let selected = contract.selectOutputs(onlyTranslation);
assert.equal(selected.source, null, 'yalnız .tr.srt kaynak sanıldı');
assert.equal(selected.translation.path, 'C:\\out\\film.tr.srt');

selected = contract.selectOutputs({ outputs: [
  { path: 'C:\\out\\film.en.srt', role: 'source', language: 'en', sourceId: 'same' },
  { path: 'C:\\out\\film.tr.srt', role: 'translation', language: 'tr', sourceId: 'same',
    status: 'partial', total: 100, completed: 87, failed: 13 },
] });
assert.equal(selected.source.role, 'source');
assert.equal(selected.translation.role, 'translation');
assert.match(contract.outputLabel(selected.translation), /87\/100 hazır/);
assert.match(contract.outputLabel({ ...selected.translation, lastError: 'rate_limit' }), /hız sınırı/);

selected = contract.selectOutputs({ files: ['C:\\out\\legacy.tr.srt'] }, { fallbackRole: 'translation' });
assert.equal(selected.translation.path, 'C:\\out\\legacy.tr.srt');
assert.equal(selected.source, null, 'legacy çeviri aynı anda kaynak yapıldı');

selected = contract.selectOutputs({ outputs: [
  { path: 'C:\\out\\a.srt', role: 'source', sourceId: 'a' },
  { path: 'C:\\out\\b.srt', role: 'translation', sourceId: 'b' },
] });
assert.equal(selected.translation, null, 'başka kaynağın çevirisi eşleştirildi');

// Renderer'daki gerçek bağlama fonksiyonunu kontrollü DOM/dosya taklitleriyle
// çalıştır. Bu, yalnız kaynak metinde fonksiyon adı arayan bir sözleşme testi değildir.
const renderer = fs.readFileSync(path.join(__dirname, '../src/renderer/renderer.js'), 'utf8');
const controls = {
  playerSubSelect: { value: '' }, playerSubSelect2: { value: '' },
};
const calls = [];
const ctx = {
  subtitleOutputContract: contract,
  state: { activeOutputJob: null, pendingPlayerLoad: null },
  player: { mediaKey: 'youtube:abc123', generation: 4, cues: [], cues2: [],
    subPath: '', sub2Path: '', subRole: 'source', sub2Role: 'translation',
    subtitles: [], translationRetryAvailable: 0 },
  $: (id) => controls[id] || null,
  currentGeneration() { return ctx.player.generation; },
  staleGeneration(gen) { return gen !== ctx.player.generation; },
  completedSubtitleOutputs: undefined,
  addSubtitleOption(path, label, metadata) {
    ctx.player.subtitles.push({ path, label, ...metadata });
  },
  async loadSubtitle(file, secondary, options) {
    calls.push({ file, secondary, role: options.role });
    if (ctx.failLoad) return;
    if (secondary) {
      ctx.player.sub2Path = file; ctx.player.sub2Role = options.role; ctx.player.cues2 = [{ text: 'çeviri' }];
    } else {
      ctx.player.subPath = file; ctx.player.subRole = options.role; ctx.player.cues = [{ text: 'çeviri' }];
    }
  },
  setSubtitleMode(mode) { ctx.mode = mode; },
  flushWatchState() {}, logLine() {}, updatePlayerTaskCenter() {},
};
vm.createContext(ctx);
const start = renderer.indexOf('function completedSubtitleOutputs(');
const end = renderer.indexOf('window.api.onEvent(', start);
assert(start >= 0 && end > start, 'çıktı bağlama fonksiyonları bulunamadı');
vm.runInContext(renderer.slice(start, end), ctx);

(async () => {
  const job = { mediaKey: 'youtube:abc123', selectedSubPath: '', secondSubPath: '' };
  const result = await ctx.attachCompletedJobSubtitles(onlyTranslation, job);
  assert.equal(result.loaded, true);
  assert.deepEqual(calls, [{ file: 'C:\\out\\film.tr.srt', secondary: false, role: 'translation' }]);
  assert.equal(ctx.player.subRole, 'translation');
  assert.equal(ctx.mode, 'translation');

  calls.length = 0;
  ctx.player.subPath = ''; ctx.player.sub2Path = ''; ctx.player.cues = []; ctx.player.cues2 = [];
  const pair = { outputs: [
    { path: 'C:\\out\\film.en.srt', role: 'source', language: 'en', sourceId: 'one' },
    { path: 'C:\\out\\film.tr.srt', role: 'translation', language: 'tr', sourceId: 'one' },
  ] };
  await ctx.attachCompletedJobSubtitles(pair, job);
  assert.deepEqual(calls.map((call) => [call.secondary, call.role]),
    [[false, 'source'], [true, 'translation']]);

  calls.length = 0;
  ctx.player.mediaKey = 'youtube:other';
  const stale = await ctx.attachCompletedJobSubtitles(onlyTranslation, job);
  assert.equal(stale.loaded, false);
  assert.equal(calls.length, 0, 'geciken sonuç başka videoya yüklendi');

  ctx.player.mediaKey = 'youtube:abc123';
  ctx.player.subPath = 'C:\\manual\\selected.srt';
  ctx.player.sub2Path = '';
  ctx.player.cues = [{ text: 'elle seçilen' }];
  ctx.player.cues2 = [];
  const changed = await ctx.attachCompletedJobSubtitles(onlyTranslation, job);
  assert.equal(changed.loaded, false);
  assert.equal(changed.reason, 'Altyazı seçimi değişti.');
  assert.match(ctx.state.pendingPlayerLoad.reason, /seçimi işlem sırasında değişti/);

  calls.length = 0;
  ctx.failLoad = true;
  const currentJob = { mediaKey: ctx.player.mediaKey,
    selectedSubPath: ctx.player.subPath, secondSubPath: ctx.player.sub2Path };
  const failedLoad = await ctx.attachCompletedJobSubtitles(onlyTranslation, currentJob);
  assert.equal(failedLoad.loaded, false);
  assert.match(ctx.state.pendingPlayerLoad.reason, /Dosya kaydedildi ancak oynatıcıya yüklenemedi/);
  assert.equal(calls.length, 1, 'yükleme hatası gerçek loadSubtitle çağrısıyla sınanmadı');

  function extractFunction(name) {
    let fnStart = renderer.indexOf(`function ${name}(`);
    assert(fnStart >= 0, `${name} bulunamadı`);
    if (renderer.slice(Math.max(0, fnStart - 6), fnStart) === 'async ') fnStart -= 6;
    const braceStart = renderer.indexOf('{', fnStart);
    let depth = 0;
    for (let index = braceStart; index < renderer.length; index++) {
      if (renderer[index] === '{') depth++;
      else if (renderer[index] === '}' && --depth === 0) return renderer.slice(fnStart, index + 1);
    }
    throw new Error(`${name} kapanışı bulunamadı`);
  }

  const taskCtx = {
    player: { job: { running: true, kind: 'translate', stage: 'Çevriliyor · 40/100' },
      browserTranslationTrackId: '', browserMangaBusy: false, browserPageTranslateBusy: false,
      pdfReader: null },
    state: { running: true, activeOutputJob: null, pendingPlayerLoad: null },
    browserTabState: () => null,
    retryPendingPlayerLoad() {},
    $: () => null,
  };
  vm.createContext(taskCtx);
  vm.runInContext(extractFunction('playerTaskSnapshot'), taskCtx);
  assert.equal(taskCtx.playerTaskSnapshot()[0].detail, 'Çevriliyor · 40/100');
  taskCtx.player.job = null;
  taskCtx.state.running = false;
  assert.equal(taskCtx.playerTaskSnapshot().length, 0, 'bitmiş iş aktif rozetinde kaldı');

  const prefsCtx = {
    player: { workspaceMode: 'local', subPath: 'C:\\out\\film.tr.srt', sub2Path: 'C:\\out\\film.en.srt',
      subRole: 'translation', sub2Role: 'source', viewMode: 'default', offset: 0,
      autoPause: false, playbackPolicy: 'normal', autoFollow: true, mergeCont: false,
      subStyle: null, subBottom: 7, sub2Top: 7 },
    $: () => null,
  };
  vm.createContext(prefsCtx);
  vm.runInContext(extractFunction('captureWatchPrefs'), prefsCtx);
  const prefs = prefsCtx.captureWatchPrefs();
  assert.equal(prefs.selectedSubRole, 'translation');
  assert.equal(prefs.secondSubRole, 'source');

  const restored = [];
  const restoreControls = { playerSubSelect: { value: '' }, playerSubSelect2: { value: '' } };
  const restoreCtx = {
    player: { mediaKey: 'youtube:abc123', workspaceMode: 'local', browserMuted: false },
    window: { api: {} },
    currentGeneration: () => 9,
    staleGeneration: () => false,
    watchItemByKey: () => ({ prefs }),
    $: (id) => restoreControls[id] || null,
    syncPlayerSpeedControl() {}, syncVolumeFill() {}, setViewMode() {},
    applySubtitleStyle() {}, applySubtitlePos() {}, browserCommand: async () => {},
    SUB_STYLE_DEFAULTS: {},
    addSubtitleOption(file, _label, metadata) { restored.push(['option', file, metadata.role]); },
    async loadSubtitle(file, secondary, options) {
      restored.push(['load', file, secondary, options.role]);
    },
  };
  vm.createContext(restoreCtx);
  vm.runInContext(extractFunction('restoreWatchProfile'), restoreCtx);
  await restoreCtx.restoreWatchProfile('youtube:abc123');
  assert.deepEqual(restored.filter((row) => row[0] === 'load'), [
    ['load', 'C:\\out\\film.tr.srt', false, 'translation'],
    ['load', 'C:\\out\\film.en.srt', true, 'source'],
  ], 'uygulama yeniden açıldığında kaynak/çeviri rolleri geri yüklenmedi');

  console.log('Subtitle output contract: roles, partial state, stale jobs, load recovery and task lifecycle passed.');
})().catch((error) => { console.error(error); process.exitCode = 1; });
