# 560 — PDF okuyucuda çizim sahipliği

`readChapter()` belge yüklenmesinden sonra sayfayı ve metni asenkron alıyor. Bu beklemeler ve çizim sonucunda güncel sayfa denetlenmediğinden eski sayfa yeni çizimi iptal edebiliyor, global vurgu haritasına/ResizeObserver'a karışabiliyordu. Yakınlaştırma da önceki çizimin iptalinin tamamlanmasını beklemeden aynı canvas'a ikinci çizimi başlatıyordu.

Çözüm: PDF erişimi, bayt okuma, sayfa/metin alma ve çizim sonrasında okuyucu nesli/proje/bağlı sayfa kontrolü. Her yakınlaştırma isteği kendi sıra numarasını taşır; önceki render iptal edilip promise'i sonlanmadan canvas yeniden kullanılmaz. Bayat sonuç yeni vurgu haritasını ve gözlemciyi değiştiremez. Bayat hata yeni sayfanın durumuna yazılmaz.

Kanıt: `tests/reader-pdf-lifecycle.test.js` gerçek `readChapter` fonksiyonunu geciktirilen PDF metin/çizim promise'leriyle çalıştırır. Düzeltmeden önceki HEAD kaynağında 4 kontrolden 3'ü başarısız; yeni kaynakta 4'ü geçer. Bunlar üç ayrı ürün bugı olarak sayılmaz: sayfa yaşam döngüsü ve canvas çizim çakışmasının farklı kapılarıdır. Gezinme/yeniden üretme kontrolleriyle toplam 9 hedefli sonuç geçti; syntax/diff temiz.

Gerçek Windows Electron ayrı profili: `tests/electron-book-reliability.smoke.js`, exit0, `.uiprev/book-reliability549-1792902219353`. PDF/arama/Review/sayfa2 asistan bağlamı/M4B kontrolü; `reader-tr-dark.png` incelendi. Kontrollü ses kullanıldı; gerçek TTS kalitesi/GPU/kişisel start.bat/canlı servis ve CI bu turda doğrulanmadı. Yeni bağımlılık ve kalıcı şema yok.
