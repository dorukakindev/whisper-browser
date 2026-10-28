# Rapor 677 — Görsel kapsam ve ortak arayüz düzeltmeleri

Başlangıç master `5768e7cac55cb218b09eb957c7e28d1d17d72983`; ürün bitiş `ca5ffd0627b2da365ad2341fd6dd40909a90c083`; dal `codex/design-audit677`.

Kullanıcının itirazı haklı: bir bileşenin veya smoke testinin geçmesi uygulamanın bütün tasarımının tamamlandığını göstermez. Bu rapor tüm program için bitiş onayı değildir. Önceki DeepSeek kapsam kaydı incelendi; tarihsel PASS sayıları görsel kalite kanıtı olarak kullanılmadı. Önceki R675 Luna karşılaştırması (859b0925, v2.7.5 beta) tarihsel referanstır; bu tur yeni Luna sürümü çalıştırılmadı, kaynak kopyalanmadı. frontend-design ve arayüz cilası rehberleriyle mevcut yerel HTML/CSS kullanıldı; paket eklenmedi.

## Uygulananlar

1. Medya ana sayfası ve yüzeyleri karanlık temada eski turuncuyu yerel olarak dayatıyor, browser/stüdyo amber kullanıyordu. Media-home.css kanonik amber paletine getirildi; açık tema kendi kontrast paletini korur.
2. Film/dizi ve arama sonucu boşken yalnız küçük bir metin vardı. Ortak başlık, açıklama ve çalışır sonraki adım düğmeleri eklendi; filtre temizleme gerçek sorguyu/süzgeci sıfırlar. Boş ana sayfada medya/browser açma yolları sunulur; sahte içerik üretilmez.
3. Müzik, kitap ve radyo boş durumları aynı hiyerarşiye taşındı. Kitap ekleme, Spotify listesi ve yerel ses eylemleri mevcut iş akışlarını kullanır.
4. Etkin gezinme sekmesi alt vurgu ile ayrılır. Hover/renk geçişleri 150 ms ve belirli özelliklerle sınırlı; azaltılmış hareket tercihi geçişleri kapatır. Mevcut gezinme iptal mantığı korunur.
5. Ayarlardaki dil seçimi dar bir TR/EN alanıydı; görünür EN/TR etiket ve tam genişlikli kontrol eklendi. İlk görsel kontrolde etiket ile kontrolün gridde ayrıldığı görüldü; birlikte bir alan içinde gruplandı, geniş/dar gerçek görüntüyle tekrar doğrulandı. Kontrolü ödünç alma/yerine koyma ve kayıt yolu aynı kalır.

## Kanıt ve kapsam

[48 ekranın envanteri](DESIGN677_2026-10-28/inventory.json): 10 ana yüzey + genel ayarlar + stüdyo; 1440/800 CSS px; TR karanlık ve EN açık. Bunlar 48 bağımsız davranış testi veya 48 tek tek tasarım onayı değildir. Son native envanterde yatay taşma yok; karanlık son koşuda dil etiketi/alanı aynı grupta ve hizalı olması ayrıca assert edildi. Açık son koşu aynı gruplama kodunu görüntüledi; final etiket assertion eklenmesinden önceydi.

| Alan | Bu tur görülen | Hâlâ açık olan |
|---|---|---|
| Ana sayfa/film/dizi | Boş profil, geniş/dar ekran; ana sayfa ve film görüntüsü tek tek incelendi | Gerçek dolu arşiv, çok uzun başlıklar, resim yükleme hataları |
| Müzik/kitap/radyo | Boş durumların envanteri; müzik açık/dar ve kitap karanlık/dar tek tek incelendi | Dolu Spotify listesi ve analiz grafiklerinin bütün durumları, hata/iptal/yeniden açma |
| Ayarlar | Genel görünüm/dil, iki tema/boyut; final dil gruplaması görüldü | Tüm sağlayıcı kategorileri, yoğun model listeleri ve doğrulama kartları |
| Asistan | Mevcut kontrollü native test geçti; kısa TR paneli görüldü | Uzun konuşma, araç/onay/hata kartları ve içerik büyümesi |
| PDF/kitap okuyucu | Mevcut native test geçti; dar okuma ekranı görüldü | Çok sütun, uzun bölüm, bütün çeviri/üretim kombinasyonları |
| Browser | Mevcut native chrome testi geçti; dar fixture görüntüsü incelendi | Görüntüde native yüzey ile host alanının ayrılması/boş bölge ayrıca araştırılmalı; gerçek YouTube/WebView2/fullscreen/DRM kanıtı yok |
| Keşfet/zevk/web/son oynatılanlar/stüdyo | Envanter ve önceki/son contact sheet karşılaştırması | Bütün dolu/veri/hata durumlarının ayrı etkileşimli kabulü yapılmadı |

Görseller: [Ana sayfa](DESIGN677_2026-10-28/home-dark.png), [film boş durumu](DESIGN677_2026-10-28/films-dark.png), [müzik açık tema](DESIGN677_2026-10-28/music-light.png), [ayarlar açık](DESIGN677_2026-10-28/settings-light.png), [ayarlar dar/karanlık](DESIGN677_2026-10-28/settings-dark-narrow.png). İzole profil; kişisel ekran veya anahtar yok.

## Kontroller ve sınırlar

- `node --test --test-isolation=none tests/media-home-model.test.js tests/ui-motion.test.js tests/media-shelf-service.test.js tests/design-system.test.js`: 15 PASS. Hızlı gezinmede eski animasyonun iptali, reduced motion, kopmuş içerik ve temel raf/model sözleşmeleri dahil.
- `electron tests/electron-design677.smoke.js` ve `--light`: gerçek Windows Electron; ayrı geçici profiller. İlk paralel denemede profil adı çakışması oldu, PID eklendi ve ayrı koşular tamamlandı. Electron Windows GUI başlatıcısının kabuk exit 0'ı tek başına başarı sayılmadı; tamamlanan inventory.json esas alındı.
- Mevcut PDF, kontrollü asistan ve browser chrome native kontrolleri geçti. Browser testinin ilk kırmızısı eski sabit renk beklentisiydi; beklenen değer aktif --text-dim tokeninden hesaplanır hale getirildi. Kontrol kaldırılmadı veya tolerans genişletilmedi; bu yeni ürün bugı sayılmadı.
- Değişen JS sözdizimi ve git diff --check geçti. Tam npm test ve uzun CI beklenmedi/yeşil iddiası yok. Native koşularda mevcut before-quit listener uyarısı görüldü; bu tur çözülmedi.
- start.bat/install.bat/Python/CUDA/dosya seçici değiştirilmedi; temiz start.bat açılışı, gerçek model/ses kalitesi, ücretli servis, kişisel hesap ve ekran okuyucu denenmedi. Görsel koşular GPU devre dışı izole fixture ortamındadır.

Bir sonraki görsel kabul paketi önce dolu müzik analizi ve uzun asistan araç kartlarını, ardından gerçek browser native yüzey yerleşimini ele almalı. Bunlar bu raporla kapatılmadı.
