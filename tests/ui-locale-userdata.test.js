'use strict';

// Kullanıcı verisi taşıyan düğümler (medya başlığı, not, alıntı, etiket,
// dosya adı, koleksiyon adı) ui-locale sözlüğüne girmemeli: birebir
// anahtarla çakışan bir kullanıcı metni (ör. "Kaydet" adlı video) EN/TR
// geçişinde arayüz metni sanılıp eziliyordu. Saf kullanıcı-verisi
// düğümleri artık yaratım yerinde `data-ui-untranslated` ile işaretlenir
// (öznitelik ui-locale.js'in `ignored` seçicisinde zaten var). Ayrıca
// bu yüzeylerin kalan arayüz kromu (durum etiketleri, boş-durum
// metinleri, derece düğmeleri) için eksik sözlük çiftleri tamamlandı.

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { translate, entries } = require('../src/renderer/ui-locale.js');

const renderer = fs.readFileSync(path.join(__dirname, '../src/renderer/renderer.js'), 'utf8');
const locale = fs.readFileSync(path.join(__dirname, '../src/renderer/ui-locale.js'), 'utf8');
const en = (text) => translate(text, 'en');

// 1) `ignored` seçicisi opt-out özniteliğini kapsıyor — işaretli düğüm ve
//    alt ağacı taranmaz; bu olmadan aşağıdaki işaretler etkisiz kalır.
assert.match(locale, /\[data-ui-untranslated\]/, 'ignored seçicisinde opt-out özniteliği yok');

