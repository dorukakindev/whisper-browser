'use strict';

// Kuyruk-50 madde 39 — manga görüntü dönüşümü geometrisi (src/manga-geometry.js):
// bölge konumlarının object-fit letterbox, CSS rotate/flip ve zoom altında
// dosya-uzayı kutularıyla tutarlı eşlenmesini kilitler; axis-aligned
// indirgenemeyen dönüşümlerde supported:false ile katmanın gizlenmesini
// (yanlış bölge gösterimi/OCR kesimi engeli) doğrular.

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const {
  mangaAxisTransform, mangaImageContentRect, mangaMapAxisPoint,
  mangaOverlayFrame, mangaParsePosition, mangaRegionFractionBox,
} = require('../src/manga-geometry');
const { mangaOverlayScript } = require('../src/browser-manga');

const EPS = 1e-9;
const near = (a, b) => Math.abs(a - b) < EPS;
function assertRect(actual, expected, label) {
  for (const key of ['left', 'top', 'width', 'height']) {
    assert.ok(near(actual[key], expected[key]), `${label}.${key}: ${actual[key]} != ${expected[key]}`);
  }
}

let checks = 0;
const ok = (cond, label) => { checks += 1; assert.ok(cond, label); };

// --- mangaParsePosition ---
assert.strictEqual(mangaParsePosition('50%', 400, 200), 100, 'center %50');
assert.strictEqual(mangaParsePosition('left', 400, 200), 0, 'left=0');
assert.strictEqual(mangaParsePosition('right', 400, 200), 200, 'right=free');
assert.strictEqual(mangaParsePosition('top', 300, 100), 0, 'top=0');
assert.strictEqual(mangaParsePosition('bottom', 300, 100), 200, 'bottom=free');
assert.strictEqual(mangaParsePosition('center', 400, 200), 100, 'center');
assert.strictEqual(mangaParsePosition('25%', 400, 200), 50, '25% free space');
assert.strictEqual(mangaParsePosition('30px', 400, 200), 30, 'px değeri');
assert.strictEqual(mangaParsePosition('60', 400, 200), 60, 'düz sayı px');
assert.strictEqual(mangaParsePosition('bogus', 400, 200), 100, 'bozuk → center');
assert.strictEqual(mangaParsePosition('', 400, 200), 100, 'boş → center');
checks += 11;

// --- mangaImageContentRect ---
assertRect(
  mangaImageContentRect({ offsetWidth: 400, offsetHeight: 300, naturalWidth: 400, naturalHeight: 150, objectFit: 'fill' }),
  { left: 0, top: 0, width: 400, height: 300 }, 'fill içerik elementi doldurur');
assertRect(
  mangaImageContentRect({ offsetWidth: 400, offsetHeight: 300, naturalWidth: 400, naturalHeight: 150, objectFit: 'contain' }),
  { left: 0, top: 75, width: 400, height: 150 }, 'contain letterbox ortalı');
assertRect(
  mangaImageContentRect({ offsetWidth: 400, offsetHeight: 300, naturalWidth: 400, naturalHeight: 150, objectFit: 'cover' }),
  { left: -200, top: 0, width: 800, height: 300 }, 'cover taşar');
assertRect(
  mangaImageContentRect({ offsetWidth: 400, offsetHeight: 300, naturalWidth: 100, naturalHeight: 50, objectFit: 'none' }),
  { left: 150, top: 125, width: 100, height: 50 }, 'none doğal boyut ortalı');
assertRect(
  mangaImageContentRect({ offsetWidth: 400, offsetHeight: 300, naturalWidth: 800, naturalHeight: 600, objectFit: 'scale-down' }),
  { left: 0, top: 0, width: 400, height: 300 }, 'scale-down büyük görselde contain');
assertRect(
  mangaImageContentRect({ offsetWidth: 400, offsetHeight: 300, naturalWidth: 100, naturalHeight: 50, objectFit: 'scale-down' }),
  { left: 150, top: 125, width: 100, height: 50 }, 'scale-down küçük görselde none');
assertRect(
  mangaImageContentRect({ offsetWidth: 400, offsetHeight: 300, naturalWidth: 400, naturalHeight: 150, objectFit: 'contain', objectPosition: 'left top' }),
  { left: 0, top: 0, width: 400, height: 150 }, 'object-position left top');
assertRect(
  mangaImageContentRect({ offsetWidth: 400, offsetHeight: 300, naturalWidth: 400, naturalHeight: 150, objectFit: 'contain', objectPosition: '50% 100%' }),
  { left: 0, top: 150, width: 400, height: 150 }, 'object-position alta');
assertRect(
  mangaImageContentRect({ offsetWidth: 400, offsetHeight: 300, naturalWidth: 400, naturalHeight: 150, objectFit: 'contain', objectPosition: '20px 30px' }),
  { left: 20, top: 30, width: 400, height: 150 }, 'object-position px');
