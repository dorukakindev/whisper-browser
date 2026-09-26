'use strict';

// EN arayüzde kalan Türkçe dinamik metinler: OSD bildirimleri, sayaçlar, dil
// rozetleri ve site profili "X: üst kapsamdan al" etiketleri. Birebir sözlük
// bunları yakalayamıyordu; ui-locale.js artık şablon kalıplarını da çevirir.
// Ayrıca i18n-coverage'ın Türkçe sezgisi (ç/ğ/ı… veya birkaç sözcük) "Orijinal",
// "Dosyadan", "A-B metni" gibi metinleri Türkçe saymıyordu.

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { translate, patterns, entries } = require('../src/renderer/ui-locale.js');

const renderer = fs.readFileSync(path.join(__dirname, '../src/renderer/renderer.js'), 'utf8');
const en = (text) => translate(text, 'en');

// 1) Her osd('…') literali EN'e çevrilir; ${…} içeren şablonlar örnek değerle
//    kalıplardan geçer. Değişken argümanlı çağrılar (osd(text)) kapsam dışı.
const TURKISH = /[çğıöşüÇĞİÖŞÜ]|\b(?:sn|ses|hız|kare|not|döngü|cümle|kelime|gecikme|oynatıcı)\b/i;
// İç içe `${a ? ` — ${b}` : ''}` şablonlarını dengeli tarayıp her ${…} bölümünü
// örnek değer "7" ile değiştirir; iç şablon da bir kez örneklenir.
function sampleTemplates(source) {
  const out = [];
  for (let i = source.indexOf('osd(`'); i >= 0; i = source.indexOf('osd(`', i + 1)) {
    let j = i + 5; let text = ''; let alt = '';
    while (j < source.length && source[j] !== '`') {
      if (source[j] === '\\') { text += source[j + 1]; alt += source[j + 1]; j += 2; continue; }
      if (source[j] === '$' && source[j + 1] === '{') {
        let depth = 1; let k = j + 2; let inner = '';
        while (k < source.length && depth) {
          if (source[k] === '{') depth++;
          else if (source[k] === '}') depth--;
          if (depth) inner += source[k];
          k++;
        }
        text += '7';
        const nested = inner.match(/`([^`]*)`/);
        alt += nested ? nested[1].replace(/\$\{[^}]*\}/g, 'x') : '7';
        j = k; continue;
      }
      text += source[j]; alt += source[j]; j++;
    }
    // İç şablon varsa gerçekçi örnek yalnız `alt`tır (koşul ya boş ya iç şablon).
    if (!/UiLocale/.test(source.slice(i, j))) out.push(...(alt !== text && alt.includes('x') ? [alt, alt.replace(/ — x$/, '')] : [text]));
  }
  return [...new Set(out)];
}

const missing = [];
for (const sample of sampleTemplates(renderer)) {
  if (TURKISH.test(sample) && en(sample) === sample) missing.push(sample);
}
for (const call of renderer.matchAll(/\bosd\(((?:[^()]|\([^()]*\))*)\)/g)) {
  const arg = call[1];
  if (/UiLocale/.test(arg)) continue;
  for (const lit of arg.matchAll(/'((?:[^'\\]|\\.)*)'/g)) {
    const text = lit[1];
    if (text.length < 2 || !TURKISH.test(text)) continue;
    if (/^\s*[?:]/.test(arg.slice(lit.index + lit[0].length)) && !/\s/.test(text) && !TURKISH.test(text)) continue;
    if (en(text) === text) missing.push(text);
  }
}
assert.deepEqual(missing, [], `EN karşılığı olmayan OSD metinleri:\n  ${missing.join('\n  ')}`);

// 2) Oynatıcı düğmeleri/rozetleri ve şablon sayaçları.
const cases = [
  ['Orijinal', 'Original'],
  ['Dosyadan', 'From file'],
  ['A-B metni', 'A-B text'],
  ['A-B klibi', 'A-B clip'],
  ['Kaynak · EN', 'Source · EN'],
  ['Çeviri · TR', 'Translation · TR'],
  ['· 0 uyarı · 0 kaynak değişikliği', '· 0 warnings · 0 source changes'],
  ['· 1 uyarı · 1 kaynak değişikliği', '· 1 warning · 1 source change'],
  ['0 kayıtlı senkron düzeltmesi', '0 saved sync fixes'],
  ['2 kayıtlı senkron düzeltmesi · Kaydedilmemiş önizleme var', '2 saved sync fixes · Unsaved preview'],
  ['Kaydedilen cümleleri göster (3)', 'Show saved sentences (3)'],
  ['Genel değer: Kapalı', 'Global value: Off'],
  ['Genel değer: Açık', 'Global value: On'],
  ['Altyazı ölçeği (%): üst kapsamdan al', 'Subtitle scale (%): inherit from parent scope'],
  ['Ses %40', 'Volume 40%'],
  ['-10 sn', '-10 s'],
  ['Gecikme +0.5 sn', 'Delay +0.5 s'],
  ['1.25× hız', '1.25× speed'],
  ['Mini oynatıcı kapatıldı', 'Mini player closed'],
];
for (const [tr, expected] of cases) assert.equal(en(tr), expected, tr);

// 3) Kalıplar yalnız TR→EN çalışır; TR hedefte metne dokunmaz. Boşluklar korunur.
assert.equal(translate('Ses %40', 'tr'), 'Ses %40');
assert.equal(en('  Ses %40 '), '  Volume 40% ');
// Her kalıp çapalı olmalı (metnin ortasındaki eşleşme kullanıcı verisini bozmasın).
for (const [re] of patterns) assert.ok(re.source.startsWith('^') && re.source.endsWith('$'), `çapasız kalıp: ${re}`);

// 4) Birden çok şablona dağılmış birleştirme kalmadı (çevrilemez yarım metinler).
assert.doesNotMatch(renderer, /osd\('Mini oynatıcı ' \+/);

// 5) Sözlük anahtarları tekil.
const keys = entries.map(([tr]) => tr);
assert.equal(new Set(keys).size, keys.length);

// 6) Yok sayılan kapsayıcıdaki arayüz adası ve yazı alanlarının kendi öznitelikleri.
const locale = fs.readFileSync(path.join(__dirname, '../src/renderer/ui-locale.js'), 'utf8');
assert.match(locale, /uiIslands = '\.ai-chat-empty'/);
assert.match(locale, /ownAttributeHosts = 'textarea,\[contenteditable\]'/);

console.log(`ui-locale-dynamic: ${cases.length} örnek + OSD kapsamı + ${patterns.length} kalıp`);
