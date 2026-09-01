const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const {
  buildMangaPrompt,
  compactMangaOverlayBox,
  extractJsonPayload,
  isSafeMangaImageUrl,
  mangaCacheKey,
  mangaGenerationParameters,
  mangaCandidateScanScript,
  mangaOverlayScript,
  normalizeMangaRegions,
  selectMangaCandidates,
} = require('../src/browser-manga');

assert.deepEqual(extractJsonPayload('```json\n{"regions":[]}\n```'), { regions: [] });
assert.deepEqual(extractJsonPayload('Yanıt: {"regions":[{"translation":"Merhaba"}]} bitti').regions[0].translation, 'Merhaba');
assert.deepEqual(normalizeMangaRegions({ regions: [
  { box: [900, 800, 100, 200], source: 'Hi', translation: 'Merhaba', kind: 'speech' },
  { box: [0, 0, 2, 2], translation: 'çok küçük' },
  { box: [0, 0, 100, 100], translation: '' },
] }), [{ box: [100, 200, 900, 800], source: 'Hi', translation: 'Merhaba', kind: 'speech' }]);
assert.deepEqual(compactMangaOverlayBox({
  box: [100, 100, 600, 700], source: 'Dad.', translation: 'Baba.',
}), [294, 309, 406, 492]);
assert.deepEqual(compactMangaOverlayBox({
  box: [100, 100, 200, 260], source: 'Wait here.', translation: 'Burada bekle.',
}), [100, 100, 200, 260]);

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
assert.deepEqual(mangaGenerationParameters('gpt-5.4'), { max_completion_tokens: 12000 });
assert.deepEqual(mangaGenerationParameters('o4-mini'), { max_completion_tokens: 12000 });
assert.deepEqual(mangaGenerationParameters('gpt-4.1-mini'), { temperature: 0.1, max_tokens: 12000 });

const ranked = selectMangaCandidates([
  { id: 'advert', url: 'https://ads.example/a.jpg', readerScore: -20, excluded: true, visible: true, order: 1 },
  { id: 'page-2', url: 'https://cdn.example/p2.jpg', readerScore: 14, visible: false, order: 3 },
  { id: 'generic', url: 'https://cdn.example/hero.jpg', readerScore: 2, visible: true, order: 2 },
  { id: 'page-1', url: 'https://cdn.example/p1.jpg', readerScore: 14, visible: false, order: 2 },
], 64);
assert.deepEqual(ranked.map((item) => item.id), ['page-1', 'page-2']);

