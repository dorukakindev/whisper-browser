# Round 4 — gerçek Windows Electron ölçümü

İzole profil ve kontrollü metadata. 144Hz, Ryzen5 7500F / RTX4070 SUPER, DPR1. rAF callback aralıkları ölçüldü; GPU render süresi değildir. CPU, yalnız Electron süreç ailesinin CPU-saniyesi / süre /12 mantıksal işlemci. GPU, yalnız test GPU PID motorlarının en yükseğinin Windows tam sayı sayacı; bütün ekran kartı yüzdesi değil.

**20ms maksimum hedefi sağlanmadı.** Üst sınır değiştirilmedi. Önce kapalı alanların kurulumu ertelendi, sonra canvas renk örneklemesi ilk görüntü yüklemesinden idle kuyruğuna taşındı. İkinci kare ölçümü aşağıda. Sıcak tekrarların en iyisi seçilmedi.

| Genişlik | Etkileşim | Ortalama ms | p95 ms | Max ms | Odak |
|---|---|---:|---:|---:|---|
| 1440 | hero-crossfade | 6.98 | 7.00 | 13.90 | Geçerli |
| 1440 | card-hover | 7.20 | 7.10 | 21.20 | Geçerli |
| 1440 | home-scroll-hero-visible | 7.28 | 7.00 | 34.80 | Geçerli |
| 1440 | shared-poster-transition | 8.15 | 7.10 | 83.30 | Geçerli |
| 1440 | accordion-open | 6.94 | 7.00 | 7.10 | Geçerli |
| 1920 | hero-crossfade | 6.94 | 7.00 | 7.10 | Geçerli |
| 1920 | card-hover | 6.99 | 7.00 | 14.20 | Geçerli |
| 1920 | home-scroll-hero-visible | 6.94 | 7.00 | 7.10 | Geçerli |
| 1920 | shared-poster-transition | 7.23 | 7.00 | 48.60 | Geçerli |
| 1920 | accordion-open | 6.99 | 7.00 | 14.10 | ODAK YOK — kabul dışı |

1920 akordeon tekrarında focus=false, dolayısıyla bu satır başarı kanıtı değildir. İlk ölçümde aynı satır odaklı: ortalama6,99 / p957,00 / max14,20ms; bu eski runtime satırı yeni ölçüm diye sunulmaz. İlk ölçümde detay max83,30 /55,60ms, yeni ölçümde83,30 /48,60ms. Karşılaştırma tek başına nedensel performans kazanımı kanıtı değildir.

## Son 60 saniye aktif hero

| Genişlik | Süre | Kesintisiz aktif | CPU ortalama | GPU motor ortalama | GPU motor max |
|---|---:|---|---:|---:|---:|
| 1440 | 60.58s | Evet | %1.316 | %3.833 | %7 |
| 1920 | 60.57s | Evet | %1.254 | %0.250 | %2 |

CPU%3 hedefi iki genişlikte de sağlandı. Pil donanımı, fan/ısı veya orta sınıf laptop doğrulaması yapılmadı. GPU sayaç sürecinin maliyeti Electron CPU ailesine dahil değildir. Kapanışta GPU state invalid after WaitForGetOffsetInRange uyarısı kaydedildi; kök nedeni ayrıştırılmadı, sürücü kusursuzluğu iddia edilmez.

Ham JSONlar değiştirilmeden korunur. Motion/Home hashleri kayıtların sources alanında. Sonraki iki satırlık eksik kaynak yerleşimi düzeltmesi idle yolunu değiştirmez; bütün ürün dosyaları tek byte-identik revizyon olarak sunulmaz. Sonraki source-picker/eksik mesaj kolonu görüntüyle ayrı doğrulandı.

Yeniden çalıştırma: Electron ile tests/electron-cinema-performance.smoke.js --preview-assets="D:/Whisper Local/artifacts/cinematic-proposal-v2-2026-11-03" --widths=1440,1920. --frames-only yalnız kareler; --idle-only yalnız60s. ELECTRON_RUN_AS_NODE çocuk süreçten çıkarılmalı. Pencere görünür ve odaklı kalmalı; odaksız veri kabul edilmemeli. Actions kullanılmadı.
