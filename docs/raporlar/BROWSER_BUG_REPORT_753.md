# Rapor753 — PDF aramasında geç hata sahipliği ve tekrar deneme

## Doğrulanan hata
pdf-reader-search.js navigate catch yalnız visible() kontrol ediyordu. Eski eşleşmeye giderken render promise'i beklemede, kullanıcı aramayı kapatıp/yeni sorgu açıp ardından eski render reddedildiğinde önceki hata güncel arama durumunu eziyordu. Aynı sorguda hızlı iki ileri/geri geçişte de öncekinin geç hatası son eşleşmeyi bozabiliyordu. [Önce-kırmızı kanıt](evidence753/before.txt): kapalı panelde beklenen boş durum yerine old page rendering failed.

## Düzeltme
- src/renderer/pdf-reader-search.js: başarısız sayfa açma sonucu da başarıdaki gibi reader kimliği, arama sequence ve hareket jumping kimliğiyle denetlenir. Hata yakalama jump içinde, snapshot'ın yanında yapılır; dıştaki yalnız görünürlük catch'i kaldırılır. Güncel hata EN/TR eyleme dönük metin gösterir, önceki pasaj temizlenir; eşleşme listesi/navigasyon düğmeleri korunur ve tekrar denenebilir. Ham renderer hatası kullanıcı durumuna taşınmaz.
- tests/pdf-reader-search-ui.test.js: kapanmış arama, yeni sorgu, aynı sorguda daha yeni eşleşme, güncel EN/TR hata, pasaj temizliği ve ardından başarılı tekrar. Test kurulumunda sabit20ms yerine sonuç düğmesinin hazır olması beklenir; ilk kurulum zamanlaması hatası ürün bugı sayılmadı.
- tests/electron-pdf-reader-experience.smoke.js: --search-owner opt-in; gerçek PDF.js/main/preload/renderer akışında kontrollü render reddi, kapatma sonrası geç hata reddi, güncel Türkçe hata ve tekrar açılan eşleşme. Gerçek disk/GPU arızası simüle edildi diye sayılmaz; yalnız render sonucu kontrollüdür.

## Kanıt ve tasarım
8Node hedefli test PASS, ikiJS syntax/diffPASS. Gerçek Windows izole Electron searchOwner:true/exit0; [native sonuç](evidence753/search-owner.json). [Türkçe hata ekranı](evidence753/pdf-search-error-tr.png) gerçekten açılıp incelendi. Ortak mevcut grafit/amber yüzey ve kompakt arama bandı kullanılır, yeni CSS/varsayılan platform kontrolü yok. Kontroller kullanılabilir kalır; bu paket tüm ekran/DPI/kontrast denetimi değildir. EN hata metni Node'da kontrol edildi, yeni EN native görüntü yok. Mevcut11 before-quit listener uyarısı sürer. Kişisel uygulama/ayarlar/dosyalar değiştirilmedi. Yeni bağımlılık/schema/IPC yok; start.bat ve GPU/ASR/ücretliAPI bu tur çalıştırılmadı, CI beklenmedi.

[Mozilla PDF.js gerçek find controller](https://github.com/mozilla/pdf.js/blob/master/web/pdf_find_controller.js) asenkron arama ve kapanışta güncel belge kimliğini kontrol eder. Apache2.0 kaynağındaki yaklaşım incelendi; kütüphane/kod kopyalanmadı, uygulamanın mevcut generation sayaçları kullanıldı. P061/P097 arama-hata durumu ilerledi; kalan kitap/PDF/asistan gereksinimleri bu dar kanıtla bitmiş sayılmaz.
