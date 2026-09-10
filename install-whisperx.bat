@echo off
chcp 65001 >nul
setlocal
cd /d "%~dp0"

echo.
echo ========================================================
echo   WhisperX Eklentisi Kurulumu
echo   wav2vec2 zorunlu hizalama (<100ms kelime zaman damgalari)
echo ========================================================
echo.

where node >nul 2>nul
if errorlevel 1 (
    echo HATA: Node.js bulunamadi. Once install.bat'i calistirin.
    pause
    exit /b 1
)

node "%~dp0tools\install-orchestrator.js" whisperx
if errorlevel 1 (
    echo Kurulum basarisiz. Hata giderildikten sonra yeniden deneyin.
    pause
    exit /b 1
)

echo.
echo WhisperX kuruldu. Ilk kullanimda hizalama modeli ayrica indirilir.
echo.
pause
