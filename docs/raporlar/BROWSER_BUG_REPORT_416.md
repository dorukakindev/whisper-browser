# Rapor 416 — VoxCPM2 hız ve dublaj kalitesi araştırması

2026-10-14. Kullanıcı mevcut ses hattının daha hızlı ve kaliteli nasıl olacağını araştırmamı istedi. Bu çalışma inceleme/öneridir; üretim ayarları veya paketler değiştirilmedi, yeni GPU benchmark yapılmadı.

## Yerel kanıt

Kurulu nano-vllm-voxcpm2.0.4 ve voxcpm2.0.3. Altyazı profili15diffusion adımı, cfg1.65, temperature0.8,4eşzamanlı grup,2048model/batch token,1024üretim token; ref latent/prompt iş başında hazırlanır. CUDA graph enforce_eager=False zaten açık.

uret() yalnız akustik kusurda değil, required_speed>1.15 olduğunda da farklı seed ile en fazla üç deneme yapar. Metnin zaman penceresine göre uzun olması tek başına yeniden sentezle çözülemeyebilir. Deneme sayılarının toplam üretim süresindeki gerçek payı şu an ölçülmedi; üç kat toplam hız iddiası yok.

Son gerçek123grup timing_report'u:106tempo,75konuşma kırpması,48000Hz üzerinden43.98sn toplam kesilen ses, en büyük tek taşma3.15sn;17grupta taşma1sn üzeri. Bu kesilen kelime sayısı değildir, ses süresidir. Başlangıç ham ses/pencere oranı medyan1.1401. Teorik ham oran eşiğini aşan grup sayısı1.15→59,1.20→44,1.25→26,1.30→17. FFmpeg gerçek çıktı/padding farkları nedeniyle bu sayılar nihai kırpma sayıları değildir; yalnız tarama. Kişisel içerik/rapor Git'e alınmadı.

## Öncelik sırası

1. Süre taşmasını akustik kusurdan ayır: sırf uzun diye üç sentez denemesi yerine düzgün ilk üretimi sakla; bozuk/boş/tekrarlı seste kalite denemesi sürsün. Gerçek kazanç retry sayacı/süreyle ölçülmeli.
2. Zamanlamayı iyileştir: gerçek sessizlikleri daha esnek dağıt, cümle sonlarına göre grupları düzelt; isteğe bağlı1.20–1.25tempo tavanını kısa dinleme örneğinde karşılaştır. Fazla tempo ve kesme kalite ödünleridir. Gerekirse ayrı, kullanıcıya gösterilen dublaj metni kısaltması; asıl SRT sessizce değiştirilmez. Kesmeden, yavaş doğal konuşmayla, sabit kısa pencereye sınırsız metin sığdırma garantisi mümkün değildir.
3. Hızlı10adım / kaliteli15adım profili: resmî model10adımla örneklenir; adım azalması LocDiT işini azaltır, toplam süreyi aynı oranda azaltma garantisi yok. Kullanıcının sesiyle kısa A/B gerekir.
4.4→8paralellik kontrollü ölçülsün:12GBkartta16varsayılan yapılmasın. Resmî nano benchmark4090/24GB ve farklı concurrency metrikleri,4070SUPER için hız tahmini değildir. KV cache, batch token ve graph bellek bütçesi birlikte değerlendirilir.
5. Tekrarlayan kısa işlerde motoru sıcak tut: yükleme/graph hazırlığı amortize edilir; boşta GPU belleğini bırakacak zaman aşımı ve Whisper ile mevcut karşılıklı kilit gereklidir. Tek uzun işte kazanç daha küçüktür.

Önceki ses cache anahtarı üretim ve yerleştirme ayarlarını birlikte içeriyor (max_hiz dahil); bunları ayırmak, yalnız tempo değişikliğinde gereksiz yeniden sentezi önler. FFmpeg her tempo grubu için ayrı süreç/disk dosyası kullanır; son birleştirmede optimizasyon fırsatı var ancak GPU sentez süresine etkisi ayrıca ölçülmeli.

Hi-Fi referans+tam döküm korunsun. Kaynak model bunu en yüksek benzerlik için öneriyor. Daha temiz ve hedef tempoya yakın referans farklı bir deney olabilir; yeni eğitim/LoRA ilk adım değil. Kurulu2.0.4'te de bulunan prefill graph havuzunun yaklaşık2.5GBek VRAM kullanabildiği upstream notu nedeniyle12GBortamda graph/batch ayarları dikkatle ölçülmeli. Araştırmada güncel2.0.5 sürümü görüldü: ölü işçide hızlı hata ve ilk ses gecikmesi iyileşmesi var; H800metni-only ölçümü bizim Hi-Fi uzun iş süremize genellenemez. İzole uyum denemesi olmadan güncelleme yapılmadı. vLLM-Omni mevcut varsayılan tarifinde24GB/Linux doğrulaması var; sırf hız için çalışan Windows motorunu taşımak bu aşamada gerekçelendirilmedi.

## Birincil kaynaklar

- [OpenBMB VoxCPM2 model kartı](https://huggingface.co/openbmb/VoxCPM2):10adım hız/kalite dengesi, Hi-Fi referans+döküm, kontrollü klonlama.
- [nano-vLLM-VoxCPM kaynak/benchmark](https://github.com/a710128/nanovllm-voxcpm):eşzamanlılık, CUDA/Windows, prompt API,4090ölçümleri, ek graph bellek notu.
- [nano-vLLM2.0.5 sürümü](https://github.com/a710128/nanovllm-voxcpm/releases/tag/v2.0.5):ilk ses ve işçi hata yönetimi; bizim ortamda kurulmadı/ölçülmedi.
- [Resmî VoxCPM nano dağıtım belgesi](https://voxcpm.readthedocs.io/en/latest/deployment/nanovllm_voxcpm.html).
- [vLLM-Omni VoxCPM2 tarifi](https://github.com/vllm-project/vllm-omni/blob/main/recipes/OpenBMB/VoxCPM2.md):sıcak/soğuk motor farkı; sonuçlar bizim kart için ölçüm değildir.
