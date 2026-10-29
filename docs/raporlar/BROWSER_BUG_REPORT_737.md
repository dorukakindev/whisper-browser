# Rapor737 — Açık kitap ekranında dil tutarlılığı

## Doğrulanan hata ve değişiklik
R736 sırasında açık kalan kitap üretim ekranında dil değişince durumun bir kısmı güncelleniyor, düğmeler ve dört alt bileşenin başlıkları eski dilde kalıyordu. Ekranı yeniden oluşturmak ses ve metin durumunu kaybetme riski taşıyordu.

- `src/renderer/media-workflows-ui.js`: yalnız yazılmış arayüz metinleri açık EN/TR etiket nesnesiyle bağlanır. Dil olayında bu etiketler yerinde güncellenir; kullanıcı metni ve kitap adı sözlükle eşleştirilmez. Durduruldu/tamamlandı gibi sabit durumlar, ana eylemler ve sayfa başlığı güncellenir. Option öğelerine geçersiz span eklenmez.
- `src/renderer/book-assistant-ui.js`, `book-production-plan-ui.js`, `book-text-preparation-ui.js`, `book-voice-takes-ui.js`: aynı açık etiket bağı alt bileşenlerde kullanılır. Yardımcı olmadan çalışan bağımsız modül testleri mevcut t() yoluna döner.
- `tests/electron-book-stop645.smoke.js`: dil değişiminde projeyi yeniden açma kaldırıldı; aynı açık ekranda düğme, durduruldu durumu ve plan/deneme başlıkları denetlenir. Metin taslağı aynen korunur; dinlemede aynı audio ve body nesnesi ile aynı zaman korunur.

Bu tur yeni tasarım sistemi veya dış repo kodu eklemedi. frontend-design ilkeleriyle mevcut ortak tema ve yerinde güncelleme yaklaşımı korundu. Tkinter görünümünden Electron stüdyoya geçiş R722/R732'nin teslimidir; yeniden yeni iş sayılmadı. Tasarım önceliği AGENTS'de zaten kalıcı.

## Kanıt
- Gerçek Windows Electron ana/preload/renderer köprüsü, ayrı profil ve kontrollü işlerle exit0. Üç iptal aşaması, istenmeyen üretim0, 1000 bölüm seçimi ve asistan başlat/dinle-vurgu/yeniden üret akışı geçti. Gerçek sentetik WAV metadata ve zaman korunumu kontrol edildi; model üretimi bu turda yok.
- [EN koyu](evidence737/book-actions-en-dark.png) ve [TR açık dar](evidence737/book-actions-tr-light-narrow.png) görüntüleri açılarak incelendi. Dar koşul 560 CSS px, %125 yakınlaştırma; taşma ve metin/eylem örtüşmesi yok. Son option düzeltmesinden sonra native koşu tekrar exit0; EN son görüntü ve önceki aynı TR düzeni incelendi.
- [Sanitize edilmiş ölçüm](evidence737/acceptance.json): özel profil yolu çıkarıldı; kullanıcı verisi yok.
- Dört ilgili Node dosyası: 8 PASS. Plan dosyası kurulu Python ile ayrıca 2 PASS/0 skip. Beş UI dosyası syntax ve git diff kontrolü geçti.
- İlk yalnız ana bileşen güncellemesinde dört alt başlık İngilizce kalıyordu; finalden önce alt bileşenler aynı bağa geçirildi.

## Sınırlar
Dinamik içerik açıklamalarının, bütün placeholder/aria metinlerinin ve diğer uygulama yüzeylerinin tamamının canlı dil değişimi bu kapsamda tamamlandı iddia edilmez. Yeni GPU/TTS/API, YouTube/DRM, fiziksel dosya seçici, start.bat etkileşimli kabulü veya tam npm test yapılmadı. CI açık, sonucu beklenmedi. Mevcut 11 before-quit listener uyarısı sürer; eşik artırılarak gizlenmedi. Bağımlılık, IPC, dosya şeması, start/install veya motor ayarı değişmedi. 90 aktif hedef sürer; müzik kapsam dışı.
