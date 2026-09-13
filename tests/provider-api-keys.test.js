'use strict';

const assert = require('node:assert/strict');
const {
  MAX_PROFILES,
  normalizeProviderKeyProfiles,
  providerCredentialScope,
  providerKeyForScope,
  serializeProviderKeyProfiles,
  updateProviderKeyProfile,
} = require('../src/provider-api-keys');

const shuai = [
  'https://api.shuaiapi.com/v1',
  'https://oai.sb/v1',
  'https://api.oai.sb/v1',
  'https://cdn.shuaiapi.com/v1',
].map((endpoint) => providerCredentialScope(endpoint));
assert.equal(new Set(shuai).size, 1, 'Aynı Shuai hesabının rotaları tek anahtar paylaşmalı');
assert.equal(shuai[0], 'provider:shuaiapi');
assert.equal(providerCredentialScope('https://codecraftapi.com/v1'), 'provider:codecraftapi');
assert.equal(providerCredentialScope('custom', 'https://codecraftapi.com/v1/'), 'provider:codecraftapi');
assert.equal(providerCredentialScope('inherit', '', 'https://codecraftapi.com/v1'), 'provider:codecraftapi');
assert.notEqual(providerCredentialScope('https://api.openai.com/v1'), 'provider:codecraftapi');
assert.notEqual(
  providerCredentialScope('custom', 'https://bir.example/v1'),
  providerCredentialScope('custom', 'https://iki.example/v1'),
);

let profiles = {};
profiles = updateProviderKeyProfile(profiles, 'provider:shuaiapi', 'shuai-key', true);
assert.equal(providerKeyForScope(profiles, 'provider:shuaiapi'), 'shuai-key');
assert.equal(providerKeyForScope(profiles, 'provider:codecraftapi'), '');
profiles = updateProviderKeyProfile(profiles, 'provider:codecraftapi', 'cc-key', true);
assert.equal(providerKeyForScope(profiles, 'provider:codecraftapi'), 'cc-key');
assert.equal(providerKeyForScope(profiles, 'provider:shuaiapi'), 'shuai-key');
profiles = updateProviderKeyProfile(profiles, 'provider:codecraftapi', '', true);
assert.equal(providerKeyForScope(profiles, 'provider:codecraftapi'), '');
assert.equal(providerKeyForScope(profiles, 'provider:shuaiapi'), 'shuai-key');

const serialized = serializeProviderKeyProfiles({ z: ' z-key ', a: 'a-key' });
assert.equal(serialized, '{"a":"a-key","z":"z-key"}');
assert.deepEqual(normalizeProviderKeyProfiles('{bozuk'), {});
assert.deepEqual(normalizeProviderKeyProfiles('{"__proto__":"saklanmamali","provider:openai":"ok"}'), {
  'provider:openai': 'ok',
});
assert.deepEqual(updateProviderKeyProfile({}, '__proto__', 'saklanmamali', true), {});
assert.equal(providerKeyForScope({ '__proto__': 'saklanmamali' }, '__proto__'), '');
assert.equal(Object.keys(normalizeProviderKeyProfiles(Object.fromEntries(
  Array.from({ length: MAX_PROFILES + 5 }, (_, index) => [`scope:${index}`, `key:${index}`]),
))).length, MAX_PROFILES);

console.log('provider-api-keys: sağlayıcı kapsamı, geçiş, temizleme ve sınırlar geçti');
