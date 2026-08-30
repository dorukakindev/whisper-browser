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
  const ids = [...new Set([...layer.matchAll(/<button[^>]*id="([A-Za-z0-9_-]+)"/g)].map((m) => m[1]))];
  assert(ids.length > 30, `beklenenden az dugme bulundu (${ids.length}) — ayirma bozulmus olabilir`);
  const dead = ids.filter((id) => !new RegExp(`['"]${id}['"]`).test(js));
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

// ---- 8. ses çubuğu koyu temaya uygun ----
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
