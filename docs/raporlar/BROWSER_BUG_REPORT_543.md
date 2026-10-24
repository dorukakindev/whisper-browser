# Rapor543 — Dublaj aşamaları, sıcak motor, GPU kapasitesi ve son grup kurtarması

2026-10-25. Depo https://github.com/dorukakindev/whisper-browser; dal `codex/dub-runtime543`; başlangıç `8f14124629f7db3acf8213fb995d0a828bee7c08`, bitiş ürün `686c509d1e0a66d2e894c796aaa842e389a0fdc2`. Kullanıcı beş ses başlığının uygulanmasını istedi. Güncel origin/master'dan temiz `D:\Whisper Local\tmp\audit470` çalışma kopyasında yeni dal açıldı. Ana master ve kullanıcıya ait kirli belgeler değiştirilmedi. Otomatik merge yapılmaz.

## Beş başlıkta uygulanan davranış

### 1. Aşamaların ayrı ölçülmesi

Önceki `generation_seconds` üretim, metin düzenleme, ASR doğrulama ve beklemeyi birlikte kapsıyordu. Yeni `Phases` ölçümleri model yükleme, referans hazırlama, sentez, doğrulama, isteğe bağlı metin düzenlemesi, zaman çizelgesi ve dosya yazımını ayırır. Her ölçülen aşama hatada da finally ile güncellenir. Son WAV yanında `.performance.json`, ana süreç NDJSON/özet kaydında `phases`, arayüzde süre satırı bulunur. Eski metrics korunur. Sentez/doğrulama süreleri paralel işler için birikimli görev süreleridir; birbirine eklenerek duvar saati çıkarılamaz. `wall_seconds` ayrıdır. Tamamen cache kullanılan işte hiç yapılmayan aşama süreleri uydurulmaz.

### 2. Motoru sınırlı süre hazır tutma

Yeni `dub_worker.py` yalnız Electron'un özel stdin/stdout pipe'ını dinler; HTTP/TCP servisi, token veya key gerektiren açık port yoktur. Node tarafı tek işin çıktısını o işe bağlayan sanal alt süreç sağlar; gerçek motor aynı Python/asyncio oturumunda kalır. Üretimden sonra60s boşta bekleyebilir. Checkbox varsayılan açık; kapatılan ayar bir sonraki üretimde bağımsız süreç yolunu kullanır, önceki sıcak süreç önce bırakılır. Boşta zaman aşımı, uygulama kapanışı ve iptal yalnız bu worker'ın süreç ağacını sonlandırır. Model/adım/token/bellek bütçesi değişikliği yeniden yükler. Sıcak motor büyütülmek için gereksiz tekrar yüklenmez; mevcut kapasitesinden düşük/eşit gerçek eşzamanlılıkla kullanılır.

Referans cache anahtarı ses içeriğinin SHA256'sı + gerçek Hi-Fi dökümüdür. Aynı referans yeniden encode edilmez. Farklı referansta önceki prompt kaydı kaldırılır; eski prompt/latent yeni sese taşınmaz. Senteze giden referans byte'ları iş başında tek kez alınır; cache hash'i, kalite kontrolü ve engine bu aynı snapshot'ı kullanır. Doğrulayıcı CPU modeli de aynı sıcak oturumda yeniden kullanılabilir; bozulmuş doğrulayıcı sonraki işte yeniden açılır. Genel TXT stüdyosu bu işte sıcak motora taşınmadı; TXT açılışında SRT motoru önce bırakılır.

Whisper/transcribe, Browser canlı ASR veya model benchmarkı başlarken hazır TTS motoru bırakılır. Böylece yeni özellik bu uygulamanın bir sonraki GPU işinin belleğini sessizce işgal etmez. Bu, harici programların GPU kullanımını kontrol ettiğimiz anlamına gelmez.

### 3. Belleğe ve kalan parçalara göre kapasite

Soğuk engine başlangıcında `torch.cuda.mem_get_info` ile boş/toplam bellek alınır.0.6GiB emniyet payı, kalan bellek için ihtiyatlı1/2/4/8 paralellik tavanı ve kullanıcı isteği birlikte uygulanır. Fiili paralellik eksik parça sayısını da aşmaz. Sıcak motorun kapasitesini büyütmek için yeniden yükleme yapılmaz. GPU bütçesi toplam VRAM'in oranıdır; yanlışlıkla boş belleğin oranı olarak hesaplanmaz.5.5GiB altı boş bellek için anlaşılır ret vardır. Bunlar bu model için başlangıç sezgisidir, her ekran kartı/iş yükü için optimum garanti değildir. Motorun otomatik KV güvenlik hesabı aynen açıktır; manuel blok override eklenmedi.

