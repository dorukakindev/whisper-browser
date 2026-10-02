'use strict';

// R334 ölü-bölge kilidi — yapılandırma/yol/sınır yardımcıları (src/main.js):
// yol getter'ları, mağaza singleton'ları, watchIndex kurulumu,
// browserTranslationConfig/MangaConfig, ui locale/search/export title,
// eventContext/navigation/playback/runtime snapshot, trim/bounded/safe
// sınır yardımcıları, subtitleLangArg/TextForSearch, permission label,
// trackStreamKey, cea fetch key, pdf headers — sıfır test referanslı.

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
  const calls = { events: [] };
  const ctx = vm.createContext(Object.assign({
    String, Number, Array, Set, Map, JSON, RegExp, Error, Promise, Buffer, URL,
    Math, Object, Date, console, process,
    setImmediate, setTimeout, clearTimeout,
    path, fs,
    require: Object.assign((m) => require(m), { resolve: (m) => require.resolve(m) }),
    app: {
      getPath: (k) => k === 'userData' ? userData : `/tmp/${k}`,
      isReady: () => true,
    },
    SafeSecretStore: class { constructor(c) { this.c = c; } },
    BrowserNoteStore: class { constructor(p) { this.p = p; } },
    PersistentTranslationCache: class { constructor(p, o) { this.p = p; this.o = o; } },
    BrowserAssetStore: class { constructor(c) { this.c = c; } },
    BrowserElementRules: class { constructor(p) { this.p = p; } },
    WatchIndex: class { constructor(p) { this.p = p; this.migrated = 0; }
      migrateLegacyWatchLibrary() { this.migrated++; } },
    pruneAndSweepTracks: () => {},
    collectTrackAssetRefs: () => new Set(),
    readBrowserSessionWithStatus: () => ({ session: { tabs: [] } }),
    browserPlacesSnapshot: () => ({}),
    browserSessionPath: (a) => path.join(userData, 'session.json'),
    browserTabs: new Map(),
    watchIndexInstance: null,
    watchIndexUnavailable: false,
    watchIndexLegacyMigrated: false,
    browserNoteStoreInstance: null,
    browserTranslationCacheInstance: null,
    browserMangaCacheInstance: null,
    browserAssetStoreInstance: null,
    browserElementRulesInstance: null,
    lastRendererUiLocale: '',
    loadSettings: () => ctx.__settings ?? {},
    browserOmnibox: { normalizeSearchEngine: (v) => (ctx.__engine ?? v), searchUrl: () => '', markdownLink: (a, b) => a },
    windowsSafeFileName: (v, fb) => v || fb,
    activeBrowserTab: () => ctx.__activeTab ?? null,
    browserNavigationCapabilities: () => ctx.__nav ?? { canGoBack: true, canGoForward: false },
    browserScriptExecutionReady: (wc) => !!(wc && !wc.isDestroyed?.()),
    withTimeout: (p, ms, msg) => p,
    loadWatchLibrary: () => ctx.__lib ?? [],
    decodeSubtitleBuffer: (b) => ({ text: b.toString('utf8') }),
    subtitleFileAccess: { inspect: (p) => p, has: () => ctx.__granted !== false },
    subtitleSearchCache: new Map(),
    SUBTITLE_SEARCH_CACHE_LIMIT: 32,
    SUBTITLE_LANG_CODE: /^[A-Za-z0-9_-]{1,32}$/,
    normalizeCues: (c) => c,
    __calls: calls,
  }, over));
  return { ctx, calls };
}

