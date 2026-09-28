'use strict';
const { decodeSubtitleBuffer } = require('./browser-textutil');
const ENCODINGS = [
  'auto', 'utf-8', 'windows-1254', 'windows-1252', 'utf-16le', 'utf-16be',
  // Sağlayıcı/arşiv altyazılarında görülen eski kodlamalar (tam-ICU
  // TextDecoder destekler; otomatik seçici de bunları dener — R133).
  'windows-1250', 'windows-1251', 'windows-1253', 'windows-1255', 'windows-1256',
  'windows-1257', 'windows-1258', 'windows-874', 'iso-8859-5', 'iso-8859-7',
  'koi8-r', 'gb18030', 'big5', 'shift_jis', 'euc-jp', 'iso-2022-jp', 'euc-kr',
];
function decode(buffer, encoding) {
  if (!ENCODINGS.includes(encoding)) throw new Error('Kodlama seçimi geçersiz.');
  return encoding === 'auto' ? decodeSubtitleBuffer(buffer).text : new TextDecoder(encoding).decode(buffer).replace(/^\uFEFF/, '');
}
function preview(buffer) { return ENCODINGS.map(encoding => ({ encoding, text: decode(buffer, encoding).slice(0, 1400) })); }
module.exports = { decode, preview, ENCODINGS };
