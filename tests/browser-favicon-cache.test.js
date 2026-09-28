'use strict';

// R165 — kalıcı favicon önbelleği (origin → data: URL, browser-favicons.json).
// Öncesi: `browserFaviconByOrigin` yalnız oturum içi Map'ti; yeniden
// başlatmada geçmiş/yer imi satırları yeniden ziyaret edilene dek harf
// avatarına düşüyordu. Önbellek yer deposuna gömülmez: setBrowserPlaces'ın
// stringify karşılaştırması MB mertebesine çıkardı — ayrı küçük dosya.

const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const src = fs.readFileSync(path.join(__dirname, '../src/main.js'), 'utf8');

// BROWSER_PLACE_LIMIT → normalizeBrowserPlaces arası dilim: sabitler +
// safeBrowserOrigin, normalizeBrowserFavicons, readBrowserFavicons,
// flushBrowserFavicons, rememberBrowserPlaceFavicon.
const slice = src.slice(
  src.indexOf('const BROWSER_PLACE_LIMIT = 100;'),
  src.indexOf('function normalizeBrowserPlaces('),
);

const writtenFiles = [];
let clock = 0;
const sandbox = {
  console,
  URL,
  Map,
  setTimeout: (fn) => { clock += 1; return { fn, id: clock }; },
  clearTimeout: () => {},
  fs: {
    readFileSync: () => { throw Object.assign(new Error('yok'), { code: 'ENOENT' }); },
  },
  path,
  app: { getPath: () => '/tmp/favicon-test' },
  writeJsonAtomic: (file, value) => { writtenFiles.push({ file, value }); },
};
vm.createContext(sandbox);
vm.runInContext(slice, sandbox);

let n = 0;
const ok = (cond, msg) => { n += 1; assert(cond, msg); };

const PNG = 'data:image/png;base64,' + 'QUJD'.repeat(8);
const { safeBrowserOrigin, normalizeBrowserFavicons } = sandbox;

// --- safeBrowserOrigin ---
ok(safeBrowserOrigin('https://a.com/x') === 'https://a.com', 'https origin');
ok(safeBrowserOrigin('http://a.com:8080/x') === 'http://a.com:8080', 'portlu origin');
ok(safeBrowserOrigin('file:///x') === '', 'file reddedilir');
ok(safeBrowserOrigin('javascript:x') === '', 'javascript reddedilir');
ok(safeBrowserOrigin('data:x') === '', 'data reddedilir');
ok(safeBrowserOrigin('geçersiz') === '', 'geçersiz URL');
ok(safeBrowserOrigin('') === '', 'boş');

// --- normalizeBrowserFavicons kapıları ---
ok(JSON.stringify(normalizeBrowserFavicons(null)) === '{}', 'null → {}');
ok(JSON.stringify(normalizeBrowserFavicons('dizi')) === '{}', 'dizi değil → {}');
ok(JSON.stringify(normalizeBrowserFavicons([])) === '{}', 'array → {}');
ok(JSON.stringify(normalizeBrowserFavicons({ 'https://a.com': PNG }))
  === JSON.stringify({ 'https://a.com': PNG }), 'geçerli kayıt');
ok(JSON.stringify(normalizeBrowserFavicons({ 'https://a.com/x?y': PNG }))
  === JSON.stringify({ 'https://a.com': PNG }), 'anahtar origin\'e indirgenir');
ok(JSON.stringify(normalizeBrowserFavicons({ 'file:///etc': PNG })) === '{}', 'file origin reddedilir');
ok(JSON.stringify(normalizeBrowserFavicons({ 'https://a.com': 'https://a.com/f.ico' })) === '{}',
  'uzak URL reddedilir (CSP)');
ok(JSON.stringify(normalizeBrowserFavicons({ 'https://a.com': 'data:text/html;base64,PGI+' })) === '{}',
  'image olmayan data reddedilir');
ok(JSON.stringify(normalizeBrowserFavicons({ 'https://a.com': PNG.replace('base64', '') })) === '{}',
  'bozuk data URL reddedilir');
ok(JSON.stringify(normalizeBrowserFavicons({ 'https://a.com': 'data:image/png;base64,' + 'A'.repeat(97 * 1024) })) === '{}',
  '96KB üstü reddedilir');
{
  const many = {};
  for (let i = 0; i < 200; i += 1) many[`https://o${i}.com`] = PNG;
  ok(Object.keys(normalizeBrowserFavicons(many)).length === 120, '120 kayıt tavanı');
}

