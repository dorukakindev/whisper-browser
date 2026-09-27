# BROWSER_BUG_REPORT_147 — R170 büyük katalog render/işlem performansı

Tarih: 2026-09-27 · Dal: `codex/r170-catalog-perf-1790592420` · Kod commit: `ba28080`

## Kapsam

10k kayıt ölçeğinde katalog yüzeylerinin uçtan uca performans denetimi:
`src/media-catalog-store.js` (main, disk deposu), `src/renderer/media-catalog.js`
(kart ızgarası + filtre + arama), `renderer.js` `playerLibraryList` /
`renderUnifiedLibraryResults` / `runPlayerLibrarySearch` yolları.

## Bulgular

### B1 — planImport O(n×m) eşleşme, ana süreçte saniye ölçekli bloklama (DÜZELTİLDİ)

`planImport` her gelen kayıt için `resolveImport(items, incoming)` çağırıyordu;
o fonksiyon da üç ayrı `existing.filter`/`some` taraması (importRef, IMDb/TMDB
sameId, titleKey) yapıyordu. Ardından `items.findIndex` ile hedef yeniden aranıyordu.
İçe aktarma m kayıt × katalog n kayıt = O(n×m) tarama.

Ölçüm (Linux, Node 22): 5.000 kayıtlık katalog + 2.000 kayıtlık içe aktarma
önizlemesi **14.616 ms** sürdü — tek senkron çağrı, tüm Electron ana sürecini
(IPC, pencere olayları) bloklar. 10k+10k sınırında dakikayı aşardı.

**Düzeltme:** `buildImportIndexes` plan başına bir kez `byImportRef` / `byImdb` /
`byTmdb` / `titles` / `indexById` haritaları kurar; `resolveImportIndexes` aynı
semantiği O(1) aramalarla uygular. Batch içi görünürlük korunur: eklenen kayıtlar
`indexItem` ile, birleştirilenler `unindexItem`+`indexItem` ile güncellenir
(birleşmiş kayıt yeni importRef/IMDb/TMDB anahtarları kazanabilir — yeniden
indekslenmezse sonraki kayıtlar eski kimlik altında yanlış çakışma üretirdi).

**Aynı ölçüm sonrası:** 5k+2k → **56 ms** (~260×); 10k katalog + 5k içe aktarma → 82 ms.

**Eşdeğerlik kanıtı:** eski `resolveImport` mantığının birebir kopyasıyla 11
senaryo karşılaştırıldı (importRef merge, kind çakışması, çoklu importRef, IMDb
eşleşme/çoklu-çakışma, titleKey katlama, yıl farkı, boş katalog, batch içi
importRef güncellemesi, batch içi titleKey çakışması) — 0 uyumsuzluk.

### B2 — katalog araması her tuşta O(n) tam-metin katlama (DÜZELTİLDİ)

`filtered()` her `input` olayında her kayıt için
`${title} ${year} ${synopsis}`.toLocaleLowerCase('tr-TR') üretiyordu; synopsis
4.000 karaktere kadar çıkabildiğinden 10k kayıtta tuş başına ~40 MB dizgi işi +
tam DOM yeniden çizimi.

**Düzeltme:** `searchFolds` WeakMap'i — katlanmış arama metni kayıt başına bir kez
hesaplanır; liste yenilenince eski girdiler GC'ye kalır ve kayıt nesnesine veri
bulaşmaz (`api('save', {item})` yolu `makeDraft` üzerinden gittiği için ham kayıt
diske hiç dönmüyordu, ama WeakMap bunu da gereksiz kılar). Giriş 120 ms debounce
edildi; debounce `renderCards()`'ı id üzerinden çözdüğü için görünüm değişiminde
güvenli no-op.

## Denetlenip temiz çıkanlar

- `playerLibraryList` render: `items.slice(0, 300)` — 300 satır × ≤5 eşleşme
  (main tarafında `matches` 5'te kesiliyor) → sınırlı DOM.
- `renderUnifiedLibraryResults`: `results.slice(0, 160)`; `searchUnifiedLibrary`
  çağrısı zaten 160 limitli.
- `searchWatchLibrary` (main): her 16 kayıtta `setImmediate` yield + iptal
  kontrolü — 10k altyazı taraması event-loop'u boğmuyor (mevcut tasarım).
- `watchLibraryForRenderer`: depo `itemLimit: 1000` ile sınırlı; `hasNotes`
  Set üyeliği O(1).
- Kart ızgarası: `state.visibleCount` 40 başlangıç + 40'lık "Daha fazla göster"
  sayfalama; poster'lar `IntersectionObserver` ile lazy (rootMargin 120px,
  yüklenince unobserve); `safePoster` data-URL boyut kapılı (<8 MB).
- `renderCalendar`/`episodes` düzlemi: `flatMap` O(toplam bölüm), tek seferlik
  render — kabul edilebilir.

## Testler

- `tests/media-catalog-store.test.js`: +indeks eşdeğerliği senaryoları ve
  3000+1654 kayıtta <3 s performans ratchet'i (mevcut CRUD/örneklem dahil hepsi geçti).
- `tests/media-catalog-service.test.js`, `tests/catalog-roadmap.test.js`: geçti.
- `node --check` her iki dosyada temiz.

## Doğrulanmamış sınırlar / Windows etkisi

- Windows'ta 10k kayıtlık gerçek kullanıcı kataloğuyla içe aktarma ve arama
  hissi el kontrolü ister; değişiklik saf Node/DOM mantığıdır, platforma özgü
  kod yok. `install.bat`/`start.bat` etkilenmez.
- `toLocaleLowerCase('tr-TR')` katlama davranışı Windows ve Linux'ta aynı
  ICU ile koşar; birim farkı beklenmez.
