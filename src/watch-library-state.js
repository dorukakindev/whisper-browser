'use strict';

// İzleme kütüphanesi için saf revision/merge durumu. Disk yazımı main.js'te
// kalır; bu modül yalnız bir mutation'ın hangi alanlarda linearize olacağını
// belirler ve Electron olmadan model denetimine izin verir.
const WATCH_LIBRARY_DOCUMENT_VERSION = 2;
const DEFAULT_LIMIT = 1000;
const TOMBSTONE_LIMIT = 1000;
const RESERVED_ITEM_FIELDS = new Set(['revision', '_createdRevision', '_fieldRevisions', '_watchMutation', 'session', 'sessions', 'prefs', 'subtitlePaths', 'collections']);

function clone(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function finiteNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function uniqueStrings(values) {
  return [...new Set((Array.isArray(values) ? values : [])
    .filter((value) => typeof value === 'string' && value.trim())
    .map((value) => value.trim()))];
}

function normalizeStamp(raw) {
  return {
    revision: Math.max(0, Math.floor(finiteNumber(raw && raw.revision))),
    at: Math.max(0, finiteNumber(raw && raw.at)),
    source: typeof (raw && raw.source) === 'string' ? raw.source : 'legacy',
    writerId: typeof (raw && raw.writerId) === 'string' ? raw.writerId : '',
    sequence: Math.max(0, Math.floor(finiteNumber(raw && raw.sequence))),
  };
}

function normalizeItem(raw, documentRevision = 0) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)
      || typeof raw.key !== 'string' || !raw.key.trim()) return null;
  const item = clone(raw);
  delete item._watchMutation;
  delete item.session;
  item.key = item.key.trim();
  item.revision = Math.max(0, Math.floor(finiteNumber(item.revision, documentRevision)));
  item._createdRevision = Math.min(
    item.revision,
    Math.max(0, Math.floor(finiteNumber(item._createdRevision))),
  );
  const fields = item._fieldRevisions && typeof item._fieldRevisions === 'object'
    && !Array.isArray(item._fieldRevisions) ? item._fieldRevisions : {};
  item._fieldRevisions = Object.fromEntries(Object.entries(fields)
    .map(([key, value]) => [key, normalizeStamp(value)]));
  item.collections = uniqueStrings(item.collections);
  item.subtitlePaths = uniqueStrings(item.subtitlePaths);
  item.prefs = item.prefs && typeof item.prefs === 'object' && !Array.isArray(item.prefs)
    ? item.prefs : {};
  item.sessions = Array.isArray(item.sessions) ? item.sessions.filter((session) => (
    session && typeof session === 'object' && typeof session.id === 'string' && session.id
  )).slice(-40) : [];
  item.totalWatchSeconds = item.sessions.reduce((total, session) => (
    total + Math.max(0, finiteNumber(session.watchSeconds))
  ), 0);
  return item;
}

function normalizeTombstones(raw) {
  const entries = Array.isArray(raw) ? raw : Object.values(raw && typeof raw === 'object' ? raw : {});
  const byKey = new Map();
  for (const value of entries) {
    if (!value || typeof value.key !== 'string' || !value.key.trim()) continue;
    const tombstone = {
      key: value.key.trim(),
      revision: Math.max(0, Math.floor(finiteNumber(value.revision))),
      deletedAt: Math.max(0, finiteNumber(value.deletedAt)),
    };
    const previous = byKey.get(tombstone.key);
    if (!previous || tombstone.revision >= previous.revision) byKey.set(tombstone.key, tombstone);
  }
  return [...byKey.values()].sort((a, b) => b.revision - a.revision).slice(0, TOMBSTONE_LIMIT);
}

