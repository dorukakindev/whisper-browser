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
  const i = js.indexOf("$('showSource').addEventListener");
  assert(i > 0, 'showSource dinleyicisi yok');
  const body = js.slice(i, i + 260);
  assert(/playerLayer'\)\.classList\.toggle\('hide-src'/.test(body),
    "sinif katmana konmuyor — video uzerindeki altyazi anahtardan etkilenmez");
  assert(/\.player-layer\.hide-src #subtitleOverlay\s*\{[^}]*display:\s*none/.test(css),
    'katmani gizleyen CSS kurali yok');
  assert(/\.player-layer\.hide-tr #subtitleOverlay2\s*\{[^}]*display:\s*none/.test(css),
    'ikinci altyazi katmanini gizleyen kural yok');
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

// ---- 13. işletim sistemi başlık çubuğu ----
test('OS başlık çubuğu gizli ama pencere kullanılabilir', () => {
  const main = fs.readFileSync(path.join(SRC, '..', 'main.js'), 'utf-8');
  assert(/titleBarStyle:\s*'hidden'/.test(main), 'baslik cubugu gizlenmemis');
  // Overlay SART: yoksa kucult/buyut/kapat dugmeleri kaybolur.
  assert(/titleBarOverlay:\s*\{/.test(main), 'pencere dugmeleri overlay yok — pencere kapatilamaz');
  // Pencere sürüklenebilir kalmali
  assert(/-webkit-app-region:\s*drag/.test(css), 'surukleme bolgesi yok — pencere tasinamaz');
  assert(/-webkit-app-region:\s*no-drag/.test(css), 'dugmeler surukleme bolgesinden ayrilmamis');
  // Icerik pencere dugmelerinin altina girmemeli
  assert(/env\(titlebar-area-width/.test(css),
    'baslik alani genisligi hesaba katilmamis — ust sagdaki dugmeler ortulur');
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

// ---- 15. ses çubuğu koyu temaya uygun ----
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

console.log(`\n${pass} geçti, ${failures.length} başarısız (${pass + failures.length} test)`);
if (failures.length) {
  console.error('\nBaşarısız:');
  failures.forEach((f) => console.error('  - ' + f));
  process.exit(1);
}
