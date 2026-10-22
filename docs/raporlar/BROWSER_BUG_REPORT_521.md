# Rapor 521 — Ses, çeviri anlamı ve süreç sahipliği

Tarih: 2026-10-23. Başlangıç: `8bd73d8e7bb75571e20232ecd5877f025737f800`.
Kod: `b21e67454970d95011d4755baf1536e9f05404f3`.

Kullanıcı 50 bug istedi. **16 ayrı hata kökü düzeltildi; 50 doğrulanmadı.** Aynı doğrulayıcının farklı bozuk dosyaları veya aynı ad kontrolünün farklı adları ayrı bug sayılmadı. Kalan 34 için doğrulanmış iddia yok; kapsamın tamamının hatasız olduğu söylenmiyor.

## Doğrulanan hatalar

| ID | Önem | Önce / sonuç | Düzeltme ve kanıt |
|---|---|---|---|
| 521-01 | Yüksek | Ann → Annette ve Lawson → Larson’la, ad korunmuş sayılıyordu; farklı kişi kabul ediliyordu. | Sözcük sınırı, kanonik yazım; keyfi önek/edit toleransı kaldırıldı. Bilinen Lizbon/Majesteleri karşılıkları kapalı sözlükte. Python name_prefix testi. |
| 521-02 | Orta | `He said, "You must not leave."` doğru Türkçe çeviride `ozel_ad_kaydi` ile reddediliyordu. | Açılış alıntısı içindeki işlev sözcüğü cümle başlangıcı sayılır; Alice gibi gerçek ad korunur. quoted_sentence testi. |
| 521-03 | Yüksek | Sherlock tutarlılığı onarıldığında aynı cue’daki Watson da Sherlock yapılabiliyordu; reportsuz yol daha da genişti. | Eş-geçiş tek başına yeterli değil; aynı sayıda sözcük ve temkinli yazım benzerliği, reportsuz modda da güçlü varyant raporu gerekir. Her iki yolda Watson korunuyor. |
| 521-04 | Orta | 5 Şerlok / 3 Sherlock durumunda kaynak yazımı, çoğunluktan önce tercih ediliyordu. | Önce tekrar sayısı; yalnız eşitlikte kaynak yazımı. majority testi. |
| 521-05 | Orta | `Hello[applause]world` → `Helloworld`; silinen SDH grubu iki kelimeyi yapıştırıyordu. | Silinen aralığın yerine boşluk; hedef işaret geri yükleme de aynı sınırı korur. SDH testi. |
| 521-06 | Yüksek | Negatif kaydırmada 1–4 saniyelik cue, −2 saniyede tamamen düşüyordu. | 0–2 saniyede tam metin ve özgün cue kimliği korunur; bütünüyle geçmiş cue düşer. shift testi. |
| 521-07 | Yüksek | `-5 °C`, `+12`, `−3` okunuşunda işaret simgesi kalıyor veya sayı kısmen genişliyordu. | Bağımsız eksi/artı miktarlar söze çevrilir; tarih, aralık, sürüm ve kod değişmez. signed testi. Konuşma önbelleği v3. |
| 521-08 | Yüksek | Sıfır bit derinliği, desteklenmeyen codec, yarım örnek ve yanlış RIFF sınırı olan WAV geçerli sayılabiliyordu; referans/arka plan yalnız varlık/boyut kontrol ediyordu. | PCM/float/WAVEX biçim tutarlılığı, blok/byte hızı, gerçek veri uzunluğu ve RF64 ds64 kontrolü. Aynı yapısal kontrol referans kütüphanesi/hazırlığı ve arka planda kullanılır. WAV testi. |
| 521-09 | Yüksek | Hem ana hem yedek altyazı tercih dosyası bozuksa sonraki kayıt eski dosyanın üstüne yazabiliyordu. | Yeni/eksik depo ile bozuk/okunamayan depoyu ayır; kurtarılamayan depoda yazma/silme reddedilir. preferences testi. |
| 521-10 | Yüksek | POSIX kill veya senkron Windows taskkill başlatma + fallback başarısız olsa da `true` dönüyordu. | Sinyal gönderilemediyse false; canlı süreç sahipliği ve tekrar deneme korunur. kill testi. |
| 521-11 | Yüksek | Windows taskkill’in asenkron başarısızlığı Stop’a başarı dönüp UI’ı durduruluyor durumunda kilitleyebiliyordu. | Ses işi Stop’u kapanışı en çok 6,5 saniye doğrular; başarısızsa mevcut hata/retry akışı açılır. Gerçek Windows süreç ağacı + yeni doğrulanmış-kapanış testi. |
| 521-12 | Yüksek | Prosody timeout’unda terminate isteği kabul edilince çocuk kapanmadan sahiplik bırakılıyordu; geç exit=0 başarıya dönebiliyordu. | Tek bitiş sınırı child close; timeout bayrağı geç başarıyı engeller. Sahte saat ile eski davranışın null sahipliği tekrarlandı. |
| 521-13 | Orta | Arka plan hazırlığında toplam süre sınırı yoktu; ffmpeg/indirici/ayırıcı takıldığında iş sonsuza dek bekleyebiliyordu. | 60 dakika üst sınır, sahip olunan süreç ağacını sonlandırma isteği; kapanana kadar sahiplik, geç başarı reddi. background timeout testi. Model indirme/çok uzun CPU işi bu sınıra dahildir. |
| 521-14 | Orta | Metin stüdyosunda örnek açık + örnek sayısı 0 kabul edilip `--limit` verilmediğinden tüm kitap üretiliyordu. | Örnek modunda 1–20 zorunlu; tam üretimde limit yok. preview_zero testi. |
| 521-15 | Orta | Basit klonlama kullanmadığı dökümü yine okuyordu; eski/bozuk kodlamalı döküm basit klonlamayı engelliyordu. | Clone modunda döküm hiç çözülmez ve gönderilmez. clone testi. |
| 521-16 | Orta | dub-settings içindeki sayı/dizi/bool yol alanı stüdyoyu açılışta TypeError ile kapatıyordu. | Yalnız boş olmayan, NUL içermeyen dizgi yolu kabul et; diğerleri güvenli varsayılan. saved_paths testi. |

