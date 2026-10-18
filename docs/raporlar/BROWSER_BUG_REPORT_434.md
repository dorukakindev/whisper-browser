# BROWSER_BUG_REPORT_434 — YouTube referans ses bağlantısı

Kullanıcı 10:18–10:35 seçtiğinde genel hazırlanamadı mesajı alıyordu. Aralık geçerliydi; yerel olay kaydı FFmpeg extract aşamasında başarısızlığı gösterdi.

1. **Doğrulandı/düzeltildi:** FFmpeg doğrudan CDN bağlantısı -138 ile başarısızken Python aynı ses kaynağına HTTP206 ile erişti. Seçilen bölüm Python üzerinden tokenlı loopback Range köprüsüyle aktarılıyor. Aynı videoda17.0sn WAV ve CUDA dökümü201 karakter başarıyla üretildi. Alt ağ/proxy engelinin kesin bileşeni belirlenmedi.
2. **Doğrulandı/düzeltildi:** backend/Node/UI üç noktada hata nedenini gizliyordu. URL'siz kontrollü tanı protokolü ve textContent ile görünür neden eklendi; önemli mesajlar TR/EN.

Regresyonlar: Python4/4; Node process/UI/service/locale/dub-generator/DOM; Electron bridge; syntax/compile/diff. Gerçek Electron ayrı profil ekran görüntüsüyle hata/yeniden deneme/use akışı incelendi (hazırlama kontrollü yanıt). Canlı backend denemesi ayrıca gerçek YouTube + GPU ile yapıldı. Genel CI kullanıcı talimatıyla incelenmedi.

Dosyalar/kanıt/sınırlar: [devir](../devir/2026-10-15-2326.md). Özel ses ve ham loglar Git dışında.
