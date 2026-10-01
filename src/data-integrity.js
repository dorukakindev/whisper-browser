'use strict';
// Madde 35 — veri bütünlüğü denetimi: kırık ilişkiler, mükerrer kimlikler ve
// bozuk kayıtları tarayan yerel araç. Denetim yalnız okur; onarım ayrı bir
// adımdır ve kullanıcının onayladığı her değişiklik `.integrity.bak` yedeğiyle
// uygulanır. Hiçbir bulgu kullanıcı verisini sessizce silmez: mükerrerde en
// yeni kayıt kalır, bozuk dosya ancak sağlam `.bak` varsa geri yüklenir,
// yolu bulunamayan altyazı bağlantıları yalnız o girdiden temizlenir.
const fs = require('fs');
const path = require('path');
const { canonicalWatchKey } = require('./watch-library-store');

const AUDITED_FILES = [
  'watch-library.json', 'watch-library-tombstones.json',
  'browser-session.json', 'media-catalog.json',
  'browser-notes.json', 'history.json',
];

function readJson(filePath, io) {
  try { return { ok: true, value: JSON.parse(io.readFileSync(filePath, 'utf8')) }; }
  catch (error) { return { ok: false, error }; }
}

function stampOf(record) {
  return Number(record?.updatedAt ?? record?.lastWatched ?? record?.userEditedAt
    ?? record?.savedAt ?? record?.removedAt ?? record?.createdAt) || 0;
}

function atomicWrite(filePath, payload, io) {
  const temp = `${filePath}.${process.pid}-${Date.now()}.tmp`;
  try {
    io.writeFileSync(temp, payload, 'utf8');
    try {
      const fd = io.openSync(temp, 'r');
      try { io.fsyncSync(fd); } finally { io.closeSync(fd); }
    } catch (_) {}
    io.renameSync(temp, filePath);
  } finally {
    try { if (io.existsSync(temp)) io.unlinkSync(temp); } catch (_) {}
  }
}

function mirrorBackup(filePath, io) {
  if (!io.existsSync(filePath)) return null;
  const backup = `${filePath}.integrity.bak`;
  io.copyFileSync(filePath, backup);
  return backup;
}

// ---------- denetim ----------

function auditFileHealth(root, io) {
  const issues = [];
  for (const name of AUDITED_FILES) {
    const filePath = path.join(root, name);
    if (!io.existsSync(filePath)) continue;
    const primary = readJson(filePath, io);
    if (primary.ok) continue;
    const backup = io.existsSync(`${filePath}.bak`) ? readJson(`${filePath}.bak`, io) : { ok: false };
    issues.push({
      id: `corrupt-file:${name}`,
      kind: 'corrupt-file',
      severity: 'error',
      store: name,
      detail: `${name} okunamıyor (JSON bozuk).${backup.ok ? ' Sağlam .bak yedeği var.' : ' .bak da okunamıyor.'}`,
      repair: backup.ok ? { type: 'restore-backup', store: name } : null,
    });
  }
  return issues;
}

function auditDuplicates(root, io) {
  const issues = [];
  // İzleme kütüphanesi — ham dizi veya zarf; kanonik anahtar başına mükerrer.
  const wlPath = path.join(root, 'watch-library.json');
  if (io.existsSync(wlPath)) {
    const parsed = readJson(wlPath, io);
    if (parsed.ok) {
      const value = parsed.value;
      const envelope = Array.isArray(value) ? null : value;
      const items = Array.isArray(value) ? value
        : [...(envelope.items || []), ...(envelope.overflowItems || [])];
      const seen = new Map();
      items.forEach((item, index) => {
        const key = canonicalWatchKey(item && item.key);
        if (!key) return;
        if (seen.has(key)) {
          issues.push({
            id: `dup-watch:${key}`,
            kind: 'duplicate',
            severity: 'warn',
            store: 'watch-library.json',
            detail: `İzleme kütüphanesinde "${item?.title || key}" kaydı mükerrer (${key}).`,
            repair: { type: 'dedupe', store: 'watch-library.json', key },
          });
        } else seen.set(key, index);
      });
      const tombstones = [...(envelope?.tombstones || []), ...(envelope?.overflowTombstones || [])];
      const tseen = new Set();
      tombstones.forEach((item) => {
        const key = canonicalWatchKey(item && item.key);
        if (!key) return;
        if (tseen.has(key)) {
          issues.push({
            id: `dup-tombstone:${key}`,
            kind: 'duplicate',
            severity: 'warn',
            store: 'watch-library.json',
            detail: `Mezar taşı kaydı mükerrer (${key}).`,
            repair: { type: 'dedupe-tombstone', store: 'watch-library.json', key },
          });
        } else tseen.add(key);
      });
    }
  }
  const catPath = path.join(root, 'media-catalog.json');
  if (io.existsSync(catPath)) {
    const parsed = readJson(catPath, io);
    if (parsed.ok && Array.isArray(parsed.value?.items)) {
      const seen = new Set();
      for (const item of parsed.value.items) {
        const id = String(item?.id || '');
        if (!id) continue;
        if (seen.has(id)) {
          issues.push({
            id: `dup-catalog:${id}`,
            kind: 'duplicate',
            severity: 'warn',
            store: 'media-catalog.json',
            detail: `Katalog kaydı mükerrer kimlik (${id}${item?.title ? ` — "${item.title}"` : ''}).`,
            repair: { type: 'dedupe', store: 'media-catalog.json', key: id },
          });
        } else seen.add(id);
      }
    }
  }
  const sesPath = path.join(root, 'browser-session.json');
  if (io.existsSync(sesPath)) {
    const parsed = readJson(sesPath, io);
    if (parsed.ok && Array.isArray(parsed.value?.tabs)) {
      const seen = new Set();
      for (const tab of parsed.value.tabs) {
        const id = String(tab?.id || '');
        if (!id) continue;
        if (seen.has(id)) {
          issues.push({
            id: `dup-tab:${id}`,
            kind: 'duplicate',
            severity: 'warn',
            store: 'browser-session.json',
            detail: `Oturum dosyasında mükerrer sekme kimliği (${id}).`,
            repair: { type: 'dedupe', store: 'browser-session.json', key: id },
          });
        } else seen.add(id);
      }
    }
  }
  return issues;
}