function evalAll(ctx) {
  vm.runInContext([
    'let watchIndexInstance=null,watchIndexUnavailable=false,watchIndexLegacyMigrated=false,',
    '   browserNoteStoreInstance=null,browserTranslationCacheInstance=null,',
    '   browserMangaCacheInstance=null,browserAssetStoreInstance=null,',
    '   lastRendererUiLocale=null,browserSessionSaveTimer=null,',
    '   browserSplitRatio=0.7,browserSplitSecondaryTabId="",browserActiveTabId="",',
    '   browserSessionRestoreEnabled=true,browserSessionFinalizedForQuit=false,',
    '   browserSessionLastWriteAt=0,browserOrderlyShutdown=true,browserSessionLoadWarning="",',
    '   browserDashSubtitleMatchers=[],browserHlsCeaSegmentMatchers=[];',
    'const BROWSER_PLACES_FILE="browser-places.json";',
    'const BROWSER_DOWNLOADS_FILE="browser-downloads.json";',
    'const SUBTITLE_SEARCH_CACHE_LIMIT=32;',
    'const SUBTITLE_LANG_CODE=/^[A-Za-z0-9_-]{1,32}$/;',
    section('function settingsPath(', 'let settingsSecretStore'),
    section('function watchLibraryPath(', 'function watchLibraryTombstonePath('),
    section('function watchIndexPath(', 'function browserNoteStorePath('),
    section('function browserNoteStorePath(', 'function browserNoteStore('),
    section('function browserNoteStore(', 'function annotationFromIndexRow('),
    section('function watchIndex(', 'function browserAssetStore('),
    section('function browserAssetStore(', 'function browserTranslationCache('),
    section('function browserTranslationCache(', 'function browserMangaCache('),
    section('function browserElementRules(', 'function browserMangaCache('),
    section('function browserMangaCache(', 'function loadWatchLibrary('),
    section('function browserPlacesPath(', 'function browserDownloadsPath('),
    section('function browserSubtitleDir(', 'function sweepBrowserSubtitleFiles('),
    section('function burninRecoveryStatePath(', 'function readBurninRecoveryState('),
    section('function browserUiLocale(', '// Menü modeli'),
    section('function browserSearchEngine(', '// Menü modeli'),
    section('function browserExportTitle(', 'let darkReaderApiBundle'),
    section('function browserEventContext(', 'function browserTabIpcFrequency('),
    section('function browserNavigationStateForTab(', 'function browserNavigationState('),
    section('function browserPlaybackSnapshot(', 'function publishBrowserPlaybackDiagnostics('),
    section('function browserTabsSnapshot(', 'function browserSplitSnapshot('),
    section('async function browserTabRuntimeState(', 'async function unloadBrowserTab('),
    section('function trimInsertionCollection(', 'let browserDashSubtitleMatchers'),
    section('function boundedIpcRows(', 'function boundedBrowserOverlayCues('),
    section('function boundedBrowserOverlayCues(', "ipcMain.handle('browser:setOverlay'"),
    section('function safeWatchLibraryEntryCount(', 'function saveWatchLibrary('),
    section('function subtitleLangArg(', "ipcMain.handle('media:downloadSubs'"),
    section('function subtitleTextForSearch(', 'function subtitleSeconds('),
    section('function browserPermissionLabel(', 'function browserPermissionAllowed('),
    section('function browserTrackStreamKey(', 'let browserSubtitlePreferenceStore'),
    section('function hlsCeaSegmentFetchKey(', 'function registerBrowserHlsCeaMatchers('),
    section('function pdfProtocolHeaders(', 'function installPdfDocumentProtocol('),
    section('function browserTranslationConfig(', 'function browserMangaTranslationConfig('),
    section('function browserMangaTranslationConfig(', 'function safeTranslationEndpoint('),
  ].join('\n'), ctx);
}