// --- rememberBrowserPlaceFavicon (kalıcı Map + debounce yazım) ---
sandbox.rememberBrowserPlaceFavicon('https://a.com/sayfa', PNG);
ok(sandbox.readBrowserFavicons().get('https://a.com') === PNG, 'cache\'e yazıldı');
sandbox.flushBrowserFavicons();
ok(writtenFiles.length === 1 && path.basename(writtenFiles[0].file) === 'browser-favicons.json',
  'atomik dosya yazımı');
ok(writtenFiles[0].value.items['https://a.com'] === PNG, 'disk yükü doğru');
const beforeNoop = writtenFiles.length;
sandbox.rememberBrowserPlaceFavicon('https://a.com/baska', PNG);
sandbox.flushBrowserFavicons();
ok(writtenFiles.length === beforeNoop + 1, 'aynı simge no-op; flush tek başına yeniden yazabilir');
sandbox.rememberBrowserPlaceFavicon('file:///etc', PNG);
ok(!sandbox.readBrowserFavicons().get('file:'), 'file origin yazılmaz');
sandbox.rememberBrowserPlaceFavicon('https://a.com', 'notaurl');
ok(sandbox.readBrowserFavicons().get('https://a.com') === PNG, 'data: olmayan ezmez');
// LRU: 120 dolu iken en eski düşer
const cache = sandbox.readBrowserFavicons();
for (let i = 0; i < 120; i += 1) cache.set(`https://x${i}.com`, PNG);
sandbox.rememberBrowserPlaceFavicon('https://new.com/y', PNG);
ok(cache.size === 120, 'tavan korunur');
ok(!cache.has('https://a.com'), 'en eski (a.com) düştü');
ok(cache.get('https://new.com') === PNG, 'yenisi eklendi');
// Mevcut kayıt güncellenince sona taşınır
cache.set('https://x119.com', PNG + 'ZZ');
sandbox.rememberBrowserPlaceFavicon('https://x119.com/', PNG);
ok([...cache.keys()].pop() === 'https://x119.com', 'LRU sona taşıdı');
// 96KB üstü doğrudan reddedilir
sandbox.rememberBrowserPlaceFavicon('https://big.com', 'data:image/png;base64,' + 'A'.repeat(97 * 1024));
ok(!cache.has('https://big.com'), 'büyük data URL reddedilir');

// --- Kaynak ratchet'ları ---
ok(/rememberBrowserPlaceFavicon\(faviconPageUrl, dataUrl\)/.test(src), 'favicon olayı kalıcı depoya bağlı (yakalanan sayfa adresiyle)');
ok(/ipcMain\.handle\('browser:favicons:list'/.test(src), 'favicons:list IPC kayıtlı');
ok(/browser:favicons:list/.test(src), 'kanal adı');
const preload = fs.readFileSync(path.join(__dirname, '../src/preload.js'), 'utf8');
ok(/listBrowserFavicons/.test(preload), 'preload köprüsü');
const renderer = fs.readFileSync(path.join(__dirname, '../src/renderer/renderer.js'), 'utf8');
ok(/loadBrowserFavicons/.test(renderer), 'renderer yükleyici bağlı');
// Yer deposu şişmemeli: favicons alanı normalizeBrowserPlaces'ta OLMAMALI.
const placesBody = src.slice(src.indexOf('function normalizeBrowserPlaces('), src.indexOf('function cloneBrowserPlaces'));
ok(!/favicons/.test(placesBody), 'favicons yer deposuna gömülmedi (stringify maliyeti yok)');

// R190: flush yazım hatasında (disk kilitli/dolu) bellekteki eşleme korunur
// ve tek seferlik gecikmeli yineleme planlanır — before-quit'teki son flush
// kaybolmaz.
{
  const originalWrite = sandbox.writeJsonAtomic;
  const originalSetTimeout = sandbox.setTimeout;
  const scheduled = [];
  sandbox.setTimeout = (fn, ms) => { scheduled.push({ fn, ms }); return { fn, id: scheduled.length, unref() {} }; };
  let failed = false;
  sandbox.writeJsonAtomic = (file, value) => {
    if (!failed) { failed = true; throw new Error('disk kilitli'); }
    return originalWrite(file, value);
  };
  try {
    sandbox.rememberBrowserPlaceFavicon('https://retry.example/x', PNG);
    sandbox.flushBrowserFavicons();
    ok(scheduled.some((t) => t.ms === 5000), 'hata sonrası 5 sn yeniden deneme kurulmadı');
    const beforeRetry = writtenFiles.length;
    scheduled.forEach((t) => t.fn());
    ok(writtenFiles.length > beforeRetry, 'yeniden deneme diske yazmadı');
  } finally {
    sandbox.writeJsonAtomic = originalWrite;
    sandbox.setTimeout = originalSetTimeout;
  }
}

console.log(`browser-favicon-cache: ${n} kontrol geçti`);
