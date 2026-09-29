'use strict';

// R265: attachSubframeSchemeGuard — alt kare (iframe) gezinmeleri için şema
// beyaz listesi. YouTube TV penceresinde web şemasına izin, kendi yerel
// pencerelerimizde (ana pencere, mini oynatıcı) tüm alt kare gezinmesine red.

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { EventEmitter } = require('events');
const { attachSubframeSchemeGuard } = require('../src/browser-navigation-policy');

let passed = 0;
function test(name, fn) {
  try {
    fn();
    passed++;
    console.log(`  OK  ${name}`);
  } catch (error) {
    console.error(`  FAIL ${name}`);
    throw error;
  }
}

class FakeWebContents extends EventEmitter {}

function frameNav(url) {
  return {
    url,
    isMainFrame: false,
    prevented: false,
    preventDefault() { this.prevented = true; },
  };
}

test('izinli şemalar geçer, listedeki dışı her şema engellenir', () => {
  const contents = new FakeWebContents();
  attachSubframeSchemeGuard(contents, { allowSchemes: new Set(['http:', 'https:', 'about:']) });
  for (const url of ['https://cdn.example.test/embed', 'http://ads.example.test/x', 'about:blank']) {
    const event = frameNav(url);
    contents.emit('will-frame-navigate', event);
    assert.equal(event.prevented, false, url);
  }
  for (const url of ['file:///C:/secret', 'javascript:alert(1)', 'data:text/html,x', 'blob:https://a/b', 'chrome://settings']) {
    const event = frameNav(url);
    contents.emit('will-frame-navigate', event);
    assert.equal(event.prevented, true, url);
  }
});

test('boş izin kümesi tüm alt kare gezinmesini engeller (yerel pencereler)', () => {
  const contents = new FakeWebContents();
  attachSubframeSchemeGuard(contents);
  for (const url of ['https://evil.example.test/', 'about:blank', 'file:///C:/x']) {
    const event = frameNav(url);
    contents.emit('will-frame-navigate', event);
    assert.equal(event.prevented, true, url);
  }
});

test('ayrıştırılamayan ve kontrol karakterli hedefler fail-closed engellenir', () => {
  const contents = new FakeWebContents();
  const decisions = [];
  attachSubframeSchemeGuard(contents, {
    allowSchemes: new Set(['https:']),
    onDecision: (d) => decisions.push(d),
  });
  for (const url of ['', undefined, 'https://x.test/\nfile:///C:/y', `https://x.test/${'a'.repeat(9000)}`]) {
    const event = frameNav(url);
    contents.emit('will-frame-navigate', event);
    assert.equal(event.prevented, true, String(url).slice(0, 60));
  }
  assert.ok(decisions.every((d) => !d.allowed));
  assert.ok(decisions.some((d) => d.reason === 'control-character' || d.reason === 'too-long' || d.reason === 'invalid-url' || d.reason === 'empty'));
});

test('detach sonrası koruma kalkar ve onDecision çağrısı çalışır', () => {
  const contents = new FakeWebContents();
  const decisions = [];
  const detach = attachSubframeSchemeGuard(contents, {
    allowSchemes: new Set(['https:']),
    onDecision: (d) => decisions.push(d),
  });
  const ok = frameNav('https://a.test/');
  contents.emit('will-frame-navigate', ok);
  assert.equal(ok.prevented, false);
  assert.equal(decisions.at(-1).reason, 'scheme-allowed');
  detach();
  const after = frameNav('file:///C:/x');
  contents.emit('will-frame-navigate', after);
  assert.equal(after.prevented, false);
});

test('kaynak taraması: tv penceresi, ana pencere ve mini oynatıcı koruma bağlı', () => {
  const main = fs.readFileSync(path.join(__dirname, '../src/main.js'), 'utf8');
  const mini = fs.readFileSync(path.join(__dirname, '../src/browser-mini-player.js'), 'utf8');
  // YouTube TV: web şemasına izinli alt kare koruması.
  assert.match(main, /attachSubframeSchemeGuard\(tvContents, \{ allowSchemes: new Set\(\['http:', 'https:', 'about:'\]\) \}\)/);
  // Ana pencere: boş izin kümesi = tüm alt kareler reddedilir.
  assert.match(main, /attachSubframeSchemeGuard\(mainWindow\.webContents\)/);
  // Ana pencere: will-navigate'in yanında will-redirect de kapatıldı.
  const guardBlock = main.match(/Sayfa içi navigasyonu engelle[\s\S]{0,600}/);
  assert.ok(guardBlock && /will-redirect/.test(guardBlock[0]) && /will-navigate/.test(guardBlock[0]));
  // Mini oynatıcı: yeni pencere + gezinme + alt kare reddi.
  assert.match(mini, /setWindowOpenHandler\(\(\) => \(\{ action: 'deny' \}\)\)/);
  assert.match(mini, /attachSubframeSchemeGuard\(window\.webContents\)/);
  assert.match(mini, /will-navigate[\s\S]{0,200}will-redirect|will-redirect[\s\S]{0,200}will-navigate/);
});

test('webContents olmadan çağrı anlamlı hata verir', () => {
  assert.throws(() => attachSubframeSchemeGuard(null), TypeError);
  assert.throws(() => attachSubframeSchemeGuard({}), TypeError);
});

console.log(`PASS: subframe-scheme-guard (${passed} kontrol)`);
