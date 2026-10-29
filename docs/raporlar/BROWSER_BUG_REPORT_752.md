# Rapor752 — Gerçek GPU ile iki referansta aynı Türkçe metin

P038/P040/P050 için yeni gerçek kanıt; eski karşılaştırma modalı veya R750 dil düzeltmesi yeniden keşif değildir. Bu tur ürün bugı uydurulmadı. Ortak motor ve doğrulayıcıyla iki farklı referansın sonucu ölçüldü; kalite kapıları gevşetilmedi.

## Uygulama ve kullanım
`tools/voxcpm2/compare_prosody.py` mevcut karşılaştırma aracına `--alternate-reference` ve `--alternate-transcript` eklendi. İkisi birlikte zorunlu; karşılaştırma yalnız `--only single-context` ile açılır. Böylece referans değişirken gruplama da değişmez. İki varyant aynı hedef metin,seed42,15adım,cfg1.65,temperature0.8 ve son işlem algoritmasıyla üretilir. Orijinal araç varyantları değişmez; kişisel kayıt/uygulama ayarları değiştirilmez. Sonuçta referans hashleri ve deneyin sınırlaması bulunur. Motor bir kez yüklenir, iki referans/prompt ayrı bağlanır. Üretilmiş ses sonraki referans olarak geri beslenmez.

Örnek (mevcut kurulu motor Python'u ve VOXCPM_ROOT ile):
```
python tools/voxcpm2/compare_prosody.py --text sample.txt --reference a.wav --transcript a.txt --alternate-reference b.wav --alternate-transcript b.txt --only single-context --output new-comparison --verify-python BACKEND_PYTHON
```
Yeni çıktı klasörü gerekir; önceki sesler ezilmez. Bu bir opt-in ölçüm aracıdır, uygulamanın varsayılanını değiştirmez. `tests/test_reference_pair752.py`: mevcut eşleşmesiz kullanım, eksik çift ve gruplama karıştırma reddi3PASS.

## Gerçek koşu
Windows Microsoft Zira İngilizce sentetik9sn referansı ile Microsoft Tolga Türkçe sentetik referansı kullanıldı. Kişisel ses yok. Tolga referansına gerçek smallCPUASR tr ile bakıldı; Pencereyi/Penceriyi farkı dışında döküm örtüşüyordu, döküm hedef sonuçla değiştirilmedi. İlk sandbox SAPI erişimi başarısız ve0byte idi; normal yetkide temiz sentetik üretimle düzeldi,0byte dosya TTS'ye verilmedi.

Hedef: “Pekala, işte buradayız, fillerin önünde. Bu arkadaşların gerçekten çok uzun hortumları var.”

| Referans | Üretim saniyesi | WAV saniyesi | ASR benzerlik | Yerel kapı |
|---|---:|---:|---:|---|
|A İngilizce Zira|13.328|8.475|0.80|review|
|B Türkçe Tolga|10.500|6.943|0.88|passed|

Model yükleme10.828sn; gerçek nano-vLLM/VoxCPM2 revision32279effe8c19989596f05d353d1447f51d9e915. GPU öncesi10630MiBboş, iş sonrası1391MiBused; yalnız testin süreçleri normal bitti. İki nihai WAV FFmpeg tam decode exit0, dijital clipping0. [Sonuç](evidence752/paired-results.json) ve [referans gerçek ASR](evidence752/synthetic-reference-asr.json). Ham sesler ignored tmp/r752/paired altında, Git'e kişisel veya model ses verisi konmadı.

## Yorum ve sınırlar
Bu tek metin/tek seed/iki sentetik sestir. Dil ile konuşmacı kimliği birlikte değişir; salt dilin nedensel etkisi kanıtlanmadı. ASR tanıma farkı insan doğallığı, duygu, ses benzerliği veya genel üstünlük değildir. Türkçe Tolga örneği kapıyı geçti, otomatik kazanan/varsayılan seçilmedi. P038 gerçek üretim kısmı ilerledi; insan tercihi açık. P040/P050 genel kalite bitmedi. Yeni asistanAPI,YouTubeağ,arayüz,dublajtimeline veya kişisel start.bat koşumu yok;bu yüzden tüm ürün kabulü sayılmaz. Harici motor dosyaları ve kişisel ayarlar değişmedi. Mevcut tokenizer/weight_norm/non-writable-array motor uyarıları kaydedildi, sessizce bastırılmadı. Yeni bağımlılık/model indirmesi yok. Python3compile/diffPASS; CI beklenmedi.

## Kaynak incelemesi
[OpenBMB gerçek core.py](https://github.com/OpenBMB/VoxCPM/blob/main/src/voxcpm/core.py) prompt_wav_path/prompt_text çiftini doğrular ve VoxCPM2 reference_wav_path yolunu ayrıca prompt cache'e bağlar. Mevcut nano API'mizde de her varyantın add_prompt/encode_latents eşleşmesi korunmuştur; dış kaynak kodu kopyalanmadı. [Resmî lisans](https://github.com/OpenBMB/VoxCPM/blob/main/LICENSE) Apache2.0; yeni bağımlılık yok. README hız iddiası kendi GPU sonucumuz yerine kullanılmadı.
