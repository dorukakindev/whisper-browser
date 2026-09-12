'use strict';

const assert = require('node:assert/strict');
const {
  SUBTITLE_REDACTION,
  capturedCueTexts,
  redactCapturedCueText,
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

console.log('Tarayıcı tanı paketi altyazı metni gizlilik testleri geçti.');
