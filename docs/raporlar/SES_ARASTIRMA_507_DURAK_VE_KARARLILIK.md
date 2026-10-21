# Ses araştırması — durak, kısa replik ve üretim kararlılığı

2026-10-21. Önceki [121 kayıt](SES_ARASTIRMA_505_KAYNAKLAR.md) ve [18 ek kayıt](SES_ARASTIRMA_506_EK_KAYNAKLAR.md) üzerine aşağıdaki11 yeni çalışma/issue incelendi. ArXiv HTML/PDF veya arşiv/PDF eşleri ayrıca sayılmadı. Birleşik envanter **150 kayıt:134 erişilebilir/ilgili,11 erişilemeyen,5 konu dışı**. Bu150 tam makale okunduğu veya150 yöntem denendiği anlamına gelmez. İnceleme düzeyleri açıkça yazılıdır. Bu tur YouTube videosu izlenmedi, kaynaklardaki ses ekleri dinlenmedi.

| Yeni kaynak | İnceleme | Karar / sınır |
|---|---|---|
| [VoxCPM #297 — speech-rate control](https://github.com/OpenBMB/VoxCPM/issues/297) | Issue açıklaması | Anlatım hızını metin talimatıyla kesin kontrol etmek desteklenmiş bir çözüm değil. Mevcut Hi-Fi prompt'a okunabilecek üslup komutları eklenmedi. |
| [VoxCPM #262 — synthesis timbre differences](https://github.com/OpenBMB/VoxCPM/issues/262) | Açıklama ve contributor/topluluk yanıtları | Uzun temiz referans önerisi ile farklı kliplerin birleşiminde tutarsızlık deneyimi birlikte okunmalı. “Daha uzun referans her zaman daha iyi” sonucu çıkarılmadı; LoRA başlanmadı. |
| [VoxCPM #357 — very short Polish utterances](https://github.com/OpenBMB/VoxCPM/issues/357) | Repro ve workaround karşılaştırmaları | Çok kısa repliklerde ek hece/sözcük riski. İşarette daha az duplication ile algılanan doğallık çelişebiliyor; TR'ye tire/tırnak hilesi varsayılan eklenmedi. Bu kullanıcının Türkçe model sonucu olarak sunulmadı. |
| [VoxCPM #361 — four-character cloning](https://github.com/OpenBMB/VoxCPM/issues/361) | Issue ve yanıtları | PyTorch/nano-vLLM/vLLM omni'de kullanıcı bildirimi; Türkçede doğrulanmış kök neden sayılmadı. Ses dosyaları açılıp dinlenmedi. |
| [Inter-sentence Pause Durations, Owoicho 2024](https://www.isca-archive.org/speechprosody_2024/owoicho24_speechprosody.pdf) | Özet/giriş ve tartışma/sonuç bölümleri | İnce durak değişiminden büyük doğallık artışı beklemek kanıtlı değil. Perde/ritim/bağlam ayrı değerlendirilmeli; tüm seslere sabit ek sessizlik basılmadı. Bulgular İngilizceye ait, Türkçe için birebir eşik çıkarılmadı. |
| [Pause Prediction from Text, Braunschweiler 2016](https://www.isca-archive.org/interspeech_2016/braunschweiler16_interspeech.html) | Arşiv özeti | Noktalama-only baz çizgisinden iyi phrase modelleri var; mevcut noktalama sezgisi öğrenilmiş prosodi tahmini diye sunulmadı. |
| [Pause duration prediction for Mandarin, Tao 2006](https://www.isca-archive.org/tal_2006/tao06_tal.html) | Arşiv özeti | Fonetik ve bağlamsal etkenler önemli. Mandarin eşiklerini Türkçe sisteme kopyalamadık. |
| [ParaTTS](https://arxiv.org/html/2209.06484v1) | III-A mimari/III-D pozisyon yaklaşımı ve özet | Cümle pozisyonu ve ayrı dil/prosodi ağları eğitim gerektiriyor. Mevcut modele opening/final token eklemek bu araştırmanın uygulanması değildir. |
| [Cross-Utterance BERT Embeddings](https://arxiv.org/html/2011.05161v1) | §3.2–3.3 ve özet | Önceki/sonraki bağlam ayrı encoder ile decoder'a katılıyor. Hi-Fi prompt dökümüne ilgisiz komşu metin eklemek aynı yöntem değildir. |
| [Style-specific Pause Duration, Parlikar 2012](https://www.isca-archive.org/interspeech_2012/parlikar12_interspeech.pdf) | Giriş, subjektif sonuçlar ve sonuç | Stil, durak dağılımını etkiliyor; tek ortalama durak yeterli değil. Çalışmanın CART modeli kurulmadı; noktalama hedeflerinin optimal olduğu iddia edilmedi. |
| [Inhalation breath pauses, Braunschweiler 2013](https://www.isca-archive.org/ssw_2013/braunschweiler13_ssw.pdf) | Özet/giriş | Sessizlik, nefes ve gürültü ayrıdır. Zayıf nefesleri silen agresif kapı/trim veya yapay nefes eklemesi yapılmadı. Tam model uygulanmadı. |

## Uygulamada işe dönüştürülen sonuç

Her örnekte daha çok aday üretmek hızı düşürür ve iyi aday garantilemez. Zaten mevcut olan sınırlı yeniden denemenin kararını sağlamlaştırdık: bütün ortak anlam kontrollerini geçen aday seçilir; yalnız daha yüksek metin benzerliği yetmez. Başarısız isteğe bağlı deneme önceki kullanılabilir sesi silmez. ASR sonucu dinleyici doğallık puanına çevrilmez.

Perde ölçümü için önceki açık kontrol bu tur gerçek Windows ortamında ayrı proje JIT önbelleğiyle tekrar yapıldı. Sonuçlar Rapor507'de; üretim varsayılanları tek örneğin sayısal skoruyla değiştirilmedi.
