'use strict';
// R124 Adım 1 — dinamik mesaj EN'i (messageKey+params), "Altyazı · N" çipi,
// teşhis kataloğu iki dilli alanları ve 401/403 genel metin sözleşmesi.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const read = (rel) => fs.readFileSync(path.join(__dirname, '..', rel), 'utf8');
const main = read('src/main.js');
const renderer = read('src/renderer/renderer.js');
const diag = read('src/browser-playback-diagnostics.js');
const lifecycle = read('src/browser-lifecycle-policy.js');
let passed = 0;
const test = (name, fn) => { try { fn(); passed++; } catch (e) { console.error(`FAIL ${name}\n${e.stack}`); process.exitCode = 1; } };

function browserErrorEnTemplates() {
  const start = renderer.indexOf('const BROWSER_ERROR_EN = {');
  const end = renderer.indexOf('};', start);
  assert.ok(start > 0 && end > start, 'BROWSER_ERROR_EN bloğu bulunamadı');
  // eslint-disable-next-line no-eval
  return eval(`(${renderer.slice(start + 'const BROWSER_ERROR_EN = '.length, end + 1)})`);
}

test('main her loadError/load-error taşıma noktasına messageKey koyar', () => {
  const { messageKey } = (() => {
    const fn = main.slice(main.indexOf('function browserLoadError'));
    return { messageKey: (fn.match(/messageKey: '/g) || []).length };
  })();
  assert.ok(messageKey >= 8, 'browserLoadError şubeleri messageKey döndürmeli');
  // did-fail-load + boş-HTTP + sertifika kayıt ve olayları
  assert.match(main, /tab\.loadError = \{ kind: 'http', code: `HTTP \$\{status\}`, message, messageKey, params, url/);
  assert.match(main, /tab\.loadError = \{ kind: 'connection', code, message, messageKey, url, retry \}/);
  assert.match(main, /code, message, messageKey, url: redactDiagnosticText\(url\)/);
  assert.match(main, /messageKey: 'load-retry', params: \{ attempt: tab\.loadRetryAttempt, max: 3 \}/);
  assert.match(main, /messageKey: certError\.messageKey, params: \{ detail: certError\.detail \}/);
  assert.match(lifecycle, /messageKey: memory \? 'crash-memory' : recoverable \? 'crash-recoverable' : 'crash-manual'/);
});

test('BROWSER_ERROR_EN main+lifecycle anahtarlarının tamamını karşılar', () => {
  const emitted = new Set();
  for (const m of (main + lifecycle).matchAll(/messageKey: '([a-z0-9-]+)'/g)) emitted.add(m[1]);
  // koşullu anahtarlar (ternary) ayrıca çıkarılır
  for (const m of (main + lifecycle).matchAll(/'(crash-memory|crash-recoverable|crash-manual|http-empty-server|http-empty-client)'/g)) emitted.add(m[1]);
  emitted.delete('generic'); // ham mesaj doğrudan gösterilir
  const en = browserErrorEnTemplates();
  for (const key of emitted) assert.equal(typeof en[key], 'function', `EN şablonu eksik: ${key}`);
  // Parametreli şablonlar doğru alanları kullanır
  assert.match(en['http-empty-server']({ status: 502 }), /HTTP 502/);
  assert.match(en['certificate-error']({ detail: 'certificate unknown' }), /\(certificate unknown\)/);
  assert.match(en['load-retry']({ attempt: 2, max: 3 }), /2\/3/);
  assert.match(en['crash-manual']({ reason: 'killed' }), /\(killed\)/);
});

test('renderer mesajları locale’e göre browserErrorText ile biçimler', () => {
  assert.match(renderer, /function browserErrorText\(source\)/);
  assert.match(renderer, /browserErrorText\(error\);\s*$/m);
  assert.match(renderer, /const errorText = browserErrorText\(event\)/);
  // tab.errorMessageKey/errorParams olaydan taşınır ve temizlenir
  assert.match(renderer, /tab\.errorMessageKey = event\.messageKey \|\| '';/);
  assert.match(renderer, /tab\.errorMessageKey = ''; tab\.errorParams = null;/);
});

test('teşhis kataloğunun her girdisi iki dilli', () => {
  const start = diag.indexOf('const DIAGNOSTIC_CATALOG = Object.freeze({');
  const end = diag.indexOf('\n});', start);
  const catalog = eval(`(${diag.slice(start + 'const DIAGNOSTIC_CATALOG = Object.freeze('.length, end + 2)})`);
  const codes = Object.keys(catalog);
  assert.ok(codes.length >= 25, `katalog küçüldü: ${codes.length}`);
  for (const code of codes) {
    const entry = catalog[code];
    assert.ok(entry.label && entry.labelEn && entry.message && entry.messageEn, `iki dilli alan eksik: ${code}`);
    assert.ok(!/^\s*$/.test(entry.labelEn + entry.messageEn));
  }
  assert.match(diag, /labelEn: base\.labelEn,/);
  assert.match(diag, /messageEn: base\.messageEn,/);
});

test('401/403 metni belge bağlamında da doğru — "Oynatma isteği" öneki kaldırıldı', () => {
  const catalog = diag.slice(diag.indexOf("'authentication-required'"), diag.indexOf("'service-throttled'"));
  assert.doesNotMatch(catalog, /Oynatma isteği HTTP 40[13]/);
  assert.match(catalog, /İstek HTTP 401 ile karşılandı/);
  assert.match(catalog, /İstek HTTP 403 ile karşılandı/);
  assert.match(catalog, /HTTP 401\. /);
  assert.match(catalog, /HTTP 403\. /);
});

test('renderer teşhis metnini locale’e göre seçer', () => {
  assert.match(renderer, /function diagnosticField\(entry, field\)/);
  assert.match(renderer, /entry\[`\$\{field\}En`\] \|\| entry\[field\]/);
  assert.match(renderer, /DIAGNOSTIC_CONFIDENCE_EN\[entry\.confidence\]/);
  assert.match(renderer, /diagnosticField\(event\.diagnostic, 'label'\)/);
});

test('"Altyazı · N" çipi locale’e göre etiket + başlık üretir', () => {
  assert.match(renderer, /label\.textContent = `\$\{window\.UiLocale\?\.t\?\.\('Altyazı'\) \|\| 'Altyazı'\}\$\{count \? ` · \$\{count\}` : ''\}`;/);
  assert.match(renderer, /en \? 'operation in progress; open details' : 'işlem sürüyor; ayrıntıları aç'/);
  const { translate } = require('../src/renderer/ui-locale');
  assert.equal(translate('Altyazı', 'en'), 'Subtitles');
});

if (!process.exitCode) console.log(`browser-report124-regressions: ${passed} test geçti`);
