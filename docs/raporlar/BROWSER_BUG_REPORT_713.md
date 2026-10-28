# Rapor 713 — Hi-Fi devam koşullamasından doğrulanmış klonlama kurtarması

Başlangıç `4ea8280ca78a8f1a9a9eeea8c2980e72db1df0ca`; ürün/test bitişi `cf3278381b331a564dbc28a190a4d509e017a9e9`. Dal `codex/voice-mode-comparison713`. P021/P046 için sınırlı ilerleme; 90 hedefin tamamı bitmedi. Müzik analizi kapsam dışı.

## Somut kanıt ve sorun
R712 gerçek Whisper + canlı DeepSeek çıktısı: “Kütüphane bugün açık. Birlikte kitap okuyabiliriz.” İngilizce sentetik SAPI referansı ve doğru dökümüyle Hi-Fi devam koşullamasında otomatik tanıma “Kutufani bug in a chick. Biralikta kitapokia biliris.” oldu. Benzerlik 0,0 ve review. Bilinen Türkçe ile bağımsız ASR de önceki turda 0,2857 verdi; sorun yalnız dil algılaması sayılmadı.

Bu tur aynı SRT/referans/seed42, 15 adım, CFG1,65, temperature0,8, paralellik2 ve 2–10 saniye video zamanlamasında bağımsız klonlama 1,0/passed; eski Hi-Fi yolu yeniden 0,0/review verdi. İki yol aynı nano-vLLM/VoxCPM2 modelini kullanır. Hi-Fi yolu transcript + prompt audio ile devam koşullaması, klonlama yalnız referans ses kimliğidir. Bu deney İngilizce referansın etkisini destekler; bütün referanslar için nedensellik veya doğal ses üstünlüğü kanıtlamaz.

## Uygulama
`tools/voxcpm2/altyazi_oku.py`: İlk üretim korunur. Mevcut detailed/balanced ASR kontrolü review verirse var olan tek doğrulama tekrarında, bir continuation prompt varsa yalnız bu istek için prompt çıkarılır; aynı referans latentleri, metin ve seed kullanılır. Prompt yoksa eski farklı-seed tekrarı sürer. Ortak prompt/cache mutasyona uğramaz; paralel gruplar etkilenmez. Yeni bir tekrar katmanı veya ücretli metin düzenleme isteği eklenmez.

Alternatif ancak ham ses kalite puanı önceki adaydan kötü değilse VE mevcut ASR/semantik kapıları passed ve review=false verirse atomik yerleştirilir. Hatalı/eksik/olumsuzluğu kaybolmuş/kırpılmış aday ilk sesi silemez. Timeout/OOM/iptal davranışı mevcut korumaları kullanır. Alternatif de başarısızsa review korunur. Referans kimliğinin algısal olarak aynı kalması insan dinlemesi gerektirir.

`referenceMode`, `verificationRetryMode`, varsa `verificationRetry` grup raporunda gerçek kullanılan yolu ve alternatif ASR kanıtını saklar. Yeni politikaya tabi doğrulamalı continuation önbellek anahtarına sürüm eklenir; eski reddedilmiş ses yeni başarı sanılmaz. Fast/izole/prosody işleri eski anahtarını korur. Hi-Fi balanced/detailed eski sesleri bu nedenle bir kez yeniden üretilebilir; dosyalar silinmez.

## Gerçek sonuçlar
[Temiz teknik kanıt](VOICE713_2026-10-28/comparison.json):

| Durum | Sonuç | ASR benzerliği | Süre |
|---|---|---|---|
| Bağımsız clone, seed42 | ready | 1,0 | 27,172 sn |
| Önceki continuation tekrar yolu, seed42 | review | 0,0 | 37,437 sn |
| Düzeltilmiş continuation → isolated, seed42 | ready | 1,0 | 37,172 sn |
| Alternatif seed43 | review korunuyor | son aday 0,3077 | 37,188 sn |
| Kurtarılmış seed42 önbellekten yeniden açma | ready | 1,0 | 0,187 sn; GPU modeli açılmadı |

Her ses dosyası 8 saniyelik seçili aralıkta; 0 hızlandırma, 0 kesilme, 0 taşma. Ara prototipte izole tekrar farklı seed ile denenince bu örnek kurtarılmadı. Son politika yalnız koşullama farkını sınamak için aynı seed kullanır. Seed43 adayının başarısızlığı gizlenmedi; kalite eşiği düşürülmedi. Bunlar insan kulağıyla doğallık, duygu veya genel başarı oranı ölçümü değildir.

## Kısa kontroller
- `python -m unittest discover -s tests -p test_dub_generation_quality.py`: 23 PASS. Üç yeni davranış: doğrulanmış alternatifin gerçek WAV olarak yükseltilmesi ve diğer paralel promptun korunması; semantik ret halinde ilk dalga biçiminin kalması; zaten geçen continuation için ek üretim olmaması.
- Önceki clipping/timeout/OOM/cancel hata enjeksiyonları eski seed numarası yerine artık alternatif isteğin gerçek prompt_id=None koşulunda çalışır. Aynı koruma beklentileri sürer. İlk testte ham genlik beklentisi son işlemeyi hesaba katmadığı için düzeltildi; bitmiş dalga biçimi karşılaştırılıyor.
- `python -m unittest discover -s tests -p test_dub_quality.py`: 10 PASS. Sayı/olumsuzluk/anlam kapıları değişmedi.
- `py_compile` değişen iki Python dosyası; `git diff --check`: PASS.
- Gerçek Windows engine Python ile mevcut `altyazi_oku.py` CLI kullanıldı. Sentetik kaynak R712 kanıtındaki SRT, sentetik referans ve döküm; kişisel ses yok. Tekrar için aynı CLI ayarları yukarıda, `--mode hifi --seed 42 --verification detailed --verify-python <backend Python> --range-start 2 --range-end 10 --timing-mode video --gruplama akici`. VOXCPM_ROOT gerçek kurulu motor dizinidir. Ham tanılar yerel tmp/pipeline713-* altında; anahtar gerekmez.

## Dış kaynak, Windows ve sınırlar
[OpenBMB gerçek build_prompt_cache kodu](https://github.com/OpenBMB/VoxCPM/blob/main/src/voxcpm/model/voxcpm2.py) reference-only ile continuation ayrımını doğruladı. [Apache-2.0 lisansı](https://github.com/OpenBMB/VoxCPM/blob/main/LICENSE) incelendi. Kurulu nano-vllm-voxcpm server.py içinde prompt_id=None ve ref_audio_latents yolu da okundu; dış kod kopyalanmadı/yeni bağımlılık eklenmedi. Model veya harici Desktop/Ses motor kaynakları değiştirilmedi.

Bu tur UI değişmedi; görüntü testi tekrarlanmadı. Gerçek CUDA üretimi Windows'ta çalıştı, Türkçe SRT yolu kullanıldı. start.bat/install/DRM/canlı YouTube/gerçek kullanıcı sesi/insan dinleme doğrulanmadı. Metin/TXT stüdyosunun ayrı kitap motoruna aynı kurtarma eklenmedi; buradaki SRT/dublaj yolu için geçerlidir. Uzun CI beklenmedi, görülmeyen CI sonucu başarılı sayılmadı. Anahtar/API çağrısı bu ses deneyinde gerekmiyordu; önceki canlı DeepSeek kanıtı R710–712'de.
