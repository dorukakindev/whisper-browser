'use strict';

const QUEUE_SNAPSHOT_VERSION = 1;
const MAX_QUEUE_ITEMS = 500;
const MAX_QUEUE_OPTIONS_BYTES = 512 * 1024;
const SECRET_OPTION_KEYS = new Set(['hfToken', 'translateApiKey', 'llmApiKey']);
const ALLOWED_STATUS = new Set(['pending', 'running', 'done', 'error']);

function clonePublicOptions(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const publicOptions = {};
  for (const [key, value] of Object.entries(raw)) {
    if (SECRET_OPTION_KEYS.has(key) || ['chat', 'explain', 'queueItemId', 'input', 'youtube'].includes(key)) continue;
    if (typeof value === 'function' || typeof value === 'symbol' || value === undefined) continue;
    publicOptions[key] = value;
  }
  try {
    const encoded = JSON.stringify(publicOptions);
    if (Buffer.byteLength(encoded, 'utf8') > MAX_QUEUE_OPTIONS_BYTES) return {};
    const parsed = JSON.parse(encoded);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch (_) { return {}; }
}

function normalizeQueueItem(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const id = Number(raw.id);
  const type = raw.type === 'youtube' ? 'youtube' : (raw.type === 'file' ? 'file' : '');
  const input = String(raw.input || '').trim().slice(0, 8000);
  if (!Number.isSafeInteger(id) || id <= 0 || !type || !input) return null;
  const status = ALLOWED_STATUS.has(raw.status) ? raw.status : 'pending';
  return {
    id,
    type,
    input,
    label: String(raw.label || '').trim().slice(0, 500)
      || (type === 'youtube' ? input.slice(0, 60) : input.split(/[\\/]/).pop()),
    status,
    files: Array.isArray(raw.files)
      ? raw.files.filter((value) => typeof value === 'string').map((value) => value.slice(0, 8000)).slice(0, 20)
      : [],
    warnings: Array.isArray(raw.warnings)
      ? raw.warnings.filter((value) => typeof value === 'string').map((value) => value.slice(0, 2000)).slice(0, 100)
      : [],
    opts: clonePublicOptions(raw.opts),
    recovered: !!raw.recovered,
  };
}

function normalizeQueueSnapshot(raw, activeQueueItemId = null) {
  const source = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
  const activeId = Number.isSafeInteger(Number(activeQueueItemId)) && Number(activeQueueItemId) > 0
    ? Number(activeQueueItemId) : null;
  const seen = new Set();
  let recoveredCount = 0;
  const items = (Array.isArray(source.items) ? source.items : []).slice(0, MAX_QUEUE_ITEMS)
    .map(normalizeQueueItem).filter((item) => {
      if (!item || seen.has(item.id)) return false;
      seen.add(item.id);
      return true;
    }).map((item) => {
      if (item.status !== 'running') return item;
      if (item.id === activeId) return item;
      recoveredCount += 1;
      return { ...item, status: 'pending', recovered: true };
    });
  const activePresent = activeId !== null
    && items.some((item) => item.id === activeId && item.status === 'running');
  return {
    version: QUEUE_SNAPSHOT_VERSION,
    updatedAt: Number(source.updatedAt) || Date.now(),
    queueRunning: activePresent,
    currentQueueId: activePresent ? activeId : null,
    recoveredCount,
    items,
  };
}

function queueSnapshotForDisk(raw) {
  const normalized = normalizeQueueSnapshot(raw, raw?.currentQueueId);
  return {
    version: QUEUE_SNAPSHOT_VERSION,
    updatedAt: Date.now(),
    queueRunning: !!raw?.queueRunning,
    currentQueueId: normalized.currentQueueId,
    items: normalized.items,
  };
}

function updateQueueSnapshotTerminal(raw, queueItemId, event) {
  const id = Number(queueItemId);
  const snapshot = normalizeQueueSnapshot(raw, id);
  const item = snapshot.items.find((entry) => entry.id === id);
  if (!item) return queueSnapshotForDisk(snapshot);
  if (event?.type === 'done') {
    item.status = 'done';
    item.files = Array.isArray(event.files)
      ? event.files.filter((value) => typeof value === 'string').map((value) => value.slice(0, 8000)).slice(0, 20)
      : [];
    item.warnings = Array.isArray(event.warnings)
      ? event.warnings.filter((value) => typeof value === 'string').map((value) => value.slice(0, 2000)).slice(0, 100)
      : [];
  } else if (event?.type === 'error' || event?.type === 'exit') {
    if (item.status === 'running') item.status = 'error';
  }
  item.recovered = false;
  return queueSnapshotForDisk({ ...snapshot, currentQueueId: null, queueRunning: false });
}

function updateQueueSnapshotRunning(raw, queueItemId, fallback = null) {
  const id = Number(queueItemId);
  if (!Number.isSafeInteger(id) || id <= 0) return queueSnapshotForDisk(raw);
  const snapshot = normalizeQueueSnapshot(raw);
  let item = snapshot.items.find((entry) => entry.id === id);
  if (!item && fallback) {
    item = normalizeQueueItem({ ...fallback, id, status: 'running' });
    if (item && snapshot.items.length < MAX_QUEUE_ITEMS) snapshot.items.push(item);
  }
  if (!item) return queueSnapshotForDisk(snapshot);
  item.status = 'running';
  item.recovered = false;
  return queueSnapshotForDisk({ ...snapshot, queueRunning: true, currentQueueId: id });
}

module.exports = {
  MAX_QUEUE_ITEMS,
  SECRET_OPTION_KEYS,
  clonePublicOptions,
  normalizeQueueItem,
  normalizeQueueSnapshot,
  queueSnapshotForDisk,
  updateQueueSnapshotRunning,
  updateQueueSnapshotTerminal,
};
