const assert = require('node:assert/strict');
const { mergeBrowserStreamCues: merge } = require('../src/browser-subtitles');
const cue = (start, end, text, extra = {}) => ({ start, end, text, ...extra });
const complete = cue(10, 13, 'Cümle tamamlandı.');
assert.deepEqual(merge([complete], [cue(10, 12, 'Cümle'), cue(14, 15, 'Sonraki')]),
  [complete, cue(14, 15, 'Sonraki')], 'Toplu geç yanıt tamamlanmış metni geriletmemeli');
assert.deepEqual(merge([cue(10, 13, 'Yanlış')], [cue(10, 13, 'Doğru'), cue(14, 15, 'Sonraki')]),
  [cue(10, 13, 'Doğru'), cue(14, 15, 'Sonraki')], 'Toplu düzeltme eski satırı çoğaltmamalı');
const left = cue(4, 6, 'Devam eden cümle'), right = cue(6.05, 8, 'Devam eden cümle');
assert.deepEqual(merge([left], [right]), merge([], [left, right]), 'Parça gruplama sonucu değiştirmemeli');
assert.deepEqual(merge([complete], [cue(0, 1, 'Eksik parça'), complete]), [cue(0, 1, 'Eksik parça'), complete]);
for (const extra of [{ language: 'tr' }, { discontinuity: 1 }, { speaker: 'Başka konuşmacı' },
  { provenance: { streamKey: 'başka-video' } }]) {
  assert.equal(merge([cue(0, 2, 'Aynı')], [cue(0, 2, 'Aynı', extra)]).length, 2);
}
const previous = [cue(0, 2, 'Aynı')]; const copy = JSON.stringify(previous);
assert.equal(merge([], [cue(0, 2, 'Birinci replik'), cue(0, 2, 'İkinci replik')]).length, 2);
assert.equal(merge([cue(0, 2, 'Birinci', {id:'a'})], [cue(0, 2, 'İkinci', {id:'b'})]).length, 2);
merge(previous, [cue(1, 3, 'Aynı'), cue(4, 5, 'Son')]);
assert.equal(JSON.stringify(previous), copy, 'Eski görünüm dizisi değişmemeli');
console.log('Akış revizyonları: toplu/geç yanıt, tekrar, eksik parça ve dil/video sınırları geçti.');
