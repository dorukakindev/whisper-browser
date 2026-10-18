// R334 devamı — saf-Node modüllerde kilitlenmemiş export fonksiyonları.
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const assert = require('assert');
const { spawn } = require('child_process');

const pairq = require('../src/subtitle-pair-quality');
const prov = require('../src/browser-capture-provenance');
const ytacct = require('../src/youtube-accounts');
const zoom = require('../src/browser-site-zoom');
const mediaId = require('../src/browser-media-identity');
const wlstate = require('../src/watch-library-state');
const libtools = require('../src/browser-library-tools');
const fsyncu = require('../src/fsync-utils');
const assetStore = require('../src/browser-asset-store');
const subOut = require('../src/browser-subtitle-output');
const burnin = require('../src/burnin-output');
const exportVal = require('../src/subtitle-export-validation');
const workspace = require('../src/workspace-package');
const modelMgr = require('../src/model-manager');
const watchFolder = require('../src/watch-folder');
const terminology = require('../src/browser-terminology');
const research = require('../src/browser-research-notebook');
const adapterReg = require('../src/browser-adapter-registry');
const acquisition = require('../src/browser-acquisition');
const siteTerm = require('../src/browser-site-terminology');
const navPolicy = require('../src/browser-navigation-policy');
const sessionPkg = require('../src/browser-session-package');
const manga = require('../src/browser-manga');
const pageIndex = require('../src/browser-page-index');
const seriesCtx = require('../src/browser-series-context');
const ytdlp = require('../src/ytdlp-runtime');
const manifest = require('../src/manifest-transactions');
const pipeline = require('../src/pipeline-job');
const discovery = require('../src/catalog-discovery');
const soak = require('../src/resource-soak');

const results = [];
async function t(name, fn) {
  try { await fn(); results.push([name, 'PASS']); }
  catch (e) { results.push([name, `FAIL ${e.message}`]); console.log('FAIL', name, e); }
}

async function t_pair_quality() {
  // alignByTimestamp: timestampKey eşleşmesi → matched/missing/extra
  const r = pairq.alignByTimestamp(
    [{ start: 1, end: 2 }, { start: 3, end: 4 }, { start: 5, end: 6 }],
    [{ start: 1, end: 2, text: 'A' }, { start: 3, end: 4, text: 'B' }, { start: 9, end: 10, text: 'X' }]);
  assert.strictEqual(r.matched.length, 2);
  assert.strictEqual(r.missing.length, 1);
  assert.strictEqual(r.extra.length, 1);
  assert.strictEqual(r.extra[0].text, 'X');
  // alignByOverlap: eşik altı örtüşme eşleşmez
  const o = pairq.alignByOverlap(
    [{ start: 0, end: 2 }, { start: 10, end: 12 }],
    [{ start: 0.5, end: 2.5 }, { start: 10, end: 10.1 }]);
  assert.strictEqual(o.coveredSource.length, 1, 'yalnız eşik-üstü örtüşme eşleşir');
  assert.strictEqual(o.coveredSource[0].overlaps[0].seconds, 1.5);
  assert.strictEqual(o.missing.length, 1);
  assert.strictEqual(o.extra.length, 1);
}

async function t_coverage_ranges() {
  // beklenen [0,10], kaplanan [2,8] → eksik [0,2],[8,10]
  const miss = prov.subtractCoverageRanges([{ start: 0, end: 10 }], [{ start: 2, end: 8 }]);
  assert.deepStrictEqual(miss.map((m) => [Math.round(m.start), Math.round(m.end)]), [[0, 2], [8, 10]]);
  assert.deepStrictEqual(prov.subtractCoverageRanges([{ start: 0, end: 10 }], [{ start: 0, end: 10 }]), []);
  const none = prov.subtractCoverageRanges([{ start: 0, end: 10 }], []);
  assert.strictEqual(none.length, 1);
  // tolerans: 0.04'lik boşluk toleransın (0.05) altında → birleşik
  const tol = prov.subtractCoverageRanges([{ start: 0, end: 1 }], [{ start: 0.5, end: 1.04 }]);
  assert.deepStrictEqual(tol.length, 1);
  assert.ok(tol[0].end <= 0.5 + 0.05);
}

