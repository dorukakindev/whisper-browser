@echo off
setlocal
cd /d "%~dp0"
set "WHISPER_OPEN_TEXT_STUDIO=1"
call "%~dp0start.bat"
exit /b %errorlevel%
