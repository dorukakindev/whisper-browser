'use strict';

// R334 ölü-bölge kilidi — kalıcılık/yazım yardımcıları (src/main.js):
// saveHistory (.bak rotasyonu + mirrorBackup + limit), download kayıtları
// (>4MB/bozuk→[]), annotationFromIndexRow, ensureIndexMediaForAnnotation,
// site-terminology seed/persist, saveBrowserPageToReadingList,
// saveBrowserPagePdf, collectBrowserSessionVariants — sıfır test referanslı.

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
  const calls = { atomic: [], bufAtomic: [], dlg: [], savePage: [], pdf: [], placeSet: [] };
  const ctx = vm.createContext(Object.assign({
    String, Number, Array, Set, Map, JSON, RegExp, Error, Promise, Buffer, URL,
    Math, Object, Date, console, process,
    path, fs,
    pathToFileURL: (p) => new URL(`file://${p}`),
    app: { getPath: (k) => k === 'userData' ? userData : `/tmp/${k}` },
    mainWindow: {},
    BROWSER_DOWNLOADS_FILE: 'indirmeler.json',
    writeJsonAtomic: (t, o) => { calls.atomic.push({ t, o }); fs.writeFileSync(t, JSON.stringify(o)); },
    writeBufferAtomic: (t, b) => { calls.bufAtomic.push({ t, b }); fs.writeFileSync(t, b); },
    dialog: { showSaveDialog: async () => ctx.__dlg },
    dt: (tr, en) => en,
    browserExportTitle: () => 'sayfa-baslik',
    normalizeAnnotation: (a) => ({ ...a, __normalized: true }),
    loadWatchLibrary: () => ctx.__watchLib ?? [],
    watchIndex: () => ctx.__index ?? null,
    browserAssetStore: () => ctx.__assetStore,
    BrowserReadingList: class {
      constructor(p) { this.p = p; }
      commit(e) { return ctx.__commitResult ?? { ok: true, entry: e }; }
    },
    browserReadingList: () => ctx.__reading ?? (ctx.__reading = new ctx.BrowserReadingList(path.join(userData, 'OkumaListesi'))),
    BrowserNoteStore: class { constructor(p) { this.p = p; } },
    browserNoteStoreInstance: null,
    siteTerminologyScope: (url, lang) => ('__scope' in ctx ? ctx.__scope : 'scope-x'),
    browserPageUrl: (tab) => tab?.url || '',
    seedSiteTerminology: (map, existing) => { ctx.__seedArgs = { map, existing }; return ctx.__seedRet ?? 0; },
    browserPageTerminologySuggestions: (s) => ctx.__termRows ?? [],
    readBrowserPlaces: () => ctx.__places ?? {},
    setBrowserPlaces: (p, o) => { calls.placeSet.push({ p, o }); ctx.__places = p; return ctx.__setPlacesOk !== false; },
    __calls: calls,
  }, over));
  return { ctx, calls };
}

function evalAll(ctx) {
  vm.runInContext([
    section('const HISTORY_LIMIT = 300', 'function addHistory('),
    section('function saveHistory(', 'function addHistory('),
    section('function browserNoteStorePath(', 'function ensureIndexMediaForAnnotation('),
    section('function ensureIndexMediaForAnnotation(', 'function ensureBrowserNotesReady('),
    'let browserReadingListInstance = null;',
    section('function browserReadingList(', 'let browserElementRulesInstance'),
    section('function browserDownloadsPath(', 'function safeBrowserPlaceUrl('),
    section('function seedBrowserPageSiteTerminology(', 'function browserPageExcludedIds('),
    section('async function saveBrowserPageToReadingList(', "ipcMain.handle('browser:readingList:add'"),
    section('async function saveBrowserPagePdf(', "ipcMain.handle('browser:exportPagePdf'"),
    section('function collectBrowserSessionVariants(', 'function importBrowserSessionVariants('),
  ].join('\n'), ctx);
}

