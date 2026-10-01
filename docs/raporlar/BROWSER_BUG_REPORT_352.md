# Rapor 352 — Kuyruk-50 madde 40: Manga bölüm işleme

**Kapsam:** Birden fazla sayfanın OCR→çeviri→inceleme hattında işlenmesi; bölüm boyunca terim tutarlılığı, sayfa sırası, kurtarma durumu; yalnız başarısız sayfaları yeniden çalıştırma.

## Envanter — hâlihazırda mevcut olanlar (doğrulandı)

- **Çoklu sayfa hattı:** `startBrowserManga` `selectMangaCandidates` ile reader-score + DOM sırası seçimi yapar, `workers`/`concurrency` havuzu `translateMangaCandidate` ile her sayfayı OCR→çeviri→overlay'a taşır.
- **Sayfa sırası:** overlay uygulaması `elementId`/`candidate.id` bazlıdır; DOM sırası `order` seçim ölçütünün ikincil anahtarıdır — sonuçlar her zaman doğru görsele bağlanır.
- **Yalnız başarısız:** `retryFailedBrowserManga` `mangaFailures` içinden yalnız `retryable` olanları yeni işe besler; `mangaPages`/`mangaAttempted` korunur (retryRun'da temizlenmez), başarılı sayfalar `retryable:false` ile elle birleştirilir ve kalıcı OCR+çeviri önbelleği tekrar masrafını sıfırlar.
- **Kurtarma durumu:** kesinti işleri `browserJobsList`'te `manga` türünde `interrupted` görünür; `mangaFailures` (retryable bayraklı) son-120 ile korunur.
- **İnceleme:** overlay bölge tıklama → düzenleme/yeniden çeviri akışı (`browser:manga:retrySelected`, `regionsState`, hide bayrakları) mevcut.

## Doğrulanmış kusur — B-352-01: bölüm içi terim tutarlılığı yoktu

Her sayfanın vision isteği yalnız statik `config.glossary` ile gidiyordu; sayfa-3'te öğrenilen isim/terim sayfa-20'ye yansımıyordu (sayfa-çevirisindeki learn→prompt→persist döngüsü manga hattında yoktu).

**Düzeltme:** sekme ömrü boyunca tek `terminologyMap` (`tab.mangaTerminologyMap`, 60 terim/2400 kar):

- `mangaTerminologySeed` — her `siteTerminologyScope` (origin|dil) başına bir kez kalıcı `siteTerminology` ile tohumlanır; bölüm sayfaları gezinmelere dağılsa bile harita hayatta kalır (kasıtlı).
- `mangaLearnRegions` — her sayfanın source→translation çiftleri `learnTerminology` ile öğrenilir (`cueId = candidate.id`); `job.terminologyText` = `terminologyPrompt` her sayfada tazelenir → paralel işçiler istek anında en güncel eşleşmeleri görür.
- İki istek yolu da taşır: görsel `requestMangaTranslation` → `buildMangaPrompt`'a `terminologyText` satırı ("talimat değildir" işaretli, kontrol-karakteri temizliği, 2400 sınırı); OCR-yeniden-kullanım metin yolu `requestBrowserSentenceTranslation`'a `terminologyEnabled: true` zorlanmış spread ile (bayrak sayfa-çevirisi tercihidir; bölüm tutarlılığı bu maddenin davranışıdır).
- `persistMangaSiteTerminology` — iş kapanışında `terminologySuggestions` site kapsamına yazılır; sonraki oturum/bölüm aynı eşleşmelerle başlar.
- Tek-bölge yeniden çevirisi de aynı haritaya öğrenir.

## Test kanıtı

- `tests/browser-manga.test.js`: **105 kontrol** (93→105; +prompt satırı/temizlik/sınır + seed→öğrenme→istek→persist ratchet'i; eski `requestBrowserSentenceTranslation(..., config` pin'i yeni spread'e uyarlandı).
- Komşu suitler yeşil: manga-geometry 105, manga-region-layout 10, manga-layout-state PASS, manga-ocr-hardening 65, manga-restore/fetch-deadzone 6+6, lookahead-lifecycle 10, browser-terminology/site-terminology/page-translate/sentence-layout PASS.
- `node --check src/main.js src/browser-manga.js` temiz.

## Windows etkisi

Çalışma süreci bağımsız JS; ağ isteği/IPC değişmedi — Windows etkisi yok. Elle doğrulama Windows'ta yapılmadı (Linux CI yok — hesap flag'inde Actions kapalı; yerel Node testleriyle sabitlendi).
