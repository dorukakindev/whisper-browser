@echo off
chcp 65001 >nul
setlocal
cd /d "%~dp0"

echo.
echo ========================================================
echo   Konusmaci Tanima (Diarization) Eklentisi Kurulumu
echo   pyannote.audio + onceki gereksinimler
echo ========================================================
echo.

where node >nul 2>nul
if errorlevel 1 (
    echo HATA: Node.js bulunamadi. Once install.bat'i calistirin.
    pause
    exit /b 1
)

node "%~dp0tools\install-orchestrator.js" diarize
if errorlevel 1 (
    echo Kurulum basarisiz. Hata giderildikten sonra yeniden deneyin.
    pause
    exit /b 1
)

echo.
echo Konusmaci tanima kuruldu. Hugging Face model onaylari ve Read token gereklidir.
echo.
pause
