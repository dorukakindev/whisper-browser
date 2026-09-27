@echo off
chcp 65001 >nul
setlocal
cd /d "%~dp0"

set "PYTHON_EXE=%~dp0backend\venv\Scripts\python.exe"
if not exist "%PYTHON_EXE%" (
    echo HATA: Python sanal ortami bulunamadi. Once install.bat dosyasini calistirin.
    pause
    exit /b 1
)

"%PYTHON_EXE%" -m pip install -r "%~dp0backend\requirements-browser-tools.txt"
if errorlevel 1 (
    echo HATA: Browser OCR ve anlamsal arama bagimliliklari kurulamadi.
    pause
    exit /b 1
)

rem Import smoke: onnxruntime tekerlegi VC++ Redistribuable (vcruntime140_1.dll)
rem olmadan import edilemez; OCR ilk kullanimda sessizce devre disi kalirdi.
"%PYTHON_EXE%" -c "import onnxruntime" 2>nul
if errorlevel 1 (
    echo HATA: onnxruntime import edilemedi. Visual C++ Redistribuable (vc_redist.x64)
    echo kurulu degilse once onu kurun: https://aka.ms/vs/17/release/vc_redist.x64.exe
    pause
    exit /b 1
)

echo Browser OCR ve anlamsal arama bagimliliklari kuruldu.
exit /b 0