function t_paths_and_stores(userData) {
  const { ctx } = makeCtx(userData);
  evalAll(ctx);
  const p = (fn) => vm.runInContext(fn + '()', ctx);
  assert.strictEqual(p('settingsPath'), path.join(userData, 'settings.json'));
  assert.strictEqual(p('watchLibraryPath'), path.join(userData, 'watch-library.json'));
  assert.strictEqual(p('browserPlacesPath'), path.join(userData, 'browser-places.json'));
  assert.strictEqual(p('browserNoteStorePath'), path.join(userData, 'browser-notes.json'));
  assert.strictEqual(p('burninRecoveryStatePath'), path.join(userData, 'burnin-recovery.json'));
  // browserSubtitleDir klasörü açar
  const dir = p('browserSubtitleDir');
  assert.strictEqual(dir, path.join(userData, 'browser-subtitles'));
  assert.ok(fs.statSync(dir).isDirectory());
  // singleton'lar + yapılandırma alanları
  const note = p('browserNoteStore');
  assert.strictEqual(note.p, path.join(userData, 'browser-notes.json'));
  assert.strictEqual(p('browserNoteStore'), note);
  const tc = p('browserTranslationCache');
  assert.strictEqual(tc.p, path.join(userData, 'browser-translation-cache.json'));
  const mc = p('browserMangaCache');
  assert.strictEqual(mc.p, path.join(userData, 'browser-manga-cache.json'));
  assert.strictEqual(mc.o.limit, 3000);
  assert.strictEqual(mc.o.ttlMs, 90 * 24 * 60 * 60 * 1000);
  const as = p('browserAssetStore');
  assert.strictEqual(as.c.rootDir, path.join(userData, 'browser-assets'));
  const er = p('browserElementRules');
  assert.strictEqual(er.p, path.join(userData, 'element-rules.json'));
}

function t_watch_index() {
  const { ctx } = makeCtx('/tmp/x');
  evalAll(ctx);
  const i1 = vm.runInContext('watchIndex()', ctx);
  assert.ok(i1, 'index üretilmedi');
  assert.strictEqual(i1.p, path.join('/tmp/x', 'watch-index.sqlite'));
  assert.strictEqual(i1.migrated, 1, 'legacy migrasyon koşmadı');
  assert.strictEqual(vm.runInContext('watchIndex()', ctx), i1, 'singleton değil');
  assert.strictEqual(i1.migrated, 1, 'migrasyon tekrarlandı');
  // constructor throw → unavailable + null (let-bağlama vm içinde sıfırlanır)
  vm.runInContext('watchIndexInstance=null; watchIndexUnavailable=false;', ctx);
  ctx.WatchIndex = class { constructor() { throw new Error('sqlite yok'); } };
  assert.strictEqual(vm.runInContext('watchIndex()', ctx), null);
  assert.strictEqual(vm.runInContext('watchIndex()', ctx), null, 'unavailable bayrağı koşmadı');
}

function t_translation_config() {
  const { ctx } = makeCtx('/tmp/x');
  evalAll(ctx);
  ctx.__settings = {};
  let c = vm.runInContext('browserTranslationConfig()', ctx);
  assert.strictEqual(c.endpoint, 'https://api.shuaiapi.com/v1');
  assert.strictEqual(c.targetLanguage, 'tr');
  assert.strictEqual(c.sourceLanguage, '');
  assert.strictEqual(c.workers, 2);
  // custom preset + regex-dışı dil → 'tr'
  ctx.__settings = { translate: { endpointPreset: 'custom', customBaseUrl: ' https://x/v1 ' },
    ui: { translateTo: 'XX!!', translateWorkers: 99, translateRegister: 'r'.repeat(40), translateProfanity: 'p'.repeat(40) },
    glossary: Array(300).fill({}) };
  c = vm.runInContext('browserTranslationConfig()', ctx);
  assert.strictEqual(c.endpoint, 'https://x/v1');
  assert.strictEqual(c.targetLanguage, 'tr', 'bozuk dil kodu düzeltilemedi');
  assert.strictEqual(c.workers, 8);
  assert.strictEqual(c.register.length, 32);
  assert.strictEqual(c.glossary.length, 200);
  // overrides kazanır
  c = vm.runInContext(`browserTranslationConfig({targetLanguage:'EN', sourceLanguage:'de', terminologyEnabled:true})`, ctx);
  assert.strictEqual(c.targetLanguage, 'en');
  assert.strictEqual(c.sourceLanguage, 'de');
  assert.strictEqual(c.terminologyEnabled, true);
  // non-custom preset → preset adı endpoint
  ctx.__settings = { translate: { endpointPreset: 'https://preset.example/v1' }, ui: {} };
  c = vm.runInContext('browserTranslationConfig()', ctx);
  assert.strictEqual(c.endpoint, 'https://preset.example/v1');
}

