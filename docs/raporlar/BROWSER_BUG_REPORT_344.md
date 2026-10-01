# BROWSER_BUG_REPORT_344 — Kuyruk-50 madde 32: büyük katalog sorguları

Tarih: 2026-10-01 · Başlangıç: `a68764f`

## Denetim bulguları

1. **Filtreler birleşemiyordu:** kütüphane paneli tek bir select ile
   all/continue/completed/has-notes/collection:X'den birini seçiyordu —
   koleksiyon + dil + izleme durumu + altyazı varlığı birlikte
   uygulanamıyordu.
2. **Dil ve altyazı-varlığı sinyali yoktu:** watchLibrary kayıtlarında dil
   bilgisi yok; tracks tablosunda duruyor ama renderer'a taşınmıyordu.
3. **Gerçek bug — kaybolan seçenek:** `updateCollectionOptions` içinde
   `[...options].slice(3)` statik 4. seçenek `has-notes`'u da siliyordu —
   koleksiyonlar yüklendiğinde "Notu olanlar" filtresi kalıcı kayboluyordu
   (3→4'e çıkan statik sayı eşlik edecek şekilde güncellenmemişti).

## Uygulanan

- **`src/library-filters.js` (yeni, UMD):** `applyLibraryFilters(items,
  {watchState, language, subs})` — tüm filtreler tek geçişte kesişim olarak
  uygulanır; girdi sırası korunur (store sırası kararlıdır).
  `libraryLanguages()` kayıtlı dilleri alfabetik listeler.
- **`watch-index.js` → `mediaLanguageMap()`:** tek SELECT ile media_id →
  {hasSubs, languages} haritası; N+1 sorgu yok. EXPLAIN QUERY PLAN testte
  doğrulandı.
- **`watchLibraryForRenderer` + `searchWatchLibrary`:** her kayda `subLangs`
  ve `hasSubs` eklenir — liste ve arama sonuçları aynı filtre yüzeyine sahip.
- **Renderer:** `playerLibraryLang` + `playerLibrarySubs` select'leri;
  mevcut durum/koleksiyon filtresiyle birlikte çalışır; dil seçenekleri
  kayıtlı dillerden dinamik dolar; EN karşılıklar ui-locale'e eklendi.
- **`updateCollectionOptions` düzeltmesi:** slice(3)→slice(4) + dil
  filtresi doldurma.

## Kanıt

- `tests/library-filters.test.js` → 8/8 PASS: tek/birleşik filtre matrisi,
  kararlı sıra (girdi sırası korunur), büyük-küçük harf toleransı,
  **50.000 kayıtta birleşik filtre <150ms**, mediaLanguageMap davranışı +
  10k medya / 30k iz ölçek testi (fts5'siz ortamda index testleri konvansiyon
  gereği atlandı — Windows'a taşınabilir sqlite'da koşar).
- `watch-library.test.js` 8/8, ui-locale suiti PASS, ipc-parity temiz.
- `node --check` tüm değişen dosyalar temiz.

## Windows etkisi

Yeni UI kontrolleri dar panelde ek satır açabilir (select'ler flex-wrap'te);
madde 42 (dar pencere) kapsamında. node:sqlite sürümü Electron/Node ile aynı —
fts5 mevcutsa (gerçek ortamda var) index yolu koşar, yoksa filtreler dil
listesi boş kalacak şekilde yine çalışır.
