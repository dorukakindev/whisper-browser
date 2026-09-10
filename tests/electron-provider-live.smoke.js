'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { app, safeStorage } = require('electron');
const { SafeSecretStore, secretStorePath } = require('../src/secret-store');
const {
  sentenceTranslationGenerationParameters,
  sentenceTranslationMessageRole,
} = require('../src/subtitle-sentence-layout');

const MAX_RESPONSE_BYTES = 2 * 1024 * 1024;

function translationEndpoint(raw) {
  const url = new URL(String(raw || '').trim());
  assert.equal(url.protocol, 'https:', 'Canli saglayici smoke yalniz HTTPS endpoint kullanir.');
  const pathname = url.pathname.replace(/\/+$/u, '');
  url.pathname = /\/chat\/completions$/iu.test(pathname)
    ? pathname : `${pathname}/chat/completions`;
  url.search = '';
  url.hash = '';
  return url;
}

async function run() {
  const userData = process.env.WHISPER_LIVE_USER_DATA
    || path.join(app.getPath('appData'), 'whisper-altyazi');
  app.setPath('userData', userData);
  await app.whenReady();

  const settings = JSON.parse(fs.readFileSync(path.join(userData, 'settings.json'), 'utf8'));
  const loaded = new SafeSecretStore({ safeStorage, filePath: secretStorePath(app) }).load();
  assert.equal(loaded.ok || loaded.partial, true, 'Guvenli anahtar kasasi okunamadi.');

  const translate = settings.translate || {};
  const apiKey = loaded.secrets?.['translate.apiKey'] || '';
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
  console.error(error.message);
  app.exit(1);
});
