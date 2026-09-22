# Browser Bug Raporu 37 — Düzeltme doğrulama turu

Tarih: 2026-09-16 · HEAD: `34d813a` · Ağaç: temiz

## Kapsam

Kullanıcı, rapor 25–36'da belgelenen bulguların doğrulanabilir olanlarını düzeltti ve her rapora kapanış tablosu + düzeltme notu işledi (`fdc8de2`, `4b54cad`, `3890525`, `7a92bbd`, `4db1342`, `dc4a831`, `f32ca35`, `4bb6c9f` + doküman commit'leri). Bu turda yeni bug avı yapılmadı; iddia edilen düzeltmelerin **orijinal hata mekanizmasını gerçekten kapatıp kapatmadığı** güncel kaynak üzerinde satır seviyesinde doğrulandı.

## Doğrulanan düzeltmeler (satır kanıtlı)

| Bulgu | Mekanizma | Doğrulama |
|---|---|---|
| B17 (kuyruk iptali aktif-iş kilidi) | İptalde `currentQueueId=null` → exit olayı filtreye takılıyor → `activeJobId` sonsuz takılı | `renderer.js:3786-3793` — `exitForActiveJob` muafiyeti jobId eşleşen exit'i geçiriyor, 3793'te kilit temizleniyor |
| B18 (`.json`/`.srt`/`.vtt` girdisi reddediliyor) | Koşulsuz `authorizeLocalMediaPath` | `main.js:14921-14928` — `reexport`/`translateOnly` artık `authorizeSubtitleFile`'a ayrılıyor |
| B19 (izleme klasörü grant'siz) | Yeni dosyalar auth hatası + dedupe döngüsü | `main.js:1034-1045` — bulunan her dosyaya `mediaFileAccess.grant`; yetkilendirilemeyene 5 dk `retryAfter` |
| B27 (workflow son-adım iptali başarı sayılıyor) | Abort yalnız adım öncesi | `browser-workflow-recorder.js:178-180` — adım await'i **sonrasında** ikinci abort kontrolü |
| B28 (jenerik aralığı atlama paneline ulaşmıyor) | Kayıt panele hiç ulaşmıyor | `browser-video-analysis.js:153` `browser-skips-changed` yayınlıyor → `browser-features.js:313-315` listeyi anında uyguluyor |
| B35 (bozuk dizi bağlamı tüm çeviriyi kırıyor) | `translationContext` korumasız | `main.js:6362-6366` — try/catch + `seriesContext=null` düşüşü + tanı notu |
| B57 (retry-wait iptali kalıcı kilit) | `job.state` güncellenmiyor, timer yaşamaya devam | `main.js:13400-13404` — `cancelled=true` + `clearTimeout(autoRetryTimer)` + `'cancelled'` ilerleme olayı; `runOrderedCeaCapture` içi `isCancelled()` kontrolleri (dc4a831) |
| B61/B105 (ilk stream kimliği çeviriyi askıya alıyor) | Scheduler bağlamı eski kimlikte kalıyor | `main.js:3930-3936` — ilk evlat edinmede `setContext` ile yeni kimliğe taşınıyor; değişebilir `browserWatchMediaId` karşılaştırması kaldırıldı |
| B65 (page-translate'te `isTrusted` yok) | Sentetik olaylar kalıcı önbelleğe/arşive yazabiliyordu | `browser-page-translate.js:1050,1081,1116,1122` — 4 ayrı `isTrusted` kapısı (klavye aktivasyonu `trustedKeyboardActivation` ile korunuyor) |
| B67 (sentetik auxclick / subframe sekme açıyor) | `isTrusted`+`mainFrame` yok | `browser-preload.js:36` `isTrusted` + `main.js:11473` `senderFrame===mainFrame` |
| B68 (çeviri belleği sayfa-yazılabilir sessionStorage'da) | Zehirleme → kalıcı arşiv sızıntısı | `browser-page-translate.js:424-426` — bellek izole betik dizisine taşındı, kalıcı bellek ana süreçte; `:1351` eski v1/v2 sessionStorage anahtarlarını temizliyor |
| B72 (player modunda browser olayları yerel çalışma alanını eziyor) | Aktif-sekme dallarında `workspaceMode` denetimi yok | `renderer.js` genelinde `workspaceMode==='browser'` kapıları (3229, 3275, 3331, 3614, 3665, 5466, 7382-7386, 8135, 8166, 8271, 8289 …) |
| B74 (Enter busy baypası) | Keydown kapısında `busy` yok | `browser-features.js:317` — `event.isComposing \|\| busy` kontrolü eklendi |
| B80 (preload emitter sızdırıyor) | Olay wrapper'ları ipcRenderer döndürüyordu → doğrudan `invoke`/`send` erişimi | `preload.js:36-40, 77-81` — tüm wrapper'lar unsubscribe fonksiyonu döndürüyor |
| B81 (syncSrt/translateExisting yetkisiz) | Yardımcı altyazı girdileri authorize edilmiyordu | `main.js:14929-14935` — `authorizeSubtitleFile` zorunlu |
| B83 (kütüphane araması grant'siz dosya okuyor) | `subtitleTextForSearch` yetkisiz okuma | `main.js:1731-1732` — `inspect` + `has` grant kapısı okumadan önce |
| B84 (tercih restore sessiz grant veriyor) | Restore `subtitleFileAccess.grant` çağırıyordu | `main.js:3909-3917` — grant satırı kaldırıldı; yalnız seçim/mod/kayıt restore ediliyor |
| B85/B87 (reconcile alan enjeksiyonu + hayalet cue) | Kayıtlar verbatim `output[i]`'ye ekleniyordu | `browser-subtitle-review.js:24-46` — `valid()` whitelist (text≤12K, kontrol karakteri yok, yapısal `-->` cue reddi, ≤7 gün, min süre) + `plain()` ile yalnız start/end/text uygulanıyor |
| B88 (yerel workspace medya kimliği restore edilmiyor) | Snapshot `mediaKey`/`localPath`/`ytInfo`/`originalUrl` saklamıyordu | `renderer.js:4807-4808` (kaydet) + `4830-4833` (geri yükle) |
| B86 (izin istemi gizli sekmeden) | Aktif-sekme denetimi yok; `destroyBrowserTab` `closing`'i cancel'dan önce set ediyordu | `main.js:11446` `activeRequestedBrowserTab` + kapanış/unload/crash iptal zinciri (rapor 31 kapanış notuyla uyumlu) |
| CEA geç-segment (rapor 36) | İptal sonrası gelen segment tüketiliyordu | `dc4a831` — pending download await'inden sonra iptal+b bağlam yeniden kontrolü; regresyon testi `browser-cea-full-capture.test.js` |
| Kota/aynı-dil retry fan-out (rapor 35) | Kalıcı hata tüm aralıklara yayılıyordu | `4db1342` — backend retry sınıflandırması + renderer baskısı; `backend/test_transcribe.py` + `browser-youtube-whisper.test.js` |
| Canlı altyazı çeviri kararsızlığı (rapor 33) | Retry/stale davranış | `7a92bbd` — scheduler + main + renderer yaşam döngüsü; 4 test dosyasında regresyon |
| Tam CEA edinme sıralaması | Çeviri eksik CEA ile başlayabiliyordu | `f32ca35` — çeviri öncesi tam CEA edinimi |

## Test durumu

- **`npm test`: TÜM TESTLER GEÇTİ** — node paketi (adversarial-ipc 13/13, audit serileri, watch-library 161 fixture + fuzz 6000 + concurrency 12, migration, performance) + Python backend (180 test) + yardımcı suitler.
- `node --check` üç kritik dosya için temiz (main/preload/renderer — test paketi içinde doğrulanıyor).

## Kalan açık sınırlar (kapanış tablolarının kendi notlarından)

- **B60 — kısmen:** eski async üreticilerin tamamına immutable event-context eklemek geniş protokol değişikliği; açık sınır olarak kayıtlı.
- **B64 — kısmen:** üç önizleme altyapısının tüm TTL/tek-kullanım kombinasyonlarını kapsayan ortak mutasyon matrisi hâlâ yok.
- **B100 spec alt maddesi:** kuyruksuz işin reload sonrası bağlanması yeni özellik olarak ayrıldı.
- **`paths:scanMedia` (B77 artığı):** handler hâlâ ham string yol kabul ediyor; mevcut tek çağıran preload sarmalayıcısı `webUtils.getPathForFile` provenans'ıyla geldiği ve B80 sızıntısı kapandığı için exploit yolu kapalı — derinlemesine savunma olarak doğrulama eklenebilir.
- **Denetlenmemiş kalan bölgeler:** önceki turda hız sınırına takılan 5 ajanın kapsamı (transcribe.py derinlik, node yardımcılar bakiyesi, yakalama boru hattı derinliği, settings/session IPC, deneysel doğrulama) bu turda da ayrıca taranmadı.

## Sonuç

Kapanış tablolarında "Düzeltildi" işaretlenen bulgulardan yüksek önem dereceli 20+ madde satır seviyesinde doğrulandı; iddia edilen mekanizmaların tamamı güncel kodda kapalı. Test paketi yeşil. Yeni ürün bug'ı bulunamadı.
