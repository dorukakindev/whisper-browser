'use strict';

const fs = require('node:fs');
const path = require('node:path');

const ASSET_ROOT = path.join(__dirname, 'renderer', 'vendor', 'browser-ass');
const ASSETS = Object.freeze({
  'jassub.js': 'text/javascript; charset=utf-8',
  'worker.js': 'text/javascript; charset=utf-8',
  'jassub-worker.wasm': 'application/wasm',
  'jassub-worker-modern.wasm': 'application/wasm',
  'default.woff2': 'font/woff2',
});
const BASE = 'whisper-assets://ass/';
const REGISTERED_PROTOCOLS = new WeakSet();

function registerAssAssets(browserSession) {
  if (!browserSession?.protocol?.handle) throw new Error('ASS varlık protokolü kullanılamıyor.');
  if (REGISTERED_PROTOCOLS.has(browserSession.protocol)) return;
  browserSession.protocol.handle('whisper-assets', (request) => {
    let url;
    try { url = new URL(request.url); } catch { return new Response('Geçersiz adres.', { status: 400 }); }
    const name = url.pathname.slice(1);
    if (url.hostname !== 'ass' || !Object.hasOwn(ASSETS, name) || url.search || url.hash || !['GET', 'HEAD'].includes(request.method)) {
      return new Response('Varlık bulunamadı.', { status: 404 });
    }
    const file = path.join(ASSET_ROOT, name);
    try {
      const headers = {
        'Content-Type': ASSETS[name],
        'Access-Control-Allow-Origin': '*',
        'Cross-Origin-Resource-Policy': 'cross-origin',
        'Cache-Control': 'public, max-age=86400',
      };
      if (request.method === 'HEAD') return new Response(null, { headers });
      return new Response(fs.readFileSync(file), { headers });
    } catch {
      return new Response('ASS varlığı okunamadı.', { status: 500 });
    }
  });
  REGISTERED_PROTOCOLS.add(browserSession.protocol);
}

function serializeOperationId(operationId) {
  if (operationId === undefined) return 'undefined';
  if ((typeof operationId !== 'string' && typeof operationId !== 'number')
      || String(operationId).length > 120 || !String(operationId)) {
    throw new Error('ASS işlem kimliği geçersiz.');
  }
  return JSON.stringify(operationId);
}

function buildAssClearScript(operationId) {
  const expectedId = serializeOperationId(operationId);
  return `(() => {
    const previous = globalThis.__whisperAssState;
    if (!previous) return false;
    const expectedId = ${expectedId};
    if (expectedId !== undefined && previous.operationId !== expectedId) return false;
    previous.detach();
    return true;
  })()`;
}

function buildAssInstallScript(text, operationId, fonts = []) {
  if (typeof text !== 'string' || !text.trim() || text.length > 2 * 1024 * 1024) throw new Error('ASS altyazısı boş veya çok büyük.');
  const serialized = JSON.stringify(text);
  const serializedId = serializeOperationId(operationId);
  return `(async () => {
    ${buildAssClearScript()};
    const assText = ${serialized};
    const videos = [];
    const visit = (root) => {
      root.querySelectorAll?.('video').forEach(video => videos.push(video));
      root.querySelectorAll?.('*').forEach(element => { if (element.shadowRoot) visit(element.shadowRoot); });
    };
    visit(document);
    const video = videos.filter(v => {
      const r = v.getBoundingClientRect();
      return r.width >= 100 && r.height >= 60 && getComputedStyle(v).visibility !== 'hidden';
    }).sort((a, b) => {
      const x = a.getBoundingClientRect(), y = b.getBoundingClientRect();
      return y.width * y.height - x.width * x.height;
    })[0];
    if (!video) return { ok: false, error: 'Görünür video bulunamadı.' };
    const base = ${JSON.stringify(BASE)};
    const workerUrl = URL.createObjectURL(new Blob(['import ' + JSON.stringify(base + 'worker.js') + ';'], { type: 'text/javascript' }));
    const state = { video, canvas: null, workerUrl, renderer: null, observer: null, detach: null, operationId: ${serializedId} };
    globalThis.__whisperAssState = state;
    state.detach = () => {
      if (globalThis.__whisperAssState === state) globalThis.__whisperAssState = null;
      state.observer?.disconnect();
      state.video.removeEventListener('emptied', state.detach);
      globalThis.removeEventListener('pagehide', state.detach);
      state.renderer?.destroy()?.catch?.(() => {});
      URL.revokeObjectURL(state.workerUrl);
      state.canvas?.remove();
    };
    video.addEventListener('emptied', state.detach, { once: true });
    globalThis.addEventListener('pagehide', state.detach, { once: true });
    state.observer = new MutationObserver(() => { if (!video.isConnected) state.detach(); });
    state.observer.observe(document, { childList: true, subtree: true });
    const videoRoot = video.getRootNode();
    if (videoRoot !== document) state.observer.observe(videoRoot, { childList: true, subtree: true });
    try {
      const { default: JASSUB } = await import(base + 'jassub.js');
      if (globalThis.__whisperAssState !== state) { state.detach(); return { ok: false, error: 'ASS yükleme iptal edildi.' }; }
      state.renderer = new JASSUB({ video, subContent: assText, workerUrl,
        wasmUrl: base + 'jassub-worker.wasm', modernWasmUrl: base + 'jassub-worker-modern.wasm',
        fonts: ${JSON.stringify(fonts.map(font => font.base64))}.map(value => Uint8Array.from(atob(value), ch => ch.charCodeAt(0))),
        availableFonts: { 'liberation sans': base + 'default.woff2' }, queryFonts: false });
      state.canvas = state.renderer._canvas;
      state.canvas.style.zIndex = '2147483646';
      await state.renderer.ready;
      if (globalThis.__whisperAssState !== state) { state.detach(); return { ok: false, error: 'ASS yükleme iptal edildi.' }; }
      await state.renderer.resize(true);
      await state.renderer.manualRender({ mediaTime: video.currentTime, expectedDisplayTime: performance.now(), width: video.videoWidth, height: video.videoHeight }, true);
      if (globalThis.__whisperAssState !== state) { state.detach(); return { ok: false, error: 'ASS yükleme iptal edildi.' }; }
      return { ok: true, videoWidth: video.videoWidth, videoHeight: video.videoHeight };
    } catch (error) {
      state.detach();
      return { ok: false, error: 'ASS görünümü yüklenemedi: ' + String(error?.message || error) };
    }
  })()`;
}

module.exports = { registerAssAssets, buildAssInstallScript, buildAssClearScript };
