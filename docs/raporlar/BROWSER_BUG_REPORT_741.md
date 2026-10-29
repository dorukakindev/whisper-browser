# Rapor741 — Metin motorunda akış ayrımı ve son işlem durumu

## Doğrulanan hata
Metin motorunun stdout ve stderr verisi aynı pending satır tamponunda birleştiriliyordu. stdout `[1/` yazdıktan sonra stderr tanısı geldiğinde asıl ilerleme satırı bozulabiliyordu. Kapanışta satır sonu olmayan parça hiç parse edilmiyordu. Parent servis regresyonu1PASS/1FAIL verdi; [kanıt özeti](evidence741/before.txt). Bu ses üretiminin kaybolduğu iddiası değildir: ilerleme kaybı ve yanlış aşama görünümüdür.

## Düzeltme ve dosyalar
- `src/text-voice-studio.js`: stdout/stderr için ayrı,65536karakterle sınırlı satır tamponu; taşan satır kuyruğu yeni protokol satırı sayılmaz. Yalnız stdout'un başında bulunan geçerli0<=done<=total sayaçları ilerlemedir; stderr tanısındaki sayaç ve düz metnin ortasındaki `[9/9]` olay değildir. Kapanışta kalan son satır işlenir. stdout/stderr tanı kuyrukları ayrı tutulur; mevcut engine.log ve UI kuyruğu korunur.
- Aynı dosyada mevcut kurulu motorun açık Referans hazır/üretim ve Tüm parçalar hazır/birleştiriliyor günlükleri aşama değişimine dönüştürülür. İş başlangıcı model_load, bilinen motor satırı/sayaç synthesis, birleştirme satırı postprocess; başarılı süreç kapanışından sonra gerçek validVoiceOutput kontrolü output_check. İptalde yeni aşama/ilerleme üretilmez. Gözlenen sınır süreleri mevcut job.json phases alanına, son sayaç progress alanına yazılır; yeni kalıcı şema yok.
- `src/renderer/text-voice-studio.js`: EN/TR son işlem ve dosya kontrolü metinleri. Sayaç toplamına ulaşınca en fazla99%; yalnız doğrulanmış done100%. İptal durumunu gelen status/progress ezmez. Metin üretiminde ASR çalıştırılmadığı için dosya kontrolü Konuşma doğrulanıyor diye sunulmaz.
- `tests/text-voice-studio.test.js`: split stdout/stderr ve son satır repro; taşan satır, stderr sahte sayaç, geçersiz5/1 ve düz metin sayaç reddi, aşama sırası, kalıcı sürelerin sonlu/negatif olmayan değerleri ve son ilerleme.
- `tests/electron-text-voice.smoke.js`: kontrollü etkin iş4/4 sayacı99da kalır; postprocess TR/EN doğru, output_check doğru ve iptal durumu korunur. Önceki sahiplik/referans/hata deneyimi kontrolleri regresyon olarak birlikte koştu; yeni keşif sayılmadı.

## Kanıt ve kaynak
- `node --test --test-isolation=none tests/text-voice-studio.test.js tests/preload-sandbox.test.js`:3PASS/0skip. Değişen JS syntax/diffPASS.
- Gerçek Windows Electron ayrı profil native exit0; motor olayları kontrollü. [Ölçüm](evidence741/acceptance.json), [TR koyu son işlem](evidence741/studio-postprocess-tr.png) gerçekten açılıp incelendi. Önceki ortak tema/dar/kontrast akışları aynı koşuda geçti; yeniden tasarım iddiası yok.
- Kurulu `nanovllm_oku.py`, `kitap_voxcpm.py`, `kitap_ortak.py` yalnız okunarak günlük biçimi kontrol edildi; dış motor dosyaları değiştirilmedi. Mevcut tek-iş olay/log sözleşmesi kullanıldı. [Node child_process resmî dokümanı](https://nodejs.org/api/child_process.html#subprocessstdout) bağımsız stdout/stderr akışları ve close davranışı yönünden incelendi. Harici repo kodu/yeni bağımlılık alınmadı.

## Sınırlar
Günlükten türetilen model_load süresi başlangıç/ön hazırlığı da kapsar; modelin iç GPU kernel süresi değildir. postprocess birleştirme/normalizasyon/isteğe bağlı hizalamayı birlikte kapsar. Motor bu alt aşamaların başlangıcını ayrı bildirmediğinden her biri için kesin süre veya ayrı başarı uydurulmadı. Metin içi satır protokolünün bağımsız NDJSON'a taşınması yapılmadı; desteklenen mevcut motor günlükleriyle uyumludur. Değişmiş harici sürümün bütün logları garanti edilmez.

Yeni gerçek GPU/TTS/API/YouTube/DRM, insan kalite tercihi ve start.bat etkileşimli kabulü yok. Tam npm/CI sonucu beklenmedi;CI açık. Mevcut11before-quit listener ve kontrollü kapalı ağ filtre uyarısı sürer. Kişisel profil/dosya/pano değiştirilmedi; Windows yolları ve Türkçe arayüz native koşuda kullanıldı. P007/P041/P046/P097 kısmi ilerleme;90hedef devam,müzik kapsam dışı.
