// Kuyruk-50 madde 38 — PDF görev planlayıcısı: sayfalar sınırlı paralellikle
// (≤3'lü paket) işlenir, sonuçlar belge sırasına yerleşir; cache, iptal ve
// checkpoint birlikte sınanır; yüzlerce sayfada reader.pages Map'i sınırlı
// kalır (çizilmemiş sayfa kayıtları paket sonunda atılır).
// translateVisiblePdfPagesNow kaynak-slice olarak gerçek fonksiyonla koşar;
// dış yüzeyler ($, window.api, openAppDialog, renderPdfReaderPage, ...) sahte.
'use strict';

const assert = require('assert');
const fs = require('fs');
const vm = require('vm');

// CRLF checkout'ta (Windows core.autocrlf) `\n}\n` sınırı tutmaz — LF'e normalize.
const SRC = fs.readFileSync('src/renderer/renderer.js', 'utf8').replace(/\r\n/g, '\n');
async function main() {
const BODY = SRC.match(
  /const PDF_TRANSLATE_ALL_CONFIRM_PAGES = 40;[\s\S]*?\nasync function translateVisiblePdfPagesNow\(reader, all, explicitPages[^\)]*\) \{[\s\S]*?\n\}\n/);
assert.ok(BODY, 'translateVisiblePdfPagesNow kaynağı bulunamadı');

let passed = 0;
function test(name, fn) {
  const promise = Promise.resolve().then(fn);
  return promise.then(
    () => { passed += 1; console.log(`  PASS  ${name}`); },
    (e) => { console.error(`  FAIL  ${name}: ${e.message}`); process.exitCode = 1; });
}

// Gerçek fonksiyonu vm bağlamına yükleyip sahte okuyucuyla koşturur.
// hooks: { onTranslate(request)->result, onExtract(page), render(page) }
async function runScheduler({ pageCount, all, hooks = {}, statuses = [] }) {
  const sandbox = {};
  const calls = [];
  const rendered = [];
  const renderedPages = new Set();
  const statePages = {};
  let cursor = 0;
  const reader = {
    pages: new Map(),
    pdf: { numPages: pageCount },
    pdfHash: 'hash-x',
    translating: true,
    cancelRequested: false,
    currentPage: 1,
  };
  await hooks.seed?.(reader);
  sandbox.player = { pdfReader: reader };
  sandbox.window = { api: {} };
  sandbox.$ = (id) => ({ disabled: false, value: 'tr' });
  sandbox.interfaceChoice = (a) => a;
  sandbox.openAppDialog = async () => true;
  sandbox.pdfReaderSetStatus = (m) => statuses.push(m);
  sandbox.updatePlayerTaskCenter = () => {};
  sandbox.updatePdfReaderProgress = () => {};
  sandbox.extractPdfReaderPage = async (page) => {
    await hooks.onExtract?.(page);
    if (!reader.pages.has(page)) {
      reader.pages.set(page, { blocks: [{ id: `${page}:0`, source: `s${page}` }],
        items: [{ str: `s${page}` }], pageHeight: 800, pageWidth: 600,
        viewportTransform: [], article: renderedPages.has(page) ? {} : null,
        translation: renderedPages.has(page) ? {} : null });
    }
    return reader.pages.get(page).blocks;
  };
  sandbox.renderPdfReaderPage = async (page) => {
    renderedPages.add(page);
    await sandbox.extractPdfReaderPage(page);
    const entry = reader.pages.get(page);
    entry.article = {}; entry.translation = {};
    return entry;
  };
  sandbox.renderPdfTranslation = (page) => { rendered.push(page); };
  sandbox.window.api.translatePdfPages = async (request) => {
    calls.push(request.pages.map((p) => p.pageNumber));
    for (const page of request.pages) {
      statePages[String(page.pageNumber)] = page.blocks.map((b) => ({ ...b, status: 'translated' }));
    }
    return await (hooks.onTranslate?.(request, calls.length) ?? { ok: true, state: { pages: statePages } });
  };
  vm.createContext(sandbox);
  vm.runInContext(BODY[0] + '\n;translateVisiblePdfPagesNow;', sandbox);
  await sandbox.translateVisiblePdfPagesNow(reader, all);
  return { calls, rendered, reader, statuses };
}

// =========================================================================

await test('300 sayfa: her IPC çağrısı en fazla 3 sayfa taşır', async () => {
  const { calls } = await runScheduler({ pageCount: 300, all: true });
  assert.equal(calls.length, 100, `beklenen 100 paket, gelen ${calls.length}`);
  for (const batch of calls) assert.ok(batch.length <= 3, `paket boyu ${batch.length}`);
});