assertRect(
  mangaImageContentRect({ offsetWidth: 400, offsetHeight: 300, naturalWidth: 400, naturalHeight: 150 }),
  { left: 0, top: 0, width: 400, height: 300 }, 'objectFit yok → fill');
assertRect(
  mangaImageContentRect({ offsetWidth: 0, offsetHeight: 0, naturalWidth: 400, naturalHeight: 150, objectFit: 'contain' }),
  { left: 0, top: 0, width: 0, height: 0 }, 'display:none → sıfır içerik');
checks += 11;

// --- mangaAxisTransform ---
{
  const cases = [
    ['none', { kind: 'identity' }],
    ['', { kind: 'identity' }],
    ['matrix(1, 0, 0, 1, 0, 0)', { kind: 'axes', swap: false, sx: 1, sy: 1 }],
    ['matrix(2, 0, 0, 2, 10, 20)', { kind: 'axes', swap: false, sx: 1, sy: 1 }],
    ['matrix(-1, 0, 0, 1, 0, 0)', { kind: 'axes', swap: false, sx: -1, sy: 1 }],
    ['matrix(1, 0, 0, -1, 0, 0)', { kind: 'axes', swap: false, sx: 1, sy: -1 }],
    ['matrix(-1, 0, 0, -1, 0, 0)', { kind: 'axes', swap: false, sx: -1, sy: -1 }],
    ['matrix(0, 1, -1, 0, 0, 0)', { kind: 'axes', swap: true, sx: -1, sy: 1 }],
    ['matrix(0, -1, 1, 0, 0, 0)', { kind: 'axes', swap: true, sx: 1, sy: -1 }],
    ['matrix(0.7071, 0.7071, -0.7071, 0.7071, 0, 0)', { kind: 'arbitrary' }],
    ['matrix(1, 0, 0.5, 1, 0, 0)', { kind: 'arbitrary' }],
    ['matrix3d(1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1)', { kind: 'axes', swap: false, sx: 1, sy: 1 }],
    ['matrix3d(0,1,0,0,-1,0,0,0,0,0,1,0,0,0,0,1)', { kind: 'axes', swap: true, sx: -1, sy: 1 }],
    ['matrix(1,0,0)', { kind: 'arbitrary' }],
    ['matrix(1, 0, NaN, 1, 0, 0)', { kind: 'arbitrary' }],
    ['garbage', { kind: 'arbitrary' }],
    ['rotate(90deg)', { kind: 'arbitrary' }], // computed style her zaman matrix; ham rotate string gelirse güvenli taraf
  ];
  for (const [input, expected] of cases) {
    const t = mangaAxisTransform(input);
    for (const [key, value] of Object.entries(expected)) {
      assert.strictEqual(t[key], value, `axisTransform ${input} → ${key}`);
    }
    checks += 1;
  }
}

// --- mangaMapAxisPoint ---
{
  const ident = mangaAxisTransform('none');
  assert.ok(near(mangaMapAxisPoint(0.2, 0.8, ident)[0], 0.2) && near(mangaMapAxisPoint(0.2, 0.8, ident)[1], 0.8), 'kimlik');
  const flipX = mangaAxisTransform('matrix(-1,0,0,1,0,0)');
  assert.ok(near(mangaMapAxisPoint(0.2, 0.8, flipX)[0], 0.8) && near(mangaMapAxisPoint(0.2, 0.8, flipX)[1], 0.8), 'flipX');
  const rot90 = mangaAxisTransform('matrix(0,1,-1,0,0,0)'); // saat yönü 90°
  assert.ok(near(mangaMapAxisPoint(0, 0, rot90)[0], 1) && near(mangaMapAxisPoint(0, 0, rot90)[1], 0), 'rot90: sol-üst → sağ-üst');
  assert.ok(near(mangaMapAxisPoint(1, 0, rot90)[0], 1) && near(mangaMapAxisPoint(1, 0, rot90)[1], 1), 'rot90: sağ-üst → sağ-alt');
  const rot270 = mangaAxisTransform('matrix(0,-1,1,0,0,0)');
  assert.ok(near(mangaMapAxisPoint(0, 0, rot270)[0], 0) && near(mangaMapAxisPoint(0, 0, rot270)[1], 1), 'rot270: sol-üst → sol-alt');
  const rot180 = mangaAxisTransform('matrix(-1,0,0,-1,0,0)');
  assert.ok(near(mangaMapAxisPoint(0.2, 0.8, rot180)[0], 0.8) && near(mangaMapAxisPoint(0.2, 0.8, rot180)[1], 0.2), 'rot180');
  checks += 6;
}

