'use strict';

const assert = require('assert');
const { decodeSubtitleBuffer } = require('../src/browser-textutil');

let passed = 0;
function test(name, fn) {
  fn();
  passed++;
  console.log(`  PASS  ${name}`);
}

test('az Türkçeli CP1254 metindeki tesadüfi UTF-8 çifti metni bozmaz', () => {
  const input = Buffer.from([0xc7, 0x85, 0x6f, 0x6b, 0x20, 0x67, 0xfc, 0x7a, 0x65, 0x6c]);
  assert.deepEqual(decodeSubtitleBuffer(input), { text: 'Ç…ok güzel', note: 'cp1254' });
});

test('gerçek UTF-8 Türkçe ve tek bozuk bayt UTF-8 olarak kalır', () => {
  const input = Buffer.concat([Buffer.from('Çok güzel', 'utf8'), Buffer.from([0xff])]);
  assert.deepEqual(decodeSubtitleBuffer(input), { text: 'Çok güzel', note: 'utf-8 bozuk bayt atlandı' });
});

test('CP1254 Türkçe noktalama sınırları doğru çözülür', () => {
  for (const [bytes, expected] of [
    [[0xd6, 0x96, 0x20, 0x69, 0x79, 0x69, 0x20, 0xfc], 'Ö– iyi ü'],
    [[0xdc, 0x97, 0x20, 0x74, 0x61, 0x6d, 0x61, 0x6d, 0x20, 0xfc], 'Ü— tamam ü'],
    [[0xdd, 0x27, 0x64, 0x65], "İ'de"],
  ]) assert.equal(decodeSubtitleBuffer(Buffer.from(bytes)).text, expected);
});

test('BOM ve UTF-16 yolları korunur', () => {
  assert.equal(decodeSubtitleBuffer(Buffer.from('\ufeffMerhaba', 'utf8')).text, 'Merhaba');
  assert.equal(decodeSubtitleBuffer(Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from('Türkçe', 'utf16le')])).text, 'Türkçe');
});

console.log(`browser-textutil: ${passed} test geçti`);