async function t_yt_accounts() {
  assert.strictEqual(ytacct.sanitizeAccount(null), null);
  assert.strictEqual(ytacct.sanitizeAccount({}), null, 'iki token da yok → null');
  const a = ytacct.sanitizeAccount({ refreshToken: 'r', userName: '  Ad  ', authMode: 'tv', ephemeral: 1 });
  assert.strictEqual(a.authMode, 'tv');
  assert.strictEqual(a.ephemeral, true);
  const b = ytacct.sanitizeAccount({ accessToken: 'x', authMode: 'bogus' });
  assert.strictEqual(b.authMode, 'custom');
  assert.strictEqual(ytacct.accountIdFor('  A@B.COM ', ''), 'a@b.com');
  assert.strictEqual(ytacct.accountIdFor('', '  Kullanıcı '), 'kullanıcı');
  assert.strictEqual(ytacct.accountIdFor('', '', 'ch_42'), 'acct-ch_42');
  assert.strictEqual(ytacct.accountIdFor('', '', ''), 'acct-unknown');
}

async function t_zoom_and_identity() {
  assert.strictEqual(zoom.browserZoomHost('https://WWW.Ex.com/p'), 'www.ex.com');
  assert.strictEqual(zoom.browserZoomHost('not a url'), '');
  assert.strictEqual(zoom.browserZoomHost('http://[::1]:8'), '[::1]');
  const U = (u) => new URL(u);
  assert.deepStrictEqual(mediaId.serviceIdentity(U('https://youtu.be/abcDEF12345')), { service: 'youtube', contentId: 'abcDEF12345' });
  assert.deepStrictEqual(mediaId.serviceIdentity(U('https://www.youtube.com/watch?v=xyz789'), {}), { service: 'youtube', contentId: 'xyz789' });
  assert.strictEqual(mediaId.serviceIdentity(U('https://www.youtube.com/shorts/sID12345678')).contentId, 'sID12345678');
  assert.strictEqual(mediaId.serviceIdentity(U('https://www.youtube.com/clip/cLp')).contentId, 'clip:cLp');
  assert.deepStrictEqual(mediaId.serviceIdentity(U('https://x.com/a'), { service: 'Myco', contentId: 'id9' }), { service: 'myco', contentId: 'id9' });
  assert.strictEqual(mediaId.stableUrlHash('x'), mediaId.stableUrlHash('x'));
  assert.match(mediaId.stableUrlHash('x'), /^[0-9a-f]{24}$/);
}

async function t_watch_state() {
  const pub = wlstate.publicWatchItem({ key: 'k', _createdRevision: 3, _fieldRevisions: { a: 1 }, title: 'T' });
  assert.strictEqual(pub._createdRevision, undefined);
  assert.strictEqual(pub._fieldRevisions, undefined);
  assert.strictEqual(pub.key, 'k');
  const bad = wlstate.replaceWatchLibraryItems({}, 'degil');
  assert.strictEqual(bad.result.ok, false);
  const r = wlstate.replaceWatchLibraryItems({ revision: 5, items: [] }, [
    { key: 'file:/a', lastWatched: 1 }, { key: 'file:/b', lastWatched: 9 }, { key: 'file:/a' }, { nokey: 1 },
  ], { now: 1000 });
  assert.strictEqual(r.result.ok ?? true, true);
  assert.strictEqual(r.document.items.length, 2, 'dedupe + geçersiz elenir');
  assert.strictEqual(r.document.items[0].key, 'file:/b', 'lastWatched sıralaması');
  assert.strictEqual(r.document.revision, 6);
  assert.deepStrictEqual(r.document.tombstones, []);
}