function auditRelations(root, io) {
  const issues = [];
  const wlPath = path.join(root, 'watch-library.json');
  const mediaKeys = new Set();
  if (io.existsSync(wlPath)) {
    const parsed = readJson(wlPath, io);
    if (parsed.ok) {
      const value = parsed.value;
      const items = Array.isArray(value) ? value
        : [...(value.items || []), ...(value.overflowItems || [])];
      for (const item of items) {
        const key = canonicalWatchKey(item && item.key);
        if (key) mediaKeys.add(key);
        // Kayıtlı altyazı yolları kırık mı?
        const missing = (Array.isArray(item?.subtitlePaths) ? item.subtitlePaths : [])
          .filter((p) => typeof p === 'string' && path.isAbsolute(p) && !io.existsSync(p));
        if (missing.length) {
          issues.push({
            id: `missing-subs:${key || item?.key}`,
            kind: 'broken-relation',
            severity: 'warn',
            store: 'watch-library.json',
            detail: `"${item?.title || item?.key}" kaydında ${missing.length} altyazı dosyası yolda yok.`,
            repair: key ? { type: 'prune-paths', store: 'watch-library.json', key, paths: missing } : null,
          });
        }
      }
    }
  }
  const catPath = path.join(root, 'media-catalog.json');
  const catalogIds = new Set();
  if (io.existsSync(catPath)) {
    const parsed = readJson(catPath, io);
    if (parsed.ok && Array.isArray(parsed.value?.items)) {
      for (const item of parsed.value.items) {
        if (item?.id) catalogIds.add(item.id);
        const sources = [item?.source, ...(item?.episodes || []).map((e) => e?.source)];
        for (const source of sources) {
          if (source?.type === 'local' && typeof source.value === 'string'
              && path.isAbsolute(source.value) && !io.existsSync(source.value)) {
            issues.push({
              id: `missing-media:${item.id || source.value}`,
              kind: 'broken-relation',
              severity: 'warn',
              store: 'media-catalog.json',
              detail: `"${item?.title || item?.id}" kaynağı yolda yok: ${source.value}`,
              repair: null, // dosya geri gelebilir; kayıt silinmez
            });
          }
        }
      }
    }
  }
  const notesPath = path.join(root, 'browser-notes.json');
  if (io.existsSync(notesPath)) {
    const parsed = readJson(notesPath, io);
    if (parsed.ok && Array.isArray(parsed.value?.annotations)) {
      const orphans = parsed.value.annotations.filter((a) =>
        a?.mediaId && !mediaKeys.has(canonicalWatchKey(a.mediaId)) && !catalogIds.has(a.mediaId));
      if (orphans.length) {
        issues.push({
          id: 'orphan-notes',
          kind: 'broken-relation',
          severity: 'info',
          store: 'browser-notes.json',
          detail: `${orphans.length} not kaydı artık kütüphane/katalog kaydı olmayan medyaya bağlı.`,
          repair: null, // notlar değerli; silme kararı kullanıcıya raporlanır
        });
      }
    }
  }
  return issues;
}

function auditUserData(root, options = {}) {
  const io = options.io || fs;
  return {
    issues: [
      ...auditFileHealth(root, io),
      ...auditDuplicates(root, io),
      ...auditRelations(root, io),
    ],
  };
}

// ---------- onarım ----------

