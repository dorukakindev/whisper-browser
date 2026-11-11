'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const {providerCredentialScope,providerKeyForScope}=require('../src/provider-api-keys');
const { app, safeStorage } = require('electron');
const { SafeSecretStore } = require('../src/secret-store');
const {
  sentenceTranslationGenerationParameters,
  sentenceTranslationMessageRole,
} = require('../src/subtitle-sentence-layout');

const MAX_RESPONSE_BYTES = 2 * 1024 * 1024;

function translationEndpoint(raw) {
  const url = new URL(String(raw || '').trim());
  assert.equal(url.protocol, 'https:', 'Canli saglayici smoke yalniz HTTPS endpoint kullanir.');
  assert.ok(!url.username&&!url.password,'Canli saglayici adresi gomulu kimlik bilgisi iceremez.');
  const pathname = url.pathname.replace(/\/+$/u, '');
  url.pathname = /\/chat\/completions$/iu.test(pathname)
    ? pathname : `${pathname}/chat/completions`;
  url.search = '';
  url.hash = '';
  return url;
}

async function run() {
  // The configured profile is read-only. Chromium must never open it as a second writer.
  const userData = process.env.WHISPER_LIVE_USER_DATA
    || path.join(app.getPath('appData'), require('../package.json').name);
  const isolated = fs.mkdtempSync(path.join(os.tmpdir(), 'whisper-provider-live-'));
  app.setPath('userData', isolated);
  if(process.platform==='win32') {
    const stateFile=path.join(userData,'Local State');
    if(fs.existsSync(stateFile)){const crypt=JSON.parse(fs.readFileSync(stateFile,'utf8')).os_crypt;
      if(typeof crypt?.encrypted_key==='string')fs.writeFileSync(path.join(isolated,'Local State'),JSON.stringify({os_crypt:{encrypted_key:crypt.encrypted_key}}));}
  }
  // Only the temporary encrypted context is removed, never anything in the real profile.
  process.once('exit',()=>{try{const ownState=path.join(isolated,'Local State');if(fs.existsSync(ownState))fs.unlinkSync(ownState);}catch{}});
  await app.whenReady();

  const settings = JSON.parse(fs.readFileSync(path.join(userData, 'settings.json'), 'utf8'));
  const loaded = new SafeSecretStore({ safeStorage, filePath: path.join(userData, 'secrets.safe.json'), fields:['translate.apiKey','translate.apiKeyProfiles'] }).load();
  assert.equal(loaded.ok || loaded.partial, true, 'Guvenli anahtar kasasi okunamadi.');

  const translate = settings.translate || {};
  const scope=providerCredentialScope(translate.endpointPreset,translate.customBaseUrl);
  const apiKey = providerKeyForScope(loaded.secrets?.['translate.apiKeyProfiles']||'',scope) || loaded.secrets?.['translate.apiKey'] || '';
  const endpointBase = translate.endpointPreset === 'custom'
    ? translate.customBaseUrl : translate.endpointPreset;
  const endpoint = translationEndpoint(endpointBase);
  const model = String(translate.model || '').trim();
  assert.ok(apiKey, 'Guvenli kasada ceviri API anahtari yok.');
  assert.ok(model, 'Canli saglayici modeli ayarlanmamis.');

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(new Error('Canli saglayici istegi zaman asimina ugradi.')), 20000);
  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      signal: controller.signal,
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model,
        ...sentenceTranslationGenerationParameters(model),
        messages: [
          { role: sentenceTranslationMessageRole(model), content: 'Translate to natural Turkish. Return only the translation.' },
          { role: 'user', content: 'The browser translation pipeline is ready.' },
        ],
      }),
    });
    const bytes = Buffer.from(await response.arrayBuffer());
    assert.ok(bytes.length <= MAX_RESPONSE_BYTES, 'Saglayici yaniti guvenli boyut sinirini asti.');
    const data = JSON.parse(bytes.toString('utf8'));
    assert.equal(response.ok, true, `Saglayici HTTP ${response.status} dondurdu.`);
    const content = data?.choices?.[0]?.message?.content ?? data?.output_text ?? data?.response;
    assert.ok(typeof content === 'string' && content.trim(), 'Saglayici bos ceviri dondurdu.');
    console.log('electron-provider-live: ' + JSON.stringify({
      endpointHost: endpoint.host,
      model,
      httpStatus: response.status,
      responseChars: content.trim().length,
    }));
  } finally {
    clearTimeout(timer);
    app.quit();
  }
}

run().catch((error) => {
  console.error(JSON.stringify({check:'provider-live',failed:true,category:error.name}));
  app.exit(1);
});
