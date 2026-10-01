'use strict';

// R334 ölü-bölge kilidi — arama/kuyruk/manga yardımcı kümesi (src/main.js):
// foldWatchSearchText, searchUnifiedBrowserLibrary, browserTabIpcFrequency,
// supportedMangaDataUrl, fatalMangaBatchError, nearestMangaRegion,
// normalizeBrowserCaptureReceipts, releaseQueueTerminalGuards —
// sıfır test referanslı. Sözleşmeler:
//   - foldWatchSearchText: NFKC + tr-TR küçültme (İ→i, Türkçe I davranışı)
//   - searchUnified: scope=all|subtitles|notes|pages; not deposu bozuksa
//     index'e düşer; limit [1,300] kelepçe; boş sorgu scope!=notes → []
//   - ipcFrequency: 60 sn pencere + 1200 kap + yerinde budama
//   - supportedMangaDataUrl: virgül yok → ret; base64 kapasitesi; katı regex
//   - fatalMangaBatchError: download→false; 401/403/404→true;
//     400+görsel-bozuk-mesajı→false; diğer→false
//   - nearestMangaRegion: centroid uzaklık; bubbleBox>box önceliği;
//     bozuk hedef → ilk
//   - normalizeReceipts: string zorlama + iki kimlik zorunlu
//   - releaseQueueTerminalGuards: canlı-kimlik budama + yalnız snapshot'ta
//     da done/error onaylıysa serbest

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const source = fs.readFileSync(path.join(__dirname, '..', 'src', 'main.js'), 'utf8');

function section(start, end) {
  const from = source.indexOf(start);
  const to = source.indexOf(end, from);
  assert(from >= 0 && to > from);
  return source.slice(from, to);
}

function makeCtx(over = {}) {
  const calls = { unified: [] };
  const ctx = vm.createContext(Object.assign({
    String, Number, Array, Set, Map, WeakMap, JSON, RegExp, Error, Promise, Buffer, URL,
    Math, Object, Date, console, process,
    setImmediate, setTimeout, clearTimeout,
    watchIndex: () => ctx.__index,
    ensureBrowserNotesReady: () => ctx.__notesStore ?? {},
    annotationFromIndexRow: (r) => ({ fromIndex: true, row: r }),
    unifiedLibrarySearch: (a) => { calls.unified.push(a); return a; },
    browserTabsSnapshot: () => [],
    browserPlacesSnapshot: () => ({ bookmarks: [] }),
    loadWatchLibrary: () => [],
    MAX_MANGA_IMAGE_BASE64_CHARS: 1000,
    queueTerminalGuards: new Set(),
    __calls: calls,
  }, over));
  return { ctx, calls };
}

function evalAll(ctx) {
  vm.runInContext([
    section('function foldWatchSearchText(', 'async function searchWatchLibrary('),
    section('function searchUnifiedBrowserLibrary(', 'function saveWatchLibraryCollectionMutation('),
    section('function browserTabIpcFrequency(', 'function requestBrowserPageResourceMetrics('),
    section('function supportedMangaDataUrl(', 'async function fetchMangaImageSource('),
    section('function fatalMangaBatchError(', 'async function translateMangaCandidate('),
    section('function nearestMangaRegion(', 'function applyMangaEditFromPage('),
    section('function normalizeBrowserCaptureReceipts(', 'async function drainBrowserCaptureBeforeClose('),
    section('function releaseQueueTerminalGuards(', '// Tema değişince'),
  ].join('\n'), ctx);
}

function t_fold() {
  const { ctx } = makeCtx();
  evalAll(ctx);
  const f = (v) => { ctx.__v = v; return vm.runInContext('foldWatchSearchText(__v)', ctx); };
  // Türkçe İ → i (tr-TR locale davranışı)
  assert.strictEqual(f('İSTANBUL'), 'istanbul');
  assert.strictEqual(f('TITLE'), 't\u0131tle', 'tr-TR: I→ı');
  // NFKC: ligatür/uyumluluk
  assert.strictEqual(f('ﬁlm'), 'film');
  assert.strictEqual(f(null), '');
  assert.strictEqual(f('  '), '  ', 'fold trim yapmaz — trim çağıranın işi');
}

