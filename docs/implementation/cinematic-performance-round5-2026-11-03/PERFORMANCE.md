# Round 5 — performans kabulü GEÇMEDİ

Ürün kodu: `d53ffb5a65e724afce52696bafa08657ab97a5dd`. Başlangıç/master: `922f5474c517e15d9fb060633605dd0267d62f86`. Bu paket tamamlanmış performans düzeltmesi değildir. Ana dala merge edilmedi. Maksimum20ms hedefinin fiziksel olarak imkânsız olduğu kanıtlanmadı; kalan iş vardır.

## Yöntem

Gerçek Windows Electron, GPU açık, izole kontrollü profil ve78 devam kaydı. Tablo rAF callback aralıklarıdır; GPU render süresi veya beş belirli kare gerçekten kayboldu iddiası değildir. Trace başlangıcı ölçümden önce; `cinema-frame-gap` kullanıcı zamanlaması son kayıtta bulunur. İzler Chromium içerik izleme API’sinden alınmıştır. Kaynak hashleri JSON’da. Hiçbir kişisel anahtar, canlı sağlayıcı veya kişisel profil kullanılmadı.

Tablo her hücrede **ortalama / p95 / maksimum ms** gösterir. Önceki83ms, önceki turdaki ayrı7-kayıt koşumudur; bu tur aynı78 başlangıcının1440 detayı62,5ms idi. 1920 başlangıcı önceki sayfa konumunu devralıyordu; sonraki fixture geri dönüş öncesi üst konumu korur. Bu nedenle1920 önce/sonra eşdeğer soğuk açılış kabul edilmez. 1920 ayrıca1440’dan sonra çalıştığı için cache sıcaklığı farklıdır.

|Genişlik|İşlem|Önce avg/p95/max|Son avg/p95/max|Son max<20ms|
|---|---|---|---|---|
|1440|hero-crossfade|7.28 / 7.00 / 48.50|6.98 / 7.00 / 13.80|PASS|
|1440|card-hover|7.19 / 7.10 / 27.80|6.94 / 7.10 / 7.10|PASS|
|1440|home-scroll-hero-visible|7.32 / 7.00 / 34.70|7.32 / 7.00 / 55.50|FAIL|
|1440|shared-poster-transition|8.22 / 7.10 / 62.50|7.84 / 7.00 / 69.50|FAIL|
|1440|taste-accordion-open|6.94 / 7.00 / 7.10|6.94 / 7.00 / 7.10|PASS|
|1440|viewing-accordion-open|7.19 / 7.00 / 27.70|7.23 / 7.10 / 41.70|FAIL|
|1440|detail-back|6.98 / 7.00 / 13.90|6.98 / 7.00 / 13.90|PASS|
|1920|hero-crossfade|7.15 / 7.00 / 41.70|7.07 / 7.00 / 27.80|FAIL|
|1920|card-hover|6.99 / 7.00 / 14.20|6.95 / 7.00 / 7.10|PASS|
|1920|home-scroll-hero-visible|7.11 / 7.00 / 14.00|6.95 / 7.10 / 7.10|PASS|
|1920|shared-poster-transition|7.24 / 7.00 / 34.60|7.06 / 7.00 / 20.90|FAIL|
|1920|taste-accordion-open|6.94 / 7.00 / 7.10|6.94 / 7.00 / 7.10|PASS|
|1920|viewing-accordion-open|7.03 / 7.00 / 14.10|6.94 / 7.00 / 7.10|PASS|
|1920|detail-back|7.02 / 7.00 / 14.20|6.94 / 7.00 / 7.10|PASS|

Bütün son p95 değerleri16,7ms altında. Maksimumlar hedefi geçmiyor: özellikle1440 detay69,5ms ve kaydırma55,5ms. Daha önceki denemede detay27,8ms ve scroll13,9ms görüldü; o sürümdeki renderer fetch mimari kural nedeniyle kaldırıldı. İyi denemenin sayısı son ürünün başarısı diye sunulmaz. Ham son değerler yukarıdadır.

## Trace ile doğrulanan yollar

