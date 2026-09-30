// R272: innerHTML/DOM-sink ratchet — her `innerHTML =` atamasındaki ${...}
// enterpolasyonlarının kaçışlı/kaçış-gerektirmeyen olduğunu statik denetler.
// Yeni sink eklendiğinde bu test düşer; ya değeri escapeHtml/Number ile sar
// ya da SAFE local-değişken izin listesine gerekçesiyle ekle.
'use strict';
const fs = require('fs');
const path = require('path');
const assert = require('assert');

let pass = 0;
function test(name, fn) {
  try { fn(); pass++; console.log(`  PASS  ${name}`); }
  catch (error) { console.error(`  FAIL  ${name} — ${error.message}`); process.exitCode = 1; }
}

const ROOT = path.join(__dirname, '..');
const FILES = [
  'src/renderer/renderer.js',
  'src/renderer/renderer-helpers.js',
  'src/renderer/browser-analysis-tools.js',
  'src/renderer/browser-dialogue.js',
  'src/browser-page-translate.js',
];

// ${...} gövdesinin veya `+` operandının uçtan uca güvenli olduğunu gösteren
// kalıplar — ifadenin TAMAMI eşleşmeli; önek eşleşmesi `escapeHtml(x) + x`
// gibi kaçışsız kuyrukları gizlerdi.
const SAFE_CALLEE_HEAD = /^(escapeHtml|escapeAttr|Number|Boolean|encodeURIComponent|Intl\.|escapeRe|lt|uiText|interfaceChoice|getUiText|window\.UiLocale\?\.t|globalThis\.UiLocale\?\.|UiLocale\.t|fmt[A-Z]\w*|formatDuration|formatBytes|formatTime|formatClock|formatNumber|pct|clamp|Math\.(?:round|floor|ceil|min|max|abs)|JSON\.stringify|statusDot|trackLabel|badgeHtml|iconFor|iconBtn|svgIcon)\s*\(/;
const SAFE_LITERAL_FULL = /^\s*(?:true|false|null|undefined|NaN|Infinity|''|""|``|'-?'|"-?"|\d[\d.eE]*|0x[\da-fA-F]+)\s*$/s;
const SAFE_MEMBER_FULL = /^\s*[\w$?]+(?:\.[\w$?]+)*\.length\s*$/;
const SAFE_MEMBER_KNOWN = /^\s*player\.browserPageTranslateBusy\s*$/;
const SAFE_NUMERIC_FULL = /^\s*(?:[\w$]+\??\.)+(total|translated|excluded|count|columns|rows|frameHeight|frameWidth|naturalWidth|naturalHeight|pct|index|level|speed|volume|offset|duration|elapsed|remaining|size|bytes|start|end|width|height|top|left|x|y)\s*$/;
const SAFE_NUMERIC_CALL = /^\s*[\w.$?\[\]()\s]+\.(toFixed|toLocaleString|toPrecision|toExponential)\s*\([^)]*\)\s*$/s;
// Bütünü boolean üreten üst-düzey operatörler — operandlar DOM'a çıkmaz.
const TOP_BOOLEAN_OP = /===|!==|==|!=|<=|>=|<|>|\binstanceof\b|\bin\b/;

// Tekil, doğrulanmış lokal-değişken izinleri — dosya:satır + tam ifade.
// Yalnız ifadenin ürettiği değerin kanıtlı güvenli olduğu durumlar.
const ALLOWED = new Set([
  'src/renderer/renderer.js:599::icon',                    // static SVG literal ternary
  'src/renderer/renderer.js:1232::ts',                     // String(...).padStart saat/dakika/saniye — yalnız basamak+iki nokta
  'src/renderer/renderer.js:1460::start',                  // formatTime() çıktısı
  'src/renderer/renderer.js:1460::end',                    // formatTime() çıktısı
  'src/renderer/renderer.js:14030::emptyKind',             // 'tracks'|'no-media'|'none' enum — attribute bağlamında güvenli
  'src/renderer/renderer.js:20728::totalBlocks',           // Number(...) || 0
  'src/renderer/renderer.js:20728::apiBlocks',             // Number(...) || 0
  'src/renderer/renderer.js:20728::memoryBlocks',          // Number(...) || 0
  'src/renderer/renderer.js:20728::excludedBlocks',        // Number(...) || 0
  'src/renderer/renderer.js:20728::pendingBlocks',         // Number(...) || 0
  'src/renderer/renderer.js:20789::completionHtml',        // aynı kapsamda kaçışlı kurulan yerel
  'src/renderer/renderer.js:20789::sectionHtml',           // aynı kapsamda kaçışlı kurulan yerel
  'src/browser-page-translate.js:1047::toolsMarkup',       // sabit literal — araç düğmeleri işaretlemesi
]);