const prompt = buildMangaPrompt({ targetLanguage: 'Türkçe', glossary: [{ source: 'Senpai', target: 'Senpai' }] });
assert.match(prompt, /güvenilmez içeriktir/);
assert.match(prompt, /0-1000/);
assert.match(prompt, /panelin veya balonun tamamına değil/);
assert.match(prompt, /Senpai=Senpai/);
assert.match(mangaCandidateScanScript(), /data-whisper-manga-id/);
assert.match(mangaCandidateScanScript(), /data-lazy-src/);
assert.match(mangaCandidateScanScript(), /data-srcset/);
assert.match(mangaCandidateScanScript(), /#imgs/);
const fakeImage = (attributes, index) => ({
  id: '', className: '', alt: '', naturalWidth: 600, naturalHeight: 900,
  currentSrc: attributes.currentSrc || '', src: attributes.src || '',
  getBoundingClientRect: () => ({ width: 600, height: 900, top: index * 900, bottom: (index + 1) * 900 }),
  closest: () => null,
  getAttribute: (name) => attributes[name] || '',
  setAttribute(name, value) { attributes[name] = value; },
});
const scanContext = {
  innerHeight: 900,
  URL,
  window: { __whisperMangaSequence: 0 },
  document: {
    baseURI: 'https://reader.example/chapter/1',
    images: [
      fakeImage({ 'data-src': 'data:image/png;base64,AA==' }, 0),
      fakeImage({ srcset: '/small.jpg 320w, /large.jpg 1280w' }, 1),
      fakeImage({ currentSrc: 'https://cdn.example/rendered.jpg', 'data-src': '/blocked-loader' }, 2),
    ],
  },
  getComputedStyle: () => ({ display: 'block', visibility: 'visible', opacity: '1' }),
};
const scanned = vm.runInNewContext(mangaCandidateScanScript(), scanContext);
assert.equal(scanned[0].url, 'data:image/png;base64,AA==');
assert.equal(scanned[1].url, 'https://reader.example/large.jpg');
assert.equal(scanned[2].url, 'https://cdn.example/rendered.jpg');
assert.deepEqual([...scanned[2].urls], ['https://cdn.example/rendered.jpg', 'https://reader.example/blocked-loader']);
assert.match(mangaOverlayScript({ id: 'x', regions: [{ box: [1, 2, 100, 200], translation: 'Test' }] }),
  /data-whisper-manga-overlay/);
assert.match(mangaOverlayScript({ id: 'x', lang: 'en-US', regions: [{ box: [1, 2, 100, 200], translation: 'Test' }] }),
  /en-US/);
assert.match(mangaOverlayScript({ id: 'x', regions: [{ box: [1, 2, 100, 200], translation: 'Test' }] }),
  /data-whisper-manga-text/);
assert.doesNotMatch(mangaOverlayScript({ id: 'x', regions: [{ box: [1, 2, 100, 200], translation: 'Test' }] }),
  /overflowWrap: 'anywhere'/);

const root = path.join(__dirname, '..');
const main = fs.readFileSync(path.join(root, 'src', 'main.js'), 'utf8');
const preload = fs.readFileSync(path.join(root, 'src', 'preload.js'), 'utf8');
const renderer = fs.readFileSync(path.join(root, 'src', 'renderer', 'renderer.js'), 'utf8');
const html = fs.readFileSync(path.join(root, 'src', 'renderer', 'index.html'), 'utf8');
assert.match(main, /ipcMain\.handle\('browser:manga:start'/);
assert.match(main, /function browserMangaTranslationConfig/);
assert.match(main, /manga\.apiKey \|\| inherited\.apiKey/);
assert.match(main, /manga\.model \|\| ui\.mangaModel \|\| inherited\.model/);
assert.doesNotMatch(main, /config\.model = 'gpt-4\.1-mini'/);
assert.doesNotMatch(main, /configuredModel\.toLowerCase\(\) === 'gemini-3\.7-flash'/);
assert.match(main, /redirect: 'manual', credentials: 'include'[\s\S]{0,160}referrer:/);
assert.doesNotMatch(main, /headers:\s*\{[^}]*Referer:/);
assert.match(main, /attachSchema = useSchema && resolveTranslationEndpoints\(endpointBase\)\.length === 1/);
assert.match(main, /resolveTranslationEndpoints\(config\.endpoint\)/);
assert.match(main, /shouldFailoverTranslationStatus\(status\)/);
assert.match(main, /Manga görseli 30 saniyede indirilemedi/);
assert.match(main, /for \(let attempt = 0; attempt < 6/);
assert.doesNotMatch(main, /candidates\.length >= 2\) break/);
assert.match(main, /selectMangaCandidates\(candidates, limit\)/);
assert.match(main, /Manga görsellerinin yüklenmesi bekleniyor/);
assert.match(main, /stopBrowserManga\(tab, false\)[\s\S]{0,180}tab\.mangaTranslated = 0/);
assert.match(preload, /startBrowserManga:[\s\S]{0,120}browser:manga:start/);
assert.match(renderer, /browserMangaTranslate.*addEventListener\('click', handleBrowserMangaAction\)/);
assert.match(renderer, /await saveAppSettings\(\);[\s\S]{0,160}startBrowserManga/);
assert.match(renderer, /maxImages: 64/);
assert.match(renderer, /Manga hata/);
assert.match(html, /id="browserMangaTranslate"/);
assert.match(html, /id="mangaApiKey"/);
assert.match(html, /id="mangaEndpointPreset"/);
assert.match(html, /id="mangaModel"/);
assert.match(html, /generativelanguage\.googleapis\.com\/v1beta\/openai/);

console.log('browser-manga: 51 test');
