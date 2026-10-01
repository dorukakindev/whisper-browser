'use strict';

const path = require('path');

// Madde 31 — taşınan medyayı yeniden bağlama için deterministik aday skorlayıcı.
// Amaç: yanlış medyaya izleme konumu/not/altyazı bağlamadan önce kullanıcıya
// güçlü ve sıralı adaylar sunmak. Hiçbir eksen tek başına karar vermez;
// boyut eşleşmesi (kayıtlı parmak izi) en güçlü sinyal, ad benzerliği ikincil.

const STRONG_SCORE = 4;        // tek aday otomatik önerilebilir
const LISTED_SCORE = 2;        // diyalogda listelenmeye değer

function normalizeName(name) {
  return String(name || '').trim().toLowerCase();
}

function stemOf(name) {
  return normalizeName(path.basename(String(name || ''))).replace(/\.[^.]+$/, '');
}

function candidateSignals(item, candidate) {
  const oldName = normalizeName(path.basename(String(item.localPath || item.sourceRef || '')));
  const candName = normalizeName(path.basename(String(candidate.path || '')));
  const oldStem = stemOf(oldName);
  const candStem = stemOf(candName);
  const signals = { basename: false, stem: false, ext: false, size: null };
  let score = 0;
  if (oldName && candName === oldName) { signals.basename = true; score += 3; }
  if (oldStem && candStem === oldStem) { signals.stem = true; score += 1; }
  const oldExt = path.extname(oldName);
  if (oldExt && path.extname(candName) === oldExt) { signals.ext = true; score += 1; }
  const oldSize = Number(item.sizeBytes);
  if (Number.isFinite(oldSize) && oldSize > 0) {
    const candSize = Number(candidate.sizeBytes);
    if (Number.isFinite(candSize)) {
      if (candSize === oldSize) { signals.size = true; score += 3; }
      else signals.size = false;
    }
  }
  return { score, signals };
}

/**
 * @param item     kütüphane kaydı ({localPath|sourceRef, sizeBytes?})
 * @param candidates [{path, sizeBytes?}]
 * @returns {{status:'unique'|'ambiguous'|'none', ranked:[{path,sizeBytes,score,signals}]}}
 */
function selectRelinkCandidates(item, candidates) {
  const ranked = (Array.isArray(candidates) ? candidates : [])
    .filter((c) => c && typeof c.path === 'string' && c.path)
    .map((c) => ({ path: c.path, sizeBytes: Number(c.sizeBytes) || 0,
                   ...candidateSignals(item, c) }))
    .filter((c) => c.score >= LISTED_SCORE)
    .sort((a, b) => b.score - a.score || a.path.localeCompare(b.path))
    .slice(0, 8);
  if (!ranked.length) return { status: 'none', ranked: [] };
  const top = ranked[0];
  const tied = ranked.filter((c) => c.score === top.score).length;
  // Tek güçlü eşleşme: boyut+benzer ad ya da aynı ad+uzantı — tek aday.
  if (tied === 1 && top.score >= STRONG_SCORE) return { status: 'unique', ranked };
  return { status: 'ambiguous', ranked };
}

module.exports = { selectRelinkCandidates, candidateSignals, STRONG_SCORE, LISTED_SCORE };
