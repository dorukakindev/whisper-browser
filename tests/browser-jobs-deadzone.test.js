'use strict';

// R334 ölü-bölge kilidi — iş/snapshot/uygulama yardımcıları (src/main.js):
// browserUnifiedJobsSnapshot, browserSplitSnapshot, browserSubtitlePreferences,
// createBrowserAcquisitionPlan, queue/flushBrowserPageApply,
// pageTranslationSectionProgress/Completion, pruneReplacedBrowserPageBlocks,
// browserPlayerResponsePruneSnapshot, pollBrowserTabAudioStates,
// rememberBrowserCompatibilityMode — sıfır test referanslı.

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const vm = require('vm');

const source = fs.readFileSync(path.join(__dirname, '..', 'src', 'main.js'), 'utf8');

function section(start, end) {
  const from = source.indexOf(start);
  const to = source.indexOf(end, from);
  assert(from >= 0 && to > from);
  return source.slice(from, to);
}

const j = (v) => JSON.stringify(v);

function makeCtx(userData, over = {}) {
  const calls = { events: [], writes: [], executed: [] };
  const ctx = vm.createContext(Object.assign({
    String, Number, Array, Set, Map, WeakMap, JSON, RegExp, Error, Promise, Buffer, URL,
    Math, Object, Date, console, process,
    require: (m) => require(m.startsWith('./') ? path.join(__dirname, '..', 'src', m.slice(2)) : m),
    setImmediate, setTimeout, clearTimeout,
    setTimeout_: setTimeout,
    path, fs,
    app: { getPath: (k) => k === 'userData' ? userData : `/tmp/${k}` },
    browserTabs: new Map(),
    browserTabById: (id) => ctx.browserTabs.get(id) || null,
    browserActiveTabId: '',
    browserSplitSecondaryTabId: '',
    browserSplitRatio: 0.5,
    browserNetworkOnline: true,
    browserPlayerResponseAdPruneEnabled: false,
    browserDebuggerReady: false,
    browserView: null,
    browserPlayerResponsePruneStats: {
      intercepted: 0, modified: 0, continued: 0, errors: 0,
      removedFields: new Set(), serviceWorkerExcluded: 0,
    },
    browserDownloads: { snapshot: () => ({ items: [] }) },
    browserHlsCeaFullCaptureJob: null,
    nextAcquisitionId: (k) => `${k}-1`,
    CaptionAcquisitionPlan: class {
      constructor(c) { Object.assign(this, c); this.c = c; }
      snapshot() { return { id: this.acquisitionId }; }
    },
    browserRecoveryJobsForTab: () => ctx.__recovery ?? [],
    browserTabSnapshot: (t) => ({ title: t?.restoredTitle || '' }),
    sendBrowserEvent: (tab, e) => calls.events.push({ tabId: tab?.id, e }),
    executeBrowserTrustedMain: async (view, script) => {
      calls.executed.push(script); return ctx.__execResult ?? [];
    },
    pageApplyScript: (o) => ({ __script: true, ...o }),
    pageTranslationJobIsCurrent: (tab, job) => ctx.__current !== false,
    browserPageExcludedIds: (s) => new Set([...(s?.excludedBlockIds || []), ...(s?.sectionExcludedBlockIds || [])]),
    readBrowserPlaces: () => ctx.__places ?? {},
    setBrowserPlaces: (p, o) => { calls.writes.push(p); ctx.__places = p; return ctx.__setOk !== false; },
    withBrowserCompatibilityHost: (hosts, url, on) => ctx.__compat(hosts, url, on),
    __compat: (h, u, on) => ({ ok: true, hosts: { [u]: on } }),
    __calls: calls,
  }, over));
  return { ctx, calls };
}