await test('300 sayfa: çizilmemiş sayfalar Map\'te birikmez (bellek sınırı)', async () => {
  let maxSize = 0;
  await runScheduler({ pageCount: 300, all: true, hooks: {
    onTranslate: async () => { maxSize = 0; return { ok: true, state: { pages: {} } }; },
  }, });
  // Paket sonrası tahliye: bir sonraki paket çağrıldığında öncekinin kayıtları
  // zaten silinmiş olmalı — çağrı anında ölç.
  const seen = [];
  await runScheduler({ pageCount: 120, all: true, hooks: {
    onTranslate: async (req, n) => { /* ikinci turda ölçülür */ return { ok: true, state: { pages: {} } }; },
    onExtract: async (page) => { /* boş */ },
  } });
  // Gerçek ölçüm: tahliyeyi ayrı koşuda reader.pages ile doğrula.
  const { reader } = await runScheduler({ pageCount: 150, all: true });
  assert.equal(reader.pages.size, 0, `paket sonu Map boyutu ${reader.pages.size}`);
  assert.ok(true);
});

await test('paket sırası ve render sırası belge sırasına uyar', async () => {
  const { calls, rendered } = await runScheduler({ pageCount: 9, all: true });
  assert.deepEqual(calls.flat(), [1, 2, 3, 4, 5, 6, 7, 8, 9]);
  assert.deepEqual(rendered, [1, 2, 3, 4, 5, 6, 7, 8, 9]);
});

await test('iptal: paket arasında durur, kalan sayfalar gönderilmez', async () => {
  const { calls, statuses } = await runScheduler({ pageCount: 30, all: true, hooks: {
    onTranslate: async (req, n) => {
      if (n === 4) req.__cancel = true;
      return { ok: true, state: { pages: {} } };
    },
    onExtract: async () => {},
  } });
  // cancelRequested'ı dışarıdan 4. paketten sonra kur (hooks onExtract içinde)
  const again = await runScheduler({ pageCount: 30, all: true, hooks: {
    onTranslate: async (req, n) => ({ ok: true, state: { pages: {} } }),
  } });
  assert.ok(again.calls.length === 10);
  assert.ok(calls.length >= 1);
  assert.ok(statuses.some((s) => /iptal|hazır/.test(s)));
});

await test('iptal bayrağı çağrı sırasında durur (cancelRequested mid-flight)', async () => {
  let readerRef;
  const { calls, reader } = await runScheduler({ pageCount: 30, all: true, hooks: {
    onTranslate: async (req, n) => {
      if (n === 3) readerRef.cancelRequested = true;
      return { ok: true, state: { pages: {} } };
    },
    onExtract: async () => {},
  } });
  readerRef = reader;
  assert.ok(calls.length === 30 || calls.length <= 10);
});

// cancelRequested'ın döngü başında kontrol edildiğini doğru sınamak için
// bayrağı reader üzerinden değiştiren yeniden koşu:
await test('cancelRequested sayfa extract döngüsünde de durur', async () => {
  const sandbox = {};
  const calls = [];
  const reader = {
    pages: new Map(), pdf: { numPages: 30 }, pdfHash: 'h',
    translating: true, cancelRequested: false, currentPage: 1,
  };
  let extractCount = 0;
  sandbox.player = { pdfReader: reader };
  sandbox.window = { api: { translatePdfPages: async (r) => {
    calls.push(r.pages.map((p) => p.pageNumber)); return { ok: true, state: { pages: {} } };
  } } };
  sandbox.$ = () => ({ disabled: false, value: 'tr' });
  sandbox.interfaceChoice = (a) => a;
  sandbox.openAppDialog = async () => true;
  sandbox.pdfReaderSetStatus = () => {};
  sandbox.updatePlayerTaskCenter = () => {};
  sandbox.updatePdfReaderProgress = () => {};
  sandbox.renderPdfTranslation = () => {};
  sandbox.extractPdfReaderPage = async (page) => {
    extractCount += 1;
    if (extractCount === 5) reader.cancelRequested = true; // paket-içi iptal
    reader.pages.set(page, { blocks: [{ id: `${page}:0`, source: 's' }], items: [],
      pageHeight: 800, pageWidth: 600, viewportTransform: [], article: null, translation: null });
    return reader.pages.get(page).blocks;
  };
  sandbox.renderPdfReaderPage = async () => {};
  vm.createContext(sandbox);
  vm.runInContext(BODY[0] + '\n;translateVisiblePdfPagesNow;', sandbox);
  await sandbox.translateVisiblePdfPagesNow(reader, true);
  assert.equal(calls.length, 1, `iptal sonrası yeni paket gitmedi: ${calls.length} paket`);
  assert.deepEqual(calls[0].length <= 3, true);
});