function dedupeWatchLibrary(filePath, key, io) {
  const parsed = JSON.parse(io.readFileSync(filePath, 'utf8'));
  const isArray = Array.isArray(parsed);
  const items = isArray ? parsed
    : [...(parsed.items || []), ...(parsed.overflowItems || [])];
  const groups = new Map();
  items.forEach((item) => {
    const k = canonicalWatchKey(item && item.key);
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(item);
  });
  const merged = [...groups.values()].map((records) =>
    records.sort((a, b) => stampOf(b) - stampOf(a))[0]);
  const tombstones = [...(parsed.tombstones || []), ...(parsed.overflowTombstones || [])];
  const tmap = new Map();
  tombstones.forEach((t) => {
    const k = canonicalWatchKey(t && t.key);
    if (k && (!tmap.has(k) || stampOf(t) > stampOf(tmap.get(k)))) tmap.set(k, t);
  });
  const doc = isArray
    ? merged
    : { ...parsed, items: merged, overflowItems: [],
        tombstones: [...tmap.values()], overflowTombstones: [] };
  atomicWrite(filePath, JSON.stringify(doc, null, 2), io);
}

function dedupeGeneric(filePath, key, selector, io) {
  const parsed = JSON.parse(io.readFileSync(filePath, 'utf8'));
  const list = selector(parsed);
  const groups = new Map();
  list.forEach((item, index) => {
    const k = String(item?.[key] || '');
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push({ item, index });
  });
  const kept = [...groups.values()].map((records) =>
    records.sort((a, b) => stampOf(b.item) - stampOf(a.item) || a.index - b.index)[0].item);
  return { parsed, kept };
}

function applyRepair(root, issue, io) {
  const repair = issue && issue.repair;
  if (!repair) return { applied: false, reason: 'onarım planı yok' };
  const filePath = path.join(root, repair.store);
  if (!io.existsSync(filePath)) return { applied: false, reason: 'dosya yok' };
  mirrorBackup(filePath, io); // yedekli uygula — her onarım öncesi
  switch (repair.type) {
    case 'restore-backup': {
      const backup = readJson(`${filePath}.bak`, io);
      if (!backup.ok) return { applied: false, reason: '.bak da okunamıyor' };
      atomicWrite(filePath, JSON.stringify(backup.value, null, 2), io);
      return { applied: true };
    }
    case 'dedupe': {
      if (repair.store === 'watch-library.json') dedupeWatchLibrary(filePath, repair.key, io);
      else if (repair.store === 'media-catalog.json') {
        const { parsed, kept } = dedupeGeneric(filePath, 'id', (p) => p.items || [], io);
        atomicWrite(filePath, JSON.stringify({ ...parsed, items: kept }, null, 2), io);
      } else if (repair.store === 'browser-session.json') {
        const { parsed, kept } = dedupeGeneric(filePath, 'id', (p) => p.tabs || [], io);
        atomicWrite(filePath, JSON.stringify({ ...parsed, tabs: kept }, null, 2), io);
      }
      return { applied: true };
    }
    case 'dedupe-tombstone': {
      dedupeWatchLibrary(filePath, repair.key, io); // aynı birleştirme yolu
      return { applied: true };
    }
    case 'prune-paths': {
      const parsed = JSON.parse(io.readFileSync(filePath, 'utf8'));
      const prune = new Set(repair.paths);
      const filter = (item) => {
        if (canonicalWatchKey(item?.key) !== repair.key) return item;
        return { ...item,
          subtitlePaths: (item.subtitlePaths || []).filter((p) => !prune.has(p)) };
      };
      const doc = Array.isArray(parsed) ? parsed.map(filter)
        : { ...parsed,
            items: (parsed.items || []).map(filter),
            overflowItems: (parsed.overflowItems || []).map(filter) };
      atomicWrite(filePath, JSON.stringify(doc, null, 2), io);
      return { applied: true };
    }
    default:
      return { applied: false, reason: `bilinmeyen onarım türü: ${repair.type}` };
  }
}

function applyRepairs(root, selectedIds, options = {}) {
  const io = options.io || fs;
  const wanted = new Set(selectedIds || []);
  const report = { applied: [], skipped: [], errors: [] };
  const { issues } = auditUserData(root, { io });
  for (const issue of issues) {
    if (!wanted.has(issue.id)) continue;
    try {
      const result = applyRepair(root, issue, io);
      if (result.applied) report.applied.push(issue.id);
      else report.skipped.push({ id: issue.id, reason: result.reason });
    } catch (error) {
      report.errors.push({ id: issue.id, error: error.message });
    }
  }
  for (const id of wanted) {
    if (!issues.some((i) => i.id === id)) {
      report.skipped.push({ id, reason: 'bulgu artık geçerli değil' });
    }
  }
  return report;
}

module.exports = { auditUserData, applyRepairs, AUDITED_FILES };
