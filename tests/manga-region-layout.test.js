// Kuyruk-g18 — Manga/OCR seçim bölgesi: zoom, pencere boyutu ve sayfa değişiminde
// kaplamanın doğru görsele uygulanması. Yerleşim kaynak değişmezleri kilidi.
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const src = fs.readFileSync(path.join(root, 'src/browser-manga.js'), 'utf8');

let passed = 0;
function test(name, fn) {
  try { fn(); passed++; }
  catch (error) { error.message = `${name}: ${error.message}`; throw error; }
}

test('kaplama katmanı sabit konumlu ve hedef her düzenlemede taze rect ile okunur', () => {
  assert.match(src, /overlay\.style\.setProperty\('position', 'fixed', 'important'\)/);
  assert.match(src, /const rect = target\.getBoundingClientRect\(\);[\s\S]{0,1500}overlay\.style\.setProperty\('left', rect\.left/);
});

test('kaydırma + pencere yeniden boyutlandırma + görünür-alan (pinch/sayfa zoom) yeniden düzenler', () => {
  assert.match(src, /addEventListener\('scroll', state\.onLayout, true\)/);
  assert.match(src, /addEventListener\('resize', state\.onLayout, true\)/);
  assert.match(src, /visualViewport\.addEventListener\('scroll', state\.onLayout\)/);
  assert.match(src, /visualViewport\.addEventListener\('resize', state\.onLayout\)/);
});

test('görsel boyutu değişimi (zoom/responsive) ResizeObserver ile izlenir', () => {
  assert.match(src, /new ResizeObserver\(state\.onLayout\)/);
  assert.match(src, /state\.resizeObserver\?\.observe\(image\)/);
});

test('bölge kutuları görsel gövdesine göreli (%), zoom kendinden ölçekler', () => {
  assert.match(src, /region\.dataset\.baseWidth/);
  assert.match(src, /region\.style\.width = region\.dataset\.baseWidth \+ '%'/);
});

test('görsel kimliği içerik-adresli — srcset/sayfa değişimi eski kaplamayı yanlış görsele taşımaz', () => {
  assert.match(src, /__whisperMangaSrcIds = new WeakMap\(\)/);
  assert.match(src, /perImage\.get\(renderedUrl\)/);
  assert.match(src, /if \(oldId !== id\)[\s\S]{0,400}overlayState\.overlays\.get\(oldId\)\.remove\(\)/);
});

test('bağlantısı kopan hedef kaplaması düzen döngüsünde temizlenir', () => {
  assert.match(src, /if \(!target \|\| !target\.isConnected\) \{\s*overlay\.remove\(\);\s*state\.overlays\.delete\(id\)/);
});

test('kaplama kaldırıldıysa görsel dururken geri bağlanır (anti-tamper dayanımı)', () => {
  assert.match(src, /if \(!overlay\.isConnected\).*appendChild\(overlay\)/);
});

test('sayfa dışına taşan kaplama görünmezliğe çekilir, kaydırınca geri gelir', () => {
  assert.match(src, /rect\.bottom > 0 && rect\.right > 0[\s\S]{0,300}setProperty\('visibility'/);
});

test('object-fit/dönüşüm geometrisi: içerik kutusu ve eksen eşlemesi manga-geometry üzerinden', () => {
  assert.match(src, /require\('\.\/manga-geometry'\)/);
  assert.match(src, /getComputedStyle\(target\)/);
  assert.match(src, /mangaOverlayFrame\(\{/);
  assert.match(src, /mangaRegionFractionBox\(JSON\.parse\(group\.dataset\.bubbleBox/);
  assert.match(src, /frame\.supported[\s\S]{0,200}rect\.bottom > 0/);
});

test('düzen döngüsü frame başına kuyruklanır (layoutQueued ile birden çok istek tekile iner)', () => {
  assert.match(src, /if \(!state\.layoutQueued\) \{\s*state\.layoutQueued = true;\s*state\.layoutFrame = requestAnimationFrame\(state\.layout\);\s*\}/);
});

console.log(`PASS ${passed}/10`);
