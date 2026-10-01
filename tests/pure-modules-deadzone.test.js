// R334 devamı — saf-Node modüller (require'lanabilir): gpu-diagnostics,
// secret-store, media-catalog-store, translation-provider-probe sözleşmeleri.
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const assert = require('assert');

const gpu = require('../src/gpu-diagnostics');
const sec = require('../src/secret-store');
const cat = require('../src/media-catalog-store');
const probe = require('../src/translation-provider-probe');

const results = [];
async function t(name, fn) {
  try { await fn(); results.push([name, 'PASS']); }
  catch (e) { results.push([name, `FAIL ${e.message}`]); console.log('FAIL', name, e); }
}

// === gpu-diagnostics ===
async function t_gpu() {
  assert.strictEqual(gpu.isAcceleratedFeature('enabled'), true);
  assert.strictEqual(gpu.isAcceleratedFeature('disabled'), false);
  assert.strictEqual(gpu.isAcceleratedFeature(''), false);
  const f = gpu.normalizeFeatures({ video_decode: 'Enabled', webgl: 'Disabled', gpu_compositing: 'Enabled' });
  assert.strictEqual(f.videoDecode, 'enabled');
  assert.strictEqual(f.webgl, 'disabled');
  assert.strictEqual(f.canvas, 'bilinmiyor');
  const procs = gpu.normalizeGpuProcesses([
    { type: 'GPU', pid: 5, cpu: { percentCPUUsage: 3.7 }, memory: { workingSetSize: 2048 }, sandboxed: true },
    { type: 'Tab', pid: 9 },
    null,
  ]);
  assert.strictEqual(procs.length, 1);
  assert.strictEqual(procs[0].memoryMiB, 2, 'KiB→MiB');
  assert.strictEqual(procs[0].sandboxed, true);
  assert.strictEqual(gpu.detectsRemoteOrSoftwareAdapter({ auxAttributes: { glRenderer: 'llvmpipe' } }), true);
  assert.strictEqual(gpu.detectsRemoteOrSoftwareAdapter({ gpuDevice: [{ driverVendor: 'NVIDIA' }] }), false);
  const ad = gpu.normalizeGpuAdapter({ gpuDevice: [{ active: false, vendorId: 1 }, { active: true, vendorId: 4318, deviceId: 9555, driverVersion: '560.0' }], auxAttributes: { glRenderer: 'NVIDIA RTX' } });
  assert.strictEqual(ad.vendorId, '0x10de');
  assert.strictEqual(ad.renderer, 'NVIDIA RTX');
  // summarize durum matrisi
  let s = gpu.summarizeGpuDiagnostics({ featureReady: false });
  assert.strictEqual(s.state, 'pending');
  s = gpu.summarizeGpuDiagnostics({ featureReady: false, lastProcessEvent: { reason: 'crashed', exitCode: 1, at: 1, generation: 2 } });
  assert.strictEqual(s.state, 'recovering');
  s = gpu.summarizeGpuDiagnostics({ featureReady: true, gpuInfo: { auxAttributes: { glRenderer: 'Microsoft Basic Render Driver' } }, metrics: [{ type: 'GPU', pid: 1, memory: {} }] });
  assert.strictEqual(s.state, 'fallback');
  assert.strictEqual(s.remoteDesktop, true);
  s = gpu.summarizeGpuDiagnostics({ featureReady: true, hardwareAcceleration: false, metrics: [{ type: 'GPU', pid: 1, memory: {} }] });
  assert.strictEqual(s.summary.includes('kapalı'), true);
  s = gpu.summarizeGpuDiagnostics({ featureReady: true, metrics: [] });
  assert.strictEqual(s.state, 'fallback', 'GPU süreci yok → fallback');
  s = gpu.summarizeGpuDiagnostics({ featureReady: true, featureStatus: { webgl: 'disabled' }, metrics: [{ type: 'GPU', pid: 1, memory: {} }] });
  assert.strictEqual(s.state, 'fallback');
  assert.ok(s.missingFeatures.includes('webgl'));
  s = gpu.summarizeGpuDiagnostics({ featureReady: true, featureStatus: { video_decode: 'enabled', '2d_canvas': 'enabled', webgl: 'enabled', gpu_compositing: 'enabled' }, metrics: [{ type: 'GPU', pid: 1, memory: {} }] });
  assert.strictEqual(s.state, 'healthy');
  assert.strictEqual(s.accelerated, true);
  // recovered: yeni nesil > son çökme nesli
  s = gpu.summarizeGpuDiagnostics({ featureReady: true, generation: 5, featureStatus: { video_decode: 'enabled', webgl: 'enabled', gpu_compositing: 'enabled' }, metrics: [{ type: 'GPU', pid: 1, memory: {} }], lastProcessEvent: { reason: 'x', exitCode: 0, at: 1, generation: 4 } });
  assert.strictEqual(s.recovered, true);
}

