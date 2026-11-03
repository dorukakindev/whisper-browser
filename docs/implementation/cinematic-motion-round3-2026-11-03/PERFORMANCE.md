# Native hareket performansı — Round 3

2026-11-03 · Windows · gerçek Electron ana süreci, preload ve renderer. İzole test profili, kontrollü metadata/görseller; canlı sağlayıcı veya kişisel profil kullanılmadı.

**Sonuç:** İki genişlikte de kesintisiz 60 saniyelik Ken Burns koşulu doğrulandı ve ortalama uygulama CPU kullanımı %3 altında kaldı. **Hiçbir frame aralığı 20 ms üzerinde olmasın hedefi karşılanmadı.** Ortalama ve p95 değerlerinin düşük olması bu maksimum ihlallerini ortadan kaldırmaz.

## Donanım ve ölçüm yöntemi

- İşlemci: AMD Ryzen 5 7500F 6-Core Processor; 12 mantıksal işlemci.
- GPU: NVIDIA GeForce RTX 4070 SUPER; ANGLE Direct3D11. Tam GPU bilgisi ham kayıtlarda bulunur. GPU compositing etkin.
- Test içerik alanı: 1440×1080 ve 1920×1080. Bağlı ekranlar 2560×1440 ve 1920×1080, 144 Hz; ölçek 1. Test renderer DPR değeri 1.
- Hareket modu Tam. Bu masaüstü donanımından orta sınıf dizüstü bilgisayar sonucu çıkarılmadı.
- Frame tablosu gerçek renderer `requestAnimationFrame` callback aralıklarıdır; GPU render süresi veya bir GPU zamanlayıcı ölçümü değildir. Her etkileşim yaklaşık 1,2 saniye örneklendi; iki rAF ile başlangıç hazırlandı. p95 en yakın üst sıra yöntemiyle hesaplandı.
- CPU: Electron uygulama süreç ailesinin kümülatif CPU-saniye farkı / geçen süre / 12 × 100. Tablodaki ortalama, 60 adet yaklaşık bir saniyelik örneğin ortalamasıdır. Ham Electron yüzdeleri de korunur. Dış PowerShell sayaç okuyucusu uygulama CPU ailesine dahil değildir.
- GPU: Windows `Win32_PerfFormattedData_GPUPerformanceCounters_GPUEngine` sayacından yalnız bu testin Electron GPU PID kimliğiyle eşleşen motorlar okundu. Yaklaşık 5 saniyede bir 12 örnek. Her örnekte uygulamanın en yoğun motoru alındı. **Tüm ekran kartı kullanımı veya motorların toplamı değildir.** Sayaç tam sayı yüzdesi döndürür; düşük değerler bu çözünürlükle okunmalıdır.
- Idle sırasında her saniye gerçek pencere odağı, document.hidden, hero görünürlüğü, data-motion-active ve çalışan cn-breathe denetlendi. Her iki kabul edilen kayıtta 60/60 kontrol aktif; geçersiz örnek sayısı sıfır. Test penceresinin geçici üstte kalması yalnız ölçüm düzeneğidir.
- GPU tam tanılama sorgusu frame pencerelerinden çıkarıldı; etkileşimlerden sonra çalışır. Daha önce sorgunun hemen arkasında görülen ~201 ms değerleri son frame tablosuna alınmadı.

## Frame aralıkları

İlk detay açılışını içeren soğuk UI yolu korunur. Yüksek maksimumlar ayıklanmadı veya birkaç sıcak tekrarın en iyi sonucu seçilmedi. İki genişliğin ayrı native kayıtları kullanıldı. 1440 kaydı ilk iki genişlikli çalışmanın ilk genişliğidir; aynı çalışmanın sonradan odak belirsizliği oluşan 1920 satırları kullanılmadı. 1920 için odak/görünürlük alanları eklenmiş ayrı doğrulama kaydı kullanıldı.

| Genişlik | Etkileşim | Örnek | Ortalama ms | p95 ms | Maksimum ms | >20 ms örnek | Maksimum hedefi |
|---|---|---:|---:|---:|---:|---:|---|
| 1440 | Hero geçişi | 169 | 7.150 | 7.000 | 34.700 | 1 | Aşıldı |
| 1440 | Kart hover | 172 | 7.067 | 7.000 | 14.300 | 0 | Geçti |
| 1440 | Hero görünürken Home kaydırma | 166 | 7.281 | 7.000 | 27.700 | 2 | Aşıldı |
| 1440 | Ortak afiş / detay geçişi | 152 | 8.086 | 7.000 | 90.300 | 3 | Aşıldı |
| 1440 | Akordeon açılışı | 174 | 6.986 | 7.000 | 14.100 | 0 | Geçti |
| 1920 | Hero geçişi | 175 | 6.984 | 7.000 | 14.000 | 0 | Geçti |
| 1920 | Kart hover | 168 | 7.234 | 7.000 | 27.800 | 2 | Aşıldı |
| 1920 | Hero görünürken Home kaydırma | 164 | 7.412 | 7.000 | 34.800 | 2 | Aşıldı |
| 1920 | Ortak afiş / detay geçişi | 147 | 8.267 | 7.100 | 97.200 | 4 | Aşıldı |
| 1920 | Akordeon açılışı | 174 | 6.986 | 7.000 | 14.100 | 0 | Geçti |

