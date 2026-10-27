# Rapor660 — Gerçek yerel müzik analizi, Paket1

2026-10-27. Başlangıç master: `efcec22f8277e89a0f882b4e9592ffea6ac1020c`. Bitiş ürün kodu: `6e1d80be5651eae36629b03d94daa9c8287c43c2`. Dal: `codex/music-analysis660`.

## Teslim edilen hedef

Müzik rafında **Müziği analiz et**, her müzik satırında **Analiz et**. Kullanıcı bir yerel ses dosyası seçer veya kayıtlı kitaplık parçasını ID ile açar. Koyu grafit/amber analiz penceresi gerçek PCM'den dalga formu, zamana göre RMS dBFS, spektral bas/orta/tiz oranları ve tahmini tempo gösterir. Dalga formu üzerinde sürükleyerek aralık seçilir; grafik tıklaması ve klavye okları sesin ilgili zamanına gider. Analiz 1 saniye–30 dakika ve 1 GB kaynak sınırıyla çalışır. Seçim zamanları orijinal dosya zamanlarıdır. Kaynak dosya değiştirilmez.

## Veri ve kaynak sözleşmesi

- FFT/power, RMS ve waveform doğrudan sesten. dBFS ölçümü LUFS değildir; mono downmix sonrası ölçülür. Frekans bantları enstrüman değildir. Tempo onset autocorrelation tahminidir; yarım/çift tempo ve düşük güven belirsizliği vardır. Algılanan müzikal tempo doğruluğu gerçek şarkılarda henüz kıyaslanmadı.
- Duygu, enstrüman, vokal tanıma ve tonalite desteklenmiyor; capabilities false. Uydurma radar/duygu çizgisi veya benzerlik yüzdesi yok. Backend chroma ölçer ancak bunu tonalite adı olarak sunmaz.
- Mevcut NumPy2.4.6, Python ve ffmpeg/ffprobe kullanılır. Yeni bağımlılık, model, ücretli servis veya upload yok. CPU alt süreci, GPU/Whisper/Torch paketlerini değiştirmez. Mevcut kurulmuş venv kullanılır; bu paket bağımsız bir ML ortamı kurmaz.
- Main tarafında kullanıcı seçimi için kayıtlı kaynak UUID; renderer keyfi dosya yolu gönderemez. Kitaplık açılışında kalıcı kayıttaki gerçek path çözülür. IPC gönderici doğrulaması ilk kapıdır. Gizli ortam değişkenleri ortak run yardımcısıyla ayıklanır.
- Bir pencere için tek etkin analiz. Gerçek probe/hash/decode/measure aşamaları, ID eşleşmeli polling, iptal, kapanışta iptal ve geç cevap reddi. İptalde süreç ağacı durdurulur; decode temp temizliği süreç kapanışını bekler.
- İçerik SHA256 + aralık + algoritma sürümü ile önbellek; farklı içerik yeni analizdir. userData/music-analysis altında en fazla24 kendi JSON kaydı. Disk cache API anahtarı veya ses örneği içermez. Hash öncesi/sonrası kaynak stat değişirse sonuç reddedilir.

## Gerçek kanıt ve doğrulama

- `node --test --test-isolation=none tests/music-analysis.test.js`:3 PASS. Sahte kaynak ID reddi, aralık, aynı içerik/aralık cache, değişmiş içerik, tek iş ve iptal, yetkisiz IPC.
- `backend/venv/Scripts/python.exe tests/test_music_analysis.py`:4 PASS. Sessizlik/NaN/çok kısa/çok uzun; 120Hz .5 amplitude sinüste RMS -9.03dBFS ve peak -6.02dBFS; bas→tiz zaman değişimi. Bunlar kalibrasyon sinyalleridir, müzik modeli kabulü değildir.
- `tests/preload-sandbox.test.js`, `tests/coverage-map.test.js`, `tests/ipc-parity.test.js`:PASS. IPC278handle/17on, yeni kanal yetkili.
- `tests/media-shelf-service.test.js`:sandbox koşusunda Python probe engeli; native yetkiyle3 PASS. Test/eşik değiştirilmedi.
- `npm run test:electron-bridge`:PASS.
- JS node --check, Python py_compile, git diff --check:PASS.
- `tests/electron-music660.smoke.js`:gerçek Windows Electron, ffmpeg/ffprobe/Python/NumPy, ayrı profil. Türkçe yol, tam24sn analiz, grafikte9.6sn seek, 8–16sn yeniden ölçüm, cache, iptal, kapanış/yeniden açılış, kitaplık ID kaynağı, EN boş ekran,720px tek sütun/yatay taşma yok. Dosya seçici yalnız test fixture'ına yönlendirildi; fiziksel picker etkileşimi sınanmadı.
- İlk native denemelerde kapanış event'ine bağlı temizlik gecikmesi çıktı. Kapat/Escape/close yolları idempotent cleanup ile birleştirildi; son native kabul geçti. Renk için mevcut media-surface CSS önceliği düzeltildi. Ekran görüntüsü compositor güncelliği iki animation frame beklenerek doğrulandı; eski görüntü başarı sayılmadı.
- Son native kanıt: `.uiprev/music660/1793124766365`. Seçili temiz sentetik görüntüler ve yol içermeyen özet aşağıdaki kanıt dizininde.

## Tasarım incelemesi

frontend-design ve make-interfaces-feel-better: full kapsam bu yeni dialog + raf giriş düğmeleri; düz CSS/mevcut IBM Plex Sans. Tipografi, yüzeyler, ikon, hareket ve performans dosyaları/kod yolları incelendi; gerçek TR geniş/dar ve EN boş ekran görüldü. Hiyerarşi tek dalga formu, üç ölçüm ve iki detay grafiği; dar ekranda alt alta. 42px düğme, görünür focus, tabular sayılar, reduced-motion; transition all yok. Hover/press geçişleri160ms. Animasyonu %10 hızda araçla inceleme yapılmadı. Gerçek kullanıcı dinleme kalitesi, ekran okuyucu ve farklı DPI/ışık tema görüntü kabulü doğrulanmadı.

Reddedilenler: hissiyat için sahte mood eğrileri (ölçüm yok); yeni chart framework (mevcut canvas yeterli); grafiklerle dolu aynı büyüklükte kart panosu (dinleme/inceleme hiyerarşisini bozar). Açık yüksek etkili görsel bulgu saptanmadı; yukarıdaki doğrulanmamış kapsamlar devam eder.

## Sınırlar ve sonraki hedef

Bu yalnız ilk çalışan ürün paketidir. Gerçek embedding/model seçimi, yerel yakınlık indeksi, internet/Cyanite araması, A/B karşılaştırma, duygu/enstrüman modelleri ve asistan müzik araçları HENÜZ YOK. Sonraki hedef gerçek müzik embedding adaylarını dinleme karşılaştırmasıyla seçip yerel arşiv sıralamasını bu ekrana bağlamak. Dalga formu zoom da sonraki UI paketidir; şu an aralık seçimi/seek vardır.

Tam npm test ve uzun CI beklenmedi. start.bat/install.bat değiştirilmedi; kişisel uygulama kapatılmadı, start.bat üzerinden yeni oturum/GPU kabulü yapılmadı. Native koşuda11before-quit listener MaxListeners uyarısı görüldü; test başarılı olsa da bu uyarı çözüldü diye iddia edilmiyor. Mevcut açık uygulama yeni kodu kendiliğinden yüklemez; sonraki normal yeniden açılışta görünür.