async function t_lib_tools() {
  assert.deepStrictEqual(libtools.collectionNames([
    { collections: ['B', '  A  '] }, { collections: ['B', 'C'] }, {},
  ]), ['A', 'B', 'C']);
  assert.strictEqual(libtools.normalizeCollectionName('  a   b  '), 'a b');
  assert.strictEqual(libtools.normalizeCollectionName('x'.repeat(200)).length, 80);
  assert.strictEqual(libtools.normalizeSearchScope('bogus'), 'all');
  assert.strictEqual(libtools.normalizeSearchScope('TABS'), 'tabs');
  const script = libtools.mangaPositionCaptureScript('doc"inj');
  assert.ok(script.includes('doc\\"inj'), 'documentId JSON-kaçışlı');
  assert.ok(script.includes('data-whisper-manga-id'));
}

async function t_fsync_and_time() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wb-fs-'));
  const fp = path.join(dir, 'f.txt');
  fs.writeFileSync(fp, 'x');
  fsyncu.fsyncFile(fp); // gerçek dosya — istisna atmaz
  // best-effort yutar
  const eperm = Object.assign(new Error('nope'), { code: 'EPERM' });
  const badIo = { openSync: () => { throw eperm; } };
  fsyncu.fsyncFileBestEffort(fp, badIo); // atmaz
  assert.throws(() => fsyncu.fsyncFile(fp, badIo), /nope/);
  // zaman formatlayıcılar
  assert.strictEqual(assetStore.srtTime(3661.5), '01:01:01,500');
  assert.strictEqual(assetStore.srtTime(-5), '00:00:00,000');
  assert.strictEqual(assetStore.srtTime(NaN), '00:00:00,000');
  assert.strictEqual(subOut.assTime(1.5), '0:00:01.50');
  assert.strictEqual(subOut.assTime(3661.255), '1:01:01.26', 'centisecond yuvarlama');
  assert.throws(() => subOut.assTime(NaN), TypeError);
  fs.rmSync(dir, { recursive: true, force: true });
}

async function t_burnin_and_format() {
  assert.strictEqual(burnin.burninRecoveryVersionTooNew({ version: 9999 }), true);
  assert.strictEqual(burnin.burninRecoveryVersionTooNew({ version: 1 }), false);
  assert.strictEqual(burnin.burninRecoveryVersionTooNew(null), false);
  assert.strictEqual(burnin.burninRecoveryVersionTooNew([]), false);
  // backup temizliği: desen eşleşenler silinir, diğerleri kalır
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wb-burn-'));
  const out = path.join(dir, 'out.mp4');
  fs.writeFileSync(`${out}.abc123.replace-backup`, 'b');
  fs.writeFileSync(`${out}.keep`, 'k');
  burnin.cleanupBurninReplacementBackups(out);
  assert.strictEqual(fs.existsSync(`${out}.abc123.replace-backup`), false);
  assert.strictEqual(fs.existsSync(`${out}.keep`), true);
  fs.rmSync(dir, { recursive: true, force: true });
  assert.strictEqual(exportVal.expectedFormat('/a/b.VTT'), 'vtt');
  assert.strictEqual(exportVal.expectedFormat('/a/b.SSA'), 'ass');
  assert.strictEqual(exportVal.expectedFormat('/a/b'), 'srt');
}