function evalAll(ctx) {
  vm.runInContext([
    'let browserSubtitlePreferenceStore = null;',
    section('function browserUnifiedJobsSnapshot(', 'function browserTabSnapshot('),
    section('function browserSplitSnapshot(', 'function persistBrowserSessionNow('),
    section('function browserSubtitlePreferences(', 'function restoreBrowserMediaSubtitlePreference('),
    section('function rememberBrowserCompatibilityMode(', 'function browserZoomForUrl('),
    section('function createBrowserAcquisitionPlan(', 'function freshBrowserDiagnostics('),
    section('function queueBrowserPageApply(', 'function pageTranslationSectionProgress('),
    section('function pageTranslationSectionProgress(', 'function persistBrowserPageTranslationArchive('),
    section('function pruneReplacedBrowserPageBlocks(', 'const MAX_AUTO_CONTINUE_SESSION_BLOCKS'),
    section('function browserPlayerResponsePruneSnapshot(', 'async function handleYoutubePlayerResponsePaused('),
    section('function pollBrowserTabAudioStates(', 'async function probeActiveBrowserMedia('),
    section('function browserPageExcludedIds(', 'function pageTranslationJobIsCurrent('),
  ].join('\n'), ctx);
}

function t_unified_jobs() {
  const { ctx } = makeCtx('/tmp/x');
  evalAll(ctx);
  const tab = { id: 't1', generation: 3, restoredTitle: 'Film', mangaJob: {}, mangaTranslated: 2, mangaAttempted: new Set([1, 2, 3]), mangaFailures: [] };
  ctx.browserTabs.set('t1', tab);
  let jobs = Array.from(vm.runInContext('browserUnifiedJobsSnapshot()', ctx));
  assert.strictEqual(jobs.length, 1);
  assert.strictEqual(jobs[0].kind, 'manga');
  assert.strictEqual(jobs[0].status, 'running');
  assert.strictEqual(jobs[0].completed, 2);
  assert.strictEqual(jobs[0].total, 3);
  // manga iptal → cancelled
  tab.mangaJob = { controller: { signal: { aborted: true } } };
  jobs = Array.from(vm.runInContext('browserUnifiedJobsSnapshot()', ctx));
  assert.strictEqual(jobs[0].status, 'cancelled');
  // altyazı çevirisi: online+scheduler → running
  tab.mangaJob = null;
  tab.translationScheduler = { recoverySummary: () => ({ completed: 4, total: 10, pending: 1 }) };
  jobs = Array.from(vm.runInContext('browserUnifiedJobsSnapshot()', ctx));
  assert.strictEqual(jobs[0].kind, 'subtitle-translation');
  assert.strictEqual(jobs[0].stage, 'Sağlayıcı yanıtı bekleniyor');
  // offline → status offline + aşama mesajı
  ctx.browserNetworkOnline = false;
  jobs = Array.from(vm.runInContext('browserUnifiedJobsSnapshot()', ctx));
  assert.strictEqual(jobs[0].status, 'offline');
  ctx.browserNetworkOnline = true;
  // sayfa çevirisi duraklatılmış → paused
  tab.translationScheduler = null;
  tab.pageTranslateJob = {};
  tab.pageTranslatePaused = true;
  tab.pageTranslateSession = { blocks: new Map([['b1', {}]]) };
  tab.pageTranslated = 0;
  tab.pageTranslateFailed = 0;
  jobs = Array.from(vm.runInContext('browserUnifiedJobsSnapshot()', ctx));
  assert.strictEqual(jobs[0].kind, 'page-translation');
  assert.strictEqual(jobs[0].status, 'paused');
  // downloads snapshot'ı katılır (completed/cancelled elenir)
  tab.pageTranslateJob = null;
  ctx.browserDownloads = { snapshot: () => ({ items: [
    { id: 'd1', title: 'f', active: true },
    { id: 'd2', state: 'completed' },
    { id: 'd3', state: 'interrupted', received: 5, total: 10 },
  ] }) };
  jobs = Array.from(vm.runInContext('browserUnifiedJobsSnapshot()', ctx));
  assert.strictEqual(j(jobs.map((x) => x.id)), j(['download:d1', 'download:d3']));
  assert.strictEqual(jobs[1].failed, 1);
  assert.strictEqual(jobs[1].actions[0], 'dismiss');
}

