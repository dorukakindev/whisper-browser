# Rapor688 — Kitap review ses sınırı ve açık native hata

Başlangıç c4729fe9a836e8d6319bf8af565cb2db991cbd7a; ürün b6c469fa9375156e9ef88e9f83dd86f35e2bfe3d; dal codex/book-review688.

Mevcut tekgrup onay/dinle/düzenle/yeniden üret ve M4B önizleme bulundu; tekrar özellik diye eklenmedi. Doğrulanmış backend boşluğu: book-approve grup.start/end pozitif mi ve dosya mevcut mu kontrol ediyor, gerçek WAV süresinin içinde mi bakmıyordu.2saniyeden kısa fixture WAV için999sn review bitişiyle onaylanabiliyordu. src/media-workflows.js artık wav-duration ile gerçek PCM data süresini okur, başlangıç>=süre veya bitiş>süre+1ms ise onayı reddeder. Önceki grup status/manualApproval değişmez. Türkçe/İngilizce hata, tam dosyayı RAM'e almayan mevcut RIFF okuyucu kullanıldı.

tests/book-quality-scope636.test.js999sn dış grup reddi ve review durumunun korunması PASS. book-export.test.js/book-reliability.test.js ile toplam10 Node hedefli kontrol PASS: gerçek FFmpeg M4B sırala/metadata/resample/duration, gerçek süreç iptalinde çıktı temizliği, eksik dosyada varolan çıktı korunması. Syntax/diff PASS. Bu kontroller gerçek VoxCPM2 kalitesi değildir.

**Bilinen kırmızı:** electron-book-reliability.smoke.js ayrı Windows profilinde PDF/group approve/M4B aşamalarından ilerledi, reader-800-1.25 pointer-accessible kontrolünde assertion verdi; error.txt satır103/auditNarrow ve821çağrısı. Süreç21712 sona erdi; yeniden başlatılmadı. Ekran BOOK688_2026-10-28/reader-narrow-failure.png. Sonraki EPUB dönüş adımları çalışmadı; native paket PASS değildir. Görünen küçük ekranda üst kontroller kaydırılınca örtülme veya açık popover hit-test durumunu ayırmak gerekiyor; kod kök nedeni henüz doğrulanmadı. Test silinmedi/eşik gevşetilmedi. P062/P094 açık.

PDF.js Apache2 pdf_find_controller.js https://github.com/mozilla/pdf.js/blob/master/web/pdf_find_controller.js kaynak/konum eşleme yaklaşımı incelendi; dış kod/dependency alınmadı. Önceki audit PDF/kitap kapsamı ve R68180sayfa kanıtı tarihsel, bu hata onunla çürütülmedi. YeniIPC/şema/kurulum yok. Windowsstart.bat/install.bat değişmedi; temiz başlangıç/GPU/DRM yok. before-quit11uyarısı açık. TamCI beklenmedi.100hedef aktif;P069/P070 kısmi sınır doğrulaması.

Sonraki somut iş: native reader-800-1.25 hit-test başarısızlığında dialog/popover/scroll DOM geometrisi kaydı al; görünür kullanıcı kontrolünü doğru katmanda tıklayabilme şartı korunarak çöz. Bu denetimi sessizce atlama. Kişisel uygulama/dosyalar korunarak normal PR/merge teslimi.
