const assert = require('node:assert/strict');
const {
  applyEditRecord,
  calculateTwoPointTransform,
  createEditRecord,
  createSyncRecord,
  cuePrefixHash,
  cueSourceHash,
  normalizeTransform,
  sourceToVideoTime,
  syncRecordMatches,
  transformCuesForExport,
  videoToSourceTime,
} = require('../src/browser-subtitle-sync');
const { BROWSER_SESSION_VERSION, normalizeBrowserSession } = require('../src/browser-session-store');
const { buildBrowserSubtitleDocument, validateBrowserSubtitleDocument } = require('../src/browser-subtitle-output');

const cues = [
  { id: 'a', start: 10, end: 12, text: 'Merhaba' },
  { id: 'b', start: 10, end: 13, text: 'Aynı zamanda ayrı satır' },
  { id: 'c', start: 700, end: 702, text: 'Türkçe ğüşiöç' },
];

// 1-2: pozitif/negatif offset ve ters dönüşüm.
assert.equal(sourceToVideoTime(10, { scale: 1, offsetSeconds: 2 }), 12);
assert.equal(sourceToVideoTime(10, { scale: 1, offsetSeconds: -2 }), 8);
assert.equal(videoToSourceTime(12, { scale: 1, offsetSeconds: 2 }), 10);

// 3: iki noktalı drift örneği iki noktayı da tam karşılar.
const drift = calculateTwoPointTransform({ sourceTime: 100, videoTime: 102 }, { sourceTime: 700, videoTime: 708 });
assert.ok(Math.abs(drift.scale - 1.01) < 1e-12);
assert.ok(Math.abs(drift.offsetSeconds - 1) < 1e-12);
assert.ok(Math.abs(sourceToVideoTime(700, drift) - 708) < 1e-9);

// 4-5: yakın/ters noktalar ve geçersiz dönüşümler reddedilir.
assert.throws(() => calculateTwoPointTransform({ sourceTime: 1, videoTime: 2 }, { sourceTime: 1.2, videoTime: 3 }), /yakın/);
assert.deepEqual(calculateTwoPointTransform(
  { sourceTime: 700, videoTime: 708 }, { sourceTime: 100, videoTime: 102 }
).points.map((point) => point.sourceTime), [100, 700]);
assert.throws(() => calculateTwoPointTransform(
  { sourceTime: 2, videoTime: 3 }, { sourceTime: 1, videoTime: 4 }
), /ters/);
for (const transform of [{ scale: 0 }, { scale: -1 }, { scale: .24 }, { scale: 4.01 }, { scale: NaN }, { scale: Infinity }, { scale: 1, offsetSeconds: Infinity }]) {
  assert.throws(() => normalizeTransform(transform));
}

const sourcePrefix = cuePrefixHash(cues, 3);
const record = createSyncRecord({ mediaId: 'youtube:video-1', sourceTrackId: 'en', sourceHash: 'hash-v1',
  sourcePrefixHash: sourcePrefix, sourcePrefixCount: 3, ...drift, updatedAt: 10 });

// 6-8: önizleme saf dönüşümdür; kalıcı kayıt yalnız doğru medya/kaynakta eşleşir.
const original = JSON.parse(JSON.stringify(cues));
assert.equal(syncRecordMatches(record, { mediaId: 'youtube:video-1', sourceTrackId: 'en', sourceHash: 'hash-v1' }), true);
assert.equal(syncRecordMatches(record, { mediaId: 'youtube:video-2', sourceTrackId: 'en', sourceHash: 'hash-v1' }), false);
assert.equal(syncRecordMatches(record, { mediaId: 'youtube:video-1', sourceTrackId: 'de', sourceHash: 'hash-v1' }), false);
transformCuesForExport(cues, drift);
assert.deepEqual(cues, original, 'önizleme/export kaynak cue nesnelerini değiştirdi');

// 9: append-only canlı iz, korunan lineage + prefix ile eşleşir.
const appended = [...cues, { id: 'd', start: 704, end: 706, text: 'Yeni canlı cue' }];
assert.equal(syncRecordMatches(record, { mediaId: 'youtube:video-1', sourceTrackId: 'en', sourceHash: 'hash-v2',
  sourcePrefixHash: cuePrefixHash(appended, 4), sourcePrefixCount: 4,
  sourcePrefixHashes: { 3: cuePrefixHash(appended, 3), 4: cuePrefixHash(appended, 4) } }), true);

// 10: aynı kaynak kimliği model varyantından bağımsız paylaşılır; farklı kaynak paylaşılmaz.
assert.equal(syncRecordMatches(record, { mediaId: 'youtube:video-1', sourceTrackId: 'en', sourceHash: 'hash-v1', variantId: 'model-b' }), true);
assert.equal(syncRecordMatches(record, { mediaId: 'youtube:video-1', sourceTrackId: 'en-2', sourceHash: 'hash-v1' }), false);

const editContext = { mediaId: 'youtube:video-1', variantId: 'tr:model-a', sourceHash: 'hash-v1',
  cueId: 'a', sourceCueHash: cueSourceHash(cues[0], 0) };
const edit = createEditRecord({ ...editContext, baseTranslation: 'Eski metin', hasOverride: true,
  userOverride: 'Benim düzeltmem', revision: 1, userEditedAt: 20 });

// 11: gecikmiş model cevabı yalnız base'i değiştirir, override ekranda kalır.
const delayed = applyEditRecord({ id: 'web-tr-a', start: 10, end: 12, text: 'Yeni model metni' }, edit, editContext);
assert.equal(delayed.text, 'Benim düzeltmem');
assert.equal(delayed.baseTranslation, 'Yeni model metni');