Başlatma sırasında `KV cache calculation` / güvenli bellek bütçesi arızaları artık bellek kurtarma sınıfına dahildir; yalnız sıradan CUDA OOM'a bakılmaz. Fiili kapasite ve bellek bilgisi özel iş kaydına gider. Kullanıcının4/8 seçimi hedef üst sınır olarak kalır; gerçekleşen değer farklı olabilir.

### 4. Son parça, iptal, yeniden deneme ve gerçek sesi koruma

Önceki engine-stall yeniden başlatması aynı akustik seed'i tekrar kullanıyordu. Bir kez takılan aynı üretim deterministik biçimde yine takılabiliyordu. Tek sınırlı yeniden başlatmada paralellik azaltılır ve seed değiştirilir; tamamlanan bağımsız WAV parçaları korunur, yeniden hesaplanmaz. Süre aşımı hâlâ bounded_call ile sınırlıdır; sonlandırma owned süreç ağacına uygulanır. Önceden yazılmış adayın doğrulaması kesilirse aday review olarak korunur; sessizlik başarılı cache sayılmaz. İptal tüm işi başarılı göstermez; sonraki denemede tamamlanmış parçalar kullanılabilir.

Kurtarma sonucunda dosya yazılabilse de ilk motor nedeni kaybolmasın diye bounded `DUB_FAILURE` tanısı eklendi. Bu hata ortadan kalktı demek değildir; review/failed grup durumu korunur. Service, sıfır çıkış koduna rağmen gerçek WAV/sync yoksa başarı üretmez.

**Geliştirme sırasında yakalanıp düzeltilen yeni regresyon:** Windows Python stdin locale kodlaması, Node'dan UTF-8 JSON ile gelen `Çıktı` yolunu `Ã‡Ä±ktÄ±` olarak okuyabiliyordu. Gerçek main/preload/worker testi exit0 fakat yanlış yerde dosya nedeniyle dürüstçe error verdi. Worker stdin'i açık UTF-8 yapıldı; aynı test Türkçe `Downloads/Sesler/Çıktı` yolunda done/WAV ile geçti. Bu önceki sürümden kalmış bir bug diye sayılmıyor.

### 5. Gruplama kalitesi ve A/B dinleme

Aynı sentetik Türkçe metin satır ayrı ve akıcı tek blok halinde üretildi. Ek olarak aynı referansla yeniden üretim ve hafif genliği değiştirilmiş sentetik referansla değiştirme sınandı. Grupların konuşma denetimi, sayı/olumsuzluk, enerji, sessizlik ve200ms üzeri duraklar karşılaştırıldı. `tools/compare-dub-audio.py` iki veya daha fazla gerçek WAV ve sidecar'dan JSON + yerel `listen.html` oluşturur; dosyaları değiştirmez.

Komut: `backend/venv/Scripts/python.exe tools/compare-dub-audio.py A.wav B.wav --output comparison-folder`.

Bu metrikler insan doğallığı veya duygu/ton devamlılığı puanı değildir. Dinleyici çalışması yapılmadı; öznel olarak akıcı mod kesin daha iyi denmedi, varsayılan gruplama değiştirilmedi. Kullanıcının dinlemesi için A/B sayfası hazırlandı. Kişisel ses yerine önceden sentezlenmiş referans kullanıldı.

## Dosya sorumlulukları

