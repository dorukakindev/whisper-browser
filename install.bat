@echo off
chcp 65001 >nul
setlocal enabledelayedexpansion

cd /d "%~dp0"

echo.
echo ========================================================
echo   Whisper Altyazi - Kurulum
echo   RTX 4070 Ti icin optimize edilmis altyazi cikarici
echo ========================================================
echo.

REM ----- Python kontrol -----
echo [1/5] Python kontrol ediliyor...
where python >nul 2>nul
if errorlevel 1 (
    echo HATA: Python bulunamadi.
    echo Lutfen https://www.python.org/downloads/ adresinden Python 3.10 veya 3.11 yukleyin.
    echo Kurulum sirasinda "Add Python to PATH" secenegini isaretlemeyi unutmayin.
    pause
    exit /b 1
)
python --version
echo.

REM ----- Node.js kontrol -----
echo [2/5] Node.js kontrol ediliyor...
where node >nul 2>nul
if errorlevel 1 (
    echo HATA: Node.js bulunamadi.
    echo Lutfen https://nodejs.org/ adresinden Node.js 22.12+ yukleyin.
    pause
    exit /b 1
)
node --version
node -e "const [a,b]=process.versions.node.split('.').map(Number);process.exit(a>22||(a===22&&b>=12)?0:1)"
if errorlevel 1 (
    echo HATA: Widevine destekli Electron icin Node.js 22.12 veya daha yeni bir surum gerekir.
    echo Lutfen https://nodejs.org/ adresinden guncel LTS surumunu yukleyin.
    pause
    exit /b 1
)
echo.

REM ----- ffmpeg kontrol -----
echo [3/5] ffmpeg kontrol ediliyor...
where ffmpeg >nul 2>nul
if errorlevel 1 (
    echo UYARI: ffmpeg PATH'de bulunamadi.
    echo Lutfen ffmpeg'i indirin: https://www.gyan.dev/ffmpeg/builds/
    echo Indirdikten sonra:
    echo   - ffmpeg.exe ve ffprobe.exe dosyalarini bu klasore koyun: %~dp0backend\bin\
    echo   - VEYA PATH'e ekleyin
    echo Devam etmek icin bir tusa basin...
    pause
) else (
    ffmpeg -version | findstr "ffmpeg version"
)
echo.

REM ----- Python sanal ortam -----
echo [4/5] Python sanal ortam (venv) olusturuluyor...
if not exist "backend\venv" (
    python -m venv backend\venv
    if errorlevel 1 (
        echo HATA: Sanal ortam olusturulamadi.
        pause
        exit /b 1
    )
)
echo.

echo Python paketleri yukleniyor (birkac dakika surebilir)...
call backend\venv\Scripts\activate.bat

python -m pip install --upgrade pip
echo.

REM PyTorch + CUDA 12.1 (RTX 4070 Ti icin)
echo PyTorch CUDA surumu yukleniyor...
pip install torch torchaudio --index-url https://download.pytorch.org/whl/cu121
if errorlevel 1 (
    echo UYARI: CUDA PyTorch yuklenemedi, CPU surumune dusuluyor.
    pip install torch torchaudio
)
echo.

REM Diger gereksinimler (surumler backend\requirements.txt ile uyumlu)
REM nvidia-cudnn-cu12==9.* kritik: ctranslate2 >=4.4 cuDNN 9 gerektirir
echo Diger paketler yukleniyor...
pip install "faster-whisper>=1.1.0" --pre "yt-dlp[default]" "ctranslate2>=4.4.0" nvidia-cublas-cu12 "nvidia-cudnn-cu12==9.*" "openai>=1.40.0"
echo.

REM ----- Node modulleri -----
echo [5/5] Electron yukleniyor...
call npm install
if errorlevel 1 (
    echo HATA: npm install basarisiz oldu.
    pause
    exit /b 1
)

REM Castlabs Electron paketi ikili dosyayi ayri indirir. Bunu kurulumda
REM tamamla; ilk uygulama acilisinda sessiz indirme hatasi yasanmasin.
call npx install-electron --no
if errorlevel 1 (
    echo HATA: Widevine destekli Electron ikilisi indirilemedi.
    echo Internet baglantisini kontrol edip install.bat'i yeniden calistirin.
    pause
    exit /b 1
)

echo.
echo ========================================================
echo   Kurulum tamamlandi!
echo   Uygulamayi baslatmak icin: start.bat
echo.
echo   Opsiyonel: Konusmaci tanima icin install-diarize.bat
echo ========================================================
echo.
pause
