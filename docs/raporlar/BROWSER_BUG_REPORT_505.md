# Rapor505 — Geniş ses araştırması, sabit bağlam deneyi ve konuşma bütünlüğü

Başlangıç:8e28d797f72d4d4a279cc82cebe8e282ca1fd514 (temiz çalışma ağacı).
Bitiş ürün kodu:765212c8b96ebe2b07a0c32fb736765dfd1e1248.
Dal codex/broad-bugs499, PR471 devamı; master değiştirilmedi.

## İncelemenin gerçek kapsamı

Kullanıcı100–150 kaynağa kadar daha geniş araştırma ve uygulanabilir iyileştirme
istedi. [Kaynak matrisi](SES_ARASTIRMA_505_KAYNAKLAR.md)121 tekil URL içerir:
105 erişilebilir/ilgili kayıt,11 erişilemeyen adres,5 konu dışı kayıt.
22 kayıtta seçili teknik bölüm ve uygulama kararı notu bulunur. Kalanlar makale
özeti, README girişi, API veya standart katalog sayfası üzerinden ön elemedir.
Bu sayı100 tam makale,100 tam GitHub deposu veya izlenmiş100 video değildir.
ArXiv özet ve HTML sürümleri ayrı kaynak sayılmadı; tekrar açmalar da tek kayıttır.
Telifli tam metinler/ham web yanıtları depoya kopyalanmadı. Kaynaklarda görülen
kurulum/ajan komutları talimat kabul edilmedi; yalnız araştırma verisi olarak okundu.

## En önemli çıkarımlar

| Konu | Çıkarım | Bu turdaki karar |
|---|---|---|
| Çok cümle anlatımı | ContextSpeech ve çok-cümle TTS çalışmaları bağlamın önemini gösteriyor; model eğitimi de etkili. | Salt blok boyutunu büyütmeyi kalite garantisi saymadık. |
| Ses kimliği/üslup | VoxCPM2 prompt continuation ile isolated reference farklı kanallar. | Asıl referansın korunduğu sabit Türkçe bağlam denendi. |
| Uzun üretim | VoxCPM#302 ve LACI çalışması hem metin atlama hem ses kaymasını ele alıyor. | Çıktı bütünlüğü kontrolünü güçlendirdik; model içi LACI/latent anchor uygulamadık. |
| Prozodi aktarımı | Topluluk LoRA pipeline'ı carry-over/reground öneriyor. | Önceki çıktıları sınırsız zincirlemedik; tek sabit onaylı bağlamı kontrollü kıyasladık. |
| Hi-Fi kontrol etiketleri | Hi-Fi ve controllable modları aynı talimat davranışına sahip değil. | Hi-Fi metnine parantezli duygu yönergesi eklenmedi. |
| İnsan dublajı | Dubbing in Practice ses doğallığı/çeviri ile zaman sınırlarını birlikte değerlendirmeyi önerir. | Adaptive video modundaki doğal hız tercihi korundu. |
| Duraklar | Pause-aware dublaj ve çok-cümle çalışmalarında durak yerleri anlamlı. | Hata kurtarmasında noktalama ve mevcut kenar sessizliği dikkate alındı. |
| Doğallık ölçümü | TTSDS, NISQA ve MOS yöntemleri farklı boyutları ölçer. | ASR puanı doğallık/ses kimliği puanı diye sunulmadı. |
| Pitch | pYIN/Praat F0 hesabı konuşmacı benzerliği değildir. | Perdeyi düzleştiren, duyguyu silen otomatik düzeltme uygulanmadı. |
| Speaker similarity | ECAPA/WavLM tabanlı gömüler ve wSIM ayrı model ister. | Kurulmadı/ölçülmedi; benzerlik kazanımı iddia edilmedi. |
| Eğitim | Resmi VoxCPM2 LoRA örnek ayarında yaklaşık20GB VRAM, veri hazırlığı gerekir. |12GB kartta eğitimi başlatıp ortamı değiştirmedik; inference deneyi yaptık. |
| Windows | NeMo text normalization gibi paketlerde platform bağımlılıkları var. | Yeni bağımlılık/model kurulmadı; mevcut çalışan ortam korundu. |
| Alternatif modeller | Başka modelin ayarı VoxCPM'ye doğrudan taşınamaz. | Kullanıcının seçtiği VoxCPM2/nano-vLLM korundu. |
| Post-processing |48kHz çıktı, crossfade ve loudness üslup sürekliliğiyle aynı şey değil. | Konuşmayı bindiren crossfade veya gereksiz upsampler eklenmedi. |

