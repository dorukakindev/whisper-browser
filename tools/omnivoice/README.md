# OmniVoice yerel denemesi

Mevcut VoxCPM2/Chatterbox ortamına kurulmaz. Ayrı Python3.11venv kullanılır.
CUDA PyTorch2.8.0+cu128 ve torchaudio2.8.0+cu128 önce resmî
https://download.pytorch.org/whl/cu128 kaynağından kurulmalıdır. Ardından
requirements-trial.txt bu ayrı ortamda kurulur. Model:
https://huggingface.co/k2-fsa/OmniVoice

Deneme model revizyonu: c5fdb5ccb189668d56333f77ba2629f4cd7535f4.
Model klasöründe audio_tokenizer ve metin tokenizer dosyaları da bulunmalıdır.
Model lisansı/kartı resmî kaynakta incelenebilir; kullanıcı sesleri kişiseldir.

```powershell
& 'tmp/omnivoice-trial/.venv/Scripts/python.exe' tools/omnivoice/trial.py --model 'tmp/omnivoice-trial/model' --reference 'referans.wav' --transcript 'referans.txt' --output 'tmp/omnivoice-trial/results'
```

Script aynı sesle normal,10snve6snhedef üretir; tümünde32adım ve aynı seed.
`--steps 16` hızlı profil denemesi, `--text-file` kendi metnin içindir.
Tam eşleşen referans dökümü verilir; referans için otomatik ASR indirilmez.
Postprocess silence trimming/padding kapatılır; sonradan atempo/kırpma yapılmaz.
Çıktıreport.json model/referans/sentez süreleri ve PyTorch bellek sayaçlarını
tutar. Sıkışık hedef anlaşılırlığı garanti etmez; sesler dinlenmeli veya yerel
ASR ile karşılaştırılmalıdır. Bellek sayaçları toplam WindowsGPUkullanımı değildir.
Var olan normal.wav üzerine yazılmaz; yeni karşılaştırmada farklı çıktı klasörü.

Ortam/model/kişisel ses çıktıları ignored tmp altında tutulur; Git'e eklenmez.
Bu araç Whisper arayüzüne ikinci motor entegrasyonu değildir, bağımsız denemedir.