function t_split_snapshot() {
  const { ctx } = makeCtx('/tmp/x');
  evalAll(ctx);
  // ikincil yok → kapalı
  let s = vm.runInContext('browserSplitSnapshot()', ctx);
  assert.strictEqual(s.active, false);
  assert.strictEqual(s.secondaryTabId, '');
  assert.strictEqual(s.ratio, 0.5);
  // ikincil aktif sekme değilse → açık
  ctx.browserSplitSecondaryTabId = 't2';
  ctx.browserTabs.set('t2', { id: 't2' });
  ctx.browserActiveTabId = 't1';
  ctx.browserSplitRatio = 0.7;
  s = vm.runInContext('browserSplitSnapshot()', ctx);
  assert.strictEqual(s.active, true);
  assert.strictEqual(s.secondaryTabId, 't2');
  // ikincil = aktif sekme → yine kapalı (aktifleşince split kapanır)
  ctx.browserActiveTabId = 't2';
  s = vm.runInContext('browserSplitSnapshot()', ctx);
  assert.strictEqual(s.active, false);
  assert.strictEqual(s.secondaryTabId, '');
}

function t_subtitle_prefs_store() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'subprefs-'));
  const { ctx } = makeCtx(dir);
  evalAll(ctx);
  const fp = path.join(dir, 'browser-subtitle-preferences.json');
  fs.writeFileSync(fp, JSON.stringify({ x: 1 }));
  // store singleton döner; read okunur
  const st = vm.runInContext('browserSubtitlePreferences()', ctx);
  assert.ok(st);
  const again = vm.runInContext('browserSubtitlePreferences()', ctx);
  assert.strictEqual(st, again, 'singleton değil');
}

function t_acquisition_plan() {
  const { ctx } = makeCtx('/tmp/x');
  evalAll(ctx);
  // null tab → null
  assert.strictEqual(vm.runInContext('createBrowserAcquisitionPlan(null)', ctx), null);
  const tab = { mediaId: 'm1' };
  ctx.__tab = tab;
  const plan = vm.runInContext('createBrowserAcquisitionPlan(__tab)', ctx);
  assert.ok(plan);
  assert.strictEqual(tab.acquisitionId, 'caption-1');
  assert.strictEqual(tab.operationId, 'caption-1');
  const caps = plan.capabilities;
  for (const k of ['nativeTextTrack', 'networkCapture', 'manifestCapture', 'persistedTrack', 'manualTrack', 'liveAsr'])
    assert.strictEqual(caps[k], true, `eksik yetenek: ${k}`);
}

async function t_apply_queue() {
  const { ctx, calls } = makeCtx('/tmp/x');
  evalAll(ctx);
  const session = {
    mode: 'm', view: 'v', config: { targetLanguage: 'tr' }, memoryVersion: 1,
    translations: new Map([['b1', 'metin1'], ['b2', 'metin2']]),
    blocks: new Map([['b1', { section: 'S' }], ['b2', {}]]),
    excludedBlockIds: [],
    failures: new Map(),
  };
  const job = { applyQueue: [], applyChain: Promise.resolve(), applyTimer: null, session };
  const tab = { id: 't1' };
  ctx.__tab = tab; ctx.__job = job;
  // 20'den az → timer yolu, hemen flush yok
  ctx.__execResult = [{ layoutWarnings: [] }];
  vm.runInContext('queueBrowserPageApply(__tab, __job, {id:"b1",translation:"metin1"})', ctx);
  assert.strictEqual(job.applyQueue.length, 1);
  assert.ok(job.applyTimer !== null, '45ms timer kurulmadı');
  clearTimeout(job.applyTimer); job.applyTimer = null;
  // 20'ye ulaşınca anında flush
  vm.runInContext(`for (let i=0;i<19;i++) queueBrowserPageApply(__tab, __job, {id:'b'+i,translation:'t'+i})`, ctx);
  assert.strictEqual(job.applyQueue.length, 0, '20 kapasitesinde flush olmadı');
  await job.applyChain;
  assert.strictEqual(calls.executed.length, 1);
  // hariç tutulan + eskiyen çeviri süzülür
  calls.executed.length = 0;
  session.excludedBlockIds = ['b1'];
  session.translations.set('b1', 'BAŞKA'); // istemdeki 'metin1' eskidi
  vm.runInContext(`queueBrowserPageApply(__tab, __job, {id:'b1',translation:'metin1'});
                    queueBrowserPageApply(__tab, __job, {id:'b2',translation:'metin2'});
                    for(let i=0;i<18;i++) queueBrowserPageApply(__tab,__job,{id:'x'+i,translation:'z'});`, ctx);
  // dynamic x* not in translations → filtered
  await job.applyChain;
  const sent = calls.executed[0];
  assert.strictEqual(sent.translations.length, 1, 'hariç/eskiyen süzülmedi');
  assert.strictEqual(sent.translations[0].id, 'b2');
}

