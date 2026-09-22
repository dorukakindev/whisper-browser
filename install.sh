#!/usr/bin/env bash
# install.bat karsiligi — Ubuntu/Linux gelistirme ve test ortami kurulumu.
# Uretim hedefi Windows'tur; bu betik Linux'taki kurulum adimlarini ayni
# kilit dosyalariyla tekrar uretir. WhisperX/diarize profilleri icin
# arguman olarak profil adi verin (or. ./install.sh whisperx).
set -euo pipefail
cd "$(dirname "$0")"

echo
echo "========================================================"
echo "  Whisper Altyazi - Tekrar Uretilebilir Kurulum (Linux)"
echo "========================================================"
echo

if ! command -v node >/dev/null 2>&1; then
    echo "HATA: Node.js bulunamadi. Node.js 22.13 veya daha yenisini yukleyin."
    exit 1
fi

node tools/install-orchestrator.js "${1:-core}"

echo
echo "========================================================"
echo "  Kurulum tamamlandi!"
echo "  Uygulamayi ./start.sh ile baslatin."
echo "  Not: DRM imza onarimi (drm-kur.bat) yalniz Windows'ta."
echo "========================================================"
