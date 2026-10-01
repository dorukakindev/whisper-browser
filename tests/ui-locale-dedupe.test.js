// R409: ui-locale entries — aynı EN anahtarına birden çok TR karşılık
// eklenebilir (Map son girdiyi kazanır). Yinelenen anahtarların hangi TR'ye
// çözüleceği bilinçli sabittir; yeni bir yineleme bu listeye eklenmeden
// geçemez (bilinçli seçim zorunluluğu).
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.join(__dirname, '..');
const src = fs.readFileSync(path.join(root, 'src/renderer/ui-locale.js'), 'utf8');

const mod = (() => {
  const sandbox = { module: { exports: {} } };
  vm.createContext(sandbox);
  vm.runInContext(src, sandbox);
  return sandbox.module.exports;
})();

const { entries, translate } = mod;

const EN_DUP_CANONICAL = new Map([
  ['Interface language', 'Arayüz dili'],
  ['Media library', 'Arşiv'], // toTurkish override
  ['Both', 'İkisi'],
  ['Remove', 'Çıkar'],
  ['Add to queue', 'Sıraya ekle'],
  ['Generate subtitles', 'Altyazı oluştur'],
  ['Cancel', 'İptal'], // toTurkish override
  ['Loading', 'Yükleniyor'],
  ['Bilingual viewing workspace', 'İki dilli görüntüleme çalışma alanı'],
  ['Subtitles', 'Altyazılar'],
  ['Translation only', 'Yalnızca çeviri'],
  ['Page QR code', 'Sayfanın QR kodu'],
  ['Mini player opened', 'Mini oynatıcı açıldı'],
  ['Layout', 'Düzen'],
  ['Export', 'Dışa aktar'],
  ['Intro', 'Jenerik'],
  ['Not measured', 'Ölçülemedi'],
  ['Title', 'Başlık'],
  ['Search subtitles', 'Altyazıda ara'],
  ['All', 'Hepsi'],
  ['Subtitle display', 'Altyazı görünümü'],
  ['Subtitle tools', 'Altyazı yardımcı araçları'],
  ['Unsaved preview', 'Kaydedilmemiş önizleme var'],
  ['Sync', 'Senkron'],
  ['Library sections', 'Kütüphane bölümleri'],
  ['Series', 'Dizi'],
  ['and', 've'], // toTurkish override
  ['Date not announced', 'Tarih açıklanmadı'],
  ['Playlists', 'Oynatma listeleri'],
  ['Muted', 'Ses kapalı'],
  ['Password', 'Parola'],
  ['Starting…', 'başlatılıyor…'],
  ['Completed', 'Tamamlandı'], // toTurkish override
  ['Review', 'Kontrol'],
]);

test('yinelenen EN anahtarları yalnız bilinen kümede kalır', () => {
  const counts = new Map();
  for (const [, en] of entries) counts.set(en, (counts.get(en) || 0) + 1);
  const dups = [...counts.entries()].filter(([, n]) => n > 1).map(([en]) => en).sort();
  assert.deepStrictEqual(dups, [...EN_DUP_CANONICAL.keys()].sort(),
    'yeni EN yinelemesi eklendiyse kanonik karşılığını EN_DUP_CANONICAL içine sabitle');
});

test('TR anahtarları benzersiz', () => {
  const counts = new Map();
  for (const [tr] of entries) counts.set(tr, (counts.get(tr) || 0) + 1);
  const dups = [...counts.entries()].filter(([, n]) => n > 1).map(([tr]) => tr);
  assert.deepStrictEqual(dups, []);
});

test('her yinelenen EN anahtarı kanonik TR karşılığına çözülür', () => {
  for (const [en, tr] of EN_DUP_CANONICAL) {
    assert.strictEqual(translate(en, 'tr'), tr, `EN '${en}' → '${tr}' bekleniyor`);
  }
});

test('kaynak TR dizgisi TR hedefte olduğu gibi korunur', () => {
  // locale==='tr' iken toEnglish'te anahtar olan TR kaynak çevrilmez —
  // TR'den yazılmış öğe EN→TR turunda kendi yazısını geri bulur.
  const toEnglish = new Map(entries);
  for (const tr of EN_DUP_CANONICAL.values()) {
    assert.ok(toEnglish.has(tr), `kaynak TR '${tr}' toEnglish'te bulunamadı`);
  }
});

test('override noktaları kaynakta sabit', () => {
  assert.match(src, /toTurkish\.set\('and', 've'\)/);
  assert.match(src, /toTurkish\.set\('Cancel', 'İptal'\)/);
  assert.match(src, /toTurkish\.set\('Media library', 'Arşiv'\)/);
});
