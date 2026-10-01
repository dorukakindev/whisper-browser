'use strict';

// Madde 39 — görüntü dönüşümü geometrisi. Bu fonksiyonlar hem Node testlerinde
// hem de mangaOverlayScript'e Function.prototype.toString ile gömülerek sayfa
// içinde çalışır — bu yüzden closure/require/DOM bağımlılıkları YOK, her
// fonksiyon kendi parametreleriyle yetinecek şekilde yazıldı.
//
// Koordinat uzayları:
//   - normalized: API'nin döndürdüğü 0-1000 dosya-uzayı kutuları
//   - local: element kutu içi piksel (offsetWidth/offsetHeight)
//   - screen: getBoundingClientRect sonrası viewport (bounding rect)
//
// Region % konumu = (contentOffset + normalized*contentSize) / elementSize
// → object-fit contain/cover/none'da letterbox kayması düzelir; overlay
// overflow:hidden kırpmasıyla kapsanan bölge dışarıda kalır.
// Axis-aligned transform (flip/rot90) eksen değişimiyle eşlenir; rastgele
// açılı döndürme (skew, 45°) axis-aligned kutuya indirgenemez → supported:false
// ile katman gizlenir, yanlış bölge gösterimi/OCR kesimi engellenir.

/** object-position değerini (%, px, anahtar sözcük) piksele çevirir. */
function mangaParsePosition(value, containerSize, contentSize) {
  const free = containerSize - contentSize;
  const token = String(value || '50%').trim().toLowerCase().split(/\s+/)[0] || '50%';
  if (token === 'left' || token === 'top') return 0;
  if (token === 'right' || token === 'bottom') return free;
  if (token === 'center') return free / 2;
  if (token.endsWith('px')) return Number(token.slice(0, -2)) || 0;
  if (token.endsWith('%')) return free * (Number(token.slice(0, -1)) || 0) / 100;
  const numeric = Number(token);
  return Number.isFinite(numeric) ? numeric : free / 2;
}

/**
 * Element kutusu içinde gerçek görüntü içeriğinin local piksel kutusu.
 * object-fit fill (varsayılan): içerik elementi tamamen doldurur → element kutusu.
 * contain/scale-down: oranlı küçültme + letterbox; cover: oranlı büyütme + taşma;
 * none: doğal boyut; bilinmeyen değerler fill varsayılır.
 */
function mangaImageContentRect(options) {
  const ew = Math.max(0, Number(options.offsetWidth) || 0);
  const eh = Math.max(0, Number(options.offsetHeight) || 0);
  const nw = Math.max(0, Number(options.naturalWidth) || 0);
  const nh = Math.max(0, Number(options.naturalHeight) || 0);
  const fit = String(options.objectFit || 'fill').toLowerCase();
  if (!ew || !eh) return { left: 0, top: 0, width: 0, height: 0 };
  let cw = ew;
  let ch = eh;
  if (nw && nh) {
    if (fit === 'contain') {
      const s = Math.min(ew / nw, eh / nh);
      cw = nw * s; ch = nh * s;
    } else if (fit === 'cover') {
      const s = Math.max(ew / nw, eh / nh);
      cw = nw * s; ch = nh * s;
    } else if (fit === 'scale-down') {
      const s = Math.min(1, Math.min(ew / nw, eh / nh));
      cw = nw * s; ch = nh * s;
    } else if (fit === 'none') {
      cw = nw; ch = nh;
    }
  }
  const pos = String(options.objectPosition || '50% 50%').trim().split(/\s+/);
  const left = mangaParsePosition(pos[0], ew, cw);
  const top = mangaParsePosition(pos[1] || pos[0], eh, ch);
  return { left, top, width: cw, height: ch };
}

/**
 * computed transform → eksen eşlemesi.
 * matrix(a,b,c,d,e,f): screen_x = a·x + c·y + e, screen_y = b·x + d·y + f.
 * Eksenler karışmıyorsa (b≈0, c≈0) swap:false ve sx/sx işaretleri; eksenler
 * yer değiştiriyorsa (a≈0, d≈0) swap:true — screen_x ← y·sign(c),
 * screen_y ← x·sign(b). Diğer her şey (rot45, skew, perspektif) arbitrary.
 */