function t_progress_counts() {
  const { ctx } = makeCtx('/tmp/x');
  evalAll(ctx);
  const session = {
    blocks: new Map([['b1', { id: 'b1', section: 'A' }], ['b2', { id: 'b2', section: 'A' }], ['b3', { id: 'b3' }], ['b4', { id: 'b4', section: 'A' }]]),
    translations: new Map([['b1', 't']]),
    failures: new Map([['b3', 'e']]),
    excludedBlockIds: ['b4'],
    sectionExcludedBlockIds: [],
    translatedCharacters: 12, apiCharacters: 34,
    config: { pageCharacterBudget: 1000 },
  };
  ctx.__s = session;
  const prog = Array.from(vm.runInContext('pageTranslationSectionProgress(__s)', ctx));
  const a = prog.find((x) => x.section === 'A');
  assert.strictEqual(a.total, 3);
  assert.strictEqual(a.translated, 1);
  assert.strictEqual(a.excluded, 1);
  const gen = prog.find((x) => x.section === 'Genel');
  assert.strictEqual(gen.failed, 1);
  // completion
  const comp = vm.runInContext('pageTranslationCompletion(__s)', ctx);
  assert.strictEqual(comp.total, 4);
  assert.strictEqual(comp.translated, 1);
  assert.strictEqual(comp.failed, 1);
  assert.strictEqual(comp.excluded, 1);
  assert.strictEqual(comp.pending, 1);
  assert.strictEqual(comp.characters, 12);
  assert.strictEqual(vm.runInContext('browserPageTranslatedCount(__s)', ctx), 1);
  assert.strictEqual(vm.runInContext('browserPageFailedCount(__s)', ctx), 1);
  // budgetReached bayrağı
  session.deferredBlockIds = new Set(['x']);
  assert.strictEqual(vm.runInContext('pageTranslationCompletion(__s)', ctx).budgetReached, true);
  // boş session → sıfır
  const empty = vm.runInContext('pageTranslationCompletion(null)', ctx);
  assert.strictEqual(empty.total, 0);
}

function t_prune_blocks() {
  const { ctx } = makeCtx('/tmp/x');
  evalAll(ctx);
  const maps = ['blocks', 'translations', 'failures', 'deferredBlockIds',
    'layoutWarnings', 'excludedBlockIds', 'sectionExcludedBlockIds'];
  const session = {};
  for (const m of maps) session[m] = m.includes('Excluded') ? new Set(['k1']) : new Map([['k1', {}]]);
  session.blocks.set('k1', {}); session.blocks.set('k2', {});
  ctx.__s = session;
  vm.runInContext(`pruneReplacedBrowserPageBlocks(__s, ['k1',''])`, ctx);
  for (const m of maps) assert.strictEqual(session[m].has('k1'), false, `${m} temizlenmedi`);
  assert.strictEqual(session.blocks.has('k2'), true, 'başka blok silindi');
  // null replacedIds → no-op, çökme yok
  vm.runInContext('pruneReplacedBrowserPageBlocks(__s, null)', ctx);
  vm.runInContext('pruneReplacedBrowserPageBlocks(__s, "x")', ctx);
}

