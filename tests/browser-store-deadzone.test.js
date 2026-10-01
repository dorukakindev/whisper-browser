'use strict';

// R334 ölü-bölge kilidi — depo/oturum/yol yardımcıları (src/main.js):
// *-path yolları, SafeSecretStore singleton'ları, invidious oturum çözümü,
// watchLibraryForRenderer, adblock controller/publish, places atomik yazımı,
// browserTabHasPage, browserPermissionAllowed, hlsCeaTracksForVariant,
// clearBrowserHlsCeaFullCaptureState, inspectMediaScanRoots.

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
  const calls = { events: [], writes: [], ablock: [] };
  const ctx = vm.createContext(Object.assign({
    String, Number, Array, Set, Map, JSON, RegExp, Error, Promise, Buffer, URL,
    Math, Object, Date, console, process,
    setImmediate, setTimeout, clearTimeout,
    path, fs,
    app: { getPath: (k) => k === 'userData' ? userData : `/tmp/${k}` },
    safeStorage: {},
    SafeSecretStore: class { constructor(c) { this.c = c; } save() {} load() { return null; } },
    BrowserTranslationArchive: class { constructor(p) { this.p = p; } },
    secretStorePath: () => path.join(userData, 'gizli.safe.json'),
    invidiousSessions: new Map(),
    invidiousLastInstance: '',
    validateInvidiousInstance: (v) => { const s = String(v || ''); return /^https?:\/\//.test(s) ? s : ''; },
    createWatchLibraryStore: (c) => ({ c }),
    loadWatchLibrary: () => ctx.__lib ?? [],
    ensureBrowserNotesReady: () => ctx.__notes ?? {},
    watchIndex: () => ctx.__index ?? null,
    annotationFromIndexRow: (r) => ({ mediaId: r.media_id, fromIndex: true, row: r }),
    normalizeAnnotation: (a) => a,
    browserTabs: new Map(),
    mainWindow: null,
    createBrowserAdblock: (c) => { calls.ablock.push(c); return ctx.__adblock ?? (ctx.__adblock = { c, setEnabled: async () => ({ ok: true, enabled: true }) }); },
    browserAdblockInitiallyEnabled: true,
    session: { fromPartition: (p, o) => ({ p, o }) },
    BROWSER_PARTITION: 'persist:browser',
    browserTabSnapshot: (t) => ({ url: t?.restoredUrl || '' }),
    browserSiteOrigin: (u) => { try { return new URL(u).origin; } catch (_) { return ''; } },
    noteBrowserCapture: () => {},
    readBrowserPlaces: () => ctx.__places ?? {},
    normalizeBrowserPlaces: (p) => ({ ...(p || {}), __norm: true }),
    browserPlacesPath: () => path.join(userData, 'browser-places.json'),
    writeMirroredJsonAtomic: (io, p, v) => {
      io.writeFileSync(p, JSON.stringify(v)); io.writeFileSync(p + '.bak', JSON.stringify(v));
    },
    writeAtomicJson: (io, p, v) => io.writeFileSync(p, JSON.stringify(v)),
    sendBrowserEvent: (e) => calls.events.push(e),
    flushBrowserPlaces: () => ctx.__flush?.() ?? true,
    browserPlacesSaveTimer: null, browserPlacesCache: null, browserPlacesDirty: false,
    normalizePermissionName: (p) => String(p || ''),
    browserMediaPermissionDecision: (places, url, mt) => ctx.__mediaDec ?? 'block',
    browserPermissionDecision: (places, url, p) => ctx.__permDec ?? 'block',
    browserHlsCeaDecoders: new Map(),
    browserHlsCeaFetchedSegments: new Set(),
    browserTrackBuffers: new Map(),
    browserTrackPendingPublications: new Map(),
    browserTrackPublicationTimers: new Map(),
    browserTextStability: { cancelScope: (k) => (ctx.__cancelled ??= []).push(k) },
    browserTrackStreamKey: (src, lang) => `${src}|${lang}`,
    ceaUrlKey: (u) => String(u || ''),
    hlsCeaSegmentFetchKey: (s) => `fk:${s.url || s}`,
    canonicalLocalPath: (v) => String(v || ''),
    mediaFileAccess: { inspect: (p) => (/\.(mp4|mkv|srt)$/.test(p) ? p : null) },
    __calls: calls,
  }, over));
  return { ctx, calls };
}

