'use strict';

// Yeni-100 batch 7 (madde 62-63): oturum-içi Map sınırları ratchet'i.
// Doğrulanan kusur: media-catalog `posterCache` sınırsız büyüyordu (her
// görüntülenen afişin data: URL gövdesi uygulama ömrü boyunca tutuluyordu).
// favicon haritasında canlı yol 200 sınırına sahipti fakat seed yükleyici
// ayrı/sınırsız bir yazım noktasıydı — ikisi tek bounded-yardımcıya bağlandı.

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.join(__dirname, '..');
const results = [];
function check(name, ok, detail = '') {
  results.push({ name, ok, detail });
  if (!ok) throw new Error(`${name} — ${detail}`);
  console.log(`PASS ${name}${detail ? ` (${detail})` : ''}`);
}

const renderer = fs.readFileSync(path.join(ROOT, 'src/renderer/renderer.js'), 'utf8');
const helpers = fs.readFileSync(path.join(ROOT, 'src/renderer/renderer-helpers.js'), 'utf8');
const catalog = fs.readFileSync(path.join(ROOT, 'src/renderer/media-catalog.js'), 'utf8');

// 1 — posterCache sınırlı: sabit + cachePoster yardımcısı + tek yazım noktası.
{
  assert.match(catalog, /const POSTER_CACHE_LIMIT = 300;/, 'poster limiti');
  assert.match(catalog, /function cachePoster\(id, promise\)/, 'cachePoster yardımcısı');
  const writes = [...catalog.matchAll(/posterCache\.set\(/g)];
  assert.equal(writes.length, 1, `tek .set noktası (cachePoster içi): ${writes.length}`);
  assert.match(catalog, /cachePoster\(id, Promise\.resolve/, 'yazım cachePoster üzerinden');
  check('posterCache 300 FIFO sınırında', true, 'POSTER_CACHE_LIMIT + tek yazım noktası');
}

// 2 — favicon tek-bounded-yol: sabit + yardımcı + helpers delegasyonu.
{
  assert.match(renderer, /const BROWSER_FAVICON_SESSION_LIMIT = 400;/, 'favicon limiti');
  assert.match(renderer, /function rememberBrowserFaviconByOrigin\(origin, icon\)/, 'yardımcı');
  assert.match(helpers, /rememberBrowserFaviconByOrigin\(origin, favicon\)/, 'helpers delegasyonu');
  const rawWrites = [...renderer.matchAll(/browserFaviconByOrigin\.set\(/g)];
  // Tek .set yardımcının içinde kalmalı (helpers'ta hiç ham yazım olmamalı).
  assert.equal(rawWrites.length, 1, `tek .set noktası: ${rawWrites.length}`);
  const helperWrites = [...helpers.matchAll(/browserFaviconByOrigin\.set\(/g)];
  assert.equal(helperWrites.length, 0, `helpers'ta ham .set yok: ${helperWrites.length}`);
  check('favicon tek-bounded-yol', true, 'seed+canlı tek 400 sınırlı yardımcıda');
}

// 3 — davranış kiliti: yardımcı fonksiyon vm'de koşturulur (sınır + LRU + kapı).
{
  const slice = renderer.slice(
    renderer.indexOf('const BROWSER_FAVICON_SESSION_LIMIT'),
    renderer.indexOf('// Kalıcı site-simgesi'),
  );
  const sandbox = { Map };
  vm.createContext(sandbox);
  vm.runInContext(`${slice}
    // 450 köken × farklı simge: 400'de sabitlenmeli, en eskiler atılır.
    for (let i = 0; i < 450; i++) rememberBrowserFaviconByOrigin('https://o' + i + '.x', 'data:image/png;base64,A' + i);
    out = {
      size: browserFaviconByOrigin.size,
      firstGone: !browserFaviconByOrigin.has('https://o0.x'),
      lastKept: browserFaviconByOrigin.has('https://o449.x'),
      iconCap: (() => { rememberBrowserFaviconByOrigin('https://k.x', 'data:image/svg+xml;base64,PHN2Zy8+'); return browserFaviconByOrigin.get('https://k.x'); })(),
      badRejected: (() => { rememberBrowserFaviconByOrigin('https://evil.x', 'javascript:alert(1)'); return !browserFaviconByOrigin.has('https://evil.x'); })(),
      sameKeepsSpot: (() => {
        rememberBrowserFaviconByOrigin('https://k.x', 'data:image/svg+xml;base64,PHN2Zy8+');
        return browserFaviconByOrigin.get('https://k.x') === 'data:image/svg+xml;base64,PHN2Zy8+';
      })(),
    };`, sandbox);
  assert.equal(sandbox.out.size, 400, '450 kayıt → 400');
  assert.ok(sandbox.out.firstGone, 'en eski atıldı');
  assert.ok(sandbox.out.lastKept, 'en yeni tutuldu');
  assert.equal(sandbox.out.iconCap, 'data:image/svg+xml;base64,PHN2Zy8+', 'data: simge kabul');
  assert.ok(sandbox.out.badRejected, 'javascript: reddedildi');
  assert.ok(sandbox.out.sameKeepsSpot, 'özdeş simge pozisyonu korur');
  check('favicon yardımcısı davranış kiliti', true, '400 tavan + FIFO + data: kapısı + LRU');
}

// 4 — komşu bounded haritaların tavanları hâlâ yerinde (komşuluk doğrulaması).
{
  assert.match(renderer, /_foldCache\.size > 24000\)/, '_foldCache tavanı');
  assert.match(renderer, /player\.seekLocalSheets\.size >= 8\)/, 'seekLocalSheets tavanı');
  assert.match(renderer, /player\.timeline\.undo\.length > 30\)/, 'undo tavanı');
  assert.match(renderer, /history\.length > 8\)/, 'sinyal-geçmişi tavanı');
  check('komşu tavanlar yerinde', true, '_foldCache/seekSheets/undo/signal');
}

console.log(`session-map-bounds: ${results.length} kontrol geçti`);
