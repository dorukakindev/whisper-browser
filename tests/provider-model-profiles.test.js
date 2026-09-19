'use strict';

const assert = require('assert');
const {
  addProviderModel,
  normalizeProviderModelProfiles,
  providerModelsForScope,
  removeProviderModel,
  serializeProviderModelProfiles,
} = require('../src/provider-model-profiles');

let passed = 0;
function test(name, fn) {
  try {
    fn();
    passed += 1;
    console.log(`  PASS  ${name}`);
  } catch (error) {
    console.error(`  FAIL  ${name}: ${error.stack || error.message}`);
    process.exitCode = 1;
  }
}

test('models are saved per provider without cross-provider leakage', () => {
  let profiles = addProviderModel({}, 'https://a.example/v1', 'model-a');
  profiles = addProviderModel(profiles, 'https://b.example/v1', 'model-b');
  assert.deepStrictEqual(providerModelsForScope(profiles, 'https://a.example/v1'), ['model-a']);
  assert.deepStrictEqual(providerModelsForScope(profiles, 'https://b.example/v1'), ['model-b']);
});

test('duplicate models are stable and removable', () => {
  let profiles = addProviderModel({}, 'provider', 'gemini-test');
  profiles = addProviderModel(profiles, 'provider', 'gemini-test');
  assert.deepStrictEqual(providerModelsForScope(profiles, 'provider'), ['gemini-test']);
  profiles = removeProviderModel(profiles, 'provider', 'gemini-test');
  assert.deepStrictEqual(profiles, {});
});

test('serialized settings round-trip and normalize Unicode', () => {
  const serialized = serializeProviderModelProfiles({ provider: ['gpt-test', 'gpt-test'] });
  assert.deepStrictEqual(normalizeProviderModelProfiles(serialized, { strict: true }), {
    provider: ['gpt-test'],
  });
});

test('strict mode rejects malformed and oversized model records', () => {
  assert.throws(() => normalizeProviderModelProfiles('{', { strict: true }), /JSON/);
  assert.throws(() => normalizeProviderModelProfiles({ provider: ['x'.repeat(301)] }, { strict: true }), /Model adı/);
  assert.throws(() => normalizeProviderModelProfiles(JSON.parse('{"__proto__":["x"]}'), { strict: true }), /geçersiz/);
});

console.log(`\n${passed} provider model profile test passed.`);
