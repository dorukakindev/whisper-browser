'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createHash } = require('node:crypto');
const { createBrowserSeriesContext } = require('../src/browser-series-context');

async function main() {
  const mainSource = fs.readFileSync(path.join(__dirname, '..', 'src', 'main.js'), 'utf8');
  const start = mainSource.indexOf('async function requestBrowserSentenceTranslationAtEndpoint(');
  const end = mainSource.indexOf('\nasync function requestBrowserSentenceTranslation(', start);
  assert(start >= 0 && end > start, 'Gerçek sağlayıcı istek fonksiyonu bulunmalı');
  const requests = [];
  const sandbox = {
    require: (name) => name === './subtitle-sentence-layout' ? require('../src/subtitle-sentence-layout') : require(name),
    AbortController, setTimeout, clearTimeout, Buffer,
    safeTranslationEndpoint: (url) => url,
    browserGlossaryTruncationNotified: false,
    terminologyPrompt: () => '',
    sendEvent() {}, writeJobLog() {},
    readJsonResponseLimited: async (response) => response.json(),
    fetch: async (url, options) => {
      requests.push({ url, body: JSON.parse(options.body) });
      return new Response(JSON.stringify({ choices: [{ message: { content: 'Kaptan, bekleyin.' } }] }),
        { headers: { 'Content-Type': 'application/json' } });
    },
  };
  const translate = vm.runInNewContext(`${mainSource.slice(start, end)}\nrequestBrowserSentenceTranslationAtEndpoint`, sandbox);
  const temp = fs.mkdtempSync(path.join(require('node:os').tmpdir(), 'whisper-series-provider-'));
  try {
    const store = createBrowserSeriesContext({ filePath: path.join(temp, 'series.json') });
    const media = 'https://show.example|episode-1';
    store.bindAndSave(media, 'Kuzey', 'https://show.example/watch', {
      synopsis: 'İki kardeş aynı gemide çalışır.', addressStyle: 'Resmî hitap',
      terms: [{ source: 'Captain', target: 'Kaptan' }],
    });
    const base = { targetLanguage: 'tr', register: 'doğal', profanity: 'koru', glossary: [],
      terminologyEnabled: false, model: 'controlled', apiKey: '',
      endpoint: 'http://127.0.0.1:7654/v1/chat/completions' };
    const sentence = { text: 'Captain, wait.', contextBefore: [], contextAfter: [] };
    const profile = store.translationContext(media);
    const config = { ...base, seriesContext: profile, glossary: [...profile.terms] };
    const output = await translate(sentence, config, undefined, base.endpoint);
    assert.equal(output.text, 'Kaptan, bekleyin.');
    const firstPrompt = requests.at(-1).body.messages[0].content;
    assert.match(firstPrompt, /İki kardeş aynı gemide çalışır/);
    assert.match(firstPrompt, /Resmî hitap/);
    assert.match(firstPrompt, /Captain=Kaptan/);
    assert.match(firstPrompt, /yeni hikâye bilgisi uydurma/);

    store.bindAndSave(media, 'Kuzey', 'https://show.example/watch', {
      synopsis: 'Kardeşler ayrı gemilerde çalışır.', addressStyle: 'Samimi hitap',
      terms: [{ source: 'Captain', target: 'Komutan' }],
    });
    const changed = store.translationContext(media);
    await translate(sentence, { ...base, seriesContext: changed, glossary: [...changed.terms] }, undefined, base.endpoint);
    const secondPrompt = requests.at(-1).body.messages[0].content;
    assert.notEqual(secondPrompt, firstPrompt);
    assert.match(secondPrompt, /Captain=Komutan/);
    assert.match(secondPrompt, /Samimi hitap/);

    const unrelated = store.translationContext('https://show.example|unbound');
    assert.equal(unrelated, null);
    await translate(sentence, { ...base, seriesContext: unrelated }, undefined, base.endpoint);
    const plainPrompt = requests.at(-1).body.messages[0].content;
    assert.doesNotMatch(plainPrompt, /Kullanıcının bu dizi için/);
    assert.doesNotMatch(plainPrompt, /Captain=/);

    const cacheLine = mainSource.match(/glossaryVersion:\s*(createHash\('sha1'\)\.update\(JSON\.stringify\(\{ glossary: config\.glossary, seriesContext: config\.seriesContext \}\)\)\.digest\('hex'\)\.slice\(0, 12\))/);
    assert(cacheLine, 'Çeviri cache kimliği dizi bağlamını içermeli');
    const digest = (value) => vm.runInNewContext(cacheLine[1], { createHash, config: value });
    assert.notEqual(digest(config), digest({ ...base, seriesContext: changed, glossary: [...changed.terms] }));
    assert.notEqual(digest(config), digest({ ...base, seriesContext: null }));
    assert.equal(requests.length, 3);
    assert(requests.every((request) => request.url === base.endpoint));
    console.log('browser-series-translation: controlled provider prompt and cache key passed');
  } finally { fs.rmSync(temp, { recursive: true, force: true }); }
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
