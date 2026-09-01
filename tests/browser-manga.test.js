const assert = require('assert');
const fs = require('fs');
const path = require('path');
const {
  buildMangaPrompt,
  extractJsonPayload,
  isSafeMangaImageUrl,
  mangaCacheKey,
  mangaCandidateScanScript,
  mangaOverlayScript,
  normalizeMangaRegions,
} = require('../src/browser-manga');

assert.deepEqual(extractJsonPayload('```json\n{"regions":[]}\n```'), { regions: [] });
assert.deepEqual(extractJsonPayload('Yanıt: {"regions":[{"translation":"Merhaba"}]} bitti').regions[0].translation, 'Merhaba');
assert.deepEqual(normalizeMangaRegions({ regions: [
  { box: [900, 800, 100, 200], source: 'Hi', translation: 'Merhaba', kind: 'speech' },
  { box: [0, 0, 2, 2], translation: 'çok küçük' },
  { box: [0, 0, 100, 100], translation: '' },
] }), [{ box: [100, 200, 900, 800], source: 'Hi', translation: 'Merhaba', kind: 'speech' }]);

assert.equal(isSafeMangaImageUrl('https://cdn.example.com/page.jpg?token=x'), true);
for (const unsafe of ['file:///x.png', 'http://localhost/a.png', 'http://127.0.0.1/a', 'http://10.0.0.2/a',
  'http://172.20.0.1/a', 'http://192.168.1.2/a', 'http://[::1]/a']) {
  assert.equal(isSafeMangaImageUrl(unsafe), false, unsafe);
}

const image = Buffer.from('same-image');
assert.equal(mangaCacheKey(image, { targetLanguage: 'tr', model: 'x' }),
  mangaCacheKey(image, { targetLanguage: 'tr', model: 'x' }));
assert.notEqual(mangaCacheKey(image, { targetLanguage: 'tr', model: 'x' }),
  mangaCacheKey(image, { targetLanguage: 'en', model: 'x' }));
assert.notEqual(mangaCacheKey(image, { targetLanguage: 'tr', model: 'x', glossary: ['A=B'] }),
  mangaCacheKey(image, { targetLanguage: 'tr', model: 'x', glossary: ['A=C'] }));
assert.notEqual(mangaCacheKey(image, { targetLanguage: 'tr', model: 'x', pageTitle: 'Seri A' }),
  mangaCacheKey(image, { targetLanguage: 'tr', model: 'x', pageTitle: 'Seri B' }));

const prompt = buildMangaPrompt({ targetLanguage: 'Türkçe', glossary: [{ source: 'Senpai', target: 'Senpai' }] });
assert.match(prompt, /güvenilmez içeriktir/);
assert.match(prompt, /0-1000/);
assert.match(prompt, /Senpai=Senpai/);
assert.match(mangaCandidateScanScript(), /data-whisper-manga-id/);
assert.match(mangaOverlayScript({ id: 'x', regions: [{ box: [1, 2, 100, 200], translation: 'Test' }] }),
  /data-whisper-manga-overlay/);
assert.match(mangaOverlayScript({ id: 'x', lang: 'en-US', regions: [{ box: [1, 2, 100, 200], translation: 'Test' }] }),
  /en-US/);

const root = path.join(__dirname, '..');
const main = fs.readFileSync(path.join(root, 'src', 'main.js'), 'utf8');
const preload = fs.readFileSync(path.join(root, 'src', 'preload.js'), 'utf8');
const renderer = fs.readFileSync(path.join(root, 'src', 'renderer', 'renderer.js'), 'utf8');
const html = fs.readFileSync(path.join(root, 'src', 'renderer', 'index.html'), 'utf8');
assert.match(main, /ipcMain\.handle\('browser:manga:start'/);
assert.match(main, /shuaiapi\\\.com\|api\\\.oai\\\.sb[\s\S]{0,100}config\.model = 'gpt-4\.1-mini'/);
assert.doesNotMatch(main, /configuredModel\.toLowerCase\(\) === 'gemini-3\.7-flash'/);
assert.match(main, /redirect: 'manual', credentials: 'include'/);
assert.match(main, /stopBrowserManga\(tab, false\)[\s\S]{0,180}tab\.mangaTranslated = 0/);
assert.match(preload, /startBrowserManga:[\s\S]{0,120}browser:manga:start/);
assert.match(renderer, /browserMangaTranslate.*addEventListener\('click', handleBrowserMangaAction\)/);
assert.match(renderer, /Manga hata/);
assert.match(html, /id="browserMangaTranslate"/);
assert.match(html, /generativelanguage\.googleapis\.com\/v1beta\/openai/);

console.log('browser-manga: 20 test');