## İncelenen kapsam ve sınırlar

Ses üretimi/planlama/bitirme/kalite/kurtarma/prosody, referans hazırlığı/kütüphanesi/depolama, browser dublaj oturum kontrolü, çeviri ad/anchor kontrolleri, SDH, arşiv, altyazı ayrıştırma/dışa aktarma/word sidecar/senkron, indirme, süreç yaşamı, kuyruk ve kaynak planlama kodları okundu. İncelenen her modül için yeni bug iddia edilmiyor.

Değişiklikler model gerektirmeyen mantık yollarındadır. Gerçek GPU, model ses kalitesi, YouTube/DRM, hesap profili ve ses cihazı bu turda denenmedi. Çeviri kalitesi için canlı sağlayıcı çağrısı yok. Yeni UI kontrolü/stil yok; jsdom kontrolleri görsel Electron kanıtı değildir. `start.bat` çalıştırılmadı, açık kullanıcı uygulaması kapatılmadı.

## Kısa kontroller

- Python yeni regresyon: **11/11**. Başlangıç koduna karşı 8 assertion failure + 2 error; daha büyük kelimede ad pozitif koruması başlangıçta da geçiyor.
- Node yeni regresyon: **6/6**. Başlangıç kodunda 0/6. Yeni kapanış yardımcısı eski kodda yok; gerçek davranış kanıtı eski main’in istek sonucunu doğrudan kullanması + sahte Windows async failure + mevcut gerçek Windows parent/grandchild kontrolüdür.
- Python: dub_finish 10, dub_plan 8, dub_timing 14, dub_quality 4, subtitle_sdh 9, sentence_distribution 48, speech_translation 16, text_studio 1; name_consistency kendi davranış kontrolleri geçti.
- Node: preferences, process-lifecycle (10; gerçek Windows parent/grandchild dahil), dub-background, dub-prosody, dub-service, voice-reference, dub-generator-ui, speech-translation-ui, ui-locale geçti.
- Değişen JS `node --check`, backend ve Python araçları `py_compile`, `git diff --check` geçti.
- Tam npm test ve Electron bridge koşulmadı; CI kapatılmadı, teslim CI beklemeye bağlanmıyor.

Tekrar: `node tests/report521-regressions.test.js`; `backend/venv/Scripts/python.exe tests/test_report521_regressions.py`.
Eski kod: `AUDIT_BASELINE=1` ortam değişkeniyle aynı komutlar, sabit başlangıç commit’ini Git’ten okuyup beklenen kırmızı sonucu üretir. Node’un git subprocess’i ortam izni gerektirebilir. Bu beklenen kırmızı, güncel kodun başarısızlığı değildir.

Bağımlılık/kurulum değişikliği yok. Backend sentence protocol 3→4 (renderer zaten 4 destekliyor), eski hatalı anchor önbelleğini ayırır; kullanıcı altyazıları silinmez. Name tutarlılığı artık keyfi yerelleşmiş adları otomatik tahmin etmeye daha temkinlidir. WAV doğrulaması yapısaldır; sessiz/yanlış telaffuzlu ama geçerli PCM’yi akustik olarak iyi ilan etmez.
