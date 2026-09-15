'use strict';

const QUEUE_SNAPSHOT_VERSION = 1;
const MAX_QUEUE_ITEMS = 500;
const MAX_QUEUE_OPTIONS_BYTES = 512 * 1024;
const SECRET_OPTION_KEYS = new Set([
  'hfToken', 'translateApiKey', 'llmApiKey',
  'translateBaseUrl', 'llmBaseUrl', 'mangaBaseUrl',
  // Eklenti/özel sağlayıcı seçenekleri kuyruk snapshot'ına düz metin olarak
  // girmemeli; kısa ve CamelCase anahtarlar regex'ten kaçabilir.
  'bearerToken', 'csrfToken', 'xsrfToken', 'privateKey', 'authToken',
  'sessionId', 'sid', 'sig', 'signature', 'oauthBearerToken',
]);
const ALLOWED_STATUS = new Set(['pending', 'running', 'done', 'error']);
const TERMINAL_STATUS = new Set(['done', 'error']);
const SENSITIVE_URL_PARAMS = /^(token|access[_-]?token|id[_-]?token|refresh[_-]?token|oauth[_-]?token|api[_-]?key|client[_-]?secret|csrf|xsrf|jwt|sig|signature|auth|authorization|key|expires?|exp|credential|session|sid)$/i;

function secretOptionKey(key) {
  return SECRET_OPTION_KEYS.has(key)
    || /(?:^|[_-])(?:api[_-]?key|access[_-]?token|refresh[_-]?token|oauth[_-]?token|secret|password|passwd|authorization|cookie|credential)(?:$|[_-])/i.test(key)
    || /(?:ApiKey|AccessToken|RefreshToken|OauthToken|ClientSecret|Password|Authorization|Credential)$/i.test(key);
}

