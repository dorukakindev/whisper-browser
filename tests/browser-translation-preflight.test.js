'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { normalizeCues, assembleCueSentences } = require('../src/browser-translation-scheduler');

const main = fs.readFileSync(path.join(__dirname, '../src/main.js'), 'utf8');
const source = main.slice(main.indexOf('function safeTranslationEndpoint('),
  main.indexOf('async function readResponseBufferLimited('));
const helpers = new Function(`${source}; return { safeTranslationEndpoint, browserTranslationConfigProblem };`)();

assert.match(helpers.browserTranslationConfigProblem({
  endpoint: 'https://api.example.com/v1', apiKey: '',
}), /seçili sağlayıcının API anahtarı girilmemiş/);
assert.equal(helpers.browserTranslationConfigProblem({
  endpoint: 'https://api.example.com/v1', apiKey: 'configured',
}), '');
assert.equal(helpers.browserTranslationConfigProblem({
  endpoint: 'http://127.0.0.1:11434/v1', apiKey: '',
}), '');
assert.match(helpers.browserTranslationConfigProblem({
  endpoint: 'http://remote.example.com/v1', apiKey: 'configured',
}), /endpoint adresi güvenli değil/);
assert.match(main, /const configProblem = browserTranslationConfigProblem\(config\)[\s\S]{0,260}BROWSER_TRANSLATION_CONFIG/);

let diagnostic = '';
const context = {
  normalizeCues, assembleCueSentences,
  browserTranslationConfig: () => ({ endpoint: 'https://api.example.com/v1', apiKey: '' }),
  browserTranslationConfigProblem: helpers.browserTranslationConfigProblem,
  browserExtras: null,
  noteBrowserDiagnosticActivity: (_tab, field, message) => { if (field === 'lastError') diagnostic = message; },
};
vm.createContext(context);
vm.runInContext(main.slice(main.indexOf('function startBrowserTranslation('),
  main.indexOf('function persistCompletedBrowserTranslation(')), context);
const rejected = context.startBrowserTranslation({ id: 'tab' },
  [{ id: '1', start: 0, end: 1, text: 'Hello.' }], { trackId: 'source' });
assert.equal(rejected.ok, false);
assert.equal(rejected.code, 'BROWSER_TRANSLATION_CONFIG');
assert.match(rejected.error, /API anahtarı girilmemiş/);
assert.match(diagnostic, /API anahtarı girilmemiş/);

console.log('Browser translation preflight: provider key, local endpoint and visible config errors passed.');
