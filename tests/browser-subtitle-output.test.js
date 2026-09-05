const assert = require('node:assert/strict');
const {
  buildBrowserSubtitleDocument,
  cuesToAss,
  validateBrowserSubtitleDocument,
} = require('../src/browser-subtitle-output');
const { parseSubtitlePayload } = require('../src/browser-subtitles');

const cues = [
  { id: 'one', start: 0.125, end: 2.875, text: 'Türkçe: ğüşiöç İ — “özel”, virgül' },
  { id: 'two', start: 3.001, end: 5.499, text: 'İkinci satır\nalt satır & <işaret>' },
];

for (const format of ['srt', 'vtt', 'ass']) {
  const output = buildBrowserSubtitleDocument(cues, format);
  assert.equal(output.format, format);
  assert.equal(output.extension, `.${format}`);
  const verified = validateBrowserSubtitleDocument(output.text, format, cues);
  assert.equal(verified.ok, true, `${format} round-trip başarısız`);
  assert.equal(verified.cues.length, cues.length);
  assert.match(output.text, /ğüşiöç İ/);
}

const srt = buildBrowserSubtitleDocument(cues, 'srt');
const parsedSrt = parseSubtitlePayload(srt.text, '', 'test.srt').cues;
assert.equal(parsedSrt[0].text, cues[0].text);
assert.equal(parsedSrt[1].text, cues[1].text);

const vtt = buildBrowserSubtitleDocument(cues, 'vtt');
const parsedVtt = parseSubtitlePayload(vtt.text, '', 'test.vtt').cues;
assert.equal(parsedVtt[0].text, cues[0].text);
assert.equal(parsedVtt[1].text, cues[1].text);

const ass = cuesToAss([{ start: 1, end: 2, text: 'Virgül, süslü {metin}\nalt satır' }]);
assert.match(ass, /Dialogue: 0,0:00:01\.00,0:00:02\.00/);
assert.match(ass, /Virgül, süslü \\{metin\\}\\Nalt satır/);

const corrupted = srt.text.replace('00:00:02,875', '00:00:12,875');
assert.equal(validateBrowserSubtitleDocument(corrupted, 'srt', cues).ok, false);
assert.throws(() => buildBrowserSubtitleDocument([], 'srt'), /altyazı yok/i);

console.log('Browser subtitle output: SRT/VTT/ASS round-trip, Unicode and timing validation passed.');