function normalizeWatchLibraryDocument(raw) {
  const envelope = raw && typeof raw === 'object' && !Array.isArray(raw) && Array.isArray(raw.items);
  const initialRevision = envelope ? Math.max(0, Math.floor(finiteNumber(raw.revision))) : 0;
  const sourceItems = envelope ? raw.items : (Array.isArray(raw) ? raw : []);
  const itemsByKey = new Map();
  for (const rawItem of sourceItems) {
    const item = normalizeItem(rawItem, initialRevision);
    if (!item || itemsByKey.has(item.key)) continue;
    itemsByKey.set(item.key, item);
  }
  const tombstones = normalizeTombstones(envelope ? raw.tombstones : []);
  const revision = Math.max(initialRevision,
    ...[...itemsByKey.values()].map((item) => item.revision),
    ...tombstones.map((entry) => entry.revision), 0);
  return {
    formatVersion: WATCH_LIBRARY_DOCUMENT_VERSION,
    revision,
    items: [...itemsByKey.values()].sort((a, b) => finiteNumber(b.lastWatched) - finiteNumber(a.lastWatched)),
    tombstones,
  };
}

function publicWatchItem(raw) {
  const item = clone(raw);
  delete item._createdRevision;
  delete item._fieldRevisions;
  return item;
}

function watchLibrarySnapshot(rawDocument) {
  const document = normalizeWatchLibraryDocument(rawDocument);
  return {
    revision: document.revision,
    items: document.items.map(publicWatchItem),
  };
}

function mutationInfo(patch, current, document, now) {
  const raw = patch && patch._watchMutation && typeof patch._watchMutation === 'object'
    ? patch._watchMutation : {};
  return {
    kind: typeof raw.kind === 'string' ? raw.kind : 'metadata',
    baseItemRevision: Number.isFinite(Number(raw.baseItemRevision))
      ? Math.max(0, Math.floor(Number(raw.baseItemRevision)))
      : (current ? current.revision : 0),
    baseStoreRevision: Number.isFinite(Number(raw.baseStoreRevision))
      ? Math.max(0, Math.floor(Number(raw.baseStoreRevision))) : document.revision,
    allowCreate: raw.allowCreate !== undefined ? !!raw.allowCreate : !current,
    at: Math.max(0, finiteNumber(raw.at, finiteNumber(patch && patch.lastWatched, now))),
    writerId: typeof raw.writerId === 'string' ? raw.writerId.slice(0, 120) : '',
    sequence: Math.max(0, Math.floor(finiteNumber(raw.sequence))),
  };
}

function stampFor(info, revision) {
  return {
    revision,
    at: info.at,
    source: info.kind,
    writerId: info.writerId,
    sequence: info.sequence,
  };
}

function canApplyField(item, field, info) {
  const stamp = normalizeStamp(item._fieldRevisions[field]);
  if (info.kind !== 'progress' && info.kind !== 'close-progress') return true;
  if (info.baseItemRevision >= stamp.revision) return true;
  // Bir manuel tamamlanma/konum kararı, onu gözlemlememiş otomatik progress
  // snapshot'ından üstündür. Yeni snapshot revision'ı gördükten sonraki oynatma
  // ise normal şekilde alanı yeniden güncelleyebilir.
  if (stamp.source === 'manual-status') return false;
  if (info.at > stamp.at) return true;
  return info.at === stamp.at && info.writerId && info.writerId === stamp.writerId
    && info.sequence > stamp.sequence;
}

function valuesEqual(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
}

function mergeSession(previous, incoming) {
  if (!previous) return clone(incoming);
  const oldEnded = finiteNumber(previous.endedAt);
  const newEnded = finiteNumber(incoming.endedAt);
  const merged = { ...previous, ...incoming };
  merged.startedAt = Math.min(
    finiteNumber(previous.startedAt, Number.MAX_SAFE_INTEGER),
    finiteNumber(incoming.startedAt, Number.MAX_SAFE_INTEGER),
  );
  if (merged.startedAt === Number.MAX_SAFE_INTEGER) merged.startedAt = 0;
  merged.watchSeconds = Math.max(finiteNumber(previous.watchSeconds), finiteNumber(incoming.watchSeconds));
  merged.endedAt = Math.max(oldEnded, newEnded);
  if (newEnded < oldEnded) merged.endPosition = previous.endPosition;
  return merged;
}