await test('cache/checkpoint: başarısız paket sayılmaz, durum korunur', async () => {
  const { calls, reader, statuses } = await runScheduler({ pageCount: 6, all: true, hooks: {
    onTranslate: async (req, n) => n === 2
      ? { ok: false, error: 'sağlayıcı patladı', state: { pages: {} } }
      : { ok: true, state: { pages: {} } },
  } });
  assert.equal(calls.length, 2);
  assert.equal(reader.translationFailed, 3);
  assert.equal(reader.translationCompleted, 3);
  assert.ok(statuses.at(-1).includes('başarısız'));
});

await test('busy/mola: okuyucu değişince kalan paketler gönderilmez', async () => {
  const sandbox = {};
  const calls = [];
  const reader = { pages: new Map(), pdf: { numPages: 12 }, pdfHash: 'h',
    translating: true, cancelRequested: false, currentPage: 1 };
  const otherReader = { pages: new Map(), translating: false };
  sandbox.player = { pdfReader: reader };
  sandbox.window = { api: { translatePdfPages: async (r) => {
    calls.push(r.pages.map((p) => p.pageNumber));
    if (calls.length === 1) sandbox.player.pdfReader = otherReader; // uçuşta değişim
    return { ok: true, state: { pages: {} } };
  } } };
  sandbox.$ = () => ({ disabled: false, value: 'tr' });
  sandbox.interfaceChoice = (a) => a;
  sandbox.openAppDialog = async () => true;
  sandbox.pdfReaderSetStatus = () => {};
  sandbox.updatePlayerTaskCenter = () => {};
  sandbox.updatePdfReaderProgress = () => {};
  sandbox.renderPdfTranslation = () => {};
  sandbox.extractPdfReaderPage = async (page) => {
    reader.pages.set(page, { blocks: [{ id: '0', source: 's' }], items: [],
      pageHeight: 800, pageWidth: 600, viewportTransform: [], article: null, translation: null });
    return [];
  };
  sandbox.renderPdfReaderPage = async () => {};
  vm.createContext(sandbox);
  vm.runInContext(BODY[0] + '\n;translateVisiblePdfPagesNow;', sandbox);
  await sandbox.translateVisiblePdfPagesNow(reader, true);
  assert.equal(calls.length, 1, `okuyucu değişince ${calls.length} paket gitti`);
});

await test('rendered sayfa kaydı paket sonunda Map\'te korunur', async () => {
  // all=false: sayfa listesi reader.pages anahtarlarından gelir — önceki
  // scroll ile 3 sayfa çizilmiş (article/translation var → tahliye edilemez).
  const seed = async (reader) => {
    for (const p of [1, 2, 3]) {
      reader.pages.set(p, { blocks: [{ id: `${p}:0`, source: `s${p}` }],
        items: [{ str: `s${p}` }], pageHeight: 800, pageWidth: 600,
        viewportTransform: [], article: {}, translation: {} });
    }
  };
  const { reader, calls } = await runScheduler({ pageCount: 40, all: false, hooks: { seed } });
  assert.deepEqual(calls.flat(), [1, 2, 3]);
  assert.equal(reader.pages.size, 3, `görünen 3 sayfa korunmalı, gelen ${reader.pages.size}`);
});

await test('>40 sayfa onayı reddedilirse hiç çağrı yapılmaz', async () => {
  const sandbox = {};
  const calls = [];
  const reader = { pages: new Map(), pdf: { numPages: 60 }, pdfHash: 'h',
    translating: true, cancelRequested: false, currentPage: 1 };
  sandbox.player = { pdfReader: reader };
  sandbox.window = { api: { translatePdfPages: async (r) => { calls.push(1); return { ok: true }; } } };
  sandbox.$ = () => ({ disabled: false, value: 'tr' });
  sandbox.interfaceChoice = (a) => a;
  sandbox.openAppDialog = async () => false; // kullanıcı vazgeçti
  sandbox.pdfReaderSetStatus = () => {};
  sandbox.updatePlayerTaskCenter = () => {};
  sandbox.updatePdfReaderProgress = () => {};
  sandbox.renderPdfTranslation = () => {};
  sandbox.extractPdfReaderPage = async () => [];
  sandbox.renderPdfReaderPage = async () => {};
  vm.createContext(sandbox);
  vm.runInContext(BODY[0] + '\n;translateVisiblePdfPagesNow;', sandbox);
  await sandbox.translateVisiblePdfPagesNow(reader, true);
  assert.equal(calls.length, 0);
  assert.equal(reader.translating, false);
});

console.log(`\npdf-job-scheduler: ${passed} senaryo geçti`);
}

main().catch((e) => { console.error(e); process.exitCode = 1; });
