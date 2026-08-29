# Katkı rehberi

Teşekkürler! Bu depo Windows + NVIDIA GPU hedefli, yerel çalışan bir altyazı
uygulamasıdır. Katkı vermeden önce birkaç pratik nokta:

## Kurulum

```bat
install.bat
```

venv oluşturur, CUDA 12.1 için PyTorch, faster-whisper, yt-dlp ve npm
bağımlılıklarını kurar. Uygulamayı **her zaman** şununla başlatın:

```bat
start.bat
```

`npm start` tek başına yetmez — faster-whisper'ın cuDNN/cuBLAS DLL'leri
`start.bat` tarafından PATH'e eklenir; aksi halde model GPU'da yüklenirken
`cublas`/`cudnn` hatası alırsınız.

## Test

```bash
npm test
```

Node testleri (`tests/*.test.js`) + Python testleri
(`backend/test_transcribe.py`) çalışır. Testler GPU, model indirmesi veya ağ
gerektirmez; venv kurulu değilse Python kısmı atlanır.

Değişiklikten sonra sözdizimi kontrolü:

```bash
node --check src/main.js && node --check src/renderer/renderer.js
python -m py_compile backend/transcribe.py
```

## Mimarinin bilinmesi gereken kısımları

Ayrıntılar `CLAUDE.md` dosyasında; en kritik üç kural:

1. **Üç süreç, tek yön veri akışı.** Renderer'ın Node'a erişimi yoktur
   (`contextIsolation: true`). Yeni bir yetenek = `preload.js`'te bir `api`
   metodu + `main.js`'te bir `ipcMain.handle`.

2. **Yeni bir backend seçeneği eklerken sözleşmeyi DÖRT yerde senkron tutun:**
   `backend/transcribe.py` (argparse + iş mantığı) → `src/main.js`
   (`options.X` → `args.push`) → `src/renderer/renderer.js`
   (`buildOptsFromUI` + kalıcılık listeleri) → `src/renderer/index.html`
   (kontrol). Bu senkronu `tests/main-args.test.js` kısmen korur.

3. **Gizli anahtarlar argv'ye ASLA girmez.** HF token ve API anahtarları ortam
   değişkeniyle geçer (`WHISPER_HF_TOKEN`, `WHISPER_LLM_API_KEY`,
   `WHISPER_TRANSLATE_API_KEY`) — süreç listesinde ve iş günlüklerinde
   görünmesinler diye. Yeni gizli alan eklerseniz aynı kalıbı izleyin.

## Konvansiyonlar

- Kullanıcıya görünen **tüm metinler Türkçe** (log, hata, etiket).
- SRT ve ASS çıktıları **UTF-8 BOM** ile yazılır (Windows oynatıcıları);
  JSON bilinçli olarak BOM'suz.
- `index.html` içindeki CSP katıdır (`script-src 'self'`): inline script
  eklemeyin, harici CDN kullanmayın.
- Altyazı dosyasına yazan her yol `backupOnce` + `writeSubtitleAtomic`
  kullanmalı (bir kez `.bak`, sonra `.tmp` → rename).

## Hata bildirimi

Uygulama her iş için `%APPDATA%/whisper-altyazi/logs/` altına günlük yazar.
Bildirime günlüğü eklerseniz teşhis çok kolaylaşır. Günlükte API anahtarı
bulunmaz (yukarıdaki 3. kural), yine de göndermeden önce göz atın.

Şunları da yazın: Windows sürümü, GPU modeli ve VRAM, seçili model/motor,
video kaynağı (yerel dosya / YouTube).
