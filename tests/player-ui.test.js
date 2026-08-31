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

test('tarayıcı modunda oynatma kısayolları web videosuna gider', () => {
  const start = js.lastIndexOf("document.addEventListener('keydown'");
  const body = js.slice(start, start + 4200);
  assert(/workspaceMode === 'browser'/.test(body), 'tarayıcı kısayol dalı yok');
  for (const command of ['play-pause', 'seek-relative', 'mute', 'volume-relative']) {
    assert(body.includes(`'${command}'`), `${command} web videosuna bağlı değil`);
  }
  assert(/window\.api\.browserCommand\(command, value\)/.test(body), 'komut tarayıcı IPC kanalına gitmiyor');
  assert(/stepBrowserFrame/.test(body), 'duraklatılmış web videosunda kare adımı bağlı değil');
  const frame = js.slice(js.indexOf('async function stepBrowserFrame'), js.indexOf('async function nudgeSpeed'));
  assert(/browserCommand\('frame-step'/.test(frame), 'kare adımı web videosu IPC komutunu kullanmıyor');
  const speed = js.slice(js.indexOf('async function nudgeSpeed'), js.indexOf('// Ses cubugu'));
  assert(/browserCommand\('speed', target\)/.test(speed), 'hız kısayolu web videosunu hedeflemiyor');
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
  assert(html.includes('id="watchLibrarySearch"'), 'kütüphane arama alanı yok');
  assert(html.includes('id="watchCollectionFilter"'), 'koleksiyon filtresi yok');
});

test('izleme kütüphanesi oynatıcı sağ panelinde erişilebilir ve boşken gizlenmiyor', () => {
  assert(html.includes('id="sideTabLibrary"') && html.includes('data-stab="library"'), 'oynatıcı kütüphane sekmesi yok');
  assert(html.includes('id="playerLibraryPanel"'), 'oynatıcı kütüphane paneli yok');
  const render = js.slice(js.indexOf('function renderWatchLibrary'), js.indexOf('function renderPlayerLibrary'));
  assert(/card\.classList\.remove\('hidden'\)/.test(render), 'ana kütüphane boşken hâlâ gizleniyor');
  const tabs = js.slice(js.indexOf('function setSideTab'), js.indexOf('// ---- bağlamlı AI'));
  assert(/tab === 'library'/.test(tabs) && /playerLibraryPanel/.test(tabs), 'kütüphane sekmesi panele bağlı değil');
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
  assert(/\.player-head\s*\{[^}]*padding-right:\s*calc\(14px \+ var\(--window-controls-safe-width\)\)/.test(css),
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
  assert(/\.player-layer\.browser-chrome-collapsed \.player-head\s*\{[^}]*display:\s*none/.test(css),
    'sade görünüm üst oynatıcı başlığını gizlemiyor');
  assert(/\.player-layer\.browser-chrome-collapsed #browserSignalToggle\s*\{[^}]*display:\s*none/.test(css),
    'sade görünümde adres dışı araçlar tamamen çekilmiyor');
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

test('izleme profili gecikirse başka videoya uygulanmıyor', () => {
  const i = js.indexOf('async function restoreWatchProfile');
  const body = js.slice(i, js.indexOf('function makeWatchAction', i));
  assert(/const gen = currentGeneration\(\)/.test(body), 'profil kuşağı yakalanmıyor');
  assert(/staleGeneration\(gen\).*player\.mediaKey !== key/s.test(body),
    'geç gelen profil için kuşak ve medya anahtarı kontrolü yok');
  assert((body.match(/staleGeneration\(gen\)/g) || []).length >= 3,
    'altyazı awaitleri sonrasında yeniden kuşak kontrol edilmiyor');
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
  for (const id of ['browserManualSubtitle', 'browserTrackSelect2', 'browserTrackLoadPair', 'browserTrackExport', 'browserCopyAb']) {
    assert(layer.includes(`id="${id}"`), `${id} arayüzde yok`);
    assert(js.includes(`$('${id}')`), `${id} renderer'a bağlı değil`);
  }
  assert(/loadSubtitle\(second\.path, true\)/.test(js), 'ikinci web izi ikinci altyazı kanalına yüklenmiyor');
  assert(/exportBrowserSubtitle/.test(js), 'web altyazısı dışa aktarma IPC hattına gitmiyor');
  assert(/function abSubtitleExcerpt/.test(js) && /cuesToSrt\(cues\)/.test(js),
    'A-B altyazı metni zamanlı SRT olarak üretilmiyor');
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

test('iki kütüphane araması ayrı sonuç ve zamanlayıcı kullanıyor', () => {
  assert(/playerLibrarySearchTimer/.test(js), 'oynatıcı aramasının ayrı zamanlayıcısı yok');
  assert(/let playerLibraryResults/.test(js), 'oynatıcı aramasının ayrı sonuç dizisi yok');
  assert(/seq !== watchSearchSeq/.test(js) && /seq !== player\.playerLibrarySearchSeq/.test(js),
    'geç arama cevapları reddedilmiyor');
});

test('video değişiminde A-B döngüsü ve AI sohbet bağlamı temizleniyor', () => {
  const reset = js.slice(js.indexOf('function resetMediaBoundState'), js.indexOf('function subtitleTrackState'));
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

console.log(`\n${pass} geçti, ${failures.length} başarısız (${pass + failures.length} test)`);
if (failures.length) {
  console.error('\nBaşarısız:');
  failures.forEach((f) => console.error('  - ' + f));
  process.exit(1);
}