// === secret-store ===
async function t_secret_store() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wb-sec-'));
  const filePath = path.join(dir, 'secrets.safe.json');
  const fakeStorage = {
    isEncryptionAvailable: () => true,
    encryptString: (v) => Buffer.from(`ENC:${v}`),
    decryptString: (buf) => Buffer.from(buf).toString().replace(/^ENC:/, ''),
  };
  const store = new sec.SafeSecretStore({ safeStorage: fakeStorage, filePath });
  assert.strictEqual(store.isAvailable(), true);
  // split: gizli alanlar ayrılır, boş dize anlamlı
  const { publicSettings, secrets } = sec.splitSettingsSecrets({ hfToken: 'tok', llm: { apiKey: 'k', model: 'm' }, name: 'n' });
  assert.strictEqual(publicSettings.hfToken, undefined);
  assert.strictEqual(publicSettings.llm.apiKey, undefined);
  assert.strictEqual(publicSettings.llm.model, 'm');
  assert.strictEqual(secrets.hfToken, 'tok');
  assert.strictEqual(secrets['llm.apiKey'], 'k');
  // proto-pollution kapısı
  assert.strictEqual(sec.getPath({ a: 1 }, '__proto__.x'), undefined);
  // setPath: dizi düğümü ezilmez
  const arr = { list: [1, 2] };
  sec.setPath(arr, 'list.x.y', 'z');
  assert.deepStrictEqual(arr.list, [1, 2], 'dizi üzerine nesne yazılmaz');
  const obj = {};
  sec.setPath(obj, 'a.b.c', 1);
  assert.strictEqual(obj.a.b.c, 1);
  // merge: clearedSecretFields geri-getirmez; kasa değeri geri yazılır
  const merged = sec.mergeSettingsSecrets({ clearedSecretFields: ['hfToken'] }, { hfToken: 'old', 'llm.apiKey': 'k2' });
  assert.strictEqual(merged.hfToken, undefined);
  assert.strictEqual(merged.llm.apiKey, 'k2');
  // save→load roundtrip
  const saved = store.save({ hfToken: 'abc', 'llm.apiKey': 'xyz' });
  assert.strictEqual(saved.ok, true);
  assert.deepStrictEqual(saved.stored.sort(), ['hfToken', 'llm.apiKey']);
  const loaded = store.load();
  assert.strictEqual(loaded.ok, true);
  assert.strictEqual(loaded.secrets.hfToken, 'abc');
  // .bak kurtarma: birincil bozuk → yedekten, recovered:true
  fs.copyFileSync(filePath, filePath + '.bak');
  fs.writeFileSync(filePath, '{bozuk');
  const rec = store.load();
  assert.strictEqual(rec.ok, true);
  assert.strictEqual(rec.recovered, true);
  // partial decrypt → saveFromSettings değişiklik kaydetmez (kayıp önleme)
  fs.writeFileSync(filePath, fs.readFileSync(filePath + '.bak', 'utf8'));
  const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  parsed.entries['manga.apiKey'] = Buffer.from('ca0a', 'hex').toString('base64');
  fs.writeFileSync(filePath, JSON.stringify(parsed));
  const store2 = new sec.SafeSecretStore({ safeStorage: {
    isEncryptionAvailable: () => true,
    encryptString: (v) => Buffer.from(`ENC:${v}`),
    decryptString: (buf) => { const s = buf.toString('latin1'); if (!s.startsWith('ENC:')) throw new Error('bad'); return s.slice(4); },
  }, filePath });
  const l2 = store2.load();
  assert.strictEqual(l2.partial, true);
  // Kısmen çözülen kasa kurtarılabilir kayıtlarla devam eder; çözülemeyen
  // girdi ham baytlarıyla korunur (kullanıcı kasaya yeniden girebilsin diye
  // kilitlenmez) — #393 sözleşmesi.
  const s2 = store2.saveFromSettings({ hfToken: 'yeni' });
  assert.strictEqual(s2.ok, true);
  const written2 = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  assert.strictEqual(written2.entries['manga.apiKey'], Buffer.from('ca0a', 'hex').toString('base64'),
    'çözülemeyen kayıt ham haliyle korunur');
  assert.strictEqual(written2.entries.hfToken, Buffer.from('ENC:yeni').toString('base64'));
  const l3 = store2.load();
  assert.strictEqual(l3.partial, true, 'kırık kayıt korunur: yükleme yine kısmi işaretli');
  assert.strictEqual(l3.secrets.hfToken, 'yeni');
  // forExport: gizli alan + token-sonlu anahtarlar süzülür
  const exp = store.forExport({ hfToken: 'x', prefs: { sessionToken: 't', theme: 'dark' } });
  assert.strictEqual(exp.hfToken, undefined);
  assert.strictEqual(exp.prefs.sessionToken, undefined);
  assert.strictEqual(exp.prefs.theme, 'dark');
  fs.rmSync(dir, { recursive: true, force: true });
}

