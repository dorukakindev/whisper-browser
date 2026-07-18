@echo off
chcp 65001 >nul
cd /d "%~dp0"

echo.
echo ========================================================
echo   WhisperX Eklentisi Kurulumu
echo   wav2vec2 zorunlu hizalama (<100ms kelime zaman damgalari)
echo ========================================================
echo.

if not exist "backend\venv\Scripts\activate.bat" (
    echo HATA: Once install.bat'i calistirin.
    pause
    exit /b 1
)

call backend\venv\Scripts\activate.bat
pip install whisperx
if errorlevel 1 (
    echo Kurulum basarisiz.
    pause
    exit /b 1
)

echo.
echo ========================================================
echo   Kurulum tamamlandi!
echo.
echo   - Uygulamada Motor olarak "WhisperX" secin.
echo   - Ilk calistirmada model + dile ozel hizalama modeli indirilir.
echo   - Konusmaci tanima icin ayrica install-diarize.bat gerekir.
echo ========================================================
echo.
pause
