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

// ${...} gövdesinin kaçış gerektirmeden güvenli olduğunu gösteren kalıplar.
const SAFE_CALLEES = /^\s*(escapeHtml|escapeAttr|Number|Boolean|encodeURIComponent|Intl\.|escapeRe|lt|uiText|interfaceChoice|getUiText|window\.UiLocale\?\.t|globalThis\.UiLocale\?\.|UiLocale\.t|fmt[A-Z]\w*|formatDuration|formatBytes|formatTime|formatClock|formatNumber|pct|clamp|Math\.(?:round|floor|ceil|min|max|abs)|JSON\.stringify|statusDot|trackLabel|badgeHtml|iconFor|iconBtn|svgIcon)\b/;
const SAFE_LITERAL = /^\s*(?:true|false|null|undefined|''|""|``|`[^$`]*`|'[^']*'|"[^"]*"|\d[\d.eE]*)/;
const SAFE_MEMBER = /^\s*(?:[\w?]+(?:\.[\w?]+)*\.length|player\.browserPageTranslateBusy)/;
// Aritmetik/dizeyle sonuçlanan güvenli üyeler: yalnız sayı dönen erişimler.
const SAFE_NUMERIC = /^\s*(?:\w+(?:\.|\?\.)?(?:total|translated|excluded|count|length|columns|rows|frameHeight|frameWidth|naturalWidth|naturalHeight|columns|pct|index|level|speed|volume)\b|[\w.$?\[\]]+\.toFixed\s*\(|[\w.$?\[\]]+\.toLocaleString\s*\()/;

// Tekil, doğrulanmış lokal-değişken izinleri — dosya:satır + tam ifade.
// Yalnız ifadenin ürettiği değerin kanıtlı güvenli olduğu durumlar.
const ALLOWED = new Set([
  'src/renderer/renderer.js:598::icon',                    // static SVG literal ternary
  'src/renderer/renderer.js:1227::ts',                     // String(...).padStart saat/dakika/saniye — yalnız basamak+iki nokta
  'src/renderer/renderer.js:1455::start',                  // formatTime() çıktısı
  'src/renderer/renderer.js:1455::end',                    // formatTime() çıktısı
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
    else if (c === '?' && depth === 0) { if (qmark === -1) { qmark = i; nested = 0; } else nested++; }
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

function checkExpr(rel, siteLine, expr, out) {
  const e = expr.trim();
  if (!e) return;
  if (ALLOWED.has(`${rel}:${siteLine}::${e}`)) return;
  if (SAFE_CALLEES.test(e) || SAFE_LITERAL.test(e) || SAFE_MEMBER.test(e) || SAFE_NUMERIC.test(e)) return;
  const t = topLevelSplit(e);
  if (t) {
    // Koşulun kendisi hiçbir zaman DOM'a basılmaz; iki dalı yinelemeli tara.
    scanSnippet(rel, siteLine, t.a, out);
    scanSnippet(rel, siteLine, t.b, out);
    return;
  }
  // Parantezli ifade — içini tara.
  if (/^\(.*\)$/s.test(e)) { scanSnippet(rel, siteLine, e.slice(1, -1), out); return; }
  out.push(`${rel}:${siteLine} → \${${e.slice(0, 120)}}`);
}

function scanSnippet(rel, siteLine, snippet, out) {
  for (const expr of interpolations(snippet)) checkExpr(rel, siteLine, expr, out);
}

function innerHtmlSites(fileSrc) {
  const sites = [];
  const re = /innerHTML\s*=\s*/g;
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
      else if (c === ')' || c === ']' || c === '}') depth--;
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
    const found = sites.some((s) => s.line === Number(line)
      && [...interpolations(s.rhs)].some((e) => e.trim() === expr));
    if (!found) stale.push(key);
  }
  assert(stale.length === 0, `bayat izin girdisi — satır/ifade taşındı:\n  ${stale.join('\n  ')}`);
});