// --- mangaOverlayFrame ---
{
  const base = { rect: { left: 10, top: 20, width: 400, height: 300 }, offsetWidth: 400, offsetHeight: 300 };
  assertRect(
    mangaOverlayFrame({ ...base, naturalWidth: 400, naturalHeight: 150, objectFit: 'fill' }),
    { left: 10, top: 20, width: 400, height: 300 }, 'fill: frame = element rect');
  assertRect(
    mangaOverlayFrame({ ...base, naturalWidth: 400, naturalHeight: 150, objectFit: 'contain' }),
    { left: 10, top: 95, width: 400, height: 150 }, 'contain: içerik kutusu letterbox içinde');
  const cover = mangaOverlayFrame({ ...base, naturalWidth: 400, naturalHeight: 150, objectFit: 'cover' });
  assertRect(cover, { left: -190, top: 20, width: 800, height: 300 }, 'cover: içerik kutusu elementi taşar');
  const rot90 = mangaOverlayFrame({ ...base, offsetWidth: 200, offsetHeight: 400, rect: { left: 110, top: -80, width: 400, height: 200 }, naturalWidth: 200, naturalHeight: 400, transform: 'matrix(0,1,-1,0,0,0)' });
  assert.strictEqual(rot90.supported, true, 'rot90 desteklenir');
  assertRect(rot90, { left: 110, top: -80, width: 400, height: 200 }, 'rot90: içerik bounding recti doldurur');
  const skewed = mangaOverlayFrame({ ...base, naturalWidth: 400, naturalHeight: 150, transform: 'matrix(0.7,0.7,-0.7,0.7,0,0)' });
  assert.strictEqual(skewed.supported, false, 'rot45 desteklenmez');
  const hidden = mangaOverlayFrame({ rect: { left: 0, top: 0, width: 0, height: 0 }, offsetWidth: 0, offsetHeight: 0, naturalWidth: 400, naturalHeight: 150 });
  assert.strictEqual(hidden.supported, false, 'gizli/sıfır element desteklenmez');
  checks += 8;
}

// --- mangaRegionFractionBox ---
{
  const base = { rect: { left: 0, top: 0, width: 400, height: 300 }, offsetWidth: 400, offsetHeight: 300 };
  const fill = mangaOverlayFrame({ ...base, naturalWidth: 400, naturalHeight: 150, objectFit: 'fill' });
  let fb = mangaRegionFractionBox([0, 0, 500, 500], fill);
  assert.ok(fb.supported && near(fb.x1, 0) && near(fb.y1, 0) && near(fb.x2, 0.5) && near(fb.y2, 0.5), 'fill: yarım kutu');

  const contain = mangaOverlayFrame({ ...base, naturalWidth: 400, naturalHeight: 150, objectFit: 'contain' });
  fb = mangaRegionFractionBox([0, 0, 500, 500], contain);
  assert.ok(fb.supported && near(fb.x1, 0) && near(fb.y1, 0.25) && near(fb.x2, 0.5) && near(fb.y2, 0.5), 'contain: letterbox kayması uygulanır');

  const cover = mangaOverlayFrame({ ...base, naturalWidth: 400, naturalHeight: 150, objectFit: 'cover' });
  fb = mangaRegionFractionBox([0, 0, 1000, 1000], cover);
  assert.ok(fb.supported && near(fb.y1, 0) && near(fb.y2, 1) && near(fb.x1, -0.5) && near(fb.x2, 1.5), 'cover tam kutu: kesirler elementi taşar');
  fb = mangaRegionFractionBox([0, 250, 1000, 750], cover); // dosya orta yarısı ≈ görünür bant
  assert.ok(near(fb.x1, 0) && near(fb.x2, 1), 'cover: orta yarı tam görünür');

  const flipX = mangaOverlayFrame({ ...base, naturalWidth: 400, naturalHeight: 300, objectFit: 'fill', transform: 'matrix(-1,0,0,1,0,0)' });
  fb = mangaRegionFractionBox([0, 0, 500, 500], flipX);
  assert.ok(near(fb.x1, 0.5) && near(fb.x2, 1) && near(fb.y1, 0) && near(fb.y2, 0.5), 'flipX: sol yarı sağa yansır');

  const rot90 = mangaOverlayFrame({ rect: { left: 0, top: 0, width: 200, height: 400 }, offsetWidth: 400, offsetHeight: 200, naturalWidth: 400, naturalHeight: 200, objectFit: 'fill', transform: 'matrix(0,1,-1,0,0,0)' });
  fb = mangaRegionFractionBox([0, 0, 500, 500], rot90);
  assert.ok(near(fb.x1, 0.5) && near(fb.y1, 0) && near(fb.x2, 1) && near(fb.y2, 0.5), 'rot90: sol-üst çeyrek sağ-üstte');

  const unsupported = mangaOverlayFrame({ ...base, naturalWidth: 400, naturalHeight: 150, transform: 'matrix(0.7,0.7,-0.7,0.7,0,0)' });
  fb = mangaRegionFractionBox([0, 0, 500, 500], unsupported);
  assert.strictEqual(fb.supported, false, 'arbitrary dönüşümde bölge desteklenmez');
  assert.strictEqual(mangaRegionFractionBox('bozuk', fill).supported, false, 'dizi olmayan kutu reddedilir');
  assert.strictEqual(mangaRegionFractionBox([0, 0, NaN, 100], fill).supported, false, 'NaN kutu reddedilir');
  checks += 9;
}

