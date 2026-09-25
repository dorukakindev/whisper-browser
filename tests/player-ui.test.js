/**
 * Oynatıcı arayüz kablolama testleri (kaynak üzerinden, DOM'suz).
 *
 * Neden var: oynatıcıya eklenen üst düğmeler bir süre "çalışmıyor" göründü.
 * İkisi de sebep sözdizimi değil, KABLOLAMA hatasıydı:
 *   1. Üst düğmeler setSettingsDrawer(TRUE) çağırıyordu — panel bir kez
 *      açıldıktan sonra aynı düğmeye basmak hiçbir şey yapmıyordu.
 *   2. Yan panel düğmesi yalnızca 'sidebar-collapsed' sınıfına bakıyordu;
 *      sinema modunda panel CSS ile display:none olduğu için sınıfı açıp
 *      kapatmak ekranda hiçbir değişiklik yaratmıyordu.
 * Ayrıca HTML'e eklenip hiç bağlanmayan düğmeleri de yakalar.
 *
 * Çalıştırma:  node tests/player-ui.test.js
 */
const fs = require('fs');
const path = require('path');

const SRC = path.join(__dirname, '..', 'src', 'renderer');
const js = fs.readFileSync(path.join(SRC, 'renderer.js'), 'utf-8');
const html = fs.readFileSync(path.join(SRC, 'index.html'), 'utf-8');
const css = fs.readFileSync(path.join(SRC, 'styles.css'), 'utf-8')
  + fs.readFileSync(path.join(SRC, 'browser-chrome.css'), 'utf-8');
const browserSettingsRegistry = require('../src/browser-settings-registry');

