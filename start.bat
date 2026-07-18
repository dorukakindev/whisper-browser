@echo off
chcp 65001 >nul
cd /d "%~dp0"

REM HuggingFace sembolik bag uyarisini kapat (Windows'ta gereksiz)
set HF_HUB_DISABLE_SYMLINKS_WARNING=1
set HF_HUB_DISABLE_PROGRESS_BARS=1
set TRANSFORMERS_VERBOSITY=error
set TRANSFORMERS_NO_ADVISORY_WARNINGS=1
set PYTHONWARNINGS=ignore::UserWarning

REM cuDNN ve cuBLAS DLL'lerini PATH'e ekle (faster-whisper icin, PyTorch ile cakismayi onlemek icin oncelikle torch\lib eklenir)
set "VENV_LIB=%~dp0backend\venv\Lib\site-packages"
if exist "%VENV_LIB%\torch\lib" set "PATH=%VENV_LIB%\torch\lib;%PATH%"
if exist "%VENV_LIB%\nvidia\cudnn\bin" set "PATH=%VENV_LIB%\nvidia\cudnn\bin;%PATH%"
if exist "%VENV_LIB%\nvidia\cublas\bin" set "PATH=%VENV_LIB%\nvidia\cublas\bin;%PATH%"

REM Yerel ffmpeg klasoru varsa PATH'e ekle
if exist "%~dp0backend\bin" set "PATH=%~dp0backend\bin;%PATH%"

REM Electron baslat
call npm start

if errorlevel 1 (
    echo.
    echo Uygulama baslamadi. Lutfen once install.bat'i calistirin.
    pause
)
