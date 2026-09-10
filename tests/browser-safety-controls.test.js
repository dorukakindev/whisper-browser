const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { normalizeSessionTab } = require('../src/browser-session-store');

const ROOT = path.join(__dirname, '..');
const main = fs.readFileSync(path.join(ROOT, 'src', 'main.js'), 'utf8');
const preload = fs.readFileSync(path.join(ROOT, 'src', 'preload.js'), 'utf8');
const renderer = fs.readFileSync(path.join(ROOT, 'src', 'renderer', 'renderer.js'), 'utf8');
const html = fs.readFileSync(path.join(ROOT, 'src', 'renderer', 'index.html'), 'utf8');

let passed = 0;
function test(name, fn) { fn(); passed++; console.log(`  ok - ${name}`); }

test('sabit sekme bilgisi oturum kaydinda korunur', () => {
  const tab = normalizeSessionTab({ id: 'tab-1', url: 'https://example.com/watch/1', pinned: true });
  assert.equal(tab.pinned, true);
});

test('sag tik menusu istenen bes islemi sunar', () => {
  assert.match(main, /wc\.on\('context-menu'/);
  for (const label of ['Geri', 'İleri', 'Yenile', 'Bağlantıyı yeni sekmede aç', 'Metni kopyala', 'Görseli kaydet…']) {
    assert(main.includes(`label: '${label}'`), `${label} menüde yok`);
  }
  assert.match(main, /session\.fetch\(parsed\.href/);
  assert.match(main, /50 \* 1024 \* 1024/);
});

test('sertifika hatasi kesin reddedilir ve Turkce hata yuzeyine gider', () => {
  assert.match(main, /app\.on\('certificate-error'/);
  assert.match(main, /event\.preventDefault\(\);\s*callback\(false\)/);
  assert.match(main, /type: 'security-error'/);
  assert.match(html, /id="browserErrorSurface"/);
  assert.match(renderer, /event\.type === 'load-error' \|\| event\.type === 'security-error'/);
});

test('site temizligi origin ile sinirli ve genel cache temizligi yapmiyor', () => {
  const start = main.indexOf('async function clearBrowserSiteData');
  const end = main.indexOf('async function clearAllBrowserCookies', start);
  const body = main.slice(start, end);
  assert.match(body, /clearStorageData\(\{ origin: parsed\.origin \}\)/);
  assert.doesNotMatch(body, /await browserSession\.clearCache\(/);
  assert.match(html, /Bu sitenin verilerini temizle/);
});

test('pinleme ve aktif is kapatma korumasi main ve renderer boyunca tasinir', () => {
  assert.match(main, /ipcMain\.handle\('browser:tab:setPinned'/);
  assert.match(main, /!force && \(tab\.pinned \|\| activeWork\)/);
  assert.match(main, /translationState\?\.failures\?\.some\(\(failure\) => !failure\.terminal\)/,
    'backoff bekleyen web çevirisi aktif iş sayılmıyor');
  assert.match(preload, /setBrowserTabPinned/);
  assert.match(html, /id="browserPinActiveTab"/);
  assert.match(renderer, /browserPinActiveTab[\s\S]*toggleBrowserTabPinned/);
  assert.match(renderer, /result\?\.requiresConfirmation/);
  assert.match(renderer, /Sekme korumalı/);
});

console.log(`browser-safety-controls: ${passed} test`);
