'use strict';
const { decodeSubtitleBuffer } = require('./browser-textutil');
const ENCODINGS = ['auto', 'utf-8', 'windows-1254', 'windows-1252', 'utf-16le', 'utf-16be'];
function decode(buffer, encoding) {
  if (!ENCODINGS.includes(encoding)) throw new Error('Kodlama seçimi geçersiz.');
  return encoding === 'auto' ? decodeSubtitleBuffer(buffer).text : new TextDecoder(encoding).decode(buffer).replace(/^\uFEFF/, '');
}
function preview(buffer) { return ENCODINGS.map(encoding => ({ encoding, text: decode(buffer, encoding).slice(0, 1400) })); }
module.exports = { decode, preview, ENCODINGS };
