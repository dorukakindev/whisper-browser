let acquisitionSequence = 0;
const BROWSER_IPC_VERSION = 1;

function cleanString(value, max = 240) {
  return String(value == null ? '' : value).trim().slice(0, max);
}

function normalizeBrowserEventContext(raw = {}) {
  return {
    tabId: cleanString(raw.tabId, 128),
    generation: Math.max(0, Math.trunc(Number(raw.generation) || 0)),
    mediaId: cleanString(raw.mediaId, 240),
    acquisitionId: cleanString(raw.acquisitionId, 160),
    operationId: cleanString(raw.operationId, 160),
  };
}

function nextAcquisitionId(prefix = 'capture') {
  acquisitionSequence = (acquisitionSequence + 1) % Number.MAX_SAFE_INTEGER;
  const safePrefix = cleanString(prefix, 32).replace(/[^a-z0-9_-]/gi, '-') || 'capture';
  return `${safePrefix}-${Date.now().toString(36)}-${acquisitionSequence.toString(36)}`;
}

function createBrowserEventEnvelope(type, context = {}, payload = {}, at = Date.now()) {
  const normalized = normalizeBrowserEventContext(context);
  return {
    version: BROWSER_IPC_VERSION,
    type: cleanString(type, 96),
    ...normalized,
    at: Number.isFinite(Number(at)) ? Number(at) : Date.now(),
    payload: payload && typeof payload === 'object' ? payload : { value: payload },
  };
}

function browserEventMatches(event, current, options = {}) {
  if (!event || !current) return false;
  // Eski üreticiler sürüm alanı göndermeyebilir; açıkça desteklenmeyen bir
  // sürüm geldiğinde olayın yeni renderer durumunu kirletmesine izin verme.
  if (event.version != null && Number(event.version) !== BROWSER_IPC_VERSION) return false;
  const left = normalizeBrowserEventContext(event);
  const right = normalizeBrowserEventContext(current);
  if (!left.tabId || left.tabId !== right.tabId) return false;
  if (left.generation !== right.generation) return false;
  if (right.mediaId && left.mediaId !== right.mediaId) return false;
  if (right.acquisitionId && left.acquisitionId !== right.acquisitionId) return false;
  if (right.operationId && left.operationId !== right.operationId) return false;
  if (options.requireMediaId && !left.mediaId) return false;
  if (options.requireAcquisitionId && !left.acquisitionId) return false;
  return true;
}

module.exports = {
  BROWSER_IPC_VERSION,
  browserEventMatches,
  createBrowserEventEnvelope,
  nextAcquisitionId,
  normalizeBrowserEventContext,
};
