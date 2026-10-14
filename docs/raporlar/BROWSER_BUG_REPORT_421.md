# Rapor 421 — Dublaj cümlesi ve süreye uygun metin

Doğrulanan sorun: sentence_plan tamamlanmış cümle sonrasını ancak büyük uzunluk/süre eşikleri sağlanırsa ayırıyordu; uzun tamamlanmış cümleler sonrakiyle birleşebiliyordu. Kullanıcı ayrıca doğal Türkçe metnin kısa zaman penceresine sığmadığını bildirdi. Mevcut hız/kırpma tek başına anlamı koruyarak çözmez.

Uygulama: devam cue'ları birleştirildi, yeni uzun cümle terminal noktada ayrıldı; kısaltmalar/üç nokta ve kısa replik bağlamı korundu. Kaynak SRT korunarak plan/grup/süre editörü ve mevcut sağlayıcı üzerinden tek grup kısaltma önerisi eklendi. Yalnız açıkça uygulanan metin ayrı hash-doğrulanan JSON ile sese gider. Sayı kaybı/uzayan yanıt reddedilir; anlam/isim/olumsuzluk insan kontrolündedir.

Kanıt: 10 Python testi, kontrollü servis/renderer akışları; gerçek Windows CUDA'da iki cue→tek grup→ayrı kısa metin WAV, 0hızlandırma/0kırpma. Canlı sağlayıcı çıktısı ve uzun video kalitesi doğrulanmadı. Bu değişiklik her metnin süreye kesin sığdığını garanti etmez.