function evalAll(ctx) {
  vm.runInContext([
    'let invidiousSessionStore=null,youtubeSessionStore=null,settingsSecretStore=null,',
    '   browserAdblockController=null,browserAdblockReadyPromise=null,',
    '   browserReadingListInstance=null,browserTranslationArchiveInstance=null,',
    '   watchLibraryStoreInstance=null,browserNoteStoreInstance=null;',
    section('function getInvidiousSessionStore(', 'function persistInvidiousSessions('),
    section('function getYoutubeSessionStore(', 'function persistYoutubeSession('),
    section('function getSettingsSecretStore(', 'var settingsFileCorrupt'),
    section('function watchLibraryTombstonePath(', 'function browserNoteStorePath('),
    section('function watchIndexPath(', 'function browserNoteStorePath('),
    section('function browserTranslationArchivePath(', 'let browserReadingListInstance'),
    section('function browserFaviconsPath(', 'function readBrowserFavicons('),
    section('function modelBenchmarkHistoryPath(', 'function recordModelBenchmark('),
    section('function browserCeaCheckpointRoot(', 'function persistBrowserHlsCeaCheckpoint('),
    section('function invidiousSessionInstance(', 'function isLocalInvidiousInstance('),
    section('function watchLibraryForRenderer(', 'function foldWatchSearchText('),
    section('function publishBrowserAdblockState(', '// Electron'),
    section('function writeBrowserPlacesAtomic(', 'function flushBrowserPlaces('),
    section('function writeBrowserPlaces(', 'function setBrowserPlaces('),
    section('function browserTabHasPage(', 'function browserTabShouldBeVisible('),
    section('function browserPermissionAllowed(', 'function settleBrowserPermissionRequest('),
    section('function hlsCeaTracksForVariant(', 'async function getBrowserHlsCeaKey('),
    section('function clearBrowserHlsCeaFullCaptureState(', 'function browserCeaCheckpointRoot('),
    section('function inspectMediaScanRoots(', 'async function authorizeMediaScanRoots('),
    section('async function configureBrowserAdblock(', 'function startBrowserAdblock('),
  ].join('\n'), ctx);
}

function t_paths(userData) {
  const { ctx } = makeCtx(userData);
  evalAll(ctx);
  const p = (fn) => vm.runInContext(fn + '()', ctx);
  assert.strictEqual(p('watchLibraryTombstonePath'), path.join(userData, 'watch-library-tombstones.json'));
  assert.strictEqual(p('watchIndexPath'), path.join(userData, 'watch-index.sqlite'));
  assert.strictEqual(p('browserTranslationArchivePath'), path.join(userData, 'Çeviri Arşivi'));
  assert.strictEqual(p('browserFaviconsPath'), path.join(userData, 'browser-favicons.json'));
  assert.strictEqual(p('modelBenchmarkHistoryPath'), path.join(userData, 'model-benchmarks.json'));
  assert.strictEqual(p('browserCeaCheckpointRoot'), path.join(userData, 'capture-checkpoints'));
}

function t_secret_stores(userData) {
  const { ctx } = makeCtx(userData);
  evalAll(ctx);
  const a = vm.runInContext('getInvidiousSessionStore()', ctx);
  assert.strictEqual(a.c.filePath, path.join(userData, 'invidious-session.safe.json'));
  assert.strictEqual(j(a.c.fields), j(['sessions']));
  assert.strictEqual(vm.runInContext('getInvidiousSessionStore()', ctx), a, 'singleton değil');
  const b = vm.runInContext('getYoutubeSessionStore()', ctx);
  assert.strictEqual(b.c.filePath, path.join(userData, 'youtube-session.safe.json'));
  const c = vm.runInContext('getSettingsSecretStore()', ctx);
  assert.strictEqual(c.c.filePath, path.join(userData, 'gizli.safe.json'));
}

