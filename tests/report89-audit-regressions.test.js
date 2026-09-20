const assert = require('node:assert/strict');

const { createBrowserEventEnvelope, normalizeBrowserEventContext } = require('../src/browser-event-envelope');
const { migrateBrowserSession, normalizeSessionTab } = require('../src/browser-session-store');
const { normalizeClosedBrowserTab } = require('../src/browser-tab-history');
const { normalizeCues, assembleCueSentences, distributeTranslation } = require('../src/browser-translation-scheduler');
const { transcriptClock } = require('../src/browser-transcript-search');
const { permissionOrigin } = require('../src/browser-site-permissions');
const { SafeSecretStore } = require('../src/secret-store');
const { cleanupExtractedFontDir } = require('../src/browser-fonts');

let passed = 0;
function test(name, fn) { fn(); passed++; console.log(`  PASS  ${name}`); }

test('event envelope null ve ilkel context girdilerini güvenli biçimde normalleştirir', () => {
  assert.deepEqual(normalizeBrowserEventContext(null), {
    tabId: '', generation: 0, mediaId: '', acquisitionId: '', operationId: '',
  });
  assert.equal(createBrowserEventEnvelope('probe', null).type, 'probe');
  assert.doesNotThrow(() => normalizeBrowserEventContext(Symbol('x')));
});

test('session migration doğrudan kullanıldığında da güncel sürümü bildirir', () => {
  const migrated = migrateBrowserSession({ version: 1, tabs: [] });
  assert.equal(migrated.version, 8);
  assert.equal(migrated.cleanExit, null);
});

test('medya zaman sınırı saniye sözleşmesini ve uzun yayınları korur', () => {
  const raw = { url: 'https://example.com/video', position: 24 * 3600, duration: 72 * 3600 };
  assert.equal(normalizeSessionTab(raw).position, 24 * 3600);
  assert.equal(normalizeClosedBrowserTab(raw).duration, 72 * 3600);
});

test('scheduler geçersiz zamanları 00:00 cue olarak üretmez', () => {
  assert.deepEqual(normalizeCues([{ start: NaN, end: 2, text: 'x' }]), []);
  assert.deepEqual(normalizeCues([{ start: 0, end: Infinity, text: 'x' }]), []);
  assert.equal(normalizeCues([{ start: '1.5', end: '2.5', text: 'x' }])[0].start, 1.5);
});

test('boş veya ayrıştırılamayan çeviri dağıtımı güvenli boş sonuç verir', () => {
  const sentence = { pieces: [{ cueId: '1', start: 0, end: 1, text: 'Hello' }] };
  assert.deepEqual(distributeTranslation(sentence, ''), []);
  assert.deepEqual(distributeTranslation(sentence, '   '), []);
});

test('tamamlanmış ayrı cümleler zaman aralığı kısa olsa da birleştirilmez', () => {
  const rows = assembleCueSentences([
    { start: 0, end: 1, text: 'First sentence.' },
    { start: 1.5, end: 2, text: 'Second sentence.' },
  ], { maxGap: 1 });
  assert.equal(rows.length, 2);
});

test('transcript saati sonlu olmayan değerlerde bozuk metin üretmez', () => {
  assert.equal(transcriptClock(Infinity), '00:00');
  assert.equal(transcriptClock(-Infinity), '00:00');
  assert.equal(transcriptClock(NaN), '00:00');
});

test('geçerli Unicode alan adları URL standardıyla punycode origin olur', () => {
  assert.equal(permissionOrigin('https://bücher.example/path'), 'https://xn--bcher-kva.example');
  assert.equal(permissionOrigin('https://xn--example-9ua.com'), '');
});

test('ayar dışa aktarımı adında ek bulunan API anahtarı alanlarını da temizler', () => {
  const store = new SafeSecretStore({ fields: [] });
  const exported = store.forExport({ custom: { myApiKeyBackup: 'secret', tokenBudget: 2048, theme: 'dark' } });
  assert.deepEqual(exported, { custom: { tokenBudget: 2048, theme: 'dark' } });
});

test('font geçici dizini temizliği asıl işlem hatasını maskelemez', () => {
  const primary = new Error('ffmpeg failed');
  const failingFs = { rmSync() { throw new Error('cleanup failed'); } };
  assert.doesNotThrow(() => cleanupExtractedFontDir('/tmp/whisper-fonts-case', primary, failingFs, '/tmp'));
  assert.throws(() => cleanupExtractedFontDir('/tmp/whisper-fonts-case', null, failingFs, '/tmp'), /cleanup failed/);
});

console.log(`report89 audit regressions: ${passed}/${passed}`);
