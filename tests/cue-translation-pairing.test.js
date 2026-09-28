// translationsForCues — aynı zaman aralığını paylaşan cue'ların ayrı
// çeviri satırlarıyla eşleşmesi; birleşik (merged) satırın yeniden
// kullanımının korunması.
const fs = require('fs');
const path = require('path');
const assert = require('node:assert');

const src = fs.readFileSync(path.resolve(__dirname, '..', 'src/renderer/renderer.js'), 'utf8');
const s = src.indexOf('function translationsForCues');
const e = src.indexOf('\n}\n', s) + 2;
assert(s > 0 && e > s, 'translationsForCues bulunamadı');
// eslint-disable-next-line no-eval
eval(src.slice(s, e));

// 1) Aynı [start,end] aralığındaki iki cue ayrı çeviri satırları alır
//    (regresyon: ikisi de ilk satıra düşüyordu).
{
  const cues = [
    { start: 10, end: 13, text: 'TOKYO STATION' },
    { start: 10, end: 13, text: 'Where did you go?' },
  ];
  const tr = [
    { start: 10, end: 13, text: 'TOKYO İSTASYONU' },
    { start: 10, end: 13, text: 'Nereye gittin?' },
  ];
  assert.deepStrictEqual(translationsForCues(cues, tr), ['TOKYO İSTASYONU', 'Nereye gittin?']);
}

// 2) Birleşik balon: tek çeviri satırı iki cue'yu da kaplar — başka aday
//    yoksa iki cue da aynı birleşik metni alır (kapsanmış sayılır).
{
  const cues = [
    { start: 10, end: 11, text: "I don't" },
    { start: 11, end: 13, text: 'know.' },
  ];
  const tr = [{ start: 10, end: 13, text: 'Bilmiyorum.' }];
  assert.deepStrictEqual(translationsForCues(cues, tr), ['Bilmiyorum.', 'Bilmiyorum.']);
}

// 3) Aday sayısı cue'dan azsa kuyruktaki cue kullanılmış satıra düşebilir;
//    fakat üçüncü bir eş-aday varsa sıradaki kullanılmamış seçilir.
{
  const cues = [
    { start: 0, end: 2, text: 'a' },
    { start: 0, end: 2, text: 'b' },
    { start: 0, end: 2, text: 'c' },
  ];
  const tr = [
    { start: 0, end: 2, text: 'A' },
    { start: 0, end: 2, text: 'B' },
    { start: 0, end: 2, text: 'C' },
  ];
  assert.deepStrictEqual(translationsForCues(cues, tr), ['A', 'B', 'C']);
}

// 4) Zamanla kayan eşleşme eski davranışı korur (tek cue → en iyi overlap).
{
  const cues = [{ start: 20, end: 22, text: 'hi' }];
  const tr = [
    { start: 0, end: 2, text: 'eski' },
    { start: 20.5, end: 21.5, text: 'selam' },
  ];
  assert.deepStrictEqual(translationsForCues(cues, tr), ['selam']);
}

// 5) Örtüşme eşiğin altındaysa eşleşme olmaz.
{
  const cues = [{ start: 0, end: 10, text: 'long' }];
  const tr = [{ start: 0, end: 0.05, text: 'k' }];
  assert.deepStrictEqual(translationsForCues(cues, tr), ['']);
}

console.log('cue-translation-pairing: aynı-aralık eşleşmesi, merged yeniden kullanım ve eşik davranışı geçti');