| Dosya | Amaç |
|---|---|
| `tools/voxcpm2/dub_runtime.py` | Aşama ölçümü, kapasite seçimi, tek asyncio/model/ref/verifier oturumu, güvenli reset |
| `tools/voxcpm2/dub_worker.py` | UTF-8 özel stdin iş döngüsü ve açık iş bitiş çerçevesi |
| `tools/voxcpm2/altyazi_oku.py` | Oturum/ölçüm entegrasyonu, referans snapshot, fiili paralellik, seed kurtarması, performance sidecar |
| `src/dub-engine-worker.js` | Tek child sahibi, iş çıktısı sınırı, crash/idle/belleği bırakma yaşam döngüsü |
| `src/dub-service.js` | Kalıcı veya tek-sefer süreç seçimi, phases/engine IPC, özel ayar, cleanup ve releaseIdle |
| `src/main.js` | Whisper/canlı ASR/benchmark öncesi hazır motoru bırakma; benchmark voice busy koruması |
| `src/renderer/index.html` | Hazır tutma checkbox'ı, açıklama ve süre satırı |
| `src/renderer/dub-generator-ui.js` | EN/TR ayar/süre gösterimi ve çalışan iş kilidi; yerelleştirme değişiminde yeni alanları yenileme |
| `tools/compare-dub-audio.py` | Yan etkisiz A/B rapor ve yerel ses dinleme sayfası |
| `tests/dub-engine-worker.test.js` | İş ayrımı, bölünmüş çerçeve, reuse, crash, idle cleanup |
| `tests/test_dub_runtime.py` | Kapasite, ref hash/prompt ayrımı, sıcak kapasite ve phase ölçümü |
| `tests/test_dub_generation_quality.py` | Mevcut16 sınır + takılan son grup seed değişimi |
| `tests/dub-service.test.js` | Tek-sefer yolunu açık seçerek mevcut servis kapsamını koruma; phases sınır/validasyon |
| `tests/dub-generator-ui.test.js` | Yeni checkbox ve süre alanı; mevcut iptal/senkron seçimleri |
| `tests/electron-dub-runtime.smoke.js` | Gerçek Windows DOM/preload ile yeni UI görünümü; kontrollü main handler/event yanıtları |

## Kanıtlar ve sonuçlar

### Kontrollü kontroller

- `node tests/process-lifecycle.test.js`:10kontrol, gerçek Windows parent/grandchild iptali dahil geçti. İlk sandbox denemesi EPERM verdi; uygun süreç izniyle yeniden geçti. EPERM başarısı diye sunulmadı.
- `node --test --experimental-test-isolation=none tests/dub-engine-worker.test.js`:2 davranış geçti.
- `node tests/dub-service.test.js`, `node tests/dub-generator-ui.test.js`: geçti; testleri sırf yeşil için gevşetme/silme yok. Mevcut service fixture artık `keepEngine:false` seçerek tek-sefer yolunu açık test eder; yeni worker ayrı davranış ve gerçek entegrasyonla doğrulanır.
- Python: `test_dub_runtime.py`4, `test_dub_generation_quality.py`17, `test_dub_module_paths.py`1, `test_dub_timing.py`14: **36 test OK**. Son grup takılması, ilk başarılı parçanın korunması, yalnız eksik parçanın devamı, kesilen ek doğrulama adayının korunması ve değişen seed kapsanır. Hardware üzerinde her iptal yarışının ispatı değildir.
- Değişen JS `node --check`, Python `py_compile`, `git diff --check` geçti.
- Native Windows UI: `.uiprev/dub-runtime/1792883916261-13636/`: koyu/TR1300×950, açık/EN900×800 ve125% uygulama zoom'u; checkbox, süreler, kilit ve başarısızlık sonrası açılma geçti. Model olayları bu smoke'da fixture. Ara harness'in sandbox bridge'ini değiştirme denemesi işe yaramadı; test gerçek main handler fixture'larına taşındı. Görünmez pencere `UnknownVizError` verdi; görünür ama odak almayan pencereyle yeniden geçti. OS DPI değişmedi.

### Gerçek RTX4070 SUPER / VoxCPM2 / nano-vLLM

GPU adı yeniden okundu: RTX4070 SUPER12GB. İlk okuma1124MiB kullanım,12282MiB toplam. Ses, referans ve SRT sentetiktir; kullanıcı referansı/API/key yok. İnternet veya model indirmesi yapılmadı.15 adım/CFG1.65 korunur. Batch'ler farklı akustik seed/force ve cache durumları içerir; sonuçlar eş koşullu bilimsel hız testi değildir.

