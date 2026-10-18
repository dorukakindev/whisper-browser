# Rapor 420 — Gerçek OmniVoice Türkçe/CUDA denemesi

2026-10-15. Kullanıcı OmniVoice denemesini ve gerekli indirmeleri onayladı. Ayrı ortamda gerçek ses üretimi tamamlandı; Whisper ürününün varsayılan motoru değiştirilmedi.

## Kurulum

Python3.11 ayrı venv: ignored tmp/omnivoice-trial/.venv. Resmî PyTorchcu128 kaynağından torch/torchaudio2.8.0+cu128; PyPIomnivoice0.2.1, transformers5.19.0, safetensors0.8.0, numpy2.4.6, soundfile0.14.0. Tam bağımlılık freeze yerelde. OmniVoice ve mevcut Voxvenv pipcheck temiz; CUDA/import doğrulandı. Mevcut VoxCPM2/Chatterbox paketleri değiştirilmedi.

Resmî model: k2-fsa/OmniVoice, revision c5fdb5ccb189668d56333f77ba2629f4cd7535f4. Ana safetensors2450344112byte; SHA256730839316de585f4c8298ec0e1712efc10fb19c6fa4e36eb741cb8d51ebcf6aa resmi LFS oid ile eşit. Tokenizer/config dosyaları da indirildi. HFhub0.36normal indirmesi ana dosyada bekledi; yalnız kendi indirme süreci durduruldu, aynı resmî dosya HTTPS ile indirilip boyut/hash doğrulandı. XETkapalı. Modeller/runtime/kişisel sesler Git dışında.

## Deneme

RTX4070SUPER12GB, aynı19.392sn Türkçe referans ve tam döküm. Test metni18kelimelik iki cümle. Referans sağlandığı için model içi ASRindirmesi/yüklemesi yok. fp16/SDPA,32adım, aynı seed; postprocess_output=False/padding0. Sonradan atempo veya konuşma kırpması uygulanmadı.

| Çıktı | Gerçek ses süresi | Sentez süresi | Küçük yerel ASR WER |
| --- | ---: | ---: | ---: |
| Omni normal | 9.04sn | 1.961sn | %16.7 |
| Omni hedef10 | 10.00sn | 1.603sn | %5.6 |
| Omni hedef6 | 6.00sn | 1.458sn | %38.9 |
| VoxCPM2 aynı metin | 8.96sn | 17.110sn üretim aşaması | %0 |

Omni model yükleme3.818sn, referans hazırlama0.990sn. PyTorchaktif tepe~2234MiB, ayrılmış tepe7738MiB; toplam WindowsGPUkullanımı değildir. VoxCLIbenzeri iş toplam39.516sn, model18.047/ref3.062sn. Bunlar tek kısa koşu ve farklı motorun farklı üretim ayarlarıdır; uzun videoda sabit hız oranı/bütüncül kalite üstünlüğü iddia edilmez.

WhispersmallCPU/int8yerel kontrolünde normal çıktıda 'ama acımız' ve 'süreyi' gibi tanıma farkları vardı. Bu belirsizlik için yalnız normal ve sıkışık6snörnek WhispermediumCPUile tekrar incelendi: normalWER%5.6 ('süreye'→'süreyi'); hedef6WER%33.3. Her iki model hedef6'da ilk6kelimelik cümleyi bulamadı. Bu somut metin koruma riski: sabit süreye tam sığma, bütün kelimelerin okunduğunu garanti etmiyor. ASRölçümü insan dinleme/ses benzerliği değerlendirmesi değildir.

Çıktılar ignored tmp/omnivoice-trial/results/{normal,hedef10,hedef6}.wav; Voxkarşılığı voxcpm-baseline/voxcpm.wav. Özel referans/döküm/sesler veya ham loglar yayımlanmadı.

## Teslim ve sınırlar

tools/omnivoice/trial.py yeniden çalıştırılabilir yerel karşılaştırma; README ve doğrudan bağımlılık pinleri eklendi. Gerçek3Omni+1Voxses üretimi, yerelASR, pipcheck/derleme/diffkontrolü yeterli hedefli kanıt; tam testpaketi/UI/start.bat/WindowsCIkoşulmadı. Ana arayüze OmniVoice entegrasyonu veya SRTtamvideoüretimi yapılmadı. İlk referans19.4sn, upstream3–10sntavsiyesinden uzun; kısa/doğru dökümlü referans ve kullanıcı dinlemesi sonraki kalite adımı. Beklenmedik dosya üzerine yazma engeli var.
