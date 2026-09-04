'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { randomUUID } = require('node:crypto');

let fixturePath = '';

function cleanupFixture() {
  if (!fixturePath) return;
  fs.rmSync(fixturePath, { force: true });
  fixturePath = '';
}

const port = Number(process.argv[2] || 9333);
if (!Number.isSafeInteger(port) || port < 1 || port > 65535) {
  throw new Error('Geçerli bir DevTools portu gerekli.');
}

function withTimeout(promise, ms, label) {
  let timer;
  return Promise.race([
    promise,
    new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(`${label} zaman aşımına uğradı.`)), ms); }),
  ]).finally(() => clearTimeout(timer));
}

function minimalPdfBuffer() {
  const stream = 'BT /F1 18 Tf 40 100 Td (Merhaba PDF) Tj ET\n';
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 144] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    `<< /Length ${Buffer.byteLength(stream, 'ascii')} >>\nstream\n${stream}endstream`,
  ];
  let pdf = '%PDF-1.4\n';
  const offsets = [0];
  objects.forEach((body, index) => {
    offsets.push(Buffer.byteLength(pdf, 'ascii'));
    pdf += `${index + 1} 0 obj\n${body}\nendobj\n`;
  });
  const xref = Buffer.byteLength(pdf, 'ascii');
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  pdf += offsets.slice(1).map((offset) => `${String(offset).padStart(10, '0')} 00000 n \n`).join('');
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(pdf, 'ascii');
}

