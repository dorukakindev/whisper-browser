// Kuyruk-50 batch 7 (maddeler 31–35) — saf mantık kilitleri.
// 31: aşama ETA öğrenimi · 32: donanım rehberi · 33: ağ bütçesi · 34: önbellek satırları · 35: kaynak zaman çizelgesi
'use strict';
const assert = require('assert');
const H = require('../src/job-timing-helpers');

let passed = 0;
function test(name, fn) {
  fn(); passed += 1; console.log(`  PASS  ${name}`);
}

// ---------- Madde 31: aşama ETA ----------

test('31: boş geçmişte tahmin yok — sahte ETA üretilmez', () => {
  assert.equal(H.estimateStageEta('extract', { history: {} }), null);
  assert.equal(H.estimateStageEta('extract', {}), null);
});

test('31: yüzde hızı ölçümlü ETA verir', () => {
  const eta = H.estimateStageEta('transcribe', { percentDone: 50, elapsedSec: 30 });
  assert.equal(eta.basis, 'measured');
  assert.equal(Math.round(eta.seconds), 30);
});

test('31: adet hızı çeviri ETA verir (done/total)', () => {
  const eta = H.estimateStageEta('llm_postprocess', { done: 40, total: 100, elapsedSec: 10 });
  assert.equal(eta.basis, 'measured');
  assert.equal(Math.round(eta.seconds), 15);
});

test('31: geçmiş medyanı ölçüm yokken devreye girer', () => {
  let h = {};
  h = H.recordStageDuration(h, 'extract', 20);
  h = H.recordStageDuration(h, 'extract', 24);
  const eta = H.estimateStageEta('extract', { history: h, elapsedSec: 5 });
  assert.equal(eta.basis, 'history');
  assert.equal(Math.round(eta.seconds), 19); // medyan 24 − geçen 5
});

test('31: geçmiş süre aşıldığında 0 altına inmez', () => {
  const h = H.recordStageDuration({}, 'write', 5);
  const eta = H.estimateStageEta('write', { history: h, elapsedSec: 10 });
  assert.equal(eta.seconds, 0);
});

test('31: kayıt sınırı 8 ölçüm — eskiler elenir, geçersiz giriş bozmaz', () => {
  let h = {};
  for (let i = 1; i <= 12; i++) h = H.recordStageDuration(h, 'download', i * 10);
  assert.equal(h.download.length, 8);
  assert.equal(h.download[0], 50);
  assert.deepEqual(H.recordStageDuration({}, '', 5), {});
  assert.deepEqual(H.recordStageDuration({}, 'x', -1), {});
  assert.deepEqual(H.recordStageDuration(null, 'x', NaN), {});
});

test('31: formatStageEta history tabanını metinde belirtir', () => {
  assert.ok(H.formatStageEta({ seconds: 12, basis: 'history' }, false).includes('geçmiş'));
  assert.ok(H.formatStageEta({ seconds: 12, basis: 'measured' }, true).includes('est.'));
  assert.equal(H.formatStageEta(null), '');
});

// ---------- Madde 32: donanım rehberi ----------

test('32: diarize ~2.4GB ek yük ekler', () => {
  const plain = H.modelVramNeed('medium', 'float16', {});
  const di = H.modelVramNeed('medium', 'float16', { diarize: true });
  assert.equal(di - plain, 2500);
});

test('32: GPU yokken CPU+int8+küçük model önerilir', () => {
  const rec = H.recommendedHardwareConfig({ gpuName: '', vramMib: null });
  assert.equal(rec.device, 'cpu');
  assert.equal(rec.computeType, 'int8');
  assert.equal(rec.model, 'small');
  assert.ok(rec.notes.length > 0);
});

test('32: 12GB VRAM → large-v3 önerilir', () => {
  const rec = H.recommendedHardwareConfig({ gpuName: 'RTX 4070 Ti', vramMib: 12282 });
  assert.equal(rec.device, 'cuda');
  assert.equal(rec.model, 'large-v3');
});

test('32: 2GB VRAM → küçük model önerilir', () => {
  // 2048MB × 0.85 = 1740 sınırı: turbo(2796)/medium(2632) sığmaz → small kalır.
  const rec = H.recommendedHardwareConfig({ gpuName: 'GTX 1050', vramMib: 2048 });
  assert.equal(rec.model, 'small');
});

test('32: 4GB VRAM → turbo float16 sığar, large-v3 sığmaz', () => {
  const rec = H.recommendedHardwareConfig({ gpuName: 'GTX 1650', vramMib: 4096 });
  assert.equal(rec.model, 'large-v3-turbo');
});

test('32: uygunluk satırları fits/tight/over sınıflar', () => {
  const rows = H.hardwareGuideRows({ vramMib: 2000, computeType: 'float16' });
  assert.equal(rows.find((r) => r.id === 'medium').state, 'fits');
  assert.equal(rows.find((r) => r.id === 'large-v3').state, 'over');
  assert.equal(rows[0].state, 'fits');
  assert.ok(H.hardwareGuideRows({ vramMib: null }).every((r) => r.state === 'unknown'));
});

// ---------- Madde 33: ağ bütçesi ----------

