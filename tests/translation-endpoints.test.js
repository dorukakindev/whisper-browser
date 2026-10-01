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

// Büyük-harf/karışık-şema Shuai URL'si aynı hostu iki kez listelemesin —
// routeKey (küçük host + arındırılmış path) kanonik rotayla eşleşir.
const upper = resolveTranslationEndpoints('https://OAI.SB/v1');
assert.equal(upper.length, 4);
assert.equal(upper[0], 'https://OAI.SB/v1');
assert.equal(new Set(upper.map((r) => new URL(r).hostname.toLowerCase())).size, 4);
const noisy = resolveTranslationEndpoints('HTTPS://OAI.SB/v1');
assert.equal(noisy.length, 4);
assert.equal(new Set(noisy.map((r) => new URL(r).hostname.toLowerCase())).size, 4);
// path büyük-küçük harfe DUYARLIDIR (URL spec): /V1 ≠ /v1 → alias dedupe
// etmez, host ikilenen fallback kalır (backend _route_key ile aynı).
assert.equal(resolveTranslationEndpoints('https://oai.sb/V1').length, 5);
// Shuai host + farklı path aynı anahtara düşer → yine tekilleştirilir.
assert.equal(resolveTranslationEndpoints('https://oai.sb/v1/').length, 4);
// Shuai host ama tanınmayan path → yine de tekilleştirilmezse host ikilenir;
// routeKey host+path birlikte karşılaştırır, /v2 serbest bırakılır.
const oddPath = resolveTranslationEndpoints('https://oai.sb/v9');
assert.equal(oddPath.length, 5);

for (const status of [0, 404, 408, 425, 500, 502, 503]) {
  assert.equal(shouldFailoverTranslationStatus(status), true, `HTTP ${status}`);
}
for (const status of [400, 401, 403, 413, 422, 429]) {
  assert.equal(shouldFailoverTranslationStatus(status), false, `HTTP ${status}`);
}
assert.equal(shouldFailoverTranslationStatus(401, { sameProviderAliases: true }), true);
assert.equal(shouldFailoverTranslationStatus(403, { sameProviderAliases: true }), true);
assert.equal(shouldFailoverTranslationStatus(400, { sameProviderAliases: true }), false);

console.log('translation-endpoints: 29 test');
