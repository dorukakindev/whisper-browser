'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const { JSDOM } = require('jsdom');
const { sanitizeSettings, publicSettings } = require('../src/settings-security');
const { providerCredentialScope } = require('../src/provider-api-keys');
const read = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
const endpoint = 'https://api.apinex.bond/v1', model = 'free/deepseek-v4-pro-0813';
const dom = new JSDOM(read('src/renderer/index.html'));
for (const id of ['translateEndpointPreset', 'mangaEndpointPreset']) {
  const option = [...dom.window.document.getElementById(id).options].find(o => o.value === endpoint);
  assert(option); assert.equal(option.dataset.defaultModel, model);
}
assert(dom.window.document.querySelector(`#translationModelSuggestions option[value="${model}"]`));
dom.window.close();
const renderer = read('src/renderer/renderer.js'), ctx = vm.createContext({});
vm.runInContext(renderer.slice(renderer.indexOf('function endpointPresetRecommendedModel('), renderer.indexOf('\n// Çeviri endpoint preset')), ctx);
assert.equal(ctx.endpointPresetRecommendedModel(endpoint + '/'), model);
assert.equal(ctx.endpointPresetRecommendedModel('https://api.apinex.bond.evil.test/v1'), '');
assert.equal(providerCredentialScope(endpoint), 'provider:apinex');
assert.equal(providerCredentialScope('custom', endpoint), 'provider:apinex');
assert.notEqual(providerCredentialScope('https://api.apinex.bond.evil.test/v1'), 'provider:apinex');
const main = read('src/main.js'), mainCtx = vm.createContext({ URL });
vm.runInContext(main.slice(main.indexOf('function safeTranslationEndpoint('), main.indexOf('\nasync function readResponseBufferLimited(')), mainCtx);
assert.equal(mainCtx.safeTranslationEndpoint(endpoint), endpoint + '/chat/completions');
const saved = sanitizeSettings({ translate: { endpointPreset: endpoint, model,
  apiKeyProfiles: JSON.stringify({'provider:apinex':'fixture-provider-key'}) },
  ui: { translateEndpointPreset: endpoint, translateModel: model },
  manga: { endpointPreset: endpoint, model } }, { allowSecrets: true });
assert.equal(saved.translate.endpointPreset, endpoint);
assert.equal(saved.ui.translateEndpointPreset, endpoint);
assert.equal(saved.translate.model, model);
assert.equal(saved.manga.endpointPreset, endpoint);
assert.doesNotMatch(JSON.stringify(publicSettings(saved)), /fixture-provider-key|apiKeyProfiles/);
console.log('apinex-provider: presets, model, route, key scope and settings roundtrip passed');