test('33: preset çözümleme + geçersiz değerde full', () => {
  assert.equal(H.resolveNetworkBudget('saver').translateWorkers, 1);
  assert.equal(H.resolveNetworkBudget('bogus').key, 'full');
  assert.equal(H.resolveNetworkBudget(undefined).key, 'full');
});

test('33: saver bütçe işçi sayısını 1e indirir', () => {
  assert.equal(H.budgetWorkerCap('saver', 'page'), 1);
  assert.equal(H.budgetWorkerCap('saver', 'track'), 1);
  assert.ok(H.budgetWorkerCap('balanced', 'track') <= 3);
});

test('33: etiket çift dilli', () => {
  assert.ok(H.netBudgetLabel('saver', true).includes('network'));
  assert.ok(H.netBudgetLabel('saver', false).includes('ağ'));
});

// ---------- Madde 34: önbellek satırları ----------

test('34: satır üretimi — 6 tür, çeviri kayıt sayısı', () => {
  const rows = H.cacheStatRows({
    models: { bytes: 5e9, freeBytes: 1e9, installed: 3, partial: 1 },
    translation: { bytes: 1e6, count: 42 },
    manga: { bytes: 2e6, count: 7 }, tmp: { bytes: 0 }, assets: { bytes: 3e6 }, logs: { bytes: 1e5 },
  }, false);
  assert.equal(rows.length, 6);
  assert.ok(rows.find((r) => r.kind === 'translation').detail.includes('42'));
  assert.equal(rows.find((r) => r.kind === 'tmp').clearable, true);
  assert.ok(rows.find((r) => r.kind === 'models').detail.includes('3'));
});

test('34: iş çalışırken models/tmp temizliği reddedilir', () => {
  assert.equal(H.cacheClearGuard('models', { jobActive: true }).ok, false);
  assert.equal(H.cacheClearGuard('tmp', { jobActive: true }).ok, false);
  assert.equal(H.cacheClearGuard('translation', { jobActive: true }).ok, true);
  assert.equal(H.cacheClearGuard('models', {}).ok, true);
});

test('34: formatBytesForUi ölçekleri', () => {
  assert.ok(H.formatBytesForUi(2.5e9).includes('GB'));
  assert.ok(H.formatBytesForUi(3e6).includes('MB'));
  assert.equal(H.formatBytesForUi(null), '—');
});

// ---------- Madde 35: kaynak zaman çizelgesi ----------

test('35: appendResourceSample kapasiteye uyar, geçersiz eklenmez', () => {
  let s = [];
  for (let i = 0; i < 500; i++) s = H.appendResourceSample(s, { t: i, stage: 'x', sysMemPct: 50 });
  assert.equal(s.length, H.RESOURCE_SERIES_CAP);
  assert.equal(s[0].t, 20);
  assert.deepEqual(H.appendResourceSample([], { t: NaN }), []);
  assert.deepEqual(H.appendResourceSample([], null), []);
});

test('35: sparkline noktaları üretimi + eksik anahtar boş', () => {
  const series = [{ t: 0, gpuMemMb: 100 }, { t: 5, gpuMemMb: 300 }, { t: 10, gpuMemMb: 200 }];
  const pts = H.resourceSparkPoints(series, 'gpuMemMb', 100, 20);
  assert.equal(pts.split(' ').length, 3);
  assert.ok(pts.includes('0.0,20.0'));
  assert.equal(H.resourceSparkPoints([{ t: 1 }], 'gpuMemMb'), '');
});

test('35: rapor aşama kırılımları içerir, kişisel yol içermez', () => {
  const series = [
    { t: 0, stage: 'download', sysMemPct: 40, gpuMemMb: 500, diskFreeMb: 9000 },
    { t: 10, stage: 'download', sysMemPct: 45, gpuMemMb: 600, diskFreeMb: 8500 },
    { t: 15, stage: 'transcribe', sysMemPct: 60, gpuMemMb: 4000, diskFreeMb: 8000 },
  ];
  const md = H.formatResourceReport(series, { en: false });
  assert.ok(md.includes('download'));
  assert.ok(md.includes('transcribe'));
  assert.ok(md.includes('Tepe GPU belleği'));
  assert.ok(!md.includes('/home/'));
  assert.ok(H.formatResourceReport([], { en: true }).includes('No samples'));
});

// ---------- Ratchet: preload'in exposeInMainWorld('api') globalıyla çakışma ----------
// Gerçek pencerede <script> ile yüklenen modülün top-level `const api` bildirimi
// SyntaxError verir ve dosyanın tamamı sessizce ölür (gerçek-uygulama doğrulamasında
// yakalandı). Modül dışa aktarım adı benzersiz olmalı.
test('ratchet: modül top-level `api` bildirimi içermez', () => {
  const fs = require('fs');
  const path = require('path');
  const src = fs.readFileSync(path.join(__dirname, '..', 'src', 'job-timing-helpers.js'), 'utf8');
  assert.ok(!/^(?:const|let|var)\s+api\b/m.test(src), 'top-level api bildirimi window.api ile çakışır');
  assert.ok(/globalThis\.JobTimingHelpers\s*=/.test(src));
});

console.log(`\njob-helpers-31-35: ${passed} test geçti`);