async function t_history(userData) {
  const { ctx, calls } = makeCtx(userData);
  evalAll(ctx);
  const hp = path.join(userData, 'history.json');
  // ilk yazım — .bak'a gerek yok
  let ok = vm.runInContext('saveHistory([{a:1}])', ctx);
  assert.strictEqual(ok, true);
  assert.strictEqual(fs.existsSync(`${hp}.bak`), false, 'ilk yazımda .bak üretilmedi');
  // ikinci yazım — eski içerik .bak'a
  ok = vm.runInContext('saveHistory([{a:2}])', ctx);
  assert.strictEqual(JSON.parse(fs.readFileSync(`${hp}.bak`, 'utf8'))[0].a, 1);
  assert.strictEqual(JSON.parse(fs.readFileSync(hp, 'utf8'))[0].a, 2);
  // limit budama (kaynak sabiti HISTORY_LIMIT=300)
  ctx.__big = Array.from({ length: 305 }, (_, i) => ({ n: i }));
  ok = vm.runInContext('saveHistory(__big)', ctx);
  assert.strictEqual(JSON.parse(fs.readFileSync(hp, 'utf8')).length, 300);
  // mirrorBackup: güncel liste .bak'a; ana dosya da yazılır
  calls.atomic.length = 0;
  ok = vm.runInContext('saveHistory([{m:1}], {mirrorBackup:true})', ctx);
  assert.strictEqual(calls.atomic[0].t, `${hp}.bak`, 'ayna önce .bak\'a yazılmalı');
  // throw → false
  const { ctx: c2 } = makeCtx(userData, { writeJsonAtomic: () => { throw new Error('disk'); } });
  evalAll(c2);
  assert.strictEqual(vm.runInContext('saveHistory([{x:1}])', c2), false);
}

function t_download_records(userData) {
  const { ctx } = makeCtx(userData);
  evalAll(ctx);
  const dp = path.join(userData, 'indirmeler.json');
  // dosya yok → []
  assert.strictEqual(vm.runInContext('readBrowserDownloadRecords()', ctx).length, 0);
  // dizin → []
  fs.mkdirSync(dp);
  assert.strictEqual(vm.runInContext('readBrowserDownloadRecords()', ctx).length, 0);
  fs.rmdirSync(dp);
  // >4MB → []
  fs.writeFileSync(dp, ' '.repeat(4 * 1024 * 1024 + 10));
  assert.strictEqual(vm.runInContext('readBrowserDownloadRecords()', ctx).length, 0);
  // bozuk → []
  fs.writeFileSync(dp, '{{{');
  assert.strictEqual(vm.runInContext('readBrowserDownloadRecords()', ctx).length, 0);
  // items dizi değil → []
  fs.writeFileSync(dp, JSON.stringify({ items: 'x' }));
  assert.strictEqual(vm.runInContext('readBrowserDownloadRecords()', ctx).length, 0);
  // write: son 100 + version zarfı
  ctx.__items = Array.from({ length: 150 }, (_, i) => ({ id: i }));
  vm.runInContext('writeBrowserDownloadRecords(__items)', ctx);
  const written = JSON.parse(fs.readFileSync(dp, 'utf8'));
  assert.strictEqual(written.version, 1);
  assert.strictEqual(written.items.length, 100);
  assert.strictEqual(written.items[0].id, 50, 'son 100 tutulmadı');
  // oku-yaz roundtrip
  ctx.__items = null;
  vm.runInContext('writeBrowserDownloadRecords(__items)', ctx);
  assert.strictEqual(JSON.parse(fs.readFileSync(dp, 'utf8')).items.length, 0);
}

function t_annotation(userData) {
  const { ctx } = makeCtx(userData);
  evalAll(ctx);
  // anchor_json bozuk → anchor null, normalizeAnnotation çağrılır
  ctx.__row = { id: 'a1', anchor_json: '{{{', created_at: 5 };
  let out = vm.runInContext('annotationFromIndexRow(__row)', ctx);
  assert.strictEqual(out.__normalized, true);
  assert.strictEqual(out.anchor, null);
  // geçerli anchor
  ctx.__row = { id: 'a2', anchor_json: '{"x":1}', media_id: 'm9' };
  out = vm.runInContext('annotationFromIndexRow(__row)', ctx);
  assert.strictEqual(j(out.anchor), '{"x":1}');
  assert.strictEqual(out.mediaId, 'm9');
}