function t_invidious_resolve() {
  const { ctx } = makeCtx('/tmp/x');
  evalAll(ctx);
  // boş → ''
  assert.strictEqual(vm.runInContext('invidiousSessionInstance()', ctx), '');
  // geçersiz session instance atlanır
  ctx.invidiousSessions.set('u1', { instance: 'javascript:x' });
  ctx.invidiousSessions.set('u2', { instance: 'https://i2.example' });
  assert.strictEqual(vm.runInContext('invidiousSessionInstance()', ctx), 'https://i2.example');
  // resolve önceliği
  ctx.__e = 'https://explicit.example';
  assert.strictEqual(vm.runInContext('resolveInvidiousInstance(__e)', ctx), 'https://explicit.example');
  assert.strictEqual(vm.runInContext('resolveInvidiousInstance("")', ctx), 'https://i2.example');
  ctx.invidiousSessions.clear();
  ctx.invidiousLastInstance = 'https://last.example';
  assert.strictEqual(vm.runInContext('resolveInvidiousInstance("")', ctx), 'https://last.example');
  assert.strictEqual(vm.runInContext('resolveInvidiousInstance("", {requireSession:true})', ctx), '',
    'requireSession son-bilinen instance\'a düşmemeli');
}

function t_watch_renderer() {
  const { ctx } = makeCtx('/tmp/x');
  evalAll(ctx);
  ctx.__lib = [{ key: 'm1', title: 'A' }, { key: 'm2', title: 'B' }];
  ctx.__notes = { list: () => [{ mediaId: 'm1' }, { mediaId: '' }] };
  const out = Array.from(vm.runInContext('watchLibraryForRenderer()', ctx));
  assert.strictEqual(out[0].hasNotes, true);
  assert.strictEqual(out[1].hasNotes, false, 'boş mediaId yanlış eşleşti');
  // depo bozuk → index
  ctx.__notes = { loadError: 'x' };
  ctx.__index = { listAllAnnotations: () => [{ media_id: 'm2' }] };
  const out2 = Array.from(vm.runInContext('watchLibraryForRenderer()', ctx));
  assert.strictEqual(out2[1].hasNotes, true, 'bozuk depo index yedeğine düşmedi');
  // ikisi de bozuksa → hata yutulur
  ctx.__notes = { get list() { throw new Error('x'); } };
  ctx.__index = null;
  assert.strictEqual(vm.runInContext('watchLibraryForRenderer()', ctx).length, 2);
}

function t_adblock(userData) {
  const { ctx, calls } = makeCtx(userData);
  evalAll(ctx);
  // publish: pencere yok/destroyed → göndermez
  vm.runInContext('publishBrowserAdblockState({ok:true})', ctx);
  assert.strictEqual(calls.events.length, 0);
  ctx.mainWindow = { isDestroyed: () => false, webContents: { send: (ch, p) => calls.events.push({ ch, p }) } };
  vm.runInContext('publishBrowserAdblockState({ok:true,enabled:true})', ctx);
  assert.strictEqual(calls.events[0].ch, 'browser:event');
  assert.strictEqual(calls.events[0].p.type, 'adblock-status');
  assert.strictEqual(calls.events[0].p.enabled, true);
  // controller singleton + setEnabled publish
  const c1 = vm.runInContext('ensureBrowserAdblockController()', ctx);
  assert.strictEqual(vm.runInContext('ensureBrowserAdblockController()', ctx), c1);
  assert.strictEqual(calls.ablock.length, 1);
  // isSitePaused: siteOverride > siteProfiles
  const c = calls.ablock[0];
  const tab = { id: 't', restoredUrl: 'https://a.b/sayfa', siteOverrideOrigin: 'https://a.b', siteOverrides: { adblockEnabled: false },
    view: { webContents: { isDestroyed: () => false, id: 9 } } };
  ctx.browserTabs.set('t', tab);
  ctx.__places = { siteProfiles: { 'https://a.b': { adblockEnabled: true } } };
  assert.strictEqual(c.isSitePaused({ webContentsId: 9 }), true, 'siteOverride önceliği kayboldu');
  tab.siteOverrides = {};
  assert.strictEqual(c.isSitePaused({ webContentsId: 9 }), false, 'profilde açık → duraklatma yok');
  ctx.__places = { siteProfiles: { 'https://a.b': { adblockEnabled: false } } };
  assert.strictEqual(c.isSitePaused({ webContentsId: 9 }), true, 'profil pause görülmedi');
  // configure → setEnabled + publish
  vm.runInContext('configureBrowserAdblock(true)', ctx).then?.(() => {});
}

