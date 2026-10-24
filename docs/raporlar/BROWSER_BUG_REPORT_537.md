# Rapor537 — Story/Konu için Türkçeye çevir düğmesi

Kullanıcı film ayrıntı ekranındaki İngilizce özet için açık çeviri düğmesi istedi. Önceki sürüm yalnız TMDB'nin verdiği özeti/İngilizce fallback'i gösteriyordu; kullanıcı talebiyle AI çevirisi yoktu.

## Uygulama

Story/Konu başlığının yanında EN arayüzde Translate to Turkish, TR arayüzde Türkçeye çevir var. Kaydedilmiş ortak Asistan ve çeviri sağlayıcısı/modeli main süreçte kullanılır; yeni anahtar/sağlayıcı alanı yok. Yalnız kayıtlı konu özeti, çeviri talimatı ve mevcut kullanıcı sözlüğü gönderilir; bütün arşiv, yorumlar veya kişisel puanlar gönderilmez. Hedef arayüz dilinden bağımsız Türkçedir. Özet modu, mevcut güvenli çeviri isteğini kullanır; doğal tam metin, yeni olay/spoiler eklememe ve güvenilmeyen metindeki talimatlara uymama talimatı vardır. Mevcut altyazı/çeviri varsayılanları bu yeni mod dışındaki davranışını korur.

Özgün synopsis değişmez. Türkçe metin synopsisTr, kaynak SHA256 synopsisTrSource ile ayrı saklanır; eşleşen kaynak yeniden API isteği olmadan açılır. Özgününü göster/Türkçesini göster geçişi vardır, AI çevirisi etiketi görünür. Kaynak değişirse eski çeviri gösterilmez. Üretim sırasında Durdur; pencere kapanınca token ile iptal; geç yanıtın başka film ekranına uygulanmaması; boş/aşırı uzun yanıt ve eşzamanlı özet değişikliğini reddetme eklenmiştir. Hatalı/iptal edilmiş yanıt özgün metni ezmez. Renderer katalog save yolundan bu korumalı çeviri alanlarını yazamaz.

## Kontroller

- `node tests/catalog-synopsis.test.js`:4 geçti; ayrı özgün/çeviri ve yeniden açılış, önbellek, kaynak değişikliği, doğru token ile durdurma, boş/aşırı uzun yanıt reddi. İlk test fixture'ında kind unutulmuştu; film eklenince gerçek kontratla geçti, ürün bugı diye sayılmadı.
- `node --test tests/catalog-synopsis.test.js tests/media-catalog-service.test.js tests/catalog-roadmap.test.js`: ilk fixture düzeltmesinden önce katalog service/roadmap geçti; synopsis dosyası düzeltildikten sonra yukarıdaki doğrudan komutla4geçti. Başarısız ilk koşu saklanmıştır; yeni başarısızlık yok.
- Windows Electron `tests/electron-metadata-settings.smoke.js`: gerçek main/IPC ve ayrı profil. Mevcut TMDB5fixture yanıtına ek1kontrollü AI yanıtı. Kaydedilmiş sağlayıcı başlığı/modeli, özet prompt'u, çeviri düğmesi, özgün metne dönüş, Türkçeye dönüş ve kapanıp tekrar açılışta1istekte kalması doğrulandı. Özel/gerçek sağlayıcı anahtarı veya gerçek ücretli servis kullanılmadı; bu model çeviri kalitesi kanıtı değildir.
- TR1920koyu/EN940açık görseller `.uiprev/metadata-settings/1792866022516-27140/`; yerel sentetik kanıt Git'e alınmadı. Çeviri düğmesi, başlık, özet ve AI etiketi önceki görsel koşumda da incelendi. İlk screenshot yeniden açılış sonrası paint'ten önce alınmıştı; testte font/decode/iki animation-frame beklemesiyle düzeltildi, ürün hatası iddia edilmedi.
- Paket bütünlüğü9geçti, preload ratchet286export/7dormant/0kullanılmayan; değişen JS syntax ve git diff kontrolü geçti.

## Sınırlar / kullanım

Önizlemeyi kapatıp aynı preview-luna.bat ile yeniden aç; film kartı→Story/Konu→Türkçeye çevir. AI sağlayıcısı eksik/hatalıysa Ayarlar→Asistan ve çeviri bölümünü yapılandır. İstek otomatik gönderilmez; yalnız düğmeye basılınca. Yeni alanlar geriye uyumlu, bağımlılık/kurulum değişmedi. Normal start.bat açılışı, canlı sağlayıcı kalitesi, GPU/DRM/gerçek medya ve tam npm test bu tur koşulmadı. CI açık, beklenmedi. Master'a birleştirilmedi; mevcut PR482 dalına teslim.