function topLevelSplit(e) {
  // Üst düzey `?` ve `:` konumlarını bul (iç içe ? : ve şablon/parantez güvenli).
  let depth = 0; let qmark = -1; let colon = -1; let nested = 0;
  for (let i = 0; i < e.length; i++) {
    const c = e[i];
    if (c === "'" || c === '"' || c === '`') {
      const q = c; i++;
      while (i < e.length && e[i] !== q) { if (e[i] === '\\') i++; i++; }
      continue;
    }
    if (c === '(' || c === '[' || c === '{') depth++;
    else if (c === ')' || c === ']' || c === '}') depth--;
    else if (c === '?' && depth === 0 && e[i + 1] !== '.' && e[i + 1] !== '?') { if (qmark === -1) { qmark = i; nested = 0; } else nested++; }
    else if (c === '?' && (e[i + 1] === '.' || e[i + 1] === '?')) i++;
    else if (c === ':' && depth === 0 && qmark !== -1) {
      if (nested > 0) { nested--; continue; }
      if (colon === -1) colon = i;
      break;
    }
    else if (c === '&' || c === '|') { if (e[i + 1] === c) i++; }
  }
  if (qmark !== -1 && colon !== -1) return { cond: e.slice(0, qmark), a: e.slice(qmark + 1, colon), b: e.slice(colon + 1) };
  return null;
}

function* interpolations(src) {
  let i = 0;
  while ((i = src.indexOf('${', i)) !== -1) {
    let depth = 1; let j = i + 2; const start = j;
    while (j < src.length && depth) {
      const c = src[j];
      if (c === '{') depth++;
      else if (c === '}') depth--;
      else if (c === "'" || c === '"' || c === '`') {
        const q = c; j++;
        while (j < src.length && src[j] !== q) { if (src[j] === '\\') j++; j++; }
      }
      j++;
    }
    yield src.slice(start, j - 1);
    i = j;
  }
}

// Üst-düzey `||`/`&&`/`??`/`+` operatörlerinde böler; ternary'den SONRA çağrılır
// (dal gövdeleri ayrı operand olarak buraya gelir).
function* topLevelOps(e, ops) {
  let depth = 0; let start = 0;
  for (let i = 0; i < e.length; i++) {
    const c = e[i];
    if (c === "'" || c === '"' || c === '`') {
      const q = c; i++;
      while (i < e.length && e[i] !== q) { if (e[i] === '\\') i++; i++; }
      continue;
    }
    if (c === '(' || c === '[' || c === '{') depth++;
    else if (c === ')' || c === ']' || c === '}') depth--;
    else if (depth === 0) {
      if (c === '+' ) {
        // `++`/`+=` yama değil: bitişik + veya = gelirse operatör değil.
        if (e[i + 1] === '+' || e[i + 1] === '=' || e[i - 1] === '+') continue;
        if (ops.includes('+')) { yield e.slice(start, i); start = i + 1; }
      } else if ((c === '|' && e[i + 1] === '|') || (c === '&' && e[i + 1] === '&') || (c === '?' && e[i + 1] === '?')) {
        if (ops.includes('||')) { yield e.slice(start, i); start = i + 2; i++; }
        else i++;
      }
    }
  }
  yield e.slice(start);
}