async function run() {
  fixturePath = path.join(os.tmpdir(), `whisper-local-smoke-${randomUUID()}.pdf`);
  const fixture = minimalPdfBuffer();
  fs.writeFileSync(fixturePath, fixture);
  const targets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
  const target = targets.find((entry) => entry.type === 'page'
    && /\/src\/renderer\/index\.html$/u.test(new URL(entry.url).pathname));
  assert.ok(target?.webSocketDebuggerUrl, 'Whisper Altyazı renderer hedefi bulunamadı.');

  const socket = new WebSocket(target.webSocketDebuggerUrl);
  await withTimeout(new Promise((resolve, reject) => {
    socket.addEventListener('open', resolve, { once: true });
    socket.addEventListener('error', reject, { once: true });
  }), 5000, 'DevTools bağlantısı');

  let sequence = 0;
  const pending = new Map();
  const eventWaiters = new Map();
  const exceptions = [];
  socket.addEventListener('message', (message) => {
    const payload = JSON.parse(String(message.data));
    if (payload.id && pending.has(payload.id)) {
      const { resolve, reject } = pending.get(payload.id);
      pending.delete(payload.id);
      if (payload.error) reject(new Error(payload.error.message)); else resolve(payload.result);
      return;
    }
    if (payload.method === 'Runtime.exceptionThrown') {
      const details = payload.params?.exceptionDetails || {};
      exceptions.push(details.exception?.description || details.text || 'Bilinmeyen renderer istisnası');
    }
    const waiters = eventWaiters.get(payload.method);
    if (waiters?.length) waiters.splice(0).forEach((resolve) => resolve(payload.params));
  });

  const call = (method, params = {}) => new Promise((resolve, reject) => {
    const id = ++sequence;
    pending.set(id, { resolve, reject });
    socket.send(JSON.stringify({ id, method, params }));
  });
  const onceEvent = (method) => withTimeout(new Promise((resolve) => {
    const waiters = eventWaiters.get(method) || [];
    waiters.push(resolve);
    eventWaiters.set(method, waiters);
  }), 10000, method);

  await call('Runtime.enable');
  await call('Page.enable');
  // Runtime.enable geçmiş oturumdaki istisnaları da teslim edebilir; yalnız bu
  // testin zorladığı temiz sayfa yüklemesini değerlendireceğiz.
  exceptions.length = 0;
  const loaded = onceEvent('Page.loadEventFired');
  await call('Page.reload', { ignoreCache: true });
  await loaded;
  await new Promise((resolve) => setTimeout(resolve, 800));

  const expression = `
    (async () => {
      const requiredIds = [
        'browserPageTranslate', 'browserPageTarget', 'browserPageMode', 'browserPageAuto',
        'browserPageRetryFailed', 'browserPageExport', 'browserPageClear',
        'pdfReaderOpen', 'pdfReader', 'pdfReaderPages', 'pdfReaderPage',
        'pdfTranslateVisible', 'pdfTranslateAll', 'pdfTranslateCancel', 'pdfExport'
      ];
      const missing = requiredIds.filter((id) => !document.getElementById(id));
      const pdfjs = await getPdfJs();
      const ipcOpen = await window.api.openPdf(${JSON.stringify(fixturePath)});
      let protocolFetch = { ok: false, status: 0, bytes: 0, error: '' };
      let protocolRange = { ok: false, status: 0, bytes: 0, prefix: '', error: '' };
      try {
        const response = await Promise.race([
          fetch(ipcOpen.fileUrl),
          new Promise((_, reject) => setTimeout(() => reject(new Error('protokol zaman aşımı')), 3000))
        ]);
        const body = await response.arrayBuffer();
        protocolFetch = { ok: response.ok, status: response.status, bytes: body.byteLength, error: '' };
      } catch (error) { protocolFetch.error = error.message; }
      try {
        const response = await fetch(ipcOpen.fileUrl, { headers: { Range: 'bytes=0-3' } });
        const body = new Uint8Array(await response.arrayBuffer());
        protocolRange = {
          ok: response.ok,
          status: response.status,
          bytes: body.byteLength,
          prefix: new TextDecoder('ascii').decode(body),
          error: ''
        };
      } catch (error) { protocolRange.error = error.message; }
      let readerOpenError = '';
      let openTimer;
      try {
        await Promise.race([
          openPdfReader(${JSON.stringify(fixturePath)}),
          // İlk PDF.js worker açılışı yazılım çizimli/soğuk Windows oturumlarında
          // birkaç saniye sürebilir. Ürün akışını erken kapatıp sahte bir
          // destroy-yarışı üretmemek için gerçek başlangıca makul pay bırak.
          new Promise((_, reject) => { openTimer = setTimeout(() => reject(new Error('zaman aşımı')), 30000); })
        ]);
      } catch (error) { readerOpenError = error.message; }
      finally { clearTimeout(openTimer); }
      const readerOpened = !!player.pdfReader;
      const readerPages = player.pdfReader?.pdf?.numPages || 0;
      const readerText = player.pdfReader?.pages?.get(1)?.blocks?.map((block) => block.source).join(' ').trim() || '';
      const readerCanvas = document.querySelector('#pdfReaderPages canvas');
      const readerCanvasReady = !!readerCanvas && readerCanvas.width > 0 && readerCanvas.height > 0;
      const readerRenderStage = player.pdfReader?.renderStage || '';
      const readerArticleState = document.querySelector('#pdfReaderPages .pdf-page')?.dataset?.state || '';
      document.getElementById('pdfReaderClose').click();
      const readerClosed = !player.pdfReader && document.getElementById('pdfReader').classList.contains('hidden');
      return {
        readyState: document.readyState,
        missing,
        pdfVersion: pdfjs.version,
        pdfWorker: pdfjs.GlobalWorkerOptions.workerSrc,
        pdfPages: readerPages,
        pdfText: readerText,
        ipcOpenOk: !!ipcOpen?.ok,
        ipcOpenError: ipcOpen?.error || '',
        protocolFetch,
        protocolRange,
        readerOpenError,
        readerOpened,
        readerPages,
        readerText,
        readerCanvasReady,
        readerRenderStage,
        readerArticleState,
        readerClosed,
        pageFunctions: [handleBrowserPageTranslationAction, applyBrowserPageTranslationState, setPdfReaderZoom]
          .every((fn) => typeof fn === 'function'),
        apiFunctions: ['startBrowserPageTranslation', 'toggleBrowserPageTranslation',
          'clearBrowserPageTranslation', 'retryBrowserPageTranslation', 'exportBrowserPageTranslation',
          'openPdf', 'translatePdfPages', 'cancelPdfTranslation', 'exportPdfTranslation']
          .every((name) => typeof window.api?.[name] === 'function')
      };
    })()
  `;
  const evaluation = await withTimeout(call('Runtime.evaluate', {
    expression,
    awaitPromise: true,
    returnByValue: true,
  }), 40000, 'Renderer smoke değerlendirmesi');
  if (evaluation.exceptionDetails) {
    throw new Error(evaluation.exceptionDetails.exception?.description || evaluation.exceptionDetails.text);
  }
  const result = evaluation.result?.value;
  if (exceptions.length) console.error('Renderer exceptions:', JSON.stringify(exceptions));
  console.log('Renderer result:', JSON.stringify(result));
  assert.equal(exceptions.length, 0, `Renderer başlangıç istisnaları: ${exceptions.join(' | ')}`);
  assert.equal(result?.readyState, 'complete');
  assert.deepEqual(result?.missing, []);
  assert.equal(result?.pdfVersion, '6.3.289');
  assert.match(result?.pdfWorker || '', /pdf\.worker\.min\.mjs$/u);
  assert.equal(result?.pdfPages, 1);
  assert.equal(result?.pdfText, 'Merhaba PDF');
  assert.equal(result?.ipcOpenOk, true, result?.ipcOpenError || 'PDF IPC açılışı başarısız.');
  assert.deepEqual(result?.protocolFetch, { ok: true, status: 200, bytes: fixture.length, error: '' });
  assert.deepEqual(result?.protocolRange, { ok: true, status: 206, bytes: 4, prefix: '%PDF', error: '' });
  assert.equal(result?.readerOpenError, '');
  assert.equal(result?.readerOpened, true);
  assert.equal(result?.readerPages, 1);
  assert.equal(result?.readerText, 'Merhaba PDF');
  assert.equal(result?.readerCanvasReady, true);
  assert.equal(result?.readerClosed, true);
  assert.equal(result?.pageFunctions, true);
  assert.equal(result?.apiFunctions, true);
  console.log('electron-renderer-smoke:', JSON.stringify(result));
  socket.close();
  cleanupFixture();
}

run().catch((error) => {
  cleanupFixture();
  console.error(error.stack || error.message);
  process.exit(1);
});