function applyWatchUpsert(rawDocument, rawPatch, options = {}) {
  const document = normalizeWatchLibraryDocument(rawDocument);
  if (!rawPatch || typeof rawPatch !== 'object' || Array.isArray(rawPatch)
      || typeof rawPatch.key !== 'string' || !rawPatch.key.trim()) {
    return { document, result: { ok: false, error: 'Geçersiz kütüphane kaydı' }, changed: false };
  }
  const patch = clone(rawPatch);
  patch.key = patch.key.trim();
  const index = document.items.findIndex((item) => item.key === patch.key);
  const current = index >= 0 ? document.items[index] : null;
  const now = finiteNumber(options.now, Date.now());
  const info = mutationInfo(patch, current, document, now);
  const tombstoneIndex = document.tombstones.findIndex((entry) => entry.key === patch.key);
  const tombstone = tombstoneIndex >= 0 ? document.tombstones[tombstoneIndex] : null;

  // Aynı anahtar silindikten sonra yeniden oluşturulmuş olabilir. Önceki
  // neslin revision'ını taşıyan gecikmiş mutation, yeni neslin alanlarına
  // uygulanamaz; tombstone yeni create sırasında kaldırıldığı için bu sınır
  // item üzerinde kalıcı olarak tutulur.
  if (current && current._createdRevision > 0
      && info.baseItemRevision > 0 && info.baseItemRevision < current._createdRevision) {
    return {
      document,
      changed: false,
      result: {
        ok: false,
        conflict: true,
        conflictType: 'recreated',
        key: patch.key,
        revision: document.revision,
        error: 'Kayıt yeniden oluşturulduğu için eski güncelleme uygulanmadı.',
      },
    };
  }

  if (!current && tombstone
      && (!info.allowCreate || info.baseItemRevision > 0 || info.baseStoreRevision < tombstone.revision)) {
    return {
      document,
      changed: false,
      result: {
        ok: false,
        conflict: true,
        conflictType: 'deleted',
        key: patch.key,
        revision: document.revision,
        error: 'Kayıt başka bir pencerede kaldırıldığı için eski güncelleme uygulanmadı.',
      },
    };
  }
  if (!current && !info.allowCreate) {
    return {
      document,
      changed: false,
      result: {
        ok: false,
        conflict: true,
        conflictType: 'missing',
        key: patch.key,
        revision: document.revision,
        error: 'Güncellenecek kütüphane kaydı artık yok.',
      },
    };
  }

  const nextRevision = document.revision + 1;
  const item = current ? clone(current) : {
    key: patch.key,
    revision: 0,
    _createdRevision: nextRevision,
    _fieldRevisions: {},
    collections: [],
    subtitlePaths: [],
    prefs: {},
    sessions: [],
  };
  const conflicts = [];
  let changed = !current;

  function setField(field, value) {
    if (!canApplyField(item, field, info)) {
      if (!valuesEqual(item[field], value)) conflicts.push(field);
      return;
    }
    if (valuesEqual(item[field], value)) return;
    item[field] = clone(value);
    item._fieldRevisions[field] = stampFor(info, nextRevision);
    changed = true;
  }

  for (const [field, value] of Object.entries(patch)) {
    if (value === undefined || field === 'key' || RESERVED_ITEM_FIELDS.has(field)) continue;
    if (field === 'firstWatched') {
      if (!item.firstWatched) setField(field, finiteNumber(value, now));
    } else if (field === 'lastWatched') {
      const newest = Math.max(finiteNumber(item.lastWatched), finiteNumber(value, now));
      setField(field, newest);
    } else {
      setField(field, value);
    }
  }

  if (!item.firstWatched) setField('firstWatched', finiteNumber(patch.firstWatched, now));
  if (!item.lastWatched) setField('lastWatched', finiteNumber(patch.lastWatched, now));

  if (patch.collections !== undefined) {
    const collections = uniqueStrings(patch.collections);
    if (canApplyField(item, 'collections', info)) {
      if (!valuesEqual(item.collections, collections)) {
        item.collections = collections;
        item._fieldRevisions.collections = stampFor(info, nextRevision);
        changed = true;
      }
    } else if (!valuesEqual(item.collections, collections)) conflicts.push('collections');
  }

  if (patch.subtitlePaths !== undefined) {
    const subtitlePaths = uniqueStrings([...(item.subtitlePaths || []), ...patch.subtitlePaths]);
    if (!valuesEqual(item.subtitlePaths, subtitlePaths)) {
      item.subtitlePaths = subtitlePaths;
      item._fieldRevisions.subtitlePaths = stampFor(info, nextRevision);
      changed = true;
    }
  }

  if (patch.prefs && typeof patch.prefs === 'object' && !Array.isArray(patch.prefs)) {
    for (const [name, value] of Object.entries(patch.prefs)) {
      if (value === undefined) continue;
      const field = `prefs.${name}`;
      if (!canApplyField(item, field, info)) {
        if (!valuesEqual(item.prefs[name], value)) conflicts.push(field);
        continue;
      }
      if (valuesEqual(item.prefs[name], value)) continue;
      item.prefs[name] = clone(value);
      item._fieldRevisions[field] = stampFor(info, nextRevision);
      changed = true;
    }
  }

  if (patch.session && typeof patch.session === 'object' && typeof patch.session.id === 'string' && patch.session.id) {
    const sessions = Array.isArray(item.sessions) ? item.sessions.slice(-39) : [];
    const sessionIndex = sessions.findIndex((session) => session.id === patch.session.id);
    const mergedSession = mergeSession(sessionIndex >= 0 ? sessions[sessionIndex] : null, patch.session);
    if (sessionIndex >= 0) {
      if (!valuesEqual(sessions[sessionIndex], mergedSession)) {
        sessions[sessionIndex] = mergedSession;
        changed = true;
      }
    } else {
      sessions.push(mergedSession);
      changed = true;
    }
    if (changed) item._fieldRevisions.sessions = stampFor(info, nextRevision);
    item.sessions = sessions;
  }

  item.collections = uniqueStrings(item.collections);
  item.subtitlePaths = uniqueStrings(item.subtitlePaths);
  item.sessions = Array.isArray(item.sessions) ? item.sessions.slice(-40) : [];
  const totalWatchSeconds = item.sessions.reduce((total, session) => (
    total + Math.max(0, finiteNumber(session.watchSeconds))
  ), 0);
  if (item.totalWatchSeconds !== totalWatchSeconds) {
    item.totalWatchSeconds = totalWatchSeconds;
    item._fieldRevisions.totalWatchSeconds = stampFor(info, nextRevision);
    changed = true;
  }

  if (!changed) {
    return {
      document,
      changed: false,
      result: {
        ok: true,
        item: publicWatchItem(item),
        revision: document.revision,
        conflict: conflicts.length > 0,
        conflicts: [...new Set(conflicts)],
      },
    };
  }

  item.revision = nextRevision;
  if (index >= 0) document.items.splice(index, 1);
  document.items.unshift(item);
  document.items.sort((a, b) => finiteNumber(b.lastWatched) - finiteNumber(a.lastWatched));
  const limit = Math.max(1, Math.floor(finiteNumber(options.limit, DEFAULT_LIMIT)));
  const evicted = document.items.splice(limit);
  document.tombstones = document.tombstones.filter((entry) => entry.key !== item.key);
  for (const dropped of evicted) {
    document.tombstones = document.tombstones.filter((entry) => entry.key !== dropped.key);
    document.tombstones.push({ key: dropped.key, revision: nextRevision, deletedAt: now });
  }
  document.tombstones = normalizeTombstones(document.tombstones);
  document.revision = nextRevision;
  return {
    document,
    changed: true,
    result: {
      ok: true,
      item: publicWatchItem(item),
      revision: document.revision,
      conflict: conflicts.length > 0,
      conflicts: [...new Set(conflicts)],
      warning: conflicts.length
        ? 'Eski kütüphane kaydı güncel alanları ezmeden birleştirildi.' : undefined,
    },
  };
}

