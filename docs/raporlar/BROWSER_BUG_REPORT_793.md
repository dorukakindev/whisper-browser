# Rapor 793 — Ses üretimi: yeniden deneme, sayı bağlamı ve referans geçişleri

Repo: https://github.com/dorukakindev/whisper-browser. Dal `codex/voice-reliability793`.
Başlangıç master `6e89674b93129c1c5442eb4a32b582ca34d5e9d6`;
bitiş ürün/test `57c3bebf2fde570eaaf9a8347d4a6cdfd2f53366`.

## Doğrulanmış iki hata ve bir iyileştirme

### 793-01 — İlk ses, akustik yeniden deneme başarısızlığında kayboluyordu

`dub_timing.quality_retry` ilk adayın dalga biçimini yalnız bellekte tutuyordu.
Akustik puan sıfır değilse ikinci istek çalışıyor; bu istek EngineStalled/OOM
verince ilk aday normal WAV yazımına hiç ulaşamıyordu. Önceki R790 sonrası
doğrulama-kurtarma yolu bu daha erken aşamayı kapsamıyordu. Bu, eski son-grup
regresyonunun yeniden sayılması değil, ilk akustik deneme sonrası ayrı kayıp yoludur.

Üretim `uret` fonksiyonunu çalıştıran kontrollü test düzeltme öncesinde hem
EngineStalled hem CUDA OOM varyantında hata verdi. Şimdi `quality_retry` yalnız
başka bir denemeye girmeden önce mevcut en iyi sonlu-puanlı adayı callback ile
geçici WAV'a bırakır. Motor yine sıfırlanır ve mevcut sınırlı yeniden başlatma
politikası değişmez. Kullanılabilir aday kaldığında kayıt `review`, sebep
`acoustic_retry_interrupted` olur; başarılı/ready yapılmaz. İptal yayılır,
üretim tamamlandı sayılmaz. Tam sessizlik kullanılabilir konuşma sayılmaz.
İyi ilk denemeye ek dosya yazımı veya yeni retry eklenmedi.

### 793-02 — Doğru ondalık konuşma kaydı yeniden açılırken yanlış review

`Uzunluk 3.14 metre.` için gerçek doğrulama `üç virgül on dört` okumasını
özgün sayının bağlamıyla kabul edebiliyordu. Kayda yalnız genişletilmiş
`üç virgül bir dört` metni yazılınca `cached_record` aynı ASR kanıtını
özgün ondalık bağlamı olmadan tekrar değerlendirip spoken_number_mismatch
üretiyordu (yalın repro: benzerlik 1.0 → 0.8333, review false → true).

Yeni kayıtta isteğe bağlı `numericReference` saklanır ve yeniden denetim aynı
referansı kullanır. Eski başarılı kayıtlarda yalnız önceki doğrulamanın sakladığı
geçerli decimalEvidence ile birebir örtüşen konuşulmuş sayı geri kurulabilir;
başka sayılar/versiyonlar/tarihler topluca dönüştürülmez. Bir alan eklenmesi
gerekir, toplu dosya göçü veya GPU yeniden üretimi gerekmez. Daha önce review
olmuş kayıt otomatik ready yapılmaz. `on dört → on beş` değişimi hâlâ review
verir; anlam/sayı kapıları gevşetilmedi.

### 793-P1 — Döküm düzeltmesinde gereksiz ses kodlaması

Sıcak EngineSession referans kimliğini dalga biçimi+döküm olarak tek parça
önbellekliyordu. Aynı WAV'ın yalnız dökümü değişince ses latents de yeniden
hesaplanıyordu. Artık aynı dalga biçiminin latents nesnesi korunur; eski prompt
kaldırılır, yeni döküm için yeni prompt eklenir. İzole klonlamaya geçişte prompt
kaldırılır; ses değişince encoder çalışır; reset tüm referans durumunu temizler.

Gerçek nano-vLLM 2.0.4 `add_prompt` kendi içinde ayrıca encoder çağırır.
Bu çağrı gizlenmedi veya atlanmadı: soğuk Hi-Fi 2 çağrı, birebir tekrar 0,
döküm değişimi 1, izole moda geçiş 0. Ölçülen süreler sırasıyla
2.172 / 0.0 / 0.078 / 0.0 saniye; bu tek yerel koşudur, genel hız garantisi
değildir. İzole moda geçiş aynı latents nesnesini kullanır.

## Değişen ürün/test dosyaları