// --- Eksen dönüşümleri için gidiş-dönüş oracle ---
{
  const inverse = (fx, fy, t) => {
    if (!t.swap) return [t.sx > 0 ? fx : 1 - fx, t.sy > 0 ? fy : 1 - fy];
    return [t.sy > 0 ? fy : 1 - fy, t.sx > 0 ? fx : 1 - fx];
  };
  const transforms = [
    'matrix(1,0,0,1,0,0)', 'matrix(-1,0,0,1,0,0)', 'matrix(1,0,0,-1,0,0)',
    'matrix(-1,0,0,-1,0,0)', 'matrix(0,1,-1,0,0,0)', 'matrix(0,-1,1,0,0,0)',
    'matrix(2,0,0,0.5,0,0)', 'matrix(-2,0,0,-0.5,0,0)',
  ];
  let roundTrips = 0;
  for (const matrix of transforms) {
    const t = mangaAxisTransform(matrix);
    const frame = mangaOverlayFrame({
      rect: { left: 5, top: 7, width: 320, height: 240 }, offsetWidth: 320, offsetHeight: 240,
      naturalWidth: 640, naturalHeight: 480, objectFit: 'fill', transform: matrix,
    });
    assert.ok(frame.supported, `roundtrip frame destekli ${matrix}`);
    for (const box of [[0, 0, 1000, 1000], [100, 200, 600, 800], [0, 0, 500, 500], [400, 300, 700, 900]]) {
      const fb = mangaRegionFractionBox(box, frame);
      assert.ok(fb.supported, `roundtrip bölge ${matrix}`);
      // Kesir kutunun dört köşesini tersine eşle ve local kesire dön.
      const corners = [[fb.x1, fb.y1], [fb.x2, fb.y2]];
      const back = corners.map(([u, v]) => inverse(u, v, t));
      const bx1 = Math.min(back[0][0], back[1][0]) * 320;
      const by1 = Math.min(back[0][1], back[1][1]) * 240;
      const bx2 = Math.max(back[0][0], back[1][0]) * 320;
      const by2 = Math.max(back[0][1], back[1][1]) * 240;
      const expectedX1 = (box[1] / 1000) * 320;
      const expectedY1 = (box[0] / 1000) * 240;
      const expectedX2 = (box[3] / 1000) * 320;
      const expectedY2 = (box[2] / 1000) * 240;
      assert.ok(near(bx1, expectedX1) && near(bx2, expectedX2) && near(by1, expectedY1) && near(by2, expectedY2),
        `roundtrip ${matrix} kutu ${box}: ${bx1},${by1}-${bx2},${by2} != ${expectedX1},${expectedY1}-${expectedX2},${expectedY2}`);
      roundTrips += 1;
    }
  }
  checks += roundTrips;
  ok(roundTrips === 32, '32 roundtrip senaryosu');
}

// --- Enjeksiyon bütünlüğü: tek kaynak sayfaya gömülü ---
{
  const script = mangaOverlayScript({
    id: 'img-1',
    regions: [{ textBox: [10, 10, 100, 100], bubbleBox: [20, 20, 110, 110], translation: 'x', shape: 'rect' }],
  });
  for (const name of ['mangaParsePosition', 'mangaImageContentRect', 'mangaAxisTransform', 'mangaMapAxisPoint', 'mangaOverlayFrame', 'mangaRegionFractionBox']) {
    ok(script.includes(`function ${name}`), `enjekte script ${name} içerir`);
  }
  ok(script.includes('getComputedStyle(target)'), 'layout computed style okur');
  ok(script.includes('mangaRegionFractionBox(JSON.parse'), 'layout bölge kutularını eşler');
  ok(script.includes('overlay.style.setProperty(\'visibility\''), 'görünürlük kapısı korunur');
  new Function(script); // gömülü geometriyle tam script derlenir
  const moduleSource = fs.readFileSync(path.join(__dirname, '..', 'src', 'browser-manga.js'), 'utf8');
  ok(moduleSource.includes("require('./manga-geometry')"), 'browser-manga geometri modülünü kullanır');
}

console.log(`manga-geometry: PASS (${checks} kontrol)`);