function t_manga_config() {
  const { ctx } = makeCtx('/tmp/x');
  evalAll(ctx);
  ctx.__settings = { translate: { apiKey: 'TK', model: 'm1' },
    manga: { endpointPreset: 'inherit', workers: 99, maxImages: 999, fontScale: 5, fontFamily: 'bogus', verticalText: true, sfxStyle: false },
    ui: {} };
  const c = vm.runInContext('browserMangaTranslationConfig()', ctx);
  assert.strictEqual(c.apiKey, 'TK', 'inherit apiKey devralınmadı');
  assert.strictEqual(c.model, 'm1');
  assert.strictEqual(c.workers, 6);
  assert.strictEqual(c.maxImages, 120);
  assert.strictEqual(c.fontScale, 1.7);
  assert.strictEqual(c.fontFamily, 'comic', 'whitelist dışı font kabul edildi');
  assert.strictEqual(c.verticalText, true);
  assert.strictEqual(c.sfxStyle, false);
  // custom preset + override
  ctx.__settings = { manga: { endpointPreset: 'custom', customBaseUrl: 'http://manga/v1' }, ui: {} };
  const c2 = vm.runInContext('browserMangaTranslationConfig({workers:2, fontScale:0.5})', ctx);
  assert.strictEqual(c2.endpoint, 'http://manga/v1');
  assert.strictEqual(c2.workers, 2);
  assert.strictEqual(c2.fontScale, 0.7);
}

function t_ui_helpers() {
  const { ctx } = makeCtx('/tmp/x');
  evalAll(ctx);
  vm.runInContext(`lastRendererUiLocale='tr'`, ctx);
  assert.strictEqual(vm.runInContext('browserUiLocale()', ctx), 'tr');
  vm.runInContext('lastRendererUiLocale=null', ctx);
  ctx.__settings = { ui: { uiLocale: 'tr' } };
  assert.strictEqual(vm.runInContext('browserUiLocale()', ctx), 'tr');
  ctx.__settings = { ui: { uiLocale: 'en' } };
  assert.strictEqual(vm.runInContext('browserUiLocale()', ctx), 'en');
  ctx.__settings = {};
  assert.strictEqual(vm.runInContext('browserUiLocale()', ctx), 'en', 'varsayılan en olmalı');
  // search engine passthrough
  ctx.__settings = { ui: { browserSearchEngine: 'ddg' } };
  ctx.__engine = 'ddg-normalized';
  assert.strictEqual(vm.runInContext('browserSearchEngine()', ctx), 'ddg-normalized');
  // export title
  ctx.__activeTab = { restoredTitle: 'Başlık'.repeat(30) };
  assert.strictEqual(vm.runInContext('browserExportTitle(__activeTab)', ctx).length <= 100, true);
  ctx.__activeTab = null;
  assert.strictEqual(vm.runInContext('browserExportTitle(null)', ctx), 'web-sayfasi');
}

