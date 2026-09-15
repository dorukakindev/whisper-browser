# Kurulum ve tedarik zinciri sözleşmesi

Desteklenen temiz kurulum ortamı Windows 10/11, CPython 3.10 veya 3.11, Node.js
22.13+, Git, `ffmpeg` ve `ffprobe` içerir. Uygulamanın ürün başlangıç yolu
`start.bat` dosyasıdır; `npm start` tek başına cuDNN/cuBLAS `PATH` sözleşmesini
kurmaz.

## Durum makinesi

`install.bat`, `tools/install-orchestrator.js core` çağrısına ince bir sarmalayıcıdır.
Kurucu sırasıyla ön koşul ve lock politikası kontrolü, süreç kilidi, geçici Python
ortamı, paket doğrulaması, atomik venv değişimi, geri alınabilir Node kurulumu ve
manifest yazımı aşamalarından geçer. Hiçbir hata yolu başarı mesajına düşmez.

- Python paketleri önce `backend/.venv-installing-<pid>` altında kurulur. Eski
  `backend/venv`, yeni ortam doğrulanmadan değiştirilmez.
- Node kurulumu önce mevcut `node_modules` dizinini aynı diskte yedekler.
  `npm ci`, Electron ikili indirmesi veya doğrulama başarısızsa yedek geri gelir.
- `backend/install-state.json`, tam `pip list` manifestini ve SHA-256 değerini,
  etkin opsiyonel profilleri ve `package-lock.json` SHA-256 değerini tutar.
- İkinci çalıştırmada mevcut tam manifest ve package-lock hash'i kayıtla yeniden
  karşılaştırılır. Transitif drift varsa doğrudan pinler sağlam olsa bile staging
  kurulumu tekrarlanır.
- Canlı veya sahibi doğrulanamayan kurulum kilidi silinmez. Lock içindeki PID artık
  yaşamıyorsa crash artığı bir kez kaldırılıp edinme yeniden denenir.

## Kilit ve bütünlük kapıları

- Python doğrudan bağımlılıkları `requirements-core.lock` içinde `==` ile sabittir.
  Ana Torch ABI'si `constraints-install.lock` ile opsiyonel kurulumlarda da korunur.
- WhisperX `3.4.2`, pyannote.audio `3.3.2`, Torch/Torchaudio `2.5.1+cu121` ve
  CTranslate2 `4.4.0` birlikte kilitlidir. Eklentiler ana venv'i yerinde değiştirmek
  yerine yeni doğrulanmış venv üretir.
- Node kurulumu Windows'ta `node.exe` + kurulu `npm-cli.js` üzerinden shell açmadan
  `npm ci --ignore-scripts` kullanır. Registry paketlerinin integrity
  ve lisans metadata'sı zorunludur. Castlabs Electron Git kaynağı yalnız izin verilen
  `8244344c33634d9323377c0d0fd1d9b7f9b69540` commitinde kabul edilir.
- Castlabs ikilisi, kilitli paketin yerel `install.js` dosyasıyla indirilir; bu dosya
  paketteki `checksums.json` değerlerini kullanır. Kurucu Electron'u çalıştırmaz.
- Kaynaktan derlemeyi ve beklenmedik kurulum scriptlerini azaltmak için pip
  çağrılarında `--only-binary=:all:`, npm çağrısında `--ignore-scripts` kullanılır.

Python transitif paket arşivlerinin tamamı henüz hash'li bir PEP 751 kilidine bağlı
değildir. Tam sürümlü doğrudan kilit + çekirdek constraints çözümleyici driftini
sınırlar; gerçek çözülmüş tam manifest her kurulumda kaydedilir ve iki temiz ortam
karşılaştırılabilir. Bu kalan risk nedeniyle pin güncellemeleri ayrı değişiklikte,
iki temiz Windows sandbox manifesti karşılaştırılarak yapılmalıdır.

## Doğrudan bağımlılık ve lisans yüzeyi

| Paket | Kullanım | Lisans metadata'sı |
|---|---|---|
| faster-whisper / CTranslate2 | ASR motoru | MIT |
| torch / torchaudio | GPU ve ses tensörleri | BSD-3-Clause |
| NVIDIA cuBLAS / cuDNN | CTranslate2 GPU DLL'leri | NVIDIA proprietary |
| yt-dlp | YouTube ve medya çözümleme | Unlicense |
| openai | İsteğe bağlı LLM/çeviri istemcisi | Apache-2.0 |
| castlabs-evs | `drm-kur.bat` VMP imzalama aracı | Apache-2.0 |
| whisperx | İsteğe bağlı zorunlu hizalama | BSD-2-Clause |
| pyannote.audio | İsteğe bağlı konuşmacı tanıma | MIT |
| Electron for Content Security | Masaüstü çalışma zamanı | MIT |
| hls.js | Depoya alınmış renderer vendor dosyası; npm çalışma zamanı bağımlılığı değildir | Apache-2.0 |
| mux.js | HLS içindeki CEA-608/708 altyazı verisini MPEG-TS/fMP4'ten ayırma | Apache-2.0 |
| dom-walk 0.1.2 | mux.js'in eski dolaylı DOM uyumluluk paketi | MIT; paket `license` yerine eski `licenses` alanını yayımlar, tam sürümlü istisna kurulum politikasında kayıtlıdır |

Lisans tablosu karar desteğidir; dağıtım öncesi paketlerin kendi LICENSE dosyaları
esas alınır. NVIDIA çalışma zamanları açık kaynak değildir.

## Güvenli güncelleme

1. Pinleri ve ilgili policy/test beklentilerini aynı değişiklikte güncelleyin.
2. `node tools/install-orchestrator.js preflight` ile kilit politikasını kontrol edin.
3. Ağ/model indirmeyen failure-injection paketini çalıştırın:
   `node tests/install-supply-chain.test.js`.
4. İki boş Windows sandbox kurulumunun `packages`, `pythonManifestSha256` ve
   `packageLockSha256` alanlarını karşılaştırın.
5. Uygulamayı yalnız `start.bat` ile manuel doğrulayın.
