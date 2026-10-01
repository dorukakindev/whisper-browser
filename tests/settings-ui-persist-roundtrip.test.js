// R315 — ayarlar UI→persist→restart tam tur denetimi:
// 1) renderer.js ve settings-security.js persist listeleri birebir aynı olmalı
//    (iki kopya — kayma = kaydedilen tercihin sanitize'da sessizce düşmesi).
// 2) index.html'deki HER form kontrolü persist / başka depo / kasıtlı-geçici
//    üç kümeden birinde sınıflandırılmış olmalı — yeni kontrol sınıflandırılmadan
//    eklenirse test düşer.
// 3) select[multiple] collect/apply roundtrip + sanitize davranışı.
'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('node:vm');

const {
  PERSIST_CHECKBOX_CONTROLS,
  PERSIST_VALUE_CONTROLS,
  UI_MULTI_VALUE_ENUMS,
  createBackupPayload,
  parseImportText,
} = require('../src/settings-security');

let passed = 0;
function test(name, fn) {
  try {
    fn();
    passed += 1;
    console.log(`  PASS  ${name}`);
  } catch (error) {
    console.error(`  FAIL  ${name}: ${error.stack || error.message}`);
    process.exitCode = 1;
  }
}

const ROOT = path.join(__dirname, '..');
const RENDERER = fs.readFileSync(path.join(ROOT, 'src', 'renderer', 'renderer.js'), 'utf8').replace(/\r\n/g, '\n');
const HTML = fs.readFileSync(path.join(ROOT, 'src', 'renderer', 'index.html'), 'utf8');

// PERSIST dışı kalıcılık yolları (R315 denetiminde doğrulanmış):
// - localStorage anahtarları: altyazı stili, kelime kaynağı, ortam/hız tercihleri
// - oynatıcı tercih deposu (playerPrefs): otomatik duraklat/takip, görünüm anahtarları
// - sayfa çevirisi tercihleri (browserPagePrefs localStorage, site başına)
// - workspace/oturum (places), site-uyumluluk IPC, SmartTube deposu
// - appSettingsPayload/secretSettingPatch: anahtarlar + sağlayıcı profilleri
// - seri-bağlam deposu (bf* alanları seri adıyla geri yüklenir)
// - ayna kontroller: aynı tercihin ikinci görünümü (kaynağı persist'tedir)
const OTHER_STORE = new Set([
  'subColor', 'subBgOpacity', 'subOutline', 'subFont', 'subWeight', 'subDualLayout',
  'wordLookupSource', 'ambientMode', 'holdSpeedOn',
  'autoPauseCue', 'autoFollow', 'showSource', 'showTranslation', 'playerMergeCont', 'playerAudioLang',
  'browserPageLockedTerms', 'browserPageExcludedSelectors', 'browserPageBudget', 'browserPageSettingsBudget',
  'browserPageQuickTarget', 'browserPageQuickAuto', 'playerCookieBrowser', 'playerUiLocale',
  'browserSplitRatio', 'browserSessionRestore', 'browserSiteCompatibility',
  'hfToken', 'translateApiKey', 'mangaApiKey', 'llmApiKey',
  'llmBaseUrl', 'llmModel', 'llmEndpointPreset',
  'mangaBaseUrl', 'mangaModel', 'mangaEndpointPreset',
  'translateSavedModel', 'glossaryInput', 'presetSelect',
  'ytClientId', 'ytClientSecret', 'stTvAgent',
  'bfSeason', 'bfEpisode', 'bfTitle', 'bfImdb', 'bfLanguage', 'bfRelease',
  'bfSkipStart', 'bfSkipEnd', 'bfSkipKind', 'bfSkipScope', 'bfSkipAuto',
  'bfSeriesName', 'bfSeriesContext',
  'bfContextSeries', 'bfContextStyle', 'bfContextSynopsis', 'bfContextTerms',
]);

