# Rapor 417 — Dublaj hız profilleri ve daha az konuşma kırpması

2026-10-14. Kullanıcı araştırmadaki ilk dört öneriyi ve uygun ek iyileştirmeleri uygulamamı istedi. Aynı OpenBMB/VoxCPM2 + nano-vLLM Hi-Fi referans/döküm hattı korunmuştur.

## Kök nedenler ve değişiklik

- Üretici temiz ses yalnızca pencereye sığmadığı için de yeniden sentezliyordu. Akustik kalite değerlendirmesiyle süreye sığdırma ayrıldı. En fazla üç deneme sadece akustik kusurlarda; ilk temiz sonuçta durur, en iyi geçerli kalite sonucu seçilir. Geçersiz ses başarılı sayılmaz.
- Sabit 1.15 tempo / 1000ms boşluk bütçesi konuşmayı çok kesiyordu. Artık azami 1.25 tempo, sonraki gruba taşmadan 2000ms gerçek boşluk ve yalnız ihtiyaç varsa önceki bitmiş konuşmayla çakışmayan en fazla 300ms erken başlangıç. Video başı/sonu sınırları korunur. Orijinal SRT değiştirilmez; manifest gerçek yerleşimi yazar.
- Arayüzde Kaliteli15 / Hızlı10 adım ve 4 / 8 paralel grup seçimi. Varsayılan15/4, cfg1.65 ve temperature0.8 değişmez. Seçimler kaydedilir, iş sırasında kilitlenir. Hızlandırılan/kırpılan grup sayısı görünür.
- v3 konuşma önbelleği zamanlama ve batch kapasitesinden ayrıldı. Tempo/boşluk/paralellik değişince tekrar ses üretilmez; aynı içerik/üretim kimliğiyle eşleşen v2 varsayılan sesleri kopyalayarak kullanır, eski önbellek silinmez.
- Ek: tek istekte180sn sınır, model/referans/üretim süreleri ve deneme sayıları generation_report ve uygulama loguna; ana süreç yalnız izinli sayısal metrikleri alır. Hazır önbellekte0deneme bilgisi kaydedilir.

## Gerçek Windows GPU ölçümü

RTX4070SUPER12GB, aynı kişisel referans/döküm ve ilk24cue→11grup, her profil için boş ayrı test önbelleği. Sesler ve özel içerik Git dışında. Normalizasyon kapalı, paketler değiştirilmedi. Üç kısa tek koşu; tam-video performans veya dinleme kalitesi garantisi değil.

| Profil | Toplam saniye | Model hazırlığı | Sentez saniye | Deneme / ek deneme |
| --- | ---: | ---: | ---: | ---: |
| 15 adım / 4 grup | 65.812 | 15.407 | 45.812 | 11 / 0 |
| 10 adım / 4 grup | 45.891 | 10.813 | 31.891 | 11 / 0 |
| 15 adım / 8 grup | 42.797 | 11.813 | 27.641 | 11 / 0 |

8grup sırasında gözlenen toplam GPU bellek11625MiB; bu tepe ölçümü değildir. Bellek dar olduğu için varsayılan4korundu. 10/8 birleşimi gerçek GPU'da ayrıca ölçülmedi. Ses benzerliği/doğallık kullanıcı dinlemesiyle değerlendirilmeli; onlara ilişkin ölçülmüş iyileşme iddiası yok.

Aynı önceki123önbellek sesinde kırpılan grup75→44; kesilen ses43.979→14.740sn.16grup en fazla300ms erken başladı. Yeni1057.52sn WAV yerelde ocean_dublaj_akilli_20261014_1340.wav adıyla oluşturuldu; yeni GPU sentezi guard ile yasaktı. Kırpma azaldı, tamamen kalkmadı. 15/4 test önbelleğini 15/8 ve başka tempo/boşlukla tekrar kullanma ayrıca doğrulandı:11hazır,0üretim.

## Diğer doğrulama / kaynaklar

8Python zamanlama/kalite tekrar testi ve Node dub-service geçti; locale, preload/innerHTML ratchet, browser-dub-audio, sözdizimi/diff geçti. Windows Chrome gerçek renderer/CSS + fixture API1400/720px profil seçimi/IPC, grup ilerlemesi, süre/iptal ve kayıt görünürlüğü;0sayfa hatası/bulgu. pip check temiz. Dış iki araç yedekli güncellendi; SHA256 repo kopyalarıyla eşit.

Yeni start.bat/Electron canlı UI+GPU uçtan uca, dinleme/ASR doğruluk testi ve tam test paketi koşulmadı. Windows CI önceki hesap engeli nedeniyle doğrulanmadı.

Birincil kaynaklar: [OpenBMB kullanım kılavuzu](https://voxcpm.readthedocs.io/en/latest/usage_guide.html)10adım, kısa metin kararlılığı, Hi-Fi kontrol komutlarını yok sayması; [nano2.0.5](https://github.com/a710128/nanovllm-voxcpm/releases/tag/v2.0.5)işçi hata/ilk ses iyileştirmesi; [FFmpeg atempo](https://ffmpeg.org/ffmpeg-filters.html#atempo). Kurulu nano2.0.4/voxcpm2.0.3 ve Windows uyumlu bağımlılıklar korunmuştur. Paket yükseltmesi, LoRA eğitimi, denoise veya kullanıcı metnini otomatik kısaltma bu işte yapılmadı.
