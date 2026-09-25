'use strict';

/**
 * R126 — GitHub bug dosyaları doğrulaması regresyonları (kapsamlı rapor N/K
 * + haze R124-01..03). Doğrulanan sabitler:
 * - K1/R124-02: MAX_MEDIA_TIME_SECONDS gerçekte saniye (24h), 1000h değil.
 * - K2: boş-beklenen doğrulaması ok:true dönmez (kayıp cue gizlenmezdi).
 * - K3: splitBrowserBounds({}) → null (1×1 hayalet bölünme yok).
 * - K4: setPath alan yolu bir diziden geçerken diziyi ezmez.
 */

const assert = require('node:assert/strict');
const { normalizeBrowserSession } = require('../src/browser-session-store');
const { validateBrowserSubtitleDocument } = require('../src/browser-subtitle-output');
const { splitBrowserBounds } = require('../src/browser-tab-layout');
const { setPath } = require('../src/secret-store');

let passed = 0;
const tests = [];
function test(name, fn) { tests.push({ name, fn }); }

test('K1: medya zamanı 24 saat üstünü reddeder, 1000 saat tavanı yok', () => {
  // 200_000 sn (~55 saat) → üst sınır 86400'e kelepçelenir; eski tavan
  // 3_600_000 sn (1000 saat) aşılmaz değerleri de kabul ediyordu.
  const session = normalizeBrowserSession({
    tabs: [{ url: 'https://x.test/v', position: 200_000, duration: 90_000 }],
  });
  const tab = session.tabs[0];
  assert.equal(tab.position, 24 * 60 * 60, 'position 24h tavanına kelepçelenmeli');
  assert.equal(tab.duration, 24 * 60 * 60, 'duration 24h tavanına kelepçelenmeli');
  const ok = normalizeBrowserSession({
    tabs: [{ url: 'https://x.test/v', position: 3600, duration: 7200 }],
  });
  assert.equal(ok.tabs[0].position, 3600, 'normal uzunluk korunur');
});

test('K2: boş-beklenen doğrulaması ok:false — sessiz boş dışa aktarım yok', () => {
  const result = validateBrowserSubtitleDocument('', 'srt', []);
  assert.equal(result.ok, false, 'beklenen boşken doğrulama başarı sayılmamalı');
  const missing = validateBrowserSubtitleDocument('1\n00:00:01,000 --> 00:00:02,000\nx\n', 'srt', []);
  assert.equal(missing.ok, false);
});

test('K3: splitBrowserBounds boş nesneye null döner', () => {
  assert.equal(splitBrowserBounds({}), null, '{} geçerli bounds değil');
  assert.equal(splitBrowserBounds(null), null);
  assert.equal(splitBrowserBounds({ x: 0, y: 0 }), null, 'width/height eksikse null');
  const ok = splitBrowserBounds({ x: 0, y: 0, width: 1000, height: 600 }, 0.5, 6);
  assert.ok(ok && ok.primary && ok.primary.width > 0, 'gerçek bounds yine bölünmeli');
});

test('K4: setPath diziyi nesneyle ezmez — yazım atlanır', () => {
  const settings = { list: [{ key: 'a' }, { key: 'b' }] };
  setPath(settings, 'list.0.secret', 'tok');
  assert.ok(Array.isArray(settings.list), 'dizi korunmalı');
  assert.deepEqual(settings.list, [{ key: 'a' }, { key: 'b' }], 'elemanlar dokunulmadan kalmalı');
  // Nesne düğümü normal yazılmaya devam eder (regresyon kontrolü).
  setPath(settings, 'nested.inner.key', 'v');
  assert.equal(settings.nested.inner.key, 'v');
});

for (const t of tests) {
  try { t.fn(); passed++; }
  catch (e) { console.error(`FAIL ${t.name}: ${e.message}`); }
}
console.log(`browser-report126-regressions: ${passed}/${tests.length} geçti`);
process.exit(passed === tests.length ? 0 : 1);
