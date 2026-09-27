@echo off
setlocal
cd /d "%~dp0"
if not exist "backend\venv\Scripts\python.exe" (
  echo Once install.bat ile ana Python ortamini kurun.
  pause
  exit /b 1
)
"backend\venv\Scripts\python.exe" -m pip install -r backend\requirements-catalog.txt
if errorlevel 1 (
  echo HATA: Katalog bagimliliklari kurulamadi.
  pause
  exit /b 1
)
if not exist "backend\separator-venv\Scripts\python.exe" "backend\venv\Scripts\python.exe" -m venv backend\separator-venv
if errorlevel 1 (
  echo HATA: Konusma ayirma icin sanal ortam olusturulamadi.
  pause
  exit /b 1
)
"backend\separator-venv\Scripts\python.exe" -m pip install -r backend\requirements-separator.lock --extra-index-url https://download.pytorch.org/whl/cpu
if errorlevel 1 (
  echo HATA: Konusma ayirma bagimliliklari kurulamadi.
  pause
  exit /b 1
)
"backend\separator-venv\Scripts\python.exe" -c "from audio_separator.separator import Separator; print('Konusma ayirma ortami hazir.')"
exit /b %errorlevel%
