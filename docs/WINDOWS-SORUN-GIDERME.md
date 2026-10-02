# Windows Sorun Giderme Rehberi

Gerçek Windows koşularında (`D:\Whisper Local`, RTX 4070 Ti) doğrulanmış kurulum,
CUDA, dosya yolu ve izin sorunları — her çözüm aynı ortamda görülen davranışa
dayanır. Yeni bulgular `docs/raporlar/BROWSER_BUG_REPORT_*.md` serisinden alınır.

## Kurulum

### `install.bat` yarıda kesildi / venv bozuk
- Belirti: `python.exe` çalışmıyor veya `venv` klasörü eksik paket içeriyor.
- Çözüm: `backend\venv` klasörünü silip `install.bat`'ı tekrar çalıştırın.
  Kurulum betiği `.venv-installing-*` / `.venv-backup-*` dizinlerini temizler;
  elle silmeden önce uygulamanın kapalı olduğunu doğrulayın.

### PyTorch CUDA sürümü uyuşmazlığı
- Belirti: kurulum `TORCH_INSTALL` adımında hata veriyor.
- Neden: betik `torch==2.5.1+cu121` ve `torchaudio==2.5.1+cu121`'i yalnızca
  `https://download.pytorch.org/whl/cu121` indeksinden kurar — genel PyPI
  paketleri CPU build'idir.
- Çözüm: betiği güncelleyin; farklı bir CUDA sürümü gerekiyorsa
  `tools/install-orchestrator.js` içindeki `TORCH_INDEX`/`TORCH_PINS` sabitleri
  tek yerden değişir.

### Eksik FFmpeg
- Belirti: transkripsiyon "ffmpeg bulunamadı" ile durur.
- Çözüm: Windows x64 statik build'den `ffmpeg.exe` + `ffprobe.exe`'yi
  `backend\bin\` altına koyun (ikisi birden gerekli) veya PATH'e ekleyin.

## GPU / CUDA

### cuDNN/cuBLAS "DLL bulunamadı" hatası
- Belirti: `npm start` ile açınca model yüklenirken `cublas`/`cudnn` hatası.
- Neden: faster-whisper'ın ihtiyaç duyduğu cuDNN/cuBLAS DLL'leri PATH'te
  değildir — `start.bat` bunları ekler, `npm start` eklemez.
- Çözüm: uygulamayı her zaman `start.bat` ile açın. El ile çalıştıracaksanız
  `start.bat` içindeki PATH satırlarını kopyalayın.

### CUDA OOM (bellek yetersiz) — RTX 4070 Ti 12 GB
- Belirti: büyük model + pyannote birlikteyken `cublas_status_alloc` veya
  `cudnn_status_alloc` hatası.
- Davranış: B-329-02 sonrası backend CUDA OOM'da işi tümden düşürmez —
  CPU'ya geri döner (yavaş ama tamamlanır).
- Önleme: model boyutunu küçültün (large-v3-turbo yerine small/medium) veya
  konuşmacı tanımayı ayrı işte çalıştırın.

### GPU'suz makinede yanlış rozet
- Çözüldü (B-372/raporlar): `nvidia-smi` yanıt vermezse rozet dürüstçe
  "GPU yok" gösterir ve işler CPU'ya düşer; kayıtlı cihaz tercihi ezilmez.

## Dosya yolları

### 260 karakter üzeri yollar (`D:\Whisper Local\...\derin-klasörler`)
- Belirti: uzun yollarda dosya kaydı/açılması başarısız.
- Çözüldü: paketlenmiş exe `longPathAware` manifest bildirimi içerir
  (`tools/windows-manifest.js`, RT_MANIFEST yaması). Kaynak çalıştırmada
  Windows Registry'de `LongPathsEnabled=1` açın veya kısa kök kullanın.

### Türkçe/boşluklu klasör yolları
- Durum: `D:\Whisper Local` dahil boşluklu ve Türkçe karakterli yollar
  doğrulanmıştır (çalışma kökü zaten öyledir). Tüm spawn argümanları
  `=` biçimine bağlanır; `subtitles=` filtre yolu tek tırnakla kaçışlanır.

### Defender / indeksleyici kayıt kilidi (ERROR_ACCESS_DENIED / EBUSY)
- Belirti: "dosya kullanımda" benzeri yazma hatası.
- Davranış: atomik yazıcı `renameSyncResilient` Windows kilit penceresini
  tolere eder (kısa yeniden deneme); kalıcı kilitte dosya korunur ve
  hata günlüğe düşer. Antivirüs dışlama kuralı eklemek isterseniz
  `D:\Whisper Local` ve `userData` dizinini kapsayın.

## Güncelleme / yükseltme

### Yeni sürüm öncesi
- Uygulama içinden: Ayarlar → Bakım → **Güncelleme ön kontrolü** — açık işler,
  bağımlılıklar ve disk alanı tek ekranda listelenir; "Yedeği şimdi al"
  düğmesiyle tam yedek alınabilir.
- Sürüm değişimi ilk açılışta userData'daki JSON durum dosyalarını
  `preupgrade-backup\<eski-sürüm>\` altına otomatik kopyalar.

### yt-dlp güncellemesi başarısız
- Belirti: `yt-dlp'yi güncelle` hata dönüyor.
- Çözüm: iş çalışırken güncelleme engellenir — kuyruğu bekleyin. İnternet
  yoksa kapı çevrimdışı durumu gösterir. Kalıcı hatada `backend\venv` üzerinden
  `pip install -U yt-dlp` de çalışır (sürüm kilidini aşmak için constraints
  dosyasına bakın).

## Sorun bildirirken
- Ayarlar → Tanıtım çıktısı / günlük penceresi satırlarını kopyalayın.
- `KURULUM_TEDARIK_ZINCIRI.md` paket bütünlüğü kontrollerini,
  `docs/INSTALLATION.md` platform ayrımlarını listeler.