| Dosya | Amaç |
|---|---|
| tools/voxcpm2/dub_timing.py | Sonraki akustik denemeden önce isteğe bağlı aday bırakma noktası |
| tools/voxcpm2/altyazi_oku.py | Adayı kullanılır halde koruma, doğru review sebebi, sayı referansını saklama |
| tools/voxcpm2/dub_quality.py | Yeni/eski cache için özgün ondalık kanıtıyla yeniden denetim |
| tools/voxcpm2/dub_runtime.py | Aynı WAV'da encoder latents tekrarını kaldırma; prompt ayrımı |
| tests/test_dub_generation_quality.py | Stall/OOM/iptal ve cache açılışı davranışları, yanlış sayı negatif kontrolü |
| tests/test_dub_runtime.py | Döküm/izole mod/ses değişimi ve referans sahipliği |

## Kontroller ve gerçek kanıt

- `test_dub_generation_quality`, `test_dub_runtime`, `test_dub_quality`,
  `test_dub_timing` birlikte: **58 Python testi geçti**, 1.474 s.
- `node --test tests/dub-engine-worker.test.js`: **11 test geçti**.
  İlk sandbox koşusu child spawn EPERM idi; Windows'ta izinli koşu geçti.
- Değişen Python dosyaları py_compile, git diff --check: geçti.
- `accept_dub.py --run`: gerçek RTX 4070 SUPER, mevcut VoxCPM2/nano-vLLM,
  sentetik SAPI referansı, iki Türkçe grup, ayrıntılı CPU ASR ve son WAV kontrolü.
  60.906 s duvar süresi; çıktı 30.0 s / 48000 Hz / 1440000 frame.
  İki grup passed/ready; son WAV ASR 0.9655, eksik sayı/uzun sözcük kaybı yok,
  finite, peak 0.71658, dijital clipping 0. Başarı exit0.
  [GPU kanıtı](evidence793/gpu-acceptance.json).
- Sıcak referans geçişleri gerçek GPU'da ayrıca ölçüldü:
  [geçiş kanıtı](evidence793/reference-transitions.json).
  İlk geçici ölçüm betiğinde Windows multiprocessing main koruması eksikti;
  koruma düzeltildi. Ardından test beklentisi add_prompt içindeki ek encoder
  çağrısını atlıyordu; kurulu kaynak okunup toplam çağrı beklentisi düzeltildi.
  Ürün eşiği veya doğrulama kapısı gevşetilmedi; son kanıt passed=true.
- Mevcut tokenizer sınıfı/weight_norm ve ilk GPU koşusunda read-only numpy
  motor uyarıları görüldü. Motor dosyaları değiştirilmedi.

Ham engine günlükleri, WAV ve tam referans verileri ignored tmp'dedir;
Git'e yalnız sentetik kontrolün küçük JSON sonuçları alınır. Kişisel profil,
API anahtarı veya kullanıcının açık uygulaması değiştirilmedi/kapatılmadı.

## Kaynak incelemesi ve sınırlar

[OpenBMB VoxCPM2 üretim kodu](https://github.com/OpenBMB/VoxCPM/blob/main/src/voxcpm/model/voxcpm2.py)
ve [nano-vLLM sunucu kodu](https://github.com/a710128/nanovllm-voxcpm/blob/main/nanovllm_voxcpm/models/voxcpm2/server.py)
ile kurulu 2.0.4 kaynağı karşılaştırıldı. Referans latents ve continuation
prompt ayrımı esas alındı. [MIT lisansı](https://github.com/a710128/nanovllm-voxcpm/blob/main/LICENSE)
doğrulandı; dış kod kopyalanmadı, yeni bağımlılık/yükseltme yapılmadı.

Ses için çevirinin anlam kapıları ve DeepSeek varsayılanı önceki R788–791
teslimidir; bu tur yeni canlı DeepSeek çeviri/duygu kalitesi iddiası yok.
Kontrollü hata testleri gerçek GPU'ya kasıtlı OOM/sonsuz stall verilmesi değildir.
30 saniyelik bütünlük, uzun video veya insan kulağıyla doğallık/duygu kabulü
yerine geçmez. UI değişmedi; yeni görsel test gerektiren ekran yok.
start.bat/install.bat, kişisel GPU oturumu, gerçek YouTube, uzun tam npm paketi
ve CI sonucu bu tur doğrulanmadı. CI açık kalır; teslim sonucu beklemez.
Kalan90 hedef aktiftir; bütün ürünün tamamlandığı iddiası yok.
