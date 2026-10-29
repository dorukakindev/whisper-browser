# Rapor782 — Gerçek Windows ffsubsync/FFmpeg iptal kabulü

## Kapsam ve sonuç

Ürün başlangıç/bitiş `f6ffc3d48e0394b1e49974e4059356fe1148dac3`. Runtime değişmedi; R780 süreç kapanışı düzeltmesinin açık kalan gerçek FFmpeg kabulü tamamlandı. Yeni bug veya yeni ürün özelliği sayılmaz. Önceki gece1000 kaydı gerçek Windows alt süreç/GPU entegrasyonunu kapsamıyordu; bu çalışma o boşluğa yönelik sınırlı kanıttır.

Kurulu Python, ffsubsync0.5.1 ve FFmpeg ile1800s sentetik WAV üzerinde ses-VAD hizalaması başlatıldı. Windows Toolhelp anlık görüntüsü işin gerçek python/conhost/python/ffmpeg ağacını gözledi. Node spawn adaptörü gerçek yürütülebilir dosyayı değiştirmedi; yalnız gözlemledi. Her testten sonra35s sentetik MP4 üzerinde3cue yeni hizalama yapıldı.

| Yol | Terminal süre | Close sınırı | Gözlenen süreçler | Temizlik | Sonraki iş |
|---|---|---|---|---|---|
| Abort | İstekten73.186ms; toplam588.318ms | Ana süreç close, hata sonucundan önce | Gözlenen4PID kapalı | İş temp dizini yok | 3cue,599.520ms |
| Timeout1000ms | Başlangıçtan1074.042ms | Ana süreç close, hata sonucundan önce | Gözlenen4PID kapalı | İş temp dizini yok | 3cue,607.433ms |

[Kesin sonuç](evidence782/result.json). Abort süresine sonraki hizalama süresi katılmadı. Önceki kesintili tmp/r781 ölçümü bu ayrımı yapmadığından bu raporun kesin kanıtı olarak kullanılmadı. İlk yeni koşu da geçti; yayımlanan son koşu bağımsız tekrar üretilebilir fixture scriptiyle, aynı ürün HEAD'inde exit0 geçti.

## Tekrar çalıştırma

Çalışma dizini repo kökü olmalıdır. Kendi kişisel sesiniz yerine3–9s mono sentetik konuşma WAV kullanın. Mevcut backend venv içinde soundfile/numpy/ffsubsync gereklidir; yeni bağımlılık kurulmadı. Üç scripti `tmp/r782/` altına kopyalayın. Bu scriptler test dosyalarını yalnız o dizinde oluşturur. Örnek PowerShell:

```powershell
New-Item tmp/r782 -ItemType Directory -Force
Copy-Item docs/raporlar/evidence782/fixture.py,docs/raporlar/evidence782/observe.py,docs/raporlar/evidence782/run.cjs tmp/r782/
$env:WHISPER_TEST_PYTHON = (Resolve-Path backend/venv/Scripts/python.exe).Path
$env:WHISPER_TEST_FFMPEG = 'C:/ffmpeg/bin/ffmpeg.exe'
& $env:WHISPER_TEST_PYTHON tmp/r782/fixture.py <synthetic-speech.wav>
node tmp/r782/run.cjs
```

Scriptler sırasıyla fixture, gerçek Windows Toolhelp gözlemi ve iptal/timeout→yeniden iş kabulüdür. Büyük WAV/video, yerel PID ve kişisel profil depoya eklenmedi. Sonuç dosyası yalnız süreç isimleri, zamanlar, HEAD ve boolean kanıt içerir. Gözlemci tüm makinenin komut satırlarını veya anahtarlarını okumaz.

## Sınırlar

- P008/P047/P078 için gerçek hizalama motoru iptal/timeout kabulüdür. Tüm motor/aşama kombinasyonlarının tamamlandığı anlamına gelmez.
- Yalnız gözlenen PID'lerin kapandığı doğrulandı; kısa ömürlü gözlenmemiş her alt süreç için genel ispat değildir.
- Sonraki3cue hizalama çalıştı; insan senkron tercihi veya gerçek sezon kalitesi ölçülmedi.
- Electron düğmesi, fiziksel dosya seçici, kişisel start.bat, GPU/CUDA ve gerçek site çalıştırılmadı. Önceki R779 gerçek sezon hizmeti ve R777 UI kanıtları ayrıdır.
- Runtime/test paketi değişmedi; yalnız kanıt scriptleri ve belgeler eklendi. Tam npm/CI tekrar edilmedi; uzun CI beklenmez. Ürün90 hedefi hâlâ aktif.