function t_unified_search() {
  const { ctx, calls } = makeCtx();
  evalAll(ctx);
  ctx.__index = {
    searchCues: (q, l) => [{ cue: 1 }],
    searchAnnotations: (q, l) => [{ note: 1 }],
    listAllAnnotations: (l) => [{ note: 2 }],
    searchPages: (q, l) => [{ page: 1 }],
  };
  ctx.__notesStore = { search: () => ['store-note'], list: () => ['l1'] };
  const s = (r) => { ctx.__r = r; return vm.runInContext('searchUnifiedBrowserLibrary(__r)', ctx); };
  // boş sorgu + all → []
  assert.strictEqual(s('').length, 0);
  // all → üç kaynak
  let r = s('merhaba');
  assert.strictEqual(JSON.stringify(r.cueHits), JSON.stringify([{ cue: 1 }]));
  assert.strictEqual(r.notes[0], 'store-note');
  assert.strictEqual(JSON.stringify(r.pageHits), JSON.stringify([{ page: 1 }]));
  // scope=subtitles → yalnız cue
  calls.unified = [];
  s({ query: 'x', scope: 'subtitles' });
  const last = calls.unified.at(-1);
  assert.strictEqual(last.notes.length, 0);
  assert.strictEqual(last.pageHits.length, 0);
  // not deposu bozuk → index'e düşer
  ctx.__notesStore = { loadError: 'bozuk' };
  r = s({ query: 'x', scope: 'notes' });
  assert.strictEqual(r.notes[0].fromIndex, true, 'bozuk depo index yedeğine düşmedi');
  // boş sorgu + notes → listAllAnnotations
  r = s({ query: '', scope: 'notes' });
  assert.strictEqual(r.notes[0].row.note, 2);
  // limit kelepçe
  calls.unified = [];
  s({ query: 'x', limit: 99999 });
  assert.strictEqual(calls.unified.at(-1).limit, 300);
  s({ query: 'x', limit: -5 });
  assert.strictEqual(calls.unified.at(-1).limit, 1);
}

function t_ipc_frequency() {
  const { ctx } = makeCtx();
  evalAll(ctx);
  const tab = { resourceIpcTimestamps: [1, 2, 3] };
  ctx.__tab = tab;
  const now = Date.now();
  tab.resourceIpcTimestamps = [now - 120_000, now - 30_000, now, now - 61_000];
  ctx.__now = now;
  const f = vm.runInContext('browserTabIpcFrequency(__tab, __now)', ctx);
  assert.strictEqual(f, 2, '60sn pencere süzülmedi');
  // 1200 kap + yerinde budama
  tab.resourceIpcTimestamps = Array.from({ length: 1500 }, () => now);
  const f2 = vm.runInContext('browserTabIpcFrequency(__tab, __now)', ctx);
  assert.strictEqual(f2, 1200, '1200 kap aşıldı');
  assert.strictEqual(tab.resourceIpcTimestamps.length, 1200, 'yerinde budanmadı');
  assert.strictEqual(vm.runInContext('browserTabIpcFrequency(null)', ctx), 0);
}

function t_manga_data_url() {
  const { ctx } = makeCtx();
  evalAll(ctx);
  const ok = (u) => { ctx.__u = u; return vm.runInContext('supportedMangaDataUrl(__u)', ctx); };
  assert.strictEqual(ok('data:image/png;base64,aGk='), true);
  assert.strictEqual(ok('data:image/svg+xml;base64,aGk='), false, 'svg reddedilmeli');
  assert.strictEqual(ok('data:image/png;base64,' + 'a'.repeat(1001)), false, 'kapasite aşımı (base64 >1000)');
  assert.strictEqual(ok('data:image/png;base64,' + 'a'.repeat(1000)), true, 'sınır tam');
  assert.strictEqual(ok('notadataurl'), false);
  assert.strictEqual(ok('data:image/png;base64,!!!'), false, 'bozuk karakter');
  assert.strictEqual(ok(null), false);
}

