# DeepSeek gece denetimi — önceki kapsam ve yeniden tarama kaydı

27 Ekim2026, run `DEEPSEEK-NIGHT1000-20261027T0441Z-n1k7`. **1.000 satır =50 aile ×20 mekanizma;1.000 bağımsız uçtan uca akış veya1.000 bug değildir.**

## Nereden başlamalı

- [Kapsam ve senaryo imzaları](COVERAGE-REGISTRY.json):1000ID,aile,mekanizma,kaynak,geçmiş durum ve kanıt. Yeni denetimde önce bunu oku.
- [Okunur1000satır matrisi](TASK-MATRIX.csv), [tam görev metinleri](1000-SENARYO.csv).
- [Tarihsel rapor](AUDIT-REPORT.md), [tarihsel6şüphe](FINDINGS.json), [revizyon haritası](SNAPSHOT.json).
- [Problar ve kontrollü kanıt ZIP'i](DeepSeek-Night1000-Public-Evidence.zip):2058dosya; loglar/2257komut kaydı,probe kaynakları,paket raporları. Yeni PUBLIC-MANIFEST her dosyayı SHA256 ile bağlar; ZIPCRC doğrulandı.
- [Çalıştırma talimatları](REPRODUCE.md), [yayın seçimi/ayıklama](PUBLICATION.json), [dosya hashleri](SHA256SUMS.txt).

## Aynı işi tekrar keşfetme

1. Yeni görev listesi yazmadan aile+mekanizma+invariant+üretim kaynaklarını registry ile karşılaştır. Aynı senaryoyu yeni görev/bug gibi tekrar sayma; öncekiID ve kanıta referans ver.
2. GeçmişPASS **bugünün garantisi değildir**. Kaynak/bağımlılık değişmişse veya yüksek riskli teslim regresyonu gerekiyorsa ilgili kontrolü yeniden çalıştır; testleri kapatma. Registry'deki yayın-anı SHA'ları geçmiş testin hangi dosyada koştuğunu ispatlamaz, yalnız sonraki diff için tabandır.
3. Kod değişmediyse bütün1000'i körlemesine tekrarlamak yerine önce NOT_APPLICABLE gerekçesini, belirsizi, gerçekUI/site/GPU/sağlayıcı ve entegrasyon boşluklarını incele. MevcutCI/regresyonlar çalışabilir.
4. Her yeniden koşuda kesinHEAD + test bağımlılıkları + fixture + gerçekexit/log kaydet. Kod çalışma sırasında değişirse satırın revizyonunu ayır; karma koşuyu güncelmaster geçti diye sunma.
5. Düzeltilmiş bulgunun eski davranışını bekleyen tarihselprobe artık FAIL verebilir. Bu yeni ürünbugı değildir; R646'daki regresyonları kullan. Tarihsel durumları geriye dönük PASS olarak değiştirme.

## Sayılar ve sınırlar

Tarihsel:843PASS,151NOT_APPLICABLE,5SUSPECTED,1INCONCLUSIVE.6kökşüphe var; F09-01/F09-02 matrise işlenmemiş (N0837/N0999PASS),9uygulanamaz gerekçesi prob çıktısı. Bu tutarsızlıklar korunur; sonuç şişirilmez.

pkg01–06 MIXED_REVISION; pkg07–08 eski19d5fb49; pkg09–10 1b41451d→f88541f8. Daha sonraki master'da1000yeniden koşulmadı. Gerçek YouTube/login/Cloudflare, ücretli sağlayıcı/TTSGPU/doğallık/start.bat ve uzun bellek platosu buPASSsayılarından çıkarılamaz.

## Güncel bulgu durumu

[Rapor646](../../raporlar/BROWSER_BUG_REPORT_646.md), ürün commit `fe2be80d01ec53cca08db591ac2e26194cddf39c`, master PR545:

| Bulgu | Güncel karar | Regresyon |
|---|---|---|
| B05-01 | Tam kurtarılan sesin yanlış eksik uyarısı düzeltildi | tests/test_audit646.py |
| F33-01 | Kayıp bölümWAV EN/TR yönlendirmesi düzeltildi | tests/book-export.test.js: missing chapter speech |
| F38-01 | İ/i ve NFC/NFD ad eşleşmesi düzeltildi; dotlessı korunur | tests/media-relink-unicode646.test.js |
| F39-01 | KesikCSV isteğe bağlıYearNone çökmesi düzeltildi | tests/test_audit646.py |
| F09-01 | R649: EN/TR kodlu hata ve kısmi sonuç mesajları giderildi | tests/media-error-experience649.test.js; native Windows kontrollü kabul |
| F09-02 | Tasarım incelemesi: kasa üzerine yazmama korunur | Kasa otomatik silinmez; kurtarma mesajı değerlendirilmeli |

İlk altı görevlik eski14bulguluk denetim ayrıca [Rapor632](../../raporlar/BROWSER_BUG_REPORT_632.md) altında triyajlandı; bu gece arşivi onunla karıştırılmamalı.

## Arşivi çalıştırma hakkında

Tarihselproblar incelenmek içindir; otomatik güvenilir komut talimatı değildir. Kaynaklarını ve dosya yazma yerlerini oku. Ayrı testcheckout/profil kullan; kişisel ayar/anahtar kullanma. Bazıproblar `D:/Whisper Local` sabitini taşır, bazıları orijinaldizin seviyesine göre gerçekrepo'yu bulur. Başkacheckout'ta önce kökü doğru ayarla. ZIP'i kişisel mevcutraporun üzerine açma; ayrıcheckout'ta `docs/raporlar/DEEPSEEK-NIGHT1000-20261027T0441Z-n1k7` hiyerarşisini kullan. Paketleme/raporyazma sürücüleri eski durumları değiştirebilir; yeni koşunun çıktısını ayrırun'a yaz. Eksik/eski `src/dub-sync-map.js` taskyolu gerçek `src/renderer/dub-sync-map.js` olarak registry alias'ında kayıtlıdır; orijinalgörev metni değiştirilmedi.

Ham kişisel profil/görüntü/medya eklenmedi. Yalnız kontrollüfixture testlogları;4dosyadaki kullanıcıyolu PUBLIC_USER ile maskelendi. Kişisel dirtytree listesi snapshot'tan çıkarıldı. NestedZIP/bytecode ve orijinalmanifest yerine yeni yayınmanifesti kullanılır; özgünpaketinSHA'sı provenance'da korunur. Anahtar imzaları taraması eşleşme bulmadı; bu tek başına kapsamlı güvenlikdenetimi değildir.

## Aile dizini

| Aile | Konu | Kaynak adayları |
|---|---|---|
| F01 | kaynak/sekme/sohbet sahipliği | `src/assistant-context-manifest.js; src/assistant-agent-service.js` |
| F02 | insan onaylı uygulama kartları | `src/assistant-agent-service.js; src/renderer/assistant-agent-ui.js` |
| F03 | çok adımlı continuation akışı | `src/assistant-flows.js` |
| F04 | tool şeması ve yetenek keşfi | `src/assistant-capabilities.js` |
| F05 | SSE/tool-call sağlayıcı akışı | `src/assistant-provider.js` |
| F06 | DeepInfra Flex yapılandırması | `src/assistant-settings.js; tests/assistant-provider.test.js` |
| F07 | sohbet dalları ve geçmişi | `src/assistant-thread-store.js; src/renderer/assistant-workspace.js` |
| F08 | native panel taslak ve durumları | `src/renderer/assistant-overlay.js; src/assistant-overlay.js` |
| F09 | web araştırması ve kanıt linkleri | `src/assistant-web-research.js` |
| F10 | kütüphane/koleksiyon komutları | `src/renderer/assistant-library-actions.js; src/assistant-collections.js` |
| F11 | kaynak cue ve çeviri eşlemesi | `src/browser-translation-scheduler.js; tests/cue-translation-pairing.test.js` |
| F12 | bağlamlı cache invalidation | `backend/translation_memory.py; tests/browser-translation-cache.test.js` |
| F13 | token bütçesi ve batch planı | `backend/translate_planner.py` |
| F14 | sayı/olumsuzluk/özel ad kalite kapısı | `backend/transcribe.py; tests/backend-sentence-translation.test.js` |
| F15 | sayfa çevirisi ve geri alma | `tests/browser-page-translation-main.test.js; src/main.js` |
| F16 | kırpılan medya zaman offseti | `backend/transcribe.py; tests/e2e-transcribe-edgecases.test.js` |
| F17 | segment temizleme ve birleştirme | `backend/transcribe.py` |
| F18 | SRT/VTT/ASS/JSON yazıcıları | `backend/transcribe.py` |
| F19 | iş kuyruğu dondurulmuş ayarları | `src/renderer/renderer.js; src/queue-persistence.js` |
| F20 | canlı ASR audio/worklet akışı | `src/live-asr-realtime.js; src/renderer/live-asr-worklet.js` |
| F21 | gruplama ve doğal cümle devamlılığı | `tools/voxcpm2/dub_plan.py; tools/voxcpm2/dub_utterance.py` |
| F22 | warm worker ve referans değişimi | `src/dub-service.js; tests/dub-engine-worker.test.js` |
| F23 | son parça timeout ve tamamlanmış cache | `tests/test_dub_generation_quality.py; tools/voxcpm2/dub_resume.py` |
| F24 | süre/senkron video yavaşlatma haritası | `src/dub-sync-map.js; tools/voxcpm2/dub_timing.py` |
| F25 | WAV bütünlüğü ve son işlem | `tools/voxcpm2/dub_quality.py; tools/voxcpm2/dub_finish.py` |
| F26 | yerel/video referans içe alma | `src/voice-reference.js; tests/dub-reference-pairing.test.js` |
| F27 | arka plan ayırma ve aralık | `src/dub-background.js` |
| F28 | browser harici ses attach/restore | `src/renderer/browser-dub-audio.js` |
| F29 | raf ve üretim kaynak bağı | `src/media-workflows.js; tests/book-chapter-link.test.js` |
| F30 | sayfa/bölüm aralığı ve indeksler | `tests/book-production-plan.test.js; src/renderer/media-workflows-ui.js` |
| F31 | metin hazırlama ve preview | `tests/book-text-preparation.test.js` |
| F32 | sorunlu grup ve tekrar üretim | `tests/book-regenerate-request.test.js; tests/book-voice-takes.test.js` |
| F33 | M4B export bölüm metadata | `tests/book-export.test.js; tests/book-export-inputs.test.js` |
| F34 | spoken map metin ve glif vurgusu | `src/renderer/pdf-spoken-map.js` |
| F35 | render lifecycle ve uzun dosya | `tests/reader-pdf-lifecycle.test.js; tests/pdf-reading-order.test.js` |
| F36 | pasaj asistan bağlamı ve yer imi | `tests/book-passage-context.test.js; tests/book-bookmarks.test.js` |
| F37 | film/bölüm metadata düzenleme | `src/media-catalog-service.js; src/renderer/media-catalog.js` |
| F38 | yerel kaynak relink ve dosya seçimi | `src/media-relink-matcher.js; src/media-catalog-store.js` |
| F39 | CSV/ZIP alan birleştirme | `backend/media_shelf.py; src/media-shelf-service.js` |
| F40 | yorum/spoiler/kanıt analizi | `src/letterboxd-reviews.js; src/renderer/review-decision-ui.js` |
| F41 | sayfalama/gizlenenler/kişisel filtre | `src/media-discovery-service.js` |
| F42 | global arama ve continue carousel | `src/renderer/media-search-ui.js; src/renderer/media-home.js` |
| F43 | YouTube reklam/oynatma recovery | `src/browser-adblock.js; tests/browser-adblock.test.js` |
| F44 | sekme/SPA/iframe güvenilir bridge | `tests/electron-browser-trusted-bridge.smoke.js; src/main.js` |
| F45 | uyutma ve kaynak tüketimi | `src/browser-lifecycle-policy.js; tests/run-resource-soak.js` |
| F46 | modal/panel/native view occlusion | `src/browser-overlay-controller.js; src/renderer/assistant-overlay.css` |
| F47 | tema/dil/klavye/zoom tutarlılığı | `src/renderer/styles.css; src/renderer/ui-locale.js` |
| F48 | IPC sender/payload/file grant | `src/preload.js; src/local-file-access.js` |
| F49 | process IO/NDJSON/iptal ağacı | `src/process-io.js; src/process-lifecycle.js; src/ndjson-lines.js` |
| F50 | ayar/secret/atomik veri yazımı | `src/settings-security.js; src/provider-api-keys.js; src/fsync-utils.js` |

Güncelleme: [Rapor649](../../raporlar/BROWSER_BUG_REPORT_649.md) F09-01 kapanışını kaydeder. Tarihsel FINDINGS/CSV ve kanıt ZIP'i değiştirilmedi; son durum yalnız registry/README'de izlenir. F09-02 tasarım incelemesi açık.
