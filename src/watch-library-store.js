const fs = require('fs');
const path = require('path');

const CURRENT_SCHEMA_VERSION = 3;
const DEFAULT_ITEM_LIMIT = 1000;
const DEFAULT_TOMBSTONE_LIMIT = 2000;
const DEFAULT_MAX_PATCH_BYTES = 128 * 1024;
const DEFAULT_MAX_ITEM_BYTES = 256 * 1024;
const SECRET_QUERY_KEY = /^(token|access[_-]?token|id[_-]?token|jwt|sig|signature|auth|authorization|key|expires?|exp|credential|session|sid)$/i;

function isObject(value) {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function stableJson(value) {
  return JSON.stringify(value, null, 2);
}

function uniqueStrings(values) {
  return [...new Set((Array.isArray(values) ? values : [])
    .filter((value) => typeof value === 'string' && value.trim())
    .map((value) => value.trim()))];
}

function canonicalBrowserUrl(raw) {
  try {
    const url = new URL(String(raw || ''));
    for (const key of [...url.searchParams.keys()]) {
      if (SECRET_QUERY_KEY.test(key)) url.searchParams.delete(key);
    }
    url.hash = '';
    return url.href;
  } catch (_) {
    return '';
  }
}

function youtubeId(raw) {
  const value = String(raw || '').trim();
  if (/^[A-Za-z0-9_-]{11}$/.test(value)) return value;
  try {
    const url = new URL(value);
    const host = url.hostname.toLowerCase().replace(/^www\./, '');
    if (host === 'youtu.be') return (url.pathname.split('/').filter(Boolean)[0] || '').slice(0, 11);
    if (host.endsWith('youtube.com')) {
      if (/^\/shorts\//.test(url.pathname)) return (url.pathname.split('/')[2] || '').slice(0, 11);
      return (url.searchParams.get('v') || '').slice(0, 11);
    }
  } catch (_) {}
  return '';
}

function canonicalWatchKey(raw) {
  if (typeof raw !== 'string' || !raw.trim()) return '';
  const key = raw.trim();
  if (key.startsWith('file:')) return 'file:' + key.slice(5).replace(/\\/g, '/').toLowerCase();
  if (key.startsWith('browser:')) {
    const normalized = canonicalBrowserUrl(key.slice(8));
    return normalized ? `browser:${normalized}` : key;
  }
  if (key.startsWith('youtube:')) {
    const suffix = key.slice(8);
    const id = youtubeId(suffix);
    return id ? `youtube:${id}` : key;
  }
  const id = youtubeId(key);
  return id ? `youtube:${id}` : key;
}

function rememberLegacy(result, field, value) {
  result.migrationLegacy = { ...(isObject(result.migrationLegacy) ? result.migrationLegacy : {}), [field]: value };
}

function normalizeStringArrayField(result, field) {
  const original = result[field];
  if (original === undefined) {
    result[field] = [];
    return;
  }
  const normalized = uniqueStrings(original);
  if (!Array.isArray(original) || stableJson(original) !== stableJson(normalized)) {
    rememberLegacy(result, field, original);
  }
  result[field] = normalized;
}

function normalizeSessions(result) {
  const original = result.sessions;
  if (original === undefined) {
    result.sessions = [];
    return;
  }
  const sessions = Array.isArray(original) ? original.filter(isObject).map((session) => ({ ...session })) : [];
  if (!Array.isArray(original) || sessions.length !== original.length) rememberLegacy(result, 'sessions', original);
  result.sessions = sessions;
}

function normalizeItem(raw) {
  if (!isObject(raw)) return { item: null, reason: 'Kayıt nesne değil', raw };
  const key = canonicalWatchKey(raw.key);
  if (!key) return { item: null, reason: 'Kayıt anahtarı eksik veya geçersiz', raw };
  const result = { ...raw, key };
  if (key !== raw.key) result.legacyKeys = uniqueStrings([...(raw.legacyKeys || []), raw.key]);
  normalizeStringArrayField(result, 'collections');
  normalizeStringArrayField(result, 'subtitlePaths');
  normalizeSessions(result);
  if (result.prefs === undefined) result.prefs = {};
  else if (!isObject(result.prefs)) {
    rememberLegacy(result, 'prefs', result.prefs);
    result.prefs = {};
  } else result.prefs = { ...result.prefs };

  const legacyCompleted = typeof result.completed === 'boolean' ? result.completed : false;
  if (result.completed !== undefined && typeof result.completed !== 'boolean') {
    rememberLegacy(result, 'completed', result.completed);
  }
  const automaticCompleted = typeof result.automaticCompleted === 'boolean'
    ? result.automaticCompleted : legacyCompleted;
  if (result.automaticCompleted !== undefined && typeof result.automaticCompleted !== 'boolean') {
    rememberLegacy(result, 'automaticCompleted', result.automaticCompleted);
  }
  result.automaticCompleted = automaticCompleted;
  if (typeof result.completionOverride !== 'boolean' && typeof result.manualCompleted === 'boolean') {
    if (result.completionOverride !== undefined && result.completionOverride !== null) {
      rememberLegacy(result, 'completionOverride', result.completionOverride);
    }
    result.completionOverride = result.manualCompleted;
  }
  if (Object.prototype.hasOwnProperty.call(result, 'manualCompleted')) {
    rememberLegacy(result, 'manualCompleted', result.manualCompleted);
    delete result.manualCompleted;
  }
  if (typeof result.completionOverride === 'boolean') result.completed = result.completionOverride;
  else {
    if (result.completionOverride !== undefined && result.completionOverride !== null) {
      rememberLegacy(result, 'completionOverride', result.completionOverride);
    }
    delete result.completionOverride;
    result.completed = automaticCompleted;
  }
  result.revision = Math.max(0, Math.trunc(Number(result.revision) || 0));
  return { item: result, reason: '', raw: null };
}

function itemAuthority(item) {
  return [Math.max(0, Number(item.revision) || 0), Math.max(0, Number(item.lastWatched) || 0)];
}

function compareAuthority(a, b) {
  const aa = itemAuthority(a);
  const bb = itemAuthority(b);
  return aa[0] - bb[0] || aa[1] - bb[1];
}

function mergeSessions(records) {
  const anonymous = [];
  const byId = new Map();
  for (const record of records) {
    for (const session of record.sessions || []) {
      if (!session.id) anonymous.push({ ...session });
      else byId.set(session.id, { ...(byId.get(session.id) || {}), ...session });
    }
  }
  return [...anonymous, ...byId.values()].slice(-40);
}

function mergeDuplicateItems(records) {
  const ordered = records.slice().sort(compareAuthority);
  const newest = ordered[ordered.length - 1];
  const result = { ...newest };
  result.collections = uniqueStrings(ordered.flatMap((item) => item.collections || []));
  result.subtitlePaths = uniqueStrings(ordered.flatMap((item) => item.subtitlePaths || []));
  result.legacyKeys = uniqueStrings(ordered.flatMap((item) => item.legacyKeys || []));
  if (!result.legacyKeys.length) delete result.legacyKeys;
  result.prefs = Object.assign({}, ...ordered.map((item) => item.prefs || {}));
  result.sessions = mergeSessions(ordered);
  result.totalWatchSeconds = result.sessions.reduce((total, session) => total + Math.max(0, Number(session.watchSeconds) || 0), 0);
  const firstValues = ordered.map((item) => Number(item.firstWatched)).filter((value) => value > 0);
  if (firstValues.length) result.firstWatched = Math.min(...firstValues);
  result.lastWatched = Math.max(...ordered.map((item) => Math.max(0, Number(item.lastWatched) || 0)));
  result.revision = Math.max(...ordered.map((item) => Math.max(0, Number(item.revision) || 0)));
  const manual = ordered.filter((item) => typeof item.completionOverride === 'boolean').pop();
  if (manual) {
    result.completionOverride = manual.completionOverride;
    result.completed = manual.completionOverride;
  }
  const duplicates = [];
  for (const item of ordered.slice(0, -1)) {
    duplicates.push(...(Array.isArray(item.migrationDuplicates) ? item.migrationDuplicates : []));
    const preserved = { ...item };
    delete preserved.migrationDuplicates;
    duplicates.push(preserved);
  }
  duplicates.push(...(Array.isArray(newest.migrationDuplicates) ? newest.migrationDuplicates : []));
  if (duplicates.length) result.migrationDuplicates = duplicates;
  return result;
}

function normalizeTombstone(raw) {
  if (!isObject(raw)) return null;
  const key = canonicalWatchKey(raw.key);
  if (!key) return null;
  const result = { ...raw, key, removedAt: Math.max(0, Number(raw.removedAt) || 0) };
  if (key !== raw.key) result.legacyKeys = uniqueStrings([...(raw.legacyKeys || []), raw.key]);
  return result;
}

function splitJsonArrayElements(raw) {
  const trimmed = String(raw || '').trim();
  if (!trimmed.startsWith('[')) return null;
  const content = trimmed.endsWith(']') ? trimmed.slice(1, -1) : trimmed.slice(1);
  const parts = [];
  let start = 0;
  let depth = 0;
  let quoted = false;
  let escaped = false;
  for (let index = 0; index < content.length; index++) {
    const char = content[index];
    if (quoted) {
      if (escaped) escaped = false;
      else if (char === '\\') escaped = true;
      else if (char === '"') quoted = false;
      continue;
    }
    if (char === '"') quoted = true;
    else if (char === '{' || char === '[') depth++;
    else if (char === '}' || char === ']') depth = Math.max(0, depth - 1);
    else if (char === ',' && depth === 0) {
      parts.push(content.slice(start, index));
      start = index + 1;
    }
  }
  parts.push(content.slice(start));
  return parts.map((part) => part.trim()).filter(Boolean);
}

function parseDocument(raw) {
  try {
    return { value: JSON.parse(raw), syntaxQuarantine: [], exact: true };
  } catch (parseError) {
    const parts = splitJsonArrayElements(raw);
    if (!parts) throw parseError;
    const value = [];
    const syntaxQuarantine = [];
    for (let index = 0; index < parts.length; index++) {
      try { value.push(JSON.parse(parts[index])); }
      catch (_) { syntaxQuarantine.push({ index, reason: 'Bozuk JSON kayıt parçası', rawText: parts[index] }); }
    }
    if (!value.length) throw parseError;
    return { value, syntaxQuarantine, exact: false };
  }
}

function recognizedRoot(value) {
  return Array.isArray(value) || (isObject(value) && Array.isArray(value.items));
}

function extractBundledWatchLibrary(value) {
  return isObject(value) && Number(value.backupVersion) >= 2 && Array.isArray(value.watchLibrary)
    ? value.watchLibrary : null;
}

function migrateWatchDocument(value, options = {}) {
  if (!recognizedRoot(value)) {
    const bundled = extractBundledWatchLibrary(value);
    if (!bundled) throw new Error('Tanınmayan izleme kütüphanesi kök şeması');
    value = bundled;
  }
  const envelope = Array.isArray(value) ? null : value;
  const inputItems = Array.isArray(value) ? value : [
    ...value.items,
    ...(Array.isArray(value.overflowItems) ? value.overflowItems : []),
  ];
  const inputTombstones = [
    ...(envelope && Array.isArray(envelope.tombstones) ? envelope.tombstones : []),
    ...(envelope && Array.isArray(envelope.overflowTombstones) ? envelope.overflowTombstones : []),
    ...(Array.isArray(options.legacyTombstones) ? options.legacyTombstones : []),
  ];
  const quarantine = envelope && Array.isArray(envelope.migrationQuarantine)
    ? envelope.migrationQuarantine.slice() : [];
  quarantine.push(...(Array.isArray(options.syntaxQuarantine) ? options.syntaxQuarantine : []));

  const groups = new Map();
  let rejectedRecords = 0;
  inputItems.forEach((raw, index) => {
    const normalized = normalizeItem(raw);
    if (!normalized.item) {
      quarantine.push({ index, reason: normalized.reason, value: normalized.raw });
      rejectedRecords++;
      return;
    }
    const group = groups.get(normalized.item.key) || [];
    group.push(normalized.item);
    groups.set(normalized.item.key, group);
  });
  let duplicateRecords = 0;
  let items = [...groups.values()].map((records) => {
    duplicateRecords += Math.max(0, records.length - 1);
    return records.length === 1 ? records[0] : mergeDuplicateItems(records);
  });

  const tombstoneMap = new Map();
  for (const raw of inputTombstones) {
    const tombstone = normalizeTombstone(raw);
    if (!tombstone) continue;
    const previous = tombstoneMap.get(tombstone.key);
    if (!previous || tombstone.removedAt > previous.removedAt) tombstoneMap.set(tombstone.key, tombstone);
  }
  const deletedItems = [];
  items = items.filter((item) => {
    const tombstone = tombstoneMap.get(item.key);
    if (!tombstone) return true;
    if (!tombstone.item) tombstone.item = item;
    deletedItems.push(item.key);
    return false;
  });

  items.sort((a, b) => (Number(b.lastWatched) || 0) - (Number(a.lastWatched) || 0) || a.key.localeCompare(b.key));
  const tombstones = [...tombstoneMap.values()]
    .sort((a, b) => (Number(b.removedAt) || 0) - (Number(a.removedAt) || 0) || a.key.localeCompare(b.key));
  const itemLimit = Math.max(1, Number(options.itemLimit) || DEFAULT_ITEM_LIMIT);
  const tombstoneLimit = Math.max(1, Number(options.tombstoneLimit) || DEFAULT_TOMBSTONE_LIMIT);
  const extras = envelope ? { ...envelope } : {};
  for (const key of ['schemaVersion', 'items', 'overflowItems', 'tombstones', 'overflowTombstones', 'migrationQuarantine']) {
    delete extras[key];
  }
  const schemaVersion = Math.max(CURRENT_SCHEMA_VERSION, Math.trunc(Number(envelope && envelope.schemaVersion) || 0));
  const document = {
    ...extras,
    schemaVersion,
    items: items.slice(0, itemLimit),
    tombstones: tombstones.slice(0, tombstoneLimit),
  };
  if (items.length > itemLimit) document.overflowItems = items.slice(itemLimit);
  if (tombstones.length > tombstoneLimit) document.overflowTombstones = tombstones.slice(tombstoneLimit);
  if (quarantine.length) document.migrationQuarantine = quarantine;
  return {
    document,
    report: {
      inputRecords: inputItems.length,
      visibleRecords: document.items.length,
      overflowRecords: (document.overflowItems || []).length,
      rejectedRecords,
      duplicateRecords,
      tombstones: tombstones.length,
      deletedItems: deletedItems.length,
      syntaxRejectedRecords: (options.syntaxQuarantine || []).length,
    },
  };
}

function readLegacyTombstones(filePath, io) {
  if (!filePath || !io.existsSync(filePath)) return [];
  try {
    const value = JSON.parse(io.readFileSync(filePath, 'utf-8'));
    return Array.isArray(value) ? value : [];
  } catch (_) {
    return [];
  }
}

function fsyncFile(filePath, io) {
  // Windows'ta FlushFileBuffers salt-okunur tanıtıcıda EPERM döndürebilir.
  // Geçici dosyalar bize ait ve yazılabilir; r+ gerçek flush semantiğini korur.
  const descriptor = io.openSync(filePath, 'r+');
  try { io.fsyncSync(descriptor); } finally { io.closeSync(descriptor); }
}

function fsyncDirectory(dirPath, io) {
  let descriptor;
  try {
    descriptor = io.openSync(dirPath, 'r');
    io.fsyncSync(descriptor);
  } catch (_) {
    // Windows ve bazı dosya sistemleri dizin fsync'ini desteklemez.
  } finally {
    if (descriptor !== undefined) try { io.closeSync(descriptor); } catch (_) {}
  }
}

function healthyRawDocument(raw) {
  try {
    const value = JSON.parse(raw);
    return recognizedRoot(value) || !!extractBundledWatchLibrary(value);
  } catch (_) {
    return false;
  }
}

function atomicCommit(filePath, document, options) {
  const io = options.fsImpl;
  const fault = options.fault;
  const raw = stableJson(document);
  const tmpPath = `${filePath}.tmp`;
  const backupPath = `${filePath}.bak`;
  const backupTmpPath = `${backupPath}.tmp`;
  io.mkdirSync(path.dirname(filePath), { recursive: true });
  try {
    fault('before-temp-write');
    io.writeFileSync(tmpPath, raw, 'utf-8');
    fault('after-temp-write');
    fsyncFile(tmpPath, io);
    fault('after-temp-fsync');
    const oldRaw = options.primaryRaw;
    if (oldRaw !== null && oldRaw !== undefined && healthyRawDocument(oldRaw) && oldRaw !== raw) {
      fault('before-backup-write');
      io.writeFileSync(backupTmpPath, oldRaw, 'utf-8');
      fsyncFile(backupTmpPath, io);
      fault('after-backup-write');
      io.renameSync(backupTmpPath, backupPath);
      fault('after-backup-replace');
    }
    fault('before-main-replace');
    io.renameSync(tmpPath, filePath);
    fault('after-main-replace');
    fsyncDirectory(path.dirname(filePath), io);
    fault('after-directory-fsync');
    return raw;
  } catch (error) {
    try { if (io.existsSync(tmpPath)) io.unlinkSync(tmpPath); } catch (_) {}
    try { if (io.existsSync(backupTmpPath)) io.unlinkSync(backupTmpPath); } catch (_) {}
    throw error;
  }
}

function allItems(document) {
  return [...document.items, ...(document.overflowItems || [])];
}

function allTombstones(document) {
  return [...document.tombstones, ...(document.overflowTombstones || [])];
}

function createWatchLibraryStore(options) {
  if (!options || !options.filePath) throw new Error('İzleme kütüphanesi dosya yolu gerekli');
  const filePath = options.filePath;
  const tombstonePath = options.tombstonePath || path.join(path.dirname(filePath), 'watch-library-tombstones.json');
  const io = options.fsImpl || fs;
  const now = typeof options.now === 'function' ? options.now : Date.now;
  const fault = typeof options.fault === 'function' ? options.fault : () => {};
  const maxPatchBytes = Number.isFinite(options.maxPatchBytes)
    ? Math.max(0, options.maxPatchBytes) : DEFAULT_MAX_PATCH_BYTES;
  const maxItemBytes = Number.isFinite(options.maxItemBytes)
    ? Math.max(0, options.maxItemBytes) : DEFAULT_MAX_ITEM_BYTES;
  const migrationOptions = {
    itemLimit: options.itemLimit || DEFAULT_ITEM_LIMIT,
    tombstoneLimit: options.tombstoneLimit || DEFAULT_TOMBSTONE_LIMIT,
  };
  let cache = null;
  let lastReport = null;

  function commit(document, primaryRaw) {
    const raw = atomicCommit(filePath, document, { fsImpl: io, fault, primaryRaw });
    cache = document;
    return raw;
  }

  function loadDocument() {
    if (cache) return cache;
    fault('before-read');
    const primaryExists = io.existsSync(filePath);
    const primaryRaw = primaryExists ? io.readFileSync(filePath, 'utf-8') : null;
    let parsed = null;
    let source = primaryExists ? 'primary' : 'default';
    if (primaryRaw !== null) {
      try { parsed = parseDocument(primaryRaw); } catch (_) {}
    }
    if (!parsed && io.existsSync(`${filePath}.bak`)) {
      parsed = parseDocument(io.readFileSync(`${filePath}.bak`, 'utf-8'));
      source = 'backup';
    }
    if (!parsed && primaryExists) throw new Error('İzleme kütüphanesi ve yedeği okunamadı; dosyalar korunuyor');
    if (!parsed) parsed = { value: [], syntaxQuarantine: [], exact: true };
    fault('after-read');
    const hasLegacyTombstoneFile = io.existsSync(tombstonePath);
    const legacyTombstonesAlreadyImported = isObject(parsed.value)
      && parsed.value.legacyTombstoneSidecarImported === true;
    const legacyTombstones = legacyTombstonesAlreadyImported
      ? [] : readLegacyTombstones(tombstonePath, io);
    const migrated = migrateWatchDocument(parsed.value, {
      ...migrationOptions,
      legacyTombstones,
      syntaxQuarantine: parsed.syntaxQuarantine,
    });
    if (hasLegacyTombstoneFile && !legacyTombstonesAlreadyImported) {
      // Eski sidecar silinmez; ancak açık restore kararından sonra yeniden
      // uygulanmaması için bir kez içe aktarıldığı zarf içinde işaretlenir.
      migrated.document = {
        legacyTombstoneSidecarImported: true,
        ...migrated.document,
      };
    }
    lastReport = { ...migrated.report, source };
    fault('after-migrate');
    const canonicalRaw = stableJson(migrated.document);
    const shouldCommit = source === 'backup'
      || (primaryExists && (!parsed.exact || primaryRaw !== canonicalRaw))
      || (!primaryExists && hasLegacyTombstoneFile);
    if (shouldCommit) commit(migrated.document, source === 'primary' && parsed.exact ? primaryRaw : null);
    else cache = migrated.document;
    return cache;
  }

  function replaceItems(items, replaceOptions = {}) {
    const current = loadDocument();
    const tombstones = allTombstones(current);
    const restored = new Set(replaceOptions.restoreRemoved
      ? (Array.isArray(items) ? items : []).map((item) => canonicalWatchKey(item && item.key)).filter(Boolean)
      : []);
    const source = {
      ...current,
      items: Array.isArray(items) ? items : [],
      overflowItems: [],
      tombstones: tombstones.filter((item) => !restored.has(item.key)),
      overflowTombstones: [],
    };
    const migrated = migrateWatchDocument(source, migrationOptions);
    commit(migrated.document, io.existsSync(filePath) ? io.readFileSync(filePath, 'utf-8') : null);
    lastReport = { ...migrated.report, source: 'replace' };
    return migrated.document.items;
  }

  function upsert(patch, upsertOptions = {}) {
    if (!isObject(patch)) return null;
    try {
      if (Buffer.byteLength(JSON.stringify(patch), 'utf8') > maxPatchBytes) return null;
    } catch (_) {
      return null;
    }
    const key = canonicalWatchKey(patch.key);
    if (!key) return null;
    const current = loadDocument();
    let tombstones = allTombstones(current);
    const removedTombstone = tombstones.find((item) => item.key === key);
    const removed = !!removedTombstone;
    if (removed && !upsertOptions.restoreRemoved) return null;
    if (removed) tombstones = tombstones.filter((item) => item.key !== key);
    const items = allItems(current);
    const index = items.findIndex((item) => item.key === key);
    const previous = index >= 0
      ? items[index]
      : (removed && isObject(removedTombstone.item) ? removedTombstone.item : {});
    const sessions = Array.isArray(previous.sessions) ? previous.sessions.slice(-40) : [];
    if (isObject(patch.session) && patch.session.id) {
      const sessionIndex = sessions.findIndex((session) => session.id === patch.session.id);
      if (sessionIndex >= 0) sessions[sessionIndex] = { ...sessions[sessionIndex], ...patch.session };
      else sessions.push({ ...patch.session });
    }
    if (sessions.length > 40) sessions.splice(0, sessions.length - 40);
    const changesOverride = Object.prototype.hasOwnProperty.call(patch, 'completionOverride')
      && (typeof patch.completionOverride === 'boolean' || patch.completionOverride === null);
    const previousAutomatic = typeof previous.automaticCompleted === 'boolean'
      ? previous.automaticCompleted : !!previous.completed;
    const automaticCompleted = typeof patch.automaticCompleted === 'boolean'
      ? patch.automaticCompleted
      : (!changesOverride && typeof patch.completed === 'boolean' ? patch.completed : previousAutomatic);
    const completionOverride = changesOverride
      ? patch.completionOverride
      : (typeof previous.completionOverride === 'boolean' ? previous.completionOverride : null);
    const merged = {
      ...previous,
      ...patch,
      key,
      firstWatched: previous.firstWatched || patch.firstWatched || now(),
      // lastWatched 0 geçerli: "hiç izlenmedi". `|| now()` sıfırı şimdiye
      // çevirip hiç açılmamış kaydı listenin tepesine taşıyordu (R127).
      lastWatched: patch.lastWatched === undefined || patch.lastWatched === null
        ? now()
        : (Number.isFinite(Number(patch.lastWatched)) ? Math.max(0, Number(patch.lastWatched)) : now()),
      collections: patch.collections === undefined ? uniqueStrings(previous.collections) : uniqueStrings(patch.collections),
      subtitlePaths: uniqueStrings([...(previous.subtitlePaths || []), ...uniqueStrings(patch.subtitlePaths)]),
      prefs: { ...(isObject(previous.prefs) ? previous.prefs : {}), ...(isObject(patch.prefs) ? patch.prefs : {}) },
      sessions,
      automaticCompleted,
      completed: completionOverride === null ? automaticCompleted : completionOverride,
      revision: Math.max(0, Number(previous.revision) || 0) + 1,
    };
    if (completionOverride === null) delete merged.completionOverride;
    else merged.completionOverride = completionOverride;
    delete merged.session;
    merged.totalWatchSeconds = sessions.reduce((total, session) => total + Math.max(0, Number(session.watchSeconds) || 0), 0);
    try {
      if (Buffer.byteLength(JSON.stringify(merged), 'utf8') > maxItemBytes) return null;
    } catch (_) {
      return null;
    }
    if (index >= 0) items.splice(index, 1);
    items.unshift(merged);
    const migrated = migrateWatchDocument({
      ...current,
      items,
      overflowItems: [],
      tombstones,
      overflowTombstones: [],
    }, migrationOptions);
    commit(migrated.document, io.existsSync(filePath) ? io.readFileSync(filePath, 'utf-8') : null);
    lastReport = { ...migrated.report, source: 'upsert' };
    return allItems(migrated.document).find((item) => item.key === key) || null;
  }

  function remove(key) {
    const normalized = canonicalWatchKey(key);
    if (!normalized) return false;
    const current = loadDocument();
    const items = allItems(current);
    const removedItem = items.find((item) => item.key === normalized);
    const tombstones = allTombstones(current).filter((item) => item.key !== normalized);
    tombstones.unshift({ key: normalized, removedAt: now(), ...(removedItem ? { item: removedItem } : {}) });
    const migrated = migrateWatchDocument({
      ...current,
      items: items.filter((item) => item.key !== normalized),
      overflowItems: [],
      tombstones,
      overflowTombstones: [],
    }, migrationOptions);
    commit(migrated.document, io.existsSync(filePath) ? io.readFileSync(filePath, 'utf-8') : null);
    lastReport = { ...migrated.report, source: 'remove' };
    return true;
  }

  return {
    load: () => loadDocument().items,
    loadAll: () => allItems(loadDocument()),
    loadDocument,
    replaceItems,
    upsert,
    remove,
    restore: (patch) => upsert(patch, { restoreRemoved: true }),
    isRemoved: (key) => allTombstones(loadDocument()).some((item) => item.key === canonicalWatchKey(key)),
    getLastReport: () => lastReport && { ...lastReport },
    resetCache: () => { cache = null; },
  };
}

module.exports = {
  CURRENT_SCHEMA_VERSION,
  DEFAULT_ITEM_LIMIT,
  DEFAULT_TOMBSTONE_LIMIT,
  canonicalBrowserUrl,
  canonicalWatchKey,
  createWatchLibraryStore,
  extractBundledWatchLibrary,
  migrateWatchDocument,
  parseDocument,
  stableJson,
};