// Kasıtlı geçici: arama/süzgeç kutuları, diyalog alanları, menü <details> öğeleri,
// oturum-içi oynatıcı durumu, araç çalışma argümanları, ölü taşıyıcılar.
const TRANSIENT = new Set([
  'aiChatText', 'aiContextPreview', 'appDialogInput', 'appMenu', 'appModeMenu', 'audioTrack',
  'browserAddress', 'browserAnalysisTools', 'browserCommandPaletteInput',
  'browserDiagnosticsFilter', 'browserDownloadsFilter', 'browserDownloadsSearch',
  'browserFeatures', 'browserFindInput', 'browserMoreMenu', 'browserMoreSearch',
  'browserNtpSearch', 'browserPageAdvanced', 'browserPageAutoSites', 'browserPageQuickMenu',
  'browserPlacesFolder', 'browserPlacesSearch', 'browserProfileScope', 'browserQuickPreview',
  'browserRemapChannel', 'browserRemapCue', 'browserRemapPanel', 'browserRemapRecord', 'browserRemapSearch',
  'browserSettingsSearch', 'browserSignalMenu', 'browserSiteChipDetails',
  'browserSplitMenu', 'browserSplitSecondary', 'browserSubtitleReview',
  'browserSyncChannel', 'browserSyncOffset', 'browserSyncStep',
  'browserTrackSelect', 'browserTrackSelect2', 'browserTranslateMenu',
  'browserVideoAnalysisTools', 'browserVideoSubtitles', 'browserViewSettings',
  'browserWatchTools', 'browserWorkspaceSelect',
  'bvaCropH', 'bvaCropW', 'bvaCropX', 'bvaCropY', 'bvaEnd', 'bvaInterval', 'bvaStart',
  'clipStart', 'clipEnd', 'cueSearch', 'historySearch',
  'invLoginPassword', 'invLoginUsername',
  'modelBenchmarkCompare', 'modelBenchmarkSeconds', 'modelBenchmarkStart',
  'pdfReaderPage', 'playerAudioLock', 'playerChapters', 'playerEmbeddedSubSelect',
  'playerHeadMore', 'playerLayoutQuickMenu', 'playerLibraryFilter', 'playerLibrarySearch',
  'playerLibrarySearchScope', 'playerMore', 'playerQuality', 'playerQuickYtUrl', 'playerSeek',
  'playerSourceSelect', 'playerSpeedMenu', 'playerStreamAudio', 'playerSubSelect', 'playerSubSelect2',
  'playerSubtitleDisplay', 'playerYtSubLang', 'playerYtUrl', 'previewSearch',
  'researchQuery', 'researchStatus', 'researchTag', 'researchType', 'runtimeMaintenance',
  'shiftSeconds', 'sideSubtitleLayoutMenu', 'sleepTimer', 'stPlaylistName', 'stSearchInput',
  'subtitleActionsMenu', 'subtitleEditBox', 'subtitleFindField', 'subtitleFindText', 'subtitleReplaceText',
  'youtubeUrl',
  // Oturum-içi sağlayıcı kimlikleri (istek başına gönderilir, saklanmaz)
  'bfApiKey', 'bfUsername', 'bfPassword', 'bfSemanticQuery',
]);

test('renderer ve settings-security persist listeleri birebir aynı', () => {
  const grab = (name) => {
    const m = RENDERER.match(new RegExp(`${name}\\s*=\\s*\\[([\\s\\S]*?)\\]`));
    assert.ok(m, `${name} renderer.js'te bulunamadı`);
    return (m[1].match(/'([^']+)'/g) || []).map((s) => s.slice(1, -1));
  };
  assert.deepStrictEqual(grab('PERSIST_VALUE_CONTROLS'), [...PERSIST_VALUE_CONTROLS],
    'renderer PERSIST_VALUE_CONTROLS kaymış — yeni kontrol iki listeye de eklenmeli');
  assert.deepStrictEqual(grab('PERSIST_CHECKBOX_CONTROLS'), [...PERSIST_CHECKBOX_CONTROLS],
    'renderer PERSIST_CHECKBOX_CONTROLS kaymış');
});

test('index.html form kontrollerinin tamamı sınıflandırılmış (persist/diğer-depo/geçici)', () => {
  const ids = new Set();
  for (const m of HTML.matchAll(/<(input|select|textarea|details)\b[^>]*?\bid="([^"]+)"/g)) {
    const head = m[0].toLowerCase();
    if (m[1] === 'input' && /type="(button|submit|reset|file)"/.test(head)) continue;
    ids.add(m[2]);
  }
  const persist = new Set([...PERSIST_VALUE_CONTROLS, ...PERSIST_CHECKBOX_CONTROLS]);
  const missing = [...ids].filter((id) => !persist.has(id) && !OTHER_STORE.has(id) && !TRANSIENT.has(id));
  assert.deepStrictEqual(missing, [], 'sınıflandırılmamış kontroller: ' + missing.join(', '));
  // Listeler de güncel kalmalı: artık DOM'da olmayan giriş olmamalı.
  const stale = [...OTHER_STORE, ...TRANSIENT].filter((id) => !ids.has(id));
  assert.deepStrictEqual(stale, [], 'DOM\'da olmayan sınıf girişleri: ' + stale.join(', '));
  const stalePersist = [...persist].filter((id) => !ids.has(id));
  assert.deepStrictEqual(stalePersist, [], 'DOM\'da olmayan persist girişleri: ' + stalePersist.join(', '));
});

