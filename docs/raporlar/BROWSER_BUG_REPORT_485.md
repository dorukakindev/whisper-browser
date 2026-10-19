# Rapor485 — Süreye uygun dublaj, parça kurtarma ve kalite araçları

2026-10-19, Windows. Kullanıcı yedi ses geliştirmesinin tamamını uygulamayı istedi.
Başlangıç master: `957bbfe91edee709accb24624e9e945e7a7a2969`.
Ürün kodu: `4f6761821dbdd823e2d9dd67e10adf031c89a076`.
PR456 hata tanı onarımı da `22415053` cherry-pick'i ile bu dala taşındı.

## Uygulananlar ve kanıt

| İstek | Uygulama | Doğrulama |
|---|---|---|
| Süre hedefli çeviri | Speech çeviri istemi mevcut sentence_groups.duration verisini kullanır. Bilgi/sayı/olumsuzluk korunur; cache/TM protokolü speech-v2-duration olur. | Speech translation5 test; zaman ve ID sözleşmesi korunuyor. |
| Taşan konuşmada ikinci deneme | Gerçek üretilen süre pencereyi %15 aşınca tek AI düzenleme + sınırlı ses denemesi. Yalnız daha kısa ve akustik olarak daha kötü olmayan aday alınır. Başarısızlıkta özgün ses/metin korunur. | Üretim orkestrasyonu kontrollü motor ve rewrite fixture'ı; gerçek sağlayıcı çağrılmadı. |
| Yumuşak video hızı | Yeni sync haritası smooth işaretiyle sürekli türevli zaman eşlemesi taşır. Parça sınırında hız 1'e döner; integral tam ses süresini korur. | Monotonluk, türev, sınır, eski harita ve browser-dub-audio testleri. |
| Söylenen metni denetleme | Hızlı: akustik. Dengeli: şüpheli/uzun parçalar ASR. Ayrıntılı: tüm parçalar ASR. Ayrı CPU süreç, kayıtlı small modeli; eksik modelde açık uyarı. Metin uyuşmazlığında bir farklı seed denemesi. | Gerçek GPU örneğinde iki parçanın ASR karşılaştırması geçti. Kontrollü başarısızlık/koruma testleri. |
| Referans danışmanı | RMS, sessizlik ve kırpılma kontrolü; ses düzeyine göre yoğun bir kayıt aralığı önerisi. Otomatik kesme/temizleme yok. | Sentetik ses regresyonu, referans UI testi, gerçek kayıt analizi. |
| Parça kurtarma | Metin/referans/model/seed bazlı bağımsız cache, bozuk WAV kontrolü, eksik parçaya devam ve seçili parçayı zorla yeniden üretme. OOM'da8→4→2→1 ile yeni motor açılışı. | Kontrollü kısmi hata/resume/OOM, Node IPC/UI testleri. Gerçek ikinci koşu0 üretim/2 cache hit, WAV birebir aynı. |
| Temsil edici örnek | Kısa/uzun/yoğun grupların birleşimi, kopya seçim ayıklama ve boşlukları sıkıştırma. Kaynak aralıkları quality sidecar'da. Örnek videoya bağlanmaz ve arka plan ayrıştırması çalıştırmaz. | Uzak zamanlı gruplar testi, gerçek8,5sn WAV ve görsel doğrulama. |

## Doğrulanan sorunlar

- Eski cache tüm grup metinlerini tek hash'e koyuyordu: bir cümle düzenlenince diğer sesler de cache miss oluyordu. V4 parça kimliği bunu ayırır.
- Bir grup üretim hatası asyncio.gather üzerinden bütün işi düşürüyordu. Artık sağlam parçalar korunur; başarısız grubun sessizliği açık `failed` sonucu taşır. Böyle bir çıktı otomatik bağlanmaz.
- Yeni parça sonuçlarını her olayda tüm DOM listesini tekrar kurmadan güncellemek gerekir; ilerleme artımlı, son liste sıralı kurulur.
- Ana çıktı `.tmp.wav` dosyası iptal temizliği ailesine eklendi.
- Kaynak SRT/aralık değişince eski yeniden-üretim isteği geçersizleşir.

## Yerel Windows kanıtı

Hedefli Node: dub-service, dub-generator-ui, dub-text-guard, dub-sync-map,
browser-dub-audio, player-dub-ui, voice-reference-ui, settings-ui-persist-roundtrip,
package-integrity, ui-locale/dedupe geçti. Python: dub_quality4, generation_quality3,
dub_timing12, report483_edges3, speech_translation5 geçti. JS syntax/py_compile/diff geçti.
Electron bridge ayrı izinli test sürecinde geçti; ilk kısıtlı süreç denemesi Windows
Mojo platform_channel erişim engeli verdi, ürün hatası sayılmadı.

Gerçek RTX4070 SUPER /12GB: 15 adım,8 paralellik, kayıtlı referans, detailed ASR.
Model12,859sn + referans2,031sn + üretim/denetim24,688sn;2 grup,3 deneme/1 akustik
yeniden deneme. İki ASR benzerlik skoru1,000; kesilen grup0. WAV48000Hz/8,5sn.
Tekrar koşusu exit0, attempts0, cached_groups2, generated_groups0; WAV birebir aynı.
Özel kayıtlar/sesler yalnız ignore edilen tmp'de, Git'e alınmadı.

Görsel: ayrı geçici headless Chrome profili, yerel dosya, TR/EN × koyu/açık ×
1400/720px × ayarlar/sonuçlar =16 yüzey,0 kontrast hatası. Ekranlar yerelde tmp/dub485/visual.
İlk kısıtlı profil denemesinde debug bağlantısı açılamadı; izinli test geçti.

## Sınırlar

- ASR tam anlam/kalite garantisi değildir; sayıların yazıyla söylenmesi ve özel adlar yanlış pozitif oluşturabilir. Şüpheli parçalar dinlenmelidir.
- Referans danışmanı müzik veya konuşmacı sayısını kesin sınıflandırmaz; bunlar dinleme gerektirir. Önerilen aralık ses düzeyine dayanır.
- AI kısaltmanın anlam eşdeğerliği kesin kanıtlanmaz. Sayı çokluğu, açık olumsuzluk ve apostroflu özel ad için koruyucu kapılar var; özgün ve kullanılan metin manifestte tutulur.
- CPU ASR ek süre alır; model zaten cache'te olmalı, bu özellik kendiliğinden yeni model indirmez. GPU'da TTS ile aynı VRAM'i paylaşmaz.
- V4 cache önceki v3 cache'i silmez ancak eski namespace'i doğrudan yeniden kullanmaz. İlk v4 koşusu yeniden üretim gerektirebilir.
- Önizleme kısa/uzun/yoğun kategorileri aynı gruba denk gelirse üçten az parça içerebilir. En az bir tam grup üretilir.
- Tüm parçalar hata verirse de açıkça işaretli sessiz WAV üretilebilir; bu başarıyla seslendirilmiş konuşma diye sunulmaz.
- Gerçek YouTube, uzun video/dinleme değerlendirmesi, ücretli sağlayıcı, DRM ve start.bat üretim yeniden başlatması yapılmadı. Yerelde tam npm test tekrarı yapılmadı; PR Windows CI beklenir.
- Yeni paket bağımlılığı/kurulum değişikliği yok. V4 cache ve .quality.json çıktı sözleşmesi eklendi. Yerel master ve kullanıcının açık uygulaması değiştirilmedi; bu dal incelemeye teslim edilir.