function t_fatal_batch() {
  const { ctx } = makeCtx();
  evalAll(ctx);
  const f = (e) => { ctx.__e = e; return vm.runInContext('fatalMangaBatchError(__e)', ctx); };
  assert.strictEqual(f({ mangaImageDownload: true, httpStatus: 403 }), false, 'indirme hatası fatal sayıldı');
  assert.strictEqual(f({ httpStatus: 401 }), true);
  assert.strictEqual(f({ httpStatus: 403 }), true);
  assert.strictEqual(f({ httpStatus: 404 }), true);
  assert.strictEqual(f({ httpStatus: 400, message: 'invalid image format provided' }), false, 'bozuk görsel 400 fatal değil');
  assert.strictEqual(f({ httpStatus: 400, message: 'base64 decode failed for image' }), false);
  assert.strictEqual(f({ httpStatus: 400, message: 'quota exceeded' }), true, 'görsel-dışı 400 fatal');
  assert.strictEqual(f({ httpStatus: 500 }), false);
  assert.strictEqual(f({}), false);
}

function t_nearest_region() {
  const { ctx } = makeCtx();
  evalAll(ctx);
  const n = (regions, box) => { ctx.__re = regions; ctx.__bx = box;
    return vm.runInContext('nearestMangaRegion(__re, __bx)', ctx); };
  const regions = [
    { id: 'far', bubbleBox: [800, 800, 900, 900] },
    { id: 'near', box: [10, 10, 30, 30] },
    { id: 'mid', bubbleBox: [100, 100, 200, 200] },
  ];
  // hedef merkeze yakın olan kazanır (bubbleBox > box önceliği)
  assert.strictEqual(n(regions, [0, 0, 40, 40]).id, 'near');
  assert.strictEqual(n(regions, [90, 90, 210, 210]).id, 'mid');
  assert.strictEqual(n(regions, [790, 790, 910, 910]).id, 'far');
  // bozuk hedef → ilk bölge
  assert.strictEqual(n(regions, null).id, 'far');
  assert.strictEqual(n(regions, [1, 2]).id, 'far');
  // boş liste → null
  assert.strictEqual(n([], [0, 0, 1, 1]), null);
}

function t_receipts() {
  const { ctx } = makeCtx();
  evalAll(ctx);
  const n = (r) => { ctx.__r = r; return Array.from(vm.runInContext('normalizeBrowserCaptureReceipts(__r)', ctx)); };
  assert.strictEqual(n(null).length, 0);
  assert.strictEqual(n('x').length, 0);
  const out = n([
    { captureId: 'c1', deliveryId: 'd1' },
    { captureId: 'c2' },
    { deliveryId: 'd3' },
    { captureId: 5, deliveryId: 6 },
    'junk',
  ]);
  assert.strictEqual(JSON.stringify(out.map((x) => [x.captureId, x.deliveryId])),
    JSON.stringify([['c1', 'd1'], ['5', '6']]), 'eksik kimlikli kayıtlar süzülmedi');
}

function t_terminal_guards() {
  const { ctx } = makeCtx();
  evalAll(ctx);
  ctx.queueTerminalGuards = new Set([1, 2, 3, 4]);
  const rel = (merged, snap) => {
    ctx.__m = merged; ctx.__s = snap;
    vm.runInContext('releaseQueueTerminalGuards(__m, __s)', ctx);
    return Array.from(ctx.queueTerminalGuards).sort();
  };
  const eq = (a, b) => assert.strictEqual(JSON.stringify(a), JSON.stringify(b));
  // canlı olmayan kimlik budanır (3,4); 2 done+error → iki taraf da terminal → serbest
  eq(rel([{ id: 1, status: 'running' }, { id: 2, status: 'done' }],
    [{ id: 2, status: 'error' }]), [1]);
  // done+snapshot'ta da done → serbest
  eq(rel([{ id: 1, status: 'running' }, { id: 2, status: 'done' }],
    [{ id: 2, status: 'done' }]), [1]);
  // done ama snapshot'ta running → bekçi kalır
  ctx.queueTerminalGuards = new Set([2]);
  eq(rel([{ id: 2, status: 'done' }], [{ id: 2, status: 'running' }]), [2]);
  // snapshot yok → kalır
  eq(rel([{ id: 2, status: 'done' }], null), [2]);
}

async function main() {
  t_fold();
  t_unified_search();
  t_ipc_frequency();
  t_manga_data_url();
  t_fatal_batch();
  t_nearest_region();
  t_receipts();
  t_terminal_guards();
  console.log('misc-pipeline-deadzone: 8 senaryo geçti');
}

main().catch((e) => { console.error(e); process.exit(1); });
