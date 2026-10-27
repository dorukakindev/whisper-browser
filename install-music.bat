@echo off
setlocal
cd /d "%~dp0"
if not exist "backend\venv\Scripts\python.exe" (
  echo Run install.bat first. / Once install.bat calistirin.
  exit /b 1
)
rem Separate CPU environment: never change Whisper's CUDA/PyTorch packages.
"backend\venv\Scripts\python.exe" -m venv "backend\music-venv"
if errorlevel 1 exit /b 1
"backend\music-venv\Scripts\python.exe" -m pip install --disable-pip-version-check torch==2.6.0 --index-url https://download.pytorch.org/whl/cpu
if errorlevel 1 exit /b 1
"backend\music-venv\Scripts\python.exe" -m pip install --disable-pip-version-check -r "backend\requirements-music.txt"
if errorlevel 1 exit /b 1
"backend\music-venv\Scripts\python.exe" -c "from transformers import ClapAudioModelWithProjection, ClapFeatureExtractor; import torch; print('Music analysis ready:', torch.__version__)"
exit /b %errorlevel%