function applyWatchRemove(rawDocument, rawRequest, options = {}) {
  const document = normalizeWatchLibraryDocument(rawDocument);
  const request = typeof rawRequest === 'string' ? { key: rawRequest } : clone(rawRequest || {});
  if (typeof request.key !== 'string' || !request.key.trim()) {
    return { document, changed: false, result: { ok: false, error: 'Geçersiz kütüphane anahtarı' } };
  }
  const key = request.key.trim();
  const now = finiteNumber(options.now, Date.now());
  const index = document.items.findIndex((item) => item.key === key);
  const oldTombstone = document.tombstones.find((entry) => entry.key === key);
  const current = index >= 0 ? document.items[index] : null;
  const info = mutationInfo(request, current, document, now);
  if (current && current._createdRevision > 0
      && info.baseItemRevision > 0 && info.baseItemRevision < current._createdRevision) {
    return {
      document,
      changed: false,
      result: {
        ok: false,
        conflict: true,
        conflictType: 'recreated',
        key,
        revision: document.revision,
        error: 'Kayıt yeniden oluşturulduğu için eski silme isteği uygulanmadı.',
      },
    };
  }
  if (index < 0 && oldTombstone) {
    return { document, changed: false, result: { ok: true, removed: false, key, revision: document.revision } };
  }
  const nextRevision = document.revision + 1;
  if (index >= 0) document.items.splice(index, 1);
  document.tombstones = document.tombstones.filter((entry) => entry.key !== key);
  document.tombstones.push({ key, revision: nextRevision, deletedAt: now });
  document.tombstones = normalizeTombstones(document.tombstones);
  document.revision = nextRevision;
  return {
    document,
    changed: true,
    result: { ok: true, removed: index >= 0, key, revision: document.revision },
  };
}

