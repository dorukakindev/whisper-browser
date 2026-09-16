'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const providerApi = require('../src/provider-api-keys');

const rendererPath = path.join(__dirname, '..', 'src', 'renderer', 'renderer.js');
const renderer = fs.readFileSync(rendererPath, 'utf8');
const start = renderer.indexOf('const providerApiKeyProfiles =');
const end = renderer.indexOf("document.addEventListener('change'", start);
assert(start >= 0 && end > start, 'Renderer sağlayıcı anahtarı denetleyicisi bulunamadı');

function control(value = '') {
  return { value, dataset: {} };
}

const controls = {
  translateEndpointPreset: control('https://api.shuaiapi.com/v1'),
  translateBaseUrl: control(''),
  translateApiKey: control(''),
  mangaEndpointPreset: control('inherit'),
  mangaBaseUrl: control(''),
  mangaApiKey: control(''),
};
const context = vm.createContext({
  window: { WhisperProviderApiKeys: providerApi },
  $: (id) => controls[id] || null,
});
vm.runInContext(renderer.slice(start, end), context, { filename: 'renderer-provider-api-keys.js' });

const initialize = context.initializeProviderApiKeyState;
const activate = context.activateProviderApiKey;
const remember = context.rememberVisibleProviderApiKey;
const profilesPatch = context.providerApiKeyProfilesPatch;
assert.equal(typeof initialize, 'function');
assert.equal(typeof activate, 'function');

// Eski tek anahtar ilk yüklemede o an seçili sağlayıcının profiline taşınır.
initialize('translate', { apiKey: 'shuai-eski' });
assert.equal(controls.translateApiKey.value, 'shuai-eski');
assert.match(profilesPatch('translate').apiKeyProfiles, /shuai-eski/);

// A sağlayıcısındaki düzenleme saklanır; B ilk kez seçildiğinde A anahtarı gösterilmez.
controls.translateApiKey.value = 'shuai-yeni';
controls.translateApiKey.dataset.secretEdited = 'true';
remember('translate');
controls.translateEndpointPreset.value = 'https://codecraftapi.com/v1';
activate('translate');
assert.equal(controls.translateApiKey.value, '');

// B anahtarı girildikten sonra iki yöndeki geçiş kendi anahtarını geri getirir.
controls.translateApiKey.value = 'codecraft-key';
controls.translateApiKey.dataset.secretEdited = 'true';
remember('translate');
controls.translateEndpointPreset.value = 'https://4sapi.com/v1';
activate('translate');
assert.equal(controls.translateApiKey.value, '');
controls.translateApiKey.value = '4sapi-key';
controls.translateApiKey.dataset.secretEdited = 'true';
remember('translate');
controls.translateEndpointPreset.value = 'https://oai.sb/v1';
activate('translate');
assert.equal(controls.translateApiKey.value, 'shuai-yeni');
controls.translateEndpointPreset.value = 'https://codecraftapi.com/v1';
activate('translate');
assert.equal(controls.translateApiKey.value, 'codecraft-key');
controls.translateEndpointPreset.value = 'https://4sapi.com/v1';
activate('translate');
assert.equal(controls.translateApiKey.value, '4sapi-key');

// Manga “altyazı sağlayıcısını kullan” seçeneğinde altyazı endpoint'ini izler,
// ama manga anahtar halkası altyazı anahtarlarından bağımsız kalır.
controls.translateEndpointPreset.value = 'https://codecraftapi.com/v1';
initialize('manga', {
  apiKeyProfiles: JSON.stringify({
    'provider:codecraftapi': 'manga-codecraft',
    'provider:shuaiapi': 'manga-shuai',
  }),
});
assert.equal(controls.mangaApiKey.value, 'manga-codecraft');
controls.translateEndpointPreset.value = 'https://api.shuaiapi.com/v1';
activate('manga');
assert.equal(controls.mangaApiKey.value, 'manga-shuai');
assert.notEqual(controls.mangaApiKey.value, controls.translateApiKey.value);

const html = fs.readFileSync(path.join(__dirname, '..', 'src', 'renderer', 'index.html'), 'utf8');
assert(html.indexOf('../provider-api-keys.js') < html.indexOf('renderer.js'),
  'Sağlayıcı anahtarı modülü renderer.js dosyasından önce yüklenmeli');

console.log('provider-api-key-ui: altyazı ve manga sağlayıcı geçişleri doğru anahtarı geri çağırdı');
