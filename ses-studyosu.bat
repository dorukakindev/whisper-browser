@echo off
setlocal
cd /d "%~dp0"
rem Use the existing VoxCPM2 environment; the UI itself belongs to Whisper Local.
set "VOICE_ENGINE=%USERPROFILE%\Desktop\Ses\VoxCPM2"
if exist "%APPDATA%\whisper-browser\dub-settings.json" (
  for /f "usebackq delims=" %%E in (`powershell -NoProfile -Command "try { $c = Get-Content -LiteralPath (Join-Path $env:APPDATA 'whisper-browser\dub-settings.json') -Raw ^| ConvertFrom-Json; if ($c.engine) { $c.engine } } catch {}"`) do set "VOICE_ENGINE=%%E"
)
if not exist "%VOICE_ENGINE%\.venv\Scripts\python.exe" (
  echo VoxCPM2 Python bulunamadi. Whisper Local ses ayarlarindan motor klasorunu secin.
  pause
  exit /b 1
)
"%VOICE_ENGINE%\.venv\Scripts\python.exe" "%~dp0tools\voxcpm2\text_studio.py" --engine "%VOICE_ENGINE%"
if errorlevel 1 pause
