# Yeni 50 ürün hedefi — 27 Ekim 2026

Başlangıç master65505a781a45573d628926e126fc0bf0ca89ff79. Önceki1000denetim ayrı; aynı kök yeni bug diye sayılmaz.50hedef=ürün geliştirme/düzeltme/kabul maddesi;50yeni bug iddiası değildir.

Durum:20/50hedef düzeltme veya kontrollü kabul ile tamamlandı;30planlandı. Gerçekmodel/GPU/site başarısı iddia edilmez.

| ID | Alan | Hedef/kabul | Durum | Kanıt |
|---|---|---|---|---|
| W01 | Canlı Whisper başlangıç sahipliği | Sistem sesi seçim penceresi açıkken Durdur geç başlatmayı iptal eder | DÜZELTİLDİ/DOĞRULANDI | R648: live-asr-start-owner648.test.js + native electron-live-asr-owner648.smoke.js; yerel kontrollü capture/backend, gerçek sistem sesi/model değil. |
| W02 | Canlı Whisper başlangıç sahipliği | Aynı sekmede video değişince eski ses izni yeni videoya bağlanmaz | DÜZELTİLDİ/DOĞRULANDI | R648: live-asr-start-owner648.test.js + native electron-live-asr-owner648.smoke.js; yerel kontrollü capture/backend, gerçek sistem sesi/model değil. |
| W03 | Canlı Whisper başlangıç sahipliği | Sekme değişince geç dönen stream tüm tracklerini bırakır | DÜZELTİLDİ/DOĞRULANDI | R648: live-asr-start-owner648.test.js + native electron-live-asr-owner648.smoke.js; yerel kontrollü capture/backend, gerçek sistem sesi/model değil. |
| W04 | Canlı Whisper başlangıç sahipliği | İki hızlı başlatma yalnız bir onay ve iş üretir | DÜZELTİLDİ/DOĞRULANDI | R648: live-asr-start-owner648.test.js + native electron-live-asr-owner648.smoke.js; yerel kontrollü capture/backend, gerçek sistem sesi/model değil. |
| W05 | Canlı Whisper başlangıç sahipliği | Eski AudioWorklet hatası yeni oturumu durduramaz | DÜZELTİLDİ/DOĞRULANDI | R648: live-asr-start-owner648.test.js + native electron-live-asr-owner648.smoke.js; yerel kontrollü capture/backend, gerçek sistem sesi/model değil. |
| W06 | Canlı Whisper başlangıç sahipliği | Eski chunk gönderim hatası yeni oturumun durumunu ezemez | DÜZELTİLDİ/DOĞRULANDI | R648: live-asr-start-owner648.test.js + native electron-live-asr-owner648.smoke.js; yerel kontrollü capture/backend, gerçek sistem sesi/model değil. |
| W07 | Canlı Whisper başlangıç sahipliği | Worklet yüklenirken iptal kaynakları kapatır | DÜZELTİLDİ/DOĞRULANDI | R648: live-asr-start-owner648.test.js + native electron-live-asr-owner648.smoke.js; yerel kontrollü capture/backend, gerçek sistem sesi/model değil. |
| W08 | Canlı Whisper başlangıç sahipliği | Capture kapanışı mevcut yeni stream tracklerine dokunmaz | DÜZELTİLDİ/DOĞRULANDI | R648: live-asr-start-owner648.test.js + native electron-live-asr-owner648.smoke.js; yerel kontrollü capture/backend, gerçek sistem sesi/model değil. |
| W09 | Canlı Whisper başlangıç sahipliği | Backend active=false bekleyen capture başlangıcını iptal eder | DÜZELTİLDİ/DOĞRULANDI | R648: live-asr-start-owner648.test.js + native electron-live-asr-owner648.smoke.js; yerel kontrollü capture/backend, gerçek sistem sesi/model değil. |
| W10 | Canlı Whisper başlangıç sahipliği | Durdurma sonrası yeniden başlatma ve kesin session kimliği korunur | DÜZELTİLDİ/DOĞRULANDI | R648: live-asr-start-owner648.test.js + native electron-live-asr-owner648.smoke.js; yerel kontrollü capture/backend, gerçek sistem sesi/model değil. |
| W11 | Keşfet ve arama hata deneyimi | Yetkisiz arama hatası EN/TR eylemli mesaj verir | GELİŞTİRİLDİ/DOĞRULANDI | R649: media-error-experience649.test.js + native electron-media-errors649.smoke.js; gerçek servis/renderer, kontrollü HTTP503/429/timeout/network; canlı sağlayıcı değil. |
| W12 | Keşfet ve arama hata deneyimi | 429 sağlayıcı sınırı bekleme yönlendirmesi verir | GELİŞTİRİLDİ/DOĞRULANDI | R649: media-error-experience649.test.js + native electron-media-errors649.smoke.js; gerçek servis/renderer, kontrollü HTTP503/429/timeout/network; canlı sağlayıcı değil. |
| W13 | Keşfet ve arama hata deneyimi | 5xx ayrıntı hatası ham teknik metin yerine anlaşılır durum verir | GELİŞTİRİLDİ/DOĞRULANDI | R649: media-error-experience649.test.js + native electron-media-errors649.smoke.js; gerçek servis/renderer, kontrollü HTTP503/429/timeout/network; canlı sağlayıcı değil. |
| W14 | Keşfet ve arama hata deneyimi | Zaman aşımı ve çevrimdışı hatalar ayrı anlaşılırdır | GELİŞTİRİLDİ/DOĞRULANDI | R649: media-error-experience649.test.js + native electron-media-errors649.smoke.js; gerçek servis/renderer, kontrollü HTTP503/429/timeout/network; canlı sağlayıcı değil. |
| W15 | Keşfet ve arama hata deneyimi | Geçersiz sayfa/filtre bildiriminde düzeltilebilir alan anlatılır | GELİŞTİRİLDİ/DOĞRULANDI | R649: media-error-experience649.test.js + native electron-media-errors649.smoke.js; gerçek servis/renderer, kontrollü HTTP503/429/timeout/network; canlı sağlayıcı değil. |
| W16 | Keşfet ve arama hata deneyimi | Film/dizi aramasında tek kaynak başarısızsa kısmi sonuç açıklanır | GELİŞTİRİLDİ/DOĞRULANDI | R649: media-error-experience649.test.js + native electron-media-errors649.smoke.js; gerçek servis/renderer, kontrollü HTTP503/429/timeout/network; canlı sağlayıcı değil. |
| W17 | Keşfet ve arama hata deneyimi | İki çevrimiçi arama başarısızsa sıfır eşleşme diye sunulmaz | GELİŞTİRİLDİ/DOĞRULANDI | R649: media-error-experience649.test.js + native electron-media-errors649.smoke.js; gerçek servis/renderer, kontrollü HTTP503/429/timeout/network; canlı sağlayıcı değil. |
| W18 | Keşfet ve arama hata deneyimi | Başarısız çevrimiçi arama tekrar denenebilir | DOĞRULANDI | R649: media-error-experience649.test.js + native electron-media-errors649.smoke.js; gerçek servis/renderer, kontrollü HTTP503/429/timeout/network; canlı sağlayıcı değil. |
| W19 | Keşfet ve arama hata deneyimi | Geç eski hata yeni sorgunun durumunu ezemez | DOĞRULANDI | R649: media-error-experience649.test.js + native electron-media-errors649.smoke.js; gerçek servis/renderer, kontrollü HTTP503/429/timeout/network; canlı sağlayıcı değil. |
| W20 | Keşfet ve arama hata deneyimi | Native Windows EN/TR hata durumları ve geri dönüş doğrulanır | DOĞRULANDI | R649: media-error-experience649.test.js + native electron-media-errors649.smoke.js; gerçek servis/renderer, kontrollü HTTP503/429/timeout/network; canlı sağlayıcı değil. |
| W21 | Asistan işlem doğruluğu | Whisper onayı ile gerçek kabul edilen job birbirine bağlı kalır | PLANLANDI | — |
| W22 | Asistan işlem doğruluğu | Altyazı yokken yetenekler doğru kaynakla yine erişilir | PLANLANDI | — |
| W23 | Asistan işlem doğruluğu | İş durdurma kartı hatada sahte başarı vermez | PLANLANDI | — |
| W24 | Asistan işlem doğruluğu | Kaynak değişiminde eski sonuç yeni sohbete uygulanmaz | PLANLANDI | — |
| W25 | Asistan işlem doğruluğu | Uygulama yardımında olmayan seçenek önerilmez | PLANLANDI | — |
| W26 | Asistan işlem doğruluğu | Sayfa çeviri başarısızlığı makbuzda görünür | PLANLANDI | — |
| W27 | Asistan işlem doğruluğu | Asistan uzun sonuç sayfalamasında toplam ve devam doğru kalır | PLANLANDI | — |
| W28 | Asistan işlem doğruluğu | Kütüphane açılışında gerçek başlık kaynağı doğrulanır | PLANLANDI | — |
| W29 | Asistan işlem doğruluğu | Kitap okuma ve seçili pasaj bağlamı karışmaz | PLANLANDI | — |
| W30 | Asistan işlem doğruluğu | İşlem sonrası öneri yalnız gerçek tamamlanan işe bağlıdır | PLANLANDI | — |
| W31 | Kitap ve PDF okuma | Sayfa aralığı ses üretimine doğru kitap kimliğiyle taşınır | PLANLANDI | — |
| W32 | Kitap ve PDF okuma | Bölüm değişirken eski ses vurgusu temizlenir | PLANLANDI | — |
| W33 | Kitap ve PDF okuma | Yer imi eski kitap yerine yalnız güncel kaynağa yazılır | PLANLANDI | — |
| W34 | Kitap ve PDF okuma | Tek grup düzeltmede diğer tamamlanmış ses korunur | PLANLANDI | — |
| W35 | Kitap ve PDF okuma | Sayfa çevirisi iptal edilince okuma metni korunur | PLANLANDI | — |
| W36 | Kitap ve PDF okuma | Boş taranmış sayfada asistan metin varmış gibi davranmaz | PLANLANDI | — |
| W37 | Kitap ve PDF okuma | Hazırlık önizlemesi kullanılan nihai metni açık gösterir | PLANLANDI | — |
| W38 | Kitap ve PDF okuma | İnceleme onayı değiştirilmiş sese taşınmaz | PLANLANDI | — |
| W39 | Kitap ve PDF okuma | Bölüm yenileme hata sonrası doğru düğmeyle tekrar denenir | PLANLANDI | — |
| W40 | Kitap ve PDF okuma | Dar ekran kitap araçları ve odak erişimi doğrulanır | PLANLANDI | — |
| W41 | Ses ve çeviri bütünlüğü | Değişmiş referansta eski kaliteli önbellek yeniden kullanılmaz | PLANLANDI | — |
| W42 | Ses ve çeviri bütünlüğü | Süre aşımında bitmiş son parçalar korunur | PLANLANDI | — |
| W43 | Ses ve çeviri bütünlüğü | Kısmi çeviri ses için tam hazır diye sunulmaz | PLANLANDI | — |
| W44 | Ses ve çeviri bütünlüğü | Çeviri dil/model değişimi açık iş ayarını değiştirmez | PLANLANDI | — |
| W45 | Ses ve çeviri bütünlüğü | Eksik sayı/olumsuzluk kalite işareti görünür kalır | PLANLANDI | — |
| W46 | Ses ve çeviri bütünlüğü | Dublaj range dışındaki özgün ses korunur | PLANLANDI | — |
| W47 | Ses ve çeviri bütünlüğü | Arka plan ayırma seçili zaman aralığıyla sınırlanır | PLANLANDI | — |
| W48 | Ses ve çeviri bütünlüğü | Motor durdurma başarısızsa yeniden başlatma sahipliği korunur | PLANLANDI | — |
| W49 | Ses ve çeviri bütünlüğü | Kalite listesi dinle ve düzelt seçilen gerçek gruba gider | PLANLANDI | — |
| W50 | Ses ve çeviri bütünlüğü | Ses/çeviri job süreleri ve terminal durumu gerçek kanıta bağlıdır | PLANLANDI | — |
