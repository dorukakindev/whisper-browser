# Global asistan, Keşfet kaydırması ve Defuddle

Başlangıç: `ab4e6e0bbcbf2901800ae30123ffba25c56b0624`, ürün teslimi: `05789dbffdd6ad040f4236f02f0068e115c58713`. Dal `codex/luna-media-home532`, PR482. Ana master ve kullanıcının çalışma ağacı değiştirilmedi.

## Doğrulanan sorunlar ve çözüm

- Keşfet'in uzun kart listesi global html/body/app yükseklik ve overflow kurallarına dayanıyordu. Ana sayfa artık kendi 100vh, overflow-y:auto kaydırma alanına sahip. Gerçek Electron mouseWheel ile scrollTop >100 doğrulandı. Bölüm değişimi başa döner; ayrıntı açma kendi başına scroll'u sıfırlamaz.
- Önceki Luna tesliminde global asistan yoktu; AI yalnız player sidebar içinde kalıyordu. Yeni native WebContentsView, sağ alt baloncuk ve açılır sohbet kutusu sağlıyor. Ana sayfa, stüdyo, player ve browser aynı sohbet kontrolcüsünü kullanır. Browser'ın native yüzeyinin üstünde kalır; sayfa daralmaz veya gizlenmez. Genişletme yalnız kullanıcının düğmesiyle yapılır. Pencere fullscreen sırasında gizlenir; müzik dock'u varsa yukarı taşınır.
- Ana sayfadan konuşmada daha önce açık olan videonun bağlamını kullanma riski giderildi: ayrı global source scope, video kanıtı ve browser page extraction kapısı. Aynı sağlayıcı/anahtar ayarları, iptal/yeniden dene, kaynak/zaman düğmelerinin mevcut kaynak kapsamı denetimleri korunur. Yalnız mevcut doğrulanmış AI kaynak düğmelerine opaque ID ile yönlendirilir; genel DOM komutu yoktur.
- Native shell yalnız metin ve izinli eylem taşır. Node/shell/file/provider API'si yok; sandbox/contextIsolation açık; CSP ağ erişimine izin vermez. Ana süreç iki tarafın ana-frame/sender kimliğini denetler. Anahtarlar snapshot'a konulmaz. Chat işi yeni bir motor veya ikinci bir geçmiş deposu kullanmaz.
- Açık temada yeni asistanın başlığı ve AI mesajı başlangıçta beyaza yakın kalıyordu; gerçek görsel incelemede yakalanıp body rengi düzeltildi. Regresyon kontrolü eklendi. TR/EN boş durum, düğmeler ve tema eşleşmesi doğrulandı.

## GitHub adaylarının sonucu

- **Defuddle 0.19.5** resmî npm browser bundle'ı, MIT + gömülü MathML dönüştürücü lisansı ile vendored. https://github.com/kepano/defuddle . CDN veya npm runtime değişikliği yok. URL/HTML bir kopya üzerinde, useAsync:false ile işlenir; çıkarılan içerik mevcut tag/attribute/URL izin listesiyle yeniden kopyalanır. Doğrudan live innerHTML yazılmaz. Yetersiz içerik/büyük DOM/hata durumunda eski bounded extractor kullanılır. Güvenilir isolated-world bootstrap, okuyucunun sanitizasyon kodundan ayrıdır. Bu tur Defuddle **okuma görünümüne** bağlandı; tüm sayfa çeviri/AI çıkarımını değiştirdiği iddia edilmez.
- **TanStack Virtual** araştırıldı (https://github.com/TanStack/virtual). Mevcut home/katalog artımlı, Discover en fazla300 kayıtla sınırlı. Bu tur ölçülmüş yeni bir performans ihtiyacı ortaya konmadığından ek bağımlılık veya sanal grid dönüşümü yapılmadı; uygulandı diye sunulmaz.
- **adblock-rust** eklenmedi: mevcut Ghostery Electron motorunu, site anahtarı ve günlük hattını Rust bağlayıcıyla değiştirmek bu taleple gerekçelenmedi. Yeni reklam engelleme başarısı iddia edilmez.
- **mpvacious/Anki** ürünün önceliği değil; **intro-skipper** Jellyfin eklentisi doğrudan Electron'a takılamaz. Otomatik intro taraması bu tur yapılmadı.

## Kanıtlar ve sınırlar

`electron tests/electron-media-discovery.smoke.js` ayrı test profiliyle geçti. Son kanıt dizini `.uiprev/media-discovery/1792834606399-19352-fixture/` (Git dışı). Bunlar sentetik katalog ve kontrollü sağlayıcı fixture'larıdır. Native browser gerçekten oluşturuldu; assistant child view sırası, görünür browser ve değişmeyen bounds doğrulandı. Overlay kendi capturePage görüntüleri incelendi: ana pencere capturePage native katmanı içermez. Bütün masaüstünü kapsayan native OS ekran görüntüsü iddia edilmez.

Kontroller: gerçek tekerlek kaydırma; 1920/940/680 genişlik; TR/EN ve açık/koyu tema; minimize/expand ve taslak; mevcut chat kontrolcüsüne soru ve hatanın yansıması; kaynak düğmesinin ortak kontrolcüye yönlendirilmesi; eski video kanıtının home isteğine karışmaması; Defuddle'ın gerçek isolated world'de seçilmesi, canlı sayfanın korunması ve event-handler enjeksiyonu olmaması. İlk fixture'ın özgün sayfada kendi onerror olayını çalıştırdığı ayrıldı; okuyucu başlamadan işaret sıfırlanarak okuyucu kaynaklı çalıştırma ayrıca sınandı.

12 hedefli Node sonucu geçti (`assistant-overlay`, `browser-nine-features`, `browser-parti2`, `preload-sandbox`, `media-home-model`, `media-discovery-service`). JS syntax/diff geçti. Sandbox'ın child spawn EPERM engeli için Node `--test-isolation=none` ve yetkili Electron kullanıldı. Tam npm test ve CI beklenmedi. Canlı model/ücretli sağlayıcı, GPU/TTS/DRM, tüm siteler, OS filepicker ve bütün fullscreen birleşimleri doğrulanmadı. Bu tur yeni kodla start.bat açılışı ayrıca yeniden yapılmadı; mevcut önceki önizleme süreci yeniden açılana dek eski koddadır.

Asistan yalnız mevcut sohbetin yeteneklerini birleştirir; otomatik film oynatma/dosya değiştirme veya Luna'daki bütün araçları port etme iddiası yoktur. Master otomatik merge edilmedi.
