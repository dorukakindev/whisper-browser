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

// ---- Kuyruk maddesi 24 — toplu yol yeniden bağlama planlayıcı ----
// Eski kök altındaki tüm file: kayıtlarını yeni köke eşler; her satırın
// durumunu ayrı verir (alive = eski yol hâlâ yerinde, ready = aday var,
// missing = aday da yok, pending = yeni kök henüz verilmedi). Uygulama
// kararını kullanıcı verir; planlayıcı dosya yazmaz.
function normalizeFsPath(value) {
  return String(value || '').replace(/\\/g, '/');
}

function looksLikeAbsoluteDir(value) {
  return /^[a-zA-Z]:[\\/]/.test(value) || value.startsWith('\\\\') || value.startsWith('/');
}

function planBulkRelink(items, { oldPrefix, newPrefix, exists } = {}) {
  const existsFn = typeof exists === 'function' ? exists : () => false;
  const oldNorm = normalizeFsPath(String(oldPrefix || '').trim()).replace(/\/+$/, '');
  const newNorm = normalizeFsPath(String(newPrefix || '').trim()).replace(/\/+$/, '');
  const rows = [];
  if (!oldNorm) return { rows, scanned: 0 };
  const oldLower = oldNorm.toLowerCase();
  for (const item of Array.isArray(items) ? items : []) {
    if (typeof item?.key !== 'string' || !item.key.startsWith('file:')) continue;
    const localPath = String(item.localPath || item.sourceRef || '');
    if (!localPath) continue;
    const pathNorm = normalizeFsPath(localPath);
    const lower = pathNorm.toLowerCase();
    if (!(lower.length > oldLower.length && lower.startsWith(oldLower) && lower.charAt(oldLower.length) === '/')) continue;
    const suffix = pathNorm.slice(oldNorm.length);
    const candidate = newNorm ? newNorm + suffix : '';
    let exists = false, ready = false;
    try { exists = !!existsFn(pathNorm); } catch (_) {}
    try { ready = !!candidate && !!existsFn(candidate); } catch (_) {}
    const row = {
      key: item.key, title: String(item.title || ''),
      oldPath: localPath, exists, candidate, ready,
      status: exists ? 'alive' : !candidate ? 'pending' : ready ? 'ready' : 'missing',
    };
    rows.push(row);
  }
  rows.sort((a, b) => String(a.oldPath).localeCompare(String(b.oldPath)));
  return { rows, scanned: rows.length };
}

// ---- Kuyruk maddesi 22 — mükerrer kayıt bulucu ----
// Güçlü küme: aynı dosya kök-adı + aynı pozitif boyut (aynı riplenmiş dosya,
// farklı klasör). Zayıf küme: kök-ad aynı, boyut bilinmiyor ama süre neredeyse
// eşit (farklı kodlama veya aynı filmin iki kopyası olabilir) — kullanıcı
// önizlemede karar verir; bulucu hiçbir şeyi otomatik birleştirmez.
function stemNorm(value) {
  return normalizeFsPath(value).split('/').pop()
    .replace(/\.[^.]+$/, '').toLowerCase().replace(/[^a-z0-9]+/g, '');
}

function pairEvidence(a, b) {
  const sizeA = Math.max(0, Number(a?.sizeBytes) || 0);
  const sizeB = Math.max(0, Number(b?.sizeBytes) || 0);
  if (sizeA > 0 && sizeB > 0 && sizeA === sizeB) return 'strong';
  const durA = Math.max(0, Number(a?.duration) || 0);
  const durB = Math.max(0, Number(b?.duration) || 0);
  if (durA >= 60 && durB >= 60 && Math.abs(durA - durB) <= Math.max(1, Math.max(durA, durB) * 0.02)) return 'weak';
  return '';
}

function findLibraryDuplicates(items) {
  const byStem = new Map();
  for (const item of Array.isArray(items) ? items : []) {
    if (typeof item?.key !== 'string' || !item.key.startsWith('file:')) continue;
    const stem = stemNorm(item.localPath || item.sourceRef || '');
    if (!stem) continue;
    const list = byStem.get(stem) || [];
    list.push(item);
    byStem.set(stem, list);
  }
  const groups = [];
  for (const entries of byStem.values()) {
    if (entries.length < 2) continue;
    const clusters = [];
    for (const item of entries) {
      let joined = false;
      for (const cluster of clusters) {
        const evidence = pairEvidence(cluster[0], item);
        if (evidence) { cluster.push(item); joined = true; break; }
      }
      if (!joined) clusters.push([item]);
    }
    for (const cluster of clusters) {
      if (cluster.length < 2) continue;
      const strong = cluster.every((m) => pairEvidence(cluster[0], m) === 'strong');
      groups.push({ reason: strong ? 'Aynı ad ve dosya boyutu' : 'Aynı ad ve yaklaşık süre', strong, members: cluster });
    }
  }
  groups.sort((a, b) => b.members.length - a.members.length);
  return groups;
}

