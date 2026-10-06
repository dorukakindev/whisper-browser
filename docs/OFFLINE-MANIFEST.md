# Çevrimdışı Kurulum Manifesti

Oluşturulma: 2026-10-06T06:42:59.850Z · sürüm 0.9.0-beta.1
Bu dosya `node tools/offline-manifest.js` ile üretilir; elle düzenlemeyin.

## Python (pip) bileşenleri

Desteklenen: 3.10–3.11 (CPython, Windows x64)
Torch CUDA indeksi: https://download.pytorch.org/whl/cu121 — torch==2.5.1+cu121, torchaudio==2.5.1+cu121

- `backend/requirements-core.lock` — 8 pin (zorunlu)
  - faster-whisper==1.2.1
  - yt-dlp[default]==2026.7.4
  - ctranslate2==4.4.0
  - nvidia-cublas-cu12==12.1.3.1
  - nvidia-cudnn-cu12==9.1.0.70
  - openai==1.109.1
  - genanki==0.13.1
  - castlabs-evs==1.3.2
- `backend/constraints-install.lock` — 11 pin (zorunlu)
  - torch==2.5.1+cu121
  - torchaudio==2.5.1+cu121
  - faster-whisper==1.2.1
  - ctranslate2==4.4.0
  - whisperx==3.4.2
  - pyannote.audio==3.3.2
  - genanki==0.13.1
  - cached-property==2.0.1
  - chevron==0.14.0
  - frozendict==2.4.7
  - PyYAML==6.0.3
- `backend/requirements-whisperx.lock` — 1 pin (opsiyonel)
  - whisperx==3.4.2
- `backend/requirements-diarize.lock` — 1 pin (opsiyonel)
  - pyannote.audio==3.3.2
- `backend/requirements-separator.lock` — 62 pin (opsiyonel)
  - absl-py==2.5.0
  - audio-separator==0.47.0
  - audioread==3.1.0
  - beartype==0.18.5
  - certifi==2026.7.22
  - cffi==2.1.1
  - charset-normalizer==3.5.1
  - cloudpickle==3.1.2
  - colorama==0.4.6
  - coloredlogs==15.0.1
  - Cython==3.3.0
  - decorator==5.3.1
  - diffq-fixed==0.2.4
  - einops==0.8.2
  - filelock==3.32.6
  - flatbuffers==25.12.19
  - fsspec==2026.7.0
  - humanfriendly==10.0
  - idna==3.19
  - Jinja2==3.1.6
  - joblib==1.6.0
  - julius==0.2.8
  - lazy-loader==0.5
  - librosa==0.11.0
  - llvmlite==0.49.0
  - MarkupSafe==3.0.3
  - ml_collections==1.1.0
  - ml_dtypes==0.6.0
  - mpmath==1.3.0
  - msgpack==1.2.2
  - narwhals==2.26.0
  - networkx==3.6.1
  - numba==0.67.0
  - numpy==2.4.6
  - onnx-weekly==1.24.0.dev20260914
  - onnx2torch-py313==1.6.0
  - onnxruntime==1.20.1
  - packaging==26.3
  - pillow==12.3.0
  - platformdirs==4.11.8
  - pooch==1.9.0
  - protobuf==7.36.1
  - pycparser==3.0
  - pydub==0.25.1
  - pyreadline3==3.5.6
  - PyYAML==6.0.3
  - requests==2.34.2
  - resampy==0.4.3
  - rotary-embedding-torch==0.6.5
  - samplerate==0.1.0
  - scikit-learn==1.9.1
  - scipy==1.17.1
  - six==1.17.0
  - soundfile==0.14.0
  - soxr==1.1.0
  - sympy==1.13.1
  - threadpoolctl==3.6.0
  - torch==2.5.1+cpu
  - torchvision==0.20.1+cpu
  - tqdm==4.70.1
  - typing_extensions==4.16.0
  - urllib3==2.7.0

## npm bileşenleri

Doğrudan bağımlılık: 16 · kilitli paket (package-lock): 193
- @electron/packager@20.3.0
- @ghostery/adblocker-electron@2.18.2
- axe-core@4.13.0
- darkreader@4.9.133
- electron@github:castlabs/electron-releases#v43.5.0+wvcus
- esbuild@0.28.2
- hls.js@^1.7.3
- imsc@1.1.5
- jassub@2.5.16
- jsdom@30.0.1
- mp4box@2.4.1
- mux.js@6.3.0
- pdfjs-dist@6.3.289
- qrcode@^1.5.4
- resedit@^3.1.0
- vtt.js@0.13.0

## Yerel binary'ler

- **ffmpeg.exe + ffprobe.exe** → `backend/bin/` (zorunlu) — Windows x64 static build (ör. gyan.dev veya BtbN). install-orchestrator ikisini de ister.
- **yt-dlp.exe** → `backend/bin/ (veya pip kurulumu)` (zorunlu) — requirements-core.lock içinde pip paketi olarak da var; standalone exe alternatif.

## Model kaynakları

- **whisper-ct2** — large-v3, large-v3-turbo, large-v2, medium, small, base, tiny
  - Kaynak: HuggingFace — Systran/faster-whisper-* repoları
  - Not: İlk indirmeden sonra HF önbelleği çevrimdışı kullanılabilir; hedef makineye %USERPROFILE%\.cache\huggingface altından veya --cache-dir ile kopyalanır.
- **pyannote/speaker-diarization** — community-1 (HF gated)
  - Kaynak: HuggingFace — kapalı lisans, HF_TOKEN + koşul kabulü gerekir
  - Not: Çevrimdışı aktarım için model dosyalarını HF önbelleğinden kopyalayın; token olmadan indirilemez.
- **rapidocr** — rapidocr_onnxruntime modelleri
  - Kaynak: pip paketinin içinde gelir (aynalar değişebilir)
  - Not: requirements kapsamındadır; ek indirme gerekmez.
- **whisperx-align** — wav2vec2 dil hizalama modelleri
  - Kaynak: HuggingFace — motor başına ayrı model
  - Not: requirements-whisperx.lock kurulursa ilk hizalamada indirilir.

## Çevrimdışı kurulum akışı

Wheels üretimi: `internetli makinede: pip download -r backend/requirements-core.lock -c backend/constraints-install.lock -d wheels\core (torch için: --index-url https://download.pytorch.org/whl/cu121 -d wheels\torch)`

1. Paketi aç → install.bat yerine wheels\ üzerinden kur: venv oluştur, pip install --no-index --find-links wheels\core -r backend/requirements-core.lock
2. torch: pip install --no-index --find-links wheels\torch torch==2.5.1+cu121 torchaudio==2.5.1+cu121
3. npm: internetli makinede npm ci ile node_modules üretip klasörü kopyala veya npm pack ile taşı.
4. backend/bin/ffmpeg.exe + ffprobe.exe yerleştir.
5. Model önbelleğini kopyala (HF cache veya uygulama model dizini).

Lisans notu: Her bileşen kendi lisansıyla gelir; pyannote kapalı lisanslıdır ve HF hesabıyla koşul kabulü ister. Whisper modelleri MIT (CTranslate2 portu).