Tüm p95 değerleri 7,0–7,1 ms civarındadır; 144 Hz ekranın yaklaşık 6,94 ms temel aralığıyla birlikte okunmalıdır. Özellikle ilk detay sayfasının açıldığı ortak afiş yolunda maksimumlar yüksektir. Bu tekil kayıtlar gecikmenin script, görsel çözme, yerleşim, sürücü veya GPU kaynaklı olduğunu tek başına ayırmaz. Kesin bir 60 FPS / 20 ms garantisi verilmez.

## Ken Burns açıkken 60 saniye idle

| Genişlik | Ölçülen süre s | Aktif kontrol | Ortalama CPU % | Maksimum 1 sn CPU % | GPU yoğun motor ort. % | GPU motor maks. % | Ortalama CPU <3% |
|---|---:|---:|---:|---:|---:|---:|---|
| 1440 | 60.660 | 60/60 | 1.404 | 3.427 | 0.917 | 2.000 | Geçti |
| 1920 | 60.647 | 60/60 | 2.485 | 8.869 | 0.083 | 1.000 | Geçti |

CPU ortalaması hedefin altında olsa da tek saniyelik yükselmeler vardır; tablodaki maksimumlar saklanmadı. Bu test sıcaklık, fan sesi veya uzun süreli termal dengeyi ölçmez. GPU değerleri uygulamanın süreç bazlı motor sayaçlarıdır.

## Uygulanan maliyet düzeltmeleri ve sınırlar

- Kaydırma sıfırdayken filtre `none`; etkisiz `blur(0px)` katmanının maliyeti taşınmıyor. Kaydırma bulanıklığı gerektiğinde korunuyor.
- Ortak afiş geçişinde tüm kök sayfa View Transition snapshot maliyeti kaldırıldı; afişe ait hareket korunuyor.
- Grain 64×64 önbellekli doku, baskın renk küçük örnekleme/önbellek ve görünmez/odaksız hero duraklatma yaklaşımı korunuyor. Efektler sırf test sonucu için kapatılmadı.
- Bu düzeltmelerin bulunduğu native kaynak yeniden ölçüldü. Değişikliklerin tek tek etkisini ayıran kontrollü A/B deneyi yapılmadı; önceki odak kayıplı idle kayıtları iyileşme yüzdesi hesaplamak için kullanılmadı.
- İlk denemelerde pencere gizlendiğinde Ken Burns beklendiği gibi durdu. Bu duraklamalı örnekler kesintisiz 60 saniye başarısı sayılmadı. Kullanıcının ayırdığı sessiz masaüstü aralığında alınan son 1920 kaydı 60/60 aktiftir.
- Native kapanışta konsolda `GPU state invalid after WaitForGetOffsetInRange` uyarısı görüldü. Çıkış kodu 0 ve kayıtlar tamamlandı; uyarının kök nedeni bu işte ayrıştırılmadı. GPU/sürücü davranışının bütün koşullarda sorunsuz olduğu iddia edilmez.
- 20 ms üst sınırı hâlâ aşılmaktadır. Bu sonuç tam hedef başarısı veya orta sınıf dizüstü bilgisayar doğrulaması olarak sunulmamalıdır.

## Ham kanıtlar ve yeniden çalıştırma

- [idle1440-1793686660078.json](performance-raw/idle1440-1793686660078.json): Yalnız 1440 idle satırı kabul edildi; aynı ham dosyanın 1920 idle satırı geçersizdir.
- [idle1920-1793687153591.json](performance-raw/idle1920-1793687153591.json): 1920 idle: 60/60 aktif.
- [frames1440-1793687372367.json](performance-raw/frames1440-1793687372367.json): Yalnız 1440 frame satırları kullanıldı.
- [frames1920-1793687461179.json](performance-raw/frames1920-1793687461179.json): 1920 frame: her etkileşim sonunda focused=true, hidden=false, motion=full.

Ham JSON dosyaları kaynak kayıtlarının değiştirilmemiş kopyalarıdır. Kaynak SHA-256 değerleri her kaydın sources alanındadır. Genişlikler ayrı izole native çalışmalardan seçildi. Dört kayıtta cinema-motion.js, cinema-motion.css ve media-discovery-ui.js SHA-256 değerleri aynıdır. Son 1920 frame kaydında film katmanı cinema-ui.js değişmiştir (önce e80e53e1f6…, sonra e5e5c4a60e…); dolayısıyla tüm dosyaları aynı olan tek revizyonlu bir karşılaştırma iddiası yoktur. Kişisel profil kullanılmadı.

```powershell
# ELECTRON_RUN_AS_NODE ortam değişkeni çocuk süreçten silinmelidir.
node -e "const env={...process.env};delete env.ELECTRON_RUN_AS_NODE;const c=require('node:child_process').spawn(require('electron'),['tests/electron-cinema-performance.smoke.js','--preview-assets=D:/Whisper Local/artifacts/cinematic-proposal-v2-2026-11-03','--widths=1440,1920','--frames-only'],{stdio:'inherit',env});c.on('exit',code=>process.exit(code??1))"
```

Her genişlikte 60 saniye idle için `--frames-only` kaldırılır; yalnız idle için `--idle-only` kullanılır. `--widths=1920` tek genişliği seçer. `--idle-seconds=8` ve `22` yalnız tanılama içindir, 60 saniyelik kabul yerine geçmez. Tam test 180 saniyede sınırlanır. Native pencerenin ölçüm boyunca görünür ve odaklı kalması gerekir.