// İki kütüphane kaydını hedefe birleştirir — watch-library-store'daki
// mergeDuplicateItems ile aynı sözleşme: otorite sırası (revision, lastWatched)
// en yeni değeri kazanır; listeler birleşir; oturumlar id'ye göre tekilleşir.
function mergeWatchItems(source, target) {
  if (typeof target?.key !== 'string' || !target.key) throw new Error('Birleştirme için hedef kayıt kimliği gerekli.');
  const authority = (it) => [Math.max(0, Number(it?.revision) || 0), Math.max(0, Number(it?.lastWatched) || 0)];
  const cmp = (a, b) => (authority(a)[0] - authority(b)[0]) || (authority(a)[1] - authority(b)[1]);
  const newest = [source, target].sort(cmp)[1] || target;
  const merged = { ...newest, key: target.key };
  const num = (it, field) => Math.max(0, Number(it?.[field]) || 0);
  merged.position = Math.max(num(source, 'position'), num(target, 'position'));
  merged.duration = Math.max(num(source, 'duration'), num(target, 'duration'));
  merged.lastWatched = Math.max(num(source, 'lastWatched'), num(target, 'lastWatched'));
  const firsts = [source, target].map((it) => Number(it?.firstWatched)).filter((v) => v > 0);
  if (firsts.length) merged.firstWatched = Math.min(...firsts);
  merged.automaticCompleted = !!(source?.automaticCompleted || target?.automaticCompleted);
  if (target?.completionOverride !== undefined) merged.completionOverride = target.completionOverride;
  else if (source?.completionOverride !== undefined) merged.completionOverride = source.completionOverride;
  const union = (...lists) => [...new Set(lists.flat().filter((v) => typeof v === 'string' && v))];
  merged.collections = union(source?.collections || [], target?.collections || []);
  merged.subtitlePaths = union(source?.subtitlePaths || [], target?.subtitlePaths || []);
  merged.legacyKeys = union(source?.legacyKeys || [], target?.legacyKeys || [], [source?.key]).filter((k) => k !== target.key);
  if (!merged.legacyKeys.length) delete merged.legacyKeys;
  merged.prefs = { ...(source?.prefs || {}), ...(target?.prefs || {}) };
  const anon = [], byId = new Map();
  for (const session of [...(source?.sessions || []), ...(target?.sessions || [])]) {
    if (session && session.id) byId.set(session.id, { ...(byId.get(session.id) || {}), ...session });
    else if (session) anon.push({ ...session });
  }
  merged.sessions = [...anon, ...byId.values()].slice(-40);
  merged.totalWatchSeconds = merged.sessions.reduce((n, s) => n + Math.max(0, Number(s?.watchSeconds) || 0), 0);
  const size = Math.max(num(source, 'sizeBytes'), num(target, 'sizeBytes'));
  if (size > 0) merged.sizeBytes = size; else delete merged.sizeBytes;
  return merged;
}

// ---- Kuyruk maddesi 21 — tarama kökü altında kaybolan katalog kaynakları ----
// folder-preview'ın "yeni/değişen" listesinin tamamlayıcısı: katalogda kayıtlı
// ama taranan kök altında artık bulunamayan yerel kaynaklar ayrı gösterilir.
function collectMissingSources(items, root, exists) {
  const existsFn = typeof exists === 'function' ? exists : () => false;
  const out = [];
  const rootNorm = normalizeFsPath(String(root || '')).replace(/\/+$/, '').toLowerCase();
  if (!rootNorm) return out;
  for (const item of Array.isArray(items) ? items : []) {
    const sources = [];
    if (item?.source?.type === 'local') sources.push([String(item.title || ''), item.source.value]);
    for (const ep of item?.episodes || []) {
      if (ep?.source?.type === 'local') {
        const tag = ep.season !== undefined || ep.number !== undefined ? ` S${ep.season ?? '?'} B${ep.number ?? '?'}` : '';
        sources.push([`${String(item?.title || '')}${tag}`.trim(), ep.source.value]);
      }
    }
    for (const [label, value] of sources) {
      if (typeof value !== 'string' || !value) continue;
      const valueNorm = normalizeFsPath(value).toLowerCase();
      if (!valueNorm.startsWith(rootNorm + '/')) continue;
      let missing = false;
      try { missing = !existsFn(value); } catch (_) { missing = true; }
      if (missing) out.push({ title: label, path: value });
      if (out.length >= 200) return out;
    }
  }
  return out;
}

module.exports = { selectRelinkCandidates, candidateSignals, STRONG_SCORE, LISTED_SCORE,
  planBulkRelink, findLibraryDuplicates, mergeWatchItems, collectMissingSources, looksLikeAbsoluteDir };