async function t_workspace_and_model() {
  const ok = workspace.storageValues({ subtitleStyle: '{"a":1}', subtitlePos: '[2]', junk: 'x' });
  assert.deepStrictEqual(ok, { subtitleStyle: '{"a":1}', subtitlePos: '[2]' });
  assert.throws(() => workspace.storageValues({ subtitleStyle: 'x'.repeat(8e6 + 1) }), /çok büyük/);
  assert.throws(() => workspace.storageValues({ subtitleStyle: '{bozuk' }), SyntaxError);
  assert.deepStrictEqual(workspace.storageValues({ subtitleStyle: 42 }), {}, 'string olmayan elenir');
  // model-manager: gerçek dizin ölçümü
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wb-mm-'));
  fs.writeFileSync(path.join(dir, 'a.bin'), Buffer.alloc(100));
  fs.mkdirSync(path.join(dir, 'snapshots', 'h'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'snapshots', 'h', 'b.bin'), Buffer.alloc(50));
  assert.strictEqual(modelMgr.directorySizeBytes(dir), 150);
  assert.strictEqual(modelMgr.directorySizeBytes('/yok/boyle'), 0);
  fs.rmSync(dir, { recursive: true, force: true });
}

async function t_watch_folder_and_terms() {
  const { names, outputDir, stem } = watchFolder.watchOutputNames('/v/Film.mp4', { formats: ['srt'], translateTo: 'de' });
  assert.strictEqual(stem, 'Film');
  assert.strictEqual(outputDir, '/v');
  for (const n of ['Film.srt', 'Film.dual.srt', 'Film.ceviri.srt', 'Film.tr.srt', 'Film.en.srt', 'Film.de.srt'])
    assert.ok(names.includes(n), n);
  // terminoloji kırpması: sayı desc, bütçe sınırı
  const map = {
    maxTerms: 2, maxChars: 1000,
    terms: new Map([
      ['a', { source: 'a', target: 'A', count: 1 }],
      ['b', { source: 'b', target: 'B', count: 9 }],
      ['c', { source: 'c', target: 'C', count: 5 }],
    ]),
  };
  const trimmed = terminology.trimTerminologyMap(map);
  assert.strictEqual(trimmed.terms.size, 2);
  assert.ok(trimmed.terms.has('b') && trimmed.terms.has('c'), 'yüksek sayımdakiler kalır');
}

async function t_research_and_adapters() {
  const rs = research.normalizeReviewState({ ease: 99, reviewCount: 3, dueAt: 0 }, 555);
  assert.strictEqual(rs.ease, 3);
  assert.strictEqual(rs.dueAt, 555, 'reviewCount>0 + dueAt 0 → now');
  const fresh = research.normalizeReviewState({}, 555);
  assert.strictEqual(fresh.dueAt, 0, 'reviewCount 0 → dueAt 0');
  assert.strictEqual(fresh.ease, 2.5);
  const ad = adapterReg.normalizeAdapter({ id: 'My-Site', capabilities: { dualTrack: true } });
  assert.strictEqual(ad.id, 'my-site');
  assert.strictEqual(ad.capabilities.dualTrack, true);
  assert.strictEqual(ad.capabilities.translation, true, 'default true');
  assert.strictEqual(ad.capabilities.fullscreen, false, 'default false');
  assert.throws(() => adapterReg.normalizeAdapter({ id: '!!' }), /kimliği/);
  assert.strictEqual(acquisition.normalizeCapabilities({}).networkCapture, true);
  assert.strictEqual(acquisition.normalizeCapabilities({}).liveAsr, false);
  assert.strictEqual(acquisition.normalizeCapabilities({ networkCapture: false }).networkCapture, false);
}

async function t_site_term_and_nav() {
  const rows = siteTerm.normalizeSiteTermRows([
    { source: 'A', target: 'x', count: 1 },
    { source: 'a', target: 'y' },       // kaynak dedupe (NFC+tr casefold)
    { source: '', target: 'z' },        // boş → atlanır
    { source: 'B' },                    // hedef yok → atlanır
    { source: 'C', target: 'w', count: 99999 },
  ]);
  assert.strictEqual(rows.length, 2);
  assert.strictEqual(rows[0].count, 2, 'count alt sınırı 2');
  assert.strictEqual(rows[1].count, 9999, 'count üst sınırı');
  assert.strictEqual(navPolicy.urlOriginRelation('', {}), 'no-opener');
  assert.strictEqual(navPolicy.urlOriginRelation('https://a.com', { ok: true, protocol: 'https:', origin: 'https://a.com' }), 'same-origin');
  assert.strictEqual(navPolicy.urlOriginRelation('https://a.com', { ok: true, protocol: 'https:', origin: 'https://b.com' }), 'cross-origin');
  assert.strictEqual(navPolicy.urlOriginRelation('javascript:x', { ok: true, protocol: 'https:', origin: 'o' }), 'opaque-or-invalid');
}

