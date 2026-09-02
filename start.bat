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

REM npm install, Castlabs paketindeki kullaniciya ait uretim VMP imzasini
REM gelistirme imzasiyla degistirebilir. Korumali siteyi acip belirsiz bir
REM 2312400 hatasi gostermek yerine bunu uygulama baslamadan once bildir.
set "DRM_PY=%~dp0backend\venv\Scripts\python.exe"
set "DRM_PKG=%~dp0node_modules\electron\dist"
if not exist "%DRM_PY%" goto launch_app
if not exist "%DRM_PKG%\electron.exe" goto launch_app

"%DRM_PY%" -m castlabs_evs.vmp verify-pkg "%DRM_PKG%" >nul 2>nul
if not errorlevel 1 goto launch_app

echo.
echo UYARI: Electron uretim DRM imzasi bulunamadi.
echo npm install veya Electron guncellemesi daha onceki EVS imzasini ezmis olabilir.
echo Discovery+, Hulu ve benzeri servisler bu durumda 2312400 hatasi verebilir.
echo.
echo Onarma islemi Electron paketini Castlabs EVS imza hizmetine gonderir.
choice /c EH /n /m "DRM imzasini simdi onarmak icin drm-kur.bat acilsin mi? [E/H]: "
if errorlevel 2 goto launch_app
call "%~dp0drm-kur.bat"
if errorlevel 1 (
    echo.
    echo DRM imzasi onarilamadi; uygulama DRM olmadan acilacak.
)

:launch_app
REM Electron baslat
call npm start

if errorlevel 1 (
    echo.
    echo Uygulama baslamadi. Lutfen once install.bat'i calistirin.
    pause
)
