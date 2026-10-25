# Rapor 594 — Devam alanı, Keşfet yoğunluğu ve PDF okuma düzeni

Başlangıç: master `9e32dc72397c57caea602e7d1c4c1af601f0fc0a`. Ürün/test commit'i: `dc56e7cd5e01109fe55523378953e45e7f0985c8`. Çalışma dalı `codex/home-reader594`. Kullanıcının beş ekran görüntüsündeki somut talepler uygulandı; önceki Rapor593 güvenlik/çeviri bulguları bu arayüz işine dahil edilmedi ve düzeltilmiş sayılmaz.

## Tasarım kararı ve mevcut kimlik

frontend-design ve luna-ui-design skill'leri kullanıldı; web-design-guidelines ve görsel inceleme rehberi okundu. Yeni Luna kodu veya bağımlılığı alınmadı: bu çalışma mevcut Whisper media yüzeyindedir. Güncel media-surface token'ları, IBM Plex Sans kontrol yazısı, Sora kitap başlığı ve mevcut serif okuma metni korundu. Dark mode mevcut grafit/mürekkep yüzeyini, tek vurgu mevcut medya temasını kullanır; açık temada mevcut ayarlar geçerlidir. Dekoratif animasyon veya otomatik dönen carousel yok.

PDF hedefi: tek kitap başlığı + bir kompakt okuma çubuğu + kalan alanı kullanan sayfa. Pasaj açıklamaları ve çeviri kontrolleri ihtiyaç anında açılır; asistan ve seslendirme ana eylemleri her zaman erişilebilirdir. Windows pencere düğmeleri için mevcut safe-height korunur. Menülerin içeriği gizlenip işlevsizleştirilmedi; asistanın seçim/sayfa bağlamı ve seslendirme aralığı korunur.

## Tamamlanan davranışlar

1. Ana sayfanın en üstteki devam kartına önceki/sonraki okları ve konum sayacı eklendi. Başlık, resim, açıklama, ilerleme ve aç/devam eylemi aynı seçili öğeye bağlıdır. Son/ilk öğe arasında döner; tek/boş kayıtta oklar gösterilmez. Klavye odağı tıklanan okta kalır. Mevcut refresh/locale redraw sırasında seçili kimlik mümkünse korunur; kayıt silindiyse geçerli öğe seçilir. Geçmişin sırası veya kayıtları değiştirilmez.
2. Keşfet'teki büyük 'Keşfet / Yeni hikâyeler...' tanıtım bloğu kaldırıldı. İçerik doğrudan sekmeler ve filtrelerle başlar; sayfa erişilebilir adı korunur.
3. Açık oturum/duraklatıldı kutusu yalnız ana sayfada çizilir. Keşfet, kitaplar, filmler ve diğer sayfalarda yer kaplamaz; oturumun kendisi kapatılmaz ve dönüş akışı korunur.
4. PDF eski oyuncu başlığıyla iki kez başlık göstermiyor. Kendi tek üst barında ana sayfaya dönüş, kitap adı/durum, asistana sor, sesli oku ve kapat bulunur. Kontroller medya temasıyla aynı ailede; eski amber segment kontrolü ayrı bir tema gibi kalmaz.
5. Sayfa önce/sonra ve toplam sayısı birlikte; zoom ayrı küçük grupta. Pasaj araçları ve çeviri/dışa aktarma popover'ları açıldığında sayfa alanı küçülmez. Biri açılınca diğeri kapanır; dışarı tıklama ve Esc menüyü kapatır. Esc menüyü kapatırken kitabı kapatmaz.
6. PDF flex düzeni görünür ses panelini ve sayfa alanını doğru ayırır; önceki sabit grid satırlarıyla beş çocuğun dört satıra dağılması kaldırıldı. Ses paneli gerektiğinde açılır, dar ekranda kaydırılabilir, konuşulan metni takip ve hazır sesi dinleme devam eder.
7. Kaydedilmiş yan yana görünümle açılan ama henüz hiçbir çevirisi olmayan kitap, boş karşı sütun yerine orijinal görünümle açılır. Kullanıcı yine yan yana görünümü elle seçebilir. Açıkça seçilmiş okuma/çeviri/orijinal modları kaldırılmadı.
8. Okuyucunun yeni ana sayfa düğmesi PDF sesini durdurur. Gizli playerLayer içindeki kitap artık asistanın mevcut kaynağı sayılmaz; oturuma dönülünce sayfa bağlamı geri gelir.

## Görsel kanıt