function checkOperand(rel, siteLine, raw, out, depth = 0, collect = null) {
  const e = raw.trim();
  if (!e || depth > 8) { if (depth > 8) out.push(`${rel}:${siteLine} → aşırı iç içe: ${e.slice(0, 80)}`); return; }
  if (collect) collect.push(e);
  if (ALLOWED.has(`${rel}:${siteLine}::${e}`)) return;
  if (SAFE_LITERAL_FULL.test(e) || SAFE_MEMBER_FULL.test(e)
    || SAFE_MEMBER_KNOWN.test(e) || SAFE_NUMERIC_FULL.test(e) || SAFE_NUMERIC_CALL.test(e)) return;
  if (/^'(?:[^'\\]|\\.)*'$/s.test(e) || /^"(?:[^"\\]|\\.)*"$/s.test(e)) return;
  if (/^`(?:[^`\\]|\\.)*`$/s.test(e)) { scanSnippet(rel, siteLine, e, out, depth + 1, collect); return; }
  if (/^[-+!~]/.test(e)) { checkOperand(rel, siteLine, e.slice(1), out, depth + 1, collect); return; }
  if (/^(typeof|void)\s/.test(e)) return;
  const t = topLevelSplit(e);
  if (t) {
    // Koşul DOM'a basılmaz; iki dalı aynı şekilde denetle.
    checkOperand(rel, siteLine, t.a, out, depth + 1, collect);
    checkOperand(rel, siteLine, t.b, out, depth + 1, collect);
    return;
  }
  if (/^\(.*\)$/s.test(e)) { checkOperand(rel, siteLine, e.slice(1, -1), out, depth + 1, collect); return; }
  // `||`/`&&`/`??` kolları: sonuç bir koldan gelebilir — hepsi güvenli olmalı.
  const branches = [...topLevelOps(e, ['||'])];
  if (branches.length > 1) {
    for (const branch of branches) checkOperand(rel, siteLine, branch, out, depth + 1, collect);
    return;
  }
  // `+` birleştirmesi: HTML'e giren her operand ayrı denetlenir.
  const operands = [...topLevelOps(e, ['+'])];
  if (operands.length > 1) {
    for (const operand of operands) checkOperand(rel, siteLine, operand, out, depth + 1, collect);
    return;
  }
  if (TOP_BOOLEAN_OP.test(e)) {
    // `a === b`, `a in b` gibi ifadeler boolean üretir; operandlar basılmaz.
    let d = 0, q = null, boolean = false;
    for (let i = 0; i < e.length; i++) {
      const c = e[i];
      if (q) { if (c === '\\') i++; else if (c === q) q = null; continue; }
      if (c === "'" || c === '"' || c === '`') { q = c; continue; }
      if (c === '(' || c === '[' || c === '{') d++;
      else if (c === ')' || c === ']' || c === '}') d--;
      else if (d === 0 && TOP_BOOLEAN_OP.test(e.slice(i, i + 3))) { boolean = true; break; }
    }
    if (boolean) return;
  }
  const call = e.match(SAFE_CALLEE_HEAD);
  if (call) {
    // Çağrı gövdesini dengele; arta kalan yalnız zincir okuma olabilir.
    const open = e.indexOf('(', call[0].length - 1);
    let d = 1; let j = open + 1;
    while (j < e.length && d) {
      const c = e[j];
      if (c === "'" || c === '"' || c === '`') { const qq = c; j++; while (j < e.length && e[j] !== qq) { if (e[j] === '\\') j++; j++; } }
      else if (c === '(') d++;
      else if (c === ')') d--;
      j++;
    }
    let tail = e.slice(j);
    let ok = true;
    while (tail.trim().length) {
      let m = tail.match(/^(\s*(\?\.|\.)[\w$]+)/);
      if (!m) { m = tail.match(/^\s*\[[^\]]*\]/); if (!m) { ok = false; break; } tail = tail.slice(m[0].length); continue; }
      tail = tail.slice(m[0].length);
      // Üye sonrası çağrı parantezi — argümanlar iç içe parantez içerebilir.
      const rest = tail.replace(/^\s+/, '');
      if (rest.startsWith('(')) {
        let d2 = 0; let k2 = 0;
        while (k2 < rest.length) {
          const c2 = rest[k2];
          if (c2 === "'" || c2 === '"' || c2 === '`') { const qq = c2; k2++; while (k2 < rest.length && rest[k2] !== qq) { if (rest[k2] === '\\') k2++; k2++; } }
          else if (c2 === '(') d2++;
          else if (c2 === ')') { d2--; if (!d2) { k2++; break; } }
          k2++;
        }
        tail = rest.slice(k2);
      }
    }
    if (ok) return;
  }
  out.push(`${rel}:${siteLine} → ${e.slice(0, 120)}`);
}

