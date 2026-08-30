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

// ---- 4. ses çubuğu koyu temaya uygun ----
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
