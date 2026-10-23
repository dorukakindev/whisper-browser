# YouTube Türkçe dublajını doğal duyurma — araştırma ve uygulama

2026-10-24. Kullanıcının hedefi kelime kelime okuma veya her cümlede sesin sıfırlanması yerine tutarlı bir dublaj performansı. Bu çalışma birincil model belgelerini, uygulama kodunu ve dublaj/TTS araştırmalarını karşılaştırdı; kişisel ses kullanılmadan yerel GPU denemesi yaptı. Çok sayıda bağlantı saymak yerine ürün kararını destekleyen kaynaklara odaklandı. Aşağıdaki öneriler araştırmadan çıkarımdır; kaynak sonuçlarının bizim Türkçe uygulamamızda ölçülmüş sonucu oldukları iddia edilmez.

## Kaynakların pratik karşılığı

| Birincil kaynak | Bulgudan çıkarılan ürün kararı |
|---|---|
| [OpenBMB model kartı](https://huggingface.co/openbmb/VoxCPM2) ve [resmî kullanım rehberi](https://voxcpm.readthedocs.io/en/latest/usage_guide.html) | Referansın ses kimliği ile eşleşen dökümle sağlanan devam bağlamı farklı koşullandırmalardır. Stil kontrolü ve Hi-Fi modu aynı davranış sayılmaz. Doğru döküm ve temiz referans önemlidir; yalnız CFG/adım artırarak doğallık garantilenmez. |
| [VoxCPM2 teknik raporu](https://arxiv.org/html/2606.06928v1) | Modelin ayrı referans kanalı ve doğal dilde stil kontrolü var. Bu, video duygusunun otomatik ve eksiksiz aktarılması anlamına gelmez. Metindeki anlamsal/prozodik bağlamı korumak gerekir. |
| [Nano-vLLM ana deposu](https://github.com/a710128/nanovllm-voxcpm) | Hız motoru ile model kalitesi ayrı değerlendirilmelidir. Kurulu sürümün VoxCPM2 API'si yerelden de okundu; orijinal motor dosyaları değiştirilmedi. |
| [Human dubbing/TACL2023](https://aclanthology.org/2023.tacl-1.25/) | İnsan dublajlarını inceleyen çalışma doğal ses ve çeviri kalitesinin salt karakter eşleme veya ağız senkronundan daha önemli olduğuna işaret eder. Anlamı budamak/hızı zorlamak yerine mevcut tam konuşma/video yavaşlatma varsayılanı korunur. |
| [Prosodic alignment/Interspeech2020](https://www.isca-archive.org/interspeech_2020/federico20_interspeech.html) | Durak ve hizalamanın birlikte ele alınması önemlidir. Kaynak anlam blokları, kaynak boşlukları ve noktalama ayrı düşünülmeli; her SRT satırı ayrı oyunculuk başlangıcı sayılmamalıdır. |
| [Duration-based translation/EMNLP2025](https://aclanthology.org/2025.emnlp-demos.37/) | Süreye duyarlı çeviri bir araştırma yaklaşımıdır; karakter sayısı tam ses süresi değildir. Gerçek üretilmiş süreyle ölçme yaklaşımı korunur, Türkçe kalite ölçülmeden katı fonem/karakter kotası eklenmez. |
| [Multi-sentence TTS/Interspeech2022](https://arxiv.org/abs/2206.14643) | Daha uzun bağlamın tutarlı prozodiye katkısını inceler. Bizde tam düşünceli280 karakterlik akıcı gruplama korunur; tüm paragrafı sınırsız isteğe çevirmek kurulu modelin erken bitme riskini artırabileceği için varsayılan yapılmaz. |
| [FFmpeg loudnorm](https://ffmpeg.org/ffmpeg-filters.html#loudnorm) | `linear=true` tek başına sabit kazanç garantisi değildir; LRA veya true-peak koşulu sağlanmazsa dinamik moda döner. Bu tur gerçek ölçümle doğrulanan dinamik bozulmanın doğrudan açıklaması budur. |
| [WhisperX ana deposu](https://github.com/m-bain/whisperX) ve [Oxford makalesi](https://robots.ox.ac.uk/~vgg/publications/2023/Bain23/) | Kelime hizalama ince zamanlama içindir; tek başına duygu veya doğal oyunculuk üretmez. Dil modeli, çakışan konuşma ve hizalanamayan sözcük sınırları vardır. |
| [IndexTTS2 araştırma makalesi](https://ojs.aaai.org/index.php/AAAI/article/download/40820/44781) | Ses kimliğini duygudan ayırma ve süre kontrolü ilgi çekici yaklaşımlardır. Bu mimari fikirler bizim Türkçe VoxCPM2 hattında denenmiş başarı sayılmaz; bu tur yeni model kurulmadı veya motor değiştirilmedi. |

## Bu tur somut uygulananlar

1. Son dosyada sessiz/vurgulu bölümleri farklı sıkıştıran gizli loudnorm dinamik geri dönüşü kaldırıldı. R128 ölçümünden sonra tek sabit kazanç uygulanır; hedef −20 LUFS, tepe sınırı −2 dBTP. Gerekirse genel seviye daha düşük kalır; ifade farkları korunur.
2. Kaynak anlatımı haritasında hiçbir güvenilir ölçüm yoksa Hi-Fi prompt artık devre dışı bırakılmaz. Tüm oturum aynı referans koşullandırmasını korur ve kullanıcı uyarılır. Karışık geçerli/bilinmeyen haritada ise oturum içinde modu değiştirmeyen önceki referans-only davranışı korunur.
3. Dublaj metni düzenlemesi, ünlemi silen veya yeni ünlem uyduran yanıtı kabul etmez. Soru koruması zaten vardı. Editöre doğal durakları koruma, hedef bir parçaysa komşudan cümle tamamlama yapmama ve oyunculuk etiketi eklememe talimatı eklendi. Bunlar niyet korumasıdır; tam semantik eşdeğerlik ispatı değildir.
4. Türkçe SRT'nin denetimi `language=tr` ile yapılır. Kısa seslerde otomatik dil tahmini gereksizdir. Beklenen metin ASR'ye prompt olarak verilmez; sözcük denetimi bağımsız kalır. Genel CLI auto desteğini korur.

Kod ve regresyon kanıtı: [Rapor531](BROWSER_BUG_REPORT_531.md). Önceki528–530 onarımları aynı PR481'de korunur.

## Gerçek GPU denemesi

Bu makinede `nvidia-smi`: NVIDIA GeForce RTX4070SUPER,12282MiB. PyTorch2.8.0+cu128, CUDA kullanılabilir; model revizyonu `32279effe8c19989596f05d353d1447f51d9e915` önbellekteydi. Hiçbir yeni indirme/bağımlılık kurulmadı. Kişisel referans yerine modelle yeni bir anlatıcı sesi ve12.64sn Türkçe referans üretildi; referans ASR/semantik denetimi geçti. Bu ses gerçek bir kişiden alınmadı.

15 adım, CFG1.65, temperature0.8, seed42, tek eşzamanlı istek; aynı sentetik referansla iki metin, Hi-Fi ve reference-only karşılaştırıldı:

| Metin | Mod | Ses süresi | Üretim+ASR ölçüm süresi | Ham akustik puan | Sözcük/semantik denetim |
|---|---|---:|---:|---:|---|
| Öyle mi? Buna gerçekten inanıyor musun? | Hi-Fi |5.52sn|13.438sn|0|passed, benzerlik0.9231|
| Aynı soru | reference-only |3.52sn|9.187sn|0|passed,1.0|
| On iki kişinin katıldığı deneyin sonucu henüz kesinleşmedi. Bu yüzden biraz daha beklememiz gerekiyor. | Hi-Fi |7.52sn|15.391sn|0|passed,1.0|
| Aynı anlatım | reference-only |6.72sn|13.703sn|0|passed,1.0|

Ardından aynı dört dosya yeni `language=tr` worker yolundan tekrar okundu;4 yanıtın4'ü kullanılabilir ve4 sözcük denetimi de passed. Karşılaştırmada Hi-Fi daha uzun okudu; bu tek başına daha iyi/kötü demek değildir. ASR benzerliği de doğal ses veya ses kimliği puanı değildir. Parametreler bu dört örnekten otomatik kazanan seçilerek değiştirilmedi.

Yerel ve Git dışı kanıtlar: `tmp/dub531-gpu.py` deney betiği, `tmp/dub531-gpu2.log`, `tmp/dub531-gpu2/results.json`, `anchor-check.json`, `turkish-checks.json`, sentetik WAV'lar ve dinlenebilir `listen.html`. İlk deneme betiği kurulu pool'da olmayan sample_rate alanını doğrudan okudu; üretimde zaten kullanılan48000 fallback ile betik düzeltildi ve tekrar çalıştırıldı. Bu deney betiği hatası ürün bugı sayılmadı. İşler bitti, model süreci kapandı; son VRAM ölçümü yaklaşık2015MiB idi. Medya ve ham log Git'e eklenmedi.

## Kaliteyi ileri taşımanın doğru ölçütü

İnsana benzerliği yalnız otomatik testle kesinleştiremeyiz. Sonraki ses değerlendirmelerinde aynı kısa metin ve aynı referans kullanılmalı, örnekler benzer ses düzeyinde ve mümkünse mod adı görünmeden dinlenmeli. Sorular, sakin anlatım, heyecan, teknik adlar, sayılar ve uzun cümlelerden ayrı örnekler gerekir. Kelime/olumsuzluk/ad kaybı, ton sıçraması, nefes kesilmesi, yorgunluk ve ortam karışımı ayrı değerlendirilir. ASR yanlış sözcüğü bulabilir; doğal oyunculuğu garanti edemez.

Bir sonraki daha büyük kazanım için gerekli kanıt: gerçek kaynak konuşmadaki vurgu/durakları sözcük hizalamasıyla bağlamak, bunun Türkçe anlam birimlerindeki karşılığını bulmak ve aynı referans kimliğinde kaynak üslubunu yönlendirmek. Mevcut enerji/perde değişimi/boşluk haritası kaba akustik yönlendirmedir; öfke, ironi, üzüntü veya sözcük vurgusunun eksiksiz aktarımı değildir. Bunun üzerine ölçülmemiş duygu etiketi üretmek bu tur yapılmadı. Gerçek Türkçe kör dinleme örneklerinde kazanç gösterilmeden yeni model, sabit seed veya daha yüksek CFG varsayılanı dayatılmadı.
