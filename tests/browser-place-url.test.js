const assert = require('assert');
const { safePlaceUrl } = require('../src/browser-place-url');

assert.equal(safePlaceUrl('https://site.test/#/watch?id=7'), 'https://site.test/#/watch?id=7');
assert.equal(safePlaceUrl('https://site.test/#!/watch?id=7&token=secret'), 'https://site.test/#!/watch?id=7');
assert.equal(safePlaceUrl('https://site.test/watch#t=120s'), 'https://site.test/watch#t=120s');
assert.equal(safePlaceUrl('https://site.test/?q=ok&client_secret=nope#access_token=nope'), 'https://site.test/?q=ok');
assert.equal(safePlaceUrl('https://user:pass@site.test/path'), 'https://site.test/path');
assert.equal(safePlaceUrl('javascript:alert(1)'), '');
console.log('browser-place-url: 6 test');