// === media-catalog-store ===
async function t_catalog() {
  // itemOf doğrulama matrisi
  assert.throws(() => cat.itemOf(null), /geçersiz/);
  assert.throws(() => cat.itemOf({ kind: 'x' }), /film veya dizi/);
  assert.throws(() => cat.itemOf({ kind: 'film' }), /adı gerekli/);
  assert.throws(() => cat.itemOf({ kind: 'film', title: 'T', year: 1500 }), /Yıl geçersiz/);
  assert.throws(() => cat.itemOf({ kind: 'series', title: 'S', episodes: [{ season: 1, number: 1, id: 'a' }, { season: 1, number: 1, id: 'b' }] }), /birden çok kez/);
  assert.throws(() => cat.itemOf({ kind: 'series', title: 'S', episodes: [{ season: 1, number: 1 }, { season: 1, number: 1 }] }), /kimlikleri tekrarlanıyor/);
  const item = cat.itemOf({ kind: 'film', title: 'Film', year: 2001, imdbId: 'tt0133093', tmdbId: 'movie:603' });
  assert.strictEqual(item.imdbId, 'tt0133093');
  assert.strictEqual(item.tmdbId, 'movie:603');
  assert.ok(item.id);
  assert.strictEqual(cat.tmdbIdOf('tv:603', 'film'), '', 'tür uyumsuzluğu reddedilir');
  assert.strictEqual(cat.tmdbIdOf('603', 'series'), 'tv:603');
  assert.strictEqual(cat.imdbIdOf('tt123'), '');
  assert.strictEqual(cat.posterPath('/p/a.jpg'), '/p/a.jpg');
  assert.strictEqual(cat.posterPath('/p/a.exe'), '', 'görsel olmayan poster reddedilir');
  assert.strictEqual(cat.posterPath('not-abs.png'), '');
  const r = cat.ratingsOf({ imdb: 'N/A', personal: '  8.5 ' });
  assert.strictEqual(r.imdb, null, 'N/A temizlenir');
  assert.strictEqual(r.personal, '8.5');
  // sourceOf kapıları
  assert.strictEqual(cat.sourceOf({ type: 'browser', value: 'javascript:x' }), null);
  assert.strictEqual(cat.sourceOf({ type: 'browser', value: 'http://u:p@h/p' }), null, 'kimlikli URL reddedilir');
  const src = cat.sourceOf({ type: 'browser', value: 'https://v.example/w' });
  assert.strictEqual(src.type, 'browser');
  assert.ok(src.watchKey);
  const lsrc = cat.sourceOf({ type: 'local', value: '/media/f.mp4', imported: true });
  assert.strictEqual(lsrc.imported, true);
  // store: upsert/get/remove + .bak kurtarma + import planı
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wb-cat-'));
  const fp = path.join(dir, 'catalog.json');
  const store = cat.createMediaCatalogStore({ filePath: fp });
  assert.deepStrictEqual(store.list(), []);
  const a = store.upsert({ kind: 'film', title: 'A', year: 2000, importRef: 'imp1' });
  assert.strictEqual(store.get(a.id).title, 'A');
  const prev = cat.planImport ? null : null;
  const plan = store.mergeImport([
    { kind: 'film', title: 'A', year: 2000, importRef: 'imp1', synopsis: 'güncel' },
    { kind: 'film', title: 'B', importRef: 'imp2' },
    { kind: 'bogus' },
  ]);
  assert.strictEqual(plan.updated.length, 1, 'importRef eşleşmesi günceller');
  assert.strictEqual(plan.added.length, 1);
  assert.strictEqual(plan.skipped.length, 1);
  const merged = store.get(a.id);
  assert.strictEqual(merged.synopsis, 'güncel');
  assert.strictEqual(merged.id, a.id, 'kayıp güncelleme yok — aynı kimlik');
  // çakışma: aynı importRef farklı tür
  const plan2 = store.mergeImport([{ kind: 'series', title: 'A', importRef: 'imp1' }]);
  assert.strictEqual(plan2.conflicts.length, 1);
  // .bak kurtarma: birincil bozuk
  fs.copyFileSync(fp, fp + '.bak');
  fs.writeFileSync(fp, 'bozuk{');
  const store2 = cat.createMediaCatalogStore({ filePath: fp });
  assert.strictEqual(store2.list().length, 2, '.bak üzerinden okundu');
  // remove
  assert.strictEqual(store2.remove(a.id), true);
  assert.strictEqual(store2.remove('yok'), false);
  fs.rmSync(dir, { recursive: true, force: true });
}

