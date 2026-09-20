const assert = require('assert');
const omnibox = require('../src/browser-omnibox');

let tests = 0;
const ok = (cond, msg) => { tests += 1; assert.ok(cond, msg); };

// Bang çözümleme
const yt = omnibox.resolveBang('!yt kedi videoları');
ok(yt && yt.url === `https://www.youtube.com/results?search_query=${encodeURIComponent('kedi videoları')}`, 'yt bang');
ok(omnibox.resolveBang('!yt').url === 'https://www.youtube.com', 'bang boş sorgu ana sayfaya');
ok(omnibox.resolveBang('!w quantum').url.includes('en.wikipedia.org'), 'w bang');
ok(omnibox.resolveBang('!wikitr istanbul').url.includes('tr.wikipedia.org'), 'wikitr bang');
ok(omnibox.resolveBang('!gh whisper').url.startsWith('https://github.com/search?q='), 'gh bang');
ok(omnibox.resolveBang('!gt hello world').url.includes('translate.google.com'), 'gt bang');
ok(omnibox.resolveBang('!bilinmeyen x') === null, 'bilinmeyen bang aramaya düşer');
ok(omnibox.resolveBang('!') === null, 'tek ünlem aramaya düşer');
ok(omnibox.resolveBang('selam !yt') === null, 'bang başta olmalı');
ok(omnibox.resolveBang('https://x.test/?a=!b') === null, 'URL bang değildir');
ok(omnibox.resolveBang('') === null && omnibox.resolveBang(null) === null, 'boş girdi');

// Hesaplayıcı
ok(omnibox.evaluateArithmetic('2+3*4') === 14, 'işlem önceliği');
ok(omnibox.evaluateArithmetic('(2+3)*4') === 20, 'parantez');
ok(omnibox.evaluateArithmetic('10/4') === 2.5, 'bölme');
ok(omnibox.evaluateArithmetic('2^10') === 1024, 'üs');
ok(omnibox.evaluateArithmetic('-5+3') === -2, 'tekli eksi');
ok(omnibox.evaluateArithmetic('7 % 3') === 1, 'mod');
ok(omnibox.evaluateArithmetic('2,5*4') === 10, 'Türkçe ondalık virgül');
ok(omnibox.evaluateArithmetic('100 - 25 * 2') === 50, 'boşluklu ifade');
ok(omnibox.evaluateArithmetic('5/0') === null, 'sıfıra bölme satır üretmez');
ok(omnibox.evaluateArithmetic('12345') === null, 'işleçsiz sayı aramadır');
ok(omnibox.evaluateArithmetic('2++') === null, 'bozuk ifade');
ok(omnibox.evaluateArithmetic('(2+3') === null, 'kapanmamış parantez');
ok(omnibox.evaluateArithmetic('alert(1)') === null, 'harfli ifade reddedilir');
ok(omnibox.evaluateArithmetic('2 +') === null, 'eksik operand');
ok(omnibox.evaluateArithmetic('') === null, 'boş ifade');
ok(omnibox.evaluateArithmetic('2^10000') === null, 'taşan sonuç gösterilmez');
ok(omnibox.formatCalcResult(0.1 + 0.2) === '0.3', 'ondalık biçimleme');
ok(omnibox.formatCalcResult(1024) === '1024', 'tam sayı biçimleme');

// Markdown bağlantısı
ok(omnibox.markdownLink('Başlık', 'https://a.test/x') === '[Başlık](https://a.test/x)', 'düz bağlantı');
ok(omnibox.markdownLink('a [b] c', 'https://a.test/x y') === '[a \\[b\\] c](https://a.test/x%20y)', 'kaçış');
ok(omnibox.markdownLink('', 'https://a.test/x') === '[https://a.test/x](https://a.test/x)', 'başlıksız bağlantı');
ok(omnibox.markdownLink('t', '') === '', 'boş adres');

// Bang çözümü renderer'da navigateBrowserFromAddress içinde yapılır; testlerin
// sanal makineyle çıkardığı main.js handler'ı ve normalizeBrowserUrl saf kalır.
const fs = require('fs');
const path = require('path');
const main = fs.readFileSync(path.join(__dirname, '..', 'src', 'main.js'), 'utf8');
const renderer = fs.readFileSync(path.join(__dirname, '..', 'src', 'renderer', 'renderer.js'), 'utf8');
const navStart = renderer.indexOf('async function navigateBrowserFromAddress()');
ok(navStart > 0, 'navigateBrowserFromAddress var');
const navSlice = renderer.slice(navStart, navStart + 1200);
ok(navSlice.includes('BrowserOmnibox?.resolveBang'), 'bang çözümü renderer gezinmede');
ok(navSlice.includes('resolveBang?.(rawValue)?.url || rawValue'), 'bang hedefi value olarak gezinir');
ok(main.includes("require('./browser-omnibox')"), 'main.js modülü yüklüyor');
ok(main.includes("ipcMain.handle('browser:exportPagePdf'"), 'PDF dışa aktarma handler var');
ok(main.includes('Bağlantıyı Markdown olarak kopyala'), 'bağlam menüsü Markdown öğesi var');
const preload = fs.readFileSync(require('path').join(__dirname, '..', 'src', 'preload.js'), 'utf8');
ok(preload.includes('exportBrowserPagePdf'), 'preload PDF köprüsü var');
const indexHtml = fs.readFileSync(require('path').join(__dirname, '..', 'src', 'renderer', 'index.html'), 'utf8');
ok(indexHtml.includes('../browser-omnibox.js') && indexHtml.includes('vendor/qrcode.js'), 'betikler bağlı');
ok(indexHtml.includes('id="browserQrPanel"') && indexHtml.includes('id="browserExportPdf"'), 'panel ve menü öğeleri bağlı');

console.log(`browser-omnibox: ${tests} test`);