function t_prune_snapshot() {
  const { ctx } = makeCtx('/tmp/x');
  evalAll(ctx);
  let s = vm.runInContext('browserPlayerResponsePruneSnapshot()', ctx);
  assert.strictEqual(s.ok, true);
  assert.strictEqual(s.active, false);
  assert.strictEqual(s.intercepted, 0);
  // hepsi sağlanınca active
  ctx.browserPlayerResponseAdPruneEnabled = true;
  ctx.browserDebuggerReady = true;
  ctx.browserView = { webContents: { isDestroyed: () => false, debugger: { isAttached: () => true } } };
  ctx.browserPlayerResponsePruneStats.removedFields.add('adBreaks');
  s = vm.runInContext('browserPlayerResponsePruneSnapshot({extra:1})', ctx);
  assert.strictEqual(s.active, true);
  assert.strictEqual(j(s.removedFields), j(['adBreaks']));
  assert.strictEqual(s.extra, 1);
  // debugger detached → inactive
  ctx.browserView.webContents.debugger.isAttached = () => false;
  s = vm.runInContext('browserPlayerResponsePruneSnapshot()', ctx);
  assert.strictEqual(s.active, false);
}

function t_audio_poll() {
  const { ctx, calls } = makeCtx('/tmp/x');
  evalAll(ctx);
  const mk = (aud, mut) => ({ isDestroyed: () => false, isCurrentlyAudible: () => aud, isAudioMuted: () => mut });
  ctx.browserTabs.set('a', { id: 'a', view: { webContents: mk(true, false) }, audible: false, tabMuted: false });
  ctx.browserTabs.set('b', { id: 'b', view: { webContents: mk(false, false) }, audible: false, tabMuted: false });
  ctx.browserTabs.set('c', { id: 'c', view: { webContents: { isDestroyed: () => true } } });
  vm.runInContext('pollBrowserTabAudioStates()', ctx);
  assert.strictEqual(calls.events.length, 1, 'yalnız değişen sekme olay üretmeli');
  assert.strictEqual(calls.events[0].tabId, 'a');
  assert.strictEqual(calls.events[0].e.audible, true);
  // ikinci poll → değişim yok → olay yok
  vm.runInContext('pollBrowserTabAudioStates()', ctx);
  assert.strictEqual(calls.events.length, 1);
  // ses kesilince yeni olay
  ctx.browserTabs.get('a').view.webContents = mk(false, true);
  vm.runInContext('pollBrowserTabAudioStates()', ctx);
  assert.strictEqual(calls.events.length, 2);
  assert.strictEqual(calls.events[1].e.tabMuted, true);
}

function t_compat_remember() {
  const { ctx, calls } = makeCtx('/tmp/x');
  evalAll(ctx);
  ctx.__compat = (h, u, on) => ({ ok: true, hosts: { 'a.b': on } });
  assert.strictEqual(vm.runInContext('rememberBrowserCompatibilityMode("https://a.b/", true).ok', ctx), true);
  assert.strictEqual(ctx.__places.compatibilityHosts['a.b'], true);
  assert.strictEqual(calls.writes.length, 1);
  // helper hata → yazım yok
  ctx.__compat = () => ({ ok: false, error: 'bozuk' });
  const r = vm.runInContext('rememberBrowserCompatibilityMode("https://a.b/", true)', ctx);
  assert.strictEqual(r.ok, false);
  assert.strictEqual(calls.writes.length, 1, 'hatalı güncelleme diske yazıldı');
}

async function main() {
  t_unified_jobs();
  t_split_snapshot();
  t_subtitle_prefs_store();
  t_acquisition_plan();
  await t_apply_queue();
  t_progress_counts();
  t_prune_blocks();
  t_prune_snapshot();
  t_audio_poll();
  t_compat_remember();
  console.log('browser-jobs-deadzone: 10 senaryo geçti');
}

main().catch((e) => { console.error(e); process.exit(1); });
