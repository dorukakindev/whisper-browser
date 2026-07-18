@echo off
chcp 65001 >nul
cd /d "%~dp0"

echo.
echo ========================================================
echo   Konusmaci Tanima (Diarization) Eklentisi Kurulumu
echo   pyannote.audio + onceki gereksinimler
echo ========================================================
echo.

if not exist "backend\venv\Scripts\activate.bat" (
    echo HATA: Once install.bat'i calistirin.
    pause
    exit /b 1
)

call backend\venv\Scripts\activate.bat
pip install "pyannote.audio>=3.1.0"
if errorlevel 1 (
    echo Kurulum basarisiz.
    pause
    exit /b 1
)

echo.
echo ========================================================
echo   Kurulum tamamlandi!
echo.
echo   ONEMLI: pyannote modelini kullanmak icin:
echo   1. https://hf.co/pyannote/speaker-diarization-3.1 sayfasini acip onay verin.
echo   2. https://hf.co/pyannote/segmentation-3.0 sayfasini acip onay verin (gerekli alt model).
echo   3. https://hf.co/settings/tokens adresinden Token olusturun (Read yetkili)
echo   4. Token'i Whisper Altyazi uygulamasinda Konusmaci ayarlarina yapistirin.
echo ========================================================
echo.
pause
