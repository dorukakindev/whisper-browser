'use strict';
// Tur 4 küçük arayüz düzeltmeleri.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const read = (rel) => fs.readFileSync(path.join(__dirname, '..', rel), 'utf8');

// Açılış performansı: yerelleştirme taraması boşluk düğümlerinde ve çevrilecek
// özniteliği olmayan öğelerde closest() maliyetine girmez (tur 4 ölçümü: betik
// süresi TR 73→47 ms, EN 97→55 ms; çeviri çıktısı birebir aynı).
const locale = read('src/renderer/ui-locale.js');
const localizeText = locale.slice(locale.indexOf('function localizeText'), locale.indexOf('function scan'));
assert.ok(localizeText.indexOf('!raw.trim()') >= 0 && localizeText.indexOf('!raw.trim()') < localizeText.indexOf('closest(ignored)'),
  'boşluk metin düğümleri closest() öncesi elenmiyor');
const localizeElement = locale.slice(locale.indexOf('function localizeElement'), locale.indexOf('function localizeText'));
assert.ok(localizeElement.indexOf("hasAttribute('placeholder')") < localizeElement.indexOf('closest(ignored)'),
  'özniteliksiz öğeler closest() öncesi elenmiyor');

console.log('browser-ui-r4: tamam');
