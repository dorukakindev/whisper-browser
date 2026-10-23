# Rapor526 — Derin ses kurtarma ve kaynak araştırması

Tarih: 2026-10-23. Dal: `codex/dub-lifecycle523`, [PR479](https://github.com/dorukakindev/whisper-browser/pull/479).
Başlangıç HEAD: `9e6d42d2dc8b98e6bd8ed9b9fc5664100c0a28db`.
Bitiş ürün kodu: `5ad76a60d1caf4b95ea72f5bb76382d64c8f49f4`.
Kapsam: altyazıdan konuşma üretimi, ASR anlam denetimi, uzun konuşma kurtarması. Önceki523–525 değişiklikleri korunur; bu tur Whisper motoru/çeviri prompt'u değiştirilmedi.

## Doğrulanan dört hata

### 526-01 — Sonraki doğrulama takılınca eldeki gerçek ses siliniyordu

`tools/voxcpm2/altyazi_oku.py:uret/gen` ilk kullanılabilir WAV'ı `.tmp.wav` olarak yazar. Daha iyi aday üretimi veya uzun içerik kurtarması `EngineStalled`/CUDA OOM verdiğinde dış handler hatayı tekrar fırlatıyor, `finally` bu ilk WAV'ı siliyordu. Yeniden başlatma sonrası ikinci hata olduğunda `recover_completed` bu sesi göremiyordu. Başka grubun hatasıyla iptal edilen task da aynı kaybı yaşayabiliyordu.

Artık yazılmış geçerli aday önce cache'e, açık `review` durumu ve `verification_interrupted` gerekçesiyle alınır; hata/iptal yine yukarı taşınır. Aynı koşumun motor yeniden başlatması grubu zorunlu olarak tekrar dener; önceki aday yalnız son kurtarma olanağıdır. İlk ses hiç oluşmamışsa sahte başarı/dolu WAV yaratılmaz. Eski `ready` metadata waveform değiştirilmeden geçersizleştirilir; metadata yazımı aksarsa okuyucu review'ya düşer. Kullanıcının durdurması başarıya çevrilmez.

Kanıt: kontrollü üretim, ikinci okuma sırasında EngineStalled ve CUDA OOM; yeniden başlatma sınırından sonra16000 gerçek örnek korunur, durum review/regenerationFailed. Ayrı CancelledError koşulu iptali dışarı taşır ve ilk16000 örneği review olarak saklar. Yeni iki regresyon HEAD öncesi script'e uygulanınca üç senaryo hata verir; düzeltilmiş üretim akışında geçer. Test GPU/native model içermez.

### 526-02 — Pozitif miktar negatife dönüşse de doğrulama geçiyordu

Eski işaret kontrolü yalnız kaynakta yazılı eksi sayıları arıyordu. Uzun pasajda `+5 derece Celsius` → `-5 derece Celsius`, benzerlik0.9444 olmasına rağmen review=false; `5`→`-5` için0.9714/review=false.

Artık yazılı ve sözlü artı/eksi işaretleri TR/EN işaret sözcükleriyle kanonikleştirilir; miktar, sıra ve tekrar sayısıyla çift yönlü karşılaştırılır. Olmayan eksi ekleme, artıyı düşürme ve aynı iki miktarın işaretini yer değiştirme review verir. Bu, tam bir sayısal dilbilgisi veya bütün diller için doğruluk garantisi değildir.

### 526-03 — İngilizce “without” düşmesi yakalanmıyordu

`without opening the main valve` → `opening the main valve` uzun bağlamda0.973 benzerlikle kabul ediliyordu. Eklenen olumsuzluk kontrolünde without vardı, kaybedilen olumsuzluk kontrolünde yoktu. Kaybı artık lost_negation/review yapar. Türkçe ve mevcut İngilizce olumsuzluk regresyonları korunur.

### 526-04 — Aynı sayı aralığı/tarih gereksiz tekrar okumayı tetikliyordu

`5-10 kişi bekledi` aynen geri okunmasına rağmen missing_numbers/added_numbers review üretiyordu. `spoken_text` tarih/aralık/kimlikleri bilinçli olarak değiştirmezken sayı kapısı tekil parçaları beş/on diye yeniden yorumluyordu.

Normalize edilmiş kaynak sayısal referans ve duyulan tam token dizisi aynıysa varlık kontrolü zaten kanıtlanmıştır; bu dar durumda gereksiz fragman dönüşümü yapılmaz. Diğer metin farklılıklarında mevcut denetim sürer. 5-10→5-20 hâlâ review; edit sonrası kaynakta12 varken yeni metin ve ASR'da sayı olmaması hâlâ review. İşaret kontrolü bu eşitlikten bağımsızdır.

## Bir kalite geliştirmesi: kurtarılan her parçanın ham sesi denetleniyor

`dub_recovery.recover_long_speech` sadece ASR sözlerini kontrol ediyordu. Şimdi üretimde normal sentezin `assess_chunk` kapısı ham kurtarma parçasına da uygulanır; score>0/nonfinite aday, finishing aşamasının kazanç azaltması kusuru maskelemeden önce reddedilir. Böylece sözleri anlaşılmış bir patlama/kırpılma otomatik olarak iyi aday olmaz. İlk mevcut ses korunur ve inceleme gerektirir. Yeni üretim/ASR çağrısı veya yeni bağımlılık eklenmez. Kontrollü raw-clipping/inf skor fixture'ı finishing ve ASR'nin hiç çağrılmadığını; score0 fixture'ı parça+birleşik denetimin sürdüğünü doğrular. Bu kontrollü kapı kanıtıdır; gerçek modelde yeni bir patlama gözlemlendiği iddiası değildir.

## İnternet/GitHub incelemesi ve alınan kararlar

Bu tur aşağıdaki birincil kaynakların ilgili kod/belge bölümleri okundu. Harici kod veya model ağırlığı kopyalanmadı; lisanslı kaynaklardan yöntem karşılaştırması yapıldı. Değişiklikler mevcut proje işlevleriyle uygulandı.

| Kaynak | İncelenen yöntem ve karar |
|---|---|
| [VoxCPM2 resmî model kartı](https://huggingface.co/openbmb/VoxCPM2) — Apache-2.0 | Çok uzun/çok ifadeli giriş kararsızlığı ve ses+dökümle koşullama. Mevcut kesin döküm/sabit referans korunur; sayı dolduran yeni “duygu” parametresi yok. |
| [OpenBMB uzun-form PR313](https://github.com/OpenBMB/VoxCPM/pull/313) ve [issue302](https://github.com/OpenBMB/VoxCPM/issues/302) | Cümle parçalama, sabit bağlam ve zincirleme sesin kayması. PR açık bir öneridir; resmî birleşmiş/garanti çözüm sayılmadı. Bizdeki sabit asıl referans korunur; üretilmiş kusurlu ses sonraki prompt'a zincirlenmez. |
| [F5-TTS inference kodu](https://github.com/SWivid/F5-TTS/blob/main/src/f5_tts/infer/utils_infer.py) ve [MIT lisansı](https://github.com/SWivid/F5-TTS/blob/main/LICENSE) | Noktalama ile chunk üretimi ve crossfade. F5'e özel boyut/örnekleme değerleri VoxCPM'e taşınmadı; konuşmanın başını/sonunu örtüştürmek yerine mevcut nefes/durak korumalı birleştirme sürer. Kurtarma parçalarının kalite onayı eklendi. |
| [Nano-vLLM VoxCPM mimarisi](https://github.com/a710128/nanovllm-voxcpm/blob/main/ARCHITECTURE.md) ve [README](https://github.com/a710128/nanovllm-voxcpm) — MIT | Async worker, prompt kimliği ve GPU kapasite sınırları. Daha yeni sürümün ek CUDA graph belleği uyarısı nedeniyle kör sürüm yükseltmesi yapılmadı; sınırlı restart ve gerçek parçayı koruma iyileştirildi. |
| [stable-ts regrouping](https://github.com/jianfch/stable-ts#regrouping-words) | Noktalama/gap/uzunluk sıralaması ve kelime zamanları. Bizde cümle/gap gruplaması zaten var; gerçek kelime hizalaması olmadan yeni alt-cue zamanları icat edilmedi. |
| [WhisperX sınırları](https://github.com/m-bain/whisperX#limitations-) ve [faster-whisper transcribe](https://github.com/SYSTRAN/faster-whisper/blob/master/faster_whisper/transcribe.py) | Sayı/para hizalama kapsamı ve batched VAD seçenekleri. ASR kanıtını mutlak anlam/doğallık garantisi saymamak, sayıdaki yanlış onayı ve yanlış alarmı birlikte düzeltmek tercih edildi. Yeni model indirilmedi. |

Sabit referans, tam cümle ve konuşmayı kesmeden video yavaşlatma zaten mevcuttu; bunlar bu tur yeni eklenmiş gibi sunulmaz. Resmî örneklerdeki hız sonuçları bu Windows makinede ölçülmüş performans değildir.

## Doğrulama

- `python -m unittest discover -s tests -p test_dub_generation_quality.py`:16 geçti.
- `... -s tests -p test_dub_quality.py`:5 geçti.
- `... -s backend -p test_dub_recovery.py`:5 geçti.
- `... -s tests -p test_report491_audio.py`:5 geçti.
- `... -s backend -p test_dub_completion.py`:3 geçti.
- `... -s tests -p test_report521_regressions.py`:11 geçti.
- `... -s backend -p test_pipeline_524.py`:4 geçti.
- `... -s backend -p test_pipeline_525.py`:5 geçti.
- Toplam54 ilgili test metodu; bunların4'ü bu tur yeni. Alt senaryolar test sayısı şişirmek için ayrı bug sayılmadı.
- `node tests/dub-service.test.js`:geçti; değişmeyen IPC/çıktı/iptal sözleşmesi.
- Üç ürün Python dosyası/yeni testler ve transcribe py_compile; main/preload/renderer node --check; git diff --check geçti.
- Yeni yerel tam npm test/UI/GPU/model/dinleme/sağlayıcı/YouTube koşulmadı; bu tur arayüz geometrisi ve metni değişmedi. Gerçek ses doğallığının arttığı ölçülmüş değildir.

Önceki9e6d42d2 head'in [Ubuntu CI](https://github.com/dorukakindev/whisper-browser/actions/runs/39941208546/job/120372805713) günlüğü okundu: npm test “Tüm testler geçti”, kontrast0, smoke81 tıklama/0 bulgu; iş `upload-artifact` adımında “Artifact storage quota has been hit” ile başarısız. Bu ürün test hatası değildir ama iş yeşil değildir. Rapor kotası için kullanıcı artifact'ları silinmedi/CI kapatılmadı. Windows aynı head için son bakışta çalışıyordu; görülmeyen sonuca başarı denmez. Yeni push'un CI'ı arka planda çalışır; teslim bekletilmez.

## Windows, kalıcılık ve teslim

Üretim kodu subprocess/model sürümünü, start.bat/install.bat akışını, dosya seçiciyi veya PATH'i değiştirmez. Windows hedefli gerçek WAV/metadata dosyalarıyla, boşluklu çalışma yolu üzerinde kontroller koşuldu; model/hardware yerine kontrollü motor kullanıldı. Kişisel ses/API anahtarı kullanılmadı. Yeni dependency/kurulum/ayar şeması yok. Cache protokolü `dublaj-ses-v15-signed-quantities`: eski zayıf denetimle onaylanmış parça yeni üretimde aynen devralınmaz; ilk yeni üretim daha uzun sürebilir. Eski cache/WAV ve kullanıcının kayıtları silinmez.

Ana `D:/Whisper Local` master512b16fe ve kullanıcıya ait üç yerel belge değişikliği korunur. Çalışma `tmp/audit470` ayrı checkout'unda, PR479'a eklenir; otomatik master birleştirmesi yapılmaz. Kod commit'i ayrı; bu rapor ve tarihli devir notu ayrı docs commit'ine alınır. Push son adımda doğrulanacaktır.