async function t_session_pkg_and_manga() {
  assert.strictEqual(sessionPkg.sanitizeVariant({}), null);
  const v = sessionPkg.sanitizeVariant({
    mediaId: 'm', trackId: 't', cues: [{ start: 0, end: 1, text: 'x' }],
    role: 'bogus', source: 'bogus', sourceHash: 'ZZaa11!!',
  });
  assert.strictEqual(v.role, 'source');
  assert.strictEqual(v.source, 'manual');
  assert.strictEqual(v.sourceHash, 'aa11');
  // manga önbellek anahtarı: deterministik + glossary/dil duyarlı
  const buf = Buffer.from('img');
  const k1 = manga.legacyMangaCacheKey(buf, { targetLanguage: 'tr' });
  const k2 = manga.legacyMangaCacheKey(buf, { targetLanguage: 'tr' });
  assert.strictEqual(k1, k2);
  assert.notStrictEqual(manga.legacyMangaCacheKey(buf, { targetLanguage: 'en' }), k1);
  assert.match(k1, /^[0-9a-f]{64}$/);
  assert.ok(manga.mangaVisibilityScript(true).includes('state.visible = true'));
  assert.ok(manga.mangaVisibilityScript(false).includes('state.visible = false'));
}

async function t_page_index_and_series() {
  const base = { tab: { view: 'V', generation: 1 }, view: 'V', webContents: { isDestroyed: () => false }, tabGeneration: 1, indexGeneration: 2, isEnabled: () => true, currentIndexGeneration: () => 2 };
  assert.strictEqual(pageIndex.pageIndexCaptureIsCurrent(base), true);
  assert.strictEqual(pageIndex.pageIndexCaptureIsCurrent({ ...base, isEnabled: () => false }), false);
  assert.strictEqual(pageIndex.pageIndexCaptureIsCurrent({ ...base, indexGeneration: 9 }), false);
  assert.strictEqual(pageIndex.pageIndexCaptureIsCurrent({ ...base, webContents: { isDestroyed: () => true } }), false);
  assert.strictEqual(pageIndex.pageIndexCaptureIsCurrent({ ...base, tab: { view: 'V', generation: 7 } }), false, 'tab nesli uyuşmazlığı');
  // series profile
  assert.throws(() => seriesCtx.profileOf([1]), /geçersiz/);
  const p = seriesCtx.profileOf({ synopsis: ' s ', terms: [{ source: 'A', target: 'x' }, { source: 'a', target: 'y' }, { source: 'b' }] });
  assert.strictEqual(p.terms.length, 1, 'kaynak dedupe + eksik alan elenir');
  assert.strictEqual(p.terms[0].target, 'x');
}

async function t_runtime_and_manifest() {
  assert.strictEqual(ytdlp.runtimeRoot('/u/data'), path.join('/u/data', 'yt-dlp-runtime'));
  // headerValue: Headers-benzeri + düz nesne + büyük/küçük harf
  assert.strictEqual(manifest.headerValue({ get: (n) => n === 'etag' ? 'E1' : null }, 'etag'), 'E1');
  assert.strictEqual(manifest.headerValue({ ETag: 'E2', 'Last-Modified': 'L' }, 'etag'), 'E2');
  assert.strictEqual(manifest.headerValue({ 'x': 1 }, 'yok'), '');
  assert.strictEqual(manifest.headerValue(null, 'x'), '');
}

