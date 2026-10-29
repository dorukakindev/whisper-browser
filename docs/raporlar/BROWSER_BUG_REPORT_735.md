# Rapor735 — Gerçek GPU kitap, tek grup onarımı ve M4B kabulü

Başlangıç master a96e19e1e81c632de9e94be9e2192d318f4b6fbf. Dal codex/book-gpu735. Test kodu bitiş6d6a53296fb11d10024e17b99d7206942a0935e0. Ürün kaynakları değiştirilmedi. R728'de yalnız preflight aşamasında kalan gerçek kitap kabulünün çalıştırılmasıdır; mevcut özellik yeni eklenmiş sayılmaz.

## Gerçek Windows/GPU zinciri
RTX4070SUPER boş10339MiB ile mevcut9500MiB kabul önkoşulunu geçti. Başka süreç durdurulmadı; konservatif testönkoşulu ürünün asgari VRAM gereksinimi değildir. Ayrı uygulama profili, yalnız yazılmış Türkçe kısa TXT ve System.Speech sentetik referansla gerçek import→book-prepare→startDub→VoxCPM2/nano-vLLM→kalite→projeye kayıt çalıştı. Ana kullanıcı profili ve kişisel kitaplar kullanılmadı; ağ kapalıydı. `app.setPath(downloads)` sayesinde tüm test girdisi/çıktısı izole .uiprev/book-gpu kökünde kaldı.

İlk deneme28320 üretime başlamadan `Geçersiz ses üretim profili` ile durdu: R728'den gelen test concurrence1 seçiyordu, ürün mevcut4/8 kabul ediyor. Yalnız test4'e düzeltildi, ürün kapısı gevşetilmedi. Süreç terminaldi; aynı hatayı tekrar etmeden yeni düzeltilmiş deneme29972 başlatıldı. Bu bir ürün bugı diye sayılmaz.

| Ölçüm | İlk üretim | Yalnız son grubu onar |
|---|---|---|
| Gruplar |2yeni/0cache|1yeni/1cache|
| Model yükleme |21,656sn|0sn|
| Referans hazırlama |5,735sn|0sn|
| Sentez |38,500sn|24,157sn|
| Deneme / yeniden deneme |2/0|1/0|
| Adım |15|15|
| ASR benzerlik grup1/grup2 |0,8889/0,9020|0,8889/0,9412|

Bunlar aşama süreleri; duvar saati toplamı veya evrensel performans iddiası değil. UI4 profili gönderir, motor gerçek grup sayısına göre2/1iş yapar. Her iki aşamada tam hazırlanan iş kimliği `lastOutputId` ile projeye bağlandı; iki grup da ready, kalite reviewfalse. Gerçek ASR benzerlikleri 1.0değil, ilk Kütüphane sözcüğünün tanıması kusurlu; insan kulağı doğal anlatım/duygu/klon benzerliği doğrulanmadı.

## Onarım bütünlüğü ve M4B
- Seçilen forceGroups anahtarı doğru;1grup üretildi, diğer1cache. İlk grubun metni ve bitişi12,204291667snkorundu. Önbellek kaynağına ayrıca SHA alınmadı; birebir cachebayt korunumu iddia edilmez.
- İki nihaiWAV'ın ilk grubu byte-identical değil. Bağımsız PCM karşılaştırması korelasyon0,999999993770313; en küçük kareler gain0,9965512511; ölçek sonrası residual0,3693int16RMS. Bu tüm çıktı loudness normalizasyonuyla uyumlu. Kaynak `tools/voxcpm2/altyazi_oku.py` loudnorm_audio çağrısı ve `dub_normalize.py` iki geçişli işlem var. Ölçüm, bütün sonişlem farklarının genel matematik kanıtı değildir; yeni bir ürün kusuru diye sayılmadı.
- Gerçek FFmpeg M4B507977byte üretildi; ffprobe1bölüm / Sentetik kitap /25,616sn; tüm dosya `ffmpeg -v error -i <sentetik.m4b> -f null -` exit0. [Probe](evidence735/m4b-probe.json).
- Bu koşuda review gerektiren grup yok; reviewengelleme dalı gerçek GPU işinde çalışmadı. Önceki kontrollüR728/729 retleri yeni doğrulama diye sayılmadı.

## Test/screenshot düzeneği ve kanıt
`tests/electron-book-gpu.smoke.js`: geçerli concurrency4, arka plan renderer/occlusion bayrakları, hazır/review DOMstatebekleme+350mskare, M4BprobeJSON ve fulldecodeassert eklendi.

Gerçek GPU gövdesi concurrency4 düzeltmesiyle exit0. Sonradan eklenen ekranbekleme/probe/decode satırları için gereksiz GPUyeniden üretimi yapılmadı: aynı bitmiş testprofili tekrar açıldı, assistantstate ready/hasAudio/review0 ve .mw-chapter Hazır doğrulandı,500ms sonra güncel kare alındı; ffprobe/decode aynı gerçekM4B üzerinde terminalden çalıştı. **Son testdosyasının tamamı bu ilavelerden sonra ikinci kez uçtan uca koşuldu iddiası yok.** node--check ve gitdiffcheckPASS.

İlk yakalama önceki pendingkareyi gösterdi; diskstate readyydi. Tek başına önceki kareyi ürün bugı saymadık. Yeniden açılış DOM ve [güncel Windows görüntüsü](evidence735/ready-book.png) birlikte incelendi; ortakgrafit/amber görünüm,1hazır,M4Bdinle düğmesi var. Ayrı testUI, kişisel pencere kapatılmadı. GenişTRkoyu görüntü bu kabulün kapsamıdır; darEN/açık bu tur tekrar edilmedi.

[Üretimölçümü](evidence735/acceptance.json), [kalite+PCMölçümü](evidence735/quality-summary.json), [yeniden açılış durumları](evidence735/render-acceptance.json). Ses/M4B/profil/hamlog Git'e konmadı. Testyerel artefaktları .uiprev/book-gpu/1793232773667-29972 altında duruyor.

## Kaynaklar ve sınırlar
Mevcut ürünün book-prepare/capture/retry/export yolları ve yerleşik FFmpeg/ffprobe kullanıldı. YeniOSS/bağımlılık kopyalama/kurulum gerektiren değişiklik yok. Kaynakta runtime süreç/VRAM/ASR/ffmpeg davranışı incelendi; README iddiası başarı sayılmadı.

Gerçek GPU native test, normal start.bat etkileşimli başlangıç kabulü değildir. start/install/CUDAyolu değişmedi. Mevcut11before-quitlistener uyarısı ve izolasyondan reklam filtresi uyarısı sürer. Tamnpm/CI/DRM/gerçekhesap/YouTube/insandinlemesi/uzunkitapOOM/tümreferanslar yok. P069/P070 gerçekkısaTTSonarım/M4Bkabulü ilerledi, insan kalite tercihi ve uzun kitap ayrıca.90aktifhedef bitmedi, müzik kapsam dışı.
