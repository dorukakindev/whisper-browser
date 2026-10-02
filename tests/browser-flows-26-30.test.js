// Kuyruk-50 maddeleri 26-30 — browser akışı yardımcıları (browser-flow-helpers.js)
// Madde 26: eksik-altyazı açıklaması (adapter + aşama + alternatif yönlendirme)
// Madde 27: yakalama inceleme meta satırı
// Madde 28: kütüphane satırından kuyruk hedefi
// Madde 29: çalışma alanı açılışında eksik kaynak raporu
// Madde 30: etkin profil kapsamı + sıfırlama önizleme metni
'use strict';
const assert = require('assert');
const {
  browserMissingDetail,
  browserTrackReviewMeta,
  watchItemQueueTarget,
  workspaceMissingResources,
  browserProfileActiveScope,
  browserProfileBoundaryCopy,
} = require('../src/browser-flow-helpers');

let passed = 0;
function test(name, fn) {
  fn(); passed += 1; console.log(`  PASS  ${name}`);
}

// ---------- Madde 26: browserMissingDetail ----------

test('26: adapter ve aşama yoksa detay boş, tanı bağlantısı gizli', () => {
  const result = browserMissingDetail({});
  assert.equal(result.detail, '');
  assert.equal(result.showInfo, false);
  assert.equal(browserMissingDetail(null).detail, '');
});

test('26: genel-olmayan adapter etiketi site profili olarak gösterilir', () => {
  const result = browserMissingDetail({ adapter: { label: 'YouTube', help: '' } });
  assert.match(result.detail, /Site profili: YouTube\./);
  assert.equal(result.showInfo, true);
});

test('26: "Genel web videosu" adapteri tekrar yazılmaz ama help görünür', () => {
  const result = browserMissingDetail({ adapter: { label: 'Genel web videosu', help: 'Tarayıcı içi yakalama sayfada etkin değil.' } });
  assert.ok(!result.detail.includes('Site profili'));
  assert.match(result.detail, /Tarayıcı içi yakalama/);
  assert.equal(result.showInfo, true); // label mevcut → tanı sayfası erişilebilir
});

test('26: bulunamayan/atlanan aşamalar adlandırılır, sıradaki/arani­lanlar sayılmaz', () => {
  const result = browserMissingDetail({
    acquisition: { stages: [
      { stage: 'textTrack', label: 'Sayfa altyazı izi', status: 'Bulunamadı' },
      { stage: 'manifest', label: 'Manifest', status: 'Atlandı' },
      { stage: 'cdp', label: 'Ağ yakalama', status: 'Aranıyor' },
      { stage: 'page', label: 'Sayfa sinyali', status: 'Sırada' },
    ] },
  });
  assert.match(result.detail, /Denenip bulunamadı: Sayfa altyazı izi, Manifest\./);
  assert.ok(!result.detail.includes('Ağ yakalama'));
  assert.ok(!result.detail.includes('Sayfa sinyali'));
  assert.equal(result.showInfo, true);
});

test('26: EN kipi adapter + aşama metnini İngilizce üretir', () => {
  const result = browserMissingDetail({
    en: true,
    adapter: { label: 'SmartTube' },
    acquisition: { stages: [{ stage: 'textTrack', label: 'Page track', status: 'Bulunamadı' }] },
  });
  assert.match(result.detail, /Site profile: SmartTube\./);
  assert.match(result.detail, /Checked and not found: Page track\./);
});

// ---------- Madde 27: browserTrackReviewMeta ----------

test('27: kaynak izi rol/dil/biçim/satır sayısı içerir', () => {
  const meta = browserTrackReviewMeta({ role: 'source', language: 'en', format: 'vtt', cueCount: 128 });
  assert.equal(meta, 'Kaynak · EN · vtt · 128 satır');
});

test('27: çeviri izi sağlayıcı+model varyantı gösterir', () => {
  const meta = browserTrackReviewMeta({ role: 'translation', language: 'tr', provider: 'openai', model: 'gpt-4o-mini', cueCount: 5 });
  assert.equal(meta, 'Çeviri · TR · openai / gpt-4o-mini · 5 satır');
});

test('27: zaman dönüşümü işaret/eşleşme/güven ile yazılır', () => {
  const meta = browserTrackReviewMeta({
    role: 'source', cueCount: 10,
    timeTransform: { offsetSeconds: -1.25, matches: 7, confidence: 'yüksek' },
  });
  assert.match(meta, /zaman dönüşümü -1\.25s \(7 eşleşme, yüksek\)/);
});

test('27: EN kipi + tamamlanmamış yakalama ilerlemesi', () => {
  const meta = browserTrackReviewMeta({
    role: 'source', language: 'en', cueCount: 40, captureComplete: false, captureTotal: 120,
  }, true);
  assert.match(meta, /Source · EN · 40 cues/);
  assert.match(meta, /capture in progress 40\/120/);
});

test('27: sourceMismatch uyarısı ve boş girdi güvenliği', () => {
  assert.match(browserTrackReviewMeta({ role: 'source', cueCount: 1, sourceMismatch: true }), /farklı bir kaynak ize ait/);
  assert.equal(browserTrackReviewMeta(null), '');
  assert.equal(browserTrackReviewMeta(undefined), '');
});

// ---------- Madde 28: watchItemQueueTarget ----------

test('28: youtube kaydı sourceRef ile youtube işine dönüşür', () => {
  assert.deepEqual(watchItemQueueTarget({ type: 'youtube', sourceRef: 'https://youtu.be/abc' }),
    { type: 'youtube', input: 'https://youtu.be/abc' });
});