function loadPersistSlice(elements) {
  const start = RENDERER.indexOf('const PERSIST_VALUE_CONTROLS');
  const end = RENDERER.indexOf('let _saveTimer');
  const els = new Map(elements.map((el) => [el.id, el]));
  const ctx = {
    Set, Array, JSON, String, Number, Object,
    Event: class { constructor(type) { this.type = type; } },
    $: (id) => els.get(id),
    player: {},
    syncPlayerSpeedControl: () => null,
    updateGpuBadge: () => {},
    window: {},
  };
  ctx.globalThis = ctx;
  vm.createContext(ctx);
  vm.runInContext(
    `${RENDERER.slice(start, end)}\nthis.__collect = collectUiSettings; this.__apply = applyUiSettings;`,
    ctx);
  return ctx;
}

test('select[multiple] collect→apply tam tur (SponsorBlock kategorileri)', () => {
  const mkMulti = (id, values) => ({
    id, tagName: 'SELECT', multiple: true, events: [],
    options: values.map((value) => ({ value, selected: false })),
    get selectedOptions() { return this.options.filter((o) => o.selected); },
    dispatchEvent(e) { this.events.push(e.type); },
  });
  const el = mkMulti('browserSponsorCategories', UI_MULTI_VALUE_ENUMS.browserSponsorCategories);
  el.options[0].selected = true; // sponsor
  el.options[3].selected = true; // intro
  const ctx = loadPersistSlice([el]);
  const collected = ctx.__collect();
  // vm-realm dizileri assert.deepStrictEqual'e giremez — JSON karşılaştır.
  assert.strictEqual(JSON.stringify(collected.browserSponsorCategories), JSON.stringify(['sponsor', 'intro']),
    'çok-seçim collect yalnız ilk seçeneği değil tümünü toplamalı');
  // Restart simülasyonu: yeni DOM'da apply, sonra yeniden collect.
  const el2 = mkMulti('browserSponsorCategories', UI_MULTI_VALUE_ENUMS.browserSponsorCategories);
  const ctx2 = loadPersistSlice([el2]);
  ctx2.__apply({ browserSponsorCategories: [...collected.browserSponsorCategories] });
  const recollected = ctx2.__collect();
  assert.strictEqual(JSON.stringify(recollected.browserSponsorCategories), JSON.stringify(['sponsor', 'intro']),
    'geri yükleme çoklu seçimi aynen kurmalı');
  assert.ok(el2.events.includes('change'), 'geri yükleme change tetiklemeli');
});

test('sanitize: çok-seçim alanında bozuk tip/değer strict modda reddedilir', () => {
  const base = { glossary: [], ui: {} };
  const viaBackup = (value) => JSON.stringify(createBackupPayload(
    { ...base, ui: { browserSponsorCategories: value } }, {}, [], new Date(0)));
  assert.throws(() => parseImportText(viaBackup('sponsor'), {}), /dizi olmalıdır/);
  assert.throws(() => parseImportText(viaBackup(['sponsor', 'bozuk']), {}), /geçersiz/);
  const ok = parseImportText(viaBackup(['sponsor', 'intro']), {});
  assert.deepStrictEqual(ok.settings.ui.browserSponsorCategories, ['sponsor', 'intro']);
});

test('yeni persist edilen kontrollerin enum değerleri sanitize\'dan geçer', () => {
  const ui = {
    timelineZoom: '120', aiTranscriptScope: 'full', browserPageScope: 'whole',
    browserExportFormat: 'ass', browserExportTiming: 'original',
    pdfExportFormat: 'html', pdfTargetLanguage: 'de',
    subtitleFindCase: true, subtitleFindWhole: false,
  };
  const backup = JSON.stringify(createBackupPayload({ glossary: [], ui }, {}, [], new Date(0)));
  const imported = parseImportText(backup, {});
  assert.deepStrictEqual(imported.settings.ui, ui, 'yeni kontroller tam turda kayıpsız dönmeli');
});

console.log(`settings-ui-persist-roundtrip: ${passed} kontrol geçti`);