if (!html.includes('id="pickInputFolder"') || !html.includes('id="inputDir"')) {
  throw new Error('Girdi klasörü seçme arayüzü eksik.');
}
if (!js.includes('selectInputFolder()')) {
  throw new Error('Girdi klasörü seçimi renderer IPC köprüsüne bağlı değil.');
}
if (!/downloadYoutube\(\{[\s\S]*?inputDir:\s*state\.inputDir/.test(js)) {
  throw new Error('Video indirmesi Girdi klasörüne yönlenmiyor.');
}
if (!/downloadYoutubeSubs\(\{[\s\S]*?inputDir:\s*state\.inputDir/.test(js)) {
  throw new Error('Hazır kaynak altyazı indirmesi Girdi klasörüne yönlenmiyor.');
}

// oynatıcı katmanını ayır
const li = html.indexOf('id="playerLayer"');
const lj = html.indexOf('</body>');
if (li < 0 || lj < 0) {
  console.error('index.html icinde oynatici katmani bulunamadi.');
  process.exit(1);
}
const layer = html.slice(li, lj);

let pass = 0;
const failures = [];
function test(name, fn) {
  try { fn(); pass++; console.log(`  PASS  ${name}`); }
  catch (e) { failures.push(`${name}: ${e.message}`); console.log(`  FAIL  ${name} — ${e.message}`); }
}
function assert(cond, msg) { if (!cond) throw new Error(msg || 'assert'); }

test('VRAM uyarısı motor ve batch boyutunu hesaba katıyor', () => {
  const start = js.indexOf('function estimateVramMib');
  const end = js.indexOf('// ===== GPU rozeti', start);
  assert(start > 0 && end > start, 'VRAM tahmin fonksiyonu bulunamadı');
  const controls = {
    model: { value: 'large-v3' }, computeType: { value: 'float16' },
    engine: { value: 'faster' }, batchSize: { value: '1' }, diarize: { checked: false },
  };
  const estimate = new Function('$', `${js.slice(start, end)}; return estimateVramMib;`)
    ((id) => controls[id]) ;
  const sequential = estimate();
  controls.engine.value = 'faster-batched'; controls.batchSize.value = '32';
  const batched = estimate();
  controls.engine.value = 'whisperx';
  const aligned = estimate();
  assert(batched > sequential, 'batch artışı tahmini değiştirmiyor');
  assert(aligned > batched, 'WhisperX hizalama payı yok');
  assert(js.includes("$('batchSize').addEventListener('input', updateGpuBadge)"),
    'batch kaydırıcısı rozeti canlı güncellemiyor');
});

test('Chromium donanım hızlandırma durumu açılış günlüğünde görünür', () => {
  const init = js.slice(js.indexOf('// Ortam kontrolü:'), js.indexOf('// Seçili model+motor'));
  assert(/env\.gpuDiagnostics/.test(init), 'doğrulanmış Chromium GPU tanılaması okunmuyor');
  assert(/renderBrowserGpuDiagnostics\(env\.gpuDiagnostics\)/.test(init),
    'GPU tanılama paneli açılış verisiyle güncellenmiyor');
  assert(!/gpuFeatures[\s\S]{0,300}\.some\(/.test(init),
    'tek bir etkin özellik tüm GPU hattını etkin gösteriyor');
  assert(/video çözme:/.test(init) && /WebGL:/.test(init) && /kompozisyon:/.test(init),
    'video decode, WebGL ve kompozisyon durumu kullanıcıya gösterilmiyor');
});

test('tarayıcı modunda oynatma kısayolları web videosuna gider', () => {
  const start = js.lastIndexOf("document.addEventListener('keydown'");
  const body = js.slice(start, js.indexOf('// Gecikme/hiz/ses', start));
  assert(/workspaceMode === 'browser'/.test(body), 'tarayıcı kısayol dalı yok');
  for (const command of ['play-pause', 'seek-relative', 'mute', 'volume-relative']) {
    assert(body.includes(`'${command}'`), `${command} web videosuna bağlı değil`);
  }
  assert(/browserCommand\(command, value\)/.test(body), 'komut sekme kimlikli tarayıcı IPC kanalına gitmiyor');
  assert(/stepBrowserFrame/.test(body), 'duraklatılmış web videosunda kare adımı bağlı değil');
  const frame = js.slice(js.indexOf('async function stepBrowserFrame'), js.indexOf('async function nudgeSpeed'));
  assert(/browserCommand\('frame-step'/.test(frame), 'kare adımı web videosu IPC komutunu kullanmıyor');
  assert(/Number\.isFinite\(currentTime\)/.test(frame), '0. saniyedeki kare adımı eski konumu koruyor');
  const speed = js.slice(js.indexOf('async function nudgeSpeed'), js.indexOf('// Ses cubugu'));
  assert(/browserCommand\('speed', target\)/.test(speed), 'hız kısayolu web videosunu hedeflemiyor');
  assert(/scheduleBrowserMediaPreferenceSync\(\)/.test(speed),
    'hız kısayolu yeni değeri site fightback tercihine taşımıyor');
});

test('özel web oynatma hızında kısayol sıralı komşu hıza geçiyor', () => {
  const start = js.indexOf('function steppedPlaybackRate');
  const end = js.indexOf('function captureWatchPrefs', start);
  assert(start > 0 && end > start, 'hız basamak yardımcısı bulunamadı');
  const steppedPlaybackRate = new Function(
    `${js.slice(start, end)}; return steppedPlaybackRate;`)();
  const options = [.5, .75, 1, 1.25, 1.5, 2, 1.1].map((value) => ({ value: String(value) }));
  assert(steppedPlaybackRate(options, 1.1, -1) === 1, 'özel hızdan azaltma 1× değerine gitmiyor');
  assert(steppedPlaybackRate(options, 1.1, 1) === 1.25, 'özel hızdan artırma 1.25× değerine gitmiyor');
  const speed = js.slice(js.indexOf('async function nudgeSpeed'), js.indexOf('// Ses cubugu'));
  assert(/steppedPlaybackRate\(sel\.options, sel\.value, dir\)/.test(speed), 'hız kısayolu sıralı yardımcıyı kullanmıyor');
});

test('tarayıcı A-B döngüsü ve otomatik dur web video zamanını kullanıyor', () => {
  const cue = js.slice(js.indexOf('function renderBrowserCueAt'), js.indexOf('function applyBrowserTracks'));
  assert(/player\.abB/.test(cue) && /browserCommand\('seek', player\.abA\)/.test(cue),
    'A-B döngüsü web videosunu geri sarmıyor');
  const policy = js.slice(js.indexOf('function applyPlaybackLearningPolicy'), js.indexOf('function renderCue()'));
  assert(/autoPause: player\.autoPause/.test(policy)
      && /pause-at-cue-end/.test(policy) && /browserCommand\('pause'\)/.test(policy),
    'otomatik dur politika katmanından web videosunu durdurmuyor');
  const toggle = js.slice(js.indexOf('function toggleAbLoop'), js.indexOf('function renderAbMarkers'));
  assert(/workspaceMode === 'browser' \? player\.browserTime/.test(toggle), 'A/B noktaları web zamanından alınmıyor');
});

test('browser çevirisi her iki altyazı alanından da ayrı override olarak düzenleniyor', () => {
  const start = js.indexOf('function openCueEditor');
  const editor = js.slice(start, js.indexOf("if ($('cueSearch'))", start));
  assert(/function openCueEditor\(secondary = false\)/.test(editor)
    && /browserLoadedTrack\(secondary\)/.test(editor),
  'editör ikincil çeviri kanalını seçemiyor');
  assert(/browserLoadedTrack\(!!browserContext\.secondary\)/.test(editor),
    'kaydetme veya modele dönme işlemi düzenlenen kanalı doğrulamıyor');
  assert(/subtitleOverlay2[\s\S]*openCueEditor\(true\)/.test(js),
    'ikincil çeviri katmanı editörü açmıyor');
});

test('web profil geri yükleme her asenkron komuttan sonra güncelliği denetliyor', () => {
  const restore = js.slice(js.indexOf('async function restoreWatchProfile'), js.indexOf('function makeWatchAction'));
  assert(/const stillCurrent =/.test(restore), 'profil güncellik yardımcısı yok');
  const checks = restore.match(/if \(!stillCurrent\(\)\) return;/g) || [];
  assert(checks.length >= 3, 'hız, ses ve mute komutlarından sonra ayrı güncellik denetimi yok');
});

test('web medya probu üst üste binmiyor ve gezinme sonrası eski sonucu yayınlamıyor', () => {
  const main = fs.readFileSync(path.join(__dirname, '..', 'src', 'main.js'), 'utf-8');
  const poll = main.slice(main.indexOf('async function probeActiveBrowserMedia'), main.indexOf('function stopBrowserPolling'));
  assert(/browserMediaBusy/.test(poll), 'medya probunda busy koruması yok');
  assert(/generation !== browserStateGeneration|isCurrentBrowserContext\(context\)/.test(poll), 'eski tarama kuşağı elenmiyor');
  assert(/activeContents\.getURL\(\) !== pageUrl/.test(poll), 'gezinme sonrası eski medya sonucu elenmiyor');
  assert(/finally\s*{\s*if \(generation === browserStateGeneration\) browserMediaBusy = false/.test(poll),
    'eski medya probu yeni probun busy durumunu temizleyebiliyor');
});

test('HTML5 altyazı probu aynı uzunluktaki orta cue düzeltmelerini kaçırmıyor', () => {
  const main = fs.readFileSync(path.join(__dirname, '..', 'src', 'main.js'), 'utf-8');
  const probe = main.slice(main.indexOf('function browserTrackProbeScript'),
    main.indexOf('function browserCaptureHookScript'));
  assert(/let fingerprint = 2166136261/.test(probe) && /previousPrefixFingerprint/.test(probe),
    'izin tamamını izleyen parmak izi veya büyüyen iz kısa yolu yok');
  assert(/previous\.length === count && previous\.fingerprint === fingerprint/.test(probe),
    'aynı uzunluktaki değişmiş cue listesi yalnız kuyrukla karşılaştırılıyor');
  assert(!/previous\.tail/.test(probe), 'eski yalnız-son-cue karşılaştırması hâlâ kullanılıyor');
});

test('tarayıcı sekmesi güncellenirken odak ve yüklenme durumu korunuyor', () => {
  const render = js.slice(js.indexOf('function renderBrowserTabs()'),
    js.indexOf('function updateBrowserTabPresentation'));
  assert(/focusedTabId/.test(render) && /focus\(\{ preventScroll: true \}\)/.test(render),
    'sekme çizimi klavye odağını geri yüklemiyor');
  assert(/aria-busy/.test(render) && /activeButton\?\.isConnected/.test(render)
    && /scrollIntoView/.test(render), 'yüklenme durumu veya aktif sekmenin görünürlüğü korunmuyor');
  const navigation = js.slice(js.indexOf('function updateBrowserNavigation'),
    js.indexOf('function renderBrowserCueAt'));
  assert(/updateBrowserTabPresentation\(tab\)/.test(navigation),
    'gezinti olayı tüm sekme şeridini gereksiz yere yeniden kuruyor');
});

test('aynı medyadaki SPA adres değişimi yakalanmış altyazıları sıfırlamıyor', () => {
  const main = fs.readFileSync(path.join(__dirname, '..', 'src', 'main.js'), 'utf-8');
  const inPage = main.slice(main.indexOf("wc.on('did-navigate-in-page'"),
    main.indexOf("wc.on('page-title-updated'"));
  assert(/const mediaChanged = !tab\.mediaId \|\| tab\.mediaId !== identity\.key/.test(inPage),
    'ana süreç SPA geçişinde kararlı medya kimliğini karşılaştırmıyor');
  assert(/if \(mediaChanged\) \{[\s\S]*stopBrowserManga/.test(inPage)
    && /if \(mediaChanged && tab\.id === browserActiveTabId\)/.test(inPage),
  'aynı medya içindeki SPA geçişi manga veya altyazı durumunu hâlâ sıfırlıyor');

  const navigation = js.slice(js.indexOf('function updateBrowserNavigation'),
    js.indexOf('function renderBrowserCueAt'));
  assert(/previousMediaId/.test(navigation) && /previousMediaId !== nextMediaId/.test(navigation),
    'renderer medya kimliği yerine yalnız URL değişimine bakıyor');
  assert(/if \(!options\.preserveWorkspace && mediaChanged\)/.test(navigation),
    'renderer aynı medyadaki adres değişiminde altyazı çalışma alanını temizliyor');
  assert(/if \(pageChanged\) \{[\s\S]*player\.browserPageUrl = data\.url/.test(navigation),
    'korunan SPA geçişinde yeni adres state içine yazılmıyor');
});

test('meşgulken seçilen web altyazısı iş bitince aynı sekmede otomatik devam ediyor', () => {
  const flow = js.slice(js.indexOf('function clearDeferredBrowserTrackAction'),
    js.indexOf('async function completeSelectedBrowserTranslation'));
  assert(/browserDeferredTrackAction/.test(flow)
    && /state\.running \|\| state\.queueRunning \|\| player\.browserTranslatePreparing/.test(flow),
  'meşgul durumdaki web altyazısı eylemi beklemeye alınmıyor');
  assert(/pending\.tabId !== player\.browserActiveTabId \|\| !trackExists/.test(flow),
    'bekleyen altyazı eylemi sekme ve iz kimliğini yeniden doğrulamıyor');
  assert(/await useBrowserTrack\(pending\.translate, pending\.trackId\)/.test(flow),
    'iş bittikten sonra bekleyen altyazı eylemi otomatik sürdürülmüyor');
  const clear = js.slice(js.indexOf('function clearBrowserTracks'),
    js.indexOf('function renderBrowserTracks'));
  assert(/clearDeferredBrowserTrackAction\(\)/.test(clear),
    'medya değişiminde bekleyen eski altyazı eylemi iptal edilmiyor');
});

test('tarayıcı geçmiş paneli klavyeyle kapanıyor ve gezinti durumu anlaşılır', () => {
  assert(/browserPlacesPanel[^\n]*addEventListener\('keydown'/.test(js)
    && /event\.key !== 'Escape'/.test(js), 'arama alanındayken Escape geçmiş panelini kapatmıyor');
  const places = js.slice(js.indexOf('function setBrowserPlacesOpen'),
    js.indexOf('function renderBrowserDiagnostics'));
  assert(/aria-hidden/.test(places) && /browserPlacesSearch/.test(places) && /\.focus\(/.test(places),
    'geçmiş panelinin erişilebilir görünürlük veya odak yönetimi eksik');
  const navigation = js.slice(js.indexOf('function setBrowserLoadingState'),
    js.indexOf('function renderBrowserCueAt'));
  assert(/Yüklemeyi durdur/.test(navigation) && /HTTPS bağlantısı/.test(navigation),
    'yenile/durdur veya bağlantı güvenliği kullanıcıya açıklanmıyor');
  assert(/browser-reload-spin/.test(css) && /browser-tab-loading/.test(css),
    'yüklenme geri bildiriminin görsel durumu eksik');
  const tabs = js.slice(js.indexOf('function renderBrowserTabs()'),
    js.indexOf('function updateBrowserPinMenu()'));
  assert(/browser-tab-favicon/.test(tabs) && /referrerPolicy\s*=\s*'no-referrer'/.test(tabs),
    'sekme favicon verisi güvenli biçimde çizilmiyor');
  assert(/\.browser-tab-favicon\s*\{/.test(css) && /\.browser-tab-label\s*\{/.test(css),
    'favicon veya uzun sekme etiketi yerleşimi eksik');
});

test('hızlı tarayıcı gezinmesinde eski sonuç yeni sekme durumunu ezmiyor', () => {
  const navigate = js.slice(js.indexOf('async function navigateBrowserFromAddress'),
    js.indexOf("if ($('workspacePlayerMode'))"));
  assert(/const navigateSeq = \+\+player\.browserNavigateSeq/.test(navigate),
    'adres gezinmesinin yarış sırası yok');
  assert(/navigateBrowser\(value, tabId\)/.test(navigate)
    && /navigateSeq !== player\.browserNavigateSeq \|\| tabId !== player\.browserActiveTabId/.test(navigate),
  'geciken gezinme cevabı istek ve sekme kimliğini doğrulamıyor');
  assert(/setBrowserLoadingState\(true\)/.test(navigate)
    && /setBrowserLoadingState\(false\)/.test(navigate),
  'başarılı/başarısız gezinmede yüklenme durumu dengeli yönetilmiyor');
  assert(navigate.indexOf('closeBrowserAddressResults()') >= 0
    && navigate.indexOf('closeBrowserAddressResults()') < navigate.indexOf('navigateBrowser(value, tabId)'),
  'gezinme başlarken eski adres önerileri native web görünümünü örtmeye devam ediyor');
  assert(navigate.indexOf("$('browserAddress')?.blur?.()") >= 0,
    'gezinme adres odağını sayfaya bırakmadığı için öneriler yeniden açılabilir');
  const addressClose = js.slice(js.indexOf('function closeBrowserAddressResults()'),
    js.indexOf('function renderBrowserAddressResults('));
  assert(/clearTimeout\(browserAddressSearchTimer\)/.test(addressClose)
    && /browserAddressSearchSeq \+= 1/.test(addressClose),
  'adres önerisi kapanışı bekleyen timer ve async arama sonucunu geçersiz kılmıyor');
});

test('tarayıcı adres alanı URL yanında arama ifadesini de doğru tanımlıyor', () => {
  assert(/<input type="text" id="browserAddress"/.test(html),
    'arama destekleyen adres alanı yalnız URL kabul eden kontrol olarak tanımlanmış');
  assert(/placeholder="Web adresi yazın veya arayın"/.test(html)
    && /aria-label="Web adresi veya arama"/.test(html),
  'adres alanı arama yeteneğini kullanıcıya veya ekran okuyucuya açıklamıyor');
});

test('sekme sesi ve tarayıcı gezinme düğmeleri görünür hata yoluna sahip', () => {
  const handlers = js.slice(js.indexOf("if ($('browserTabStrip')) $('browserTabStrip').addEventListener('click'"),
    js.indexOf("if ($('browserCaptureToggle'))"));
  assert(/muteBrowserTab\(tabId\)\.catch\(\(\) => null\)/.test(handlers)
    && /Sekme sesi değiştirilemedi/.test(handlers), 'sekme sesi IPC hatası yakalanmıyor');
  assert(/async function runBrowserChromeCommand/.test(handlers)
    && /Tarayıcı komutu tamamlanamadı/.test(handlers),
  'geri/ileri/yenile komutlarının çözümlenen hata sonucu kullanıcıya gösterilmiyor');
});

test('tarayıcı modalı WebContentsView katmanını geçici olarak gizliyor', () => {
  const main = fs.readFileSync(path.join(__dirname, '..', 'src', 'main.js'), 'utf-8');
  const preload = fs.readFileSync(path.join(__dirname, '..', 'src', 'preload.js'), 'utf-8');
  assert((preload.match(/setBrowserOccluded:/g) || []).length === 1, 'modal okluzyon köprüsü yinelenmiş veya eksik');
  const open = js.slice(js.indexOf('function openManagedModal('), js.indexOf('function closeManagedModal('));
  const close = js.slice(js.indexOf('function closeManagedModal('), js.indexOf("document.addEventListener('keydown'", js.indexOf('function closeManagedModal(')));
  assert(open.includes('syncBrowserOcclusion();'), 'modal açılışı ortak katman kontrolüne bağlı değil');
  assert(close.includes('syncBrowserOcclusion();'), 'modal kapanışı ortak katman kontrolüne bağlı değil');
  assert(/ipcMain\.handle\('browser:setOccluded'/.test(main), 'okluzyon IPC işleyicisi yok');
});

test('modal yarışı onay sözünü açıkta bırakmıyor ve genel kısayolları engelliyor', () => {
  const modalOwner = js.slice(js.indexOf('// ===== Ortak modal/dialog sahibi ====='),
    js.indexOf('// ===== Birleşik işler merkezi ====='));
  assert(/let _queuedModalOpen = null/.test(modalOwner), 'ikinci modal için bekleme yuvası yok');
  assert(/_queuedModalOpen = \{ modal, initialFocus \}/.test(modalOwner),
    'ikinci modal açık modalı kapatmak yerine sıraya alınmıyor');
  assert(/openManagedModal\(queued\.modal, queued\.initialFocus, restore\)/.test(modalOwner),
    'bekleyen modal mevcut modal kapandıktan sonra açılmıyor');
  const globalShortcuts = js.slice(js.indexOf('// ===== Klavye kısayolları ====='),
    js.indexOf('// ===== Ayarları dışa/içe aktar ====='));
  assert(/if \(_activeModal\) return;/.test(globalShortcuts),
    'modal açıkken genel Ctrl+Enter/Escape kısayolları engellenmiyor');
});

test('sayfalı altyazı listesi düşük güven durumunu kendi kapsamında hesaplıyor', () => {
  const cueList = js.slice(js.indexOf('function cueHasLowConfidence'), js.indexOf('function highlightCueRow'));
  assert(/function cueHasLowConfidence\(cue\)/.test(cueList), 'düşük güven yardımcısı yok');
  const uses = cueList.match(/const lowConfidence = cueHasLowConfidence\(c\)/g) || [];
  assert(uses.length >= 2, 'filtreleme ve görünür satır çizimi aynı düşük güven hesabını kullanmıyor');
});

test('tarayıcı yaşam döngüsü yerel altyazıyı koruyor ve eski çeviriyi durduruyor', () => {
  assert(/function saveLocalSubtitleWorkspace/.test(js) && /function restoreLocalSubtitleWorkspace/.test(js),
    'yerel altyazı çalışma alanı saklanıp geri yüklenmiyor');
  const mode = js.slice(js.indexOf('function setWorkspaceMode'), js.indexOf('async function navigateBrowserFromAddress'));
  assert(/saveLocalSubtitleWorkspace\(\)/.test(mode) && /restoreLocalSubtitleWorkspace\(\)/.test(mode),
    'tarayıcı geçişi yerel altyazı çalışma alanına bağlı değil');
  const clear = js.slice(js.indexOf('function clearBrowserTracks'), js.indexOf('function renderBrowserTracks'));
  assert(/stopBrowserTranslation/.test(clear) && /player\.cues2 = \[\]/.test(clear),
    'iz temizliği eski scheduler veya çeviri cue durumunu bırakıyor');
});

test('tarayıcı kontrol olayları sekme kapısından önce ve sayısal medya değerleri güvenli işleniyor', () => {
  const events = js.slice(js.indexOf('if (window.api.onBrowserEvent)'), js.indexOf("window.addEventListener('resize'"));
  assert(events.indexOf("event.type === 'live-asr-state' && event.active === false") < events.indexOf('if (event.tabId)'),
    'Canlı ASR durdurma olayı sekme kapısında kaybolabilir');
  assert(/const nextVolume = Number\(event\.media\.volume\)[\s\S]{0,100}Number\.isFinite\(nextVolume\)/.test(events),
    'medya olayında NaN ses koruması yok');
});

test('yeni sekme isteği in-flight süresince tekilleştiriliyor', () => {
  const create = js.slice(js.indexOf('async function createBrowserTab'), js.indexOf('async function closeBrowserTab'));
  assert(/if \(player\.browserTabCreateBusy\) return null/.test(create), 'çift tıklama kısa devresi yok');
  assert(/player\.browserTabCreateBusy = true/.test(create)
    && /finally[\s\S]{0,180}player\.browserTabCreateBusy = false/.test(create),
    'yeni sekme düğmesi hata dahil tüm yollarda geri açılmıyor');
  assert(/player\.browserTabs\.length >= MAX_BROWSER_TABS/.test(create)
    && /updateBrowserNewTabAvailability/.test(create),
  'sekme sınırı arayüzde uygulanmıyor veya kullanıcıya açıklanmıyor');
  assert(/createdTabId === player\.browserActiveTabId/.test(create)
    && /player\.workspaceMode === 'browser'/.test(create),
  'geciken yeni sekme cevabı gizli adres alanına odağı taşıyabiliyor');
});

test('geciken tarayıcı görünümü oynatıcı modunun üzerine geri açılamıyor', () => {
  const show = js.slice(js.indexOf('async function showBrowserWorkspace'),
    js.indexOf('function setWorkspaceMode'));
  const mode = js.slice(js.indexOf('function setWorkspaceMode'),
    js.indexOf('async function navigateBrowserFromAddress'));
  assert(/const workspaceSeq = \+\+player\.browserWorkspaceSeq/.test(show)
    && /workspaceSeq === player\.browserWorkspaceSeq/.test(show),
  'tarayıcı görünümü hazırlama isteğinin kuşak kontrolü yok');
  assert(/player\.workspaceMode !== 'browser'[\s\S]{0,100}hideBrowser/.test(show),
    'geciken görünüm oynatıcı modunda ana süreçten tekrar gizlenmiyor');
  assert(/mode !== previousMode\) player\.browserWorkspaceSeq \+= 1/.test(mode),
    'çalışma alanı değişimi bekleyen görünüm isteğini geçersiz kılmıyor');
  const activate = js.slice(js.indexOf('async function activateBrowserTabAndFocus'),
    js.indexOf('function browserSlotBounds'));
  assert(/if \(!activated \|\| activated\.id !== tabId/.test(activate),
    'başarısız sekme etkinleştirme eski sekmeye klavye odağı taşıyor');
});

test('kapanış son ayar değişikliğini senkron kaydeder ve çalışma alanı geçişini temizler', () => {
  const unload = js.slice(js.indexOf("window.addEventListener('beforeunload'"),
    js.indexOf('// "Sırada dur"'));
  assert(/saveSettingsSync\?\.\(appSettingsPayload\(\)\)/.test(unload),
    'kapanış anında debounce içindeki ayarlar kaydedilmiyor');
  const mode = js.slice(js.indexOf('function setWorkspaceMode'),
    js.indexOf('async function navigateBrowserFromAddress'));
  assert(/player\.abA = null[\s\S]{0,80}player\.abB = null/.test(mode),
    'çalışma alanı değişince eski A-B aralığı temizlenmiyor');
  assert(/clearTimeout\(_liveCueRenderTimer\)/.test(mode),
    'çalışma alanı değişince gecikmiş canlı altyazı çizimi iptal edilmiyor');
});

test('oynatıcı kısayolları odaklı düğme ve bağlantılarda çalışmaz', () => {
  const shortcuts = js.slice(js.indexOf('// Klavye: oynatıcı açıkken'),
    js.indexOf('// Gecikme/hiz/ses'));
  assert(/tag === 'button'/.test(shortcuts) && /tag === 'a'/.test(shortcuts),
    'etkileşimli öğe odağı genel oynatıcı kısayollarından korunmuyor');
});

test('sekme kapatma ve çalışma alanı açma eşzamanlı istekleri tekilleştiriliyor', () => {
  const close = js.slice(js.indexOf('async function closeBrowserTab'),
    js.indexOf('async function activateBrowserTabAndFocus'));
  assert(/player\.browserClosingTabs\.has\(tabId\)/.test(close)
    && /player\.browserClosingTabs\.add\(tabId\)/.test(close)
    && /finally[\s\S]*player\.browserClosingTabs\.delete\(tabId\)/.test(close),
  'aynı sekme için yinelenen kapatma isteği engellenmiyor');
  const workspace = js.slice(js.indexOf("$('browserWorkspaceOpen')?.addEventListener"),
    js.indexOf("$('browserWorkspaceRemove')?.addEventListener"));
  assert(/if \(button\.disabled\) return/.test(workspace)
    && /button\.disabled = true/.test(workspace)
    && /finally[\s\S]*button\.disabled = false/.test(workspace),
  'çalışma alanı açma isteği sürerken düğme yeniden kullanılabiliyor');
  assert(/activateBrowserTabAndFocus\(result\.firstTabId\)/.test(workspace),
    'çalışma alanının eklenen ilk sekmesi görünür hale getirilmiyor');
});

test('tarayıcı adresi ve yerler işlemleri sessiz hata bırakmıyor', () => {
  const address = js.slice(js.indexOf("if ($('browserAddress')) $('browserAddress').addEventListener"),
    js.indexOf("if ($('browserBookmarkToggle'))"));
  assert(/event\.key === 'Escape'/.test(address) && /player\.browserPageUrl/.test(address),
    'adres düzenlemesi Escape ile mevcut sayfa adresine dönemiyor');
  const places = js.slice(js.indexOf("if ($('browserBookmarkToggle'))"),
    js.indexOf('async function runBrowserChromeCommand'));
  for (const message of ['Yer imi değiştirilemedi', 'Tarayıcı geçmişi temizlenemedi',
    'Kayıt kaldırılamadı', 'Çalışma alanı kaydı silinemedi']) {
    assert(places.includes(message), `${message} hata geri bildirimi eksik`);
  }
  assert(/addEventListener\('auxclick'/.test(js) && /event\.button !== 1/.test(js),
    'orta tıklamayla sekme kapatma davranışı eksik');
});

test('kuyruk sıradaki işi done değil süreç exit olayında başlatıyor', () => {
  const done = js.slice(js.indexOf("case 'done':"), js.indexOf("case 'error':"));
  const exit = js.slice(js.indexOf("case 'exit':"), js.indexOf('\n  }\n});', js.indexOf("case 'exit':")));
  assert(!/processNextQueueItem/.test(done), 'done olayı süreç kapanmadan sıradaki işi başlatıyor');
  assert(/processNextQueueItem/.test(exit), 'exit olayı sıradaki kuyruk işini başlatmıyor');
});

// ---- 1. ölü kontrol yok ----
test('oynatıcıdaki her düğmenin yüklenen renderer modüllerinde karşılığı var', () => {
  const loadedScripts = [...html.matchAll(/<script\b[^>]*\bsrc="([^"]+\.js)"/g)]
    .map(match => fs.readFileSync(path.join(SRC, match[1]), 'utf8')).join('\n');
  const tags = [...layer.matchAll(/<button[^>]*id="([A-Za-z0-9_-]+)"[^>]*>/g)];
  assert(tags.length > 30, `beklenenden az dugme bulundu (${tags.length}) — ayirma bozulmus olabilir`);
  // Bir düğme ya id'siyle ya da delegasyon kancasıyla (data-* / sınıf)
  // bağlanmış olmalı. Delegasyonu "ölü" saymak yanlış alarm üretir.
  const wired = (m) => {
    const [tag, id] = [m[0], m[1]];
    if (new RegExp(`['"]${id}['"]`).test(loadedScripts)) return true;
    const hooks = [...tag.matchAll(/\sdata-([a-z-]+?)(?:=|\s|>)/g)].map((d) => d[1]);
    return hooks.some((h) => loadedScripts.includes(`data-${h}`) || loadedScripts.includes(camel(h)));
  };
  const camel = (s) => s.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
  const dead = tags.filter((m) => !wired(m)).map((m) => m[1]);
  assert(dead.length === 0, `renderer.js'te hic gecmeyen dugme: ${dead.join(', ')}`);
});

test('yerel oynatma sırası önceki/sonraki düğmelerine ve ended olayına bağlı', () => {
  assert(/playerPrevMedia['"]\)\.addEventListener\('click'/.test(js), 'önceki video düğmesi bağlı değil');
  assert(/playerNextMedia['"]\)\.addEventListener\('click'/.test(js), 'sonraki video düğmesi bağlı değil');
  const ended = js.indexOf("video.addEventListener('ended'");
  assert(ended > 0, 'video ended dinleyicisi yok');
  const body = js.slice(ended, ended + 300);
  assert(/player\.autoNext/.test(body) && /playPlaylistDelta\(1\)/.test(body), 'otomatik sonraki video çağrısı yok');
});

test('izleme kütüphanesi gerçek kalıcı IPC yöntemlerini kullanıyor', () => {
  for (const name of ['listWatchLibrary', 'updateWatchItem', 'removeWatchItem', 'searchUnifiedLibrary']) {
    assert(js.includes(`window.api.${name}`), `${name} renderer tarafından kullanılmıyor`);
  }
  assert(html.includes('id="playerLibrarySearch"'), 'oynatıcı kütüphanesi arama alanı yok');
  assert(html.includes('id="playerLibraryFilter"'), 'oynatıcı kütüphanesi filtresi yok');
  assert(/id="playerLibraryStatus"[^>]*role="status"[^>]*aria-live="polite"/.test(html),
    'kütüphane sonuç durumu ekran okuyucuya bildirilmiyor');
  assert(/id="playerLibraryList"[^>]*aria-busy="false"/.test(html),
    'kütüphane sonuç listesinde başlangıç meşgul durumu yok');
  assert(/progress\.setAttribute\('role', 'progressbar'\)/.test(js)
    && /aria-valuenow/.test(js) && /aria-valuetext/.test(js),
  'izleme ilerlemesi yalnız görsel renk şeridi olarak kalıyor');
  assert(/\.player-library-status\s*\{[^}]*color:\s*#858589/.test(css)
    && /\.player-library-meta\s*\{[^}]*color:\s*#858589/.test(css),
  'kütüphane durum ve metadata metinleri AA kontrast eşiğinin altında');
});

test('izleme kütüphanesi yalnız oynatıcı-tarayıcı alanında bulunuyor', () => {
  assert(!html.includes('id="watchLibraryCard"'), 'kütüphane ana Whisper ekranında yineleniyor');
  assert(html.includes('id="sideTabLibrary"') && html.includes('data-stab="library"'), 'oynatıcı kütüphane sekmesi yok');
  assert(html.includes('id="playerLibraryPanel"'), 'oynatıcı kütüphane paneli yok');
  assert(!/function renderWatchLibrary\s*\(/.test(js), 'ana ekran kütüphanesinin ölü render kodu kaldı');
  const tabs = js.slice(js.indexOf('function setSideTab'), js.indexOf('// ---- bağlamlı AI'));
  assert(/tab === 'library'/.test(tabs) && /playerLibraryPanel/.test(tabs), 'kütüphane sekmesi panele bağlı değil');
});

test('ana ekran iş geçmişi ile tarayıcı geçmişi açıkça ayrılıyor', () => {
  assert(/<h2>İş geçmişi · <span id="historyCount">/.test(html), 'transkripsiyon kayıtları genel Geçmiş adıyla gösteriliyor');
  assert(/aria-label="İş geçmişinde ara"/.test(html), 'iş geçmişi araması tarayıcı geçmişinden ayırt edilmiyor');
  assert(/<strong>Yer imleri ve geçmiş<\/strong>/.test(html), 'tarayıcı geçmişi kendi bağlamında etiketli değil');
});

test('oynatıcı başlığında aynı kapatma işini yapan ikinci düğme yok', () => {
  assert(!html.includes('id="closePlayer"'), 'geri düğmesine ek olarak aynı işi yapan kapatma düğmesi var');
  assert(/playerBack['"]\)\.addEventListener\('click', closePlayer\)/.test(js), 'tek geri düğmesi oynatıcıyı kapatmıyor');
});

test('senkron açıklaması değişken kayma seçenekleriyle çelişmiyor', () => {
  const sync = html.slice(html.indexOf('<!-- SUBTITLE SYNC TOOL -->'), html.indexOf('<!-- SETTINGS -->'));
  assert(sync.includes('id="syncPiecewise"') && sync.includes('id="syncFixFramerate"'), 'senkron seçenekleri bulunamadı');
  assert(!/Yalnızca\s*<strong>sabit kayma<\/strong>/.test(sync), 'açıklama hâlâ yalnız sabit kayma desteklendiğini söylüyor');
  assert(/yalnız sabit kayma için/.test(sync), 'iki gelişmiş seçenek kapatıldığında sabit kayma davranışı açıklanmıyor');
});

// ---- 2. üst düğmeler anahtar ----
for (const id of ['playerHeadSettings', 'playerLayoutQuick', 'playerQuickDownload']) {
  test(`${id} paneli açıp KAPATABİLİYOR (sabit true değil)`, () => {
    const i = js.indexOf(`$('${id}').addEventListener('click'`);
    assert(i > 0, `${id} icin click dinleyicisi bulunamadi`);
    const body = js.slice(i, i + 320);
    assert(!/setSettingsDrawer\(\s*true\s*\)/.test(body),
      `${id} hala setSettingsDrawer(true) cagiriyor — ikinci tik hicbir sey yapmaz`);
    assert(/toggleDrawerAt\(/.test(body),
      `${id} anahtar yardimcisini (toggleDrawerAt) kullanmiyor`);
  });
}

test('toggleDrawerAt panel zaten hedefteyken kapatıyor', () => {
  const i = js.indexOf('function toggleDrawerAt');
  assert(i > 0, 'toggleDrawerAt tanimi yok');
  const body = js.slice(i, js.indexOf('\n}', i));
  assert(/setSettingsDrawer\(false\)/.test(body), 'kapatma dali yok');
  assert(/drawerIsOpen\(\)/.test(body), 'panelin acik olup olmadigina bakmiyor');
});

// ---- 3. sinema modunda yan panel ----
test('sinema modunda yan panel CSS ile gizleniyor (varsayımın dayanağı)', () => {
  assert(/\.player-layer\.mode-cinema[\s\S]{0,120}display:\s*none/.test(css),
    'mode-cinema .player-side display:none kurali bulunamadi — test varsayimi eskimis');
});

test('yan panel düğmesi görünürlüğü mod ile birlikte değerlendiriyor', () => {
  const i = js.indexOf("$('playerSidebarToggle').addEventListener('click'");
  assert(i > 0, 'playerSidebarToggle dinleyicisi yok');
  const body = js.slice(i, js.indexOf("if ($('playerBookmark'))", i));
  assert(/sidebarIsVisible\(\)/.test(body),
    'dugme yalnizca sinifa bakiyor — sinema modunda ekranda hicbir sey degismez');
  assert(/setViewMode\(/.test(body),
    'sinema modundan cikmiyor — panel geri getirilemez');
  assert(/player\.narrowPanelTakeover = true/.test(body)
    && /responsivePanelTakeoverActive\(\)/.test(body),
  'dar görünümde panel yalnız açık kullanıcı eylemiyle devralınmıyor');
});

test('sidebarIsVisible sinema modunu hesaba katıyor', () => {
  const i = js.indexOf('function sidebarIsVisible');
  assert(i > 0, 'sidebarIsVisible tanimi yok');
  const body = js.slice(i, js.indexOf('\n}', i));
  assert(/viewMode\s*!==\s*'cinema'/.test(body), 'sinema modu kontrolu yok');
  assert(/sidebar-collapsed/.test(body), 'daraltma sinifi kontrolu yok');
});

test('sinemadan çıkınca dönülecek düzen hatırlanıyor', () => {
  assert(/player\.lastSideMode\s*=\s*mode/.test(js), 'setViewMode son yan-panelli modu saklamiyor');
  assert(/playerLastSideMode/.test(js), 'son duzen kalici degil (localStorage yok)');
});

// ---- 4. sinema modunda ayar çekmecesi ----
test('sinema çekmecesi genişliği kapsayıcı bloğa bağlı değil', () => {
  const i = css.indexOf('.player-layer.mode-cinema.settings-open .player-side');
  assert(i > 0, 'sinema cekmece kurali yok');
  const body = css.slice(i, css.indexOf('}', i));
  assert(/position:\s*absolute/.test(body), 'mutlak konumlanmiyor');
  // .player-side bir grid ogesi (grid-area: 1/3) ve sinema modunda o sutun 0px.
  // Mutlak konumlu grid cocugunun kapsayici blogu kendi GRID ALANI oldugu icin
  // yuzde genislik sifira duser ve cekmece gorunmez olur.
  assert(!/width:[^;]*\b100%/.test(body),
    'genislik 100% kullaniyor — sinema modunda grid alani 0px, cekmece 0 genislikte acilir');
});

test('.player-side gerçekten grid öğesi (yukarıdaki testin dayanağı)', () => {
  // Kaynakta `grid-column`, tarayıcı bunu `grid-area` diye normalize eder.
  assert(/\.player-side\s*\{[\s\S]{0,200}grid-(column|area)\s*:/.test(css),
    '.player-side artik grid sutununa yerlesmiyor — test varsayimi eskimis');
  assert(/\.player-layer\.mode-cinema\s+\.player-body\s*\{[^}]*grid-template-columns:[^}]*\b0\b/.test(css),
    'sinema modunda yan sutun artik 0 degil — test varsayimi eskimis');
});

// ---- 5. mod geçişinde grid animasyonu ----
test('sütun şekli değişiminde geçiş atlanıyor', () => {
  // .player-body'de `transition: grid-template-columns` var. Modlar arasi
  // track listeleri farkli bicimde ("1fr 0 0" <-> "minmax(...) 6px minmax(...)");
  // Chrome bunlari interpolate edemiyor ve gecis BASLANGIC degerinde takiliyor.
  // Sonuc: sinemadan cikilinca sinif dogru ama yan panel 0 genislikte kaliyor.
  assert(/transition:\s*grid-template-columns/.test(css),
    'grid gecisi yok — bu test artik gereksiz olabilir, gozden gecir');
  assert(/\.player-body\.no-grid-anim\s*\{[^}]*transition:\s*none/.test(css),
    'gecisi atlayacak kural (.player-body.no-grid-anim) yok');
  assert(/function snapGridColumns/.test(js), 'snapGridColumns yardimcisi yok');
  const snap = js.slice(js.indexOf('function snapGridColumns'));
  assert(/offsetWidth/.test(snap.slice(0, 400)),
    'reflow zorlanmiyor — sinif eklemek tek basina yeni degeri gecissiz uygulamaz');
});

for (const fn of ['setViewMode', 'setPlayerSidebarCollapsed']) {
  test(`${fn} sütunları anında uyguluyor`, () => {
    const i = js.indexOf(`function ${fn}(`);
    assert(i > 0, `${fn} tanimi yok`);
    const body = js.slice(i, js.indexOf('\n}', i));
    assert(/snapGridColumns\(\)/.test(body),
      `${fn} snapGridColumns cagirmiyor — panel gecis ortasinda takilabilir`);
  });
}

test('tarayıcı görünümü panel ve sürükleme değişikliklerinde gerçek alanı yeniden ölçüyor', () => {
  const observer = js.slice(js.indexOf('function bindBrowserBoundsObserver'), js.indexOf('function setBrowserSignal'));
  assert(/new ResizeObserver/.test(observer) && /observe\(slot\)/.test(observer),
    'browserViewSlot ResizeObserver ile izlenmiyor — Electron görünümü eski genişlikte kalır');
  const responsive = js.slice(js.indexOf('function syncResponsivePlayerLayout'),
    js.indexOf('function setViewMode'));
  assert(/scheduleBrowserBounds\(\)/.test(responsive),
    'ortak duyarlı yerleşim güncellemesi tarayıcı sınırlarını yenilemiyor');
  for (const fn of ['setViewMode', 'setSideWidth', 'setPlayerSidebarCollapsed']) {
    const i = js.indexOf(`function ${fn}(`);
    const body = js.slice(i, js.indexOf('\n}', i));
    assert(/syncResponsivePlayerLayout\(\)/.test(body),
      `${fn} ortak duyarlı yerleşimi yenilemiyor`);
  }
});

// ---- 6. otomatik dur ----
test('otomatik dur geçişi ÖNCEKİ zamanın bloğuna göre sınanıyor', () => {
  const policy = require('../src/playback-policy');
  const cues = [{ id: 'a', start: 1, end: 2, text: 'Bir' }, { id: 'b', start: 2.08, end: 3, text: 'İki' }];
  assert(policy.playbackLearningAction(cues, 2.2, 1.9, 'normal', { autoPause: true }).type === 'pause-at-cue-end',
    'kısa cue boşluğu atlanınca otomatik dur kaçtı');
  assert(policy.playbackLearningAction(cues, 2.2, 0.2, 'normal', { autoPause: true }).type !== 'pause-at-cue-end',
    'ileri/geri sarma otomatik dur sanıldı');
  const body = js.slice(js.indexOf('function applyPlaybackLearningPolicy'), js.indexOf('function renderCue()'));
  assert(/Number\.isFinite\(player\.abA\)/.test(body), 'A-B döngüsü sırasında öğrenme politikası susmuyor');
});

// ---- 7. satır hizası ve tema ----
test('cümle araçları satırı tek ölçüde', () => {
  const i = css.indexOf('.sentence-tools .tool-button');
  assert(i > 0, 'satir yukseklik kurali yok');
  const body = css.slice(i, css.indexOf('}', i));
  assert(/height:\s*32px/.test(body), 'sabit yukseklik yok — dugmeler 31/33/43px olur');
  assert(/white-space:\s*nowrap/.test(body),
    'etiket kirilabiliyor — "Altyazi olustur" iki satira dusup hizayi bozar');
});

test('arama satırındaki simge düğmeleri kutuyla aynı yükseklikte', () => {
  assert(/\.side-toolrow \.btn-icon\s*\{[^}]*height:\s*34px/.test(css),
    '.side-toolrow .btn-icon yukseklik kurali yok — satir basamakli gorunur');
  assert(/\.side-toolrow input\[type=search\][^}]*height:\s*34px/.test(css),
    'arama kutusu 34px degil');
});

test('onay kutuları temaya boyanmış (tarayıcı mavisi değil)', () => {
  // Genel kural: oynatıcıya özel olan bunu maskelememeli, ikisi de aransın.
  assert(/(^|\n)input\[type="checkbox"\], input\[type="radio"\][^}]*accent-color/.test(css),
    'uygulama geneli accent-color yok — Chrome onay kutularini MAVI cizer');
  assert(/\.player-layer input\[type="checkbox"\][^}]*accent-color:\s*var\(--player-amber\)/.test(css),
    'oynaticidaki onay kutulari kehribar temaya baglanmamis');
});

// ---- 8. kaynak/çeviri anahtarları ----
test('Kaynak/Çeviri anahtarları VİDEO üzerindeki altyazıyı da etkiliyor', () => {
  // Eskiden sinif yalnizca #playerSide'a konuyordu: listede satir gizleniyor,
  // video uzerindeki katman oldugu gibi kaliyordu.
  assert(/showSource'\)\.addEventListener\('change',\s*onSubtitleTrackToggle\)/.test(js),
    'showSource ortak gorunurluk yoneticisine bagli degil');
  assert(/showTranslation'\)\.addEventListener\('change',\s*onSubtitleTrackToggle\)/.test(js),
    'showTranslation ortak gorunurluk yoneticisine bagli degil');
  const i = js.indexOf('function applySubtitleTrackSelection');
  const body = js.slice(i, i + 1000);
  assert(/classList\.toggle\('hide-src',[\s\S]{0,120}!\(primaryTranslation \? translation : source\)/.test(body),
    "kaynak sinifi playerLayer'a uygulanmiyor");
  assert(/classList\.toggle\('hide-tr',[\s\S]{0,120}!\(primaryTranslation \? source : translation\)/.test(body),
    "ceviri sinifi playerLayer'a uygulanmiyor");
  assert(/\.player-layer\.hide-src #subtitleOverlay\s*\{[^}]*display:\s*none/.test(css),
    'katmani gizleyen CSS kurali yok');
  assert(/\.player-layer\.hide-tr #subtitleOverlay2\s*\{[^}]*display:\s*none/.test(css),
    'ikinci altyazi katmanini gizleyen kural yok');
});

test('CC düğmesi istenen üç altyazı seçeneğini açıyor', () => {
  for (const mode of ['translation', 'source', 'off']) {
    assert(new RegExp(`data-subtitle-mode=["']${mode}["']`).test(html), `${mode} CC secenegi yok`);
  }
  assert((html.match(/data-subtitle-mode=/g) || []).length === 3,
    'CC menusunde istenmeyen veya eksik secenek var');
  const click = js.slice(js.indexOf("$('subToggle').addEventListener('click'"),
    js.indexOf("$('subtitleModeMenu').addEventListener('click'"));
  assert(/setSubtitleModeMenuOpen/.test(click), 'CC dugmesi menuyu acmiyor');
  assert(/setSubtitleMode\(item\.dataset\.subtitleMode\)/.test(js),
    'menu secimi gorunurluk durumuna bagli degil');
  assert(/bottom:\s*calc\(100% \+ 10px\)/.test(css), 'CC menusu kontrol cubugunun ustune acilmiyor');
});

test('CC seçimi sağ panel anahtarlarıyla aynı durumu kullanıyor', () => {
  const i = js.indexOf('function setSubtitleMode(');
  const body = js.slice(i, i + 750);
  assert(/applySubtitleTrackSelection\(mode === 'source',\s*mode === 'translation'\)/.test(body),
    'CC secimi Kaynak/Ceviri anahtarlarini guncellemiyor');
  assert(/setSubtitlesVisible\(false\)/.test(body), 'altyazilari kapat secenegi iki katmani kapatmiyor');
  const key = js.slice(js.indexOf("if (e.key === 'v' || e.key === 'V')"),
    js.indexOf('// Altyazi gecikmesini', js.indexOf("if (e.key === 'v' || e.key === 'V')")));
  assert(/setSubtitlesVisible\(player\.subsHidden\)/.test(key), 'V kisayolu altyaziyi acip kapatmiyor');
  assert(!/subToggle'\)\.click/.test(key), 'V kisayolu yanlislikla CC menusunu aciyor');
});

// ---- 9. ayarlar paneli zorla açmıyor ----
test('ayarları açmak yan paneli zorla açmıyor', () => {
  const i = js.indexOf('function setSettingsDrawer');
  assert(i > 0, 'setSettingsDrawer yok');
  const body = js.slice(i, js.indexOf('\n}', i));
  assert(!/classList\.remove\('sidebar-collapsed'\)/.test(body),
    'cekmece hala paneli zorla aciyor — kullanici istemedigi halde transkript acilir');
  // Panel kapaliyken cekmecenin gorunebilmesi CSS'e bagli
  assert(/\.player-layer\.sidebar-collapsed\.settings-open \.player-side/.test(css),
    'panel daraltilmisken cekmeceyi gosteren kural yok — ayarlar hic acilmaz');
});

test('ayar çekmecesi klavye odağını içine alır ve açan kontrole geri verir', () => {
  assert(/id="settingsDrawer"[^>]*role="dialog"[^>]*aria-modal="false"[^>]*aria-labelledby="settingsDrawerTitle"/.test(html),
    'ayar çekmecesinin erişilebilir dialog adı yok');
  const drawer = js.slice(js.indexOf('function setSettingsDrawer'), js.indexOf('function toggleSettingsPage'));
  assert(/settingsReturnFocus = active/.test(drawer), 'çekmece açılırken çağıran odak saklanmıyor');
  assert(/closeSettings['"]\)\?\.focus\(\)/.test(drawer), 'çekmece açılınca klavye odağı içine taşınmıyor');
  assert(/requestAnimationFrame\(focusClose\)/.test(drawer) && /setTimeout\(focusClose,\s*120\)/.test(drawer),
    'arka planda paint durursa çekmece odağının zaman yedeği yok');
  assert(/restoreFocus\?\.isConnected/.test(drawer) && /restoreFocus\.focus\(\)/.test(drawer)
    && /setTimeout\(restoreDrawerFocus,\s*120\)/.test(drawer),
    'çekmece kapanınca odak açan kontrole dönmüyor');
});

test('yan panel sekmeleri panellerini açıklar ve okla geçiş odağı kaçırmaz', () => {
  for (const [tabId, panelId] of [
    ['sideTabSubs', 'cueList'], ['sideTabAi', 'aiChat'], ['sideTabLibrary', 'playerLibraryPanel'],
  ]) {
    assert(new RegExp(`id="${tabId}"[^>]*aria-controls="${panelId}"`).test(html), `${tabId} panelini açıklamıyor`);
    assert(new RegExp(`id="${panelId}"[^>]*role="tabpanel"[^>]*aria-labelledby="${tabId}"`).test(html), `${panelId} sekmesine bağlı değil`);
  }
  assert(/dataset\.rovingActivation = 'true'/.test(js), 'ok tuşu etkinleştirmesi işaretlenmiyor');
  assert(/focusContent: tablist\?\.dataset\.rovingActivation !== 'true'/.test(js),
    'ok tuşuyla sekme geçişi panel içine odak kaçırıyor');
});

test('browser alt sekmeleri ve ayar sekmeleri denetledikleri panellerle bağlıdır', () => {
  for (const [tabId, panelId] of [
    ['browserPlaceTabBookmarks', 'browserPlacesList'],
    ['browserPlaceTabHistory', 'browserPlacesList'],
    ['libraryViewSearch', 'playerLibraryList'],
    ['libraryViewNotes', 'playerLibraryList'],
    ['libraryViewCollections', 'playerLibraryList'],
    ['settingsTabSource', 'settingsPageSource'],
    ['settingsTabBrowserSubtitles', 'settingsPageBrowserSubtitles'],
    ['settingsTabBrowserDiagnostics', 'settingsPageBrowserDiagnostics'],
  ]) {
    assert(new RegExp(`id="${tabId}"[^>]*aria-controls="${panelId}"`).test(html), `${tabId} panelini açıklamıyor`);
  }
  assert(/setAttribute\('aria-labelledby', player\.browserPlaceTab/.test(js), 'yerler panel etiketi seçimle güncellenmiyor');
  assert(/playerLibraryList['"]\)\?\.setAttribute\('aria-labelledby', button\.id\)/.test(js),
    'kütüphane sonuç panel etiketi seçimle güncellenmiyor');
});

// ---- 10. AI işleri ana iş akışını tetiklemiyor ----
test('AI işleri "Altyazı hazır" modalını açmıyor', () => {
  // Backend sohbet/aciklama modlarinda da 'done' basiyor; ana switch onu
  // altyazi isi sanip modal + bildirim + asama isaretleme yapardi.
  assert(/state\.aiJob\s*&&\s*\(event\.type === 'done'/.test(js),
    'AI isleri icin done/error muafiyeti yok — sohbette "Altyazi hazir!" modali cikar');
  const kur = (js.match(/state\.aiJob = true/g) || []).length;
  assert(kur >= 2, `aiJob bayragi ${kur} yerde kuruluyor — sohbet ve acikla ikisi de isaretlenmeli`);
});

// ---- 11. sohbet geçmişi ----
test('sohbet geçmişi KOPYA olarak gönderiliyor', () => {
  const i = js.indexOf('opts.chat = {');
  assert(i > 0, 'sohbet yuku olusturulmuyor');
  const body = js.slice(js.indexOf('async function aiChatSend'), i + 220);
  assert(/const history=\(player\.chatHistory\|\|\[\]\)\.slice\(-8\)\.map/.test(body),
    'gecmis referansla gonderiliyor — asagida ayni diziye soru eklenince '
    + 'soru modele IKI KEZ gider');
});

test('başarısız sohbet turu kalıcı konuşma geçmişini kirletmiyor', () => {
  const i = js.indexOf('async function aiChatSend');
  const body = js.slice(i, js.indexOf('\nfunction autoGrowChatBox', i));
  assert(!/chatHistory\.push\(\{ role: 'user'/.test(body),
    'kullanıcı sorusu API başarısından önce geçmişe yazılıyor');
  const eventStart = js.indexOf("if (event.type === 'chat')");
  const eventBody = js.slice(eventStart, eventStart + 1200);
  assert(/job\.chatQuestion/.test(eventBody)
    && /chatHistory\.push\(\{ role: 'user'/.test(eventBody)
    && /chatHistory\.push\(\{ role: 'assistant'/.test(eventBody),
  'başarılı tur kullanıcı + asistan çifti olarak kaydedilmiyor');
  assert(!/opts\.input\s*=\s*player\.subPath\s*\|\|\s*'chat'/.test(body),
    'sohbet hâlâ sahte girdi yolu üretiyor');
});

test('AI soru alanı gizli sekmede sıfır yüksekliğe kilitlenmiyor', () => {
  const start = js.indexOf('function autoGrowChatBox');
  const end = js.indexOf('function setSideTab', start);
  assert(start > 0 && end > start, 'AI soru alanı büyütme işlevi bulunamadı');
  const style = {
    height: '19px',
    removeProperty(name) { if (name === 'height') this.height = ''; },
  };
  const textarea = { scrollHeight: 0, style };
  const grow = new Function('$', `${js.slice(start, end)}; return autoGrowChatBox;`)
    ((id) => id === 'aiChatText' ? textarea : null);
  grow();
  assert(style.height === '', 'gizli sekmedeki 0 scrollHeight satır içi yükseklik olarak korunuyor');
  textarea.scrollHeight = 22;
  grow();
  assert(style.height === '38px', 'tek satırlı soru alanı 38 px asgari yüksekliği korumuyor');
  textarea.scrollHeight = 180;
  grow();
  assert(style.height === '120px', 'çok satırlı soru alanı 120 px üst sınırında durmuyor');
  assert(/\.ai-chat-input textarea\s*\{[\s\S]*?min-height:\s*38px/.test(css),
    'AI soru alanının görünür CSS asgari yüksekliği yok');
  assert(/#aiChatCtx\s*\{[^}]*min-width:\s*0[^}]*text-overflow:\s*ellipsis[^}]*white-space:\s*nowrap/.test(css)
    && /\.ai-chat-foot \.link-btn\s*\{[^}]*white-space:\s*nowrap/.test(css),
  'dar yan panelde bağlam eylemi yerine eylem metni satıra bölünüyor');
});

test('AI açıklama önbelleği kaynak ve çeviri metnine bağlı', () => {
  const i = js.indexOf('function explainCacheKey');
  const body = js.slice(i, js.indexOf('\nasync function askExplain', i));
  assert(/cue\.text/.test(body) && /translationFor\(cue\)/.test(body),
    'açıklama anahtarı altyazı içeriğini izlemiyor');
});

test('tek tık "altyazı + çeviri" kalıcı ayarı değiştirmiyor', () => {
  const i = js.indexOf("$('quickSubsBtn').addEventListener");
  assert(i > 0, 'tek-tik dugmesi bagli degil');
  const body = js.slice(i, i + 1600);
  assert(!/\$\('translate'\)\.checked\s*=/.test(body),
    'kullanicinin kalici ceviri ayarini degistiriyor');
  assert(/state\.forceTranslate = true/.test(body), 'is-ozel bayrak kurulmuyor');
  assert(/if \(!state\.running && !state\.queueRunning\) state\.forceTranslate = false/.test(body),
    'is baslamazsa bayrak temizlenmiyor — sonraki ise sizar');
});

// ---- 12. araç çubuğu ve aktif satır ----
test('"Aktif satıra dön" altyazının üstünde yüzmüyor', () => {
  // Eskiden .back-to-active mutlak konumlu, listenin ustunde duruyordu ve
  // okunan satiri kapatiyordu. Artik arac cubugu seridinde normal bir dugme.
  assert(/id="backToActive"/.test(layer), 'dugme yok');
  const i = layer.indexOf('id="backToActive"');
  const once = layer.slice(Math.max(0, i - 400), i);
  assert(/class="tools-head"/.test(once),
    'dugme tools-head seridinde degil — eski yuzen konumuna donmus olabilir');
  assert(!/\.back-to-active\s*\{[^}]*position:\s*absolute/.test(css),
    'mutlak konumlandirma kurali hala duruyor');
});

test('araç bloğu gizlenip açılabiliyor', () => {
  assert(/id="toolsToggle"/.test(layer), 'gizleme dugmesi yok');
  assert(/id="sentenceTools"/.test(layer), 'gizlenecek kapsayici yok');
  assert(/\.side-bottom\.tools-collapsed #sentenceTools\s*\{[^}]*display:\s*none/.test(css),
    'gizleme kurali yok');
  const i = js.indexOf("$('toolsToggle').addEventListener");
  assert(i > 0, 'gizleme dinleyicisi yok');
  assert(/playerToolsOpen/.test(js), 'durum kalici degil (localStorage yok)');
});

// ---- 13. işletim sistemi başlık çubuğu ve sade tarayıcı görünümü ----
test('başlık sidebar durumundan bağımsız esnek başlık ve sabit sağ araç grubu kullanır', () => {
  assert(/\.player-head\s*\{[^}]*grid-template-columns:\s*auto minmax\(0,\s*1fr\) auto auto/.test(css),
    'başlık uzun metni daraltan dört sütunlu grid kullanmıyor');
  assert(/\.player-head-actions\s*\{[^}]*min-width:\s*max-content[^}]*justify-self:\s*end/.test(css),
    'sağ araç grubu içerik genişliğinde ve sağa yaslı değil');
  assert(!/\.player-layer\.sidebar-collapsed \.player-head\s*\{[^}]*padding-right/.test(css),
    'sidebar kapalıyken başlığın sağ hizası ayrı bir padding ile değişiyor');
  assert(/padding-top:\s*calc\(8px \+ var\(--window-controls-safe-height\)\)/.test(css),
    'native pencere düğmelerinin dikey güvenli alanı korunmalı');
});

test('native başlık gizlenirken pencere düğmeleri için güvenli alan korunur', () => {
  const main = fs.readFileSync(path.join(SRC, '..', 'main.js'), 'utf-8');
  assert(/titleBarStyle:\s*'hidden'/.test(main), 'ayrı Windows başlık şeridi hâlâ açık');
  assert(/titleBarOverlay:\s*\{/.test(main), 'native küçült/büyüt/kapat düğmeleri korunmuyor');
  assert(/--window-controls-safe-width:\s*148px/.test(css), 'pencere düğmeleri için güvenli genişlik yok');
  assert(/\.player-head\s*\{[\s\S]*?padding-top:\s*calc\(8px \+ var\(--window-controls-safe-height\)\)[\s\S]*?padding-right:\s*14px/.test(css),
    'oynatıcı başlığı native düğmelerin altına inmiyor veya sağda 14px hizayı korumuyor');
});

test('Aşama A toolbar tekil kontrolleri adres, Çeviri ve Diğer altında toplar', () => {
  const ids = [...layer.matchAll(/\bid="([^"]+)"/g)].map((match) => match[1]);
  const duplicates = ids.filter((id, index) => ids.indexOf(id) !== index);
  assert(duplicates.length === 0, `yinelenen id: ${duplicates.join(', ')}`);
  const address = layer.slice(layer.indexOf('class="browser-address-wrap"'), layer.indexOf('class="browser-toolbar-actions"'));
  assert(address.includes('id="browserBookmarkToggle"'), 'site yer imi adres alanının sağ iç kenarında değil');
  assert(/<details class="browser-translate-split browser-translate-menu" id="browserTranslateMenu">[\s\S]*?<summary[^>]*id="browserSubtitleSettingsToggle"/.test(layer),
    'Birleşik Whisper düğmesi: summary, ayarlar düğmesi kimliğini taşımalı');
  assert(/id="browserSubtitleSettingsMenu"/.test(layer), 'Ayarlar öğesi birleşik popover içinde eksik');
  for (const target of ['browserMangaTranslate']) {
    assert(new RegExp(`data-browser-proxy="${target}"`).test(layer), `${target} Çeviri menüsüne bağlı değil`);
  }
  assert(!/data-browser-proxy="browserPageTranslate"/.test(layer),
    'Sayfayı çevir hem ayrı buton hem menü öğesi olarak çift tanımlanıyor');
  assert(/id="browserPageTranslate"/.test(layer), 'Sayfayı çevir araç çubuğu butonu eksik');
  for (const label of ['Sayfa', 'Video', 'Site', 'Görünüm ve yardım']) {
    assert(layer.includes(`<summary><span class="browser-menu-label">${label}</span>`), `${label} Diğer menüsü alt menüsü eksik`);
  }
  assert(/id="browserMoreSearch"/.test(layer), 'Diğer menüsü içi arama eksik');
  assert(/class="browser-more-quick"/.test(layer), 'Diğer menüsü hızlı eylem satırı eksik');
  for (const target of ['playerQuickDownload', 'pdfReaderOpen', 'playerBookmark', 'browserDownloadsToggle',
    'browserPlacesToggle', 'playerLayoutQuick', 'browserViewSettingsToggle', 'browserDiagnosticsToolbar']) {
    assert(new RegExp(`data-browser-proxy="${target}"`).test(layer), `${target} Diğer menüsüne bağlı değil`);
  }
  assert(/\.browser-action-source\s*\{\s*display:\s*none\s*!important/.test(css),
    'canonical kaynak kontrolleri Tab sırasından çıkarılmıyor');
  assert(!/@container browser-workspace \(min-width:\s*1381px\)[\s\S]{0,120}\.browser-more\s*\{\s*display:\s*none/.test(css),
    'Diğer menüsü geniş ekranda yeniden gizleniyor');
});

test('toolbar menüleri ortak okluzyon, dış tıklama ve Escape yaşam döngüsünü kullanır', () => {
  assert(/const browserToolbarMenuIds = \['browserTranslateMenu', 'browserPageQuickMenu', 'browserMoreMenu', 'browserSplitMenu', 'browserSiteChipDetails', 'browserSignalMenu', 'appModeMenu', 'appMenu'\]/.test(js),
    'toolbar menüleri tek yaşam döngüsü listesinde değil');
  assert(/\|\| !!moreMenu\?\.open \|\| !!translateMenu\?\.open \|\| !!pageQuickMenu\?\.open \|\| !!splitMenu\?\.open[\s\S]{0,80}!!siteChipDetails\?\.open/.test(js),
    'native browser okluzyonu açık toolbar menülerini hesaba katmıyor');
  assert(/event\.target\.closest\?\.\('#browserTranslateMenu, #browserPageQuickMenu, #browserMoreMenu, #browserSplitMenu, #browserSiteChipDetails, #browserSignalMenu, #appModeMenu, #appMenu'\)/.test(js),
    'dış tıklama menüleri tek noktadan kapatmıyor');
  assert(/event\.key !== 'Escape'[\s\S]{0,260}closeBrowserToolbarMenus\('', true\)/.test(js),
    'Escape en üst toolbar menüsünü kapatıp odağı geri vermiyor');
  assert(/\$\$\('\[data-browser-proxy\]'\)[\s\S]{0,260}closeBrowserToolbarMenus\(\)/.test(js),
    'proxy eylemi sonrasında menü yaşam döngüsü kapanmıyor');
});

test('sayfa çevirisi seçenekleri ve aktif işler native video yüzeyini örter', () => {
  const occlusionFn = js.slice(js.indexOf('function syncBrowserOcclusion'), js.indexOf('function openManagedModal'));
  const taskCenterStart = js.indexOf('function setPlayerTaskCenter');
  const taskCenterFn = js.slice(taskCenterStart, js.indexOf('initializeSettingsPages();', taskCenterStart));
  assert(/const pageQuickMenu = \$\('browserPageQuickMenu'\)/.test(occlusionFn)
    && /!!pageQuickMenu\?\.open/.test(occlusionFn),
  'sayfa çevirisi seçenekleri native browser okluzyonuna bağlı değil');
  assert(/const taskCenter = \$\('playerTaskCenter'\)/.test(occlusionFn)
    && /!taskCenter\.classList\.contains\('hidden'\)/.test(occlusionFn),
  'aktif işler paneli native browser okluzyonuna bağlı değil');
  assert(/syncBrowserOcclusion\(\)/.test(taskCenterFn),
    'aktif işler açma-kapama işlemi native browser görünürlüğünü yenilemiyor');
});

test('Aşama B çalışma çekmecesini korur, tarayıcı kalıcı ayarlarını özel sekmeye ayırır', () => {
  assert(layer.includes('id="settingsBackToPanel"'), 'ayar görünümünde çalışma paneline dönüş düğmesi yok');
  assert(layer.includes('id="settingsDrawerBreadcrumb"'), 'ayar görünümünde breadcrumb yok');
  for (const label of ['Kaynak ve oynatma', 'Altyazı ve çeviri', 'Sorun giderme']) {
    assert(layer.includes('>' + label + '</button>'), label + ' ayar kategorisi yok');
  }
  assert(!layer.includes('>Görünüm ve manga</button>'),
    'kalıcı tarayıcı ayarları için ikinci çekmece yolu kalmış');
  assert(JSON.stringify(browserSettingsRegistry.categories().map((item) => item.label))
    === JSON.stringify(['Site ve altyazı', 'Çeviri ve manga', 'Gizlilik', 'Oturum', 'Sistem']),
  'özel Ayarlar sekmesi kategorileri registry kaynağından gelmiyor');
  assert(/function captureSettingsPanelSnapshot/.test(js)
    && /cueScrollTop/.test(js)
    && /aiDraft/.test(js)
    && /function restoreSettingsPanelSnapshot/.test(js),
  'ayar geçişinde transkript/arama/AI durumu korunmuyor');
  assert(/player\.settingsReturnTab/.test(js)
    && js.includes("settingsBackToPanel').addEventListener('click'"),
  'Geri düğmesi önceki çalışma sekmesine bağlı değil');
  assert(js.includes("settingsDrawer').addEventListener('keydown'"),
    'ayar drawer focus trap klavye ile bağlı değil');
  const drawerFn = js.slice(js.indexOf('function setSettingsDrawer'), js.indexOf('function toggleSettingsPage'));
  const responsiveFn = js.slice(js.indexOf('function syncResponsivePlayerLayout'), js.indexOf('function setViewMode'));
  assert(/syncResponsivePlayerLayout\(\)/.test(drawerFn)
    && /scheduleBrowserBounds\(\)/.test(responsiveFn)
    && /syncBrowserOcclusion\(\)/.test(responsiveFn),
  'ayar görünümü ortak native browser bounds/oklüzyon güncellemesini tetiklemiyor');
  const occlusionFn = js.slice(js.indexOf('function syncBrowserOcclusion'), js.indexOf('function openManagedModal'));
  assert(/settingsOverlay/.test(occlusionFn)
    && /sidebar-collapsed/.test(occlusionFn)
    && /mode-cinema/.test(occlusionFn),
  'ayar görünümü yalnızca oynatıcının üstüne bindiğinde native browserı gizlemiyor');
  const viewModeFn = js.slice(js.indexOf('function setViewMode'), js.indexOf('function setSideWidth'));
  assert(/syncResponsivePlayerLayout\(\)/.test(viewModeFn),
    'açık ayarlarda sinema/okuma geçişi native browser oklüzyonunu yenilemiyor');
  assert(/\.settings-drawer\s*\{[\s\S]*?overscroll-behavior:\s*contain/.test(css)
    && /\.drawer-page-tabs\s*\{[\s\S]*?grid-template-columns:\s*repeat\(2/.test(css),
  'ayar paneli aynı sağ alanda sakin, taşmasız kategori düzeni kullanmıyor');
  assert(/\.player-layer\.sidebar-collapsed\.settings-open \.player-side,[\s\S]*?width:\s*min\(430px,\s*100vw\)/.test(css),
    'sidebar kapalıyken ayar alanı güvenli genişlikte açılmıyor');
});

test('tarayıcı sinyali ve sade görünüm ayrı ayrı gizlenip geri açılabilir', () => {
  for (const id of ['browserSignalToggle', 'browserSignalClose', 'browserChromeToggle']) {
    assert(layer.includes(`id="${id}"`), `${id} kontrolü yok`);
    assert(js.includes(`$('${id}')`), `${id} renderer'a bağlı değil`);
  }
  assert(/function setBrowserSignalVisible/.test(js) && /playerBrowserSignalVisible/.test(js),
    'altyazı sinyali görünürlüğü kalıcı değil');
  assert(/function setBrowserChromeCollapsed/.test(js) && /playerBrowserChromeCollapsed/.test(js),
    'sade görünüm kalıcı değil');
  assert(/\.browser-workspace\.signal-collapsed \.browser-signal\s*\{[^}]*display:\s*none/.test(css),
    'sinyal şeridini gerçekten gizleyen CSS yok');
  assert(/\.browser-toolbar\s*\{\s*grid-row:\s*1/.test(css)
    && /\.browser-signal\s*\{\s*grid-row:\s*2/.test(css)
    && /\.browser-view-slot\s*\{\s*grid-row:\s*3/.test(css),
    'sinyal gizlenince native tarayıcı yuvası sıfır yüksekliğe düşebilir');
  assert(/\.player-layer\.browser-chrome-collapsed \.player-head\s*\{[^}]*display:\s*none/.test(css),
    'sade görünüm üst oynatıcı başlığını gizlemiyor');
  assert(/\.player-layer\.browser-chrome-collapsed \.browser-translate-split,[\s\S]*?\.player-layer\.browser-chrome-collapsed \.browser-more\s*\{[^}]*display:\s*none/.test(css)
    && /\.player-layer\.browser-chrome-collapsed #browserChromeToggle\s*\{[^}]*display:\s*grid\s*!important/.test(css),
    'sade görünümde adres ve görünümü geri açma dışındaki araçlar doğru çekilmiyor');
  assert(/\.player-layer\.browser-chrome-collapsed \.browser-address-wrap\s*\{[^}]*grid-column:\s*1/.test(css)
    && /\.player-layer\.browser-chrome-collapsed \.browser-toolbar-actions\s*\{[^}]*grid-column:\s*2/.test(css),
    'sade görünüm toolbar görünmeyen ilk grid sütununu boşuna ayırıyor');
});

test('tarayıcı altyazı yakalaması normal gezinme için durdurulup yeniden başlatılabilir', () => {
  assert(layer.includes('id="browserCaptureToggle"'), 'yakalama aç/kapat düğmesi yok');
  assert(/setBrowserCaptureEnabled/.test(js), 'yakalama durumu rendererda bağlı değil');
  assert(/playerBrowserCaptureEnabled/.test(js), 'yakalama tercihi kalıcı değil');
  assert(/browser:capture:setEnabled/.test(fs.readFileSync(path.join(SRC, '..', 'main.js'), 'utf-8')),
    'yakalama IPC ucu yok');
  assert(/startWatchFolder|setBrowserCaptureEnabled/.test(fs.readFileSync(path.join(SRC, '..', 'preload.js'), 'utf-8')),
    'preload yakalama köprüsü yok');
  assert(/\.browser-capture-toggle\s*\{[^}]*flex:\s*0 0 auto/.test(css),
    'yakalama düğmesi sinyal satırını gereksiz büyütüyor');
});

test('tarayıcı altyazı şeridi panel genişliğine göre sarılıyor ve yardımcı eylemler ghost görünüyor', () => {
  assert(layer.includes('class="browser-signal-head"')
    && layer.includes('class="browser-signal-body"')
    && layer.includes('class="browser-signal-tools"'),
  'altyazı şeridinde durum, araç ve iz grupları ayrılmamış');
  assert(/\.btn-ghost\s*\{[^}]*background:\s*transparent[^}]*border:\s*1px solid transparent/.test(css),
    'ghost düğmeler tarayıcı varsayılanı beyaz yüzeye düşebilir');
  assert(/\.browser-workspace\s*\{[^}]*container:\s*browser-workspace\s*\/\s*inline-size/.test(css),
    'tarayıcı çalışma alanı kendi genişliğini ölçmüyor');
  assert(/\.browser-signal-body\s*\{[^}]*flex-wrap:\s*wrap/.test(css),
    'altyazı şeridi dar panelde satıra geçemiyor');
  assert(/@container browser-workspace \(max-width:\s*1640px\)[\s\S]*?\.browser-track-actions\s*\{[^}]*width:\s*100%/.test(css),
    'bulunan iz eylemleri dar çalışma alanında kendi satırına geçmiyor');
  assert(layer.includes('id="settingsPageBrowserDiagnostics"')
    && /settingsPageBrowserDiagnostics['"]\)\.appendChild\(diagnostics\)/.test(js),
    'yakalama ayrıntıları sağ ayar çekmecesine taşınmıyor');
  assert(/id="browserSignalText" role="status" aria-live="polite"/.test(layer),
    'canlı durum bölgesi etkileşimli şeridin tamamını kapsamamalı');
});

test('altyazı izi bulunamadığında Canlı Whisper önerisi eyleme bağlanır', () => {
  assert(/scheduleBrowserNoTrackSuggestion/.test(js), 'iz bulunamadı öneri zamanlayıcısı yok');
  assert(/Canlı Whisper[’']ı deneyin/.test(js), 'Whisper önerisi Türkçe görünür değil');
  assert(/actionName === 'live-asr'/.test(js), 'sinyal eylemi Canlı Whisper modunu desteklemiyor');
  assert(/player\.browserSignalState\?\.action === 'live-asr'/.test(js), 'öneri düğmesi canlı Whisper eylemine bağlı değil');
});

test('tarayıcı araç çubuğu ve ayrıntılar yeniden boyutlanan paneli izliyor', () => {
  assert(/\.browser-workspace\s*\{[^}]*grid-template-rows:\s*auto minmax\(0,\s*1fr\)/.test(css),
    'araç çubuğu büyüdüğünde tarayıcı görünümü sabit 82px satıra sıkışıyor');
  assert(/@container browser-workspace \(max-width:\s*620px\)[\s\S]*?\.browser-toolbar\s*\{[^}]*grid-template-rows:\s*28px 36px 36px/.test(css),
    'dar panel araç çubuğu container genişliğine göre üç satıra geçmiyor');
  assert(/@container browser-workspace \(max-width:\s*920px\)[\s\S]*?\.browser-diagnostics\s*\{[^}]*position:\s*relative[^}]*max-height:\s*min\(420px,\s*48dvh\)[^}]*overflow:\s*auto/.test(css),
    'dar panelde ayrıntılar görünür akışa girmiyor veya yüksekliği sınırlanmıyor');
  assert(/@container browser-workspace \(max-width:\s*920px\)[\s\S]*?\.browser-acquisition-stages\s*\{[^}]*repeat\(2/.test(css),
    'edinme adımları panel genişliğine göre iki sütuna düşmüyor');
  assert(/\.browser-signal-text\s*\{[^}]*white-space:\s*nowrap[^}]*text-overflow:\s*ellipsis/.test(css)
    && /browserSignalText'\)\.title = message/.test(js),
    'durum hapı taşan metni kısaltmıyor veya tamamı üzerine gelince görünmüyor');
});

test('tarayıcı sekmeleri erişilebilir tab modeli ve SVG kapatma ikonları kullanıyor', () => {
  assert(/open\.setAttribute\('role', 'tab'\)/.test(js)
    && /open\.tabIndex = webActive \? 0 : -1/.test(js)
    && /open\.tabIndex = settingsActive \? 0 : -1/.test(js),
    'sekme odağı ve seçimi gerçek tab düğmesinde değil');
  assert(/\['ArrowLeft', 'ArrowRight', 'Home', 'End'\]/.test(js),
    'tarayıcı sekmelerinde ok ve Home\/End klavye dolaşımı yok');
  assert(/async function activateBrowserTabAndFocus/.test(js),
    'sekme değişiminde yeniden çizilen etkin sekmeye odak geri verilmiyor');
  assert(!/close\.textContent = '×'/.test(js) && !/remove\.textContent = '×'/.test(js),
    'dinamik tarayıcı kapatma eylemleri Unicode çarpı kullanıyor');
  for (const id of ['browserPlacesClose', 'browserSignalClose', 'browserTrackDismiss']) {
    const index = layer.indexOf(`id="${id}"`);
    assert(index >= 0 && /<svg/.test(layer.slice(index, index + 500)), `${id} SVG ikon kullanmıyor`);
  }
});

// ---- 14. izlerken canlı cümle birleştirme ----
test('oynatıcıda cümle birleştirme anahtarı var ve dosyayı değiştirmiyor', () => {
  assert(/id="playerMergeCont"/.test(layer), 'oynaticida anahtar yok');
  assert(/function mergeCueContinuation/.test(js), 'canli birlestirme fonksiyonu yok');
  // Ham kopya SART: kapatinca geri donulebilmeli
  assert(/player\.cuesRaw/.test(js), 'ham kopya tutulmuyor — kapatinca geri donulemez');
  const i = js.indexOf('function applyCueMerge');
  assert(i > 0, 'applyCueMerge yok');
  const body = js.slice(i, js.indexOf('\n}', i));
  assert(/player\.cues = on \? mergeCueContinuation\(player\.cuesRaw\) : player\.cuesRaw/.test(body),
    'kapaliyken ham liste geri verilmiyor');
});

test('canlı birleştirme backend ile aynı kuralları kullanıyor', () => {
  const i = js.indexOf('function mergeCueContinuation');
  const body = js.slice(i, i + 1400);
  assert(/CONT_MARKS/.test(body), '"…" devam isareti yorumu yok');
  assert(/45/.test(body), 'kisa kuyruk esigi (45 krk) yok');
  assert(/DIALOG/.test(body), 'diyalog korumasi yok');
});

// ---- 15. araç çubuğu görsel hiyerarşisi ----
test('gezinme, anahtar ve eylem birbirinden AYIRT EDİLEBİLİR', () => {
  // Once hepsi ayni agirlikta hapti; goz neyin dugme neyin anahtar oldugunu
  // secemiyordu. Uc ayri gorsel dil olmali.
  assert(/class="tool-seg"/.test(layer), 'gezinme segmenti yok');
  assert(/\.tool-seg\s*\{/.test(css), 'segment stili yok');
  assert(/\.tool-row-quiet \.tool-button\s*\{[^}]*background:\s*transparent/.test(css),
    'eylem satiri hala cerceveli hap gorunumunde');
  assert(/\.tool-row-main \.action-button\s*\{[^}]*flex:\s*1/.test(css),
    'uretim dugmeleri esit genislikte degil');
  assert(/\.action-button-outline/.test(css), 'ikinci uretim dugmesi outline degil');
});

test('anahtarlar switch olarak çiziliyor (kare onay kutusu değil)', () => {
  const i = css.indexOf('.mini-toggle input[type="checkbox"] {');
  assert(i > 0, 'switch kurali yok');
  const body = css.slice(i, css.indexOf('}', i));
  assert(/appearance:\s*none/.test(body), 'yerli onay kutusu gorunumu birakilmamis');
  assert(/border-radius:\s*999px/.test(body), 'switch govdesi yuvarlak degil');
  assert(/\.mini-toggle input\[type="checkbox"\]::after/.test(css), 'switch topuzu yok');
  assert(/:checked::after[^}]*translateX/.test(css), 'acik durumda topuz kaymiyor');
  assert(/:focus-visible/.test(css.slice(i, i + 1200)), 'klavye odagi gorunmuyor');
});

test('gezinme düğmeleri ikon (dar panelde yer kaplamasın)', () => {
  const i = layer.indexOf('class="tool-seg"');
  const seg = layer.slice(i, layer.indexOf('</div>', i));
  for (const id of ['cuePrevBtn', 'cueReplayBtn', 'cueNextBtn']) {
    assert(seg.includes(id), `${id} segmentte degil`);
  }
  assert(/<svg/.test(seg), 'ikon yok — metin etiketler dar panelde yer kapliyordu');
  assert(/aria-label="/.test(seg), 'ikon dugmelerinde aria-label yok (ekran okuyucu)');
});

test('anahtarlar GRUP olarak sarıyor (dar panelde dağılmasın)', () => {
  // Olcum: ayri ayri sardiklarinda 430 px panelde gezinme satiri 4 gorsel
  // satira boluniyor ve ayirac tek basina kaliyordu.
  const n = (layer.match(/class="toggle-group"/g) || []).length;
  assert(n === 2, `iki anahtar grubu bekleniyordu, ${n} bulundu`);
  assert(/\.toggle-group\s*\{[^}]*display:\s*inline-flex/.test(css), 'grup stili yok');
  assert(!/class="tool-div"/.test(layer),
    'ayirac ogesi geri gelmis — sarma sirasinda tek basina satira duser');
});

test('dar yan panel araçları kendi genişliğine göre düzenli satırlara dönüşüyor', () => {
  assert(/\.player-side\s*\{[^}]*container-type:\s*inline-size/.test(css),
    'yan panel container degil — pencere genis ama panel daralinca duzen degismez');
  const i = css.indexOf('@container player-sidebar (max-width: 500px)');
  assert(i > 0, 'dar panel icin container sorgusu yok');
  const body = css.slice(i, i + 1800);
  assert(/\.tool-row-nav\s*\{[^}]*display:\s*grid/.test(body),
    'gezinme ve anahtarlar dar panelde grid olmuyor');
  assert(/\.tool-seg\s*\{[^}]*width:\s*100%/.test(body),
    'gezinme segmenti dar panelde tam genislik degil');
  assert(/\.tool-row-nav \.toggle-group\s*\{[^}]*repeat\(2/.test(body),
    'anahtar ciftleri dengeli iki sutuna ayrilmiyor');
  assert(/\.tool-row-quiet\s*\{[^}]*repeat\(2/.test(body),
    'metin eylemleri dar panelde iki sutunlu degil');
});

test('"Aktif satır" düğmesi araç şeridinin en bağıran öğesi değil', () => {
  const i = layer.indexOf('id="backToActive"');
  const tag = layer.slice(Math.max(0, i - 200), i + 120);
  assert(/tool-button-ghost/.test(tag), 'hala dolu/birincil stilde');
  assert(!/tool-button-primary/.test(tag), 'birincil stil kaldirilmamis');
});

// ---- 16. ses çubuğu koyu temaya uygun ----
test('ses çubuğu tarayıcının varsayılan görünümünü kullanmıyor', () => {
  const i = css.indexOf('.player-volume {');
  assert(i > 0, '.player-volume kurali yok');
  const body = css.slice(i, css.indexOf('}', i));
  assert(/appearance:\s*none/.test(body),
    'appearance:none yok — Chrome koyu oynaticida BEYAZ zemin + MAVI dolgu cizer');
  assert(/--vol/.test(body), 'dolgu yuzdesi (--vol) kullanilmiyor');
});

test('ses çubuğu dolgusu JS tarafından güncelleniyor', () => {
  assert(/setProperty\('--vol'/.test(js), 'syncVolumeFill --vol yazmiyor');
  const i = js.indexOf("$('playerVolume').addEventListener('input'");
  assert(i > 0, 'ses girdisi dinleyicisi yok');
  assert(/syncVolumeFill\(\)/.test(js.slice(i, i + 240)), 'suruklerken dolgu guncellenmiyor');
});

test('ortam ışığı video tarafından opak siyahla örtülmüyor', () => {
  const blocks = [...css.matchAll(/\.player-stage video\s*\{([^}]*)\}/g)].map((m) => m[1]);
  assert(blocks.length > 0, 'player-stage video CSS kuralı yok');
  const opaque = blocks.some((body) => /background\s*:\s*(?:#000(?:000)?|black)\b/i.test(body));
  assert(!opaque, 'video elemanı siyah arka planla ambient canvasını örtüyor');
  assert(/\.player-stage\.ambient-on \.ambient-glow\s*\{[^}]*opacity\s*:\s*(?!0(?:\D|$))/s.test(css), 'ambient açık durumda görünür değil');
  const ambient = js.slice(js.indexOf('function startAmbient'), js.indexOf('// ---- sağda basılı'));
  assert(/drawImage\(v/.test(ambient) && /setInterval\(paint,\s*250\)/.test(ambient), 'video kareleri ambient canvasa güncellenmiyor');
});

test('YouTube bot doğrulaması için açık rızalı tarayıcı oturumu seçimi var', () => {
  assert(html.includes('id="youtubeCookieBrowser"'), 'ana YouTube kaynağında oturum seçimi yok');
  assert(html.includes('id="playerCookieBrowser"'), 'oynatıcı YouTube ayarında oturum seçimi yok');
  assert(/youtubeCookieBrowser:\s*\$\('youtubeCookieBrowser'\)/.test(js), 'seçim transkripsiyon seçeneklerine gitmiyor');
  assert(/probeYoutube\(url, youtubeCookieBrowser\(\)\)/.test(js), 'seçim oynatıcı probe çağrısına gitmiyor');
  assert(/cookieBrowser:\s*youtubeCookieBrowser\(\)/.test(js), 'seçim indirme/altyazı çağrısına gitmiyor');
  assert(/confirm you.*not a bot[\s\S]{0,300}oturum doğrulaması/i.test(js), 'ham bot hatası Türkçe yönlendirmeye çevrilmiyor');
});

test('canli Whisper ve ceviri olaylari oynatici altyazilarini guncelliyor', () => {
  assert(/event\.type === 'segment'/.test(js) && /event\.type === 'preview_refresh'/.test(js),
    'canli kaynak altyazi olaylari oynaticida dinlenmiyor');
  assert(/event\.type === 'translation_chunk'/.test(js) && /event\.type === 'translation_refresh'/.test(js),
    'canli ceviri olaylari oynaticida dinlenmiyor');
});

test('nihai preview ham segmentleri aynı aralıkta biriktirmek yerine değiştiriyor', () => {
  const refresh = js.slice(js.indexOf("} else if (event.type === 'preview_refresh')"),
    js.indexOf("} else if (event.type === 'translation_chunk')"));
  assert(/replaceLiveCuesForRefresh\(job\.liveSource/.test(refresh),
    'preview_refresh ham ve nihai cue listelerini biriktiriyor');
  assert(!/job\.liveSource\s*=\s*mergeLiveCues/.test(refresh),
    'preview_refresh eski ham cue listesini doğrudan merge ediyor');
  assert(/const outside = previous\.filter/.test(js)
    && /Number\(cue\.end\) <= start \|\| Number\(cue\.start\) >= end/.test(js),
  'progressive parçada yalnız yenilenen zaman aralığı değiştirilmiyor');
});

test('uzun videoda transkripsiyon izlenen konumdan parçalara ayrılıyor', () => {
  assert(/function progressiveRanges\(duration, current, windowSec = 600, overlapSec = 4\)/.test(js),
    'progressiveRanges yok');
  const i = js.indexOf('async function startProgressiveChunk');
  assert(i > 0, 'parça başlatma fonksiyonu yok');
  const body = js.slice(i, i + 700);
  assert(/clipStart:\s*range\.start/.test(body) && /clipEnd:\s*range\.end/.test(body),
    'her parça kendi zaman aralığını backend e göndermiyor');
  assert(/mergeLiveCues/.test(js.slice(js.indexOf('async function finishProgressiveJob'), js.indexOf('async function handleProgressiveTerminal'))),
    'parça sonuçları tek listede birleştirilmiyor');
  const finishBody = js.slice(js.indexOf('async function finishProgressiveJob'), js.indexOf('async function handleProgressiveTerminal'));
  assert(finishBody.indexOf('writeSubtitle(job.sourceFile') < finishBody.indexOf('if (selectionChanged)'),
    'elle altyazı seçilince birleşik aşamalı çıktı yazılmadan iş bitiyor');
  assert(/opts\.outputNameSuffix = `-whisper-/.test(js),
    'aşamalı işler hazır altyazıdan ayrı bir çıktı adına yazmıyor');
});

test('düşük güvenli satırlar listede ve zaman çizgisinde işaretleniyor', () => {
  assert(/lowConfidenceWords/.test(js), 'düşük güven alanı taşınmıyor');
  assert(/classList\.toggle\('low-confidence'/.test(js), 'liste satırı düşük güven sınıfı almıyor');
  assert(/low-confidence/.test(css), 'düşük güven görünüm kuralı yok');
  assert(/confidence\) < 0\.6/.test(js), 'düşük güven eşiği kullanılmıyor');
});

test('düşük güven filtresi yalnız sorunlu satırları gösterip kapatılabiliyor', () => {
  assert(/id="qualityOnlyBtn"/.test(layer), 'düşük güven filtresi düğmesi yok');
  assert(/function toggleQualityOnly\(\)/.test(js), 'düşük güven filtresi işlevi yok');
  const i = js.indexOf('function toggleQualityOnly');
  const body = js.slice(i, i + 260);
  assert(/player\.qualityOnly = !player\.qualityOnly/.test(body), 'filtre anahtarı değişmiyor');
  assert(/player\.qualityOnly && !lowConfidence/.test(js), 'liste filtresi uygulanmıyor');
  assert(/qualityOnlyBtn/.test(js) && /aria-pressed/.test(js), 'filtre düğmesinin durumu erişilebilir olarak yansıtılmıyor');
});

test('AI yanıtlarındaki zamanlar tıklanabilir konum bağlantısına dönüşüyor', () => {
  assert(/function renderAiText\(el, text\)/.test(js), 'AI metin rendererı yok');
  assert(/className = 'ai-time-link'/.test(js), 'AI zaman düğmesi üretilmiyor');
  assert(/video\.currentTime = Math\.max\(0, Math\.min/.test(js), 'AI zaman düğmesi videoya atlamıyor');
  assert(/\.ai-time-link/.test(css), 'AI zaman bağlantısı stili yok');
});

test('AI zaman bağlantısı tarayıcı videosunu da ileri sarıyor', () => {
  const start = js.indexOf('function renderAiText');
  const end = js.indexOf('function aiChatAdd', start);
  const block = js.slice(start, end);
  assert(/player\.workspaceMode === 'browser'/.test(block), 'tarayıcı modu ayrılmıyor');
  assert(/browserCommand\('seek', player\.browserTime\)/.test(block), 'web videosuna seek gönderilmiyor');
});

test('AI sayfa kaynakları tıklanınca ilgili paragrafa gidiyor', () => {
  const start = js.indexOf('function renderAiText');
  const end = js.indexOf('function aiChatAdd', start);
  const block = js.slice(start, end);
  const preload = fs.readFileSync(path.join(__dirname, '..', 'src', 'preload.js'), 'utf-8');
  assert(block.includes('\\[((?:S|T)\\d{1,5})\\]'), 'AI kaynak kimliği ayrıştırılmıyor');
  assert(/className = [^\n]*'ai-source-link'/.test(block), 'AI kaynak düğmesi üretilmiyor');
  assert(/revealBrowserPageContext\(tabId, sourceId\)/.test(block), 'kaynak paragraf IPC çağrısı yok');
  assert(/\.ai-source-link/.test(css), 'AI kaynak bağlantısı stili yok');
  assert(/revealBrowserPageContext: \(tabId, sourceId\)/.test(preload), 'kaynak paragraf preload köprüsü yok');
});

test('zamanlama masası altyazı gecikmesini medya eksenine uygular', () => {
  const start = js.indexOf('function timelineDuration');
  const end = js.indexOf('// ---- geçmiş (kütüphane)', start);
  const block = js.slice(start, end);
  assert(/subtitleVideoTime\(player\.cues\[player\.cues\.length - 1\]\.end/.test(block),
    'altyazı bitişi ölçek ve kaydırmayla medya eksenine taşınmıyor');
  assert(/mediaStart = subtitleVideoTime\(cue\.start/.test(block),
    'blok çizimi ortak senkron dönüşümünü kullanmıyor');
  assert(/subtitleSourceTime\(timelinePlaybackTime\(\)/.test(block),
    'bölme noktası kaynak altyazı eksenine çevrilmiyor');
  assert(/videoDelta \/ scale/.test(block), 'ölçekli drift sürükleme mesafesine uygulanmıyor');
});

test('tarayıcı modunda sayfa ekran görüntüsü ayrı IPC yoluna gidiyor', () => {
  const mode = js.slice(js.indexOf('function setWorkspaceMode'), js.indexOf('async function navigateBrowserFromAddress'));
  const capture = js.slice(js.indexOf('async function capturePlayerFrame'), js.indexOf('// ---- altyazı görünümü'));
  assert(/shotBtn'\)\.disabled = false/.test(mode), 'ekran görüntüsü düğmesi tarayıcıda açık kalmıyor');
  assert(/player\.workspaceMode === 'browser'[\s\S]{0,240}captureBrowserPage/.test(capture), 'tarayıcı ekran görüntüsü IPC yoluna gitmiyor');
});

test('ayar içe aktarma çeviri sağlayıcısını da uygular', () => {
  const start = js.indexOf("$('importSettings').addEventListener");
  const end = js.indexOf('// ===== JSON\'dan yeniden dışa aktarma', start);
  const block = js.slice(start, end);
  assert(/if \(s\.translate\)/.test(block), 'çeviri ayarları içe aktarılmıyor');
  assert(/updateTranslateEndpointUI\(\)/.test(block), 'çeviri sağlayıcısı arayüzü yenilenmiyor');
});

test('Türkçe altyazı araması sorguyu da Türkçe kuralla küçültür', () => {
  const start = js.indexOf("if ($('cueSearch'))");
  const end = js.indexOf("if ($('autoPauseCue'))", start);
  assert(/toLocaleLowerCase\('tr'\)/.test(js.slice(start, end)), 'arama sorgusu Türkçe yerelleştirilmemiş');
});

test('kaydedilmiş cümle metin düzenlemesinden sonra korunur', () => {
  const start = js.indexOf('async function saveCueEdit');
  const end = js.indexOf("if ($('cueSearch'))", start);
  const block = js.slice(start, end);
  assert(/wasSaved/.test(block) && /persistSavedCues\(\)/.test(block), 'kayıtlı cümle imzası taşınmıyor');
});

test('oynatıcı otomatik senkronu yalnız hazır yerel altyazıda etkinleştiriyor', () => {
  assert(/id="playerAutoSync"/.test(layer), 'otomatik senkron düğmesi yok');
  const i = js.indexOf('function updatePlayerAutoSyncState');
  assert(i > 0, 'otomatik senkron durum fonksiyonu yok');
  const body = js.slice(i, i + 650);
  assert(/player\.localPath/.test(body) && /player\.subPath/.test(body) && /player\.cues\.length/.test(body),
    'hazır olma koşulları eksik');
  assert(/opts\.syncSubs = true/.test(js) && /opts\.syncSrt = player\.subPath/.test(js),
    'senkron seçenekleri backend e gitmiyor');
});

test('ses kilidi ve zamanlama masasi yalniz goruntu degil islev baglantisina sahip', () => {
  assert(/id="playerAudioLock"/.test(layer), 'ses kilidi UI yok');
  assert(/rememberAudioLock/.test(js) && /nextYoutubeAudioLang/.test(js), 'ses kilidi is akimina bagli degil');
  assert(/id="timelineDrawer"/.test(layer) && /id="timelineCanvas"/.test(layer), 'zamanlama masasi UI yok');
  assert(/saveSubtitleCopy/.test(js) && /getWaveform/.test(js), 'zamanlama masasi IPC islevlerine bagli degil');
});

test('Windows başlık düğmeleri içerik satırının üzerine binmiyor', () => {
  const main = fs.readFileSync(path.join(__dirname, '..', 'src', 'main.js'), 'utf-8');
  assert(/titleBarOverlay\s*:\s*\{[\s\S]*?height:\s*38/.test(main),
    'native başlık şeridi yüksekliği tanımlı değil');
  assert(/--window-controls-safe-height:\s*38px/.test(css),
    'başlık düğmeleri için dikey güvenli alan yok');
  assert(/\.app-header\s*\{[\s\S]*?min-height:\s*calc\(72px \+ var\(--window-controls-safe-height\)\)/.test(css),
    'ana başlık güvenli yüksekliği ayırmıyor');
  assert(/\.player-head\s*\{[\s\S]*?min-height:\s*calc\(56px \+ var\(--window-controls-safe-height\)\)/.test(css),
    'oynatıcı başlığı güvenli yüksekliği ayırmıyor');
  assert(/browser-chrome-collapsed \.browser-workspace\s*\{[\s\S]*?calc\(52px \+ var\(--window-controls-safe-height\)\)/.test(css),
    'başlık gizliyken tarayıcı araç çubuğu native düğmelerin altına taşınmıyor');
});

test('HLS adres yenilemesi aynı videonun altyazı durumunu sıfırlamıyor', () => {
  assert(/function setPlayerHls\([^)]*preserveMediaState\s*=\s*false/.test(js),
    'HLS kurulumunda durum koruma seçeneği yok');
  assert(/setPlayerHls\(fresh\.hls,\s*fresh\.title,\s*fresh\.videoKey,\s*fresh,\s*true\)/.test(js),
    'yenilenen HLS aynı medya durumunu korumuyor');
  const i = js.indexOf('function setPlayerHls');
  const body = js.slice(i, i + 700);
  assert(/if \(!preserveMediaState\) setMediaKey/.test(body),
    'setMediaKey yenilemede de çağrılıyor');
});

test('HLS ses parçası bilgisi aynı liste için tekrar tekrar loglanmıyor', () => {
  const i = js.indexOf('const syncAudioTracks = () =>');
  const body = js.slice(i, js.indexOf('hls.on(Hls.Events.AUDIO_TRACKS_UPDATED', i));
  assert(/loggedAudioTrackCount !== tracks\.length/.test(body),
    'ses parçası logu tekrar olaylarına karşı korunmuyor');
  assert(/loggedAudioTrackCount = tracks\.length/.test(body),
    'loglanan parça sayısı hatırlanmıyor');
});

test('iş çıktısı kardeş altyazı taramasında birincil seçimi kaybetmiyor', () => {
  const attach = js.slice(js.indexOf('async function attachSiblingSubtitles'), js.indexOf('function openPlayer'));
  const open = js.slice(js.indexOf('function openPlayer'), js.indexOf('function closePlayer'));
  assert(/attachSiblingSubtitles\(videoPath, autoLoad = true\)/.test(attach),
    'kardeş taramasında otomatik yükleme kontrolü yok');
  assert(/if \(autoLoad && !player\.cues\.length\)/.test(attach),
    'kardeş altyazı her durumda birincil seçilebiliyor');
  assert(/attachSiblingSubtitles\(jobVideo, outputs\.length === 0\)/.test(open),
    'iş çıktısı varken kardeş otomatik yüklemesi kapatılmıyor');
});

test('izleme profili gecikirse başka videoya uygulanmıyor', () => {
  const i = js.indexOf('async function restoreWatchProfile');
  const body = js.slice(i, js.indexOf('function makeWatchAction', i));
  assert(/const gen = currentGeneration\(\)/.test(body), 'profil kuşağı yakalanmıyor');
  assert(/staleGeneration\(gen\).*player\.mediaKey !== key/s.test(body),
    'geç gelen profil için kuşak ve medya anahtarı kontrolü yok');
  assert((body.match(/staleGeneration\(gen\)/g) || []).length >= 3,
    'altyazı awaitleri sonrasında yeniden kuşak kontrol edilmiyor');
});

test('standart dışı oynatma hızı menüde gerçek değerle gösterilir', () => {
  const start = js.indexOf('function syncPlayerSpeedControl');
  const end = js.indexOf('function captureWatchPrefs', start);
  assert(start >= 0 && end > start, 'hız kontrol eşitleyicisi bulunamadı');
  const options = [0.5, 1, 1.25, 1.5, 2].map((value) => ({
    value: String(value), dataset: {}, remove() { options.splice(options.indexOf(this), 1); },
  }));
  const select = {
    options,
    value: '1',
    appendChild(option) { options.push(option); },
  };
  const documentMock = { createElement: () => {
    const option = { value: '', textContent: '', dataset: {}, remove() { options.splice(options.indexOf(option), 1); } };
    return option;
  } };
  const sync = new Function('$', 'document', `${js.slice(start, end)}; return syncPlayerSpeedControl;`)(
    (id) => id === 'playerSpeed' ? select : null,
    documentMock,
  );
  sync(1.3);
  assert(select.value === '1.3', 'özel hız menüde seçilmedi');
  assert(options.some((option) => option.dataset.customRate === 'true' && option.value === '1.3'),
    'özel hız seçeneği oluşturulmadı');
  sync(1.25);
  assert(select.value === '1.25', 'standart hıza dönüş gösterilmedi');
  assert(!options.some((option) => option.dataset.customRate === 'true'), 'eski özel hız seçeneği temizlenmedi');
  const restore = js.slice(js.indexOf('async function restoreWatchProfile'), js.indexOf('function makeWatchAction'));
  assert(/syncPlayerSpeedControl\(prefs\.speed\)/.test(restore), 'profil geri yükleme hız eşitleyicisini kullanmıyor');
});

test('altyazı okuma sürerken seçim temizlenirse eski dosya geri gelmiyor', () => {
  const i = js.indexOf('async function loadSubtitle');
  const body = js.slice(i, js.indexOf('async function attachSiblingSubtitles', i));
  assert(/if \(selNow && selNow\.value !== path\) return/.test(body),
    'boş seçim, geciken altyazı sonucunu reddetmiyor');
  assert(!/selNow && selNow\.value && selNow\.value !== path/.test(body),
    'eski boş-değer yarış koşulu hâlâ duruyor');
});

test('geciken yerel medya açma isteği yeni videoyu ezmiyor', () => {
  const i = js.indexOf('async function openLocalMedia');
  const body = js.slice(i, js.indexOf('function openWatchLibraryItem', i));
  assert(/const intent = \+\+player\.openIntent/.test(body), 'açma isteği kimliği yok');
  assert(/intent !== player\.openIntent/.test(body), 'geç gelen istek atılmıyor');
  const playlist = js.slice(js.indexOf('async function setLocalPlaylistAround'), i);
  assert(/intent !== undefined && intent !== player\.openIntent/.test(playlist),
    'geç istek oynatma listesini yine de değiştirebiliyor');
});

test('kaldığı yer isteği medya anahtarı ve kuşağa bağlı', () => {
  const i = js.lastIndexOf("video.addEventListener('loadedmetadata'");
  const body = js.slice(i, i + 1800);
  assert(/pendingSeek\.key === player\.mediaKey/.test(body), 'seek medya anahtarını doğrulamıyor');
  assert(/pendingSeek\.generation === currentGeneration\(\)/.test(body), 'seek kuşağı doğrulamıyor');
});

test('oynatıcı işi olayları ana transkripsiyon ekranına sızmıyor', () => {
  const i = js.indexOf('function playerJobEvent');
  const body = js.slice(i, js.indexOf('window.api.onEvent', i));
  assert(/return event\.type !== 'log'/.test(body), 'oynatıcı olayları tüketilmiyor');
  assert(/job\.awaitingExit = true/.test(body), 'terminalden sonraki exit sahipliği korunmuyor');
  assert(/job\.cancelled/.test(body), 'iptal sonrası geç olay koruması yok');
});

test('done görmeden gelen exit oynatıcı işini terminal duruma indiriyor', () => {
  const i = js.indexOf('function playerJobEvent');
  const body = js.slice(i, js.indexOf('window.api.onEvent', i));
  // awaitingExit sonrası ayrı bir yakalama dalı olmalı: iptal/çökme/öldürmede
  // 'exit' tek olaydır; eskiden `return event.type !== 'log'` onu yutuyordu ve
  // kart sonsuza kadar "çalışıyor" kalıyordu.
  const m = body.match(/event\.type === 'exit' && job\.awaitingExit[\s\S]*?return true;\s*\}\s*\n(\s*)if \(event\.type === 'exit'\) \{/);
  assert(m, 'done görmemiş iş için exit yakalama dalı yok');
  const block = body.slice(m.index, m.index + 1500);
  assert(/job\.running = false/.test(block), 'pre-done exit job.running sıfırlamıyor');
  assert(/player\.job = null/.test(block), 'pre-done exit player.job bırakmıyor');
  assert(/state\.running = false/.test(block), 'pre-done exit state.running sıfırlamıyor');
  assert(/return true/.test(block), 'pre-done exit ana akışa sızıyor');
});

test('backend iş bilmezken ölü oynatıcı kartı iptal yolunda temizleniyor', () => {
  const i = js.indexOf("$('cancelBtn').addEventListener('click'");
  assert(i > 0, 'cancelBtn dinleyicisi yok');
  const body = js.slice(i, i + 5000);
  assert(/player\.job\.cancelled = true/.test(body)
    && /playerJobEvent\(\{ type: 'exit' \}\)/.test(body),
    'canlı süreç yokken stale player.job kartı temizlenmiyor');
});

test('kısa video başlangıçta tamamlanmış sayılmıyor', () => {
  const start = js.indexOf('function watchCompletionReached');
  const end = js.indexOf('function watchItemByKey', start);
  assert(start > 0 && end > start, 'tamamlanma yardımcısı yok');
  const fn = new Function(`${js.slice(start, end)}; return watchCompletionReached;`)();
  assert(fn(0, 20) === false, '20 saniyelik video 0:00 konumunda tamamlandı');
  assert(fn(18, 20) === true, 'kısa videoda %90 eşiği çalışmıyor');
  assert(fn(570, 600) === true, 'uzun videoda son 30 saniye eşiği çalışmıyor');
  const save = js.slice(js.indexOf('function savePlayerPosition'), js.indexOf('function maybeOfferResume'));
  assert(/watchCompletionReached\(t, duration\)/.test(save),
    'devam kaydı tamamlanma mantığıyla aynı eşiği kullanmıyor');
});

test('web videosu konumu izleme kütüphanesine yazılır ve geri açılır', () => {
  const patchStart = js.indexOf('function currentWatchPatch');
  const patchBody = js.slice(patchStart, js.indexOf('async function flushWatchState', patchStart));
  assert(/key\.startsWith\('browser:'\)|mediaKey\.startsWith\('browser:'\)/.test(patchBody),
    'web medya anahtarı izleme kaydında tanınmıyor');
  assert(/type:\s*browserMode \? 'browser'/.test(patchBody), 'web kayıt türü kütüphaneye yazılmıyor');
  const openStart = js.indexOf('function openWatchLibraryItem');
  const openBody = js.slice(openStart, js.indexOf('function openHistoryItem', openStart));
  assert(/item\.type === 'browser'/.test(openBody), 'web kütüphane kaydı yeniden açılamıyor');
  assert(/pendingLibrarySeek/.test(openBody) && /navigateBrowserFromAddress/.test(openBody),
    'web kütüphane kaydı kaldığı konuma hazırlanmıyor');
});

test('geçmişten oynatma altyazı yollarını açık kullanıcı niyetiyle yetkilendirir', () => {
  const start = js.indexOf('async function openHistoryItem');
  const body = js.slice(start, js.indexOf('// ---- izlerken cumle birlestirme', start));
  assert(start > 0, 'openHistoryItem async değil veya bulunamadı');
  assert(/await window\.api\.authorizeHistoryFiles\(h\.id\)/.test(body),
    'geçmiş çıktıları oynatma tıklamasında yetkilendirilmiyor');
  assert(body.indexOf('authorizeHistoryFiles') < body.indexOf('player.pendingSubs'),
    'YouTube yayını altyazı yetkisi tamamlanmadan açılıyor');
  assert(/intent !== player\.openIntent/.test(body),
    'geciken geçmiş yetkilendirmesi yeni medya seçimini ezebilir');
});

test('web altyazı araçları dosya, iki iz, dışa aktarma ve A-B kopyasını bağlıyor', () => {
  for (const id of ['browserManualSubtitle', 'browserTrackSelect2', 'browserTrackLoadPair', 'browserTrackExport',
    'browserTranslationExport', 'browserTranslationRetryFailed', 'browserCopyAb']) {
    assert(layer.includes(`id="${id}"`), `${id} arayüzde yok`);
    assert(js.includes(`$('${id}')`), `${id} renderer'a bağlı değil`);
  }
  assert(/loadSubtitle\(second\.path, true\)/.test(js), 'ikinci web izi ikinci altyazı kanalına yüklenmiyor');
  assert(/exportBrowserSubtitle/.test(js), 'web altyazısı dışa aktarma IPC hattına gitmiyor');
  assert(/function exportBrowserTranslation/.test(js)
    && /browserLiveTranslations/.test(js.slice(js.indexOf('function exportBrowserTranslation'),
      js.indexOf('function abSubtitleExcerpt'))),
  'canlı çeviri ayrı olarak dışa aktarılamıyor');
  assert(/liveCues\.length \? liveCues : roleCues\.translation/.test(js),
    'sekme geri yüklemesinde çeviri dışa aktarımı rolü bilinen çeviri kanalına düşmüyor');
  assert(/function abSubtitleExcerpt/.test(js) && /cuesToSrt\(cues\)/.test(js),
    'A-B altyazı metni zamanlı SRT olarak üretilmiyor');
  const tracks = js.slice(js.indexOf('function renderBrowserTracks'), js.indexOf('async function loadPersistedBrowserTranslation'));
  assert(/addSubtitleOption\(track\.path/.test(tracks),
    'yakalanan web izleri genel altyazı ayarlarına eklenmiyor');
  const load = js.slice(js.indexOf('async function loadSubtitle'), js.indexOf('// Videonun yanindaki altyazilari bul'));
  assert(/browserLoadedTrackId2 = browserTrack\.id/.test(load),
    'genel ayarlardan seçilen ikinci web izi sekme state ine yazılmıyor');
  assert(/const previousTranslation = player\.browserTracks\.find\(\(track\) =>[\s\S]{0,100}track\.id === player\.browserTranslationTrackId/.test(load),
    'farklı web kaynağı seçilince aktif çeviri ilişkisi denetlenmiyor');
});

test('birincil web çevirisi tüm araçlarda çeviri rolünü korur', () => {
  const role = js.slice(js.indexOf('function browserPrimaryIsTranslation'),
    js.indexOf('function bestAvailableSubtitleMode'));
  assert(!/player\.cues2\.length\) return false/.test(role),
    'ikinci kaynak izi eklenince birincil çeviri rolü kayboluyor');
  assert(/function browserSubtitleRoleCues/.test(role)
    && /primaryTrack\?\.role === 'translation'/.test(role)
    && /secondaryTrack\.role === 'translation'/.test(role),
  'kaynak ve çeviri cue kanalları role göre eşlenmiyor');
  const makeRoleCues = new Function('player', `${role}; return browserSubtitleRoleCues;`);
  const translated = [{ start: 0, end: 1, text: 'Merhaba' }];
  const source = [{ start: 0, end: 1, text: 'Hello' }];
  const state = {
    workspaceMode: 'browser', cues: translated, cues2: source,
    browserTranslationTrackId: 'tr', browserLoadedTrackId: 'tr', browserLoadedTrackId2: 'src',
    browserTracks: [{ id: 'tr', role: 'translation' }, { id: 'src', role: 'source' }],
  };
  const mapped = makeRoleCues(state)();
  assert(mapped.translation === translated, 'birincil kalıcı çeviri yanlış kanala eşlendi');
  assert(mapped.source === source, 'ikincil kaynak izi yanlış kanala eşlendi');
  state.browserLoadedTrackId = '';
  state.cues = [];
  const remaining = makeRoleCues(state)();
  assert(remaining.source === source, 'birincil iz temizlenince ikincil kaynak rolünü kaybetti');
  assert(remaining.translation.length === 0, 'ikincil kaynak yanlışlıkla çeviri sayıldı');
  const excerpt = js.slice(js.indexOf('function abSubtitleExcerpt'), js.indexOf('async function copyBrowserAbText'));
  assert(/browserSubtitleRoleCues\(\)/.test(excerpt)
    && /inVideoTime\(roleCues\.translation, browserTransformForRole\('translation'\)\)/.test(excerpt),
  'A-B kopyası birincil çeviri kanalını kullanmıyor');
  const overlay = js.slice(js.indexOf('function scheduleBrowserOverlaySync'), js.indexOf('function setBrowserLoadingState'));
  assert(/source:\s*browserQuickPreviewCues\(roleCues\.source\)/.test(overlay)
    && /translation:\s*browserQuickPreviewCues\(roleCues\.translation\)/.test(overlay),
  'web overlay kaynak ve çeviriyi rol eşlemesiyle göndermiyor');
});

test('genel ayardan seçilen kalıcı web çevirisi dışa aktarılabilir kalır', () => {
  const load = js.slice(js.indexOf('async function loadSubtitle'), js.indexOf('// Videonun yanindaki altyazilari bul'));
  const install = js.slice(js.indexOf('function applyLoadedBrowserTranslation'), js.indexOf('function replaceBrowserEditRecord'));
  assert(/browserTrack\?\.role === 'translation'[\s\S]*applyLoadedBrowserTranslation\(browserTrack, false\)/.test(load)
    && /browserLiveTranslations = browserTranslationMapFromCues\(base\)/.test(install),
    'kalıcı çeviri elle yüklenince dışa aktarma haritası doldurulmuyor');
  assert(/tab\.browserLiveTranslations = \[\.\.\.player\.browserLiveTranslations\.values\(\)\]/.test(load),
    'elle yüklenen kalıcı çeviri sekme durumuna yazılmıyor');
  assert(/updateBrowserTranslationExportButton\(\)/.test(load),
    'altyazı yükleme ve temizleme sonrası çeviri dışa aktar düğmesi yenilenmiyor');
});

test('web çeviri izi değiştirilince eski scheduler ve dışa aktarma durumu temizlenir', () => {
  const stop = js.slice(js.indexOf('function stopReplacedBrowserTranslation'),
    js.indexOf('function mergeBrowserTranslationCues'));
  assert(/stopBrowserTranslation\(player\.browserActiveTabId\)/.test(stop),
    'değiştirilen web çevirisinin ana süreç schedulerı durdurulmuyor');
  const load = js.slice(js.indexOf('async function loadSubtitle'), js.indexOf('// Videonun yanindaki altyazilari bul'));
  assert(/const clearingPrimaryTranslation = browserPrimaryIsTranslation\(\)/.test(load)
    && /clearingPrimaryTranslation[\s\S]*stopReplacedBrowserTranslation\(''\)/.test(load),
  'birincil çeviri temizlenince eski canlı çeviri işi bırakılıyor');
  assert(/const clearingTranslation =[\s\S]*secondaryTrack\?\.role === 'translation'/.test(load)
    && /clearingTranslation[\s\S]*browserLiveTranslations = primaryTrack/.test(load),
  'ikincil çeviri kapatılınca rol ve dışa aktarma haritası yenilenmiyor');
  assert(/browserTrack\.role === 'translation'[\s\S]*applyLoadedBrowserTranslation\(browserTrack, true\)[\s\S]*stopReplacedBrowserTranslation\(browserTrack\.id\)/.test(load),
    'ikincil kayıtlı çeviri seçimi eski işi durdurup yeni iz haritasını kurmuyor');
  const button = js.slice(js.indexOf('function updateBrowserTranslationExportButton'),
    js.indexOf('async function exportBrowserTranslation'));
  assert(/browserSubtitleRoleCues\(\)\.translation\.length/.test(button),
    'çeviri dışa aktar düğmesi ikincil kanalın rolünü denetlemiyor');
});

test('web çevirisi tam izi kuyruğa alır ve görünümden tek başına seçilebilir', () => {
  assert(layer.includes('id="playerSubtitleDisplay"'), 'kaynak/çeviri görünüm seçicisi arayüzde yok');
  assert(layer.includes('<option value="both">Kaynak ve çeviri</option>'),
    'görünüm seçicisinde çift altyazı seçeneği yok');
  const translation = js.slice(js.indexOf('async function startBrowserLiveTranslation'),
    js.indexOf('function applyBrowserTranslationResult'));
  assert(/completeTrack:\s*true/.test(translation), 'Yükle ve çevir tüm izi istemiyor');
  assert(/tamamı kuyruğa alındı/.test(translation), 'tam iz davranışı kullanıcıya açıkça bildirilmiyor');
  assert(/playerSubtitleDisplay['"]\)\.addEventListener\('change'/.test(js),
    'görünüm seçicisi altyazı moduna bağlı değil');
  const main = fs.readFileSync(path.join(__dirname, '..', 'src', 'main.js'), 'utf-8');
  const start = main.slice(main.indexOf('function startBrowserTranslation'),
    main.indexOf('function stopBrowserLiveAsr'));
  assert(/options\.completeTrack === false[\s\S]*scheduler\.completeAll\(\)/.test(start),
    'ana süreç tam iz kuyruğunu başlatmıyor');
  const states = js.slice(js.indexOf("event.type === 'translation-state'"),
    js.indexOf("event.type === 'overlay-style'"));
  assert(/completed\) >= Number\(progress\.total\)[\s\S]*setSubtitleMode\('translation', false\)/.test(states),
    'tamamlanan canlı çeviri otomatik olarak ana görünüm yapılmıyor');
});

test('terminal web çeviri hataları kullanıcı tarafından yeniden kuyruğa alınabilir', () => {
  const preload = fs.readFileSync(path.join(__dirname, '..', 'src', 'preload.js'), 'utf-8');
  const main = fs.readFileSync(path.join(__dirname, '..', 'src', 'main.js'), 'utf-8');
  assert(/retryFailedBrowserTranslation:[\s\S]*browser:translation:retryFailed/.test(preload),
    'hatalı web çevirisi yeniden deneme IPC köprüsü yok');
  assert(/ipcMain\.handle\('browser:translation:retryFailed'[\s\S]*translationScheduler\.retryFailed\(\)/.test(main),
    'ana süreç terminal çeviri hatalarını scheduler üzerinden yeniden başlatmıyor');
  assert(/browserTranslationRetryFailed['"]\)\.addEventListener\('click', retryFailedBrowserTranslation\)/.test(js),
    'yeniden deneme düğmesi renderer işlevine bağlı değil');
  const states = js.slice(js.indexOf("event.type === 'translation-state'"),
    js.indexOf("event.type === 'overlay-style'"));
  assert(/player\.browserTranslationFailed = Math\.max/.test(states)
    && /updateBrowserTranslationRetryButton\(\)/.test(states),
  'terminal hata sayısı çeviri ilerleme olayından düğmeye taşınmıyor');
  assert(/browserTranslationLastError/.test(states) && /Son hata:/.test(states),
    'terminal sağlayıcı hata nedeni üst durum şeridinde gösterilmiyor');
});

test('tamamlanan web çevirisi kalıcı ana iz olarak geri yüklenir', () => {
  const main = fs.readFileSync(path.join(__dirname, '..', 'src', 'main.js'), 'utf-8');
  const translation = main.slice(main.indexOf('function persistCompletedBrowserTranslation'),
    main.indexOf('function stopBrowserLiveAsr'));
  assert(/role:\s*'translation'/.test(translation), 'tamamlanan çeviri translation rolüyle kaydedilmiyor');
  assert(/type:\s*'subtitle-found'[\s\S]*autoLoad:\s*true/.test(translation),
    'kalıcı çeviri geri yükleme olayı yayımlanmıyor');
  const restore = main.slice(main.indexOf('function restorePersistedBrowserTracks'),
    main.indexOf('function publishBrowserTrackNow'));
  assert(/role === 'translation' && !restoredTranslation/.test(restore),
    'aynı bölümde en yeni kalıcı çeviri otomatik yükleme için seçilmiyor');
  const renderer = js.slice(js.indexOf('async function loadPersistedBrowserTranslation'),
    js.indexOf('function browserTrackSelection'));
  assert(/loadSubtitle\(track\.path, false/.test(renderer), 'kalıcı çeviri ana altyazı kanalına yüklenmiyor');
  assert(/setSubtitleMode\('translation', false\)/.test(renderer), 'kalıcı çeviri görünümü yapılmıyor');
  assert(/player\.browserTranslationTrackId = track\.id/.test(renderer),
    'kalıcı çevirinin rolü seçim ayarlarında korunmuyor');
  const restoreActive = js.slice(js.indexOf('function restoreActiveBrowserTabWorkspace'),
    js.indexOf('function syncBrowserTabs'));
  assert(/restoredPrimaryTrack/.test(restoreActive)
    && /track\.role === 'translation'/.test(restoreActive),
  'eski oturumlarda birincil çeviri rolü geri çıkarılmıyor');
  assert(/setSubtitleMode\(bestAvailableSubtitleMode\(tab\.subtitleMode\), false\)/.test(restoreActive),
    'kalıcı çeviri geri açılışta uygun görünüm moduna alınmıyor');
  assert(/browserTranslationMapFromCues\(player\.cues\)/.test(restoreActive),
    'kalıcı birincil çeviri dışa aktarma cue haritasına alınmıyor');
});

test('altyazı görünüm modu web sekmesine kaydedilir ve sekme değişiminde uygun iz ile geri gelir', () => {
  const save = js.slice(js.indexOf('function saveActiveBrowserTabWorkspace'),
    js.indexOf('function restoreActiveBrowserTabWorkspace'));
  assert(/subtitleMode:\s*savedSubtitleMode/.test(save)
    && /restoringSelection \? tab\.restoreSubtitleMode : browserSubtitleMode\(\)/.test(save),
    'kaynak/çeviri görünümü aktif web sekmesine kaydedilmiyor');
  const restore = js.slice(js.indexOf('function restoreActiveBrowserTabWorkspace'),
    js.indexOf('function syncBrowserTabs'));
  assert(/setSubtitleMode\(bestAvailableSubtitleMode\(tab\.subtitleMode\), false\)/.test(restore),
    'sekmenin altyazı görünümü kullanılabilir izlere göre geri yüklenmiyor');
  const setter = js.slice(js.indexOf('function setSubtitleMode'), js.indexOf('function setSubtitleModeMenuOpen'));
  assert(/tab\.subtitleMode = mode/.test(setter),
    'altyazı görünümü değişince aktif web sekmesi güncellenmiyor');
});

test('yerel ve web altyazı çalışma alanları tanımlı liste çizicisiyle geri yüklenir', () => {
  assert(!/\brenderTranscript\s*\(/.test(js),
    'renderer içinde tanımsız renderTranscript çağrısı çalışma alanını açarken akışı kırıyor');
  const localRestore = js.slice(js.indexOf('function restoreLocalSubtitleWorkspace'),
    js.indexOf('function saveActiveBrowserTabWorkspace'));
  const browserRestore = js.slice(js.indexOf('function restoreActiveBrowserTabWorkspace'),
    js.indexOf('function syncBrowserTabs'));
  assert(/renderCueList\(/.test(localRestore), 'yerel altyazı listesi geri yüklemede çizilmiyor');
  assert(/renderCueList\(/.test(browserRestore), 'web altyazı listesi sekme geri yüklemede çizilmiyor');
});

test('üst çalışma alanı araç grubu sidebar açık ve kapalıyken aynı sütunda kalır', () => {
  assert(/\.player-head\s*\{[^}]*grid-template-columns:\s*auto minmax\(0,\s*1fr\) auto auto/.test(css),
    'çalışma modu ile sağ araçlar başlık gridinde ayrı sabit sütunlarda değil');
  assert(!/\.player-layer\.sidebar-collapsed\s+\.player-workspace-switch\s*\{/.test(css),
    'sidebar kapalıyken çalışma modu anahtarı ayrı bir hizaya taşınıyor');
});

test('tarayıcı kalıcı ayarları özel sekmede, yakalama ayrıntıları ayrı çekmecede açılır', () => {
  for (const id of ['browserViewSettingsToggle', 'browserSettingsSurface',
    'browserDiagnosticsToolbar', 'settingsPageBrowserDiagnostics', 'browserLiveViewToolsHost']) {
    assert(layer.includes(`id="${id}"`), `${id} arayüzde yok`);
  }
  const setup = js.slice(js.indexOf('function initializeSettingsPages'),
    js.indexOf('function setSettingsDrawer'));
  assert(/child\.dataset\.browserSettingsKind === 'persistent'[\s\S]*?browserSettingsSurfaceContent['"]\)\.appendChild\(child\)/.test(setup),
    'kalıcı tarayıcı ayarları özel sekme yüzeyine taşınmıyor');
  assert(/child\.dataset\.browserSettingsKind === 'live'[\s\S]*?liveViewToolsHost\.appendChild\(child\)/.test(setup),
    'canlı sayfa ve altyazı görünüm araçları yardımcı çekmeceye taşınmıyor');
  assert(/browserSettingsKind[^\n]*\)\) view\.remove\(\)/.test(setup),
    'taşınan ayarların boş details kabuğu varsayılan altyazı sinyalinde kalıyor');
  const closeSettings = js.slice(js.indexOf('async function closeBrowserSettings'),
    js.indexOf('function browserChromeCommandBlocked'));
  assert(/await showBrowserWebSurface\(\)/.test(closeSettings),
    'ayar sekmesi kapanışı native tarayıcı görünürlüğünün geri dönmesini beklemiyor');
  assert(!layer.includes('settingsPageBrowserView') && !layer.includes('settingsTabBrowserView'),
    'eski Görünüm ve manga çekmece rotası hâlâ arayüzde');
  assert(/settingsPageBrowserDiagnostics['"]\)\.appendChild\(diagnostics\)/.test(setup),
    'yakalama ayrıntıları sağ çekmeceye taşınmıyor');
  assert(/\.settings-page-browser-diagnostics \.browser-diagnostics\s*\{[^}]*position:\s*static/.test(css),
    'yakalama paneli çekmecede hâlâ yüzen mutlak panel');
  assert(/openBrowserSettings\('site'\)/.test(js)
    && /toggleSettingsPage\('browser-diagnostics'\)/.test(js),
  'tarayıcı üst çubuğu özel ayar sekmesini veya tanı çekmecesini açmıyor');
});

test('canlı görünüm ve altyazı biçimi dar çekmecede taşmadan ızgaralanır', () => {
  assert(layer.includes('class="field subtitle-style-field"'), 'altyazı biçim alanları açık sınıf taşımıyor');
  assert(/#browserLiveViewToolsHost\s*\{[\s\S]*?display:\s*grid/.test(css)
    && /#browserLiveViewToolsHost \.browser-view-settings-grid\s*\{[\s\S]*?grid-template-columns:\s*repeat\(2/.test(css)
    && /#browserLiveViewToolsHost \.browser-view-actions\s*\{[\s\S]*?display:\s*grid/.test(css),
    'canlı görünüm araçları dengeli iki sütunlu düzene sahip değil');
  assert(/\.browser-page-quick-popover\s*\{[\s\S]*?max-height:\s*min\(430px/.test(css)
    && /\.browser-page-quick-popover \.browser-page-auto-continue\s*\{[^}]*width:\s*100%/.test(css),
    'sayfa çeviri popoverı içerik yüksekliğini ve eylem genişliğini sınırlamıyor');
});

test('ses dili bölge kodlarını güvenli biçimde eşleştiriyor', () => {
  const start = js.indexOf('function normalizeAudioLang');
  const end = js.indexOf('function currentAudioLock', start);
  const api = new Function(`${js.slice(start, end)}; return {audioLanguagesMatch};`)();
  assert(api.audioLanguagesMatch('en', 'en-US'), 'en ile en-US eşleşmedi');
  assert(!api.audioLanguagesMatch('en-US', 'en-GB'), 'iki farklı bölgesel ses yanlış eşleşti');
  const lock = js.slice(js.indexOf("$('playerAudioLock').addEventListener('change'"),
    js.indexOf("if ($('playerQuality'))"));
  assert(/player\.hls\.audioTrack = idx/.test(lock), 'ses kilidi açılınca gerçek HLS parçası değişmiyor');
});

test('geciken YouTube işleri güncel medya kimliğini doğruluyor', () => {
  const media = js.slice(js.indexOf('function setMediaKey'), js.indexOf('function currentGeneration'));
  assert(/pendGen = currentGeneration\(\)/.test(media), 'bekleyen altyazı kuşağı yakalanmıyor');
  assert(/player\.mediaKey !== pend\.key/.test(media), 'geç altyazı zamanlayıcısı medya anahtarını doğrulamıyor');
  const probe = js.slice(js.indexOf("$('playerProbe').addEventListener"), js.indexOf("if ($('playerStream'))"));
  assert(/probeSeq/.test(probe) && /probeGen/.test(probe), 'probe yarış kimliği yok');
  assert(/playerYtUrl.*trim\(\) !== url/.test(probe), 'probe URL değişimini reddetmiyor');
});

test('oynatıcı kütüphanesi geciken arama sonucunu reddediyor', () => {
  assert(/playerLibrarySearchTimer/.test(js), 'oynatıcı aramasının zamanlayıcısı yok');
  assert(/let playerLibraryResults/.test(js), 'oynatıcı aramasının sonuç dizisi yok');
  assert(/seq !== player\.playerLibrarySearchSeq/.test(js), 'geç arama cevabı reddedilmiyor');
  assert(/setAttribute\('aria-busy', 'true'\)/.test(js)
    && /setAttribute\('aria-busy', 'false'\)/.test(js), 'arama meşgul durumu erişilebilir değil');
});

test('video değişiminde A-B döngüsü ve AI sohbet bağlamı temizleniyor', () => {
  const reset = js.slice(js.indexOf('function resetMediaBoundState'), js.indexOf('function subtitleTrackState'));
  assert(/function resetMediaBoundState\(options\s*=\s*\{\}\)/.test(reset),
    'seçeneksiz medya sıfırlama options ReferenceError üretebilir');
  assert(/player\.abA = null/.test(reset) && /player\.abB = null/.test(reset), 'A-B döngüsü sıfırlanmıyor');
  assert(/player\.chatHistory = \[\]/.test(reset), 'AI sohbet geçmişi videoya bağlı değil');
  const events = js.slice(js.indexOf('function playerJobEvent'), js.indexOf('window.api.onEvent'));
  assert(/job\.mediaKey !== player\.mediaKey/.test(events) && /önceki videoya aitti/.test(events),
    'geç AI cevabı yeni videoya eklenebiliyor');
});

test('dalga biçimi ve altyazı düzenleme sonuçları medya değişimini doğruluyor', () => {
  const timeline = js.slice(js.indexOf('async function openTimeline'), js.indexOf('function closeTimeline'));
  assert(/waveformGen = currentGeneration\(\)/.test(timeline), 'dalga biçimi medya kuşağını yakalamıyor');
  assert(/staleGeneration\(waveformGen\).*player\.localPath !== waveformPath/s.test(timeline),
    'geç dalga biçimi yanlış videoya uygulanabiliyor');
  const editStart = js.indexOf('async function saveCueEdit');
  const edit = js.slice(editStart, js.indexOf("if ($('cueSearch'))", editStart));
  assert(/targetPath = player\.subPath/.test(edit) && /staleGeneration\(targetGen\)/.test(edit),
    'geç altyazı kaydı mevcut videonun belleğini değiştirebiliyor');
  assert(/const rawCues = Array\.isArray\(player\.cuesRaw\)/.test(edit),
    'tekil düzenleme kaynak cue listesini kullanmıyor');
  assert(/mergedViewChanged[\s\S]*Önce “Cümleleri birleştir”/.test(edit),
    'birleştirilmiş SRT/VTT/ASS görünümü biçim ayrımından önce engellenmiyor');
  assert(/replaceVttCueText\(player\.subRaw, sourceCue, text\)/.test(edit),
    'VTT düzenlemesi görüntü kopyası yerine kaynak cue metadatasını kullanmıyor');
  assert(/if \(sourceCue !== cue\) sourceCue\.text = text/.test(edit),
    'başarılı düzenleme cuesRaw ile ekran cue kopyasını birlikte güncellemiyor');
});

test('HLS kurtarma durum makinesi oynatıcı olaylarına bağlıdır', () => {
  assert(html.indexOf('../hls-recovery.js') > html.indexOf('vendor/hls.min.js')
    && html.indexOf('../hls-recovery.js') < html.indexOf('renderer.js'), 'durum makinesi renderer öncesinde yüklenmiyor');
  assert(/beginRecovery\('media'\)/.test(js) && /beginRecovery\('network'\)/.test(js),
    'fatal medya ve ağ yolları durum makinesini kullanmıyor');
  assert(/data\.fatal/.test(js), 'fatal olmayan HLS hataları kurtarma hakkı tüketebilir');
  assert(/playbackProgress\(video\.currentTime/.test(js), 'kararlılık gerçek medya ilerlemesiyle ölçülmüyor');
  assert(/Hls\.Events\.LEVEL_SWITCHING[\s\S]*interruptStability/.test(js), 'seviye geçişi kararlılığı kesmiyor');
  assert(/addEventListener\('stalled',[\s\S]*interruptHlsStability/.test(js), 'stall kararlılığı kesmiyor');
  assert(/player\.hls !== refreshedHls \|\| staleGeneration\(gen\)/.test(js),
    'geç loadedmetadata olayı yeni kaynağı eski konuma çekebilir');
  assert(!/hlsRecoveryTimer/.test(js), 'yarışa açık eski kararlılık timerı hâlâ etkin');
});

test('açık videoda elle tamamla/kaldır kararı otomatik flush tarafından ezilmiyor', () => {
  assert(/watchRemovedKey/.test(js) && /watchManualCompletedKey/.test(js), 'manuel kitaplık koruması yok');
  assert(/if \(player\.watchRemovedKey === player\.mediaKey\) return null/.test(js), 'kaldırılan kayıt yeniden yazılabiliyor');
  assert(/const manualCompleted[\s\S]*const automaticCompleted[\s\S]*watchCompletionReached[\s\S]*completed:\s*manualCompleted === null \? automaticCompleted : manualCompleted/.test(js),
    'elle tamamla/tamamlanmadı kararı flush içinde korunmuyor');
  assert(/if \(manualCompleted !== null\) patch\.completionOverride = manualCompleted/.test(js),
    'manuel karar store completionOverride alanına aktarılmıyor');
  assert(/typeof item\.completionOverride === 'boolean'[\s\S]*player\.watchManualCompleted = item\.completionOverride/.test(js),
    'store completionOverride alanı oynatıcıya geri yüklenmiyor');
  assert(/completionOverride:\s*nextManual[\s\S]*automaticCompleted:\s*!!item\.automaticCompleted/.test(js),
    'manuel eylem otomatik durumdan ayrı store alanlarını göndermiyor');
  assert(!/patch\.manualCompleted\s*=/.test(js), 'eski manualCompleted alanı hâlâ yazılıyor');
});

test('tüm izi tamamla aynı çeviri oturumunu yeniden başlatmaz', () => {
  const start = js.indexOf('async function completeSelectedBrowserTranslation()');
  const end = js.indexOf('async function startBrowserLiveTranslation(', start);
  const body = js.slice(start, end);
  assert(/player\.browserTranslationTrackId !== selected\.id/.test(body),
    'seçili iz zaten aktifken yeniden başlatma engeli yok');
  assert(/await useBrowserTrack\(true\)/.test(body),
    'farklı iz seçildiğinde çeviri oturumu başlatılmıyor');
  assert(/completeBrowserTranslation/.test(body), 'kalan cümleler kuyruğa alınmıyor');
});

test('izleme kütüphanesi elle tamamlandı/tamamlanmadı eylemini görünür sunuyor', () => {
  const start = js.indexOf('function renderPlayerLibrary()');
  const end = js.indexOf('function updateCollectionOptions()', start);
  const body = js.slice(start, end);
  assert(/makeWatchAction\(item\.completed \? 'Tamamlanmadı' : 'Tamamlandı', 'complete', item\.key\)/.test(body),
    'tamamlanma işleyicisi var fakat kullanıcıya düğme sunulmuyor');
});

test('dar pencerede yan panel içerik alanını erişilebilir biçimde devralıyor', () => {
  assert(layer.includes('id="narrowPanelBack"') && layer.includes('Videoya dön'),
    'dar panelden videoya dönüş kontrolü yok');
  const responsive = js.slice(js.indexOf('function responsivePanelTakeoverActive'),
    js.indexOf('function setViewMode'));
  assert(/matchMedia\('\(max-width: 1020px\)'\)/.test(responsive),
    'desteklenen dar pencere eşiği JavaScript yerleşiminde yok');
  assert(/classList\.toggle\('narrow-panel-takeover', takeover\)/.test(responsive),
    'tam alan panel durumu oyuncu katmanına uygulanmıyor');
  assert(/player\.workspaceMode === 'browser' && browserSettingsSurfaceVisible\(\)/.test(responsive)
    && /classList\.toggle\('browser-settings-open', browserSettingsOpen\)/.test(responsive),
  'dar tarayıcı ayar belgesinin bağımsız tam alan durumu uygulanmıyor');
  for (const id of ['playerStage', 'browserWorkspace', 'pdfReader']) {
    assert(responsive.includes(`'${id}'`), `${id} panel açıkken inert yapılmıyor`);
  }
  assert(/surface\.inert = takeover/.test(responsive),
    'arka yüzeylerin klavye ve işaretçi etkileşimi kapatılmıyor');
  assert(/player\.workspaceMode === 'browser' \? 'Sayfaya dön' : 'Videoya dön'/.test(responsive)
    && /back\.setAttribute\('aria-label', label\)/.test(responsive)
    && /copy\.textContent = label/.test(responsive),
  'dar panel geri düğmesi tarayıcıda sayfaya, oynatıcıda videoya döndüğünü söylemiyor');
  assert(/narrow-panel-takeover/.test(js.slice(js.indexOf('function syncBrowserOcclusion'),
    js.indexOf('function openManagedModal'))),
  'native tarayıcı görünümü tam alan panelin arkasında gizlenmiyor');
  const backStart = js.indexOf("if ($('narrowPanelBack'))");
  const backBody = js.slice(backStart, js.indexOf("for (const id of ['subtitleFindText'", backStart));
  assert(/player\.narrowPanelTakeover = false/.test(backBody)
    && /syncResponsivePlayerLayout\(\)/.test(backBody),
  'Videoya dön düğmesi geçici panel devralmasını kapatmıyor');
  assert(!/setPlayerSidebarCollapsed\(true\)/.test(backBody),
    'Videoya dön kalıcı geniş ekran panel tercihini bozmamalı');
});

test('Electron dar ayar smoke ölçümü pencere yeniden boyutlanmasını bekliyor', () => {
  const smoke = fs.readFileSync(path.join(__dirname, 'electron-browser-experience-smoke.js'), 'utf-8');
  const start = smoke.indexOf('const narrowSettingsSettled');
  const end = smoke.indexOf('const narrowSettingsTab', start);
  const block = smoke.slice(start, end);
  assert(start > 0 && end > start, 'dar ayar resize bekleme kapısı bulunamadı');
  assert(/waitFor\(async \(\) => evaluate\(renderer/.test(block)
    && /innerWidth <= 1020/.test(block)
    && /!side\?\.getClientRects\(\)\.length/.test(block)
    && /3000, 50/.test(block),
  'smoke testi sabit gecikmeyle erken ölçüm yapabilir');
});

test('yan panel genişliği ve duyarlı CSS C aşaması sınırlarını koruyor', () => {
  const width = js.slice(js.indexOf('function setSideWidth'), js.indexOf('// ---- olay bağlantıları', js.indexOf('function setSideWidth')));
  assert(/Math\.max\(320, Math\.min\(520/.test(width),
    'yan panel 320-520 px sınırlarında tutulmuyor');
  assert(/total > 1020 \? total - 480 : 520/.test(width),
    'geniş ekranda içerik için 480 px alan ayrılmıyor');
  const mediaStart = css.indexOf('@media (max-width: 1020px)');
  const mediaEnd = css.indexOf('@media (max-width: 860px)', mediaStart);
  const narrow = css.slice(mediaStart, mediaEnd);
  assert(mediaStart > 0 && mediaEnd > mediaStart, '1020 px duyarlı yerleşim bloğu yok');
  assert(/\.player-layer\.narrow-panel-takeover \.player-side[\s\S]*grid-column:\s*1 \/ -1/.test(narrow)
    && /position:\s*absolute/.test(narrow), 'yan panel dar pencerede tüm içerik sütunlarını kaplamıyor');
  assert(/\.narrow-panel-takeover \.narrow-panel-back\s*\{\s*display:\s*inline-flex/.test(narrow),
    'dar görünüm geri düğmesi yalnız devralma halinde gösterilmiyor');
  assert(/\.player-layer\.browser-settings-open \.player-side[\s\S]*?display:\s*none/.test(narrow)
    && /\.player-layer\.browser-settings-open \.player-body\s*\{[\s\S]*?grid-template-columns:\s*minmax\(0,\s*1fr\)/.test(narrow),
  'dar tarayıcı ayarlarında sıfır sütuna sıkışan yan panel tamamen kaldırılmıyor');
  const compactTools = css.slice(css.indexOf('@container player-sidebar (max-width: 500px)'),
    css.indexOf('/* ===== İki çalışma alanı', css.indexOf('@container player-sidebar (max-width: 500px)')));
  assert(/\.tool-row-main\s*\{[\s\S]*?grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\)/.test(compactTools),
    'dar yan panelde üretim eylemleri okunabilir iki sütunlu düzene geçmiyor');
  assert(/scrollbar-gutter:\s*stable/.test(css), 'kaydırma çubuğu yerleşim sıçraması engellenmiyor');
  assert(/\.player-layer :is\(button, input, select, textarea\):disabled/.test(css),
    'oynatıcı kontrollerinin devre dışı durumu ortaklaştırılmamış');
  assert(!css.includes('Stage B:'), 'geçici Stage B son-dosya override bloğu kaldırılmamış');
  assert(!html.includes('drawer-head-kicker') && !html.includes('CANLI TRANSKRİPT'),
    'yinelenen görsel etiketler hâlâ arayüzde');
});

test('R58-15: klavye önceliği — katman > düzenlenebilir > tarayıcı > oynatıcı', () => {
  const vm = require('vm');
  // Oynatıcı keydown işleyicisini kaynaktan kesip sahte DOM'da çalıştır.
  const keyStart = js.indexOf("document.addEventListener('keydown', (e) => {",
    js.indexOf('// Klavye: oynatıcı açıkken'));
  const keyEnd = js.indexOf('\n});', js.indexOf("// Gecikme/hiz/ses", keyStart) - 80) + 4;
  assert(keyStart > 0 && keyEnd > keyStart, 'oynatıcı keydown işleyicisi kesilemedi');
  const calls = [];
  const rec = (name) => (...args) => { calls.push([name, ...args]); };
  const mkEl = (hidden = true) => ({
    classList: { contains: (c) => c === 'hidden' ? hidden : false, add() {}, remove() {} },
    click: rec('el-click'),
  });
  const elements = {
    playerLayer: mkEl(false),
    playerVideo: { paused: true, muted: false, volume: 0.5, play: rec('play'), pause: rec('pause'), currentTime: 0 },
    subtitleModeMenu: mkEl(), browserPlacesPanel: mkEl(), browserDownloadsPanel: mkEl(),
    shortcutHelp: mkEl(), settingsDrawer: mkEl(false), // açık katman
    fullscreenBtn: mkEl(), subtitleModeWrap: mkEl(),
  };
  const player = {
    workspaceMode: 'browser', editing: false, selectedWord: null,
    suppressClick: false, browserPaused: true, subsHidden: false,
  };
  const runResults = { shortcut: false };
  const ctx = vm.createContext({
    document: {
      addEventListener: (type, fn) => { ctx.__keyHandler = type === 'keydown' ? fn : ctx.__keyHandler; },
      fullscreenElement: null,
      activeElement: null,
      hidden: false,
      querySelector: () => null,
      querySelectorAll: () => [],
    },
    window: {
      api: { browserCommand: rec('browserCommand') },
      BrowserCommandPalette: { browserShortcutForInput: () => null },
    },
    $: (id) => elements[id] ?? mkEl(),
    $$: () => [],
    player,
    runBrowserShortcut: () => runResults.shortcut,
    browserCommand: rec('browserCommand'),
    stepBrowserFrame: rec('stepBrowserFrame'), nudgeSpeed: rec('nudgeSpeed'),
    nudgeOffset: rec('nudgeOffset'), setPlayerVolume: rec('setPlayerVolume'),
    openCueEditor: rec('openCueEditor'), closeCueEditor: rec('closeCueEditor'),
    stepCue: rec('stepCue'), replayCue: rec('replayCue'), copyCue: rec('copyCue'),
    toggleCueSaved: rec('toggleCueSaved'), toggleWordSaved: rec('toggleWordSaved'),
    toggleAbLoop: rec('toggleAbLoop'), capturePlayerFrame: rec('capturePlayerFrame'),
    setShortcutHelpOpen: rec('setShortcutHelpOpen'), setSettingsDrawer: rec('setSettingsDrawer'),
    setSubtitleModeMenuOpen: rec('setSubtitleModeMenuOpen'), setBrowserPlacesOpen: rec('setBrowserPlacesOpen'),
    setBrowserDownloadsOpen: rec('setBrowserDownloadsOpen'), hideWordInspector: rec('hideWordInspector'),
    setSubtitlesVisible: rec('setSubtitlesVisible'), closePlayer: rec('closePlayer'),
    showControls: rec('showControls'), osd: rec('osd'), logLine: rec('logLine'),
    setSubtitleMode: rec('setSubtitleMode'),
    closePlayerDetailsMenus: rec('closePlayerDetailsMenus'),
    console,
  });
  vm.runInContext(js.slice(keyStart, keyEnd), ctx);
  const handler = ctx.__keyHandler;
  assert(typeof handler === 'function', 'keydown işleyicisi yakalanamadı');
  const key = (props) => handler({
    preventDefault: rec('preventDefault'),
    target: { tagName: 'DIV', isContentEditable: false, closest: () => null },
    ...props,
  });

  // Ctrl+C tarayıcı kısayolu eşleşmezse 'c' eylemine (copyCue) düşmemeli.
  calls.length = 0;
  key({ key: 'c', ctrlKey: true });
  assert(!calls.some(([n]) => n === 'copyCue'), 'Ctrl+C copyCue eylemini tetikledi');

  // Alt+harf oynatıcı eylemi tetiklememeli.
  calls.length = 0;
  key({ key: 'c', altKey: true });
  assert(!calls.some(([n]) => n === 'copyCue'), 'Alt+C copyCue eylemini tetikledi');

  // Odaklı düğmede Escape açık katmanı (settingsDrawer) kapatmalı.
  calls.length = 0;
  handler({ key: 'Escape', preventDefault: rec('preventDefault'),
    target: { tagName: 'BUTTON', isContentEditable: false, closest: () => null } });
  assert(calls.some(([n, v]) => n === 'setSettingsDrawer' && v === false),
    'odaklı düğmede Escape açık katmanı kapatmadı');

  // Sıradan tek harf çalışmaya devam etmeli (regresyon kontrolü).
  calls.length = 0;
  key({ key: 'c' });
  assert(calls.some(([n]) => n === 'copyCue'), 'düz c tuşu copyCue çalıştırmadı');

  // Ana ekran: çalışan iş varken INPUT içinde Escape işi iptal etmemeli.
  const mainStart = js.indexOf('// ===== Klavye kısayolları =====');
  const mainEnd = js.indexOf('\n});', js.indexOf("e.key === 'Escape'", mainStart)) + 4;
  const mainCalls = [];
  const mainRec = (name) => (...a) => { mainCalls.push([name, ...a]); };
  const mainElements = {
    playerLayer: mkEl(), resultModal: mkEl(),
    cancelBtn: { click: mainRec('cancelBtn') },
    startBtn: { click: mainRec('startBtn') },
  };
  const mainCtx = vm.createContext({
    document: { addEventListener: (t, fn) => { if (t === 'keydown') mainCtx.__h = fn; } },
    $: (id) => mainElements[id] ?? mkEl(),
    _activeModal: null,
    state: { running: true, queueRunning: false },
  });
  vm.runInContext(js.slice(mainStart, mainEnd), mainCtx);
  mainCtx.__h({ key: 'Escape', ctrlKey: false, metaKey: false,
    preventDefault: () => {},
    target: { tagName: 'INPUT', isContentEditable: false, closest: () => null } });
  assert(!mainCalls.some(([n]) => n === 'cancelBtn'),
    'INPUT içinde Escape çalışan işi iptal etti');
  // Aynı durumda düz hedefte Escape işi iptal eder (beklenen davranış korunur).
  mainCalls.length = 0;
  mainCtx.__h({ key: 'Escape', ctrlKey: false, metaKey: false,
    preventDefault: () => {},
    target: { tagName: 'DIV', isContentEditable: false, closest: () => null } });
  assert(mainCalls.some(([n]) => n === 'cancelBtn'), 'düz hedefte Escape işi iptal etmedi');
});

test('playlist rayı Invidious thumbnail dizisiyle çöküp tüm sonuç gridini boş bırakmıyor', () => {
  // BUG-109-09: renderStPlaylistRail, absThumb'a pl.videoThumbnails DİZİSİNİ
  // veriyordu (dizide startsWith yok) → TypeError doSmartTubeSearch içinde
  // innerHTML='' sonrası fırlıyor, 20 geçerli video sonucuyla birlikte
  // grid tamamen boş ve HATASIZ kalıyordu. Gerçek Invidious'ta playlist
  // döndüren her arama boş ekran gösteriyordu.
  const vm = require('vm');
  const railSrc = js.slice(js.indexOf('function renderStPlaylistRail'));
  const railEnd = railSrc.indexOf('\n}') + 2;
  const created = [];
  const mk = (tag) => {
    const el = { tag, children: [], attrs: {}, listeners: {},
      appendChild(c) { this.children.push(c); }, setAttribute(k, v) { this.attrs[k] = v; },
      addEventListener(t, fn) { this.listeners[t] = fn; } };
    created.push(el); return el;
  };
  const ctx = vm.createContext({
    document: { createElement: (t) => mk(t) },
    absThumb: (url) => {
      if (!url || typeof url !== 'string' || !url.startsWith) return '';
      return /^https?:\/\//i.test(url) ? url : '';
    },
    openInvidiousPlaylistPage: () => {},
  });
  vm.runInContext(railSrc.slice(0, railEnd), ctx);
  const grid = mk('div');
  const playlists = [
    { type: 'playlist', playlistId: 'PL1', title: 'Lofi Mix', author: 'A', videoCount: 65,
      videoThumbnails: [{ quality: 'medium', url: 'https://i.example/a.jpg', width: 336, height: 188 }] },
    { type: 'playlist', playlistId: 'PL2', title: 'No thumbs', videoCount: 3, videoThumbnails: [] },
  ];
  let threw = null;
  try { ctx.renderStPlaylistRail(grid, playlists); } catch (e) { threw = e; }
  assert(!threw, 'ray çizimi thumbnail dizisinde fırladı: ' + threw);
  assert(grid.children.length === 1, 'ray kapsayıcısı gride eklenmedi');
  const cards = grid.children[0].children;
  assert(cards.length === 2, 'rayda 2 playlist kartı bekleniyor, ' + cards.length);
  const img = cards[0].children.flatMap((c) => c.children).find((c) => c.tag === 'img');
  assert(img && img.src === 'https://i.example/a.jpg',
    'ray thumbnail img src seçilen entry url olmalı, bulunan: ' + (img && img.src));

  // Çağrı tarafı: ray çizim hatası video sonuçlarını da götürmemeli.
  const searchSrc = js.slice(js.indexOf('async function doSmartTubeSearch'));
  const site = searchSrc.slice(0, searchSrc.indexOf('function renderStPlaylistRail'));
  assert(/try\s*\{[\s\S]*?renderStPlaylistRail[\s\S]*?\}\s*catch/.test(site),
    'renderStPlaylistRail çağrısı try/catch ile korunmuyor');
});

console.log(`\n${pass} geçti, ${failures.length} başarısız (${pass + failures.length} test)`);
if (failures.length) {
  console.error('\nBaşarısız:');
  failures.forEach((f) => console.error('  - ' + f));
  process.exit(1);
}