function t_contexts() {
  const { ctx } = makeCtx('/tmp/x');
  evalAll(ctx);
  // eventContext: tab yok → boş şablon
  let c = vm.runInContext('browserEventContext(null)', ctx);
  assert.strictEqual(c.tabId, '');
  assert.strictEqual(c.generation, 0);
  const tab = { id: 't1', generation: 3, mediaId: 'm', streamMediaId: 's', service: 'yt', acquisitionId: 'a', operationId: 'o' };
  ctx.__t = tab;
  c = vm.runInContext('browserEventContext(__t)', ctx);
  assert.strictEqual(j([c.tabId, c.generation, c.mediaId, c.streamMediaId, c.service, c.acquisitionId, c.operationId]),
    j(['t1', 3, 'm', 's', 'yt', 'a', 'o']));
  // tabs snapshot: browserTabSnapshot uygulanır
  ctx.browserTabSnapshot = (t) => ({ id: t.id });
  ctx.browserTabs.set('a', { id: 'a' });
  ctx.browserTabs.set('b', { id: 'b' });
  assert.strictEqual(j(vm.runInContext('browserTabsSnapshot()', ctx)), j([{ id: 'a' }, { id: 'b' }]));
  // playback snapshot: diag var/yok
  ctx.__activeTab = { playbackDiagnostics: { snapshot: () => ({ classCount: 4 }) } };
  assert.strictEqual(vm.runInContext('browserPlaybackSnapshot(__activeTab)', ctx).classCount, 4);
  ctx.__activeTab = null;
  const z = vm.runInContext('browserPlaybackSnapshot(null)', ctx);
  assert.strictEqual(z.classCount, 0);
}

function t_navigation_state() {
  const { ctx } = makeCtx('/tmp/x');
  evalAll(ctx);
  // destroyed / view yok → restored alanları + resumePending
  let tab = { restoredUrl: 'https://r', restoredTitle: 'R', zoom: 2, compatibilityMode: true };
  ctx.__t = tab;
  let s = vm.runInContext('browserNavigationStateForTab(__t)', ctx);
  assert.strictEqual(s.url, 'https://r');
  assert.strictEqual(s.loading, false);
  assert.strictEqual(s.resumePending, true);
  assert.strictEqual(s.zoom, 2);
  // live: about:blank → restoredUrl'a düş
  tab = { restoredUrl: 'https://rest',
    view: { webContents: { isDestroyed: () => false, getURL: () => 'about:blank',
      getTitle: () => '', isLoading: () => true, getZoomFactor: () => 1.25 } } };
  ctx.__t = tab;
  s = vm.runInContext('browserNavigationStateForTab(__t)', ctx);
  assert.strictEqual(s.url, 'https://rest');
  assert.strictEqual(s.canGoBack, true);
  assert.strictEqual(s.canGoForward, false);
  assert.strictEqual(s.zoom, 1.25);
  // gerçek URL
  tab.view.webContents.getURL = () => 'https://live';
  s = vm.runInContext('browserNavigationStateForTab(__t)', ctx);
  assert.strictEqual(s.url, 'https://live');
}

async function t_runtime_state() {
  const { ctx } = makeCtx('/tmp/x');
  evalAll(ctx);
  // wc yok → stateKnown:false
  let r = await vm.runInContext('browserTabRuntimeState(null)', ctx);
  assert.strictEqual(r.stateKnown, false);
  // executeJavaScript sonucu birleştirilir
  const tab = { view: { webContents: { isDestroyed: () => false,
    executeJavaScript: async () => ({ mediaPlaying: true, fullscreen: false, pictureInPicture: false, formOrLogin: false, dirtyDraft: true }) } } };
  ctx.__t = tab;
  r = await vm.runInContext('browserTabRuntimeState(__t)', ctx);
  assert.strictEqual(r.stateKnown, true);
  assert.strictEqual(r.mediaPlaying, true);
  assert.strictEqual(r.dirtyDraft, true);
  // exec throw → stateKnown:false
  tab.view.webContents.executeJavaScript = async () => { throw new Error('x'); };
  r = await vm.runInContext('browserTabRuntimeState(__t)', ctx);
  assert.strictEqual(r.stateKnown, false);
}

