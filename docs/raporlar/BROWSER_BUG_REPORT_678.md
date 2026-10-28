# Rapor 678 — Dolu içerikle müzik, asistan, browser ve okuyucu kabulü

Başlangıç master `0c1901fa12fd11b8c0fbed4a44ec34edc4d8c28e`; ürün bitiş `0bfe3ae29008c9498ba4d7d7f90af1d42b16ec98`; dal `codex/populated-design678`.

R677'nin açık bıraktığı dolu içerik incelemesine devam edildi. Amaç dört yüzeyin gerçek kontrol edilebilir durumlarını iyileştirmek; bütün uygulamanın bütün kombinasyonlarını kusursuz ilan etmek değil. Önceki kapsam kaydı esas alındı; eski PASS testler yeni bug diye sayılmadı.

## Müzik analizi

- Kaynak kartı, başlık ve işlem satırları sıkılaştırıldı; dar görünümde ölçümler etiket/değer satırlarına ve grafikler tek sütuna geçer. Dinamik/frekans grafikleri aynı yüzey hiyerarşisini kullanır.
- Ölçümler/etiketler arasında geçiş artık sonuç seçim satırını görünür yere getirir; sabit sekme sonuç kontrollerini örtmez. Önce yalnız içerik değişiyor, kullanıcı yukarıda kalabiliyordu.
- Tiz çizgisi ve açıklaması açık temada sabit çok açık krem renginden tema duyarlı mor veri rengine taşındı. Bu veri serisi rengidir; UI vurgu rengi amber kalır. Açık temanın ana amberi kontrastlı koyu değerini kullanır.
- Tema değişiminde canvas yeniden çizilir; dinleyici panel kapatılırken kaldırılır. Eskiden yalnız audio/resize olayında yeniden çiziliyordu. Grafik ve HTML farklı tema renklerinde kalabilirdi.
- Tanı metnindeki “etiket tanıma yok” ifadesi, mevcut deneysel etiket benzerliği özelliğiyle uyumlu hale getirildi. Frekansların enstrüman tanımadığı ve etiketlerin kesin sınıflandırma olmadığı açık.
- R674 kalıcı ölçüm/etiket/sıralama sistemi korunur. Yeni cache formatı veya model indirmesi yok.

## Asistan

- Uzun araç kaynak metni kart içinde kayar; hata/işlem sonucu ayrı sınırla okunur, karar düğmeleri yüzlerce satırın altına gömülmez. Kısa pencere önerileri yatay taşmak yerine sınırlı dikey alanda sarılır. Composer ve en az 80 px konuşma alanı erişilebilir kalır.
- Aynı konuşmanın güncellemesi okuyucunun kaydırma konumunu korur. Başka konuşmaya geçiş artık önceki konuşmanın scrollTop değerini taşımak yerine son mesajı açar. Mevcut araç odağı koruması sürer.
- Palette gönderilmeyen bağımsız overlay de canonical amber ve kontrastlı açık tema değerini kullanır. Gerçek host palette göndermeye devam eder; model/progress sahte sinyalle ilerletilmez.
- 24 mesaj ve uzun başarısız araç kartıyla native snapshot kabulü yapıldı. Bu, canlı DeepSeek çeviri/komut kalitesi testi değildir.

## Kitap/PDF okuyucu

Yeni **Okuma ayarları** menüsü: 18/21/24/28 px yazı, 680/850/1000 px satır alanı, 1.65/1.85/2.1 satır aralığı. Yalnız çıkarılmış Okuma görünümüne uygulanır. Orijinal PDF koordinatları, çeviri metni ve ses dosyası değiştirilmez. Tarayıcı profili localStorage içinde `pdf-reading-preferences-v1` ile saklanır; beklenmeyen JSON veya seçenek değerleri varsayılanlara döner. Gizli bilgi yok; settings.json şeması değişmez. EN/TR etiketleri ve reduced-motion uyumlu kısa menü girişi var. Menü mevcut tek-açık-menu/Escape/dışarı tıklama düzenine katılır ve okuyucu açılınca kapanır.

Gerçek üç sayfalık fixture PDF'de metin/sayfa bağlamı, seçili pasaj, sayfa aralığından ses hazırlığı, kontrollü hazır sesle okunan metin vurgusu, sayfa değişimi, ana sayfaya dönünce eski kitap bağlamının kalkması ve TXT okuyucu akışı geçti. Gerçek VoxCPM2 üretimi çalıştırılmadı.

## Browser / video: ürün bugı ile test hatasını ayırma

Browser için yeni ürün değişikliği gerektiren bir native bounds hatası teyit edilmedi. Önceki dar ekran görüntüsünde yalnız host div'ini daraltmak native alanı farklı ölçekte bırakıyordu; test gerçek pencereyi 900 CSS px yapacak şekilde düzeltildi. Açılır menü açıkken native view'ın ekran dışına gizlenmesi kasıtlıdır; bu durum yanlışlıkla hata sayılmadı. Menü kapandığında sınırlar x=11/y=94/w=878/h=855 olarak gerçek görünüm alanına döndü.