function replaceWatchLibraryItems(rawDocument, rawItems, options = {}) {
  const document = normalizeWatchLibraryDocument(rawDocument);
  if (!Array.isArray(rawItems)) {
    return { document, changed: false, result: { ok: false, error: 'Geçersiz kütüphane listesi' } };
  }
  const now = finiteNumber(options.now, Date.now());
  const nextRevision = document.revision + 1;
  const items = [];
  const seen = new Set();
  for (const raw of rawItems) {
    const item = normalizeItem(raw, nextRevision);
    if (!item || seen.has(item.key)) continue;
    seen.add(item.key);
    item.revision = nextRevision;
    item._createdRevision = nextRevision;
    item._fieldRevisions = {};
    for (const field of Object.keys(item)) {
      if (!['key', 'revision', '_createdRevision', '_fieldRevisions'].includes(field)) {
        item._fieldRevisions[field] = {
          revision: nextRevision, at: now, source: 'import', writerId: '', sequence: 0,
        };
      }
    }
    items.push(item);
  }
  const limit = Math.max(1, Math.floor(finiteNumber(options.limit, DEFAULT_LIMIT)));
  document.items = items.sort((a, b) => finiteNumber(b.lastWatched) - finiteNumber(a.lastWatched)).slice(0, limit);
  document.tombstones = [];
  document.revision = nextRevision;
  return { document, changed: true, result: { ok: true, revision: nextRevision } };
}

module.exports = {
  WATCH_LIBRARY_DOCUMENT_VERSION,
  applyWatchRemove,
  applyWatchUpsert,
  normalizeWatchLibraryDocument,
  publicWatchItem,
  replaceWatchLibraryItems,
  uniqueStrings,
  watchLibrarySnapshot,
};
