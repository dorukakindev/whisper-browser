#!/usr/bin/env bash
# start.bat karsiligi — cuDNN/cuBLAS kutuphane yollarini ekleyip Electron'u acar.
# Yalnizca kurulum sonrasi calistirin; on kosullar icin ./install.sh.
set -euo pipefail
cd "$(dirname "$0")"

# HuggingFace uyari/islem cubugu gurultusunu kapat
export HF_HUB_DISABLE_SYMLINKS_WARNING=1
export HF_HUB_DISABLE_PROGRESS_BARS=1
export TRANSFORMERS_VERBOSITY=error
export TRANSFORMERS_NO_ADVISORY_WARNINGS=1
export PYTHONWARNINGS="ignore::UserWarning"

# cuDNN/cuBLAS ve torch kitapliklari: Linux'ta nvidia-*-cu12 paketleri
# lib/ altina kurulur (Windows'ta bin/). faster-whisper ctranslate2 uzerinden
# bunlari yukler; LD_LIBRARY_PATH onceden ayarli olmali.
SITE_PKGS=$(echo backend/venv/lib/python*/site-packages)
for libdir in "$SITE_PKGS/nvidia/cudnn/lib" "$SITE_PKGS/nvidia/cublas/lib" "$SITE_PKGS/torch/lib"; do
    if [ -d "$libdir" ]; then
        export LD_LIBRARY_PATH="$(cd "$libdir" && pwd)${LD_LIBRARY_PATH:+:$LD_LIBRARY_PATH}"
    fi
done

# Yerel ffmpeg klasoru varsa PATH'e ekle
if [ -d backend/bin ]; then
    export PATH="$(cd backend/bin && pwd):$PATH"
fi

# Not: Castlabs EVS VMP imza onarimi (drm-kur.bat) yalniz Windows'ta calisir.
# Linux'ta DRM'li servisler (Discovery+/Hulu) icin EVS imzasi uygulanmaz.

exec npm start
