# R841 kanıtını yeniden kontrol etme

Bu paket bir ürün test paketi değildir. Araştırmanın sabit kaynaklarını ve yerel tabanını denetlemeye yarar. Raporun 73 kartı [card-index.json](card-index.json), 208 kaynak kaydı [verified-source-index.json](verified-source-index.json) içindedir. Kaynakların indirilen gövdeleri public pakete kopyalanmadı; resmî GitHub permalink/raw adresleri alan manifestlerinde bulunur.

1. Alanlardaki repositories.json ile tam HEAD'i eşleştir. Varsayılan dalın bugünkü HEAD'i yerine kayıtlı40haneli SHA'yı kullan. Redirect/canonical repo adları ilgili notes/README'de açıklanır.
2. İstenen dosyayı kayıtlı raw URL'den indir; byte SHA256 değerini manifestteki rawSha256/sha256 ile karşılaştır. HTTP başarısını dosya içeriği sanma; JSON/tree hata cevabı hash'e uymaz.
3. canonical-LF hash için UTF-8 BOM'u çöz, CRLF ve tek CR'yi LF'ye çevir, BOM'suz UTF-8 encode edip SHA256 al. Byte hash ile metin hash'ini birbirinin yerine koyma. Ana verified-source-index ikisini de taşır.
4. Yerel ürün tabanı e66228403b6d0ce11c26a3e7c3d61c77c650d375. Her alanın local-baseline.json dosyasındaki kaynakları bu commit'ten alıp canonical-LF olarak karşılaştır. 42 benzersiz dosya, alanlar arası ortak dosyalar tek sayıldı. Belge commit/merge'i ürün kodunu değiştirmedi.
5. Kartlardaki source URL'lerinin repo+tamHEAD+path üçlüsünü manifestle eşleştir. D841-21 ve D841-22'nin yerel/önceki öneri uzantısı olduğunu koru; dış repo hazır algoritması yapma. A841-04 R839-F12 derinleştirmesidir. Nihai sayım46NEW/27OLD-DEEPENING/73.
6. Beş JPEG dosyasını visual/manifest.json byte hash'iyle kontrol et. Hosted web build SHA bilinmediği için görüntü hash'ini upstream commit doğrulaması sanma. Bu resimler UI düzeni kanıtı, model/DRM/Windows-native kabulü değildir. Kamu demo parolası veya kişisel hesap verisi yayımlanmadı.

Araştırma sırasında parent Python stdlib kontrolü208kaynak byte hash'ini,42yerel canonical hash'i,73ID ve kaynak bağlantılarını, JSON ve yerel belge/görsel bağlantılarını doğruladı. Son sayılar verification.json içindedir. Gövde cache'i ignored .tmp/research841 altında kaldı. Cache yoksa yukarıdaki resmî kaynaklardan seçili dosyalar tekrar indirilebilir; bu bir upstream build veya ürün kabul testi yapmaz.

Çalıştırılmayanlar: ürün npm/bridge/Python testleri, start.bat/install.bat, upstream paket build/kurulumu, native Windows/DPI/GPU/DRM, kişisel Letterboxd hesabı, gerçek model/embedding/reranker kalitesi. Bu araştırma için CI ayarı değiştirilmedi ve CI sonucu beklenmedi.
