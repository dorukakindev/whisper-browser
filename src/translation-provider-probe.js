'use strict';

const MAX_RESPONSE_BYTES = 64 * 1024;
const MODEL_FAILURE_RE = /(?:model[^\n]{0,80}(?:not found|unavailable|unsupported|invalid|does not exist)|unknown model|no available channel)/iu;

function isLoopbackEndpoint(endpoint) {
  try {
    const host = new URL(String(endpoint || '')).hostname.toLowerCase();
    return host === 'localhost' || host === '127.0.0.1' || host === '[::1]';
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

async function readLimitedText(response, limit = MAX_RESPONSE_BYTES) {
  const declared = Number(response?.headers?.get?.('content-length'));
  if (Number.isFinite(declared) && declared > limit) {
    await response.body?.cancel?.().catch(() => {});
    throw new RangeError('Provider response exceeds probe limit.');
  }
  if (response?.body?.getReader) {
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let bytes = 0;
    let text = '';
    try { while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > limit) {
        await reader.cancel().catch(() => {});
        throw new RangeError('Provider response exceeds probe limit.');
      }
      text += decoder.decode(value, { stream: true });
    }
    return text + decoder.decode();
    } finally { reader.releaseLock?.(); }
  }
  const buffer = await response.arrayBuffer();
  if (buffer.byteLength > limit) throw new RangeError('Provider response exceeds probe limit.');
  return new TextDecoder().decode(buffer);
}

async function listTranslationProviderModels({ endpoint, apiKey = '', fetchImpl = globalThis.fetch, timeoutMs = 15000 } = {}) {
  const key=String(apiKey||'').trim();
  if(!isSafeProbeEndpoint(endpoint)||(!key&&!isLoopbackEndpoint(endpoint))||key.length>10000||/[\u0000-\u001f\u007f]/u.test(key)||typeof fetchImpl!=='function')return {ok:false,code:'invalid_config',models:[]};
  const url=new URL(endpoint);
  // A model list must use the selected origin/path, never follow a redirect with credentials.
  if(url.search||url.hash)return {ok:false,code:'invalid_config',models:[]};
  url.pathname=url.pathname.replace(/\/+$/,'').replace(/\/chat\/completions$/i,'').replace(/\/models$/i,'')+'/models';
  const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),Math.max(1000,Math.min(30000,Number(timeoutMs)||15000)));
  timeout.unref?.();
  try{
    const response=await fetchImpl(url.href,{method:'GET',headers:{Accept:'application/json',...(key?{Authorization:`Bearer ${key}`}:{})},redirect:'error',signal:controller.signal});
    const body=await readLimitedText(response,512*1024);
    if(!response.ok)return {ok:false,code:classifyProbeFailure(response.status,body),status:response.status,models:[]};
    const payload=JSON.parse(body);
    if(!Array.isArray(payload.data))return {ok:false,code:'invalid_response',models:[]};
    const models=[...new Set(payload.data.slice(0,2000).map(row=>row?.id).filter(id=>typeof id==='string'&&id.trim()===id&&id.length>0&&id.length<=300&&!/[\u0000-\u001f\u007f]/u.test(id)&&!/^sk-/i.test(id)&&(!key||!id.includes(key))))].sort().slice(0,1000);
    return {ok:true,models,limited:payload.data.length>1000||!!payload.has_more};
  }catch(error){return {ok:false,code:controller.signal.aborted||error?.name==='AbortError'?'timeout':error instanceof SyntaxError||error instanceof RangeError?'invalid_response':'network',models:[]};}
  finally{clearTimeout(timeout);}
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
    catch (error) {
      await response.body?.cancel?.().catch(() => {});
      return { ok: false, code: controller.signal.aborted || error?.name === 'AbortError' ? 'timeout' : 'invalid_response', status: response.status, latencyMs: Math.max(0, Date.now()-startedAt) };
    }
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
  listTranslationProviderModels,
};
