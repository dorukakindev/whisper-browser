# BROWSER_BUG_REPORT_71 — Çalışma Zamanı Log Analizi

**Tarih:** 2026-09-18 · **Kaynak:** kullanıcı canlı oturum logu (20:25–21:03) · **Durum:** doğrulandı ve düzeltildi

## Bulgu özeti

| # | Bulgu | Sınıf | Sonuç |
|---|-------|-------|-------|
| R71-1 | `İşlenmeyen işlem hatası: maxLength (-1)` — her girişsiz `openAppDialog` çağrısında DOM istisnası (logda 6 kez) | **GERÇEK** | Düzeltildi — `removeAttribute('maxlength')` |
| R71-2 | `classify_translation_error` request-id rakamlarını HTTP kodu sanıyor: `...92540358...` → `authentication`, `...429832...` → `rate_limit` | **GERÇEK — kritik** | Düzeltildi — yapısal `api_error_status` önce + kelime-sınırlı regex; `authentication` FATAL olduğu için yanlış sınıf çeviriyi erken öldürebilirdi |
| R71-3 | `model_not_found` (`No available channel`) fatal değildi → 33 parça × ~5 sn sürüyle boşa istek (~52 sn, 648 blok hiçbiri çevrilemedi) | **GERÇEK** | Düzeltildi — `model_unavailable` sınıfı + `FATAL_TRANSLATION_ERRORS` üyeliği → ilk parça probunda kalanlar atlanır + kullanıcıya "model adını kontrol edin" mesajı |
| R71-4 | Canlı web çevirisi istek fırtınası: ~800 cümle × ≤3 deneme, `Retry-After` yok, devre-kesici yok → 502 seli (~2,5 dk) ardından 120 istek/dk sınırına takılıp 429 seli | **GERÇEK — kritik** | Düzeltildi — (a) `retry-after` başlığı hataya `retryAfterMs` olarak eklendi ve scheduler gecikmesi `max(backoff, retryAfterMs)` alır; (b) ardışık 5xx/429/transport hatası ≥ eşikte (varsayılan 8) `tripProviderFailure` → kalan cümleler tek net hata ile durur; (c) ağ kesintisi (`fetch` düşmesi) `transportError` bayrağıyla sayılır |
| R71-5 | Aynı `Canlı web çevirisi:` hatası 200+ satır log seli basıyor (cümle başına ayrı satır) | **GERÇEK — gözlemlenebilirlik** | Düzeltildi — `logLiveTranslationError` özdeş ardışık hataları sayar, mesaj değişince `(×N tekrar)` özet satırı düşer |
| R71-6 | `Çeviri parçaları tam cümleyle eşleşmiyor` uyarıları 8 dk boyunca ~20–30 sn'de bir tekrarlanıyor | GERÇEK — sağlayıcı uyumsuzluğu; bekçi doğru çalışıyor | R71-5 dedup'ıyla log baskısı giderildi; cümle düşürme kararı bilinçli (yarım cümle ekrana yazılmaz) |
| R71-7 | `Sayfa hazır` + `Widevine teknik erişimi doğrulandı` her navigasyonda çift satır (11 dk'da ~11 kez) | KISMEN GERÇEK | Widevine kararı oturum-içi değişmez → yalnız ilk karar ve değişimler loglanır (`player.browserDrmVerdict`); "Sayfa hazır" navigasyon başına anlamlı — korundu |
| R71-8 | `Tarayıcı GPU doğrulanmadı · Uzak masaüstü veya yazılım görüntü bağdaştırıcısı` | DOĞRU ÇALIŞIYOR | Bilgilendirme uyarısı — RDP/yazılım bağdaştırıcısı tespiti kasıtlı |
| R71-9 | `Web altyazısı bulundu: t0` — isimsiz parça genel `t0` etiketiyle gösteriliyor | KOZMETİK | Düşük öncelik — parça dil/adı varsa ona düşülebilir; sonraki tur |
| R71-10 | `gpt-5.4` model adı sağlayıcıda yok → kullanıcı yapılandırması | KULLANICI AYARI | R71-3 ile artık ilk hatada durup net mesaj veriyor; model adının ayarlarda düzeltilmesi gerekir |

## Kök nedenler

- **R71-1:** `input.maxLength = -1` IDL özelliği negatif kabul etmez → her girişsiz onay diyaloğu `Failed to set the 'maxLength' property` fırlatıyordu (`renderer.js:1014`).
- **R71-2:** Sınıflandırıcı hata metninde düz substring arıyordu; sağlayıcı `request id` alanındaki rastgele rakam dizileri `401/403/429` içerebiliyor.
- **R71-3:** `classify_translation_error`'da model-yok sınıfı yoktu → `server_error` → FATAL kümede değil → ilk-parça probu abort'u tetiklemiyordu.
- **R71-4:** Scheduler her cümleyi bağımsız ≤3 denemeyle gönderiyordu; sağlayıcı 90 sn boyunca 502 verirken kuyruk durmuyor, kota da tükeniyordu.

## Düzeltmeler

- `src/renderer/renderer.js` — `openAppDialog` maxLength fix; `logLiveTranslationError` dedup; `browserDrmVerdict` ile Widevine dedup.
- `backend/transcribe.py` — `classify_translation_error`: yapısal status önce, `model_unavailable` sınıfı, `\b` sınırlı kod regex'leri; `FATAL_TRANSLATION_ERRORS` += `model_unavailable`; `call_api_with` rota-öncesi kontrolü yapısal status'a çevrildi; kullanıcı mesaj haritasına `model_unavailable` eklendi.
- `src/main.js` — çeviri hatasına `retryAfterMs` (120 sn üst sınır); fetch düzeyi hatalara `transportError` bayrağı.
- `src/browser-translation-scheduler.js` — `providerFailureThreshold` (vars. 8) + `consecutiveProviderFailures` sayacı; eşikte `tripProviderFailure` ("arka arkaya N isteği reddetti… kalan cümleler durduruldu"); retry gecikmesi `retryAfterMs`'yi de hesaba katar; başarı sayacı sıfırlar (kesikli hatalar tetiklemez).
- `backend/test_transcribe.py` — request-id rakam çakışması + `model_unavailable` FATAL + yapısal status testleri.
- `tests/browser-translation-reliability.test.js` — devre-kesici (eşikte kesim, tüm cümleler işaretli), kesikli hata tetiklememe, `Retry-After` beklemesi regresyonları.

## Doğrulama

- `backend/test_transcribe.py`: **192/192** (yeni sınıflandırıcı testleri dahil)
- `tests/browser-translation-reliability.test.js`: devre-kesici + Retry-After geçti
- `browser-translation-integrity` 10/10 · `translation-endpoints` 20/20
- **`npm test` tam paket: EXIT:0 — "Tüm testler geçti"**
- `node --check` main.js / scheduler / renderer.js · `py_compile` transcribe.py — temiz

## Sınırlar / kalan iş

- Dedup özet satırı yalnız mesaj **değiştiğinde** yazılır; aynı hatanın son tekrar sayısı yeni bir hata gelmeden görünmez (sağlık paneli toplam başarısız sayısını zaten gösteriyor).
- R71-9 (parça etiketi `t0`) ve "Sayfa hazır" navigasyon satırı bilinçli olarak korundu.
- Devre-kesici eşiği `providerFailureThreshold` ile ayarlanabilir; paylaşımlı (dedup'lı) isteklerde cümle-catch sayısı istek sayısından büyük olabilir — bu erken kesimi daha da güvenli kılar.
- Canlı sağlayıcı davranışı (gerçek 429/Retry-After) mock düzeyinde doğrulandı.
