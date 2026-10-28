# Rapor 689 — Kitap okuyucu menüsü ve PDF sayfa sahipliği

Başlangıç 2ddf0838001198641b549cba205055d0e16ee60a; ürün a3e07eb3e5a93a8b47779228b99207df576f1885; dal codex/book-layout689. Ürün100 P062/P074/P094 üzerinde hedefli çalışma;100 hedefin tamamı bitmedi.

## Doğrulanan iki ürün hatası
1. 800px Windows pencere /125%zoom (640CSSpx) okuma araçları popup sağa dayalı390px genişlik nedeniyle sola taşıyor, başlık kesiliyordu. Dar ekran menüsü artık okuma başlığının genişliğine oturur; sol/sağ sınırları scroll viewport içinde doğrulandı.
2. Üretim bölümünden kaynak PDF sayfa2'ye dönüldüğünde iki kısa sayfa tamamen görünürken üçüncü sayfanın piksel alanı daha büyük diye gösterge ve asistan bağlamı3'e kayıyordu. Kaydırma seçimi artık mevcut sayfa tamamen görünürse onu korur; görünümden çıkınca yeni görünür sayfaya geçer. PDF.js Apache2 güncel pdf_viewer.js update() içindeki fully-visible-current-page yaklaşımı incelendi: https://github.com/mozilla/pdf.js/blob/master/web/pdf_viewer.js . Dış kod kopyalanmadı, dependency eklenmedi.

## Test kök nedenleri ve kanıt
R688 dar ekran assertion'ı tek başına ürün kanıtı değildi: kapalı details altındaki düğmeler getClientRects döndürüyordu; multiline span bounding box merkezi metin yerine article boşluğuna denk gelebiliyordu. Test checkVisibility ve gerçek metin range rect hit-test kullanır; kapalı kontrolleri saymak yerine menüleri ayrı ayrı açar. Menü clipping koşulu eklendi/eşik gevşetilmedi. Eski EPUB düğme etiketi güncel “Bölümü seslendir” ile eşlendi; işlev aynı gerçek IPC yolunda.

6 Node kontrol PASS: pdf-visible-page689/pdf-render-cancel633/pdf-selection-owner651. Sözdizimi/diff PASS. Native Windows electron-book-reliability.smoke.js exit0, results.ok=true; gerçek PDF, fixture WAV, gerçek FFmpeg M4B oluştur/çöz, group manual review, özgün PDF highlight, PDF sayfa2 kaynak dönüşü, EPUB ikinci bölüm üretime ve geri dönüş PASS.8dar ekran durumu ölçüldü; menüler ayrıca açıldı. .uiprev/book-reliability549-1793159704346 yerel kontrollü kanıt. Tam GPU/TTS kalitesi bu testte denenmedi; fixtureAudio=true. Kullanıcının açık uygulaması/profili kullanılmadı. before-quit11 listener uyarısı açık. start.bat/kurulum/GPU/DRM/gerçek sağlayıcı/uzunCI bu paket kapsamında çalışmadı.
