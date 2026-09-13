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

const preset = '<option value="https://codecraftapi.com/v1" data-default-model="gemini-3.7-flash">CodeCraftAPI · Gemini 3.7 Flash</option>';
assert.equal(html.split(preset).length - 1, 2,
  'CodeCraftAPI hem altyazı hem manga endpoint listesinde bulunmalı');
assert.match(html, /id="translateApiKey" placeholder="cc_\.\.\. \/ sk-\.\.\."/);

const rendererContext = vm.createContext({});
const helperStart = renderer.indexOf('function endpointPresetRecommendedModel(');
const helperEnd = renderer.indexOf('\n// Çeviri endpoint preset', helperStart);
assert(helperStart >= 0 && helperEnd > helperStart, 'CodeCraft model eşleme yardımcısı bulunamadı');
vm.runInContext(renderer.slice(helperStart, helperEnd), rendererContext);
assert.equal(rendererContext.endpointPresetRecommendedModel('https://codecraftapi.com/v1'), 'gemini-3.7-flash');
assert.equal(rendererContext.endpointPresetRecommendedModel('https://codecraftapi.com/v1/'), 'gemini-3.7-flash');
assert.equal(rendererContext.endpointPresetRecommendedModel('https://codecraftapi.com.evil.test/v1'), '');
assert.match(renderer, /updateTranslateEndpointUI\(true\)/);
assert.match(renderer, /updateMangaEndpointUI\(true\)/);

const mainContext = vm.createContext({ URL });
const endpointStart = main.indexOf('function safeTranslationEndpoint(');
const endpointEnd = main.indexOf('\nasync function readResponseBufferLimited(', endpointStart);
assert(endpointStart >= 0 && endpointEnd > endpointStart, 'Güvenli çeviri endpoint yardımcısı bulunamadı');
vm.runInContext(main.slice(endpointStart, endpointEnd), mainContext);
assert.equal(
  mainContext.safeTranslationEndpoint('https://codecraftapi.com/v1'),
  'https://codecraftapi.com/v1/chat/completions',
);
assert.equal(
  mainContext.safeTranslationEndpoint('https://codecraftapi.com/v1/chat/completions'),
  'https://codecraftapi.com/v1/chat/completions',
);

const migrationContext = vm.createContext({ URL });
const migrationStart = main.indexOf('function migrateSubtitleModelDefault(');
const migrationEnd = main.indexOf('\nfunction loadSettings(', migrationStart);
vm.runInContext(main.slice(migrationStart, migrationEnd), migrationContext);
const migrated = migrationContext.migrateSubtitleModelDefault({
  translate: { endpointPreset: 'https://codecraftapi.com/v1', model: 'gemini-3.7-flash' },
  ui: { translateEndpointPreset: 'https://codecraftapi.com/v1', translateModel: 'gemini-3.7-flash' },
});
assert.equal(migrated.translate.model, 'gemini-3.7-flash',
  'Shuai 3.8 geçişi CodeCraft modelini değiştirmemeli');
assert.equal(migrated.ui.translateModel, 'gemini-3.7-flash');

const secured = sanitizeSettings({
  translate: {
    endpointPreset: 'https://codecraftapi.com/v1',
    model: 'gemini-3.7-flash',
    apiKeyProfiles: '{"provider:codecraftapi":"cc-test-secret"}',
  },
  manga: {
    endpointPreset: 'https://codecraftapi.com/v1',
    model: 'gemini-3.7-flash',
    apiKeyProfiles: '{"provider:codecraftapi":"cc-manga-secret"}',
  },
}, { allowSecrets: true });
assert.equal(secured.translate.endpointPreset, 'https://codecraftapi.com/v1');
assert.equal(secured.translate.apiKeyProfiles, '{"provider:codecraftapi":"cc-test-secret"}');
const exported = JSON.stringify(publicSettings(secured));
assert.doesNotMatch(exported, /cc-test-secret|cc-manga-secret|apiKeyProfiles/);
assert.throws(() => sanitizeSettings({
  translate: { apiKeyProfiles: '{"__proto__":"saklanmamali"}' },
}, { allowSecrets: true }), /sağlayıcı kimliği güvenli değil/);

console.log('codecraft-provider: altyazı+manga preset, model eşleme, endpoint ve migration testleri geçti');
