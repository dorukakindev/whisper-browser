# Film asistanı: beş bağlantılı akış

Başlangıç `555520d4d1bcfae97881bd7400e1c6f24179503c`; ürün `e9e62a08c6d87d28a721a8c870911c634dc375d9`.

Önce [temsilî görsel taslak](concept.png) ([HTML](concept.html)) oluşturuldu, Windows Electron ile render edildi ve sohbette gösterildi. Taslakta örnek yanıt/filmler kontrollü içeriktir, canlı model çıktısı değildir. Son uygulama, mevcut film üst bölümünü ve medya menüsünü korur. Agent ve yeni bağımlılık kullanılmadı.

| Hedef | Uygulama |
|---|---|
| Film odaklı sohbet | `get_film_context`, tam catalog/discovery kimliği, güncel eşleşmiş yorum taslağı veya kayıtlı analiz, seçili yorum ve açık kişisel öncelikleri döndürür. Kütüphane UUID'sinin `catalog:` olmadan modele gitmesi de düzeltildi. Eksik kaynak veya okuma hatası, başarılı boş araştırma sayılmaz. |
| Gerçek alıntı | F kimliği, film + yorum metni + yazar + alıntı karmasına bağlıdır. Sohbette saklanır. Kaynak bağlantısı tam özgün yorumu açar ve tam eşleşen alıntıyı vurgular. Eski/değişmiş/başka filme ait kaynak, uydurma metin ve spoiler sessizce ikame edilmez. |
| Alternatif bulma | Gerçek Keşfet kataloğu kimlikleri, tür veya açık arama, varsa gerçek süre sınırı ve mevcut yorum kanıtı. Türkçe/İngilizce türler mevcut katalog sözlüğüne ortak modülle çevrilir. Kısa süre hızlı tempo değildir; duygusal ağırlık/tempo hakkında kanıt yoksa yoktur. Yanıt sınırı nedeniyle aday sayısı azalırsa `truncated/returnedCount` döner. |
| Ayrıntılı görüş | Hikâye/karakter/tempo/görsellik/ses/duygu/atmosfer için ayrı like/neutral/dislike kaydı. Mevcut süreli, kaynağa/sohbete bağlı önizleme ve tek kullanımlık onay akışından geçer. Genel beğeni, izlenme durumu veya küresel zevk ağırlıklarını kendiliğinden değiştirmez. Sonraki not/tepki düzenlemeleri bu görüşleri silmez. Filmde kısa etiketler; gelişmiş ayarlarda düzenleme. |
| İki film | `compare_film_titles` kanıtları okur; `open_film_comparison` asistanın gerçek onay kartıyla açılır. Kart iki adı da gösterir, ikinci yapım değişirse de reddedilir. Film sayfasındaki **Filmleri karşılaştır** doğrudan kütüphane/Keşfet seçim alanını açar; kütüphaneye eklemez. Aynı filmin iki alias'ı karşılaştırılmaz. |

## Gerçek Windows görüntüleri

[Karşılaştırma geniş](comparison-wide.png) · [480 CSS px](comparison-480.png) · [Özgün alıntı](source-quotation.png) · [Kayıtlı ayrıntılı görüş](aspect-feedback.png).

Taslakta önerilen düzenli karşılaştırma ve kaynak ayrımı uygulandı. İnceleme sırasında pencerenin sol üste yapışması ve teknik F karmalarının arayüzde görünmesi düzeltildi; ileri görüş kontrolleri iç içe açık form yerine kapalı ayrıntıya taşındı. Bunlar estetik mükemmellik iddiası değildir.

## Doğrulama

- 59/59 hedefli test; asistan araç sözleşmesi, gerçek renderer eylem yönlendirmesi, kontrollü sağlayıcı araç döngüsü, iki hedefin onay kimliği, alıntı saklama/değişme reddi, bağımsız görüş kalıcılığı, mevcut kişisel kayıt ve yorum regresyonları.
- Değişen JS dosyalarında syntax ve `git diff --check` geçti.
- Gerçek Electron uygulaması, ayrı fixture profili: 1440 CSS px, 900/%125 (=720 CSS px), 480 CSS px karşılaştırma taşma kontrolü; tam alıntı; film seçicisinden karşılaştırma; ana süreç önizleme/onay ve yeniden açılışta görüşün korunması. [Makine kaydı](native-evidence.json).
- Kontrol komutu: `node --test --test-isolation=none tests/assistant-film-evidence.test.js tests/assistant-capabilities.test.js tests/assistant-threads.test.js tests/film-page-enhancements.test.js tests/assistant-library-actions.test.js tests/assistant-personal-media.test.js tests/personal-media-state.test.js tests/personal-media-ui.test.js tests/film-review-inline.test.js`.

Canlı DeepSeek/Letterboxd/Keşfet ağı test edilmedi; native kaynaklar kontrollü film ve yorum fixture'ıdır. API anahtarı, kişisel profil, GPU/transkripsiyon/dublaj üretimi, start.bat tam başlatma ve tam test paketi kullanılmadı. Gerçek sağlayıcının her cümlede doğru aracı seçeceği veya önerilerin insan kulağı/zevkiyle kaliteli olduğu iddia edilmez. Actions kredisi nedeniyle hiçbir Actions çalışması başlatılmadı. Kullanıcının açık uygulaması kapatılmadı.

Kişisel OFFLINE-MANIFEST/rapor indeksi/start.sh/untracked dosyalar teslim kapsamı dışıdır. Önceki raporlar silinmedi/yeniden açılmadı. Normal PR, merge ve ana kopyanın güvenli fast-forward teslimi kullanılır.
