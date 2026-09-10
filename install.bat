@echo off
chcp 65001 >nul
setlocal
cd /d "%~dp0"

echo.
echo ========================================================
echo   Whisper Altyazi - Tekrar Uretilebilir Kurulum
echo ========================================================
echo.

where node >nul 2>nul
if errorlevel 1 (
    echo HATA: Node.js bulunamadi. Node.js 22.13 veya daha yenisini yukleyin.
    pause
    exit /b 1
)

node "%~dp0tools\install-orchestrator.js" core
if errorlevel 1 (
    echo.
    echo Kurulum tamamlanamadi. Yukaridaki ilk HATA satirini giderip bu dosyayi yeniden calistirin.
    pause
    exit /b 1
)

echo.
echo ========================================================
echo   Kurulum tamamlandi!
echo   Uygulamayi yalniz start.bat ile baslatin.
echo   Opsiyonel: install-whisperx.bat / install-diarize.bat
echo ========================================================
echo.
pause