function t_index_media(userData) {
  const { ctx } = makeCtx(userData);
  evalAll(ctx);
  const upserts = [];
  ctx.__index = {
    getMedia: (id) => (id === 'var' ? {} : null),
    upsertMedia: (m) => upserts.push(m),
  };
  ctx.__ann = { mediaId: 'var', mediaType: 'yt', mediaTitle: 'T', mediaUrl: 'u', start: 3, updatedAt: 7 };
  vm.runInContext('ensureIndexMediaForAnnotation(__index, __ann)', ctx);
  assert.strictEqual(upserts.length, 0, 'mevcut media tekrar yazıldı');
  // yok → legacy'den doldur
  ctx.__watchLib = [{ key: 'yeni', type: 'st', title: 'Film', sourceRef: 'src', duration: 90, lastWatched: 11, prefs: { p: 1 } }];
  ctx.__ann = { mediaId: 'yeni', start: 3, updatedAt: 7 };
  vm.runInContext('ensureIndexMediaForAnnotation(__index, __ann)', ctx);
  assert.strictEqual(upserts.length, 1);
  const m = upserts[0];
  assert.strictEqual(m.title, 'Film');
  assert.strictEqual(m.service, 'st');
  assert.strictEqual(m.position, 3);
  assert.strictEqual(m.lastWatched, 11);
  // legacy yok → varsayılanlar
  ctx.__ann = { mediaId: 'bilinmeyen', mediaTitle: 'Özel' };
  vm.runInContext('ensureIndexMediaForAnnotation(__index, __ann)', ctx);
  assert.strictEqual(upserts[1].title, 'Özel');
  assert.strictEqual(upserts[1].duration, 0);
}

function t_site_terminology(userData) {
  const { ctx, calls } = makeCtx(userData);
  evalAll(ctx);
  // scope yok → 0 / false
  ctx.__scope = null;
  ctx.__termRows = [{ t: 1 }];
  assert.strictEqual(vm.runInContext('seedBrowserPageSiteTerminology({url:"u"}, {config:{targetLanguage:"tr"}, terminologyMap:{}})', ctx), 0);
  assert.strictEqual(vm.runInContext('persistBrowserPageSiteTerminology({url:"u"}, {config:{targetLanguage:"tr"}})', ctx), false);
  // scope var, terminologyMap yok → 0
  ctx.__scope = 'scope-x';
  assert.strictEqual(vm.runInContext('seedBrowserPageSiteTerminology({url:"u"}, {config:{targetLanguage:"tr"}})', ctx), 0);
  // seed → seedSiteTerminology mevcut scope kaydıyla çağrılır
  ctx.__places = { siteTerminology: { 'scope-x': [{ eski: 1 }] } };
  vm.runInContext('seedBrowserPageSiteTerminology({url:"u"}, {config:{targetLanguage:"tr"}, terminologyMap:{a:1}})', ctx);
  assert.strictEqual(j(ctx.__seedArgs.existing), j([{ eski: 1 }]), 'seed mevcut kaydı görmedi');
  // persist: boş rows → false; dolu → siteTerminology'ye yaz
  ctx.__termRows = [];
  assert.strictEqual(vm.runInContext('persistBrowserPageSiteTerminology({url:"u"}, {config:{targetLanguage:"tr"}})', ctx), false);
  ctx.__termRows = [{ k: 'v' }];
  ctx.__places = {};
  assert.strictEqual(vm.runInContext('persistBrowserPageSiteTerminology({url:"u"}, {config:{targetLanguage:"tr"}})', ctx), true);
  assert.strictEqual(j(ctx.__places.siteTerminology['scope-x']), j([{ k: 'v' }]));
  assert.strictEqual(calls.placeSet.at(-1).o.broadcast, false);
}

async function t_reading_list(userData) {
  const { ctx, calls } = makeCtx(userData);
  evalAll(ctx);
  const save = async (tab, entry) => { ctx.__tab = tab; ctx.__entry = entry;
    return vm.runInContext('saveBrowserPageToReadingList(__tab, __entry)', ctx); };
  // wc yok → hata
  let r = await save(null, {});
  assert.strictEqual(r.ok, false);
  assert.match(r.error, /bulunamadı/);
  // savePage yok → hata
  r = await save({ view: { webContents: { isDestroyed: () => false } } }, {});
  assert.strictEqual(r.ok, false);
  // destroyed → hata
  r = await save({ view: { webContents: { isDestroyed: () => true, savePage: async () => {} } } }, {});
  assert.strictEqual(r.ok, false);
  // savePage throw → arşivlenemedi
  r = await save({ view: { webContents: { isDestroyed: () => false,
    savePage: async () => { throw new Error('izin'); } } } }, { filePath: '/tmp/x.mhtml' });
  assert.strictEqual(r.ok, false);
  assert.match(r.error, /arşivlenemedi.*izin/);
  // başarı → commit
  ctx.__commitResult = { ok: true, entry: { id: 'e1' } };
  const wc = { isDestroyed: () => false, savePage: async (p, fmt) => { calls.savePage.push({ p, fmt }); } };
  r = await save({ view: { webContents: wc } }, { filePath: '/tmp/x.mhtml', entry: { id: 'e1' } });
  assert.strictEqual(r.ok, true);
  assert.strictEqual(calls.savePage[0].fmt, 'MHTML');
  // commit hatası yansır
  ctx.__commitResult = { ok: false, error: 'diske yazılamadı' };
  r = await save({ view: { webContents: wc } }, { filePath: '/tmp/y.mhtml' });
  assert.strictEqual(r.ok, false);
}