Tüm kayıtlar ayrı Windows Electron profilinden, sentetik kitap/medya ve kontrollü sağlayıcı fixture'ından alındı; kullanıcının gerçek kütüphanesi, dosyaları, API anahtarları ve uygulama profili kullanılmadı. Hero görselleri test amaçlı basit desenlerdir, gerçek poster kalitesi kanıtı değildir.

- [Önceki okuyucu](r594-evidence/before-reader.png): aynı uygulamanın geniş üst başlık/araç/asistan satırları; çevirisiz yan yana görünüm.
- [Yeni okuma düzeni](r594-evidence/after-reader.png): aynı sentetik kitap, tek üst alan ve kompakt kontroller. Görünümler farklı olduğundan piksel bazında aynı-state diff iddiası yok; eski yapısal sorun ayrı görüntüde açık.
- [Devam alanında oklar](r594-evidence/home-carousel.png): gerçek renderer/main/preload, iki sentetik izleme kaydı; önceki/sonraki eylemleri çalıştırıldı.
- [Keşfet sade görünüm](r594-evidence/discover-compact.png): park edilmiş oturum varken başlık ve oturum kutusu çizilmiyor; katalog fixture'ı.

Okuyucu 1440×1000 mantıksal geniş pencerede, 1024×768 kısa laptop penceresinde ve 820×900 dar pencerede incelendi; EN/TR ve açık/koyu örnekler görüntülendi. Yerel ekran ölçeğiyle fiziksel PNG daha büyük olabilir; ayrı %100/%125/%150 DPI matrisi koşturulmadı. Sayfa alanı, ses paneli kapalıyken geniş örnekte okuyucu yüksekliğinin %70'inden, kısa örnekte pencerenin %65'inden fazlası olarak doğrulandı. Açık ses paneli bu oranlara dahil değildir.

İlk dar ekran kontrolü başlıkta taşma yakaladı: styles.css içindeki eski '.pdf-reader-toolbar > div' responsive flex kuralı yeni actions grubunu büyütüyordu. Sorumlu selectorspecificity düzeltildi, eşik veya test kaldırılmadı. İlk görsel koşuda farklı test pencereleri üst üste geldiği için capturePage eski frame döndürebildi; capture güncel font/frame bekleyip kendi penceresini öne alıyor, tema/locale/view state JSON'ları da yanına yazılıyor. Son PDF koşusu tek başına geçti; önceki başarısız/ara görüntüler kabul kanıtı sayılmadı.

## Hedefli kontroller

- `electron tests/electron-home-entry-actions.smoke.js`: exit0; carousel ileri/geri, odak, değişen başlık, thumbnail, ana sayfada park edilmiş oturum, Keşfet'te kutu/başlığın yokluğu; mevcut açıklama çevirisi/Letterboxd araçları ve PDF seslendirme girişi de korundu. Ücretli sağlayıcı çağrısı yok.
- `electron tests/electron-pdf-reader-experience.smoke.js`: son koşu exit0; gerçek sentetik PDF çizimi, menü/Esc, boyut ölçümü, sayfa gezinme/seçim/asistan bağlamı, 2–3 sayfa seslendirme hazırlığı, eksik çeviri kapısı, kontrollü WAV'la okunan metin takibi, sayfa değişiminde ses konumu ve duraklama, ana sayfada bağlamın kalkması/oturuma dönünce geri gelmesi. Bu test VoxCPM2 üretimi yapmaz.
- `node tests/media-home-model.test.js`:6 alt test; `reader-pdf-lifecycle`:4; `pdf-spoken-map`:4; `media-discovery-service`:6; `ui-locale`:14 assertion; `ui-locale-dynamic`, `ui-locale-userdata`, `i18n-coverage` geçti.
- Değişen renderer JS ve iki Electron testinin `node --check` kontrolleri, `git diff --check` geçti. Belgeler ayrıca docs-index testinden geçer.
- Tam npm test, uzun CI, gerçek GPU/TTS/YouTube/DRM/ücretli API ve install.bat/start.bat temiz kurulum testi koşturulmadı. Başlatma/kurulum, paket ve bağımlılık dosyaları değiştirilmedi. Native test Electron'u ayrı girişten açar; kişisel start.bat uygulaması kapatılmadı. Genel bir derleme adımı olmayan mevcut kaynak Electron akışı kullanıldı; ilgisiz vendor build'leri tekrar üretilmedi.

Son yerel kanıt: `.uiprev/pdf-reader547-1792966802642` ve `.uiprev/home-entry-actions-1792966602651`; başlangıç görüntüsü `.uiprev/pdf-reader547-1792966311178`. Profiller/ham kişisel veriler Git'te değil; bu rapora yalnız sentetik dört PNG eklendi.
