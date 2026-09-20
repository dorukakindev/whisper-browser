// Parti 6 — B06 sekme menüsü+hover önizleme, B10 element picker, B14 otomatik PiP.
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const renderer = fs.readFileSync(path.join(__dirname, '..', 'src', 'renderer', 'renderer.js'), 'utf8');
const main = fs.readFileSync(path.join(__dirname, '..', 'src', 'main.js'), 'utf8');
const indexHtml = fs.readFileSync(path.join(__dirname, '..', 'src', 'renderer', 'index.html'), 'utf8');
const locale = fs.readFileSync(path.join(__dirname, '..', 'src', 'renderer', 'ui-locale.js'), 'utf8');
const preload = fs.readFileSync(path.join(__dirname, '..', 'src', 'preload.js'), 'utf8');

const { BrowserElementRules, originOf, validSelector } = require('../src/browser-element-rules');

// --- originOf / validSelector ---
assert.equal(originOf('https://www.youtube.com/watch?v=x'), 'https://www.youtube.com');
assert.equal(originOf('http://a.b:8080/p'), 'http://a.b:8080');
assert.equal(originOf('file:///tmp/x.html'), '');
assert.equal(originOf('not a url'), '');
assert.ok(validSelector('#main > div.card'));
assert.ok(validSelector('div:nth-of-type(2)'));
assert.ok(!validSelector('div { color: red }'), 'blok enjeksiyonu reddedilir');
assert.ok(!validSelector('@import x'), 'at-kuralı reddedilir');
assert.ok(!validSelector('x; y'), 'noktalı virgül reddedilir');
assert.ok(!validSelector(''), '');
assert.ok(!validSelector('x'.repeat(301)), 'uzunluk sınırı');

// --- Store sözleşmesi ---
{
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wlt-rules-'));
  const file = path.join(dir, 'rules.json');
  const store = new BrowserElementRules(file);
  const url = 'https://www.youtube.com/watch?v=a';
  assert.deepEqual(store.selectorsFor(url), []);
  assert.ok(store.add(url, '#ad-banner').ok);
  assert.ok(store.add(url, 'div.popup').ok);
  const dup = store.add(url, '#ad-banner');
  assert.ok(dup.ok && dup.unchanged, 'aynı seçici tekilleşir');
  assert.deepEqual(store.selectorsFor(url), ['#ad-banner', 'div.popup']);
  assert.ok(store.add('file:///x', 'div').ok === false, 'http dışı kaynak reddedilir');
  assert.ok(store.add(url, 'x{evil}').ok === false);
  // Kalıcılık
  const store2 = new BrowserElementRules(file);
  assert.equal(store2.selectorsFor(url).length, 2, 'dosyadan geri yüklenir');
  assert.ok(store2.remove(url, '#ad-banner').ok);
  assert.equal(store2.selectorsFor(url).length, 1);
  assert.ok(store2.clear(url).ok);
  assert.equal(store2.selectorsFor(url).length, 0);
  assert.equal(store2.clear(url).unchanged, true);
}

// --- main.js bağlantıları ---
assert.match(main, /browser:elementRules/, 'IPC kayıtlı');
assert.match(main, /applyBrowserElementRules\(tab\)/, 'did-stop-loading yeniden uygular');
assert.match(main, /BROWSER_ELEMENT_PICKER_SCRIPT/, 'sayfa içi seçici betiği');
assert.match(main, /cssOrigin: 'user'/, 'user-origin CSS');
assert.match(main, /authorizedBrowserSender\(event\)/, 'IPC gönderici doğrulaması');
assert.match(main, /element-rules\.json/, 'kalıcı dosya adı');
assert.match(main, /validSelector\(result\.selector\)/, 'seçici main tarafında doğrulanır');

// --- renderer bağlantıları ---
assert.match(renderer, /openBrowserTabMenu\(item\.dataset\.browserTabId/, 'sekme sağ tık menüsü');
assert.match(renderer, /'Diğer sekmeleri kapat'/, 'close-others');
assert.match(renderer, /'Sağdaki sekmeleri kapat'/, 'close-right');
assert.match(renderer, /'Kopyasını aç'/, 'duplicate');
assert.match(renderer, /toggleBrowserTabPinned\(tabId\)/, 'pin menüde');
assert.match(renderer, /editBrowserTabGroup\(tabId\)/, 'grup düzenleme menüde korunur');
assert.match(renderer, /closeBrowserTab\(tabId\)/, 'kapat menüde');
assert.match(renderer, /scheduleBrowserTabPreview/, 'hover önizleme bağlı');
assert.match(renderer, /hideBrowserTabPreview/, 'önizleme gizleme yolu');
assert.match(renderer, /browserAutoPip'\)\?\.checked/, 'otomatik PiP opt-in okunur');
assert.match(renderer, /action: 'mini-open'/, 'mini-player eylemi');
assert.match(renderer, /browserElementRules\?\.\(\{ action: 'pick'/, 'picker çağrısı');
assert.match(renderer, /action: 'save'.*selector/, 'kayıt yalnız onay sonrası');
assert.match(renderer, /action: 'undo'/, 'geri alma yolu');
assert.match(renderer, /action: 'clear'/, 'site temizleme yolu');
assert.match(preload, /browser:elementRules/, 'preload köprüsü');
assert.ok(indexHtml.includes('id="browserElementPick"'), 'menü öğesi: öğe gizle');
assert.ok(indexHtml.includes('id="browserElementClear"'), 'menü öğesi: gizlenenleri geri yükle');
assert.ok(indexHtml.includes('id="browserAutoPip"'), 'otomatik PiP anahtarı');
for (const key of ['Sekmeye geç', 'Kopyasını aç', 'Diğer sekmeleri kapat', 'Sağdaki sekmeleri kapat', 'Sayfada öğe gizle…', 'Sekme değişince videoyu küçük oynatıcıda sürdür']) {
  assert.ok(locale.includes(`['${key}'`), `locale eksik: ${key}`);
}

console.log('browser-parti6.test.js OK');
