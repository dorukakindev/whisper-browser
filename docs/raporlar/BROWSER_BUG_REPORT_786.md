# Rapor786 — Tasarım bütünlüğü ve kaydırma çakışmaları

2026-10-29 · codex/design-deep786 · başlangıç27880cc98050528e7a5eb7aeb0bfb17ff52d264f · bitiş ürün/test kodu 2f7b35968720911b3ffdd01e3859030e8ef0aaef.

## Doğrulanan sorunlar ve değişiklikler

- Ana kategori aynı anda dolgu, alt vurgu ve odak çerçevesi taşıyordu. `media-home.css/js`: seçili kategori tipografik amber; gerçek pointer olayında çerçevesiz, Tab ile yeniden görünür odak. Klavye erişimi kaldırılmadı. Geniş ekranda iki düzenli satır, dar ekranda kontrollü sarma; araç kartları, başlık/metin ve düğmeler arasında tutarlı boşluklar.
- Asistanın sabit yükseklikli satırlarının toplamı küçük pencereye sığmıyordu. İlk yeni tasarım denemesinde 360×580 pencerede form altı603.5px olarak ölçüldü; bu deneme teslim edilmedi. `assistant-overlay.html/css`: konuşma ve yardımcı alanlar kaydırılabilir workspace içinde; composer ayrı normal flex satırı. Kaynak/inceleme açıldığında gönderme alanı aşağı itilmez. Uzun mesajlar bağımsız akış, kod ve kaynak kartları kendi sınırlarında kalır. Küçük pencerede ikincil klavye ipucu gizlenir; kısayol işlevi korunur.
- `styles.css`: Whisper formunun alanlar üzerine kayabilen sticky eylem sırası normal belge akışında. Grafit zemin, mevcut yerel IBM Plex Sans ve nötr kaydırma renkleri ortaklaştırıldı.
- `browser-chrome.css`: ayrı turuncu vurgu kaldırıldı, ortak amber miras alınır. Native tarayıcı geometri mantığı değiştirilmedi.
- `app-settings.css`: alan/etiket boşlukları, içerik genişliği, sabit boyutlu başlık ve erişilebilir kaydırma alanı.
- `media-discovery.css`: sade sekmeler, filtre etiketi/alan boşluğu, dar ekran ızgarası ve konu metninin satır aralığı.
- `media-experience.css`: dublaj başlığı, kart içi boşluklar, ayar/eylem aralıkları ve dar ekran düzeni.
- `pdf-reader.css`: aşırı hap biçimleri yerine ortak köşeler, okunur seçili durum; kullanıcı okuma yazı boyutu korunur.

## Kanıt ve testler

Gerçek Windows Electron + main/preload, ayrı sentetik profiller; kişisel açık uygulama kapatılmadı. Kaynak taraması mevcut ortak tasarım sistemi, yerel font lisansları ve frontend-design/make-interfaces-feel-better ilkelerine dayanır. Dış proje kodu veya yeni bağımlılık alınmadı.

- `node --test tests/design-system.test.js tests/report64-contrast.test.js tests/ui-motion.test.js tests/media-home-model.test.js`: 15 test PASS. Sandbox ilk denemesi spawn EPERM; izinli yerel tekrar PASS, ürün hatası diye sayılmadı.
- `electron tests/electron-design786.smoke.js`: 21 görüntü, boş/dolu kütüphane, keşfet ve ayrıntı, ayarlar, Whisper, dublaj, metin-ses. TR koyu1440 ve EN açık800/125% (CSS640). Gerçek fare tıklaması: şeffaf kategori, outline yok; gerçek Tab: görünür outline. Tüm ölçülen yüzeylerde yatay taşma yok. Keşfet verisi/kapaklar sentetik, harici ağ kapalı.
- `electron tests/electron-assistant678.smoke.js`: PASS; uzun alıntı, okuma konumunun korunması, sohbet değişimi, 360×580, açılmış kaynak/inceleme, composer sınırı, ardışık uzun mesajların geometriyle çakışmaması. 1px altı raster yuvarlaması için1px ölçüm toleransı var.
- `electron tests/electron-pdf-reader-experience.smoke.js --toolbar-only`: PASS; gerçek PDF, native klavye/fare, dar/kısa pencere menü sınırları, %125, TR/EN, hover geçişini %10 hızda ve reduced-motion ile kontrol.
- `electron tests/electron-browser-chrome-design.smoke.js`: PASS; sentetik WebM gerçekten çözülür/ilerler; native yüzey menüyle gizlenip geri gelir, fullscreen giriş/çıkış ve sınırlar.
- Değişen JS syntax, `git diff --check`: PASS.

Yerel görüntü dizinleri `.uiprev/design786-after-1793299572948`, `.uiprev/assistant678/1793299437395-11824`, `.uiprev/pdf-reader678-1793299438401`, `.uiprev/browser678`. Ham görüntü/profil Git'e eklenmedi. Testlerdeki mevcut MaxListenersExceededWarning gizlenmedi; filtre hazırlama ağ-kapalı uyarısı kontrollü test sınırıdır.

## Sınırlar ve teslim

Bu bir tüm uygulama kusursuzluk iddiası değildir. Gerçek YouTube/Cloudflare, canlı API/model, GPU üretimi, start.bat açılışı ve tüm kullanıcı veri kombinasyonları bu tasarım turunda denenmedi. Uzun npm test/CI beklenmedi, CI kapatılmadı. Müzik analizine hedef eklenmedi. Ayrı assistant618 kopyasındaki tamamlanmamış R785 ses sürümü özelliği korunur ve bu teslimde yoktur. Ürün100 hedefi tamamlandı sayılmadı. Ana kopyanın kişisel manifest/INDEX değişikliği, silinmiş start.sh ve untracked dosyaları korunarak normal PR/master teslimi yapılır.
