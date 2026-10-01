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
  // İş ilerlemesi dinamik dizgileri (kuyruk madde 2): backend stage metinleri,
  // görev merkezi aşamaları ve yüzde/sayaç birleşimleri.
  ["YouTube'dan indiriliyor...", 'Downloading from YouTube...'],
  ['Ses çıkarılıyor...', 'Extracting audio...'],
  ['Transkripsiyon başladı...', 'Transcription started...'],
  ['Konuşmacılar tanımlanıyor...', 'Identifying speakers...'],
  ['Altyazı dosyası yazılıyor...', 'Writing subtitle file...'],
  ['Çeviri gözden geçiriliyor (2. geçiş)', 'Reviewing translation (2nd pass)'],
  ['Formatlar yeniden yazılıyor...', 'Rewriting formats...'],
  ['Video sesi çıkarılıyor...', 'Extracting video audio...'],
  ['Ses aktivitesi analiz ediliyor...', 'Analyzing voice activity...'],
  ['Kayma hesaplanıyor (korelasyon)...', 'Computing offset (correlation)...'],
  ['Parçalı hizalama deneniyor...', 'Trying chunked alignment...'],
  ['Senkronlu altyazı yazılıyor...', 'Writing synced subtitles...'],
  ['WhisperX transkripsiyon...', 'WhisperX transcription...'],
  ['WhisperX hizalama (kelime zaman damgaları)...', 'WhisperX alignment (word timestamps)...'],
  ['İndiriliyor 45%', 'Downloading 45%'],
  ['İndiriliyor · %45', 'Downloading · 45%'],
  ['Transkripsiyon · %87.4', 'Transcribing · 87.4%'],
  ['Çevriliyor · 3/12', 'Translating · 3/12'],
  ['LLM düzeltiyor · 3/12', 'LLM fixing · 3/12'],
  ['LLM düzeltiyor: qwen2.5', 'LLM fixing: qwen2.5'],
  ['WhisperX modeli yükleniyor: tiny', 'Loading WhisperX model: tiny'],
  ['Ceviriliyor: Türkçe', 'Translating: Turkish'],
  ['3/12 tamamlandı', '3/12 completed'],
  ['3/12 tamamlandı · 2 hata', '3/12 completed · 2 errors'],
  ['3/12 tamamlandı · 1 hata', '3/12 completed · 1 error'],
  ['5 blokta hata', '5 block errors'],
  ['indirme · kalan ~01:23', 'download · ~01:23 left'],
  ['12:00 / 45:00 · kalan ~30:00', '12:00 / 45:00 · ~30:00 left'],
  ['tamamlandı · 01:23', 'completed · 01:23'],
  ['Kaydediliyor', 'Saving'],
  ['Oynatıcıya yükleniyor', 'Loading into player'],
  ['Oynatıcıya yüklendi', 'Loaded into player'],
  ['Oynatıcıya yüklenemedi', 'Could not load into player'],
  ['Dosya kaydedildi', 'File saved'],
  ['Dosyayı bul', 'Locate file'],
  ['Yeniden yükle', 'Reload'],
  ['Çeviri sürüyor', 'Translating'],
  ['Altyazı çevirisi', 'Subtitle translation'],
  ['indiriliyor…', 'downloading…'],
  ['Sağlayıcı boş yanıt döndürdü.', 'Provider returned an empty response.'],
  ['Kuyruk tamamlandı', 'Queue finished'],
  ['Altyazı çıkarma başarısız', 'Subtitle extraction failed'],
  ['Bilinmeyen hata', 'Unknown error'],
  ['7 segment · 2 dosya', '7 segments · 2 files'],
  ['3 iş bitti', '3 jobs done'],
  ['3 iş bitti · 2 hata', '3 jobs done · 2 errors'],
  ['3 iş bitti · 2 hata · 1 uyarı', '3 jobs done · 2 errors · 1 warning'],
  ['3 iş bitti · 1 uyarı', '3 jobs done · 1 warning'],
  ['3/? tamamlandı', '3/? completed'],
  ['3/? tamamlandı · 1 hata', '3/? completed · 1 error'],
  ['2 çalışıyor', '2 running'],
  ['3 bekliyor', '3 waiting'],
  ['1 hata', '1 error'],
  ['geçen süre 01:23', 'elapsed 01:23'],
];
for (const [tr, expected] of cases) assert.equal(en(tr), expected, tr);

// 2d) Görev merkezi ham TR yazar (observer çevirir + orijinali saklar);
//     yazma anında EN üreten playerTaskText kalmamalı.
assert.doesNotMatch(renderer, /playerTaskText/,
  'playerTaskText kalmadı — görev metinleri ham TR yazılmalı');

// 2c) OS bildirimi DOM dışıdır — notifyDone api.notify'a uiText'ten geçirerek
//     vermeli, yoksa EN modda bildirim TR kalır.
assert.match(renderer, /api\.notify\(uiText\(title\), uiText\(body \|\| ''\)\)/,
  'notifyDone bildirim metni uiText üzerinden geçmeli');

// 2b) transcribe.py'deki her emit("status", text="…") TR literali sözlük/kalıpla
//     kapsanır — iş sürerken gelen aşama metinleri EN'de çıplak kalamaz.
const backend = fs.readFileSync(path.join(__dirname, '../backend/transcribe.py'), 'utf8');
const stageMiss = [];
for (const m of backend.matchAll(/emit\("status"[^)]*text=f?"((?:[^"\\]|\\.)*)"/g)) {
  const sample = m[1].replace(/\{[^}]*\}/g, '7');
  if (en(sample) === sample) stageMiss.push(sample);
}
assert.deepEqual(stageMiss, [], `EN karşılığı olmayan backend stage metinleri:\n  ${stageMiss.join('\n  ')}`);

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
// Ada listesi zamanla büyüyebilir; sözleşme yalnız listenin varlığını ve
// ilk üyenin (.ai-chat-empty) korunmasını kilitler.
assert.match(locale, /uiIslands = '\.ai-chat-empty(?:,|')/);
assert.match(locale, /ownAttributeHosts = 'textarea,\[contenteditable\]'/);

console.log(`ui-locale-dynamic: ${cases.length} örnek + OSD kapsamı + ${patterns.length} kalıp`);