async function t_pipeline_and_discovery() {
  const done = spawn(process.execPath, ['-e', '']);
  await new Promise((r) => done.on('close', r));
  assert.strictEqual(await pipeline.waitForChildClose(done, 100), true, 'çıkmış çocuk → true');
  const slow = spawn(process.execPath, ['-e', 'setTimeout(() => {}, 5000)']);
  try {
    assert.strictEqual(await pipeline.waitForChildClose(slow, 40), false, 'timeout → false');
    assert.strictEqual(slow.listenerCount('close'), 0, 'dinleyici geri alındı');
  } finally { slow.kill('SIGKILL'); }
  const quick = spawn(process.execPath, ['-e', '']);
  assert.strictEqual(await pipeline.waitForChildClose(quick, 3000), true, 'kapanan → true');
  // readLimitedBytes
  await assert.rejects(() => discovery.readLimitedBytes({ headers: { get: () => '999' } }, 10), /çok büyük/);
  const small = { arrayBuffer: async () => new TextEncoder().encode('abc').buffer };
  assert.deepStrictEqual([...await discovery.readLimitedBytes(small, 10)], [97, 98, 99]);
  await assert.rejects(() => discovery.readLimitedBytes({ arrayBuffer: async () => new ArrayBuffer(100) }, 10), /çok büyük/);
  // stream yolu: limit aşımında cancel
  let cancelled = false;
  const reader = { n: 0, read: async () => ({ done: false, value: new Uint8Array(8) }), cancel: async () => { cancelled = true; }, releaseLock() {} };
  await assert.rejects(() => discovery.readLimitedBytes({ body: { getReader: () => reader } }, 20), /çok büyük/);
  assert.strictEqual(cancelled, true);
}

async function t_resource_tracker() {
  const fakeFs = { readFileSync: () => Buffer.from('ok'), writeFileSync: () => {} };
  const tracker = soak.createResourceTracker({ fs: fakeFs });
  fakeFs.readFileSync('/x');
  fakeFs.writeFileSync('/y', 'abc');
  const snap = tracker.snapshot();
  assert.strictEqual(snap.io.readOps, 1);
  assert.strictEqual(snap.io.writeOps, 1);
  assert.strictEqual(snap.io.writeBytes, 3);
  assert.strictEqual(snap.io.byFile[path.normalize('/y')].writeOps, 1);
  tracker.close();
  fakeFs.readFileSync('/x');
  assert.strictEqual(tracker.snapshot().io.readOps, 1, 'close sonrası sayım durur');
}

async function main() {
  await t('t_pair_quality', t_pair_quality);
  await t('t_coverage_ranges', t_coverage_ranges);
  await t('t_yt_accounts', t_yt_accounts);
  await t('t_zoom_and_identity', t_zoom_and_identity);
  await t('t_watch_state', t_watch_state);
  await t('t_lib_tools', t_lib_tools);
  await t('t_fsync_and_time', t_fsync_and_time);
  await t('t_burnin_and_format', t_burnin_and_format);
  await t('t_workspace_and_model', t_workspace_and_model);
  await t('t_watch_folder_and_terms', t_watch_folder_and_terms);
  await t('t_research_and_adapters', t_research_and_adapters);
  await t('t_site_term_and_nav', t_site_term_and_nav);
  await t('t_session_pkg_and_manga', t_session_pkg_and_manga);
  await t('t_page_index_and_series', t_page_index_and_series);
  await t('t_runtime_and_manifest', t_runtime_and_manifest);
  await t('t_pipeline_and_discovery', t_pipeline_and_discovery);
  await t('t_resource_tracker', t_resource_tracker);
  const failed = results.filter(([, s]) => s !== 'PASS');
  console.log(`misc-exports-deadzone: ${results.length - failed.length} senaryo geçti`);
  if (failed.length) process.exit(1);
}
main().then(() => process.exit(0), (e) => { console.error(e); process.exit(1); });