Merkez kaynaklar:
[OpenBMB API](https://raw.githubusercontent.com/OpenBMB/VoxCPM/main/src/voxcpm/core.py),
[model çıkarımı](https://raw.githubusercontent.com/OpenBMB/VoxCPM/main/src/voxcpm/model/voxcpm2.py),
[nano-vLLM server](https://raw.githubusercontent.com/a710128/nanovllm-voxcpm/main/nanovllm_voxcpm/models/voxcpm2/server.py),
[uzun-form PR313](https://github.com/OpenBMB/VoxCPM/pull/313),
[re-entry tartışması](https://github.com/OpenBMB/VoxCPM/issues/302),
[pipeline ilgili kodu](https://github.com/r-huijts/voxcpm2-lora-pipeline/blob/main/scripts/02_generate_nanovllm.py),
[ContextSpeech](https://arxiv.org/abs/2307.00782),
[çok-cümle TTS](https://arxiv.org/abs/2206.14643),
[LACI](https://arxiv.org/abs/2609.16989),
[insan dublajı](https://aclanthology.org/2023.tacl-1.25/),
[pause-aware dublaj](https://aclanthology.org/2024.iwslt-1.2/).

## Üç metin × iki yöntem: gerçek GPU/ASR

RTX4070SUPER12GB, mevcut model revision32279effe8c19989596f05d353d1447f51d9e915,
15adım,CFG1.65,sıcaklık0.8,tohum42. YöntemA: orijinal prompt+orijinal ref.
YöntemB: önceden üretilmiş, yerel ASR'dan geçmiş12.564sn Türkçe prompt + aynı
orijinal ref. Her istekte aynı sabit bağlam; çıktılar birbirine zincirlenmedi.
Bağlamın ASR benzerliği0.963, passed. Anlatı, soru ve sonuç bildiren üç farklı
Türkçe pasaj aynı iki koşulda üretildi. Dış motor dosyalarına dokunulmadı.

| Pasaj | Orijinal süre | Sabit bağlam süre | Orijinal ASR benzerliği | Sabit bağlam ASR benzerliği |
|---|---:|---:|---:|---:|
| Anlatı |8.160sn|6.872sn|1.0000|0.9474|
| Soru |9.280sn|7.030sn|1.0000|1.0000|
| Sonuç |8.480sn|6.677sn|1.0000|1.0000|

Altısı da mevcut ASR kontrolünden geçti. Yeni tamamlama denetimiyle sesler CPU
üzerinde tekrar çözümlendi; altısı yine review=false. Ton/perde/kimlik/MOS
ölçülmedi. Daha kısa süre daha iyi doğallık veya daha hızlı model kanıtı değildir;
çıktı temposu değişmiştir. Bu nedenle sabit bağlam üretim varsayılanı yapılmadı.
İnsan kör dinleme onayı yok. Araç numaralı dinleme sayfası ve JSON verir; otomatik
kazanan seçmez. Bu, ContextSpeech/LACI entegrasyonu değil, inference denemesidir.

## İki uygulanmış iyileştirme

###505-01: Uzun cümlede eksik son/yan cümle genel benzerlikte gizlenebiliyordu

SequenceMatcher yalnız toplam benzerliği kontrol ediyordu.60 kelimeden son3'ü
okunmazsa benzerlik0.95 üzeri kalıyor ve eski0.85 kapısından geçebiliyordu.
Artık hizalamadaki sürekli kayıp/ekleme ayrı raporlanır: ortada en az4 net eksik
veya ek sözcük; en az10 sözcüklük hedefin baş/sonunda en az3 net eksik sözcük
inceleme gerektirir. ASR yazım farkı veya tek sözcük değişimi uzun atlama sayılmaz.
Omission/insertion span'leri ikinci aday kabulünde de korunur. Bu bulgu ASR
belirsizliğini ortadan kaldırmaz; metni otomatik değiştirmez, yeniden üretim veya
inceleme akışına yönlendirir. Cache davranışı v10; eski başarılı meta kayıtları
bu yeni kapının yerine geçmez. Eski ses dosyaları silinmez, ilk üretim pahalanabilir.

###505-02: Kurtarma parçalarına noktalama/kenar sessizliğinden bağımsız80ms ekleniyordu

Yeni birleştirme hedefleri: virgül120ms, nokta220ms, soru/ünlem240ms,
noktalı virgül/iki nokta180ms, devam80ms. Bunlar fizyolojik evrensel değerler
veya öğrenilmiş prozodi modeli değildir; küçük muhafazakâr ekleme hedefleridir.
Önceki parçanın sonu ve sonrakinin başında zaten bulunan yakın-dijital sessizlik
sayılır, yalnız eksik kadar eklenir. Daha uzun doğal durak, nefes ve konuşma
örnekleri silinmez; sesler bindirilmez. Eklenen süre kalite raporuna yazılır.
Bu işlem normal tüm seslere yeni efekt uygulamaz; hata kurtarma birleşimidir.

## Kanıtlar ve sınırlar

- backend/test_dub_completion.py:3 test geçti (yüksek toplam puanda eksik son,
  iç eksik/ek ifade ve sıradan ASR yazım farkı).
- backend/test_dub_recovery.py:3; tests/test_dub_quality.py:4;
  tests/test_dub_finish.py:5; tests/test_dub_generation_quality.py:8 geçti.
- backend/test_dub_flowing_groups.py:5, node tests/dub-service.test.js geçti.
- Yeni kapı önceki rapor504'teki4 gerçek ASR dökümüne uygulandı; yanlış yeni
  inceleme bayrağı üretmedi. Bu turun6 gerçek WAV'ı yeniden ASR'dan geçti.
- Beş değişen Python py_compile, karşılaştırma CLI --help ve diff kontrolü geçti.
-6 yeni gerçek GPU çıktısı üretildi. TTS bittikten sonra alt süreçler kapandı.
  CUDA warning'leri/tokenizer class warning önceki kurulu motorda da var;
  bu tur motor güncellemesi yapılmadı, dosyalar geçerli ve ASR'dan geçti.
- Yeni durak mantığı sayısal ses örnekleriyle sınandı; GPU yeniden üretimi bu
  ses örneklerini silmeyen ekleme işlemi için tekrar edilmedi.

UI yerleşimi değişmedi. Native ekran, start.bat tam açılış, gerçek YouTube/DRM,
speaker embedding/wSIM/MOS, çok referans/çok dil ve insan dinleme testi yok.
Tam npm test tekrarlanmadı, CI sonucu beklenmedi. Önceki PR Ubuntu CI kırmızısı
bu tur incelenmedi. Referanslar/ham sesler/dökümler/loglar Git'e konmadı.
Yerel kanıtlar tmp/report505/continuity, generation.log, checked-results.json,
recheck.log, completion-checks.json. Yeni bağımlılık/kurulum/eğitim yok.