function sanitizeOptionUrl(value, key) {
  if (typeof value !== 'string' || !/(?:url|uri|endpoint)$/i.test(key)) return value;
  if (!/^https?:\/\//i.test(value)) return value;
  try {
    const parsed = new URL(value);
    // Kullanıcı adı/parola taşıyan sağlayıcı adresi kalıcı kuyruğa hiç girmez.
    // Renderer işi yeniden başlatırken güncel UI değerini çalışma anında ekler.
    if (parsed.username || parsed.password) return undefined;
    for (const name of [...parsed.searchParams.keys()]) {
      if (SENSITIVE_URL_PARAMS.test(name)) parsed.searchParams.delete(name);
    }
    return parsed.toString();
  } catch (_) {
    // URL olduğu söylenen ama ayrıştırılamayan değer güvenle saklanamaz.
    return undefined;
  }
}

function sanitizePublicValue(value, key = '', depth = 0) {
  if (depth > 8 || typeof value === 'function' || typeof value === 'symbol' || value === undefined) return undefined;
  if (secretOptionKey(key)) return undefined;
  if (value === null || typeof value === 'boolean' || typeof value === 'number') return value;
  if (typeof value === 'string') return sanitizeOptionUrl(value, key);
  if (Array.isArray(value)) {
    // Kuyruk geri yüklenirken listenin kuyruğunu sessizce kaybetmek yerine
    // bütün seçenek nesnesini reddet; kullanıcı kayıt hatasını açıkça görür.
    if (value.length > 5000) throw new RangeError('Dizi sınırı aşıldı.');
    return value.map((item) => sanitizePublicValue(item, '', depth + 1))
      .filter((item) => item !== undefined);
  }
  if (!value || typeof value !== 'object') return undefined;
  const result = {};
  for (const [childKey, childValue] of Object.entries(value)) {
    const sanitized = sanitizePublicValue(childValue, childKey, depth + 1);
    if (sanitized !== undefined) result[childKey] = sanitized;
  }
  return result;
}

function clonePublicOptions(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  try {
    const publicOptions = {};
    for (const [key, value] of Object.entries(raw)) {
      if (['chat', 'explain', 'queueItemId', 'input', 'youtube'].includes(key)) continue;
      const sanitized = sanitizePublicValue(value, key);
      if (sanitized !== undefined) publicOptions[key] = sanitized;
    }
    const encoded = JSON.stringify(publicOptions);
    if (Buffer.byteLength(encoded, 'utf8') > MAX_QUEUE_OPTIONS_BYTES) return null;
    const parsed = JSON.parse(encoded);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch (_) { return null; }
}

function validateQueueOptions(snapshot) {
  for (const item of (Array.isArray(snapshot?.items) ? snapshot.items : []).slice(0, MAX_QUEUE_ITEMS)) {
    if (clonePublicOptions(item?.opts) === null) {
      return { ok: false, error: 'Kuyruk ayarları kaydedilemedi: bir işin seçenekleri geçersiz veya 512 KB sınırını aşıyor. Mevcut kayıt korundu.' };
    }
  }
  return { ok: true };
}

function mergeQueueSnapshotForSave(diskRaw, incomingRaw, activeQueueItemId = null,
    protectedTerminalIds = []) {
  const incoming = normalizeQueueSnapshot(incomingRaw, activeQueueItemId);
  const disk = normalizeQueueSnapshot(diskRaw, activeQueueItemId);
  const protectedIds = new Set([...protectedTerminalIds]
    .map(Number).filter((id) => Number.isSafeInteger(id) && id > 0));
  const diskById = new Map(disk.items.map((item) => [item.id, item]));
  for (const item of incoming.items) {
    if (!protectedIds.has(item.id)) continue;
    const authoritative = diskById.get(item.id);
    const protectedStatus = authoritative
      && (TERMINAL_STATUS.has(authoritative.status) || authoritative.status === 'pending');
    if (!protectedStatus) continue;
    // Ana süreç terminal/iptal sonucunu diske yazdıktan sonra gecikmiş renderer
    // snapshot'ı hâlâ "running" veya başka bir sonuç taşıyabilir. Yalnız sonuç alanlarını koru;
    // kullanıcının diğer kuyruk düzenlemelerini kaybetme.
    item.status = authoritative.status;
    item.files = authoritative.files.slice();
    item.warnings = authoritative.warnings.slice();
    item.error = authoritative.error;
    item.recovered = false;
  }
  return queueSnapshotForDisk({
    ...incoming,
    queueRunning: !!incomingRaw?.queueRunning,
    currentQueueId: activeQueueItemId || incoming.currentQueueId,
  });
}

function normalizeQueueItem(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const id = Number(raw.id);
  const type = raw.type === 'youtube' ? 'youtube' : (raw.type === 'file' ? 'file' : '');
  const input = String(raw.input || '').trim().slice(0, 8000);
  if (!Number.isSafeInteger(id) || id <= 0 || !type || !input) return null;
  const status = ALLOWED_STATUS.has(raw.status) ? raw.status : 'pending';
  const opts = clonePublicOptions(raw.opts);
  if (opts === null) return null;
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
    error: String(raw.error || '').trim().slice(0, 500),
    opts,
    watchSource: raw.watchSource === true,
    recovered: !!raw.recovered,
  };
}

function normalizeQueueSnapshot(raw, activeQueueItemId = null) {
  const source = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
  const activeId = Number.isSafeInteger(Number(activeQueueItemId)) && Number(activeQueueItemId) > 0
    ? Number(activeQueueItemId) : null;
  const seen = new Set();
  let recoveredCount = 0;
  let invalidCount = Math.max(0, (Array.isArray(source.items) ? source.items.length : 0) - MAX_QUEUE_ITEMS);
  const items = (Array.isArray(source.items) ? source.items : []).slice(0, MAX_QUEUE_ITEMS)
    .map(normalizeQueueItem).filter((item) => {
      if (!item || seen.has(item.id)) {
        invalidCount += 1;
        return false;
      }
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
    invalidCount,
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
    item.error = '';
    item.files = Array.isArray(event.files)
      ? event.files.filter((value) => typeof value === 'string').map((value) => value.slice(0, 8000)).slice(0, 20)
      : [];
    item.warnings = Array.isArray(event.warnings)
      ? event.warnings.filter((value) => typeof value === 'string').map((value) => value.slice(0, 2000)).slice(0, 100)
      : [];
  } else if (event?.type === 'exit' && event?.cancelled) {
    // Kullanıcı iptalinde iş yeniden denenebilir kalır; uygulama kapanıp
    // renderer olayı alamasa bile disk snapshot'ı sahte bir hata taşımaz.
    if (item.status === 'running') item.status = 'pending';
    item.error = '';
  } else if (event?.type === 'error' || event?.type === 'exit') {
    if (item.status === 'running') item.status = 'error';
    const fallback = event?.type === 'exit' && event?.code
      ? `İşlem çıkış kodu ${event.code}` : 'Bilinmeyen hata';
    item.error = String(event?.message || event?.stderr || fallback).trim().slice(0, 500);
  }
  item.recovered = false;
  const hasPending = snapshot.items.some((entry) => entry.status === 'pending');
  return queueSnapshotForDisk({ ...snapshot, currentQueueId: null,
    queueRunning: !!snapshot.queueRunning && hasPending });
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
  MAX_QUEUE_OPTIONS_BYTES,
  SECRET_OPTION_KEYS,
  clonePublicOptions,
  validateQueueOptions,
  mergeQueueSnapshotForSave,
  normalizeQueueItem,
  normalizeQueueSnapshot,
  queueSnapshotForDisk,
  updateQueueSnapshotRunning,
  updateQueueSnapshotTerminal,
};