- Başlangıçta idle callback küçük olsa da ardından `Decode LazyPixelRef / Decode Image` renderer ana thread üzerinde yaklaşık29–30ms sürüyordu.16×16 canvas tek başına çözüm değildi.
- Son kod büyük HTML görsellerini bitmap’e kopyalamaz: küçük mevcut afiş veya güvenilir CDN’nin küçük görsel adresi,400.000 piksel üst sınırı,16×16 bitmap,4s timeout ve disposal. Uygulama renderer’ında yeni fetch/IPC açılmaz. Son trace ana thread uzun işleri listesinde o30ms JPEG görevi yok; bu bütün aralığın çözüldüğü anlamına gelmez.
- `scan` içindeki segment ölçüleri stiller yazıldıktan sonra layout tetikliyordu. Okumalar yazımlardan ayrıldı, rAF’a taşındı, aynı seçim tekrar ölçülmez; ResizeObserver boyut değişiminde yeniden hizalar.
- `.cn-film-page[open]` gerçek section sayfasını bulmuyordu. `.open` özelliği kontrol edilir; detay açıkken gizli Keşfet taranmaz.
- Round4 yalnız kapalı alanın görsel adaptörünü erteliyordu; gerçek izleme/günlük veri istekleri ve formları açılışta kuruluyordu. İlk ilgili toggle’a kadar hiç başlatılmaz; tekrar açışta ikinci istek seti yok, geç sonuçlar disposal sonrası uygulanmaz.
- Afiş shared geçişi600ms FLIP transform overlay olarak korunur; rota yazımıyla hedef ölçümü iki ayrı kareye ayrıldı. Geri/Escape yolu ve cleanup korunur.
- Kaydırma bulanıklığı değişen filtre yarıçapıyla değil sabit yumuşak görsel katmanı/opaklıkla sağlanır. Pahalı katmanları söküp geri kurma denemesi de geç tepeler üretti; cam/grain Full modda sabit bırakıldı.
- Son ölçümde kalan compositor/ilk stil-yerleşim/katman commit maliyeti vardır. Son trace’te BeginMainFrame~21ms, Microtasks~8,4ms, UpdateLayoutTree~6,4ms, scan~5,5ms örnekleri görülür; bunlar iç içe sürelerdir, birbirine eklenmez ve tek başlarına69,5ms rAF aralığını açıklamaz. GPU sürücüsü kök nedeni kanıtlanmadı.

## Hareket koruması

Aktif hero/etkileşimde2s pencere; en az20 örnek, aralıkların%10’undan fazlası25ms’yi aşarsa yalnız oturumluk Azalt profili. Küçük durum bildirimi ve Tam harekete dön düğmesi var. Kullanıcının kalıcı hareket seçimi değişmez. Azalt önce grain/blur/Ken Burns maliyetini kaldırır; Kapalı korunur. Son ölçümlerde mod Full kaldı: fallback başarısız sayıları gizlemedi.

## CPU/GPU

Geçerli60s örnekler:1440 CPU%1,770 / kendi GPU motor ortalaması%3,917;1920 tekrar CPU%1,629 / kendi GPU motor ortalaması%0,833.1920 tekrarında60,42s kesintisiz odak/Ken Burns doğrulandı. Önceki odak kayıplı1920 kaydı kabul edilmedi. **Bu60s ölçümler, son sabit yumuşama katmanı/küçük kaynak düzenlemesinden önceye aittir. Son ürün revizyonunun CPU/GPU kabul kanıtı değildir.** Tam board GPU ölçümü yapılmadı. CPU12 logical çekirdeğe normalize edilmiş uygulama süreç ailesidir; Windows counter utility haricidir.

## Görsel ve işlev

41 hedefli test geçti; son küçük kaynak değişiminden sonra9 hareket testi tekrar geçti. Native1440/1920+darda taşma kontrolü geçti, iki akordeon ve kaynak yok durumu yakalandı. Yeni dosyalar controlled metadata kullanır; gerçek Letterboxd/AI kalitesi sınanmadı. `native/frame-page-0/100/200/400/900.png` yaklaşık yakalama anlarıdır; capture maliyeti nedeniyle tam kare zamanlayıcı kanıtı değildir. Geçişte yakalama anlarında boş sayfa/çift afiş görülmedi; görüntüler estetik olarak tek tek gözden geçirilir, tüm FPS için kanıt sayılmaz.

Sabit yumuşama katmanının native görüntüleri son kaynak seçimi commit’inden önce alındı; bu son commit renk örnekleme kaynağını değiştirir. Byte-identik final görsel kabulü diye sunulmaz. Kapanıştaki `GPU state invalid after WaitForGetOffsetInRange` uyarısı kayıtta var ve çözülmüş değildir.

## Yeniden çalıştırma ve kalan iş

```powershell
node tools/cinema-performance-baseline.cjs 922f5474c517e15d9fb060633605dd0267d62f86
# Electron_RUN_AS_NODE kaldırılarak:
& "D:/Whisper Local/node_modules/electron/dist/electron.exe" tests/electron-cinema-performance.smoke.js --frames-only --trace --baseline-runtime
& "D:/Whisper Local/node_modules/electron/dist/electron.exe" tests/electron-cinema-performance.smoke.js --frames-only --trace
& "D:/Whisper Local/node_modules/electron/dist/electron.exe" tests/electron-cinema-performance.smoke.js --idle-only --widths=1920
```

Yerel kontrollü görseller verilmezse fixture depodaki demo görselini kullanır; aynı görsel dosyaları olmadan bu raporla sayısal kıyas yapılmaz. `--preview-assets=...` önceki kompozisyonun görsel klasörüdür. `.json.gz` izlerini açıp trace viewer/DevTools’ta incele. Uzun CI/Actions çalıştırılmadı.

**Kesin devam noktası:** son `trace-1440-shared-poster-transition` ve `trace-1440-home-scroll-hero-visible` işaretli aralıklarını renderer/compositor/raster thread’leriyle eşleştir; küçük thumbnail hazırlama, yeni sabit blur yüzeyi ilk raster’ı ve layout/commit fazlarını ayrı dene. Tek bir değişkene göre karşılaştır, hızlı denemeyi son sürüm yerine sunma. Son üründe60s iki genişlik ve final screenshot/hash eşleşmesi tekrar gerekiyor. Hedef geçmeden merge veya RSS/library/browser tasarım turu yok.
