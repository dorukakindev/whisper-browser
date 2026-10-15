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
set "SEPARATOR_LOCK=backend\requirements-separator.lock"
set "SEPARATOR_INDEX=https://download.pytorch.org/whl/cpu"
nvidia-smi --query-gpu=name --format=csv,noheader >nul 2>&1
if errorlevel 1 goto separator_cpu
if /I "%~1"=="--cpu" goto separator_cpu
set "SEPARATOR_LOCK=backend\requirements-separator-gpu.lock"
set "SEPARATOR_INDEX=https://download.pytorch.org/whl/cu124"
echo NVIDIA bulundu: ses ayirma CUDA GPU ile kuruluyor.
"backend\separator-venv\Scripts\python.exe" -m pip uninstall -y onnxruntime
goto separator_install
:separator_cpu
echo Ses ayirma CPU ile kuruluyor.
"backend\separator-venv\Scripts\python.exe" -m pip uninstall -y onnxruntime-gpu
:separator_install
"backend\separator-venv\Scripts\python.exe" -m pip install -r "%SEPARATOR_LOCK%" --extra-index-url "%SEPARATOR_INDEX%"
if errorlevel 1 (
  echo HATA: Konusma ayirma bagimliliklari kurulamadi.
  pause
  exit /b 1
)
"backend\separator-venv\Scripts\python.exe" -c "import torch, onnxruntime as ort; from audio_separator.separator import Separator; print('CUDA:', torch.cuda.is_available(), 'ONNX:', ort.get_available_providers()); print('Konusma ayirma ortami hazir.')"
exit /b %errorlevel%