// === translation-provider-probe ===
async function t_probe() {
  assert.strictEqual(probe.isLoopbackEndpoint('http://127.0.0.1:11434/v1'), true);
  assert.strictEqual(probe.isLoopbackEndpoint('http://localhost:11434'), true);
  assert.strictEqual(probe.isLoopbackEndpoint('https://api.openai.com'), false);
  assert.strictEqual(probe.isLoopbackEndpoint('not-a-url'), false);
  assert.strictEqual(probe.isSafeProbeEndpoint('https://api.example.com/v1'), true);
  assert.strictEqual(probe.isSafeProbeEndpoint('http://127.0.0.1:1'), true, 'http+loopback kabul');
  assert.strictEqual(probe.isSafeProbeEndpoint('http://example.com'), false, 'http uzak reddedilir');
  assert.strictEqual(probe.isSafeProbeEndpoint('https://u:p@h.com'), false, 'kimlikli URL reddedilir');
  assert.strictEqual(probe.isSafeProbeEndpoint('ftp://x'), false);
  // classify: metin önce, sonra durum kodu
  assert.strictEqual(probe.classifyProbeFailure(500, 'model not found'), 'model_unavailable');
  assert.strictEqual(probe.classifyProbeFailure(401, ''), 'authentication');
  assert.strictEqual(probe.classifyProbeFailure(403, ''), 'authentication');
  assert.strictEqual(probe.classifyProbeFailure(404, ''), 'endpoint_not_found');
  assert.strictEqual(probe.classifyProbeFailure(429, ''), 'rate_limit');
  assert.strictEqual(probe.classifyProbeFailure(503, ''), 'provider_unavailable');
  assert.strictEqual(probe.classifyProbeFailure(408, ''), 'timeout');
  assert.strictEqual(probe.classifyProbeFailure(400, ''), 'request_rejected');
  // completionText varyantları
  assert.strictEqual(probe.completionText({ choices: [{ message: { content: ' OK ' } }] }), 'OK');
  assert.strictEqual(probe.completionText({ choices: [{ message: { content: [{ text: 'a' }, { text: 'b' }] } }] }), 'ab');
  assert.strictEqual(probe.completionText({ output_text: 'o' }), 'o');
  assert.strictEqual(probe.completionText({ response: 'r' }), 'r');
  assert.strictEqual(probe.completionText({}), '');
  // probeTranslationProvider: fetch stub matrisi
  const okResp = (status, body) => ({ ok: status < 400, status, headers: { get: () => null }, arrayBuffer: async () => new TextEncoder().encode(body).buffer });
  let r = await probe.probeTranslationProvider({ endpoint: 'http://127.0.0.1:1/x', model: 'm', fetchImpl: async () => okResp(200, JSON.stringify({ choices: [{ message: { content: 'OK' } }] })) });
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.code, 'ok');
  r = await probe.probeTranslationProvider({ endpoint: 'http://127.0.0.1:1/x', model: 'm', fetchImpl: async () => okResp(429, '{}') });
  assert.strictEqual(r.code, 'rate_limit');
  r = await probe.probeTranslationProvider({ endpoint: 'http://127.0.0.1:1/x', model: 'm', fetchImpl: async () => okResp(200, 'not-json{') });
  assert.strictEqual(r.code, 'invalid_response');
  r = await probe.probeTranslationProvider({ endpoint: 'http://127.0.0.1:1/x', model: 'm', fetchImpl: async () => okResp(200, JSON.stringify({ choices: [] })) });
  assert.strictEqual(r.code, 'invalid_response', 'içerik yok → invalid_response');
  r = await probe.probeTranslationProvider({ endpoint: 'http://127.0.0.1:1/x', model: 'm', fetchImpl: async () => { const e = new Error('nope'); e.name = 'AbortError'; throw e; } });
  assert.strictEqual(r.code, 'timeout');
  r = await probe.probeTranslationProvider({ endpoint: 'http://127.0.0.1:1/x', model: 'm', fetchImpl: async () => { throw new Error('ECONN'); } });
  assert.strictEqual(r.code, 'network');
  // kapılar: güvensiz endpoint, boş model, kontrol karakterli model, uzak anahtarsız
  assert.strictEqual((await probe.probeTranslationProvider({ endpoint: 'http://evil.com', model: 'm' })).code, 'invalid_config');
  assert.strictEqual((await probe.probeTranslationProvider({ endpoint: 'https://api.x.com', model: '' })).code, 'invalid_config');
  assert.strictEqual((await probe.probeTranslationProvider({ endpoint: 'https://api.x.com', model: 'm\u0001', apiKey: 'k' })).code, 'invalid_config');
  assert.strictEqual((await probe.probeTranslationProvider({ endpoint: 'https://api.x.com', model: 'm' })).code, 'invalid_config', 'uzak + anahtar yok → red');
  // beyan edilen content-length > limit → invalid_response
  const big = { ok: true, status: 200, headers: { get: (k) => k === 'content-length' ? '99999999' : null }, arrayBuffer: async () => new ArrayBuffer(0) };
  r = await probe.probeTranslationProvider({ endpoint: 'http://127.0.0.1:1/x', model: 'm', fetchImpl: async () => big });
  assert.strictEqual(r.code, 'invalid_response');
}

async function main() {
  await t('t_gpu', t_gpu);
  await t('t_secret_store', t_secret_store);
  await t('t_catalog', t_catalog);
  await t('t_probe', t_probe);
  const failed = results.filter(([, s]) => s !== 'PASS');
  console.log(`pure-modules-deadzone: ${results.length - failed.length} senaryo geçti`);
  if (failed.length) process.exit(1);
}
main().then(() => process.exit(0), (e) => { console.error(e); process.exit(1); });
