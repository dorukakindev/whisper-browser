# Rapor761 — Aynı Türkçe sesle10/15adım gerçek GPU karşılaştırması

Yeni ürün bugı iddia edilmez. P040/P050 için daha önce bekleyen hız–metin bütünlüğü karşılaştırması gerçek motorla yapıldı. Doğal ses üstünlüğü/human kalite tercihi kanıtlanmadı ve uygulama varsayılanı değiştirilmedi.

## Uygulama

- tools/voxcpm2/compare_prosody.py: --steps 10 veya15; mevcut varsayılan15 korunur. Seçim doğrudan nano-vLLM server inference_timesteps parametresine geçer. Sonuç her koşuda referans ve birebir döküm hashlerini saklar; model revizyonu/metin/seed/gruplama zaten kayıtlıdır. R752 çift referans modu korunur.
- tools/voxcpm2/compare_step_results.py: iki koşunun adım kümesi, metin/referans/döküm/model/temperature/CFG/gruplama/seed eşleşmesini doğrular; eşleşmezse final karşılaştırma üretmez. Var olan çıktı klasörünü ezmez. Tek bağlam koşularını alır; iki mono PCM dosyasını kontrol edip nötr A/B dinleme sayfası ve comparison.json üretir. Otomatik kazanan seçmez. Yerel dinleme artefaktı Türkçe, grafit/amber, dar ekranda tek sütun; ayar haritası başlangıçta kapalıdır.
- tests/test_step_comparison761.py: mevcut15varsayılanı, desteklenmeyen adımlar, farklı giriş hashleri/seed/metin/CFG ve eksik/aynıadım reddi4kontrol.
- tests/electron-step-audition761.smoke.js: yalnız verilmiş dinleme klasörünü açan izole Windows renderer; iki gerçek WAV metadata/decode, geniş/dar125 taşma ve kapalı ayar haritası kontrolü.

## Gerçek üretim

RTX4070SUPER12282MiB; başlangıç10510MiB boş, ikinci iş öncesi9500MiB eşiği yeniden kontrol edildi, sonda10456MiB boş. Test süreçleri bitti; başka süreç öldürülmedi. Kurulu nano-vLLM/VoxCPM2 modelrev32279effe8c19989596f05d353d1447f51d9e915, tek paralel istek, seed42,cfg1.65,temperature0.8,tekbağlam ve aynı sonişlem. Ayrı soğuk motor yüklemeleriyle10ve15adım ardışık üretildi; sentez süreleri yükleme süresini içermez. Aynı Windows Tolga sentetik Türkçe referans ve birebir döküm; kişisel ses değil.

Metin: “Bugün üç kilometre yürüdük, ama kimse yorulmadı. Bunu gerçekten sen mi söyledin? Önce şaşırdım, sonra gülümsemeye başladım. Akşam olunca eve döndük ve hikâyeyi kaldığımız yerden sürdürdük.”

|Adım|Model yükleme|Sentez|WAV süresi|Türkçe ASR benzerliği|Kapı|Dijital clipping|
|---|---:|---:|---:|---:|---|---:|
|10|10.969sn|15.375sn|14.550sn|0.9615|passed|0|
|15|10.578sn|20.500sn|14.583sn|0.9615|passed|0|

Bu tek kısa örnekte10adım sentez25% daha kısa sürdü. Bu bir korpus benchmark'ı, dört paralel grubun hızı veya genel kalite eşdeğerliği değildir. İki ASR'da sayı/olumsuzluk kaybı ve omission işareti yok; bu metin anlamının/diksiyon/duygunun insan dinlemesiyle tam doğrulaması değildir. [10sonuç](evidence761/steps10.json), [15sonuç](evidence761/steps15.json), [eşleştirilmiş rapor](evidence761/comparison.json).

## Doğrulama ve kullanım

7PythonPASS (yeni4+R752mevcut3); py_compile3/Python ve node syntax/diffPASS. İki nihaiWAV FFmpeg tamdecode exit0. Gerçek Windows dinleme sayfası1200CSS ve480CSS/yüzde125, iki oynatıcıreadyState4/süre14.55ve14.58/yataytaşmayok. [Geniş](evidence761/audition-1200-1.png), [dar](evidence761/audition-600-1.25.png), [ölçümler](evidence761/layout.json) açılıp incelendi. Yeni bağımlılık/kurulum/şema/IPC yok. Motorun kurulu dosyaları değiştirilmedi, model indirilmedi; cache local_files_only kullanıldı. Upstream weight_norm deprecation ve non-writable NumPy uyarıları görüldü, üretim/decode/ASR başarısını kesmedi.

Örnek koşu (kurulu motor Python'u, VOXCPM_ROOT tanımlı): `python tools/voxcpm2/compare_prosody.py --steps 10 --only single-context --text sample.txt --reference reference.wav --transcript reference.txt --output steps10 --verify-python BACKEND_PYTHON`. Aynısını15ile ayrı yeni klasöre üret; `python tools/voxcpm2/compare_step_results.py steps10 steps15 audition` ile eşleştir. Sesler ignored yerel `D:\Whisper Local\artifacts\voice-step-comparison761` içindedir; Git'e WAV konmadı. listen.html iki oynatıcıyla açılır. Dinleme tercihi/nullwinner comparison.json içinde açık kalır.

[OpenBMB resmî örnekleri ve Apache2 kaynak](https://github.com/OpenBMB/VoxCPM/blob/main/README.md) incelendi; örnek10adım seçeneği yerel kurulu nano-vLLM gerçek parametre yolu ile doğrulandı. README iddiası ses kalitesi kanıtı sayılmadı, dış kod alınmadı. Uygulama ayarları15kalır; gerçekvideo/personalref/emotionA-B/insantercihi/tekrarlıuzunbenchmark/start.bat bu tur yok. UzunCI beklenmedi.90aktifhedef sürer,müzikeklenmedi.

Başlangıç4844087639ce3c1f80d13bb791f84510a2f85808; ürün/test bitişi8f0224303a4826836cbee630fb377ba282edbb24. Kod ve belgeler ayrı commit; normalPR/master ve kişisel dosyaları koruyan ana güncelleme teslimi uygulanır.