function t_bounds() {
  const { ctx } = makeCtx('/tmp/x');
  evalAll(ctx);
  // trimInsertionCollection — Map insertion-order
  const m = new Map([['a', 1], ['b', 2], ['c', 3], ['d', 4]]);
  ctx.__m = m;
  vm.runInContext('trimInsertionCollection(__m, 2)', ctx);
  assert.strictEqual(j([...m.keys()]), j(['c', 'd']), 'en eski silinmedi');
  // boundedIpcRows
  const cyc = {}; cyc.self = cyc;
  const rows = [{ n: 1 }, { n: 2 }, cyc, { n: 3 }];
  ctx.__rows = rows;
  let r = Array.from(vm.runInContext('boundedIpcRows(__rows)', ctx));
  assert.strictEqual(r.length, 3, 'JSON.stringify düşen satır elenmedi');
  assert.strictEqual(j(vm.runInContext('boundedIpcRows(null)', ctx)), j([]));
  // maxRows
  ctx.__rows = Array.from({ length: 10 }, (_, i) => ({ i }));
  assert.strictEqual(vm.runInContext('boundedIpcRows(__rows, 3)', ctx).length, 3);
  // byte limit ~ küçük maxBytes
  ctx.__rows = [{ s: 'x'.repeat(100) }, { s: 'y'.repeat(100) }];
  assert.strictEqual(vm.runInContext('boundedIpcRows(__rows, 10, 60)', ctx).length, 0, 'ilk satır bile sığmadı');
  assert.strictEqual(vm.runInContext('boundedIpcRows(__rows, 10, 140)', ctx).length, 1, 'ikinci satır bütçeyi aşmadan kesilmedi');
  // boundedBrowserOverlayCues alan kesimi
  ctx.__rows = [{ start: 1, end: 2, text: 'T'.repeat(13000), speaker: 'S'.repeat(300), confidence: 0.5, extra: 'drop' }];
  r = Array.from(vm.runInContext('boundedBrowserOverlayCues(__rows)', ctx));
  assert.strictEqual(r[0].text.length, 12000);
  assert.strictEqual(r[0].speaker.length, 200);
  assert.strictEqual(r[0].extra, undefined, 'bilinmeyen alan sızdı');
  // safeWatchLibraryEntryCount
  ctx.__lib = [1, 2, 3];
  assert.strictEqual(vm.runInContext('safeWatchLibraryEntryCount()', ctx), 3);
  ctx.__lib = null;
  ctx.loadWatchLibrary = () => { throw new Error('bozuk'); };
  assert.strictEqual(vm.runInContext('safeWatchLibraryEntryCount()', ctx), -1);
}

function t_subtitle_helpers(userData) {
  const { ctx } = makeCtx(userData);
  evalAll(ctx);
  assert.strictEqual(vm.runInContext(`subtitleLangArg('en')`, ctx), 'en');
  assert.strictEqual(vm.runInContext(`subtitleLangArg('tr-TR')`, ctx), 'tr-TR');
  assert.strictEqual(vm.runInContext(`subtitleLangArg('')`, ctx), 'en', 'boş→en varsayılanı');
  assert.strictEqual(vm.runInContext(`subtitleLangArg('en;rm -rf')`, ctx), null);
  assert.strictEqual(vm.runInContext(`subtitleLangArg('x'.repeat(33))`, ctx), null);
  assert.strictEqual(vm.runInContext('subtitleLangArg(null)', ctx), 'en');
  // subtitleTextForSearch
  ctx.__granted = false;
  assert.strictEqual(vm.runInContext(`subtitleTextForSearch('x')`, ctx), '', 'izinsiz dosya okundu');
  ctx.__granted = true;
  assert.strictEqual(vm.runInContext(`subtitleTextForSearch('/yok/yol.srt')`, ctx), '');
  const f = path.join(userData, 'a.srt');
  fs.writeFileSync(f, '1\n00:00:01,000 --> 00:00:02,000\nSelam\n');
  ctx.__f = f;
  const t1 = vm.runInContext('subtitleTextForSearch(__f)', ctx);
  assert.match(t1, /Selam/);
  // önbellek hit: aynı mtime → aynı sonuç (fs read çağrılmaz)
  fs.writeFileSync(f, 'DEĞİŞTİ');
  const st = fs.statSync(f);
  ctx.subtitleSearchCache.set(f, { mtimeMs: st.mtimeMs, text: 'CACHEHIT' });
  assert.strictEqual(vm.runInContext('subtitleTextForSearch(__f)', ctx), 'CACHEHIT');
  // 8MB üstü → ''
  fs.writeFileSync(f, Buffer.alloc(8 * 1024 * 1024 + 1));
  assert.strictEqual(vm.runInContext('subtitleTextForSearch(__f)', ctx), '');
}

