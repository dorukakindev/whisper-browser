'use strict';

// Tarayıcı kurtarma araçları: https açılamazsa açık onaylı http denemesi, yerel
// oturumda sayfa içi çapanın korunması ve görseli PNG olarak kaydetme.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { httpFallbackUrl } = require('../src/browser-address-model.js');
const { normalizeSessionTab, normalizeBrowserSession } = require('../src/browser-session-store.js');

let passed = 0;
const test = (name, fn) => { fn(); passed += 1; console.log(`  PASS  ${name}`); };
const read = (rel) => fs.readFileSync(path.join(__dirname, '..', rel), 'utf8');

test('http denemesi yalnız https bağlantı hatalarında, sertifika hatasında asla', () => {
  assert.equal(httpFallbackUrl('https://neverssl.com/a?b=1', -102), 'http://neverssl.com/a?b=1');
  assert.equal(httpFallbackUrl('https://example.test/', -107), 'http://example.test/');
  assert.equal(httpFallbackUrl('https://example.test/', -200), '', 'ERR_CERT_COMMON_NAME_INVALID');
  assert.equal(httpFallbackUrl('https://example.test/', -202), '', 'ERR_CERT_AUTHORITY_INVALID');
  assert.equal(httpFallbackUrl('http://example.test/', -102), '');
  assert.equal(httpFallbackUrl('https://user:pw@example.test/', -102), '');
  const renderer = read('src/renderer/renderer.js');
  assert.match(renderer, /const fallback = !secure && !crashed/);
  assert.match(renderer, /title: 'Şifrelenmemiş bağlantıyla aç'/, 'http geçişi açık onay ister');
});

test('düz #çapa yalnız yerel oturumda korunur; OAuth fragmenti hiçbir zaman', () => {
  const tab = { id: 'a', url: 'https://docs.python.org/3/library/re.html#re.sub' };
  assert.equal(normalizeSessionTab(tab).url, 'https://docs.python.org/3/library/re.html');
  assert.equal(normalizeSessionTab(tab, { keepAnchor: true }).url, 'https://docs.python.org/3/library/re.html#re.sub');
  assert.equal(normalizeSessionTab({ id: 'b', url: 'https://x.test/#access_token=abc&x=1' }, { keepAnchor: true }).url, 'https://x.test/');
  assert.equal(normalizeSessionTab({ id: 'c', url: 'https://x.test/p?token=s#L42' }, { keepAnchor: true }).url, 'https://x.test/p#L42');
  const session = normalizeBrowserSession({ tabs: [tab] }, { keepAnchor: true });
  assert.equal(session.tabs[0].url, tab.url);
  assert.equal(normalizeBrowserSession({ tabs: [tab] }).tabs[0].url, 'https://docs.python.org/3/library/re.html',
    'taşınabilir paket / çalışma alanı çapasız kalır');
  const store = read('src/browser-session-store.js');
  assert.match(store, /normalizeBrowserSession\(parsed, \{ keepAnchor: true \}\)/);
  assert.match(store, /normalizeBrowserSession\(\{ \.\.\.rawSession, savedAt: Date\.now\(\) \}, \{ keepAnchor: true \}\)/);
  assert.match(read('src/main.js'), /normalizeSessionTab\(initial, \{ keepAnchor: true \}\)/);
});

test('görsel kaydetme PNG dönüştürme seçeneği sunar ve dönüşüm yalıtılmış pencerede', () => {
  const main = read('src/main.js');
  assert.match(main, /name: 'PNG olarak kaydet \(dönüştür\)', extensions: \['png'\]/);
  const convert = main.slice(main.indexOf('async function convertImageBytesToPng('), main.indexOf('async function saveBrowserSelectionNote('));
  assert.match(convert, /sandbox: true/);
  assert.match(convert, /nodeIntegration: false/);
  assert.match(convert, /cancel: !\/\^\(\?:about:blank\|data:\)\/i\.test\(details\.url\)/, 'dönüştürücü ağa çıkamaz');
  assert.match(convert, /png\.readUInt32BE\(0\) !== 0x89504e47/, 'çıktı PNG imzası doğrulanır');
  assert.match(convert, /worker\.destroy\(\)/);
});

console.log(`browser-recovery-tools: ${passed} test geçti`);
