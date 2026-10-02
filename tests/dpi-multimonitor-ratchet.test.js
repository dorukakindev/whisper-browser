'use strict';

// Madde 47 — DPI ve çoklu monitör dayanıklılığı (denetlenebilir yüzey).
// Gerçek Windows DPI/monitör taşıması bu ortamda test edilemez; burada
// çoklu monitörü güvenli kılan kod invariant'ları kilitlenir:
//   1) window-state.json'a pozisyon (x/y) asla yazılmaz → monitör kopması
//      veya DPI değişimi ekran-dışı pencere üretemez.
//   2) Kayıtlı boyut birincil ekran workAreaSize'a kelepçelenir.
//   3) Tüm yerel diyaloglar bir üst pencereye sahiplenir → monitörler
//      arasında pencereyi takip ederler (sahipsiz diyalog yanlış ekranda
//      açılabilir).
//   4) htmlFullscreen bounds pencere-içeriğine göredir (ekran-değil) →
//      hangi monitörde olursa olsun doğru hesaplanır.

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { clampedWindowSize, windowStateForDisk } = require('../src/window-state');

// 1) windowStateForDisk yalnız width/height/maximized üretir.
for (const st of [null, {}, 'x', 7, { width: 4000, height: 3000, x: -5000, y: -5000 }]) {
  const out = windowStateForDisk({ width: 1600, height: 900 }, true);
  assert(!('x' in out) && !('y' in out), 'pozisyon diske sızıyor');
  assert.deepEqual(Object.keys(out).sort(), ['height', 'maximized', 'width']);
}
// Bozuk girdide pozisyon anahtarları asla taşınmaz.
{
  const st = { width: 1600, height: 900, x: 9999, y: 9999, extra: 'evil' };
  const out = windowStateForDisk(st, false);
  assert(!('x' in out) && !('extra' in out));
  assert.equal(out.width, 1600);
}

// 2) Kelepçe — devasa/bozuk kayıt workArea'ya indirgenir.
{
  const work = { width: 1920, height: 1040 };
  assert.deepEqual(clampedWindowSize({ width: 9000, height: 5000 }, work), { width: 1920, height: 1040 });
  assert.deepEqual(clampedWindowSize(null, work), { width: 1180, height: 820 });
  assert.deepEqual(clampedWindowSize({ width: -5, height: 'x' }, work), { width: 1180, height: 820 });
  assert.deepEqual(clampedWindowSize({ width: 100, height: 100 }, work), { width: 1180, height: 820 }, 'minimum-altı varsayılana döner');
  assert.deepEqual(clampedWindowSize({ width: 1100, height: 800 }, { width: 1024, height: 700 }), { width: 1024, height: 700 });
}

// 3) Diyalog sahipliği ratchet'i — main.js'teki tüm dialog.* çağrıları
// ilk argüman olarak pencere alır (sahipsiz diyalog yok).
{
  const src = fs.readFileSync(path.join(__dirname, '..', 'src', 'main.js'), 'utf8');
  const calls = src.match(/dialog\.show(?:Open|Save|Message|Certificate)Dialog\s*\(/g) || [];
  assert(calls.length >= 20, 'diyalog envanteri eksik');
  const parented = src.match(/dialog\.show(?:Open|Save|Message|Certificate)Dialog\s*\(\s*\w*[Ww]indow/g) || [];
  assert.equal(parented.length, calls.length,
    `sahipsiz diyalog: ${calls.length - parented.length} adet`);
}

// 4) htmlFullscreen bounds pencere-içerik-bağı — getContentBounds tabanlı,
// ekran koordinatı (screen.*) kullanmaz.
{
  // CRLF checkout'ta `\n}\n` sınırı tutmaz — LF'e normalize.
  const src = fs.readFileSync(path.join(__dirname, '..', 'src', 'main.js'), 'utf8').replace(/\r\n/g, '\n');
  const fn = src.slice(src.indexOf('function browserFullscreenBounds'), src.indexOf('\n}\n', src.indexOf('function browserFullscreenBounds')));
  assert(fn.includes('getContentBounds'), 'fullscreen bounds içerik-tabanlı değil');
  assert(!/screen\./.test(fn), 'fullscreen bounds ekrana bağlı olamaz');
}

// 5) Pozisyon-geri-yükleme yokluğu ratchet'i — createWindow yalnız clamped
// width/height kullanır; x/y restore edilmez.
{
  const src = fs.readFileSync(path.join(__dirname, '..', 'src', 'main.js'), 'utf8').replace(/\r\n/g, '\n');
  const create = src.slice(src.indexOf('function createWindow'), src.indexOf('mainWindow = new BrowserWindow') + 2000);
  assert(create.includes('clampedWindowSize'), 'kelepçe bağlı değil');
  const opts = create.slice(create.indexOf('mainWindow = new BrowserWindow'));
  assert(!/^\s*x\s*:/m.test(opts) && !/^\s*y\s*:/m.test(opts), 'pozisyon restore ediliyor');
}

console.log('dpi-multimonitor-ratchet: 5 bölüm geçti');
