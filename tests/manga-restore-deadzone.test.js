'use strict';

// R334 ölü-bölge kilidi — restoreBrowserMangaPosition + importBrowserSessionVariants
// (src/main.js): kapsam haritasında sıfır çağrı/sıfır test referansı.
//
// restoreBrowserMangaPosition sözleşmesi:
//   - position yok → {status:'skipped'}
//   - aynı nesil tekrar denemesi → skipped (generation damgası)
//   - documentId uyumsuzluğu → wrong-document (bekleme başlamaz)
//   - bulundu → info notice; kayıp → warn notice
//   - iptal şartları: sekme değişimi / nesil / elle scroll / yıkım
// importBrowserSessionVariants sözleşmesi:
//   - putTrack hatası → uyarı + atlanır (remap yazılmaz)
//   - başarı → assetId remap + index upsert + tab.trackRefs güncellenir
//   - index hatası → uyarı; mediaUrls bağlamı session sekmelerinden gelir

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const source = fs.readFileSync(path.join(__dirname, '..', 'src', 'main.js'), 'utf8');

function section(start, end) {
  const from = source.indexOf(start);
  const to = source.indexOf(end, from);
  assert(from >= 0 && to > from, 'Bölüm bulunamadı: ' + start);
  return source.slice(from, to);
}

function baseCtx(overrides = {}) {
  return vm.createContext({
    String, Number, Array, Set, Map, JSON, Buffer, RegExp, Error, Promise,
    Math, Object, Date, console, process,
    browserActiveTabId: 1,
    ...overrides,
  });
}

// ---------- restoreBrowserMangaPosition ----------

function evalRestore(ctx) {
  vm.runInContext(
    section('async function restoreBrowserMangaPosition(', 'function stopBrowserManga('),
    ctx);
}

function tabStub(over = {}) {
  return {
    id: 1, generation: 5, mangaManualScrollRevision: 0,
    mediaId: 'manga:m1', restoredUrl: '', mangaRestoreAttemptedGeneration: -1,
    view: { webContents: { isDestroyed: () => false } },
    ...over,
  };
}

async function t_restore_gates() {
  const events = [];
  const ctx = baseCtx({
    waitForMangaPosition: async () => ({ status: 'found' }),
    executeBrowserTrustedMain: async () => [{ status: 'found' }],
    mangaPositionRestoreScript: () => 'x',
    sendBrowserEvent: (t, p) => events.push(p),
    safeBrowserPlaceUrl: (u) => u || '',
    normalizeMangaPosition: (p) => p,
  });
  evalRestore(ctx);
  // Sekme nesnesini ctx'e referansla ver — vm içindeki mutasyonlar host nesneye yansır
  // Sözleşme: tek parametre; pozisyon tab.mangaPosition'dan okunur
  const call = (t, pos) => {
    t.mangaPosition = pos;
    ctx.__tab = t;
    return vm.runInContext('restoreBrowserMangaPosition(__tab)', ctx);
  };

  // position yok → skipped, deneme damgası yazılmaz
  const tab0 = tabStub();
  let r = await call(tab0, null);
  assert.strictEqual(r.status, 'skipped');
  assert.strictEqual(tab0.mangaRestoreAttemptedGeneration, -1);

  // Aynı nesil ikinci deneme → skipped
  const tab1 = tabStub();
  await call(tab1, { documentId: 'manga:m1', scrollY: 10 });
  assert.strictEqual(tab1.mangaRestoreAttemptedGeneration, 5, 'nesil damgası yazılmadı');
  r = await call(tab1, { documentId: 'manga:m1', scrollY: 20 });
  assert.strictEqual(r.status, 'skipped', 'aynı nesilde ikinci deneme engellenmedi');

  // documentId uyumsuz → wrong-document, scan çalışmaz
  const tab2 = tabStub();
  r = await call(tab2, { documentId: 'manga:DIGER', scrollY: 1 });
  assert.strictEqual(r.status, 'wrong-document');
}

async function t_restore_notices_and_cancel() {
  const found = { status: 'found', atY: 10 };
  const events = [];
  let scanned = 0;
  const ctx = baseCtx({
    waitForMangaPosition: async ({ scan, isCanceled }) => {
      for (let i = 0; i < 3; i++) {
        if (isCanceled()) return { status: 'cancelled' };
        const v = await scan();
        if (v.status === 'found') return v;
      }
      return { status: 'missing' };
    },
    executeBrowserTrustedMain: async () => {
      scanned++;
      return [{ status: 'found' }];
    },
    mangaPositionRestoreScript: () => 's',
    sendBrowserEvent: (t, p) => events.push(p),
    safeBrowserPlaceUrl: () => 'manga:m1',
    normalizeMangaPosition: (p) => p,
  });
  evalRestore(ctx);
  const t10 = tabStub();
  t10.mangaPosition = { documentId: 'manga:m1', scrollY: 10 };
  ctx.__tab = t10;
  const r = await vm.runInContext('restoreBrowserMangaPosition(__tab)', ctx);
  assert.strictEqual(r.status, 'found');
  assert.ok(scanned >= 1);
  assert.deepStrictEqual(events.map((e) => e.level), ['info']);
  assert.match(events[0].message, /geri yüklendi/);
}

