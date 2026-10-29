# Rapor766 — Kaynak anlatımı ile referans tonu gerçek GPU A/B

Başlangıç master `038092dc48ff387e95b05e9e8c8bfe413148212a`; kod/test bitişi `3bee5dd25abfe93566a1c97a110a4b3e1857f0c8`.

## Bu turun gerçek kapsamı

P039 bekleyen duygu A/B hedefinin teknik üretim kısmı yapıldı. Yeni ürün bugı uydurulmadı; mevcut otomatik-anlatım davranışı gerçek GPU ile ölçüldü. Kaynak gerçek insan duygu kaydı değildir: Microsoft Tolga ile üretilen üç ayrı Türkçe cümleye -1/0/+1 konuşma hızı ve .15/.5/1.0 kazanç uygulandı. Aynı sesin 18.409sn yerel kaydı kullanıldı. Analiz 3/3 grupta düşük/normal/yüksek enerji ve değişken ton yönlendirmesi çıkardı. Bu kontrollü akustik örnek, öfke/üzüntü veya insan duygusunun tanınması değildir.

## Yeni araç ve korunan motor

`tools/voxcpm2/compare_delivery.py`: yalnız açıkça çalıştırılan yerel A/B aracı. 3–8 kısa grup ve en fazla120sn kaynak; çıkış klasörü mevcutsa üzerine yazmaz. Girdilerin kopyaları/hashleri, gerçek prepare_prosody haritası, her iki üretimin quality/performance kayıtları ve ortak grafit/amber dinleme sayfası çıkar. Her moddan önce en az9500MiB boş GPU belleği aranır; başka uygulama kapatılmaz. Üretim mevcut `altyazi_oku.main` üzerinden geçer, motor dosyaları ve kişisel uygulama ayarları değişmez. Aynı SRT, referans/döküm, seed42,15adım, tek paralel grup, satır gruplama, ayrıntılı ASR ve video zamanlaması kullanıldı. CFG1.65 ve temperature0.8 mevcut üretim varsayılanlarıdır. Kaynak-anlatım modunun reference-only koşullandırması ve dinamiği koruyan son işlemi de deneyin parçasıdır; yalnız bir tag'in nedensel deneyi değildir.

`tests/test_delivery_audition766.py`: giriş sınırları, yetersiz tek grup ve nötr dinleme belgesi3kontrol. `tests/electron-step-audition761.smoke.js`: mevcut Windows dinleme kabulü1–4oynatıcı parametresiyle yeniden kullanılır, önceki varsayılan2korunur. Yeni bağımlılık/model indirmesi/IPC/ayar/şema yok.

## Gerçek sonuç

[Ölçümler](DELIVERY766_2026-10-29/summary.json), [akustik tanılar](DELIVERY766_2026-10-29/acoustics.json), [sentetik SRT](DELIVERY766_2026-10-29/source.srt).

| Yol | İşlem | Model hazırlama | Sentez | WAV | Metin kontrolü |
|---|---:|---:|---:|---:|---|
|A referans tonu|43.203sn|11.500sn|20.063sn|18.909sn|3/3 ready, ASR1.0|
|B kaynak anlatımı|40.828sn|9.328sn|20.408sn|18.909sn|3/3 ready, ASR1.0|

İki WAV farklı hash taşıyor; bütün FFmpeg decode exit0/stderr0. Kırpma/dijital clipping yok. B'nin üç gruptaki aktif RMS değerleri -21.964/-21.618/-19.721dBFS; ölçülen sıra düşükten yükseğe. A'da -22.576/-18.563/-21.213dBFS. Bu değerler MOS, ses kimliği veya duygu sadakati puanı değildir. B'de konuşma span hızı2.198/1.667/2.0kelime/sn; A'da2.083/2.0/2.273. Aynı metnin zamanlama ve durakları gerçekten değişti. İnsan dinlemesi olmadan daha doğal kazanan seçilmedi. RTX4070SUPER12282MiB; başlangıç11109/son11073MiB boş. İki mod soğuk model yükledi; hız karşılaştırması benchmark olarak genellenmez. Runner'ın OSexitkodu saklanmadı; iki sonuç ve son HTML tamamlandı, süreç artık canlı değil. Bu sınır ölçüm JSON'unda da yazılıdır.

13Pythonkontrolü (yeni3 + mevcut prosody6 + adım karşılaştırması4), Pythoncompile, JSsyntax/diff PASS. Gerçek Windows dinleme sayfası exit0: geniş1200 ve480CSSpx/yüzde125 dar, üç gerçekWAVmetadata hazır4, yatay taşma yok, ayar eşlemesi kapalı. [Geniş](DELIVERY766_2026-10-29/audition-1200-1.png), [dar](DELIVERY766_2026-10-29/audition-600-1.25.png) görüntüleri incelendi. İlk sandbox SAPI erişimi ve yanlış Desktop soneki başarısızdı; kurulu ses envanteriyle mevcut PowerShell'de doğru Microsoft Tolga seçildi. Başarısız sıfır dosyalar modele verilmedi. Mevcut tokenizer/weight_norm/non-writable NumPy uyarıları bastırılmadı.

## Kullanım ve yeniden üretim

Kurulu VoxCPM2 Python ile, VOXCPM_ROOT motor klasörünü ve FFmpeg PATH'ini gösterirken:

```powershell
python tools/voxcpm2/compare_delivery.py --source source.wav --srt source.srt --reference reference.wav --transcript reference.txt --verify-python backend/venv/Scripts/python.exe --ffmpeg C:/ffmpeg/bin/ffmpeg.exe --output yeni-karsilastirma
```

Kaynak ve referansın kullanımına yetkili olduğunuz yerel dosyalar olmalı; bu araç webden indirme veya API kullanmaz. Karşılaştırma klasöründeki listen.html özgün kaynak/A/B sesini sunar, eşleştirme ilk dinlemeden sonra açılır. Bu turun kullanıma hazır yerel kopyası `artifacts/voice-delivery-comparison766/listen.html` konumuna teslim edilir; WAV/profile/cache Git'e konmaz. Kişisel ses/anahtar yok.

## Araştırma ve açık kalan kabul

OpenBMB'nin Apache-2.0 [kaynak kodundaki core.py](https://github.com/OpenBMB/VoxCPM/blob/main/src/voxcpm/core.py) `_generate` yolunda prompt_wav_path/prompt_text çiftinin ve ayrı reference_wav_path koşullandırmasının işlenmesi incelendi. Yerel nano-vLLM generate çağrısı ve mevcut dub_prosody/dub_finish kodu karşılaştırıldı. Harici kod kopyalanmadı; README benchmark'ı bu uygulamanın kalite kanıtı sayılmadı. Varsayılanlar değiştirilmedi. Gerçek insan anlatımı/çok konuşmacı/müzikli kaynak ve öznel dinleme kabulü açık; P039/P040 kısmi, bütün90hedef bitmedi. Kişisel start.bat oturumu, canlı YouTube ve tam CI koşulmadı; CI beklenmedi. Müzik analizi eklenmedi.