function mangaAxisTransform(transform) {
  const raw = String(transform || '').trim();
  if (!raw || raw === 'none') return { kind: 'identity', swap: false, sx: 1, sy: 1 };
  let a, b, c, d;
  let m = /^matrix\(([^)]*)\)$/.exec(raw);
  if (m) {
    const v = m[1].split(',').map(Number);
    if (v.length !== 6 || v.some((n) => !Number.isFinite(n))) return { kind: 'arbitrary', swap: false, sx: 0, sy: 0 };
    [a, b, c, d] = v;
  } else {
    m = /^matrix3d\(([^)]*)\)$/.exec(raw);
    if (!m) return { kind: 'arbitrary', swap: false, sx: 0, sy: 0 };
    const v = m[1].split(',').map(Number);
    if (v.length !== 16 || v.some((n) => !Number.isFinite(n))) return { kind: 'arbitrary', swap: false, sx: 0, sy: 0 };
    // matrix3d sütun-öncelikli: screen_x = v0·x + v4·y + v12, screen_y = v1·x + v5·y + v13
    a = v[0]; b = v[1]; c = v[4]; d = v[5];
  }
  const eps = 1e-6;
  const zero = (n) => Math.abs(n) < eps;
  if (zero(b) && zero(c) && !zero(a) && !zero(d)) {
    return { kind: 'axes', swap: false, sx: Math.sign(a), sy: Math.sign(d) };
  }
  if (zero(a) && zero(d) && !zero(b) && !zero(c)) {
    return { kind: 'axes', swap: true, sx: Math.sign(c), sy: Math.sign(b) };
  }
  return { kind: 'arbitrary', swap: false, sx: 0, sy: 0 };
}

/** Element-local kesir (0-1) → bounding rect içi ekran kesiri. */
function mangaMapAxisPoint(fx, fy, t) {
  if (!t.swap) return [t.sx > 0 ? fx : 1 - fx, t.sy > 0 ? fy : 1 - fy];
  return [t.sx > 0 ? fy : 1 - fy, t.sy > 0 ? fx : 1 - fx];
}

/**
 * Element bounding rect (screen) üzerinde gerçek görüntü içeriğinin piksel kutusu.
 * İade: { supported, left, top, width, height } — supported:false ise katman
 * gizlenmelidir (dönüşümü axis-aligned kutuya indirgenemez).
 */
function mangaOverlayFrame(options) {
  const rect = options.rect;
  const ew = Math.max(0, Number(options.offsetWidth) || rect.width);
  const eh = Math.max(0, Number(options.offsetHeight) || rect.height);
  const t = mangaAxisTransform(options.transform);
  const content = mangaImageContentRect({
    offsetWidth: ew, offsetHeight: eh,
    naturalWidth: options.naturalWidth, naturalHeight: options.naturalHeight,
    objectFit: options.objectFit, objectPosition: options.objectPosition,
  });
  if (t.kind === 'arbitrary' || !ew || !eh || !content.width || !content.height) {
    return { supported: false, left: rect.left, top: rect.top, width: 0, height: 0, content, transform: t };
  }
  const corners = [
    mangaMapAxisPoint(content.left / ew, content.top / eh, t),
    mangaMapAxisPoint((content.left + content.width) / ew, (content.top + content.height) / eh, t),
  ];
  const fx1 = Math.min(corners[0][0], corners[1][0]);
  const fy1 = Math.min(corners[0][1], corners[1][1]);
  const fx2 = Math.max(corners[0][0], corners[1][0]);
  const fy2 = Math.max(corners[0][1], corners[1][1]);
  return {
    supported: true,
    left: rect.left + fx1 * rect.width,
    top: rect.top + fy1 * rect.height,
    width: (fx2 - fx1) * rect.width,
    height: (fy2 - fy1) * rect.height,
    content, transform: t, ew, eh,
  };
}

/**
 * Normalize edilmiş dosya-uzayı kutu ([y1,x1,y2,x2], 0-1000) → bounding rect
 * içi ekran kesri {x1,y1,x2,y2} (0-1, clip aralığının dışına taşabilir —
 * overlay overflow:hidden kırpar). unsupported durumda {supported:false}.
 */
function mangaRegionFractionBox(box, frame) {
  const empty = { supported: false, x1: 0, y1: 0, x2: 0, y2: 0 };
  if (!frame.supported || !frame.content.width || !frame.content.height) return empty;
  if (!Array.isArray(box) || box.length !== 4 || box.some((v) => !Number.isFinite(Number(v)))) return empty;
  const [ny1, nx1, ny2, nx2] = box.map(Number);
  const ew = frame.ew, eh = frame.eh;
  const lx1 = frame.content.left + (nx1 / 1000) * frame.content.width;
  const lx2 = frame.content.left + (nx2 / 1000) * frame.content.width;
  const ly1 = frame.content.top + (ny1 / 1000) * frame.content.height;
  const ly2 = frame.content.top + (ny2 / 1000) * frame.content.height;
  const p1 = mangaMapAxisPoint(lx1 / ew, ly1 / eh, frame.transform);
  const p2 = mangaMapAxisPoint(lx2 / ew, ly2 / eh, frame.transform);
  return {
    supported: true,
    x1: Math.min(p1[0], p2[0]), y1: Math.min(p1[1], p2[1]),
    x2: Math.max(p1[0], p2[0]), y2: Math.max(p1[1], p2[1]),
  };
}

module.exports = {
  mangaAxisTransform,
  mangaImageContentRect,
  mangaMapAxisPoint,
  mangaOverlayFrame,
  mangaParsePosition,
  mangaRegionFractionBox,
};
