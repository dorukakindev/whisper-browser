# Luna görünümüne geçiş — çalışan ilk katman

Kullanıcının son kapsamı: Bizim browser, Whisper, altyazı, çeviri, ses referansı ve dublaj korunacak. Luna görünümü ve yararlı medya özellikleri bunların üzerine eklenecek. Mevcut ana kopya değiştirilmeden güncel master üzerinden ayrı dal kullanıldı.

## Kaynak kimliği ve yaklaşım

- Resmî GitHub releases API yayın zamanları karşılaştırıldı: en yeni ön sürüm [v1.6.7 — Luna Player 1.6.7CC beta](https://github.com/Nothingman333/Luna-Player/releases/tag/v1.6.7), yayın `2026-10-22T23:01:09Z`. Kullanıcının v1.3.9 bağlantısı kararlı sürümdür; bu geçişin görsel kaynağı olarak eski sürüm alınmadı.
- Resmî v1.6.7 kaynak arşivi indirildi; `app/package.json` sürümü 1.6.7. Kaynak commit `3c4ae8f55ae792e9abe43fb9c3cf67c506b61bd6`.
- Luna sohbetindeki yayımlanmamış son paket `Luna-Beta-Tum-Yenilikler-Nihai-2026-10-23.zip`, SHA256 `c99d3e3a893594d1ed621c491db5f5bde255e3044e64aea273f809d0d89324e8`. Yerel çalışma kaynağıyla 210 `app/src` dosyasında fark yok. Resmî 1.6.7 karşısında 59 değişen, 24 ek dosya var. Kaynaklar salt okunarak incelendi; Luna kurulumu/paketi değiştirilmedi.
- Luna GPLv3, bu depo MIT. Bu teslim Luna kaynak kodunu veya sanat varlıklarını kopyalamaz; Electron için özgün HTML/CSS/JS kullanır. Tauri/Rust/mpv kodunun doğrudan yapıştırılması yapılmadı. Gelecekte kaynak aktarımı yapılırsa lisans/atıf koşulları ayrıca uygulanmalı.

## Tasarım planı ve gözden geçirme

Palet: mevcut `#0a0c0f` zemin, `#101419` yüzey, `#151b22` kontroller, `#27313b` sınırlar, `#edf1f3` metin, `#d5a35c` amber. Açık tema mevcut uygulama token'larını izler. Tipografi: Windows Segoe UI Variable/Segoe UI; başlıklar 30–55px, bölüm başlıkları 21px, kart başlıkları 14px. Yeni font/bağımlılık yok.

Luna'nın gerçek ana sayfa ekranına göre yatay üst gezinme, geniş devam alanı ve afiş rafları seçildi. İlk genel sol menü fikri kullanılmadı; uygulamanın mevcut browser araç çubuğu korunuyor. Boş profilde sahte film/afiş/veri yok. Filmler ve diziler gerçek katalogdan; ses ve web geçmişi mevcut izleme kütüphanesinden geliyor. Aynı büyüklükte kontrol kartları yerine afiş/kapak/araç hiyerarşisi kullanıldı.

## Bu teslimde çalışanlar

- Açılışta medya ana sayfası. Whisper formu Stüdyo'da; Stüdyo'dan Ana sayfa düğmesiyle dönülür. Var olan form düğümleri, ayarlar ve kuyruk sıfırlanmaz.
- Devam edilen medya, gerçek konum/süre çubuğu, katalog açıklaması/afişi; dosya oynatma ve bölüm seçimi mevcut oynatıcı/katalog üzerinden gider. Yerel yolların doğrulaması mevcut main/preload sözleşmesinde kalır.
- Film ve dizi rafları; tam liste, arama, favori/izlenecek filtreleri; 48'lik artan gösterim. Katalog kartı ayrıntıyı açar; kaynak/bölüm/düzenleme/içe aktarma araçları mevcut katalogda çalışır.
- Medya klasörü ekle mevcut tarama/önizleme/onay yolunu açar; otomatik, kontrolsüz veri aktarımı yok.
- Müzik: oynatılmış yerel ses dosyalarını ayıran liste; mevcut oynatıcı ve kuyruk. Web: mevcut browser/YouTube izleme geçmişi. Son oynatılanlar ortak geçmişi gösterir.
- Okuma: mevcut PDF okuyucu ve bağımsız metin/ses stüdyosuna erişim. Yeni EPUB/kapsamlı kitaplık varmış gibi gösterilmez.
- Browser, SRT→ses, metin stüdyosu girişleri. Altyazı, çeviri, referans ses ve üretim motorları değiştirilmedi.
- İngilizce/Türkçe ve açık/koyu tema; kullanıcı medya başlığı/açıklaması çeviriciye sokulmaz. Dar pencere düzeni. Oynatıcı açıkken arkadaki ana sayfa `inert`; dönüşte gezinme yeniden etkinleşir.
- Görünür afişler için en çok üç eşzamanlı istek, 80 görsel önbellek, eski render/istek sonuçlarına karşı kontrol.

## Doğrulamada düzeltilen entegrasyon sorunları

1. Ana sayfa uzunken eski stüdyo `body overflow:hidden` kuralı alt rafları erişilmez yapıyordu. Sadece ana sayfa etkinliğinde kaydırma açıldı.
2. Stüdyo gizliyken Ctrl+Enter iş başlatabiliyor, Escape işi iptal edebiliyordu. Genel stüdyo kısayolları ana sayfada devre dışı; stüdyoda aynı davranış sürüyor. Gerçek Electron testinde düğme tıklaması sayılarak doğrulandı.
3. Az sayıda afişin tüm raf genişliğini doldurması aşırı uzun kart üretiyordu. Afiş ve devam rafları ayrı, sınırlı kolon ölçülerine alındı.
4. Katalog ayrıntısı yeni ana sayfadan açılırken geç kalan yüklemenin kapanmış/yeni oturumun görünümünü değiştirmemesi için mevcut session sayacı kontrol edildi.

Bunlar bu geçiş sırasında bulunan/düzeltilen sorunlardır; önceki master'da dört yeni bağımsız ürün bugı bulunduğu iddia edilmez.

## Kanıtlar

- `node --test tests/media-home-model.test.js tests/media-catalog-service.test.js tests/media-catalog-store.test.js`: geçti. Dört yeni model davranışı ve mevcut katalog yetki/CRUD/önizleme/kimlik/koruma kontrolleri.
- `electron tests/electron-media-home.smoke.js`: Windows gerçek main/preload, ayrı profil, gerçek ffmpeg ile üretilmiş Türkçe dosya yolu, yerel video/2sn resume, browser aç-kapat, dublaj diyaloğu, katalog ayrıntısı/afiş, arama, gizli stüdyo kısayolu ve form değeri koruma geçti. 1440/940/680 mantıksal px; TR/koyu, EN/açık, TR/koyu: yatay sayfa taşması yok. 680px normal minimum pencere sınırının altında ek kontrol.
- `electron tests/electron-media-catalog.smoke.js`: önceki film/dizi/afiş/içe aktarma/bölüm/resume akışı geçti; gerçek resume 2sn. Katalog tema ve dar görünüm de kontrol edildi.
- Değişen JS dosyalarında `node --check`; `git diff --check`: geçti.
- Ekranlar ve sentetik test profilleri ignored `.uiprev/media-home-smoke/` altında; kişisel dosya/profil/afiş veya ses Git'e eklenmedi. Arka plan test penceresinde eski kare dönüşünü önlemek için yalnız smoke sürecinde arka plan renderer kısıtlaması kapatıldı; üretim pencere/GPU ayarı değiştirilmedi. Son ekranlar görsel olarak incelendi.
- İlk sandbox koşusu Node child-process/Electron mojo EPERM ile engellendi; normal Windows test çalıştırma izniyle tekrarlandı. Bu ortam hatası test başarısı olarak sunulmadı.

## Kalan gerçek uyarlama işleri

Bu teslim Luna'nın bütün özelliklerinin taşınması değildir. EPUB/çizgi roman kitaplığı, kapak/okuma ilerlemesi/alıntı eşlemesi, müzik etiketleri ve albüm kitaplığı, radyo/podcast, Luna koleksiyon/Letterboxd/tat profili, gelişmiş asistan önerileri ve yayımlanmamış paketin bunlara ait düzeltmeleri hâlâ ayrı uyarlama gerektirir. Bunlar için işlevsiz buton eklenmedi. Mevcut Whisper browser modülleri ikinci bir Luna browser ile değiştirilmemeli.

PR481'deki önceki ses iyileştirmeleri ayrı dalda korunuyor; bu dal master temelli ve onları kendiliğinden birleştirmez. Kullanıcının ana kopyasına/personal userData'ya veri aktarımı yapılmadı.

`start.bat`/`install.bat` kaynak akışı değerlendirildi ve değiştirilmedi. Bu tur doğrudan `start.bat` normal açılışı, gerçek GPU/Whisper/VoxCPM2 üretimi, canlı YouTube/hesap/DRM, PDF içerik okuma ve bağımsız metin stüdyosu üretimi test edilmedi. UI bağlantı kontrolü model kalite kanıtı değildir. Tam test paketi/CI sonucu beklenmedi; CI kapatılmadı.
