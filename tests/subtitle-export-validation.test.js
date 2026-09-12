const assert = require('node:assert/strict');
const { cuesToSrt, cuesToVtt } = require('../src/browser-subtitles');
const { validateSubtitleExport } = require('../src/subtitle-export-validation');

const cues = [
  { start: 0.125, end: 2.75, text: 'Türkçe: ğüşiöç İ — özel karakter' },
  { start: 3, end: 4.5, text: 'İkinci satır' },
];

const srt = cuesToSrt(cues);
const srtResult = validateSubtitleExport(srt, Buffer.from(`\uFEFF${srt}`, 'utf8'), 'çeviri.srt');
assert.equal(srtResult.cueCount, 2);
assert.equal(srtResult.bom, true);

const vtt = cuesToVtt(cues);
const vttResult = validateSubtitleExport(vtt, Buffer.from(vtt, 'utf8'), 'çeviri.vtt');
assert.equal(vttResult.format, 'vtt');
assert.equal(vttResult.bom, false);
for (const output of [cuesToSrt([{ start: 0, end: 1, text: 'Bir\nİki' }]),
  cuesToVtt([{ start: 0, end: 1, text: 'Bir\nİki' }])]) {
  assert.equal(/(^|[^\r])\n/u.test(output), false, 'çok satırlı cue karma LF/CRLF üretti');
}

const ass = `[Script Info]\nScriptType: v4.00+\n\n[Events]\nFormat: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\nDialogue: 0,0:00:00.12,0:00:02.75,Default,,0,0,0,,Türkçe ğüşiöç İ`;
assert.equal(validateSubtitleExport(ass, Buffer.from(`\uFEFF${ass}`, 'utf8'), 'çeviri.ass').format, 'ass');

assert.throws(() => validateSubtitleExport(srt, Buffer.from(srt, 'utf8'), 'çeviri.srt'), /BOM/);
assert.throws(() => validateSubtitleExport(vtt, Buffer.from(`\uFEFF${vtt}`, 'utf8'), 'çeviri.vtt'), /BOM/);
assert.throws(() => validateSubtitleExport(srt, Buffer.from(`\uFEFF${cuesToSrt(cues.slice(0, 1))}`, 'utf8'), 'çeviri.srt'), /Cue sayısı/);
assert.throws(() => validateSubtitleExport(srt, Buffer.from(`\uFEFF${srt.replace('00:00:00,125', '00:00:01,125')}`, 'utf8'), 'çeviri.srt'), /zaman kodu/);

console.log('subtitle-export-validation: SRT/VTT/ASS UTF-8, BOM, cue ve zaman bütünlüğü geçti');