async function t_pdf_save(userData) {
  const { ctx, calls } = makeCtx(userData);
  evalAll(ctx);
  const save = async (tab) => { ctx.__tab = tab;
    return vm.runInContext('saveBrowserPagePdf(__tab)', ctx); };
  // wc/printToPDF yok → hata
  let r = await save(null);
  assert.strictEqual(r.ok, false);
  assert.match(r.error, /bulunamadı/);
  // iptal → canceled
  ctx.__dlg = { canceled: true };
  r = await save({ view: { webContents: { isDestroyed: () => false, printToPDF: async () => Buffer.from('x') } } });
  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.canceled, true);
  // .pdf uzantısı eklenir + printBackground true. Stub writeBufferAtomic gerçek
  // diske yazar — Windows'ta `/tmp` olmadığından yazılabilir dizin (userData) kullanılır.
  const pdfOut = path.join(userData, 'cikti');
  ctx.__dlg = { filePath: pdfOut };
  const wc = { isDestroyed: () => false, printToPDF: async (o) => { calls.pdf.push(o); return Buffer.from('PDF'); } };
  r = await save({ view: { webContents: wc } });
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.path, pdfOut + '.pdf');
  assert.strictEqual(calls.pdf[0].printBackground, true);
  assert.strictEqual(calls.bufAtomic[0].t, pdfOut + '.pdf');
  // .PDF (büyük harf) → tekrar eklenmez
  const pdfUpper = path.join(userData, 'CIKTI.PDF');
  ctx.__dlg = { filePath: pdfUpper };
  r = await save({ view: { webContents: wc } });
  assert.strictEqual(r.path, pdfUpper);
  // printToPDF throw → hata
  const wcBad = { isDestroyed: () => false, printToPDF: async () => { throw new Error('yok'); } };
  ctx.__dlg = { filePath: path.join(userData, 'f.pdf') };
  r = await save({ view: { webContents: wcBad } });
  assert.strictEqual(r.ok, false);
  assert.match(r.error, /kaydedilemedi/);
}

function t_session_variants(userData) {
  const { ctx } = makeCtx(userData);
  evalAll(ctx);
  ctx.__assetStore = { getTrack: (id) => id.startsWith('ok') ? { ok: true, document: { id } } : { ok: false } };
  ctx.__index = { listTracks: (m) => m === 'm1' ? [{ asset_path: 'ok-index' }] : [] };
  const snap = { tabs: [
    { mediaId: 'm1', trackRefs: [{ assetId: 'ok-a' }, { assetId: 'ok-a' }, { assetId: 'fail-x' }] },
    { mediaId: 'm2', trackRefs: [{ assetId: 'ok-b' }, {}] },
  ] };
  ctx.__snap = snap;
  const out = Array.from(vm.runInContext('collectBrowserSessionVariants(__snap)', ctx));
  assert.strictEqual(j(out.map((v) => v.id)), j(['ok-a', 'ok-index', 'ok-b']),
    'dedupe/index-birleştirme/store-süzgeci yanlış (index, sekmenin kendi refs\'ine eklenir)');
  assert.strictEqual(vm.runInContext('collectBrowserSessionVariants({})', ctx).length, 0);
  // null/guard'süz sözleşme: çağıran sessionSnapshot nesnesi geçirir
  assert.throws(() => vm.runInContext('collectBrowserSessionVariants(null)', ctx), /null.*tabs|tabs.*null/);
}

async function main() {
  const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'persist-'));
  await t_history(userData);
  t_download_records(userData);
  t_annotation(userData);
  t_index_media(userData);
  t_site_terminology(userData);
  await t_reading_list(userData);
  await t_pdf_save(userData);
  t_session_variants(userData);
  console.log('persist-paths-deadzone: 8 senaryo geçti');
}

main().catch((e) => { console.error(e); process.exit(1); });
