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
const css = fs.readFileSync(path.join(SRC, 'styles.css'), 'utf-8');

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
  assert(/env\.gpuFeatures/.test(init), 'Chromium GPU özellikleri okunmuyor');
  assert(/video çözme:/.test(init) && /WebGL:/.test(init) && /kompozisyon:/.test(init),
    'video decode, WebGL ve kompozisyon durumu kullanıcıya gösterilmiyor');
});

test('tarayıcı modunda oynatma kısayolları web videosuna gider', () => {
  const start = js.lastIndexOf("document.addEventListener('keydown'");
  const body = js.slice(start, start + 4200);
  assert(/workspaceMode === 'browser'/.test(body), 'tarayıcı kısayol dalı yok');
  for (const command of ['play-pause', 'seek-relative', 'mute', 'volume-relative']) {
    assert(body.includes(`'${command}'`), `${command} web videosuna bağlı değil`);
  }
  assert(/browserCommand\(command, value\)/.test(body), 'komut sekme kimlikli tarayıcı IPC kanalına gitmiyor');
  assert(/stepBrowserFrame/.test(body), 'duraklatılmış web videosunda kare adımı bağlı değil');
  const frame = js.slice(js.indexOf('async function stepBrowserFrame'), js.indexOf('async function nudgeSpeed'));
  assert(/browserCommand\('frame-step'/.test(frame), 'kare adımı web videosu IPC komutunu kullanmıyor');
  const speed = js.slice(js.indexOf('async function nudgeSpeed'), js.indexOf('// Ses cubugu'));
  assert(/browserCommand\('speed', target\)/.test(speed), 'hız kısayolu web videosunu hedeflemiyor');
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
  assert(/player\.autoPause/.test(cue) && /browserCommand\('pause'\)/.test(cue),
    'otomatik dur web videosunu durdurmuyor');
  const toggle = js.slice(js.indexOf('function toggleAbLoop'), js.indexOf('function renderAbMarkers'));
  assert(/workspaceMode === 'browser' \? player\.browserTime/.test(toggle), 'A/B noktaları web zamanından alınmıyor');
});

test('web profil geri yükleme her asenkron komuttan sonra güncelliği denetliyor', () => {
  const restore = js.slice(js.indexOf('async function restoreWatchProfile'), js.indexOf('function makeWatchAction'));
  assert(/const stillCurrent =/.test(restore), 'profil güncellik yardımcısı yok');
  const checks = restore.match(/if \(!stillCurrent\(\)\) return;/g) || [];
  assert(checks.length >= 3, 'hız, ses ve mute komutlarından sonra ayrı güncellik denetimi yok');
});

test('web medya probu üst üste binmiyor ve gezinme sonrası eski sonucu yayınlamıyor', () => {
  const main = fs.readFileSync(path.join(__dirname, '..', 'src', 'main.js'), 'utf-8');
  const poll = main.slice(main.indexOf('function startBrowserPolling'), main.indexOf('function stopBrowserPolling'));
  assert(/browserMediaBusy/.test(poll), 'medya probunda busy koruması yok');
  assert(/generation !== browserStateGeneration|isCurrentBrowserContext\(context\)/.test(poll), 'eski tarama kuşağı elenmiyor');
  assert(/activeContents\.getURL\(\) !== pageUrl/.test(poll), 'gezinme sonrası eski medya sonucu elenmiyor');
  assert(/finally\s*{\s*if \(generation === browserStateGeneration\) browserMediaBusy = false/.test(poll),
    'eski medya probu yeni probun busy durumunu temizleyebiliyor');
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
  assert(/if \(button\?\.disabled\) return null/.test(create), 'çift tıklama kısa devresi yok');
  assert(/button\.disabled = true/.test(create) && /finally[\s\S]{0,120}button\.disabled = false/.test(create),
    'yeni sekme düğmesi hata dahil tüm yollarda geri açılmıyor');
});

test('kuyruk sıradaki işi done değil süreç exit olayında başlatıyor', () => {
  const done = js.slice(js.indexOf("case 'done':"), js.indexOf("case 'error':"));
  const exit = js.slice(js.indexOf("case 'exit':"), js.indexOf('\n  }\n});', js.indexOf("case 'exit':")));
  assert(!/processNextQueueItem/.test(done), 'done olayı süreç kapanmadan sıradaki işi başlatıyor');
  assert(/processNextQueueItem/.test(exit), 'exit olayı sıradaki kuyruk işini başlatmıyor');
});

// ---- 1. ölü kontrol yok ----
test('oynatıcıdaki her düğmenin renderer.js\'te karşılığı var', () => {
  const tags = [...layer.matchAll(/<button[^>]*id="([A-Za-z0-9_-]+)"[^>]*>/g)];
  assert(tags.length > 30, `beklenenden az dugme bulundu (${tags.length}) — ayirma bozulmus olabilir`);
  // Bir düğme ya id'siyle ya da delegasyon kancasıyla (data-* / sınıf)
  // bağlanmış olmalı. Delegasyonu "ölü" saymak yanlış alarm üretir.
  const wired = (m) => {
    const [tag, id] = [m[0], m[1]];
    if (new RegExp(`['"]${id}['"]`).test(js)) return true;
    const hooks = [...tag.matchAll(/\sdata-([a-z-]+)=/g)].map((d) => d[1]);
    return hooks.some((h) => js.includes(`data-${h}`) || js.includes(camel(h)));
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
  for (const name of ['listWatchLibrary', 'updateWatchItem', 'removeWatchItem', 'searchWatchLibrary']) {
    assert(js.includes(`window.api.${name}`), `${name} renderer tarafından kullanılmıyor`);
  }
  assert(html.includes('id="playerLibrarySearch"'), 'oynatıcı kütüphanesi arama alanı yok');
  assert(html.includes('id="playerLibraryFilter"'), 'oynatıcı kütüphanesi filtresi yok');
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
  const body = js.slice(i, i + 500);
  assert(/sidebarIsVisible\(\)/.test(body),
    'dugme yalnizca sinifa bakiyor — sinema modunda ekranda hicbir sey degismez');
  assert(/setViewMode\(/.test(body),
    'sinema modundan cikmiyor — panel geri getirilemez');
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
  for (const fn of ['setViewMode', 'setSideWidth', 'setPlayerSidebarCollapsed']) {
    const i = js.indexOf(`function ${fn}(`);
    const body = js.slice(i, js.indexOf('\n}', i));
    assert(/scheduleBrowserBounds\(\)/.test(body),
      `${fn} tarayici gorunumu sinirlarini yenilemiyor`);
  }
});

// ---- 6. otomatik dur ----
test('otomatik dur geçişi ÖNCEKİ zamanın bloğuna göre sınanıyor', () => {
  const i = js.indexOf('player.autoPause && !video.paused');
  assert(i > 0, 'otomatik dur blogu bulunamadi');
  const body = js.slice(i, i + 900);
  // timeupdate ~250 ms'de bir tetiklenir, bloklar arasi bosluk ~80 ms. Tik
  // cogu zaman boslugu atlayip SONRAKI blogun icine duser; o an mevcut
  // indeksi kullanmak gecisi yanlis blogun sonuna gore sinar ve duraklatma
  // kacirilir. Gecis her zaman lastT'nin blogu uzerinden sinanmali.
  assert(!/const j = i >= 0 \? i :/.test(body),
    'gecis mevcut indekse guveniyor — tik boslugu atlayinca duraklatma kacar');
  assert(/const j = findCueAt\(player\.cues,\s*player\.lastT/.test(body),
    'gecis lastT blogundan hesaplanmiyor');
  assert(/dt > 0 && dt < 1/.test(body),
    'ileri/geri sarma korumasi (dt) kaybolmus — sarmada da duraklatir');
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
  const body = js.slice(i, i + 650);
  assert(/classList\.toggle\('hide-src',\s*!source\)/.test(body),
    "kaynak sinifi playerLayer'a uygulanmiyor");
  assert(/classList\.toggle\('hide-tr',\s*!translation\)/.test(body),
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
  const body = js.slice(i, i + 220);
  assert(/history:\s*\(player\.chatHistory \|\| \[\]\)\.slice\(\)/.test(body),
    'gecmis referansla gonderiliyor — asagida ayni diziye soru eklenince '
    + 'soru modele IKI KEZ gider');
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
test('native başlık gizlenirken pencere düğmeleri için güvenli alan korunur', () => {
  const main = fs.readFileSync(path.join(SRC, '..', 'main.js'), 'utf-8');
  assert(/titleBarStyle:\s*'hidden'/.test(main), 'ayrı Windows başlık şeridi hâlâ açık');
  assert(/titleBarOverlay:\s*\{/.test(main), 'native küçült/büyüt/kapat düğmeleri korunmuyor');
  assert(/--window-controls-safe-width:\s*148px/.test(css), 'pencere düğmeleri için güvenli genişlik yok');
  assert(/\.player-head\s*\{[\s\S]*?padding-right:\s*calc\((?:14|22)px \+ var\(--window-controls-safe-width\)\)/.test(css),
    'oynatıcı başlığı native düğmelerden kaçınmıyor');
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
  assert(/\.player-layer\.browser-chrome-collapsed #browserSignalToggle\s*\{[^}]*display:\s*none/.test(css),
    'sade görünümde adres dışı araçlar tamamen çekilmiyor');
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

test('tarayıcı araç çubuğu ve ayrıntılar yeniden boyutlanan paneli izliyor', () => {
  assert(/\.browser-workspace\s*\{[^}]*grid-template-rows:\s*auto auto minmax\(0,\s*1fr\)/.test(css),
    'araç çubuğu büyüdüğünde tarayıcı görünümü sabit 82px satıra sıkışıyor');
  assert(/@container browser-workspace \(max-width:\s*620px\)[\s\S]*?\.browser-toolbar\s*\{[^}]*grid-template-rows:\s*28px 36px 36px/.test(css),
    'dar panel araç çubuğu container genişliğine göre üç satıra geçmiyor');
  assert(/@container browser-workspace \(max-width:\s*920px\)[\s\S]*?\.browser-diagnostics\s*\{[^}]*position:\s*relative[^}]*max-height:\s*min\(420px,\s*48dvh\)[^}]*overflow:\s*auto/.test(css),
    'dar panelde ayrıntılar görünür akışa girmiyor veya yüksekliği sınırlanmıyor');
  assert(/@container browser-workspace \(max-width:\s*920px\)[\s\S]*?\.browser-acquisition-stages\s*\{[^}]*repeat\(2/.test(css),
    'edinme adımları panel genişliğine göre iki sütuna düşmüyor');
  assert(/\.browser-signal-text\s*\{[^}]*overflow-wrap:\s*anywhere/.test(css)
    && !/\.browser-signal-text\s*\{[^}]*white-space:\s*nowrap/.test(css),
    'önemli yakalama durumu dar panelde kesiliyor');
});

test('tarayıcı sekmeleri erişilebilir tab modeli ve SVG kapatma ikonları kullanıyor', () => {
  assert(/open\.setAttribute\('role', 'tab'\)/.test(js)
    && /open\.tabIndex = tab\.id === player\.browserActiveTabId \? 0 : -1/.test(js),
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

test('uzun videoda transkripsiyon izlenen konumdan parçalara ayrılıyor', () => {
  assert(/function progressiveRanges\(duration, current, windowSec = 600\)/.test(js),
    'progressiveRanges yok');
  const i = js.indexOf('async function startProgressiveChunk');
  assert(i > 0, 'parça başlatma fonksiyonu yok');
  const body = js.slice(i, i + 700);
  assert(/clipStart:\s*range\.start/.test(body) && /clipEnd:\s*range\.end/.test(body),
    'her parça kendi zaman aralığını backend e göndermiyor');
  assert(/mergeLiveCues/.test(js.slice(js.indexOf('async function finishProgressiveJob'), js.indexOf('async function handleProgressiveTerminal'))),
    'parça sonuçları tek listede birleştirilmiyor');
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

test('zamanlama masası altyazı gecikmesini medya eksenine uygular', () => {
  const start = js.indexOf('function timelineDuration');
  const end = js.indexOf('async function saveTimelineCopy', start);
  const block = js.slice(start, end);
  assert(/\.end \+ player\.offset/.test(block), 'altyazı bitişi medya eksenine taşınmıyor');
  assert(/mediaStart = cue\.start \+ player\.offset/.test(block), 'blok çizimi gecikmeyi kullanmıyor');
  assert(/timelinePlaybackTime\(\) - player\.offset/.test(block), 'bölme noktası altyazı eksenine çevrilmiyor');
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
  assert(/titleBarOverlay\s*:\s*\{[\s\S]*?height:\s*36/.test(main),
    'native başlık şeridi yüksekliği tanımlı değil');
  assert(/--window-controls-safe-height:\s*36px/.test(css),
    'başlık düğmeleri için dikey güvenli alan yok');
  assert(/\.app-header\s*\{[\s\S]*?min-height:\s*calc\(72px \+ var\(--window-controls-safe-height\)\)/.test(css),
    'ana başlık güvenli yüksekliği ayırmıyor');
  assert(/\.player-head\s*\{[\s\S]*?min-height:\s*calc\(70px \+ var\(--window-controls-safe-height\)\)/.test(css),
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
  assert(/attachSiblingSubtitles\(state\.lastJobVideo, outputs\.length === 0\)/.test(open),
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

test('web altyazı araçları dosya, iki iz, dışa aktarma ve A-B kopyasını bağlıyor', () => {
  for (const id of ['browserManualSubtitle', 'browserTrackSelect2', 'browserTrackLoadPair', 'browserTrackExport',
    'browserTranslationExport', 'browserCopyAb']) {
    assert(layer.includes(`id="${id}"`), `${id} arayüzde yok`);
    assert(js.includes(`$('${id}')`), `${id} renderer'a bağlı değil`);
  }
  assert(/loadSubtitle\(second\.path, true\)/.test(js), 'ikinci web izi ikinci altyazı kanalına yüklenmiyor');
  assert(/exportBrowserSubtitle/.test(js), 'web altyazısı dışa aktarma IPC hattına gitmiyor');
  assert(/function exportBrowserTranslation/.test(js)
    && /browserLiveTranslations/.test(js.slice(js.indexOf('function exportBrowserTranslation'),
      js.indexOf('function abSubtitleExcerpt'))),
  'canlı çeviri ayrı olarak dışa aktarılamıyor');
  assert(/liveCues\.length \? liveCues : player\.cues2/.test(js),
    'sekme geri yüklemesinde çeviri dışa aktarımı hazır ikinci kanala düşmüyor');
  assert(/function abSubtitleExcerpt/.test(js) && /cuesToSrt\(cues\)/.test(js),
    'A-B altyazı metni zamanlı SRT olarak üretilmiyor');
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

test('tarayıcı görünüm ve yakalama ayarları videoyu itmeden sağ çekmecede açılır', () => {
  for (const id of ['browserViewSettingsToggle', 'browserDiagnosticsToolbar',
    'settingsPageBrowserView', 'settingsPageBrowserDiagnostics']) {
    assert(layer.includes(`id="${id}"`), `${id} arayüzde yok`);
  }
  const setup = js.slice(js.indexOf('function initializeSettingsPages'),
    js.indexOf('function setSettingsDrawer'));
  assert(/settingsPageBrowserView['"]\)\.appendChild\(view\)/.test(setup),
    'görünüm ve manga ayarları sağ çekmeceye taşınmıyor');
  assert(/settingsPageBrowserDiagnostics['"]\)\.appendChild\(diagnostics\)/.test(setup),
    'yakalama ayrıntıları sağ çekmeceye taşınmıyor');
  assert(/\.settings-page-browser-diagnostics \.browser-diagnostics\s*\{[^}]*position:\s*static/.test(css),
    'yakalama paneli çekmecede hâlâ yüzen mutlak panel');
  assert(/toggleSettingsPage\('browser-view'\)/.test(js)
    && /toggleSettingsPage\('browser-diagnostics'\)/.test(js),
  'tarayıcı üst çubuğu sağ çekmece sayfalarını açmıyor');
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
});

test('HLS medya ve ağ kurtarma bütçeleri ayrıdır ve kararlı oynatmada temizlenir', () => {
  assert(/hlsMediaRecover/.test(js) && /hlsNetRecover/.test(js), 'HLS hata sayaçları ortak kalmış');
  assert(/hlsMediaRecover < 2/.test(js) && /hlsNetRecover < 2/.test(js), 'kurtarma sınırı korunmuyor');
  assert(/hlsMediaRecover = 0[\s\S]*hlsNetRecover = 0/.test(js), 'kararlı oynatmada sayaçlar sıfırlanmıyor');
});

test('açık videoda elle tamamla/kaldır kararı otomatik flush tarafından ezilmiyor', () => {
  assert(/watchRemovedKey/.test(js) && /watchManualCompletedKey/.test(js), 'manuel kitaplık koruması yok');
  assert(/if \(player\.watchRemovedKey === player\.mediaKey\) return null/.test(js), 'kaldırılan kayıt yeniden yazılabiliyor');
  assert(/manualCompleted === null[\s\S]*watchCompletionReached[\s\S]*: manualCompleted/.test(js),
    'elle tamamla/tamamlanmadı kararı flush içinde korunmuyor');
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

console.log(`\n${pass} geçti, ${failures.length} başarısız (${pass + failures.length} test)`);
if (failures.length) {
  console.error('\nBaşarısız:');
  failures.forEach((f) => console.error('  - ' + f));
  process.exit(1);
}
