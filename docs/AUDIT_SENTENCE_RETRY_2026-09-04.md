# Cümle çevirisi ek raporu — 83–85

Kaynak: `e80242b8-8a4a-4b41-8c6a-4b7a8964087e/pasted-text.txt`.
Başlangıç commit'i: `cb363ee`. Tarih: 2026-09-04.

| Bulgu | Doğrulama | Yapılan |
| --- | --- | --- |
| 83 — JSON dizisinin altyazıya düşmesi | `decodeSentenceTranslation('["a","b"]', 2)` JSON olarak ayrıştırılmıyordu. | JSON dizileri, iç içe diziler ve dizi görünümündeki bozuk yanıtlar reddediliyor. `[MÜZİK]` gibi SDH metinleri korunuyor. Dizi, sözleşmedeki `{text,parts}` nesnesi yerine otomatik kabul edilmiyor. |
| 84 — Türkçe kısaltmalar | JS `sentenceEnded` yalnız kısa İngilizce listeyi kullanıyordu. Ek olarak Python `sentence_translation.sentence_ended` de aynı eksikliğe sahipti; `transcribe.text_ends_sentence` ise daha kapsamlıydı. | Mevcut kapsamlı liste `backend/subtitle-abbreviations.json` içine taşındı; üç tüketici aynı veriyi kullanıyor. Baş harf dizileri, büyük tek baş harfler ve kapanış tırnak/parantezleri korunuyor. |
| 85 — Retry-After eksikliği | Python `call_api_with_retry` başlık okumuyor, yalnız 0,75/1,5 saniye bekliyordu. | Saniye/HTTP-tarih başlıkları okunuyor; bozuk/NaN/Inf başlıklar yok sayılıyor. Başlıksız 429 için 5/10 saniye, normal geçici hatalar için mevcut tabandan başlayıp 30 saniyeye kadar üstel gecikme. Sunucunun daha uzun süresi kısaltılmıyor. Tek çağrının toplam bekleme bütçesi 120 saniye; aşılacaksa erken yeniden istek yerine hata üst katmana aktarılıyor. |

Deneme sayısı varsayılan üç olarak korundu: SDK ve dış iş kuyruğunun denemeleri üzerine ayrıca sayı büyütülmedi. Bu değişiklik kota sorunlarının kesin çözüleceği veya tüm worker'ların ortak kota koordinasyonu yaptığı anlamına gelmez.

## Öneriler

- **A:** Kısaltma verisi tek kaynak oldu. Ağ çağrıları iki çalışma ortamında ayrı kalıyor; tüm Python/JS retry altyapısı tekleştirildi iddiası yok.
- **B:** Düz metin, geçerli nesne, boş/bozuk yanıt, dizi, fenced dizi ve SDH sözleşme testleri var.
- **C:** Ortak `sentence-boundaries.json` örnekleri JS ve iki Python sınır fonksiyonunda çalışıyor. `vb.` içeren iki gerçek cue'nun tek cümle grubunda kalması iki dilde test ediliyor.
- Rapordaki 7/15 kapanmış maddeleri için mevcut retry/statü ve sözlük testleri yeniden geçti. Son öncelik tablosunda yalnız numarası anılan eski 64–82 maddeleri, ayrıntıları bu ekte bulunmadığından bu üç yeni bulgunun tamamlanma sayısına dahil edilmedi.

## Doğrulama

- `npm test`: 50 Node test dosyası + 137 Python testi başarılı.
- `node --check src/subtitle-sentence-layout.js`, Python `py_compile`, `git diff --check` başarılı.
- Retry testlerinde saat/bekleme ve hata yanıtları taklit edildi; gerçek API isteği veya gerçek bekleme yapılmadı. Elektron/GPU/DRM oturumu açılmadı. Model ve API anahtarı ayarları değiştirilmedi.
