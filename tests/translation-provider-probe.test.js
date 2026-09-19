'use strict';

const assert = require('assert');
const {
  classifyProbeFailure,
  probeTranslationProvider,
} = require('../src/translation-provider-probe');

let passed = 0;
async function test(name, fn) {
  try {
    await fn();
    passed += 1;
    console.log(`  PASS  ${name}`);
  } catch (error) {
    console.error(`  FAIL  ${name}: ${error.stack || error.message}`);
    process.exitCode = 1;
  }
}

function response(status, body, headers = {}) {
  return new Response(typeof body === 'string' ? body : JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', ...headers },
  });
}

(async () => {
  await test('a tiny completion verifies endpoint, key and selected model', async () => {
    let request;
    const result = await probeTranslationProvider({
      endpoint: 'https://provider.example/v1/chat/completions',
      apiKey: 'secret-key',
      model: 'model-test',
      fetchImpl: async (_url, options) => {
        request = options;
        return response(200, { choices: [{ message: { content: 'OK' } }] });
      },
    });
    assert.equal(result.ok, true);
    assert.equal(result.status, 200);
    assert.equal(request.headers.Authorization, 'Bearer secret-key');
    const body = JSON.parse(request.body);
    assert.equal(body.model, 'model-test');
    assert.equal(body.messages[0].content, 'Reply with exactly OK.');
    assert.equal(body.max_tokens, undefined);
  });

  await test('error responses are reduced to safe actionable codes', async () => {
    const cases = [
      [401, { error: { message: 'bad key' } }, 'authentication'],
      [429, { error: { message: 'slow down' } }, 'rate_limit'],
      [503, { error: { message: 'No available channel for model x' } }, 'model_unavailable'],
      [503, { error: { message: 'maintenance' } }, 'provider_unavailable'],
      [404, { error: { message: 'missing' } }, 'endpoint_not_found'],
    ];
    for (const [status, body, code] of cases) {
      const result = await probeTranslationProvider({
        endpoint: 'https://provider.example/v1/chat/completions', apiKey: 'secret', model: 'x',
        fetchImpl: async () => response(status, body),
      });
      assert.equal(result.code, code);
      assert.equal(JSON.stringify(result).includes('secret'), false);
    }
  });

  await test('invalid successful payload and network failure remain distinct', async () => {
    const invalid = await probeTranslationProvider({
      endpoint: 'https://provider.example/v1/chat/completions', apiKey: 'secret', model: 'x',
      fetchImpl: async () => response(200, { choices: [] }),
    });
    assert.equal(invalid.code, 'invalid_response');
    const network = await probeTranslationProvider({
      endpoint: 'https://provider.example/v1/chat/completions', apiKey: 'secret', model: 'x',
      fetchImpl: async () => { throw new Error('socket carried sensitive detail'); },
    });
    assert.deepStrictEqual(network.code, 'network');
    assert.equal(JSON.stringify(network).includes('sensitive'), false);
  });

  await test('loopback providers may be tested without a key', async () => {
    const result = await probeTranslationProvider({
      endpoint: 'http://127.0.0.1:1234/v1/chat/completions', model: 'local-model',
      fetchImpl: async (_url, options) => {
        assert.equal(options.headers.Authorization, undefined);
        return response(200, { choices: [{ message: { content: 'OK' } }] });
      },
    });
    assert.equal(result.ok, true);
  });

  await test('unsafe endpoints and oversized responses are rejected without reading secrets back', async () => {
    const insecure = await probeTranslationProvider({
      endpoint: 'http://provider.example/v1/chat/completions', apiKey: 'secret', model: 'x',
      fetchImpl: async () => { throw new Error('must not fetch'); },
    });
    assert.equal(insecure.code, 'invalid_config');
    const credentialUrl = await probeTranslationProvider({
      endpoint: 'https://user:pass@provider.example/v1/chat/completions', apiKey: 'secret', model: 'x',
      fetchImpl: async () => { throw new Error('must not fetch'); },
    });
    assert.equal(credentialUrl.code, 'invalid_config');
    const oversized = await probeTranslationProvider({
      endpoint: 'https://provider.example/v1/chat/completions', apiKey: 'secret', model: 'x',
      fetchImpl: async () => response(200, 'x', { 'content-length': String(65 * 1024) }),
    });
    assert.equal(oversized.code, 'invalid_response');
  });

  await test('classification does not confuse generic server errors with model routing', () => {
    assert.equal(classifyProbeFailure(503, 'maintenance'), 'provider_unavailable');
    assert.equal(classifyProbeFailure(400, 'unknown model foo'), 'model_unavailable');
  });

  console.log(`\n${passed} provider probe tests passed.`);
})();