İlk video fixture MPEG4/AAC idi ve yalnız ses çubuğu görünüyordu; readyState>=2 bunu video başarıymış gibi geçirebiliyordu. Fixture WebM VP9/Opus oldu, videoWidth>0 ve currentTime ilerlemesi eklendi. Native sayfa ayrıca yakalandı ve gerçek lacivert video görüntüsü görüldü. Tam ekran ilk denemede izin beklediği için zaman aşımına girdi; test uygulamanın **Bu kez izin ver** düğmesini kullanacak hale getirildi. Son tam ekran giriş/çıkış ve slot dönüşü geçti. Bu değişiklikler ürünün güvenlik/izin kurallarını gevşetmez.

## Kanıtlar

[Sonuç özeti](DESIGN678_2026-10-28/results.json). Tek tek incelenen kontrollü görüntüler:

- [Analiz açık tema](DESIGN678_2026-10-28/analysis-light.png), [geniş analiz](DESIGN678_2026-10-28/analysis-dark.png).
- [Asistan uzun kart](DESIGN678_2026-10-28/assistant-long-dark.png), [dar çalışma göstergesi ve composer](DESIGN678_2026-10-28/assistant-narrow.png).
- [Okuma ayarları](DESIGN678_2026-10-28/reading-preferences.png), [dar okuyucu ve ses aralığı](DESIGN678_2026-10-28/reading-narrow.png).
- [Native video](DESIGN678_2026-10-28/browser-video.png), [native tam ekran](DESIGN678_2026-10-28/browser-fullscreen.png).

İzole Windows profili, sentetik ses/video/PDF ve kontrollü mesajlar; kişisel profil, gerçek anahtar veya ücretli servis kullanılmadı.

## Testler, kaynaklar ve sınırlar

- `node --test --test-isolation=none tests/design-system.test.js tests/ui-motion.test.js tests/music-results674.test.js tests/assistant-flow-state.test.js`: 7 PASS. Aynı ses için yeni servis açıldığında ölçüm/etiket/sıralamanın analiz çağırmadan yüklenmesi ve ses değişince cache miss dahil. Bunlar önceki mekanizmaların regresyonudur, yeni bug sayılmaz.
- Native `tests/electron-music660.smoke.js`: sentetik NumPy/ffmpeg çözümleme, 8–16 sn seçimi, grafik seek, cache, iptal, kapat/reopen ve sonuçlara atlama PASS. İlk kırmızı kaynak başlığında eski dosya adını bekliyordu; kütüphane başlığının Calibration olduğu doğrulanıp beklenti düzeltildi. Gevşek substring yerine doğru alan beklendi.
- Native `tests/electron-assistant678.smoke.js`: uzun kart, scroll koruma, konuşma değişimi, dar composer PASS. İlk odak assert'i devre dışı sonuç düğmesini odaklamaya çalışıyordu; mevcut tabIndex=-1 araç kartına odak doğrulandı.
- Native `tests/electron-pdf-reader-experience.smoke.js`: önceki bağlam/ses vurgusu ve yeni tipografi tercihi/persist kontrolleri PASS.
- Native `tests/electron-browser-chrome-design.smoke.js`: menü/sağ panel, gerçek dar viewport, videoWidth/oynatma, izinli tam ekran ve geri dönüş PASS. İlk yanlış beklentiler ve fixture/izin sorunu yukarıda açıklandı. GUI shell exit 0 tek başına başarı sayılmadı; sonuç dosyaları incelendi.
- JS syntax ve diff kontrolü geçti. Tam npm test/uzun CI beklenmedi. Mevcut 11 before-quit listener uyarısı native ana süreç koşularında sürüyor; üst sınırı artırarak gizlenmedi.
- Kaynak: [Luna Player](https://github.com/Nothingman333/Luna-Player) ana sayfası yeniden incelendi; yerel önceki 859b0925 snapshot'ındaki AssistantTools.css/BookMusic.css kompakt araç ve sakin okuyucu hiyerarşisi açısından okundu. GPL-3.0 kaynak kodu kopyalanmadı; kendi CSS/DOM sistemimizde uygulandı. Yeni Luna beta çalıştırıldığı veya bütün özellikleri alındığı iddia edilmez. frontend-design/make-interfaces-feel-better rehberleri kullanıldı, yeni runtime bağımlılığı yok.
- install.bat/start.bat ve backend/CUDA değişmedi; gerçek temiz start.bat başlangıcı, kişisel YouTube hesabı/Cloudflare, DRM, GPU, gerçek müzik semantik kalite karşılaştırması ve ses üretim kalitesi bu tur doğrulanmadı.

Bu paket dört alanın belirtilen durumlarını tamamlar. Bütün siteler, bütün kitaplar, bütün DPI ve her araç kombinasyonu için kusursuzluk iddiası yoktur. Kullanıcının kendi uygulaması kapatılmaz; yeni kod yeniden açılışta gelir.
