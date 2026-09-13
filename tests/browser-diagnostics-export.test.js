'use strict';

const assert = require('node:assert/strict');
const {
  LOCAL_PATH_REDACTION,
  SUBTITLE_REDACTION,
  capturedCueTexts,
  redactCapturedCueText,
  redactBrowserDiagnosticsText,
  sanitizeDiagnosticsSecrets,
  sanitizeDiagnosticsAgainstCueText,
} = require('../src/browser-diagnostics-export');

const buffers = new Map([
  ['stream-a', [
    { text: 'Bu kullanıcıya ait gizli altyazı cümlesidir.' },
    { text: 'No' },
  ]],
]);
assert.deepEqual(capturedCueTexts(buffers), [
  'Bu kullanıcıya ait gizli altyazı cümlesidir.',
  'No',
]);
assert.equal(
  redactCapturedCueText('Hata: Bu kullanıcıya ait gizli altyazı cümlesidir.', capturedCueTexts(buffers)),
  `Hata: ${SUBTITLE_REDACTION}`,
);
assert.equal(redactCapturedCueText('Normal Node tanısı', ['No']), 'Normal Node tanısı');
assert.equal(redactCapturedCueText('No', ['No']), SUBTITLE_REDACTION);

const sanitized = sanitizeDiagnosticsAgainstCueText({
  activity: { message: 'Hata: Bu kullanıcıya ait gizli altyazı cümlesidir.' },
  recent: [{ detail: 'No' }],
  counts: { parsed: 1 },
}, buffers);
assert.doesNotMatch(JSON.stringify(sanitized), /gizli altyazı cümlesidir|"No"/u);
assert.equal(sanitized.counts.parsed, 1);
assert.equal(sanitized.activity.message, `Hata: ${SUBTITLE_REDACTION}`);

const sensitiveTextCases = [
  ['Windows yolu', 'Dosya okunamadı: C:\\Users\\K\\Videos\\gizli.srt erişilemedi',
    ['C:\\Users\\K', 'gizli.srt']],
  ['boşluklu tırnaklı Windows yolu', 'Konum "D:\\Özel klasör\\video altyazısı.srt" açılamadı',
    ['D:\\Özel klasör', 'video altyazısı.srt']],
  ['UNC yolu', 'Paylaşım: \\\\sunucu\\gizli-paylasim\\altyazi.srt',
    ['sunucu', 'gizli-paylasim', 'altyazi.srt']],
  ['Linux ev yolu', 'Dosya /home/kullanici/private/subtitle.srt okunamadı',
    ['/home/kullanici', 'private/subtitle.srt']],
  ['macOS ev yolu', 'Dosya /Users/kullanici/private/subtitle.srt okunamadı',
    ['/Users/kullanici', 'private/subtitle.srt']],
  ['file URL', 'Kaynak file:///C:/Users/K/private/subtitle.srt açılamadı',
    ['C:/Users/K', 'private/subtitle.srt']],
  ['Bearer kimliği', 'authorization: Bearer eyJhbGciOiJIUzI1NiJ9.SECRET',
    ['eyJhbGciOiJIUzI1NiJ9', 'SECRET']],
  ['Basic kimliği', 'authorization=Basic dXNlcjpwYXNz',
    ['dXNlcjpwYXNz']],
  ['bağımsız Bearer', 'Sağlayıcı Bearer sk-secret-token değerini reddetti',
    ['sk-secret-token']],
  ['API anahtarı', 'Sağlayıcı hatası: api_key=sk-abc123SECRET geçersiz',
    ['sk-abc123SECRET']],
  ['URL userinfo', 'İstek reddedildi: https://user:pass123@cdn.example.com/seg.m4s?sig=Z9',
    ['user', 'pass123', 'Z9']],
];
for (const [name, input, forbidden] of sensitiveTextCases) {
  const output = redactBrowserDiagnosticsText(input);
  for (const secret of forbidden) {
    assert(!output.includes(secret), `${name}: hassas değer kaldı: ${output}`);
  }
}
assert(redactBrowserDiagnosticsText('C:\\Users\\K\\secret.srt').includes(LOCAL_PATH_REDACTION));
assert.equal(
  redactBrowserDiagnosticsText('İstek: https://cdn.test/Users/shared/sub.vtt?token=secret&lang=tr'),
  'İstek: https://cdn.test/Users/shared/sub.vtt?lang=tr',
  'normal HTTPS yolu yerel ev yolu sanılıp gereksiz gizlendi',
);
assert.equal(redactBrowserDiagnosticsText('Normal tanı metni korunur.'), 'Normal tanı metni korunur.');

const deepSecrets = sanitizeDiagnosticsSecrets({
  acquisition: {
    mediaId: 'https://user:pass@cdn.test/video?token=SECRET',
    stages: [{ reason: 'Dosya C:\\Users\\K\\private\\altyazi.srt açılamadı' }],
  },
  coverage: [{ streamKey: 'https://cdn.test/sub.vtt?sig=SIGNED',
    failures: [{ error: 'authorization: Bearer LIVE_TOKEN' }] }],
});
const deepJson = JSON.stringify(deepSecrets);
for (const forbidden of ['user', 'pass', 'SECRET', 'C:\\Users\\K', 'altyazi.srt', 'SIGNED', 'LIVE_TOKEN']) {
  assert(!deepJson.includes(forbidden), `derin tanı sansüründe hassas değer kaldı: ${forbidden}`);
}

console.log('Tarayıcı tanı paketi altyazı metni gizlilik testleri geçti.');
