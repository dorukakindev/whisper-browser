# BROWSER_BUG_REPORT_380 — Yeni-100 Batch 7: Performans/Bellek Derinleştirme

Tarih: 2026-10-01 · Dal: `devin/1790908982-b7-perf-memory` · Kapsam: yeni-100 kuyruk maddeleri 61–70 (performans/bellek derinleştirme)

## Özet

Oturum-içi bellek yüzeyinin tam denetimi + kalan ölçülmemiş sıcak yolların perf probu. **1 doğrulanmış bellek sızıntısı düzeltildi** (media-catalog posterCache), 1 bounded-yol konsolidasyonu (favicon), ~20 koleksiyon sınırlı doğrulandı, 5 yüzey ölçüldü — hepsi sağlıklı.

## Doğrulanmış kusurlar ve düzeltmeler

| ID | Bulgu | Düzeltme | Kanıt |
|----|-------|----------|-------|
| B7-1 | `src/renderer/media-catalog.js` `posterCache`: modül-IIFE Map'i uygulama ömrü boyunca sınırsız büyüyordu. Her görüntülenen afiş `Promise<{image: dataURL}>` olarak sonsuza tutuluyordu (kayıt başına ~50–500KB); büyük katalogda kaydırma → monoton bellek artışı. | `POSTER_CACHE_LIMIT=300` + `cachePoster()` FIFO tek yazım noktası; tahliye edilen afiş yeniden istendiğinde ucuz `mediaCatalog poster` IPC'siyle geri gelir. | `tests/session-map-bounds.test.js` kontrol 1 |
| B7-2 | `browserFaviconByOrigin`: iki ayrı yazım noktası — canlı yol (helpers `rememberBrowserFavicon`, 200 tavan) ve seed yükleyici (`loadBrowserFavicons`, kendi `.has` kapısıyla sınırsız ama dosya 120 kökenle sınırlı). Sızıntı değil, ancak tekilleştirilmemiş tavan tutarsızlığı. | Tek-bounded-yol: `BROWSER_FAVICON_SESSION_LIMIT=400` + `rememberBrowserFaviconByOrigin()` (FIFO + `data:` kapısı + LRU dokunma). Seed taze oturum kaydını ezmez; helpers bağımsız bağlamlarda da kapıyı korur. | kontrol 2–3 + davranış kiliti |

## Sınırlı doğrulanan koleksiyonlar (kusur yok)

`_foldCache` (24000 temizlik) · `seekLocalSheets` (8) · `timeline.undo` (30) · `browserSignalHistory` (8) · `subtitleSearchCache` (LIMIT) · `pdfDocuments` (LRU tahliye) · `browserDownloads` (100 kayıt/8 aktif) · `browserFaviconCache` ana deposu (120 LRU + 96KB/ikon) · places (300) · `subtitleSyncRecords` (500) · `resourceIpcTimestamps` (1200) · `playbackEvidence` (24+256 dedupe) · `sponsorExemptions` (100×200) · `pdfReader.rendered` (≤numPages) · `invidiousSessions` (hesap listesi) · `browserReviewConflicts`/`browserRemapTargets` (diyalog-kapsamlı) · çeviri-önbellek LRU.

## Ölçülen yüzeyler (perf probu — hepsi sağlıklı)

| Yüzey | Ölçek | Sonuç |
|-------|-------|-------|
| `queueSnapshotPayload` JSON | 500 öğe | 152KB (atomic yazım tek seferde) |
| `browserTabsSnapshot` | 20 sekme × 50KB favicon | 1.1MB — yalnız yapısal `tabs-changed` olaylarında, navigasyon başına değil |
| `mergeLiveCues` | 10k segment akış | 9.26s toplam = 0.93ms/segment amortize (~5.5 saatlik akış) |
| `mergeBrowserTranslationCues` | 10k cue | 1.5ms |
| `browser-session.json` roundtrip | tam oturum | 6ms |

## Test-altyapı bakımı

`dom-innerhtml-ratchet.test.js` ALLOWED pin'leri favicon bloğu kayması (+5 satır) nedeniyle güncellendi (`:14993→:15005`, `:21950→:21967`, `:22011→:22028`) — satır-pimli ratchet'in tasarlanmış bakımı, iddia gevşetilmedi.

## Windows etkisi

Kod tarafı platform-bağımsız (Map sınırları, IPC maliyeti); afiş tahliyesi Windows'ta da diskten yeniden-okumayla şeffaf çalışır. Windows-özel doğrulama yapılmadı (GUI koşusu yok).

## Koşulan testler

`node tests/session-map-bounds.test.js` (4/4 PASS) · `browser-favicon-cache` · `media-catalog-service/store` · `image-sink-security` · `dom-innerhtml-ratchet` · `browser-ui-regressions-r3` · `browser-ui-round2` · `workspace-privacy` · `electron-media-catalog` smoke — hepsi PASS.
