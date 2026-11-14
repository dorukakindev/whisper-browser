'use strict';
// Visual audit that runs inside the renderer. Use it as a step: { code: 'return ' + require('./audit-snippet'), label: 'audit' }.
// It finds the mechanical defects a screenshot review can miss; it does NOT replace looking at the screenshot.
module.exports = `(() => {
  const vw = innerWidth, out = { horizontalScroll: document.documentElement.scrollWidth > vw + 1, beyondViewport: [], clippedText: [], overlappingControls: [], smallTargets: [], brokenImages: [], emptyButtons: [], lowContrast: [] };
  const visible = (e) => { const r = e.getBoundingClientRect(), s = getComputedStyle(e); return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none' && s.opacity !== '0'; };
  const name = (e) => (e.id ? '#' + e.id : '') + '.' + String(e.className && e.className.baseVal !== undefined ? e.className.baseVal : e.className).split(' ').filter(Boolean).slice(0, 2).join('.') + ':' + (e.textContent || '').trim().slice(0, 24);
  const scroller = (e) => { for (let p = e.parentElement; p; p = p.parentElement) { const s = getComputedStyle(p); if (/(auto|scroll)/.test(s.overflowX) && p.scrollWidth > p.clientWidth) return true; } return false; };
  // Content of a closed <details> keeps a layout box (content-visibility) but is not on screen; ignore it, except the <summary>.
  const hiddenInDetails = (e) => { for (let d = e.closest('details'); d; d = d.parentElement && d.parentElement.closest('details')) { if (d.open) continue; const sm = e.closest('summary'); if (!(sm && sm.parentElement === d)) return true; } return false; };
  // Contrast of text on a SOLID background (gradients/images are skipped: no false alarms). WCAG AA: 4.5, large text 3.
  const parse = (c) => { let m = c.match(/color\\(srgb ([\\d.]+) ([\\d.]+) ([\\d.]+)(?: \\/ ([\\d.]+))?\\)/); if (m) return { r: m[1] * 255, g: m[2] * 255, b: m[3] * 255, a: m[4] === undefined ? 1 : +m[4] }; m = c.match(/rgba?\\(([^)]+)\\)/); if (!m) return null; const p = m[1].split(/[ ,\\/]+/).filter(Boolean).map(Number); return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 }; };
  const lum = ({ r, g, b }) => { const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };
  const solidBg = (e) => { for (let p = e; p; p = p.parentElement) { const st = getComputedStyle(p); if (st.backgroundImage !== 'none') return null; const c = parse(st.backgroundColor); if (c && c.a >= 0.98) return c; } return parse(getComputedStyle(document.body).backgroundColor); };
  const all = [...document.querySelectorAll('body *')].filter((e) => !e.closest('svg') && visible(e) && !hiddenInDetails(e));
  for (const e of all) {
    const r = e.getBoundingClientRect(), s = getComputedStyle(e);
    const ownText = [...e.childNodes].some((n) => n.nodeType === 3 && n.nodeValue.trim());
    if (ownText && e.tagName !== 'OPTION') { const fg = parse(s.color), bg = solidBg(e); if (fg && bg && fg.a > 0.5) { const l1 = lum(fg), l2 = lum(bg), ratio = (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05), size = parseFloat(s.fontSize), large = size >= 24 || (size >= 18.66 && +s.fontWeight >= 700); if (ratio < (large ? 3 : 4.5)) out.lowContrast.push(name(e) + ' ' + ratio.toFixed(2)); } }
    if (r.right > vw + 2 && !scroller(e)) out.beyondViewport.push(name(e));
    if (!e.children.length && (e.textContent || '').trim() && /hidden|clip/.test(s.overflowX) && e.scrollWidth > e.clientWidth + 1 && s.textOverflow !== 'ellipsis' && !(s.webkitLineClamp && s.webkitLineClamp !== 'none')) out.clippedText.push(name(e));
    if (e.tagName === 'IMG' && (!e.complete || e.naturalWidth === 0) && !(e.loading === 'lazy' && (r.bottom < 0 || r.top > innerHeight))) out.brokenImages.push((e.currentSrc || e.src).slice(0, 70));
  }
  const controls = all.filter((e) => e.matches('button,a[href],input:not([type=hidden]),select,summary,[role=button],[role=tab]'));
  for (const e of controls) {
    const r = e.getBoundingClientRect();
    if (Math.min(r.width, r.height) < 28 && !scroller(e)) out.smallTargets.push(name(e) + ' ' + Math.round(r.width) + 'x' + Math.round(r.height));
    if (e.matches('button,[role=button]') && !(e.textContent || '').trim() && !e.getAttribute('aria-label') && !e.title) out.emptyButtons.push(name(e));
  }
  for (let i = 0; i < controls.length; i++) for (let j = i + 1; j < controls.length; j++) {
    const a = controls[i], b = controls[j]; if (a.contains(b) || b.contains(a)) continue;
    const ra = a.getBoundingClientRect(), rb = b.getBoundingClientRect();
    const w = Math.min(ra.right, rb.right) - Math.max(ra.left, rb.left), h = Math.min(ra.bottom, rb.bottom) - Math.max(ra.top, rb.top);
    if (w > 4 && h > 4) out.overlappingControls.push(name(a) + '  <->  ' + name(b));
  }
  for (const k of Object.keys(out)) if (Array.isArray(out[k])) out[k] = [...new Set(out[k])].slice(0, 12);
  return out;
})()`;
