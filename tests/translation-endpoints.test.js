const assert = require('assert');
const {
  SHUAI_ROUTES,
  resolveTranslationEndpoints,
  shouldFailoverTranslationStatus,
} = require('../src/translation-endpoints');

const preferred = 'https://oai.sb/v1';
const routes = resolveTranslationEndpoints(preferred);
assert.equal(routes.length, 4);
assert.equal(routes[0], preferred);
assert.deepEqual(new Set(routes), new Set(SHUAI_ROUTES));
assert.deepEqual(resolveTranslationEndpoints('https://api.example.com/v1/'), ['https://api.example.com/v1']);
assert.deepEqual(resolveTranslationEndpoints(''), SHUAI_ROUTES);

for (const status of [0, 404, 408, 425, 429, 500, 502, 503]) {
  assert.equal(shouldFailoverTranslationStatus(status), true, `HTTP ${status}`);
}
for (const status of [400, 401, 403, 413, 422]) {
  assert.equal(shouldFailoverTranslationStatus(status), false, `HTTP ${status}`);
}
assert.equal(shouldFailoverTranslationStatus(401, { sameProviderAliases: true }), true);
assert.equal(shouldFailoverTranslationStatus(403, { sameProviderAliases: true }), true);
assert.equal(shouldFailoverTranslationStatus(400, { sameProviderAliases: true }), false);

console.log('translation-endpoints: 20 test');