function t_labels_and_keys() {
  const { ctx } = makeCtx('/tmp/x');
  evalAll(ctx);
  assert.strictEqual(vm.runInContext(`browserPermissionLabel('media')`, ctx), 'kamera veya mikrofon');
  assert.strictEqual(vm.runInContext(`browserPermissionLabel('geolocation')`, ctx), 'konum');
  assert.strictEqual(vm.runInContext(`browserPermissionLabel('bilinmeyen')`, ctx), 'bilinmeyen');
  // pdf headers
  const h = vm.runInContext(`pdfProtocolHeaders(1234, {'X-Test':'1'})`, ctx);
  assert.strictEqual(h['Content-Length'], '1234');
  assert.strictEqual(h['Content-Type'], 'application/pdf');
  assert.strictEqual(h['Access-Control-Allow-Origin'], 'null');
  assert.strictEqual(h['X-Test'], '1');
  // cea fetch key
  assert.strictEqual(vm.runInContext(`hlsCeaSegmentFetchKey({playlistUrl:'p',discontinuity:2,sequence:5,url:'u'})`, ctx), 'p|2|5|u');
  assert.strictEqual(vm.runInContext('hlsCeaSegmentFetchKey({})', ctx), '|0||');
}

function t_stream_key() {
  const { ctx } = makeCtx('/tmp/x');
  evalAll(ctx);
  assert.strictEqual(vm.runInContext(`browserTrackStreamKey('')`, ctx), '');
  // seg dosya adı normalleştirilir
  assert.strictEqual(
    vm.runInContext(`browserTrackStreamKey('https://h/v/seg-001.vtt','en')`, ctx),
    'https://h/v/__segment__.vtt|en');
  assert.strictEqual(
    vm.runInContext(`browserTrackStreamKey('https://h/v/000123.vtt','en')`, ctx),
    'https://h/v/__segment__.vtt|en');
  // sabit yol değişmez
  assert.strictEqual(
    vm.runInContext(`browserTrackStreamKey('https://h/captions/en.vtt','en')`, ctx),
    'https://h/captions/en.vtt|en');
  // uçucu sorgular atılır, kalanlar sıralanır
  assert.strictEqual(
    vm.runInContext(`browserTrackStreamKey('https://h/a.vtt?sig=AAA&keep=1&expire=2','EN')`, ctx),
    'https://h/a.vtt?keep=1|en');
  // geçersiz URL → raw|lang
  assert.strictEqual(vm.runInContext(`browserTrackStreamKey('not a url','tr')`, ctx), 'not a url|tr');
}

async function main() {
  const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'cfg-'));
  t_paths_and_stores(userData);
  t_watch_index();
  t_translation_config();
  t_manga_config();
  t_ui_helpers();
  t_contexts();
  t_navigation_state();
  await t_runtime_state();
  t_bounds();
  t_subtitle_helpers(userData);
  t_labels_and_keys();
  t_stream_key();
  console.log('browser-config-deadzone: 12 senaryo geçti');
  process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });
