const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const main = fs.readFileSync(path.join(__dirname, '../src/main.js'), 'utf8');
const html = fs.readFileSync(path.join(__dirname, '../src/renderer/index.html'), 'utf8');
const backend = fs.readFileSync(path.join(__dirname, '../backend/transcribe.py'), 'utf8');
const context = vm.createContext({ URL });
vm.runInContext(main.slice(main.indexOf('function migrateSubtitleModelDefault('), main.indexOf('\nfunction loadSettings(')), context);
const migrate = context.migrateSubtitleModelDefault;
const input = { translate: { model: 'gemini-3.7-flash', endpointPreset: 'https://api.shuaiapi.com/v1', apiKey: 'fake' },
  ui: { translateModel: 'gemini-3.7-flash' }, manga: { model: 'gpt-5.4-mini', apiKey: 'separate-fake' } };
const output = migrate(input);
assert.equal(output.translate.model, 'gemini-3.8-flash');
assert.equal(output.ui.translateModel, 'gemini-3.8-flash');
assert.equal(output.translate.apiKey, input.translate.apiKey);
assert.equal(output.manga, input.manga);
assert.equal(input.translate.model, 'gemini-3.7-flash');
assert.equal(migrate({ ...output, translate: { ...output.translate, model: 'gemini-3.7-flash' } }).translate.model, 'gemini-3.7-flash');
for (const host of ['api.shuaiapi.com', 'cdn.shuaiapi.com', 'oai.sb', 'api.oai.sb']) {
  assert.equal(migrate({ ui: { translateModel: 'gemini-3.7-flash', translateEndpointPreset: `https://${host}/v1` } }).ui.translateModel, 'gemini-3.8-flash');
}
assert.equal(migrate({ translate: { ...input.translate, endpointPreset: 'https://api.openai.com/v1' } }).translate.model, 'gemini-3.7-flash');
assert.equal(migrate({ translate: { ...input.translate, model: 'custom-model' } }).translate.model, 'custom-model');
assert.match(html, /id="translateModel" value="gemini-3\.8-flash"/);
assert.match(backend, /add_argument\("--translate-model", default="gemini-3\.8-flash"\)/);
assert.match(main, /translate\.model \|\| ui\.translateModel \|\| 'gemini-3\.8-flash'/);
assert.match(main, /migrateSubtitleModelDefault\(readPublicSettings\(\)\)/);
console.log('subtitle-model-default: varsayılanlar, shuai geçişi, özel model ve bağımsız manga koruması geçti');