function t_places_write(userData) {
  const { ctx } = makeCtx(userData);
  evalAll(ctx);
  const p = path.join(userData, 'browser-places.json');
  // ilk yazım
  vm.runInContext('writeBrowserPlacesAtomic({v:1})', ctx);
  assert.strictEqual(JSON.parse(fs.readFileSync(p, 'utf8')).v, 1);
  // ikinci yazım — eski ana dosya .bak'a kopyalanır
  vm.runInContext('writeBrowserPlacesAtomic({v:2})', ctx);
  assert.strictEqual(JSON.parse(fs.readFileSync(`${p}.bak`, 'utf8')).v, 1);
  // bozuk ana dosya sağlam .bak'ı ezmesin
  fs.writeFileSync(p, '{{{');
  vm.runInContext('writeBrowserPlacesAtomic({v:3})', ctx);
  assert.strictEqual(JSON.parse(fs.readFileSync(`${p}.bak`, 'utf8')).v, 1, 'bozuk ana dosya yedeği ezdi');
  assert.strictEqual(JSON.parse(fs.readFileSync(p, 'utf8')).v, 3);
  // mirrorBackup → .bak güncel durumla eşitlenir
  fs.writeFileSync(p, JSON.stringify({ v: 9 }));
  vm.runInContext('writeBrowserPlacesAtomic({v:4}, {mirrorBackup:true})', ctx);
  assert.strictEqual(JSON.parse(fs.readFileSync(`${p}.bak`, 'utf8')).v, 4, 'ayna güncellenmedi');
  // writeBrowserPlaces → normalize+dirty+flush
  ctx.__flush = () => { ctx.__flushed = true; ctx.browserPlacesDirty = false; return true; };
  vm.runInContext('writeBrowserPlaces({a:1})', ctx);
  assert.strictEqual(ctx.__flushed, true);
  assert.strictEqual(ctx.browserPlacesDirty, false);
  assert.strictEqual(ctx.browserPlacesCache.__norm, true);
}

function t_tab_has_page() {
  const { ctx } = makeCtx('/tmp/x');
  evalAll(ctx);
  const h = (t) => { ctx.__t = t; return vm.runInContext('browserTabHasPage(__t)', ctx); };
  assert.strictEqual(h(null), false);
  assert.strictEqual(h({}), false);
  assert.strictEqual(h({ view: { webContents: { isDestroyed: () => true, getURL: () => 'https://a' } } }), false);
  assert.strictEqual(h({ view: { webContents: { isDestroyed: () => false, getURL: () => 'about:blank' } } }), false);
  // about:blank + restoredUrl → yine de sayfası var
  assert.strictEqual(h({ restoredUrl: 'https://r', view: { webContents: { isDestroyed: () => false, getURL: () => 'about:blank' } } }), true);
  assert.strictEqual(h({ view: { webContents: { isDestroyed: () => false, getURL: () => 'https://a' } } }), true);
}

function t_permission_allowed() {
  const { ctx } = makeCtx('/tmp/x');
  evalAll(ctx);
  ctx.__places = { sitePermissions: {} };
  // 'media' → mediaType ile mediaPermissionDecision
  ctx.__mediaDec = 'allow';
  assert.strictEqual(vm.runInContext(`browserPermissionAllowed('media','u',{mediaType:'video'})`, ctx), true);
  ctx.__mediaDec = 'block';
  assert.strictEqual(vm.runInContext(`browserPermissionAllowed('media','u',{})`, ctx), false);
  // media olmayan → normal karar
  ctx.__permDec = 'allow';
  assert.strictEqual(vm.runInContext(`browserPermissionAllowed('notifications','u',{})`, ctx), true);
  ctx.__permDec = 'block';
  assert.strictEqual(vm.runInContext(`browserPermissionAllowed('clipboard','u',{})`, ctx), false);
}