test('28: local kayıt localPath öncelikli, sourceRef yedek', () => {
  assert.deepEqual(watchItemQueueTarget({ type: 'local', localPath: 'D:\\v.mp4', sourceRef: 'x' }),
    { type: 'file', input: 'D:\\v.mp4' });
  assert.deepEqual(watchItemQueueTarget({ type: 'local', sourceRef: '/v/a.mp4' }),
    { type: 'file', input: '/v/a.mp4' });
});

test('28: browser türü ve boş kaynak null döner', () => {
  assert.equal(watchItemQueueTarget({ type: 'browser', sourceRef: 'https://x.test' }), null);
  assert.equal(watchItemQueueTarget({ type: 'youtube' }), null);
  assert.equal(watchItemQueueTarget({ type: 'local', localPath: '   ' }), null);
  assert.equal(watchItemQueueTarget(null), null);
  assert.equal(watchItemQueueTarget('x'), null);
});

// ---------- Madde 29: workspaceMissingResources ----------

test('29: iz varlığı depoda yoksa sekme adıyla raporlanır', () => {
  const tabs = [{ title: 'Video A', trackRefs: [{ assetId: 'a1', label: 'TR çeviri' }] }];
  const missing = workspaceMissingResources(tabs, { getTrack: () => null });
  assert.deepEqual(missing, [{ kind: 'track', tab: 'Video A', detail: 'TR çeviri' }]);
});

test('29: varlık mevcutsa ve kurtarma çıktısı diskteyse liste boş', () => {
  const tabs = [{
    title: 'B',
    trackRefs: [{ assetId: 'a1' }],
    recoveryJobs: [{ outputPath: '/tmp/out.srt' }],
  }];
  const missing = workspaceMissingResources(tabs, { getTrack: () => ({}), exists: () => true });
  assert.deepEqual(missing, []);
});

test('29: kurtarma çıktısı silindiyse yol ile raporlanır', () => {
  const tabs = [{ url: 'https://v.test/x', recoveryJobs: [{ outputPath: '/missing/out.srt' }] }];
  const missing = workspaceMissingResources(tabs, { exists: (p) => p !== '/missing/out.srt' });
  assert.equal(missing.length, 1);
  assert.equal(missing[0].kind, 'recovery-output');
  assert.equal(missing[0].tab, 'https://v.test/x');
  assert.match(missing[0].detail, /\/missing\/out\.srt/);
});

test('29: assetId boş ref atlanır; 20 kayıt sınırı korunur', () => {
  const tabs = [{ title: 'T', trackRefs: [{ assetId: '' }, ...Array.from({ length: 30 }, (_, i) => ({ assetId: `a${i}` }))] }];
  const missing = workspaceMissingResources(tabs, { getTrack: () => null });
  assert.equal(missing.length, 20);
});

test('29: deps yoksa varsayılanlar güvenli (getTrack null → tümü eksik, exists true)', () => {
  const tabs = [{ title: 'T', trackRefs: [{ assetId: 'a' }], recoveryJobs: [{ outputPath: '/x' }] }];
  const missing = workspaceMissingResources(tabs);
  assert.equal(missing.length, 1);
  assert.equal(missing[0].kind, 'track');
});

// ---------- Madde 30: profil kapsamı ----------

test('30: en özel kapsam önceliği tab > path > site > general', () => {
  assert.equal(browserProfileActiveScope({ sources: { a: 'site', b: 'tab', c: 'general' } }), 'tab');
  assert.equal(browserProfileActiveScope({ sources: { a: 'site', b: 'path' } }), 'path');
  assert.equal(browserProfileActiveScope({ sources: { a: 'site' } }), 'site');
  assert.equal(browserProfileActiveScope({ sources: { a: 'general' } }), 'general');
  assert.equal(browserProfileActiveScope({}), 'general');
});

test('30: sıfırlama önizlemesi site kapsamındaki alanları sayar ve sınırı belirtir', () => {
  const copy = browserProfileBoundaryCopy({
    origin: 'https://v.test',
    sources: { zoom: 'site', dark: 'site', mode: 'general', gap: 'tab' },
    fieldTitles: { zoom: 'Yakınlaştırma', dark: 'Koyu mod' },
  }, 'site');
  assert.equal(copy.scopeLabel, 'Site profili');
  assert.equal(copy.origin, 'https://v.test');
  assert.equal(copy.overrideCount, 2);
  assert.match(copy.description, /2 site özelleştirmesi sıfırlanacak \(Yakınlaştırma, Koyu mod\)/);
  assert.match(copy.description, /çerezleri, oturumlar ve sayfa oturumu etkilenmez/);
});

test('30: genel kapsamda onay gerekmez (açıklama boş); EN kipi çalışır', () => {
  const copy = browserProfileBoundaryCopy({ sources: { zoom: 'site' } }, 'general');
  assert.equal(copy.overrideCount, 0);
  assert.equal(copy.description, '');
  const en = browserProfileBoundaryCopy({ sources: { zoom: 'tab' } }, 'tab', true);
  assert.equal(en.scopeLabel, 'Tab profile');
  assert.match(en.description, /1 tab override will be reset \(zoom\)/);
  assert.match(en.description, /cookies, logins and the page session are not affected/);
});

test('30: kapsamda özelleştirme yoksa kullanıcıya açık yazılır', () => {
  const copy = browserProfileBoundaryCopy({ sources: { zoom: 'site' } }, 'path');
  assert.equal(copy.overrideCount, 0);
  assert.equal(copy.description, 'Bu kapsamda özelleştirme yok.');
});

console.log(`browser-flows-26-30: ${passed} test`);
