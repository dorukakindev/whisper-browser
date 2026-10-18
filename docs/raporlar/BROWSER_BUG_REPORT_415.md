# Rapor 415 — Taşma nedeniyle hazır dublajın tamamlanamaması

2026-10-14. Kullanıcı 123/123 üretilmiş grup sonrası 75 grup pencereye sığmadığı için final WAV'ın yazılmamasını bildirdi ve taşsa da çıktı istedi. Kök neden --tasarsa hata varsayılanı ve main'in açık devam seçeneği göndermemesiydi.

Çözüm: arayüz açık --tasarsa kirp gönderir; dış aracın CLI ve build_timeline varsayılanı da kirp oldu. Tempo sınırı ve kullanılabilir boşluk korunur; kalan konuşma sonu yumuşak kesilir, grup/örnek sayısı raporlanır, WAV oluşturulur. Kullanıcı isterse CLI --tasarsa hata katı davranışı seçebilir. Bu, model/CUDA/disk hatasında hiç ses yokken ses üretme garantisi değildir.

Hedefli Node servis testi ve 5 Python zamanlama testi geçti. Yeni regresyon gerçek timeline fonksiyonunda iki taşan konuşmaya rağmen dolu ses ve kırpma raporu döndüğünü doğrular. Sözdizimi/diff geçti. Dış araç yedekli güncellendi, kaynak SHA256 eşitliği doğrulandı; paket değişmedi.

Kullanıcının başarısız işindeki 123 önbellek parçası yeniden GPU üretimi olmadan birleştirildi: 327 cue→123 grup; 106 hızlandırılan, 75 kırpılan; WAV 1057.52sn / 48000Hz, yaklaşık0.6dk işlem. Kişisel ses/manifest/loglar Git dışında. Yeni GUI E2E/dinleme/YouTube testi yapılmadı; önceki GitHub kimlik doğrulaması/CI engeli sürüyor.