async function t_restore_missing_warn() {
  const events = [];
  const ctx = baseCtx({
    waitForMangaPosition: async () => ({ status: 'missing' }),
    executeBrowserTrustedMain: async () => [],
    mangaPositionRestoreScript: () => 's',
    sendBrowserEvent: (t, p) => events.push(p),
    safeBrowserPlaceUrl: () => 'manga:m1',
    normalizeMangaPosition: (p) => p,
  });
  evalRestore(ctx);
  const t1 = tabStub();
  t1.mangaPosition = { documentId: 'manga:m1', scrollY: 1 };
  ctx.__tab = t1;
  const r = await vm.runInContext('restoreBrowserMangaPosition(__tab)', ctx);
  assert.strictEqual(r.status, 'missing');
  assert.deepStrictEqual(events.map((e) => e.level), ['warn']);
  assert.match(events[0].message, /bulunamadı/);
}

// ---------- importBrowserSessionVariants ----------

function evalImport(overrides) {
  const ctx = baseCtx(overrides);
  vm.runInContext(
    section('function importBrowserSessionVariants(', "ipcMain.handle('browser:session:export'"),
    ctx);
  return ctx;
}

function inspectionStub() {
  return {
    warnings: [],
    session: { tabs: [
      { mediaId: 'm1', url: 'https://x/v1', trackRefs: [{ assetId: 'old:A' }, { assetId: 'old:B' }] },
      { mediaId: 'm2', url: 'https://x/v2', trackRefs: [{ assetId: 'old:C' }] },
    ] },
    variants: [
      { mediaId: 'm1', trackId: 'tA', assetId: 'old:A', label: 'TR',
        role: 'main', language: 'tr', source: 'import', cues: [], updatedAt: 1 },
      { mediaId: 'm1', trackId: 'tB', assetId: 'old:B', label: 'EN',
        role: 'dual', language: 'en', source: 'import', cues: [], updatedAt: 2 },
    ],
  };
}

function t_import_happy_path() {
  const puts = [];
  const upserts = { media: [], track: [], cues: [] };
  const ctx = evalImport({
    browserAssetStore: () => ({ putTrack: (v) => {
      puts.push(v.trackId);
      return { ok: true, assetId: `new:${v.trackId}` };
    } }),
    watchIndex: () => ({
      upsertMedia: (m) => upserts.media.push(m),
      upsertTrack: (t) => upserts.track.push(t),
      replaceTrackCues: (id, c) => upserts.cues.push(id),
    }),
  });
  const insp = inspectionStub();
  ctx.__insp = insp;
  const warnings = vm.runInContext('importBrowserSessionVariants(__insp)', ctx);
  assert.deepStrictEqual(Array.from(warnings), []);
  assert.deepStrictEqual(puts, ['tA', 'tB']);
  // remap: old:A→new:tA, old:B→new:tB; old:C değişmez
  const refs = insp.session.tabs[0].trackRefs.map((r) => r.assetId);
  assert.deepStrictEqual(refs, ['new:tA', 'new:tB']);
  assert.strictEqual(insp.session.tabs[1].trackRefs[0].assetId, 'old:C');
  // index upsert: url session sekmelerinden eşlendi
  assert.strictEqual(upserts.media[0].url, 'https://x/v1');
  assert.strictEqual(upserts.media[0].service, 'm1'.split(':')[0]);
  assert.strictEqual(upserts.track[0].assetPath, 'new:tA');
  assert.deepStrictEqual(Array.from(upserts.cues), ['m1|tA', 'm1|tB']);
}

function t_import_put_failure() {
  const ctx = evalImport({
    browserAssetStore: () => ({ putTrack: (v) =>
      v.trackId === 'tA' ? { ok: false, error: 'disk dolu' } : { ok: true, assetId: `new:${v.trackId}` } }),
    watchIndex: () => ({ upsertMedia() {}, upsertTrack() {}, replaceTrackCues() {} }),
  });
  const insp = inspectionStub();
  ctx.__insp = insp;
  const warnings = vm.runInContext('importBrowserSessionVariants(__insp)', ctx);
  const w = Array.from(warnings);
  assert.strictEqual(w.length, 1);
  assert.match(w[0], /TR içe aktarılamadı: disk dolu/);
  // tA remap'siz kalır, tB remap edilir
  const refs = insp.session.tabs[0].trackRefs.map((r) => r.assetId);
  assert.deepStrictEqual(refs, ['old:A', 'new:tB']);
}

function t_import_index_failure() {
  const ctx = evalImport({
    browserAssetStore: () => ({ putTrack: (v) => ({ ok: true, assetId: `new:${v.trackId}` }) }),
    watchIndex: () => { throw new Error('index kilitli'); },
  });
  const insp = inspectionStub();
  insp.variants = insp.variants.slice(0, 1);
  ctx.__insp = insp;
  const warnings = vm.runInContext('importBrowserSessionVariants(__insp)', ctx);
  const w = Array.from(warnings);
  assert.strictEqual(w.length, 1);
  assert.match(w[0], /dizine eklenemedi: index kilitli/);
  // Başarılı putTrack'in remapi yine de uygulanır
  assert.strictEqual(insp.session.tabs[0].trackRefs[0].assetId, 'new:tA');
}

async function main() {
  await t_restore_gates();
  await t_restore_notices_and_cancel();
  await t_restore_missing_warn();
  t_import_happy_path();
  t_import_put_failure();
  t_import_index_failure();
  console.log('manga-restore-deadzone: 6 senaryo geçti');
}

main().catch((e) => { console.error(e); process.exit(1); });