function t_cea_tracks() {
  const { ctx } = makeCtx('/tmp/x');
  evalAll(ctx);
  const f = (tr, v) => { ctx.__tr = tr; ctx.__v = v; return Array.from(vm.runInContext('hlsCeaTracksForVariant(__tr, __v)', ctx)); };
  const tracks = [{ groupId: 'CC1', id: 'a' }, { groupId: 'CC2', id: 'b' }, { id: 'c' }];
  // NONE → []
  assert.strictEqual(f(tracks, { closedCaptionsGroup: 'NONE' }).length, 0);
  // group yok → tümü
  assert.strictEqual(f(tracks, {}).length, 3);
  // group filtre: aynı veya groupId'siz
  const out = f(tracks, { closedCaptionsGroup: 'CC1' });
  assert.strictEqual(j(out.map((t) => t.id)), j(['a', 'c']), 'groupId filtresi yanlış');
}

function t_cea_clear() {
  const { ctx } = makeCtx('/tmp/x');
  evalAll(ctx);
  ctx.browserHlsCeaDecoders.set('pl|0', { reset: () => (ctx.__resetA = true) });
  ctx.browserHlsCeaDecoders.set('pl|1', { reset: () => (ctx.__resetB = true) });
  ctx.browserHlsCeaDecoders.set('other|0', { reset: () => (ctx.__resetOther = true) });
  ctx.browserHlsCeaFetchedSegments.add('fk:a');
  ctx.browserHlsCeaFetchedSegments.add('fk:b');
  ctx.browserTrackBuffers.set('src|en|cea:1', [1]);
  ctx.browserTrackBuffers.set('src|en|cea:2', [2]);
  ctx.browserTrackPendingPublications.set('src|en|cea:1', true);
  const timer = setTimeout(() => {}, 9999); ctx.browserTrackPublicationTimers.set('src|en|cea:1', timer);
  const plan = { playlistUrl: 'pl', sourceUrl: 'src',
    segments: [{ url: 'a' }], tracks: [{ instreamId: '1', language: 'en' }] };
  ctx.__plan = plan;
  vm.runInContext('clearBrowserHlsCeaFullCaptureState(__plan)', ctx);
  assert.strictEqual(ctx.browserHlsCeaDecoders.size, 1);
  assert.strictEqual(ctx.__resetA === true && ctx.__resetB === true, true, 'decoder reset edilmedi');
  assert.strictEqual(ctx.__resetOther, undefined, 'başka playlist decoder\'ı silindi');
  assert.strictEqual(ctx.browserHlsCeaFetchedSegments.has('fk:a'), false);
  assert.strictEqual(ctx.browserHlsCeaFetchedSegments.has('fk:b'), true, 'plan dışı fetch silindi');
  assert.strictEqual(ctx.browserTrackBuffers.has('src|en|cea:1'), false);
  assert.strictEqual(ctx.browserTrackBuffers.has('src|en|cea:2'), true);
  clearTimeout(timer);
}

function t_scan_roots(userData) {
  const { ctx } = makeCtx(userData);
  evalAll(ctx);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'scan-'));
  fs.writeFileSync(path.join(dir, 'f.mp4'), 'x');
  fs.writeFileSync(path.join(dir, 'n.txt'), 'x');
  const f = (v) => { ctx.__v = v; return vm.runInContext('inspectMediaScanRoots(__v)', ctx); };
  // boş / >1000 → throw
  assert.throws(() => f([]), /geçersiz/);
  assert.throws(() => f(Array(1001).fill('x')), /geçersiz/);
  ctx.__v = [dir, path.join(dir, 'f.mp4'), path.join(dir, 'n.txt'), path.join(dir, 'yok.mp4')];
  const roots = Array.from(vm.runInContext('inspectMediaScanRoots(__v)', ctx));
  assert.strictEqual(j(roots.map((r) => path.basename(r))), j(['scan-' + path.basename(dir).slice(5), 'f.mp4'])
    .replace('scan-' + path.basename(dir).slice(5), path.basename(dir)),
    'klasör+medya dosyası korunmalı, txt+eksik elenmeli');
}

async function main() {
  const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'store-'));
  t_paths(userData);
  t_secret_stores(userData);
  t_invidious_resolve();
  t_watch_renderer();
  t_adblock(userData);
  t_places_write(userData);
  t_tab_has_page();
  t_permission_allowed();
  t_cea_tracks();
  t_cea_clear();
  t_scan_roots(userData);
  console.log('browser-store-deadzone: 11 senaryo geçti');
}

main().catch((e) => { console.error(e); process.exit(1); });