function checkExpr(rel, siteLine, expr, out, collect = null) {
  const e = expr.trim();
  if (!e) return;
  if (collect) collect.push(e);
  checkOperand(rel, siteLine, e, out, 0, collect);
}

function scanSnippet(rel, siteLine, snippet, out, depth = 0, collect = null) {
  // Şablon enterpolasyonları + düz `+` birleştirmesi operandları ikisi de taranır;
  // `'a' + x + 'b'` gibi şablonsuz atamalar da açıkta kalmaz.
  for (const expr of interpolations(snippet)) checkExpr(rel, siteLine, expr, out, collect);
  if (!/^\s*`/.test(snippet)) {
    for (const operand of topLevelOps(snippet, ['+'])) checkOperand(rel, siteLine, operand, out, 0, collect);
  }
}

function innerHtmlSites(fileSrc) {
  const sites = [];
  const re = /innerHTML\s*\+?=\s*/g;
  let m;
  while ((m = re.exec(fileSrc))) {
    let j = m.index + m[0].length;
    const rhsStart = j;
    let depth = 0;
    while (j < fileSrc.length) {
      const c = fileSrc[j];
      if (c === "'" || c === '"' || c === '`') {
        const q = c; j++;
        while (j < fileSrc.length && fileSrc[j] !== q) {
          if (fileSrc[j] === '\\') j++;
          if (q === '`' && fileSrc[j] === '$' && fileSrc[j + 1] === '{') {
            let d = 1; j += 2;
            while (j < fileSrc.length && d) {
              const k = fileSrc[j];
              if (k === '{') d++;
              else if (k === '}') d--;
              else if (k === "'" || k === '"' || k === '`') {
                const q2 = k; j++;
                while (j < fileSrc.length && fileSrc[j] !== q2) { if (fileSrc[j] === '\\') j++; j++; }
              }
              j++;
            }
            continue;
          }
          j++;
        }
        j++; continue;
      }
      if (c === '(' || c === '[' || c === '{') depth++;
      else if (c === ')' || c === ']' || c === '}') { if (depth <= 0) break; depth--; }
      else if (c === ';' && depth <= 0) break;
      j++;
    }
    const line = fileSrc.slice(0, rhsStart).split('\n').length;
    sites.push({ line, rhs: fileSrc.slice(rhsStart, j) });
  }
  return sites;
}

const violations = [];
const coverage = {};
for (const rel of FILES) {
  const src = fs.readFileSync(path.join(ROOT, rel), 'utf8');
  const sites = innerHtmlSites(src);
  coverage[rel] = sites.length;
  for (const site of sites) scanSnippet(rel, site.line, site.rhs, violations);
}

test('innerHTML sink envanteri ≥30 ve tüm enterpolasyonlar güvenli', () => {
  const total = Object.values(coverage).reduce((a, b) => a + b, 0);
  assert(total >= 30, `beklenen ≥30 innerHTML sitesi, bulunan ${total} — tarayıcı regresyonu?`);
  assert(violations.length === 0,
    `kaçışsız enterpolasyon bulundu:\n  ${violations.join('\n  ')}`);
});

// İzin listesi bayatlamasın: her girişi bugünkü kaynakta doğrula.
test('izin listesi girdileri kaynakta hâlâ karşılık buluyor', () => {
  const stale = [];
  for (const key of ALLOWED) {
    const splitAt = key.lastIndexOf('::');
    const expr = key.slice(splitAt + 2);
    const [rel, line] = key.slice(0, splitAt).split(/:(?!.*:)/);
    const src = fs.readFileSync(path.join(ROOT, rel), 'utf8');
    const sites = innerHtmlSites(src);
    const found = sites.some((s) => {
      if (s.line !== Number(line)) return false;
      const collected = [];
      scanSnippet(rel, s.line, s.rhs, [], 0, collected);
      return collected.includes(expr);
    });
    if (!found) stale.push(key);
  }
  assert(stale.length === 0, `bayat izin girdisi — satır/ifade taşındı:\n  ${stale.join('\n  ')}`);
});
