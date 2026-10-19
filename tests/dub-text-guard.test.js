const assert = require('node:assert/strict');
const {safeShortening:safe} = require('../src/dub-text-guard');
assert.equal(safe('Bu uzun bir cümledir.', 'Bu bir cümle.'),true);
assert.equal(safe('12 kişi, 12 saat bekledi.', '12 kişi bekledi.'),false);
assert.equal(safe('Ankara’da hiç kimse yok.', 'İzmir’de kimse yok.'),false);
assert.equal(safe('Bu doğru değil.', 'Bu doğru.'),false);
assert.equal(safe('12 kişi geldi.', '13 kişi geldi.'),false);
console.log('dub-text-guard: repeated numbers, names and explicit negation preserved');
