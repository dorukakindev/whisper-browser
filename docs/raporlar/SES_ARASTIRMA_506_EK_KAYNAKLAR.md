# Ses sürekliliği araştırması — ek inceleme

2026-10-21. [Önceki 121 kayıt](SES_ARASTIRMA_505_KAYNAKLAR.md) tekrar yeni kaynak sayılmadı. Bu tur aşağıdaki 20 çalışma/depo incelendi; 2'si önceki listededir, 18'i yenidir. Bir makalenin özet/HTML/PDF adresleri tek çalışma sayılır. Birleşik envanter **139 kayıt: 123 erişilebilir/ilgili, 11 erişilemeyen, 5 konu dışı**. Bu sayı 139 tam makalenin okunması veya 139 yöntemin uygulanması anlamına gelmez. Derinlik sütunu özellikle bu ayrımı gösterir. YouTube videosu izlenmedi.

| Kaynak | İnceleme düzeyi | Uygulamaya etkisi / sınır |
|---|---|---|
| [Evaluating Long-form TTS, Clark 2019](https://www.isca-archive.org/ssw_2019/clark19_ssw.pdf) | Yöntem ve deney düzeni, özellikle §3–4 | Tek cümle puanı paragraf deneyimini temsil etmiyor. Önceki ses karşılaştırmaları insan dinleme değerlendirmesi yerine sunulmadı. |
| [Paragraph-based Prosodic Cues, Farrús 2016](https://www.isca-archive.org/speechprosody_2016/farrus16_speechprosody.pdf) | Giriş, bulgular, tartışma ve sonuç | F0, enerji ve durak değişimi söylem yapısını da gösterir; tüm perde değişimlerini düzleştirmek yanlış olur. Ölçüm aracı otomatik ret/efekt uygulamıyor. |
| [Using Prosody to Classify Discourse Relations](https://www.isca-archive.org/interspeech_2017/kleinhans17_interspeech.html) | Arşiv özeti | Söylem ilişkileri tek perde sayısına indirgenmedi; bu çalışmanın sınıflandırıcısı kurulmadı. |
| [Long-Prompt Zero-Shot TTS](https://arxiv.org/html/2610.19774v1) | §2.2 değerlendirme ve §3.1 mimari | Tempo, durak, vurgu, tonlama ve kimlik ayrı. Uzun prompt için yeni eğitilmiş encoder gerekir; VoxCPM2'ye 10 dakikalık referans vermekle aynı yöntem olmaz. TR değerlendirmesi yok. |
| [Exact Prosody Cloning](https://arxiv.org/abs/2206.12229) | Özet tekrar incelemesi; önceki kayıt35 | Kimlik ve prosodi ayrımı; yeni kaynak sayılmadı, modeli kurulmadı. |
| [Mega-TTS 2](https://arxiv.org/abs/2307.07218) | Özet | Çoklu referans/prosodi encoder'ı modele özgü; mevcut nano-vLLM API'sine parametre ekleyerek taklit edilmedi. |
| [Expressive Neural Voice Cloning](https://arxiv.org/abs/2102.00151) | Özet | Speaker, pitch contour ve style token koşullaması eğitim gerektiriyor; mevcut ağırlıklara sahte kontrol etiketleri eklenmedi. |
| [TED-TTS](https://aclanthology.org/2026.acl-long.1077/) | Anthology sayfası/özet | PDF 20MB boyut sınırına takıldı; tam teknik yöntem okunmuş sayılmadı. Eğitim gerektirmeyen kontrolün her motora aynı biçimde uygulanacağı varsayılmadı. |
| [The Breath Segment in Expressive Speech](https://aclanthology.org/O07-3002/) | Bibliyografik ön eleme | Tam makale incelenmedi; bu kayıttan nefes ekleyen bir algoritma çıkarılmadı. |
| [Evaluating TTS from a Large Discrete Token-based SLM](https://aclanthology.org/2024.lrec-main.573.pdf) | §2–3 seçili yöntem bölümleri | Anlaşılırlık, konuşmacı tutarlılığı, prosodi ve dinleme ayrı eksenler. Bark sonucu VoxCPM2 sonucu diye aktarılmadı. |
| [Long-Context Speech Synthesis with Context-Aware Memory](https://www.isca-archive.org/interspeech_2025/li25b_interspeech.html) | Arşiv özeti | Gerçek hafıza bloğu ve attention değişikliği gerektirir; kelime bağlamı birleştirmek aynı yöntem değildir. |
| [Incorporating Prosodic Events in TTS](https://www.isca-archive.org/speechprosody_2022/sloan22_speechprosody.html) | Arşiv özeti | Phrase break/pitch accent modeli eğitilmeden VoxCPM2 girişine ToBI benzeri simgeler basılmadı. |
| [Automatic Prosody Annotation](https://arxiv.org/abs/2206.07956) | Özet | Metin-ses sınır etiketleyicisi, salt noktalama sezgisinden farklıdır. Bizim düzeltme öğrenilmiş nefes sınırı tahmini değildir. |
| [Adversarial Speaker-Consistency Learning](https://arxiv.org/abs/2210.05979) | Özet | Eğitim kaybı değişimi; bu tur eğitim yapılmadı. |
| [StyleTTS](https://arxiv.org/abs/2205.15439) | Özet | Ayrı stil temsili ve aligner modele özgü; çalışan VoxCPM2 değiştirilmedi. |
| [Seed-TTS](https://arxiv.org/abs/2406.02430) | Özet tekrar incelemesi; önceki kayıt94 | Model/eğitim sonucu mevcut sisteme atfedilmedi; yeni kaynak sayılmadı. |
| [Speech Is More than Words](https://aclanthology.org/2024.wmt-1.119/) | Anthology özeti | Metin-only çeviri kaynak sesin bütün prosodisini taşıyamaz. Türkçe hattında tonun eksiksiz korunduğu iddia edilmedi. |
| [Seamless Communication](https://github.com/facebookresearch/seamless_communication) | README/kurulum ön elemesi | Expressive speech translation farklı model hattı; kurulmadı. README'de AutoPCP için arama eşleşmedi; çalıştırılmış bir AutoPCP puanı yok. |
| [Seed-TTS Eval](https://github.com/BytedanceSpeech/seed-tts-eval) | README Metrics/Code bölümleri | WER ile WavLM speaker SIM farklı ölçümler. WavLM modeli indirilmedi; F0 speaker SIM diye adlandırılmadı. |
| [Beyond Prompt Adherence](https://arxiv.org/html/2608.00545v1) | §3 eşli özellik analizi, §7.3 sınırlar | VoxCPM2 dahil eşli örneklerde bir özelliği değiştiren kontrol başka özellikleri de etkileyebiliyor. 3 seed/çoklu metin, içerik ve kimlik kapıları önemli; bizim 3 pasajlık tek-seed deneyi genel üstünlük kanıtı değildir. |

## Bu tur verilen kararlar

1. Cümle ortası kesme sayısını azalt; sonra istek sayısı ve dengeli boyutu optimize et. Karakter/süre/konuşmacı sınırları korunur. Bu bir metin planlama düzeltmesidir, yukarıdaki öğrenilmiş modellerin uygulanması değildir.
2. Hata kurtarmasında orta bölgedeki tamamlanmış cümleyi, daha yakın virgülden önce tercih et. Kelime atma/yeniden yazma yok.
3. Sabit continuation deneyinin gerçek altı WAV'ında pYIN, enerji ve tempo ölç. F0/enerji farkına bakarak otomatik kazanan seçme; tüm parçaların aynı tonda olması da doğal anlatım demek değildir.
4. Varsayılan CFG/temperature veya ses referansını tek örneğe dayanarak değiştirme. Üretim modeli ve dış motor dosyaları korunur.
5. Öğrenilmiş konuşmacı benzerliği, doğru hizalanmış vurgu ölçümü ve Türkçe paragraf dinleme değerlendirmesi hâlâ ek çalışma gerektirir. Bunları yapılmış göstermiyoruz.
