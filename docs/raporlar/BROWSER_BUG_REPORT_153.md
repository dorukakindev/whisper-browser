# BROWSER_BUG_REPORT_153 — T12: Birleşik regresyon raporu (R106→R171)

Tarih: 2026-09-27 · Dal: `codex/t12-unified-report-*` · Temel: master `b3ac5fe`

Bu meta-rapor, uzun soluklu "bugları çöz ve kusursuzlaştır" kampanyasının (R106'dan R171'e, PR #26→#101) birleşik durum özetidir: doğrulanan yüzeyler, bulunan/düzeltilen bug sınıfları, test envanteri ve kalan doğrulama borcu.

## 1. Test envanteri (master `b3ac5fe` ölçümü)

| Katman | Dosya | Hacim |
|---|---|---|
| Node birim/sözleşme testi (`tests/*.test.js`) | 292 | ~2.294 `test()` çağrısı, ~8.060 `assert` |
| Python testi (`backend/test_*.py`) | 31 | ~875 `assert` |
| Electron smoke (`tests/*.smoke.js`) | 39 | gerçek Electron + CDP; `run-electron-smokes.js` envanteri + `--all/--network/--live` kademeleri |
| Denetim raporu serisi (`docs/raporlar/BROWSER_BUG_REPORT_*.md`) | 116 | R106–R152 ardışık + bu birleşik |

`npm test` = `tests/run-all.js`: 292 Node dosyası + 31 Python dosyası, dosya başına 10 dk zaman aşımı; CI `ubuntu-latest` + `windows-latest` ikisi de zorunlu yeşil.

## 2. Alan bazında doğrulanmış yüzeyler

- **Altyazı zinciri (176 test dosyası, `browser-*`/`subtitle-*`):** manifest ayrıştırma (HLS SKIP/MAP/BYTERANGE/DISCONTINUITY, DASH SegmentTimeline/List/Template+PTO), MP4 tfdt/trun, CEA-608/708 + discontinuity, Content-Range eşleşme, yakalama kanıt zinciri (provenance/recovery/checkpoint), overlay sınır zamanlayıcı + rVFC + fallback, senkron transformu (iki-nokta doğrulama).
- **Oynatıcı:** A-B döngüsü, öğrenme modları (shadowing/loop/skip-gaps), sponsor atlama (ask/mute/auto + rewind-watch), mini-player (sahte BrowserWindow ile 8 senaryo), medya seçim/prob.
- **SmartTube/YouTube:** TV cihaz kodu akışı, çoklu hesap (ekle/geçiş/silme/yarış koşulları), FEhistory geçmişi, RSS abonelik akışı, Invidious, yerel abonelikler.
- **Tarayıcı kabuğu:** sekme sabitleme/grupları, omnibox + favicon önbelleği, sayfada-bul, hata sayfaları, kozmetik/adblock, sayfa çevirisi (dinleyici temizliği dahil), manga/OCR SSRF kapıları.
- **Güvenlik:** preload↔main IPC eşliği ratchet'i, webview global reddi, SSRF kapıları (indirme/manga/yt-dlp/Stremio redirect zinciri), `.wbp` arşiv traversal + boyut yalanı, atomik JSON yazma, secret'ların argv yerine env ile geçmesi.
- **Dayanıklılık:** kuyruk durumu bozulma simülasyonu (25k kontrol), NDJSON parçalanma fuzz'ı (2k tur), retry/backoff sınırları, NaN/Infinity sızma kapıları, kaynak sızıntı envanteri, flaky-test determinizmi (sabit uyku→koşul yoklaması).
- **Performans:** katalog import O(n×m)→O(1) indeks (14.6s→56ms), altyazı arama O(L²)→tek-geçiş (21s→34ms), başlangıç require zinciri 12ms profili.
- **Kurulum/Windows:** install/start .bat setlocal+pause düzeltmeleri, ctranslate2 4.4.0 pin (4.8.2 Windows'ta 0xC0000005 çöküyordu), import smoke'ları, GPU'suz rozeti.
- **i18n:** 348 EN girişi + sink-coverage ratchet; Türkçe varsayılan UI metinleri korunuyor.

## 3. Kampanya genelinde bulunan bug sınıfları (tekrar eden kalıplar)

1. **Sessiz veri kaybı/sahte başarı:** boş altyazı `ok:true`, `lastWatched:0` ezme, kuyruk `running→pending` kurtarma, corrupt settings → forenzik yedek.
2. **Kelepçe tutarsızlığı (gözlem≠kontrol):** playbackRate'in üç yerde kontrol sınırına kesilmesi (R152/B2–B4) — "kontrol limitini gözlem yoluna uygulama" kalıbı.
3. **Yarış/kuşak hataları:** hesap ghost satırları, token/epoch geçersizleştirme, rAF `currentTarget` null, `staleAbort` disiplini.
4. **SSRF/yol güvenliği:** redirect zinciri, FQDN sondaki-nokta, literal-IP, zip traversal/file_size yalanı.
5. **Kodlama/zaman:** eski-kodlama tahminci + yapı kapısı, DASH PTO, X-TIMESTAMP-MAP, birim-soneki zamanlar, 24s/7g tavanı.
6. **Kaynak/yaşam döngüsü:** dinleyici sızıntıları (sayfa-çevirisi restore), timer çiftleri, child_process close dengesi.
7. **Parser dayanıklılığı:** timedtext NaN nitelik, boş-ids, ASS bozuk girdi, fold-değiştiren codepoint'ler.

## 4. Kalan doğrulama borcu (Windows makinesi / gerçek servis)

- **T9 gerçek-UI kabulü** — Windows child oturumunda koşuyor (EN/TR, 720p/1080p/DPI, klavye, çoklu hesap, sabit sekme, tema-senkron başlık çubuğu, son-izlenenler sırası). Sonuç ayrı rapora girecek.
- **Canlı sağlayıcılar:** OpenSubtitles hesabı/API anahtarı gerektiren yollar mock ile sınırlı; gerçek Google oturumlu YouTube akışı kullanıcı hesabıyla doğrulanmalı.
- **GPU/DRM:** RTX 4070 Ti + cuDNN yolu ve Castlabs DRM yalnız kullanıcının Windows makinesinde tam doğrulanabilir (R114-C ortam GPU'suzdu).
- **>4x oynatma:** UI kontrolü 4x'te sınırlı; >4x yalnız site-taraflı mümkün — gerçek sitede gözlem önerilir.
- **Tam uzun soak:** 1300-döngü smoke koşuldu; 15–30 dk'lık birleşik bellek soak'ı uzun-dönem kaydı olarak ayrı takip edilebilir.

## 5. Kanıt kalitesi notu

Mock/fixture başarısı hiçbir raporda gerçek sağlayıcı/model kalitesi olarak sunulmadı; R149 gerçek tiny/CPU E2E, R150 canlı Stremio/OpenSubtitles, R114-C gerçek Windows oturumu gerçek uçlarda doğrulandı. Geri kalan bulgular deterministik fixture + birim/sözleşme testi düzeyindedir ve raporlarda sınır olarak işaretlidir.

## 6. Süreç durumu

- Açık PR: yok (R171/#101 merge sonrası master `b3ac5fe`).
- CI: ubuntu+windows yeşil.
- Seri sıradaki rapor numarası: **154**.
