@echo off
chcp 65001 >nul
setlocal
cd /d "%~dp0"

set "PYTHON_EXE=%~dp0backend\venv\Scripts\python.exe"
if not exist "%PYTHON_EXE%" (
    echo HATA: Python sanal ortami bulunamadi. Once install.bat dosyasini calistirin.
    exit /b 1
)

"%PYTHON_EXE%" -m pip install -r "%~dp0backend\requirements-browser-align.txt"
if errorlevel 1 (
    echo HATA: Browser altyazi senkron bagimliligi kurulamadi.
    exit /b 1
)

echo Browser altyazi senkron bagimliligi kuruldu.
exit /b 0
