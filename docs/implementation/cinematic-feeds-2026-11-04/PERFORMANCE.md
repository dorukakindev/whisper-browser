# Akışlar — kısa native ölçüm

Gerçek Electron/main/preload, GPU açık, 121 kontrollü kayıt, ilk 100 satır. Odak/görünürlük her ölçümde true. rAF aralıklarıdır; GPU render süresi veya kapsamlı akıcılık garantisi değildir. Her etkileşim yaklaşık 1 saniye ölçüldü. Yenileme cevabı kontrollü 450ms; internet gecikmesi ölçülmedi.

| Etkileşim/genişlik | Ortalama ms | p95 ms | Maksimum ms |
|---|---:|---:|---:|
| scroll-1440 | 6.94 | 7.00 | 7.10 |
| switch-1440 | 6.94 | 7.10 | 7.10 |
| filter-1440 | 7.18 | 7.10 | 27.80 |
| refresh-1440 | 7.30 | 7.10 | 34.80 |
| scroll-1920 | 7.19 | 7.10 | 34.70 |
| switch-1920 | 6.94 | 7.00 | 7.10 |
| filter-1920 | 7.07 | 7.10 | 18.03 |
| refresh-1920 | 7.14 | 7.00 | 27.80 |

Bazı maksimumlar 20ms hedefini geçiyor; geçti diye gösterilmedi. Kullanıcının yeni kararıyla ekran teslimini bloke etmiyor. [Ham ölçüm](performance.json), [Chromium trace gzip](interactions.trace.json.gz). Trace 37010 olay içerir. İlk görsel incelemeden sonra dış kabuğun çift boşluğu, masaüstü geri bağlantısı, tekrarlı satır animasyonu ve makale açmada bütün listenin yeniden kurulması düzeltildi. content-visibility ve lazy görseller var; animasyonlu blur yok.

## CPU

6 saniyelik kısa boşta örnekleme: Electron app.getAppMetrics() süreç yüzdelerinin ham toplamları: 3.130, 0.058, 0.075, 0.044, 0.031, 0.051. İlk değer ilk ölçüm çağrısının başlangıç aralığını içerir; kalanlar yaklaşık 1s aralıklıdır. Bu değerleri eski 60s, sistem genelinde normalize CPU kabulüyle eşitlemiyorum. Fan/güç tüketimi veya bütün GPU kartı ölçülmedi.

Ölçümden sonraki son revizyon yalnız boş/yükleme/dar durum rötuşları ve menü hover/klavye kontrolüdür; son native görüntü seti bunları kapsar. O son revizyonun CPU/frame ölçümü yeniden tekrarlanmadı. Uzun CI/Actions çalıştırılmadı.
