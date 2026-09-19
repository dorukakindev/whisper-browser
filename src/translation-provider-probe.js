'use strict';

const MAX_RESPONSE_BYTES = 64 * 1024;
const MODEL_FAILURE_RE = /(?:model[^\n]{0,80}(?:not found|unavailable|unsupported|invalid|does not exist)|unknown model|no available channel)/iu;

function isLoopbackEndpoint(endpoint) {
  try {
    const host = new URL(String(endpoint || '')).hostname.toLowerCase();
    return host === 'localhost' || host === '127.0.0.1' || host === '::1';
  } catch (_) {
    return false;
  }
}

function isSafeProbeEndpoint(endpoint) {
  try {
    const url = new URL(String(endpoint || ''));
    if (url.username || url.password) return false;
    return url.protocol === 'https:' || (url.protocol === 'http:' && isLoopbackEndpoint(url.href));
  } catch (_) {
    return false;
  }
}

function classifyProbeFailure(status, detail = '') {
  const text = String(detail || '').slice(0, MAX_RESPONSE_BYTES);
  if (MODEL_FAILURE_RE.test(text)) return 'model_unavailable';
  if (status === 401 || status === 403) return 'authentication';
  if (status === 404) return 'endpoint_not_found';
  if (status === 408 || status === 504) return 'timeout';
  if (status === 429) return 'rate_limit';
  if (status >= 500) return 'provider_unavailable';
  return 'request_rejected';
}

function completionText(payload) {
  const content = payload?.choices?.[0]?.message?.content;
  if (typeof content === 'string') return content.trim();
  if (Array.isArray(content)) {
    return content.map((part) => typeof part?.text === 'string' ? part.text : '').join('').trim();
  }
  if (typeof payload?.output_text === 'string') return payload.output_text.trim();
  if (typeof payload?.response === 'string') return payload.response.trim();
  return '';
}

async function readLimitedText(response) {
  const declared = Number(response?.headers?.get?.('content-length'));
  if (Number.isFinite(declared) && declared > MAX_RESPONSE_BYTES) {
    throw new RangeError('Provider response exceeds probe limit.');
  }
  if (response?.body?.getReader) {
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let bytes = 0;
    let text = '';
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > MAX_RESPONSE_BYTES) {
        await reader.cancel().catch(() => {});
        throw new RangeError('Provider response exceeds probe limit.');
      }
      text += decoder.decode(value, { stream: true });
    }
    return text + decoder.decode();
  }
  const buffer = await response.arrayBuffer();
  if (buffer.byteLength > MAX_RESPONSE_BYTES) throw new RangeError('Provider response exceeds probe limit.');
  return new TextDecoder().decode(buffer);
}

async function probeTranslationProvider({
  endpoint,
  apiKey = '',
  model,
  fetchImpl = globalThis.fetch,
  timeoutMs = 15000,
} = {}) {
  const safeEndpoint = String(endpoint || '').trim();
  const safeModel = String(model || '').normalize('NFC').trim();
  const safeKey = String(apiKey || '').trim();
  if (!isSafeProbeEndpoint(safeEndpoint) || !safeModel || safeModel.length > 300
      || /[\u0000-\u001f\u007f]/u.test(safeModel)
      || (!safeKey && !isLoopbackEndpoint(safeEndpoint)) || typeof fetchImpl !== 'function') {
    return { ok: false, code: 'invalid_config', status: 0, latencyMs: 0 };
  }

  const controller = new AbortController();
  const startedAt = Date.now();
  const timeout = setTimeout(() => controller.abort(), Math.max(1000, Math.min(30000, Number(timeoutMs) || 15000)));
  timeout.unref?.();
  try {
    const headers = { 'Content-Type': 'application/json', Accept: 'application/json' };
    if (safeKey) headers.Authorization = `Bearer ${safeKey}`;
    const response = await fetchImpl(safeEndpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        model: safeModel,
        messages: [{ role: 'user', content: 'Reply with exactly OK.' }],
      }),
      redirect: 'error',
      signal: controller.signal,
    });
    const latencyMs = Math.max(0, Date.now() - startedAt);
    let text;
    try { text = await readLimitedText(response); }
    catch (_) { return { ok: false, code: 'invalid_response', status: response.status, latencyMs }; }
    if (!response.ok) {
      return { ok: false, code: classifyProbeFailure(response.status, text), status: response.status, latencyMs };
    }
    let payload;
    try { payload = JSON.parse(text); }
    catch (_) { return { ok: false, code: 'invalid_response', status: response.status, latencyMs }; }
    if (!completionText(payload)) {
      return { ok: false, code: 'invalid_response', status: response.status, latencyMs };
    }
    return { ok: true, code: 'ok', status: response.status, latencyMs };
  } catch (error) {
    const latencyMs = Math.max(0, Date.now() - startedAt);
    if (controller.signal.aborted || error?.name === 'AbortError') {
      return { ok: false, code: 'timeout', status: 0, latencyMs };
    }
    return { ok: false, code: 'network', status: 0, latencyMs };
  } finally {
    clearTimeout(timeout);
  }
}

module.exports = {
  MAX_RESPONSE_BYTES,
  classifyProbeFailure,
  completionText,
  isLoopbackEndpoint,
  isSafeProbeEndpoint,
  probeTranslationProvider,
};
