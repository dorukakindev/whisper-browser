'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { publicSettings, sanitizeSettings } = require('../src/settings-security');

const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'src', 'renderer', 'index.html'), 'utf8');
const renderer = fs.readFileSync(path.join(root, 'src', 'renderer', 'renderer.js'), 'utf8');
const main = fs.readFileSync(path.join(root, 'src', 'main.js'), 'utf8');

assert.match(html,
  /value="https:\/\/4sapi\.com\/v1" data-default-model="gpt-5\.4">4SAPI · GPT-5\.4 \/ Gemini 3\.8 Flash/,
  '4SAPI altyazı sağlayıcısı GPT-5.4 önerisiyle bulunmalı');
assert.match(html,
  /value="https:\/\/4sapi\.com\/v1" data-default-model="gemini-3\.8-flash">4SAPI · GPT-5\.4 \/ Gemini 3\.8 Flash/,
  '4SAPI manga sağlayıcısı Gemini 3.8 Flash önerisiyle bulunmalı');
assert.match(html, /id="translateModel"[^>]+list="translationModelSuggestions"/);
assert.match(html, /id="mangaModel"[^>]+list="translationModelSuggestions"/);
assert.match(html, /id="translationModelSuggestions"[\s\S]*?value="gpt-5\.4"[\s\S]*?value="gemini-3\.8-flash"/);

const rendererContext = vm.createContext({});
const helperStart = renderer.indexOf('function endpointPresetRecommendedModel(');
const helperEnd = renderer.indexOf('\n// Çeviri endpoint preset', helperStart);
assert(helperStart >= 0 && helperEnd > helperStart, 'Sağlayıcı model eşleme yardımcısı bulunamadı');
vm.runInContext(renderer.slice(helperStart, helperEnd), rendererContext);
assert.equal(rendererContext.endpointPresetRecommendedModel('https://4sapi.com/v1'), 'gpt-5.4');
assert.equal(rendererContext.endpointPresetRecommendedModel('https://4sapi.com/v1/'), 'gpt-5.4');
assert.equal(rendererContext.endpointPresetRecommendedModel({
  value: 'https://4sapi.com/v1',
  selectedOptions: [{ dataset: { defaultModel: 'gemini-3.8-flash' } }],
}), 'gemini-3.8-flash');
assert.equal(rendererContext.endpointPresetRecommendedModel('https://4sapi.com.evil.test/v1'), '');

const mainContext = vm.createContext({ URL });
const endpointStart = main.indexOf('function safeTranslationEndpoint(');
const endpointEnd = main.indexOf('\nasync function readResponseBufferLimited(', endpointStart);
assert(endpointStart >= 0 && endpointEnd > endpointStart, 'Güvenli çeviri endpoint yardımcısı bulunamadı');
vm.runInContext(main.slice(endpointStart, endpointEnd), mainContext);
assert.equal(mainContext.safeTranslationEndpoint('https://4sapi.com/v1'),
  'https://4sapi.com/v1/chat/completions');
assert.equal(mainContext.safeTranslationEndpoint('https://4sapi.com/v1/chat/completions'),
  'https://4sapi.com/v1/chat/completions');

const secured = sanitizeSettings({
  translate: {
    endpointPreset: 'https://4sapi.com/v1',
    model: 'gpt-5.4',
    apiKeyProfiles: '{"provider:4sapi":"4s-test-secret"}',
  },
  manga: {
    endpointPreset: 'https://4sapi.com/v1',
    model: 'gemini-3.8-flash',
    apiKeyProfiles: '{"provider:4sapi":"4s-manga-secret"}',
  },
}, { allowSecrets: true });
assert.equal(secured.translate.endpointPreset, 'https://4sapi.com/v1');
assert.equal(secured.translate.model, 'gpt-5.4');
assert.equal(secured.manga.model, 'gemini-3.8-flash');
assert.equal(secured.translate.apiKeyProfiles, '{"provider:4sapi":"4s-test-secret"}');
const exported = JSON.stringify(publicSettings(secured));
assert.doesNotMatch(exported, /4s-test-secret|4s-manga-secret|apiKeyProfiles/);

console.log('foursapi-provider: altyazı+manga preset, iki model, endpoint ve gizli anahtar profili geçti');