// 12: aynı zaman kodlu iki cue kimlikle ayrılır.
const otherContext = { ...editContext, cueId: 'b', sourceCueHash: cueSourceHash(cues[1], 1) };
assert.equal(applyEditRecord({ ...cues[1], text: 'Model B' }, edit, otherContext).text, 'Model B');

// 13: bilinçli boş override, override yokluğundan farklıdır.
const empty = createEditRecord({ ...editContext, baseTranslation: 'Sil', hasOverride: true, userOverride: '', revision: 2 });
assert.equal(applyEditRecord({ ...cues[0], text: 'Sil' }, empty, editContext).text, '');
const reverted = createEditRecord({ ...editContext, baseTranslation: 'Yeni', hasOverride: false, revision: 3 });
assert.equal(applyEditRecord({ ...cues[0], text: 'Yeni' }, reverted, editContext).text, 'Yeni');

// 14: undo, sonradan gelen model base'ini degil yalniz override kaydini geri alir.
assert.equal(applyEditRecord({ ...cues[0], text: 'En yeni model' }, null, editContext).text, 'En yeni model');

// 15: model/sağlayıcı varyantı değişince düzeltme taşınmaz.
assert.equal(applyEditRecord({ ...cues[0], text: 'Model B' }, edit, { ...editContext, variantId: 'tr:model-b' }).text, 'Model B');

// 16: bozuk kayıt nötr davranışa düşer ve karantinada korunur.
const session = normalizeBrowserSession({ version: 2, tabs: [{ id: 't', url: 'https://example.com/watch/1',
  subtitleSyncRecords: [{ mediaId: 'x', sourceTrackId: 'y', sourceHash: 'z', scale: 0 }],
  subtitleEdits: [{ mediaId: 'x' }] }] });
assert.equal(session.version, BROWSER_SESSION_VERSION);
assert.equal(session.tabs[0].subtitleSyncRecords.length, 0);
assert.equal(session.tabs[0].subtitleEdits.length, 0);
assert.equal(session.tabs[0].subtitleRecordQuarantine.length, 2);
assert.equal(session.tabs[0].subtitleRecordQuarantine[0].record.scale, 0);
assert.equal(session.tabs[0].subtitleRecordQuarantine[1].record.sourceHash, '');
const quarantinedAgain = normalizeBrowserSession(session);
assert.equal(quarantinedAgain.tabs[0].subtitleRecordQuarantine[0].record.scale, 0,
  'karantinadaki kurtarma verisi sonraki oturum yazımında kayboldu');

// 17-18: her format hem orijinal hem senkronlu zamanla yeniden okunur; kaynak iki kez kaymaz.
for (const format of ['srt', 'vtt', 'ass']) {
  const originalDoc = buildBrowserSubtitleDocument(cues, format);
  assert.equal(validateBrowserSubtitleDocument(originalDoc.text, format, cues).ok, true);
  const shifted = transformCuesForExport(cues, { scale: 1, offsetSeconds: 2 });
  const shiftedDoc = buildBrowserSubtitleDocument(shifted, format);
  assert.equal(validateBrowserSubtitleDocument(shiftedDoc.text, format, shifted).ok, true);
  assert.equal(cues[0].start, 10, `${format}: aktif kaynak cue iki kez dönüştürüldü`);
}

const exportWarnings = [];
const clippedAtStart = transformCuesForExport([
  { start: 0.25, end: 1.25, text: 'Başı kırpılan' },
  { start: 1.5, end: 2.5, text: 'Korunan' },
], { scale: 1, offsetSeconds: -0.5 }, (message) => exportWarnings.push(message));
assert.deepEqual(clippedAtStart.map(({ start, end, text }) => ({ start, end, text })), [
  { start: 0, end: 0.75, text: 'Başı kırpılan' },
  { start: 1, end: 2, text: 'Korunan' },
]);
assert.equal(exportWarnings.length, 1, 'video başlangıcında kırpılan cue kullanıcıya bildirilmedi');
assert.match(exportWarnings[0], /1.*başlangıcında/i);
const invalidWarnings = [];
assert.deepEqual(transformCuesForExport([
  { start: 1, end: 2, text: 'Korunan' },
  { start: 3, end: 3, text: 'Bozuk' },
], { scale: 1, offsetSeconds: 0 }, (message) => invalidWarnings.push(message))
  .map((cue) => cue.text), ['Korunan']);
assert.match(invalidWarnings[0], /1.*geçersiz/i);
assert.throws(() => transformCuesForExport([
  { start: 0.25, end: 0.4, text: 'Tamamen video öncesi' },
], { scale: 1, offsetSeconds: -0.5 }), /geçerli.*kalmadı/i);
const onePoint = [];
onePoint[1] = { sourceTime: 10, videoTime: 11, cueId: 'b' };
assert.equal(createSyncRecord({ mediaId: 'm', sourceTrackId: 's', sourceHash: 'h',
  scale: 1, offsetSeconds: 1, points: onePoint }).points.length, 1,
'ikinci nokta önce seçildiğinde seyrek dizi oturum kaydını bozmamalı');

const largeCues = Array.from({ length: 10000 }, (_, index) => ({
  id: `cue-${index}`, start: index * 2, end: index * 2 + 1.5, text: `Satır ${index}`,
}));
const perfStart = performance.now();
assert.equal(transformCuesForExport(largeCues, drift).length, 10000);
assert(performance.now() - perfStart < 500, '10.000 cue senkron dönüşümü gereğinden yavaş');
console.log('Browser altyazı senkronu: dönüşüm, kalıcılık, canlı lineage, override ve export matrisi geçti.');