1. İlk uygulama ölçümü `.uiprev/dub543-benchmark-1792883414304/`: satır ayrı iki parça45.356s; model19.235s, referans3.281s, sentez birikimi17.281s, doğrulama11.094s. İki grup ready/passed. Sonraki birleşik işte sıcak model/ref reuse görünmesine rağmen60s stall ve restart oldu; toplam102.986s. Üçüncü işte tekrar model yüklemeleriyle74.134s. Bu ara sonuçlar gizlenmedi; kapasite büyütmek için gereksiz reload'u kaldırma, eksik gruba admission ve seed kurtarması değişikliklerini yönlendirdi.
2. Sonraki gerçek koşu `.uiprev/dub543-benchmark-1792883674086/`: ilk cold-flow17.551s fakat model arızasından sonra önceki cache sesi **review** olarak kurtarıldı; bunu soğuk üretim başarısı sayma. Ara model hatasının tam nedeni o koşuda loga basılmıyordu; bu eksik son `DUB_FAILURE` tanısına yol açtı. Sonraki warm-flow89.294s, model yükleme toplam63s dahil; yeni tek blok ready/passed. Warm-lines16.728s (bir parça cache + bir parça üretim), model0/ref0.016/sentez10.36/doğrulama6.297s; iki grup ready/passed. Warm-ref-change19.405s, model0/ref0.531/sentez15.469/doğrulama3.156s; yeni referansla tek grup ready/passed. Bu son iki işte engine yeniden yüklenmedi. Referans değişimi eski prompt'u kaldırma yolunu gerçekten kullandı.
3. A/B `.uiprev/dub543-benchmark-1792883674086/comparison/listen.html` ve `comparison.json`: üç11.0sn çıktı. Satır ayrı ve akıcı dosyalarda tüm ilgili gruplar ready/passed; kayıp/ek sayı, olumsuzluk ve birim hatası işaretlenmedi. Yeni referans yalnız0.92genlikli aynı sentetik ses olduğundan farklı insan sesine klon doğruluğu kanıtı değildir. Sessizlik enerji eşiği tanısaldır; oyunculuk/vurgu puanı değildir.
4. Gerçek Electron main/preload → `dub:start` → Node warm-worker → Python ana iş → WAV → phases → terminal done: `.uiprev/dub543-service-1792884104819/` geçti. Bu entegrasyon **cache parçalarını** kullandı, yeni GPU sentezi değildi. Ayrı Downloads kökü ve profil kullanıldı; gerçek `Sesler/Çıktı` Unicode yolu ile dosya yazıldı. Önceki UTF-8 regresyon denemesi `.uiprev/dub543-service-1792884071285/` error idi ve düzeltilmeden başarı sayılmadı.

Ham WAV/profile/log/HTML ignored `.uiprev` ve `tmp` altında; Git'e dahil değil. Dosyalar, zamanlama/kalite sidecar'ları ve worker çıktısı gerçek kanıttır. Bu görevde insan gibi duyulduğunu duyusal olarak puanlamadım. İlk sorundaki11sn/5dk her koşulda çözüldü iddiası yok; model arızaları ve seed kaynaklı takılmalar hâlâ mümkün, bounded kurtarma ve tanısı var.

## Kullanım ve sınırlar

Altyazıdan ses üret → Üretim tercihi → “Üretimden sonra motoru60s hazır tut”. Aynı profil/referansla kısa aralıkta yeni işte engine/reference reuse olur; idle süresi dolarsa model yeniden yüklenir. Kapatma sonraki işte tek-sefer yolunu seçer, toggle anında mevcut worker'ı durdurma işlemi değildir. Başka Whisper işi otomatik bırakır. Rapor/süre satırları üretimden sonra ve hata halinde alınan ölçümleri gösterir.

Yeni bağımlılık, pip/npm kurulumu, model indirme ve lock/install/start değişikliği yok. `dub-settings.json` opsiyonel `keepEngine` eklenir; yeni `.performance.json` sidecar vardır. Mevcut cache, SRT zamanları, varsayılan ses kalitesi, CFG/temperature, kişisel referanslar değiştirilmedi. Sıcak doğrulayıcı CPU belleği tutabilir;60s idle'da o da kapanır. Düşük VRAM kapasite sınırları fixture ile, gerçek tek ekran kartındaki serbest bellek noktaları ise yukarıdaki GPU denemeleriyle sınandı; geniş kart/stres matrisi yok.

Gerçek normal `start.bat` açılışı, temiz kurulum, tüm npm test, Linux UI, uzun YouTube, DRM ve farklı gerçek insan referansları bu tur çalıştırılmadı. Windows GPU denemelerinde mevcut engine torch DLL ve repo ffmpeg PATH'i açık kuruldu. CI açık/arka planda; sonuç beklenmez veya görülmeden yeşil denmez. Kod ayrı PR'a gönderilir; bu tur ana programa/ana dala otomatik alınmaz.