// 2) Saf kullanıcı-verisi düğümleri yaratım yerinde işaretli (statik ratchet).
const marks = [
  [/queue-title" data-ui-untranslated/, 'kuyruk başlığı'],
  [/className = 'browser-download-name'; name\.dir = 'auto';\s*\n\s*name\.dataset\.uiUntranslated = ''/, 'indirme dosya adı'],
  [/const title = document\.createElement\('strong'\);\s*\n\s*title\.dataset\.uiUntranslated = '';\s*\n\s*title\.textContent = result\.title/, 'birleşik sonuç başlığı'],
  [/snippet\.dataset\.uiUntranslated = ''/, 'birleşik sonuç parçası'],
  [/const title = document\.createElement\('strong'\); title\.dataset\.uiUntranslated = '';\s*\n\s*title\.textContent = annotation\.mediaTitle/, 'araştırma kartı başlığı'],
  [/const quote = document\.createElement\('blockquote'\); quote\.dataset\.uiUntranslated = ''/, 'araştırma alıntısı'],
  [/research-card-translation';\s*\n\s*translation\.dataset\.uiUntranslated = ''/, 'araştırma çevirisi'],
  [/research-tag';\s*\n\s*chip\.dataset\.uiUntranslated = ''/, 'etiket çipi'],
  [/const title = document\.createElement\('strong'\);\s*\n\s*title\.dataset\.uiUntranslated = '';\s*\n\s*title\.textContent = item\.title/, 'izleme başlığı'],
  [/option\.dataset\.uiUntranslated = ''/, 'koleksiyon seçeneği'],
];
for (const [re, label] of marks) assert.match(renderer, re, `işaretsiz kullanıcı-verisi düğümü: ${label}`);

// 3) Yeni sözlük çiftleri — bu yüzeylerde EN'de TR kalan arayüz metinleri.
const pairs = new Map(entries);
for (const [tr, expected] of [
  ['Alıntı', 'Quote'], ['Kelime', 'Word'], ['Yine', 'Again'], ['Zor', 'Hard'],
  ['İyi', 'Good'], ['Kolay', 'Easy'], ['Alıntıyı bul', 'Find quote'],
  ['Kaynağı aç', 'Open source'], ['Son tekrar', 'Last review'],
  ['İlk tekrar', 'First review'], ['İsimsiz içerik', 'Untitled item'],
  ['İsimsiz video', 'Untitled video'], ['İsimsiz sonuç', 'Untitled result'],
  ['Eşleşen kayıt', 'Matching record'], ['Bağlantı kesildi', 'Connection lost'],
  ['İndirme başarısız', 'Download failed'], ['İndiriliyor', 'Downloading'],
  ['İptal et', 'Cancel'], ['Oynatıcıda aç', 'Open in player'],
  ['Klasörde göster', 'Show in folder'], ['Listeden kaldır', 'Remove from list'],
  ['Yukarı taşı', 'Move up'], ['Aşağı taşı', 'Move down'], ['Aç', 'Open'],
  ['Bitti', 'Done'], ['Sırada', 'Queued'], ['Kuyrukta', 'In queue'],
  ['Çıktı klasörünü aç', 'Open output folder'],
  ['Kaydetme konumu henüz seçilmedi.', 'No save location chosen yet.'],
  ['Henüz kaydedilmiş not yok.', 'No saved notes yet.'],
  ['Şu anda tekrar zamanı gelmiş kart yok.', 'No cards due for review right now.'],
  ['Kaydettiğiniz replikler, kelimeler ve notlar burada görünecek.', 'Saved quotes, words and notes will appear here.'],
  ['Devam eden indirme yok.', 'No active downloads.'],
  ['Henüz indirme yok. Bir web sayfasındaki indirme bağlantısını kullanın.', 'No downloads yet. Use a download link on a web page.'],
  ['Eşleşen dosya bulunamadı.', 'No matching file found.'],
  ['İndirme listesi alınamadı.', 'Could not load the download list.'],
  ['İndirme işlemi gerçekleştirilemedi.', 'Download could not be completed.'],
  ['ilk 160 gösteriliyor', 'showing first 160'],
  ['Notlar aranıyor…', 'Searching notes…'],
  ['Kayıtlı içerikler aranıyor…', 'Searching saved items…'],
]) {
  assert.equal(pairs.get(tr), expected, `sözlük çifti eksik/bozuk: ${tr}`);
}

// 4) Birleşik durum metinleri kalıplarla çevrilir.
assert.equal(en('7 sonuç'), '7 results');
assert.equal(en('1 sonuç'), '1 result');
assert.equal(en('3 indirme sürüyor.'), '3 downloads in progress.');
assert.equal(en('4 içerik · 2 metin/not eşleşmesi'), '4 items · 2 text/note matches');

// 5) Fallback/kalıp metinler doğrudan uiText üzerinden kurulur — işaretli
//    düğümde kalan yazara ait TR dizgi de EN modunda doğru görünür.
for (const call of [
  /uiText\('İsimsiz sonuç'\)/, /uiText\('İsimsiz içerik'\)/, /uiText\('İsimsiz video'\)/,
  /uiText\('Eşleşen kayıt'\)/, /uiText\('Kaydetme konumu henüz seçilmedi\.'\)/,
  /uiText\('İlk tekrar'\)/, /uiText\('Son tekrar'\)/, /uiText\('aralık'\)/,
  /uiText\('gün'\)/, /uiText\(researchTypeLabel/, /uiText\(researchStatusLabel/,
  /uiText\(label\)/, /uiText\('toplam boyut bilinmiyor'\)/,
]) {
  assert.match(renderer, call, `uiText sarması eksik: ${call}`);
}

// 6) Kullanıcı-verisi alanlarına uiText SARILMAZ — veri olduğu gibi kalır.
for (const bad of [
  /uiText\(item\.label\)/, /uiText\(item\.filename\)/, /uiText\(annotation\.mediaTitle\)/,
  /uiText\(annotation\.source\)/, /uiText\(annotation\.translation\)/,
  /uiText\(result\.title\)/, /uiText\(result\.snippet\)/, /uiText\(item\.title\)/,
]) {
  assert.doesNotMatch(renderer, bad, `kullanıcı verisine uiText sarılmış: ${bad}`);
}

// 7) Sözlük anahtarları tekil kalmalı (yerleşik kuralın aynası).
const keys = entries.map(([tr]) => tr);
assert.equal(new Set(keys).size, keys.length);

console.log(`ui-locale-userdata: ${marks.length} işaret noktası + sözlük/kalıp kilitleri geçti`);
