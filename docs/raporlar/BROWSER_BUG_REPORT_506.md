# Rapor506 — Cümle sınırları ve prosodi araştırmasının derinleştirilmesi

2026-10-21. Başlangıç HEAD `bf4d4941961c08bd093f94eae9569ecf8feba08b`, önceki ürün kodu `765212c8b96ebe2b07a0c32fb736765dfd1e1248`. Dal `codex/broad-bugs499`, mevcut PR471. Çalışma ağacı başlangıçta temizdi. Ana kopya master'a veya dış VoxCPM2 motoruna yazılmadı.

## Araştırmanın kapsamı

[Ek kaynak matrisi](SES_ARASTIRMA_506_EK_KAYNAKLAR.md): 20 inceleme, bunların18'i yeni,2'si tekrar. Önceki listeyle139 kayıt,123 erişilebilir/ilgili kaynak. Bunlar139 tam makale değildir; inceleme derinliği her satırda yazılı. Yeni ana bulgu: konuşmacı kimliği, hız, durak ve vurgu farklı hedeflerdir; yüksek ASR başarısı veya tek bir düşük F0 farkı doğal paragraf anlatımı kanıtı değildir. Uzun prompt/memory modellerinin eğitim bileşenleri mevcut VoxCPM2'ye rastgele parametrelerle uygulanmadı.

## Doğrulanan ve düzeltilen davranışlar

###506-01 — Daha az istek uğruna düşünce ortasında bölme

`dub_timing._balanced_flow` önce grup sayısını, sonra cümle sonu cezasını minimize ediyordu. Altı yarım cümlelik deterministik örnekte önceki kod `[1,2,3] / [4,5,6]` üretiyor; ilk grup virgülde, ikinci cümlenin ortasında bitiyordu. Tamamlanmış düşüncelere göre `[1,2] / [3,4] / [5,6]` mümkündü.

Yeni sıralama: tamamlanmamış ara sınır sayısı → grup sayısı → boyut dengesi. Üst boyut/süre, konuşmacı, ara ve overlap sınırları korunur. Tek cue metni kırpılmaz; tüm source ID ve sözcükler korunur. Aynı örnek yeni kodda üç tamamlanmış cümleye ayrılıyor. Bazı girdilerde daha çok istek ve daha uzun üretim olabilir; kalite/hız değiş tokuşu bilinçlidir. Bu düzeltme öğrenilmiş prosodi veya anlamsal çözümleme değildir; noktalama sezgisidir.

###506-02 — Kurtarmada yakın virgülün cümle sonuna üstün gelmesi

`recovery_blocks` bütün noktalama işaretlerini eşit sayıp ortadakini seçiyordu. Ortaya daha yakın virgül, uygun tamamlanmış cümle sonunu geride bırakabiliyordu. Yeni tercih orta %20–80 aralıkta cümle sonu → yan cümle noktalamaları → kelime arasıdır; aynı sınıfta merkeze yakınlık seçilir. Türkçe kısaltmalar, baş harf, sayısal nokta ve kapanan tırnak/parantez dikkate alınır. Bütün kelimeler korunur. Her parçanın ve birleşik sesin mevcut ASR doğrulaması devam eder; başarısız aday kullanılmaz.

Ham ses önbelleği kimliği `dublaj-ses-v11-thought-boundaries` oldu. Eski üretilmiş dosyalar silinmez; yeni kuralla ilk üretim yeniden sentez gerektirebilir. Geçerli ses başka bir cümle planına aitmiş gibi yeniden kullanılmaz.

## Ölçüm aracı

`tools/voxcpm2/analyze_prosody.py`, önceki sabit bağlam deneyi JSON'unu ve onun klasöründeki WAV'ları okur. Ses değiştirme, referans değiştirme, uzak servise yükleme veya otomatik kazanan seçimi yok. Her dosya mono,8–192kHz,en çok30sn; en çok8 pasaj/4aday. Klasör dışına çıkan yol ve mevcut çıktı dosyasını ezme reddedilir.

- 20ms enerji çerçevelerinden kenar sessizliği dışındaki span ve sözcük/saniye; iç duraklar süreye dahildir.
- Aktif çerçeve medyan RMS dBFS ve enerji eşiğine göre sessiz oran.
- İsteğe bağlı mevcut librosa0.11.0 ile pYIN:16kHz,55–550Hz,1024 frame,160 hop; voiced,probability≥0.5 ve enerji filtresi. Güvenilir çerçeve yetersizse null.

Bu ölçümler VAD, speaker SIM, MOS veya gerçek dudak senkronu değildir. pYIN octave hatası yapabilir; aynı kişinin duygu/vurgu kaynaklı F0 değişimi kusur sayılmaz. Tüm perdeleri eşitleyen bir efekt eklenmedi. Yeni bağımlılık/model kurulmadı; pitch yalnız mevcut motor Python'undaki librosa'yı kullanır. Ürün ana backend'ine librosa gereksinimi eklenmedi.

## Doğrulama

- `backend/test_dub_flowing_groups.py`:6 geçti;60 yoğun-cue varyasyonu, kelime/ID/boyut/süre koruma, konuşmacı/aralık sınırları dahil.
- `backend/test_dub_recovery.py`:4 geçti; cümle/virgül tercihi, tam metin, parça+birleşik ASR kapısı ve geçici dosya temizliği.
- `backend/test_prosody_diagnostics.py`:2 geçti; kenar sessizliği, ses örneklerinin değişmemesi, sessizlik/NaN ve klasör dışı dosya reddi.
- `tests/test_dub_timing.py`:12 geçti; `tests/test_dub_generation_quality.py`:8 geçti.
- `node tests/dub-service.test.js`:geçti.
- Değişen7 Python dosyası py_compile ve `git diff --check`:geçti.
- Eski HEAD kaynak kodu doğrudan yüklenerek aynı fixture'da önce/sonra davranışı ayrıca karşılaştırıldı.

Yeni motor çıktısı üretilmedi; önceki505 turunda gerçek GPU ile üretilmiş altı WAV'ın enerji/tempo analizi tamamlandı (`tmp/report506/energy.json`, kişisel ses içermez ama deney çıktısı Git'e eklenmedi). Aynı metin için span üzerinden hızlar orijinal/sabit bağlam:2.5333/2.8529,2.0988/2.6480,1.8156/2.0249 sözcük/sn. Sabit bağlam yaklaşık%11.5–26.2 daha hızlı; bu doğallık üstünlüğü değildir.

pYIN altı WAV analizi ve1sn sentetik160Hz kontrolü birkaç dakika içinde tamamlanmadı; yalnız bu tur başlatılan hesaplama süreçleri durduruldu. Perde sonucu dosyası yok, perde testi başarılı sayılmadı. Windows JIT/sandbox etkisi ayrıştırılamadı. Ayrı proje önbelleğiyle sandbox dışı tek-saniyelik kontrol talebi otomatik onay incelemesi kullanım limiti nedeniyle çalıştırılmadı; güvensiz işlem kararı değildir. Enerji/tempo ölçümü geçti; isteğe bağlı `--pitch` gerçek çalışma süresi ve doğruluğu açık iştir.

Nihai doğal ses üstünlüğü/human listening/MOS/speaker embedding çalışması yapılmadı. UI değişmedi, görsel smoke tekrarlanmadı. Tam npm paketi, Windows start.bat/gerçek Electron YouTube/DRM/GPU sentez akışı bu tur tekrar çalıştırılmadı. CI açık kalır; bu tur sonucunu beklemedik ve başarı iddiası yok.
